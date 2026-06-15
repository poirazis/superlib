import { get } from 'svelte/store';
import type { Writable } from 'svelte/store';
import {
	fieldComponentMap,
	getDefaultFieldComponent,
	specialFields
} from './formFieldMap.ts';
import { deriveActiveFields, resolveFieldInnerType } from './deriveActiveFields.ts';

export type FormBrainOptions = {
	schemaStore: { subscribe: Writable<Record<string, unknown>>['subscribe']; set?: (v: Record<string, unknown>) => void };
	beautifyLabels?: boolean;
	useSpecialFields?: boolean;
	labelPosition?: string;
	optionsViewMode?: string;
	relViewMode?: string;
	actionType?: string;
	currentUserEmail?: string;
	ownId?: string | number;
	getReactiveProps?: () => Record<string, unknown>;
};

const RESERVED_FIELD_PROP_KEYS = new Set(['exclude', 'children']);

function sanitizeFieldProps(field: Record<string, unknown>) {
	const sanitized = { ...field };
	for (const key of RESERVED_FIELD_PROP_KEYS) {
		delete sanitized[key];
	}
	return sanitized;
}

export function beautifyLabel(label: string | undefined, enabled = true): string | undefined {
	if (!enabled || !label) return label;

	let fields = label.split('.');
	if (label.startsWith('fk_self_')) {
		fields = ['Parent'];
	}

	fields = fields.map((field) => {
		const words = field.split('_').map((word) => {
			if (!word) return word;
			return word[0]?.toUpperCase() + word.slice(1);
		});
		return words.join(' ');
	});

	return fields.join(' - ');
}

export function createFormBrain(options: FormBrainOptions) {
	const {
		schemaStore,
		beautifyLabels = true,
		useSpecialFields = true,
		labelPosition = 'top',
		optionsViewMode = 'bullets',
		relViewMode = 'text',
		actionType = 'Create',
		currentUserEmail,
		ownId,
		getReactiveProps
	} = options;

	const label = (value?: string) => beautifyLabel(value, beautifyLabels);

	const brain = {
		getComponentForField(field: { field?: string; name?: string }) {
			const schema = get(schemaStore as Writable<Record<string, unknown>>) as Record<string, unknown>;
			const innerType = resolveFieldInnerType(schema as never, field, useSpecialFields);
			if (!innerType) return null;
			return fieldComponentMap[innerType] || getDefaultFieldComponent();
		},
		getPropsForField(field: Record<string, unknown>, _idx?: number | Record<string, unknown>) {
			const reactive = getReactiveProps?.() ?? {};
			const currentLabelPosition = (reactive.labelPosition as string) ?? labelPosition;
			const resolvedLabelPosition =
				currentLabelPosition === 'top' || currentLabelPosition === 'left'
					? 'fieldGroup'
					: currentLabelPosition;
			const currentOptionsViewMode = (reactive.optionsViewMode as string) ?? optionsViewMode;
			const currentRelViewMode = (reactive.relViewMode as string) ?? relViewMode;
			const currentActionType = (reactive.actionType as string) ?? actionType;
			const currentUseSpecialFields =
				(reactive.useSpecialFields as boolean | undefined) ?? useSpecialFields;
			const currentOwnId = (reactive.ownId as string | number | undefined) ?? ownId;
			const currentDisabled = (reactive.disabled as boolean | undefined) ?? false;
			const fieldName = (field.field || field.name) as string;

			return {
				...sanitizeFieldProps(field),
				label: label(field.label as string | undefined),
				labelPosition: resolvedLabelPosition,
				placeholder:
					currentActionType !== 'View' ? label(field.placeholder as string | undefined) : ' ',
				useOptionColors: true,
				optionsViewMode: currentOptionsViewMode,
				relViewMode: currentRelViewMode,
				disabled: currentDisabled,
				readonly: field.readonly,
				autocomplete: field.autocomplete,
				role: 'form',
				showDirty: true,
				direction: field.direction === 'vertical' ? 'column' : 'row',
				invisible: currentUseSpecialFields && field.special,
				ownId: currentOwnId,
				defaultValue:
					currentUseSpecialFields && brain.isSpecial(fieldName)
						? brain.enrichSpecialField(field, currentActionType)
						: field.defaultValue
			};
		},
		isSpecial(fieldName?: string) {
			return !!fieldName && specialFields.includes(fieldName);
		},
		enrichSpecialField(field: Record<string, unknown>, currentActionType = actionType) {
			const fieldName = field.field as string;
			if (currentActionType === 'Create' && fieldName === 'created_by') {
				return currentUserEmail || 'system';
			}
			if (currentActionType === 'Update' && fieldName === 'updated_by') {
				return currentUserEmail || 'system';
			}
			return undefined;
		},
		beautifyLabel: label,
		deriveActiveFields(
			fieldsStore: Array<Record<string, unknown>> | null | undefined,
			expandJsonFields = true
		) {
			const schema = get(schemaStore as Writable<Record<string, unknown>>) as Record<string, unknown>;
			return deriveActiveFields(fieldsStore as never, schema as never, {
				beautifyLabel: label,
				useSpecialFields,
				expandJsonFields,
				currentUserEmail
			});
		},
		registerStep(
			steps: Writable<Array<Record<string, unknown>>>,
			section: Record<string, unknown>
		) {
			steps.update((currentSteps) => {
				const existingIndex = currentSteps.findIndex((s) => s.id == section.id);
				if (existingIndex >= 0) {
					currentSteps[existingIndex] = section;
					return [...currentSteps];
				}
				return [...currentSteps, section];
			});
			const current = get(steps);
			const index = current.findIndex((s) => s.id == section.id);
			return index >= 0 ? index + 1 : current.length;
		},
		unregisterStep(steps: Writable<Array<Record<string, unknown>>>, section: { id: unknown }) {
			steps.update((currentSteps) => currentSteps.filter((s) => s.id != section.id));
		},
		getReactiveProps: getReactiveProps ?? (() => ({}))
	};

	return brain;
}