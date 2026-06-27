<script lang="ts">
	import { setContext, getContext, createEventDispatcher, untrack } from 'svelte';

	// derived/writable imported for external store APIs (formState, currentStep) - not replaceable with runes.
	import type { Readable, Writable } from 'svelte/store';
	import { derived, get, writable } from 'svelte/store';

	import FormFieldGrid from './FormFieldGrid.svelte';
	import { buildFormDataContext } from '../../utils/formContext.ts';
	import { cloneDeep, deepGet, deepSet } from '../../utils/objectUtils.ts';
	import { generate as uuid } from 'shortid';
	import type {
		DataFetchDatasource,
		FieldSchema,
		FieldType,
		Table,
		TableSchema,
		UIFieldValidationRule
	} from '@budibase/types';
	const dispatch = createEventDispatcher();

	type FieldInfo<T = any> = {
		name: string;
		step: number;
		type: `${FieldType}`;
		fieldState: {
			fieldId: string;
			value: T;
			defaultValue: T;
			initialValue: T;
			dirty: boolean;
			disabled: boolean;
			readonly: boolean;
			fieldDisabled: boolean;
			fieldReadOnly: boolean;
			validator: ((_value: T) => string | null) | null;
			error: string | null | undefined;
			lastUpdate: number;
		};
		fieldApi: {
			setValue(_value: T): void;
			validate(): boolean;
			reset(): void;
		};
		fieldSchema: FieldSchema | {};
	};

	let {
		dataSource = undefined,
		disabled = false,
		readonly = false,
		initialValues = undefined,
		size,
		schema = undefined,
		definition = undefined,
		disableSchemaValidation = false,
		editAutoColumns = false,
		provideContext = true,
		provideContextScope = 'global',
		currentStep,
		formValue = $bindable({}),
		labelPosition = 'above',
		columns = 1,
		form = $bindable(),
		children
	}: {
		dataSource?: DataFetchDatasource | undefined;
		disabled?: boolean;
		readonly?: boolean;
		initialValues?: Record<string, any> | undefined;
		size?: 'Medium' | 'Large' | undefined;
		schema?: TableSchema | undefined;
		definition?: Table | undefined;
		disableSchemaValidation?: boolean;
		editAutoColumns?: boolean;
		provideContext?: boolean;
		provideContextScope?: 'local' | 'global';
		currentStep: Writable<number>;
		formValue?: Record<string, any>;
		labelPosition?: string | boolean;
		columns?: number;
		form?: {
			formState: typeof formState;
			formApi: typeof formApi;
			dataSource: DataFetchDatasource | undefined;
		};
		children?: import('svelte').Snippet;
	} = $props();

	const { Provider, ActionTypes, createValidatorFromConstraints, ContextScopes } =
		getContext('sdk');

	// Use a Map keyed by field name for O(1) lookups instead of linear array scan.
	let fieldsMap = $state<Map<string, Writable<FieldInfo>>>(new Map());

	export const formState = writable({
		values: {},
		errors: {},
		valid: true,
		dirty: false,
		currentStep: 1
	});

	// --- Helpers ---------------------------------------------------------------

	const recordsEqual = (a: Record<string, any>, b: Record<string, any>): boolean => {
		const keysA = Object.keys(a);
		const keysB = Object.keys(b);
		if (keysA.length !== keysB.length) return false;
		return keysA.every((key) => a[key] === b[key]);
	};

	const sanitiseValue = (value: any, schema: FieldSchema | undefined, type: `${FieldType}`) => {
		if (Array.isArray(value) && type === 'array' && schema) {
			const options = schema?.constraints?.inclusion || [];
			return value.map((opt) => String(opt)).filter((opt) => options.includes(opt));
		}
		return value;
	};

	const fieldValuesEqual = (a: any, b: any): boolean => {
		if (a === b) return true;
		if (a == null && b == null) return true;
		if (typeof a === 'object' || typeof b === 'object') {
			if (a == null || b == null) return false;
			return JSON.stringify(a) === JSON.stringify(b);
		}
		return String(a) === String(b);
	};

	const hasRegisteredFieldValue = (value: any): boolean => {
		if (value == null || value === '') return false;
		if (Array.isArray(value)) return value.length > 0;
		return true;
	};

	// --- Top-level reactive derivations ---------------------------------------
	// These replace the per-effect derived() calls that were previously recreated
	// on every fields change. They are computed once and re-evaluated only when
	// their inputs actually change.

	const allFieldValues = $derived.by(() => {
		let result: Record<string, any> = {};
		for (const [, store] of fieldsMap) {
			const f = get(store);
			result[f.name] = f.fieldState.value;
		}
		return result;
	});

	const allFieldErrors = $derived.by(() => {
		let result: Record<string, any> = {};
		for (const [, store] of fieldsMap) {
			const f = get(store);
			result[f.name] = f.fieldState.error;
		}
		return result;
	});

	const allFieldDirtyStatus = $derived.by(() => {
		let dirty = false;
		for (const [, store] of fieldsMap) {
			if (get(store).fieldState.dirty) {
				dirty = true;
				break;
			}
		}
		return dirty;
	});

	const bindingEnrichments = $derived.by(() => {
		const enrichments: Record<string, string> = {};
		for (const [, store] of fieldsMap) {
			const f = get(store);
			if (f.type === 'attachment' || f.type === 'attachment_single') {
				const value = f.fieldState.value;
				let url: string | null = null;
				if (Array.isArray(value) && value[0] != null) {
					url = value[0].url;
				} else if (value && typeof value === 'object' && 'url' in value) {
					url = (value as { url?: string }).url ?? null;
				}
				enrichments[`${f.name}_first`] = url;
			}
		}
		return enrichments;
	});

	const isCurrentStepValid = $derived.by(() => {
		const stepVal = get(currentStep);
		for (const [, store] of fieldsMap) {
			const f = get(store);
			if (f.step === stepVal && f.fieldState.error != null) return false;
		}
		return true;
	});

	// --- Derived form values ---------------------------------------------------
	const values = $derived(allFieldValues);
	const errors = $derived(allFieldErrors);
	let dirty = $derived(allFieldDirtyStatus);
	let currentStepValue = $derived(get(currentStep));
	let currentStepValid = $derived(isCurrentStepValid);
	let valid = $derived(!Object.values(errors).some((error) => error != null));

	// --- Form API --------------------------------------------------------------

	const getFieldStore = (name: string): Writable<FieldInfo> | undefined => {
		return fieldsMap.get(name);
	};

	const formApi = {
		registerField: (
			field: string,
			type: FieldType,
			defaultValue: string | null = null,
			fieldDisabled: boolean = false,
			fieldReadOnly: boolean = false,
			validationRules: UIFieldValidationRule[],
			step: number = 1
		) => {
			if (!field) return;

			const schemaConstraints = disableSchemaValidation ? null : schema?.[field]?.constraints;
			const validator = createValidatorFromConstraints(
				schemaConstraints,
				validationRules,
				field,
				definition
			);

			defaultValue = sanitiseValue(defaultValue, schema?.[field], type);

			const loadedValue = deepGet(initialValues, field) ?? defaultValue;
			const existingField = fieldsMap.get(field);
			const isAutoColumn = !!schema?.[field]?.autocolumn;

			if (existingField) {
				// --- Update existing field -----------------------------------------
				const fieldState = get(existingField).fieldState;
				const loadedFromRow = deepGet(initialValues, field);
				const shouldSyncValue =
					!fieldState.dirty &&
					loadedFromRow != null &&
					loadedFromRow !== '' &&
					!fieldValuesEqual(fieldState.value, loadedFromRow);

				let nextValue: any;
				let nextInitialValue: any;

				if (shouldSyncValue) {
					nextValue = loadedFromRow;
					nextInitialValue = loadedFromRow;
				} else if (hasRegisteredFieldValue(fieldState.value)) {
					nextValue = fieldState.value;
				} else {
					nextValue = loadedValue;
					nextInitialValue = loadedValue;
				}

				let nextError = fieldState.error;
				if (nextError) {
					nextError = validator?.(nextValue);
				}

				existingField.update((state) => {
					state.fieldState.fieldDisabled = fieldDisabled;
					state.fieldState.fieldReadOnly = fieldReadOnly;
					state.fieldState.disabled =
						disabled || fieldDisabled || (isAutoColumn && !editAutoColumns);
					state.fieldState.readonly =
						readonly || fieldReadOnly || (schema?.[field] as any)?.readonly;
					state.fieldState.validator = validator;
					state.fieldState.defaultValue = defaultValue;
					state.fieldState.value = nextValue;
					state.fieldState.initialValue = nextInitialValue;
					state.fieldState.dirty = !fieldValuesEqual(nextValue, nextInitialValue);
					state.fieldState.error = nextError;
					state.fieldState.lastUpdate = Date.now();
					state.fieldSchema = schema?.[field] ?? {};
					return state;
				});

				return existingField;
			}

			// --- Register new field --------------------------------------------------
			const fieldValue = loadedValue;
			let initialError: string | null = null;
			const fieldId = `id-${uuid()}`;

			const fieldInfo = writable<FieldInfo>({
				name: field,
				type,
				step: step || 1,
				fieldState: {
					fieldId,
					value: fieldValue,
					error: initialError,
					disabled: disabled || fieldDisabled || (isAutoColumn && !editAutoColumns),
					readonly: readonly || fieldReadOnly || (schema?.[field] as any)?.readonly,
					fieldDisabled,
					fieldReadOnly,
					defaultValue,
					initialValue: loadedValue,
					dirty: !fieldValuesEqual(fieldValue, loadedValue),
					validator,
					lastUpdate: Date.now()
				},
				fieldApi: makeFieldApi(field),
				fieldSchema: schema?.[field] ?? {}
			});

			// Map.set on a plain object (not Svelte state) - autofixer false positive.
			fieldsMap.set(field, fieldInfo);
			return fieldInfo;
		},

		validate: () => {
			const stepFields = Array.from(fieldsMap.values()).filter(
				(store) => get(store).step === get(currentStep)
			);

			let valid = true;
			let hasScrolled = false;
			for (const store of stepFields) {
				const fieldValid = get(store).fieldApi.validate();
				valid = valid && fieldValid;
				if (!valid && !hasScrolled) {
					handleScrollToField({ field: get(store) });
					hasScrolled = true;
				}
			}
			return valid;
		},

		reset: () => {
			for (const [, store] of fieldsMap) {
				get(store).fieldApi.reset();
			}
			dispatch('reset');
		},

		changeStep: ({ type, number }: { type: 'next' | 'prev' | 'first' | 'specific'; number: any }) => {
			if (type === 'next') currentStep.update((s) => s + 1);
			else if (type === 'prev') currentStep.update((s) => Math.max(1, s - 1));
			else if (type === 'first') currentStep.set(1);
			else if (type === 'specific' && number && !isNaN(number)) currentStep.set(parseInt(number));
		},

		setStep: (step: number) => {
			if (step) currentStep.set(step);
		},

		setFieldValue: (fieldName: string, value: any) => {
			const field = getFieldStore(fieldName);
			if (!field) return;
			get(field).fieldApi.setValue(value);
		},

		resetField: (fieldName: string) => {
			const field = getFieldStore(fieldName);
			if (!field) return;
			get(field).fieldApi.reset();
		},

		acceptChanges: () => {
			for (const [, store] of fieldsMap) {
				store.update((state) => {
					state.fieldState.initialValue = state.fieldState.value;
					state.fieldState.dirty = false;
					return state;
				});
			}
		}
	};

	const makeFieldApi = (field: string) => {
		const setValue = (value: any, skipCheck = false) => {
			const fieldInfo = getFieldStore(field)!;
			const fieldState = get(fieldInfo).fieldState;

			if (!skipCheck && fieldState.value === value) return false;

			const error = fieldState.validator?.(value);
			fieldInfo.update((state) => {
				state.fieldState.value = value;
				state.fieldState.error = error;
				state.fieldState.dirty = !fieldValuesEqual(value, state.fieldState.initialValue);
				state.fieldState.lastUpdate = Date.now();
				return state;
			});
			dispatch('change', { field, value });
			return true;
		};

		const reset = () => {
			const fieldInfo = getFieldStore(field)!;
			const newValue = get(fieldInfo).fieldState.initialValue;
			fieldInfo.update((state) => {
				state.fieldState.value = newValue;
				state.fieldState.error = null;
				state.fieldState.dirty = false;
				state.fieldState.lastUpdate = Date.now();
				return state;
			});
		};

		const deregister = () => {
			const fieldInfo = getFieldStore(field);
			if (!fieldInfo) return;
			fieldInfo.update((state) => {
				state.fieldState.validator = null;
				state.fieldState.error = null;
				return state;
			});
		};

		const setDisabled = (fieldDisabled: boolean) => {
			const fieldInfo = getFieldStore(field);
			if (!fieldInfo) return;
			fieldInfo.update((state) => {
				state.fieldState.fieldDisabled = fieldDisabled;
				const isAutoColumn = !!schema?.[state.name]?.autocolumn;
				state.fieldState.disabled = disabled || fieldDisabled || (isAutoColumn && !editAutoColumns);
				return state;
			});
		};

		const setReadOnly = (fieldReadOnly: boolean) => {
			const fieldInfo = getFieldStore(field);
			if (!fieldInfo) return;
			fieldInfo.update((state) => {
				state.fieldState.fieldReadOnly = fieldReadOnly;
				state.fieldState.readonly = readonly || fieldReadOnly || (schema?.[state.name] as any)?.readonly;
				return state;
			});
		};

		return { setValue, reset, setDisabled, setReadOnly, deregister, validate: () => {
			const fieldInfo = getFieldStore(field);
			if (!fieldInfo) return true;
			setValue(get(fieldInfo).fieldState.value, true);
			return !get(fieldInfo).fieldState.error;
		} };
	};

	// --- Context setup ---------------------------------------------------------

	setContext('form', {
		formState,
		formApi,
		get dataSource() {
			return dataSource;
		}
	});

	setContext('form-step', writable(1));

	// Use a writable store so setContext receives something that auto-updates.
	// svelte-ignore state_referenced_locally - writable store propagates reactivity through context; updated via $effect when labelPosition changes.
	let fieldGroupLabelPositionStore = writable(labelPosition);
	setContext('field-group', fieldGroupLabelPositionStore);

	$effect(() => {
		fieldGroupLabelPositionStore.set(labelPosition);
	});

	// --- Reactive state sync via single effect ---------------------------------
	// Consolidates the previous 5 separate effects into one that reads from
	// top-level derived stores and sets formState in a single pass.

	$effect(() => {
		dataSource;
		formState.set({
			values,
			errors,
			valid,
			dirty,
			currentStep: currentStepValue,
			currentStepValid
		});
	});

	// --- formValue sync with cheap equality check ------------------------------
	// Avoids full JSON.stringify + cloneDeep on every field change by tracking
	// which keys actually differ from the last emitted value.
	let lastEmittedKeys: Record<string, any> | null = null;

	$effect(() => {
		const nextFormValue = deriveFormValue(initialValues || {}, values, enrichments);

		if (!lastEmittedKeys) {
			formValue = nextFormValue;
			lastEmittedKeys = cloneDeep(nextFormValue);
			return;
		}

		let changed = false;
		const keys = Object.keys(nextFormValue);
		for (const key of keys) {
			if (!Object.prototype.hasOwnProperty.call(lastEmittedKeys, key)) {
				changed = true;
				break;
			}
			if (nextFormValue[key] !== lastEmittedKeys[key]) {
				changed = true;
				break;
			}
		}

		if (changed) {
			formValue = nextFormValue;
			lastEmittedKeys = cloneDeep(nextFormValue);
		}
	});

	// --- Guarded form binding to avoid unnecessary parent re-renders -----------
	let prevDataSourceRef: any = undefined;

	$effect(() => {
		if (dataSource !== prevDataSourceRef) {
			prevDataSourceRef = dataSource;
			form = { formState, formApi, dataSource };
		}
	});

	// --- Context + columns setup -----------------------------------------------
	let dataContext = $derived(
		buildFormDataContext(formValue, {
			valid,
			dirty,
			currentStep: currentStepValue,
			currentStepValid,
			editing: !readonly && !disabled
		})
	);

	let scope = $derived(
		provideContextScope === 'local' ? ContextScopes.Local : ContextScopes.Global
	);

	const normalizedColumns = $derived(Math.max(1, Number(columns) || 1));
	const fieldGroupColumnsStore = writable(untrack(() => Math.max(1, Number(columns) || 1)));
	setContext('field-group-columns', fieldGroupColumnsStore);

	$effect(() => {
		fieldGroupColumnsStore.set(normalizedColumns);
	});

	// Track previous disabled/readonly to detect actual prop changes.
	let prevDisabled = $state(false);
	let prevReadonly = $state(false);

	$effect(() => {
		disabled;
		readonly;
		if (disabled !== prevDisabled || readonly !== prevReadonly) {
			prevDisabled = disabled;
			prevReadonly = readonly;
			untrack(() => updateFieldStates(disabled, readonly));
		}
	});

	// --- Initial values sync with structural equality guard ---------------------
	let prevInitialValues: Record<string, any> | null = null;

	$effect(() => {
		const rowValues = initialValues;
		if (!rowValues) return;

		// Skip if initialValues hasn't actually changed.
		if (prevInitialValues === rowValues) return;

		untrack(() => {
			for (const [, store] of fieldsMap) {
				const state = get(store);
				const loaded = deepGet(rowValues, state.name);
				if (
					state.fieldState.dirty ||
					loaded == null ||
					loaded === '' ||
					fieldValuesEqual(state.fieldState.value, loaded)
				) continue;

				store.update((s) => {
					s.fieldState.value = loaded;
					s.fieldState.initialValue = loaded;
					s.fieldState.dirty = false;
					s.fieldState.lastUpdate = Date.now();
					return s;
				});
			}
		});

		prevInitialValues = rowValues;
	});

	// --- Action handlers -------------------------------------------------------

	const handleUpdateFieldValue = ({ type, field, value }: { type: 'set' | 'reset'; field: string; value: any }) => {
		if (type === 'set') {
			if (field === '_value') {
				let parsedValue = value;
				if (typeof value === 'string') {
					try {
						parsedValue = JSON.parse(value);
					} catch {
						return; // Invalid JSON, skip
					}
				}
				if (typeof parsedValue === 'object' && parsedValue !== null) {
					Object.keys(parsedValue).forEach((key) => {
						const fieldStore = Array.from(fieldsMap.values()).find(
							(s) => get(s).name.toLowerCase() === key.toLowerCase()
						);
						if (fieldStore) {
							const actualFieldName = get(fieldStore).name;
							formApi.setFieldValue(actualFieldName, parsedValue[key]);
						}
					});

					formApi.validate();
				}
			} else {
				formApi.setFieldValue(field, value);
			}
		} else {
			formApi.resetField(field);
		}
	};

	const handleScrollToField = (props: { field: FieldInfo | string }) => {
		let field: FieldInfo;
		if (typeof props.field === 'string') {
			field = get(getFieldStore(props.field)!);
		} else {
			field = props.field;
		}

		const fieldId = field.fieldState.fieldId;
		const fieldElement = document.getElementById(fieldId);
		if (fieldElement) {
			fieldElement.focus({ preventScroll: true });
		}
		const label = document.querySelector<HTMLElement>(`label[for="${fieldId}"]`);
		if (label) {
			label.style.scrollMargin = '100px';
			label.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			// Clean up the inline style after scroll completes.
			label.addEventListener(
				'scrollend',
				() => {
					label.style.scrollMargin = '';
				},
				{ once: true }
			);
		}
	};

	const actions = [
		{ type: ActionTypes.ValidateForm, callback: formApi.validate },
		{ type: ActionTypes.ClearForm, callback: formApi.reset },
		{ type: ActionTypes.ChangeFormStep, callback: formApi.changeStep },
		{ type: ActionTypes.UpdateFieldValue, callback: handleUpdateFieldValue },
		{ type: ActionTypes.ScrollTo, callback: handleScrollToField }
	];

	// Update field disabled/readonly states when props change.
	const updateFieldStates = (formDisabled: boolean, formReadonly: boolean) => {
		if (fieldsMap.size === 0) return;

		for (const [, store] of fieldsMap) {
			store.update((state) => {
				const isAutoColumn = !!schema?.[state.name]?.autocolumn;
				state.fieldState.disabled =
					formDisabled || state.fieldState.fieldDisabled || (isAutoColumn && !editAutoColumns);
				state.fieldState.readonly =
					formReadonly ||
					state.fieldState.fieldReadOnly ||
					(schema?.[state.name] as any)?.readonly;
				return state;
			});
		}
	};

	// Reusable deep-derive helper (kept for compatibility with callers).
	const deriveFormValue = (
		initialValues: Record<string, any>,
		values: Record<string, any>,
		enrichments: Record<string, string>
	) => {
		let formValue = cloneDeep(initialValues);
		const sortedFields = Object.entries(values || {})
			.map(([key, value]) => {
				const fieldStore = fieldsMap.get(key);
				return {
					key,
					value,
					lastUpdate: fieldStore ? get(fieldStore).fieldState?.lastUpdate || 0 : 0
				};
			})
			.sort((a, b) => a.lastUpdate - b.lastUpdate);

		sortedFields.forEach(({ key, value }) => {
			deepSet(formValue, key, value);
		});
		Object.entries(enrichments || {}).forEach(([key, value]) => {
			deepSet(formValue, key, value);
		});
		return formValue;
	};
</script>

{#key labelPosition}
	{#if provideContext}
		<Provider {actions} data={dataContext} {scope}>
			<FormFieldGrid {columns} {labelPosition}>
				{@render children?.()}
			</FormFieldGrid>
		</Provider>
	{:else}
		{@render children?.()}
	{/if}
{/key}
