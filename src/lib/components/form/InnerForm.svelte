<script lang="ts">
  import { setContext, getContext, createEventDispatcher, untrack } from "svelte";
  import FormFieldGrid from "./FormFieldGrid.svelte";
  import { buildFormDataContext } from "../../utils/formContext.ts";
  import { cloneDeep, deepGet, deepSet } from "../../utils/objectUtils.ts";
  import { generate as uuid } from "shortid";
  import type { Readable, Writable } from "svelte/store";
  import { derived, get, writable } from "svelte/store";
  import type {
    DataFetchDatasource,
    FieldSchema,
    FieldType,
    Table,
    TableSchema,
    UIFieldValidationRule,
  } from "@budibase/types";

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
    provideContextScope = "global",
    currentStep,
    formValue = $bindable({}),
    labelPosition = "above",
    columns = 1,
    form = $bindable(),
    children,
  }: {
    dataSource?: DataFetchDatasource | undefined;
    disabled?: boolean;
    readonly?: boolean;
    initialValues?: Record<string, any> | undefined;
    size?: "Medium" | "Large" | undefined;
    schema?: TableSchema | undefined;
    definition?: Table | undefined;
    disableSchemaValidation?: boolean;
    editAutoColumns?: boolean;
    provideContext?: boolean;
    provideContextScope?: "local" | "global";
    currentStep: Writable<number>;
    formValue?: Record<string, any>;
    labelPosition?: string | boolean;
    columns?: number;
    form?: {
      formState: typeof formState;
      formApi: typeof formApi;
      dataSource: DataFetchDatasource | undefined;
    };
    children?: import("svelte").Snippet;
  } = $props();

  const {
    Provider,
    ActionTypes,
    createValidatorFromConstraints,
    ContextScopes,
  } = getContext("sdk");

  let fields = $state<Writable<FieldInfo>[]>([]);
  export const formState = writable({
    values: {},
    errors: {},
    valid: true,
    dirty: false,
    currentStep: 1,
  });

  let values = $state<Record<string, any>>({});
  let errors = $state<Record<string, any>>({});
  let enrichments = $state<Record<string, string>>({});
  let dirty = $state(false);
  let currentStepValid = $state(true);
  let currentStepValue = $state(1);

  let valid = $derived(
    !Object.values(errors).some((error) => error != null),
  );

  const recordsEqual = (
    a: Record<string, any>,
    b: Record<string, any>,
  ): boolean => {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) {
      return false;
    }
    return keysA.every((key) => a[key] === b[key]);
  };

  const deriveFieldProperty = (
    fieldStores: Readable<FieldInfo>[],
    getProp: (_field: FieldInfo) => any,
  ) => {
    return derived(fieldStores, (fieldValues) => {
      return fieldValues.reduce(
        (map, field) => ({ ...map, [field.name]: getProp(field) }),
        {},
      );
    });
  };

  const deriveDirtyStatus = (fieldStores: Readable<FieldInfo>[]) => {
    return derived(fieldStores, (fieldValues) => {
      return fieldValues.some((field) => field.fieldState.dirty);
    });
  };

  const fieldValuesEqual = (a: any, b: any): boolean => {
    if (a === b) return true;
    if (a == null && b == null) return true;
    if (typeof a === "object" || typeof b === "object") {
      if (a == null || b == null) return false;
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return String(a) === String(b);
  };

  const hasRegisteredFieldValue = (value: any): boolean => {
    if (value == null || value === "") return false;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  };

  const deriveBindingEnrichments = (fieldStores: Readable<FieldInfo>[]) => {
    return derived(fieldStores, (fieldValues) => {
      const enrichments: Record<string, string> = {};
      fieldValues.forEach((field) => {
        if (field.type === "attachment" || field.type === "attachment_single") {
          const value = field.fieldState.value;
          let url = null;
          if (Array.isArray(value) && value[0] != null) {
            url = value[0].url;
          } else if (value && typeof value === "object" && "url" in value) {
            url = (value as { url?: string }).url ?? null;
          }
          enrichments[`${field.name}_first`] = url;
        }
      });
      return enrichments;
    });
  };

  const deriveFormValue = (
    initialValues: Record<string, any> | undefined,
    values: Record<string, any>,
    enrichments: Record<string, string>,
  ) => {
    let formValue = cloneDeep(initialValues || {});
    const sortedFields = Object.entries(values || {})
      .map(([key, value]) => {
        const field = getField(key);
        return {
          key,
          value,
          lastUpdate: get(field).fieldState?.lastUpdate || 0,
        };
      })
      .sort((a, b) => {
        return a.lastUpdate - b.lastUpdate;
      });

    sortedFields.forEach(({ key, value }) => {
      deepSet(formValue, key, value);
    });
    Object.entries(enrichments || {}).forEach(([key, value]) => {
      deepSet(formValue, key, value);
    });
    return formValue;
  };

  const getField = (name: string) => {
    return fields.find((field) => get(field).name === name)!;
  };

  const sanitiseValue = (
    value: any,
    schema: FieldSchema | undefined,
    type: `${FieldType}`,
  ) => {
    if (Array.isArray(value) && type === "array" && schema) {
      const options = schema?.constraints?.inclusion || [];
      return value
        .map((opt) => String(opt))
        .filter((opt) => options.includes(opt));
    }
    return value;
  };

  const formApi = {
    registerField: (
      field: string,
      type: FieldType,
      defaultValue: string | null = null,
      fieldDisabled: boolean = false,
      fieldReadOnly: boolean = false,
      validationRules: UIFieldValidationRule[],
      step: number = 1,
    ) => {
      if (!field) {
        return;
      }
      const schemaConstraints = disableSchemaValidation
        ? null
        : schema?.[field]?.constraints;
      const validator = createValidatorFromConstraints(
        schemaConstraints,
        validationRules,
        field,
        definition,
      );

      defaultValue = sanitiseValue(defaultValue, schema?.[field], type);

      const loadedValue = deepGet(initialValues, field) ?? defaultValue;
      const existingField = fields.find((info) => get(info).name === field);
      const isAutoColumn = !!schema?.[field]?.autocolumn;

      if (existingField) {
        const { fieldState } = get(existingField);
        const loadedFromRow = deepGet(initialValues, field);
        const shouldSyncValue =
          !fieldState.dirty &&
          loadedFromRow != null &&
          loadedFromRow !== "" &&
          !fieldValuesEqual(fieldState.value, loadedFromRow);

        let nextValue = fieldState.value;
        let nextInitialValue = fieldState.initialValue ?? loadedValue;
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
            disabled ||
            fieldDisabled ||
            (isAutoColumn && !editAutoColumns);
          state.fieldState.readonly =
            readonly ||
            fieldReadOnly ||
            (schema?.[field] as any)?.readonly;
          state.fieldState.validator = validator;
          state.fieldState.defaultValue = defaultValue;
          state.fieldState.value = nextValue;
          state.fieldState.initialValue = nextInitialValue;
          state.fieldState.dirty = !fieldValuesEqual(
            nextValue,
            nextInitialValue,
          );
          state.fieldState.error = nextError;
          state.fieldState.lastUpdate = Date.now();
          state.fieldSchema = schema?.[field] ?? {};
          return state;
        });

        return existingField;
      }

      let fieldValue = loadedValue;
      let initialError = null;
      const fieldId = `id-${uuid()}`;

      const fieldInfo = writable<FieldInfo>({
        name: field,
        type,
        step: step || 1,
        fieldState: {
          fieldId,
          value: fieldValue,
          error: initialError,
          disabled:
            disabled ||
            fieldDisabled ||
            (isAutoColumn && !editAutoColumns),
          readonly:
            readonly || fieldReadOnly || (schema?.[field] as any)?.readonly,
          fieldDisabled,
          fieldReadOnly,
          defaultValue,
          initialValue: loadedValue,
          dirty: !fieldValuesEqual(fieldValue, loadedValue),
          validator,
          lastUpdate: Date.now(),
        },
        fieldApi: makeFieldApi(field),
        fieldSchema: schema?.[field] ?? {},
      });

      fields = [...fields, fieldInfo];

      return fieldInfo;
    },
    validate: () => {
      const stepFields = fields.filter(
        (field) => get(field).step === get(currentStep),
      );

      let valid = true;
      let hasScrolled = false;
      stepFields.forEach((field) => {
        const fieldValid = get(field).fieldApi.validate();
        valid = valid && fieldValid;
        if (!valid && !hasScrolled) {
          handleScrollToField({ field: get(field) });
          hasScrolled = true;
        }
      });
      return valid;
    },
    reset: () => {
      fields.forEach((field) => {
        get(field).fieldApi.reset();
      });
      dispatch("reset");
    },
    changeStep: ({
      type,
      number,
    }: {
      type: "next" | "prev" | "first" | "specific";
      number: any;
    }) => {
      if (type === "next") {
        currentStep.update((step) => step + 1);
      } else if (type === "prev") {
        currentStep.update((step) => Math.max(1, step - 1));
      } else if (type === "first") {
        currentStep.set(1);
      } else if (type === "specific" && number && !isNaN(number)) {
        currentStep.set(parseInt(number));
      }
    },
    setStep: (step: number) => {
      if (step) {
        currentStep.set(step);
      }
    },
    setFieldValue: (fieldName: string, value: any) => {
      const field = getField(fieldName);
      if (!field) {
        return;
      }
      const { fieldApi } = get(field);
      fieldApi.setValue(value);
    },
    resetField: (fieldName: string) => {
      const field = getField(fieldName);
      if (!field) {
        return;
      }
      const { fieldApi } = get(field);
      fieldApi.reset();
    },
    acceptChanges: () => {
      fields.forEach((fieldStore) => {
        fieldStore.update((state) => {
          state.fieldState.initialValue = state.fieldState.value;
          state.fieldState.dirty = false;
          return state;
        });
      });
    },
  };

  const makeFieldApi = (field: string) => {
    const setValue = (value: any, skipCheck = false) => {
      const fieldInfo = getField(field);
      const { fieldState } = get(fieldInfo);
      const { validator } = fieldState;

      if (!skipCheck && fieldState.value === value) {
        return false;
      }

      const error = validator?.(value);
      fieldInfo.update((state) => {
        state.fieldState.value = value;
        state.fieldState.error = error;
        state.fieldState.dirty = !fieldValuesEqual(
          value,
          state.fieldState.initialValue,
        );
        state.fieldState.lastUpdate = Date.now();
        return state;
      });
      dispatch("change", { field, value });
      return true;
    };

    const reset = () => {
      const fieldInfo = getField(field);
      const { fieldState } = get(fieldInfo);
      const newValue = fieldState.initialValue;

      fieldInfo.update((state) => {
        state.fieldState.value = newValue;
        state.fieldState.error = null;
        state.fieldState.dirty = false;
        state.fieldState.lastUpdate = Date.now();
        return state;
      });
    };

    const deregister = () => {
      const fieldInfo = getField(field);
      fieldInfo.update((state) => {
        state.fieldState.validator = null;
        state.fieldState.error = null;
        return state;
      });
    };

    const setDisabled = (fieldDisabled: boolean) => {
      const fieldInfo = getField(field);
      fieldInfo.update((state) => {
        state.fieldState.fieldDisabled = fieldDisabled;
        const isAutoColumn = !!schema?.[state.name]?.autocolumn;
        state.fieldState.disabled =
          disabled || fieldDisabled || (isAutoColumn && !editAutoColumns);
        return state;
      });
    };

    const setReadOnly = (fieldReadOnly: boolean) => {
      const fieldInfo = getField(field);
      fieldInfo.update((state) => {
        state.fieldState.fieldReadOnly = fieldReadOnly;
        state.fieldState.readonly =
          readonly || fieldReadOnly || (schema?.[state.name] as any)?.readonly;
        return state;
      });
    };

    return {
      setValue,
      reset,
      setDisabled,
      setReadOnly,
      deregister,
      validate: () => {
        const fieldInfo = getField(field);
        setValue(get(fieldInfo).fieldState.value, true);
        return !get(fieldInfo).fieldState.error;
      },
    };
  };

  setContext("form", {
    formState,
    formApi,
    get dataSource() {
      return dataSource;
    },
  });

  setContext("form-step", writable(1));

  $effect(() => {
    return currentStep.subscribe((step) => {
      if (currentStepValue !== step) {
        currentStepValue = step;
      }
    });
  });

  $effect(() => {
    const fieldsList = fields;
    const store = deriveFieldProperty(
      fieldsList,
      (f) => f.fieldState.value,
    );
    return store.subscribe((nextValues) => {
      untrack(() => {
        if (!recordsEqual(values, nextValues)) {
          values = nextValues;
        }
      });
    });
  });

  $effect(() => {
    const fieldsList = fields;
    const store = deriveFieldProperty(fieldsList, (f) => f.fieldState.error);
    return store.subscribe((nextErrors) => {
      untrack(() => {
        if (!recordsEqual(errors, nextErrors)) {
          errors = nextErrors;
        }
      });
    });
  });

  $effect(() => {
    const fieldsList = fields;
    const store = deriveBindingEnrichments(fieldsList);
    return store.subscribe((nextEnrichments) => {
      untrack(() => {
        if (!recordsEqual(enrichments, nextEnrichments)) {
          enrichments = nextEnrichments;
        }
      });
    });
  });

  $effect(() => {
    const fieldsList = fields;
    const store = deriveDirtyStatus(fieldsList);
    return store.subscribe((nextDirty) => {
      untrack(() => {
        if (dirty !== nextDirty) {
          dirty = nextDirty;
        }
      });
    });
  });

  $effect(() => {
    const fieldsList = fields;
    const store = derived(
      [currentStep, ...fieldsList],
      ([currentStepValue, ...fieldsValue]) => {
        return !fieldsValue
          .filter((f) => f.step === currentStepValue)
          .some((f) => f.fieldState.error != null);
      },
    );
    return store.subscribe((nextValid) => {
      untrack(() => {
        if (currentStepValid !== nextValid) {
          currentStepValid = nextValid;
        }
      });
    });
  });

  $effect(() => {
    values;
    errors;
    valid;
    dirty;
    currentStepValue;
    untrack(() => {
      formState.set({
        values,
        errors,
        valid,
        dirty,
        currentStep: currentStepValue,
        currentStepValid,
      });
    });
  });

  $effect(() => {
    const nextFormValue = deriveFormValue(initialValues, values, enrichments);
    if (JSON.stringify(formValue) !== JSON.stringify(nextFormValue)) {
      formValue = nextFormValue;
    }
  });

  $effect(() => {
    dataSource;
    untrack(() => {
      form = {
        formState,
        formApi,
        dataSource,
      };
    });
  });

  let dataContext = $derived(
    buildFormDataContext(formValue, {
      valid,
      dirty,
      currentStep: currentStepValue,
      currentStepValid,
      editing: !readonly && !disabled,
    }),
  );

  let scope = $derived(
    provideContextScope === "local"
      ? ContextScopes.Local
      : ContextScopes.Global,
  );

  $effect(() => {
    labelPosition;
    untrack(() => setContext("field-group", labelPosition));
  });

  const normalizedColumns = $derived(Math.max(1, Number(columns) || 1));
  const fieldGroupColumnsStore = writable(
    untrack(() => Math.max(1, Number(columns) || 1)),
  );
  setContext("field-group-columns", fieldGroupColumnsStore);

  $effect(() => {
    fieldGroupColumnsStore.set(normalizedColumns);
  });

  $effect(() => {
    disabled;
    readonly;
    untrack(() => updateFieldStates(disabled, readonly));
  });

  $effect(() => {
    const rowValues = initialValues;
    if (!rowValues) return;

    untrack(() => {
      fields.forEach((fieldStore) => {
        fieldStore.update((state) => {
          const loaded = deepGet(rowValues, state.name);
          if (
            state.fieldState.dirty ||
            loaded == null ||
            loaded === "" ||
            fieldValuesEqual(state.fieldState.value, loaded)
          ) {
            return state;
          }

          state.fieldState.value = loaded;
          state.fieldState.initialValue = loaded;
          state.fieldState.dirty = false;
          state.fieldState.lastUpdate = Date.now();
          return state;
        });
      });
    });
  });

  const handleUpdateFieldValue = ({
    type,
    field,
    value,
  }: {
    type: "set" | "reset";
    field: string;
    value: any;
  }) => {
    if (type === "set") {
      if (field === "_value") {
        let parsedValue = value;
        if (typeof value === "string") {
          try {
            parsedValue = JSON.parse(value);
          } catch {
            // Invalid JSON, skip
            return;
          }
        }
        if (typeof parsedValue === "object" && parsedValue !== null) {
          // Special case: update multiple fields from the value object
          Object.keys(parsedValue).forEach((key) => {
            const fieldStore = fields.find(
              (field) => get(field).name.toLowerCase() === key.toLowerCase(),
            );
            if (fieldStore) {
              const actualFieldName = get(fieldStore).name;
              formApi.setFieldValue(actualFieldName, parsedValue[key]);
            }
          });

          formApi.validate();
        }
        // If not an object, do nothing
      } else {
        formApi.setFieldValue(field, value);
      }
    } else {
      formApi.resetField(field);
    }
  };

  const handleScrollToField = (props: { field: FieldInfo | string }) => {
    let field;
    if (typeof props.field === "string") {
      field = get(getField(props.field));
    } else {
      field = props.field;
    }
    const fieldId = field.fieldState.fieldId;
    const fieldElement = document.getElementById(fieldId);
    if (fieldElement) {
      fieldElement.focus({ preventScroll: true });
    }
    const label = document.querySelector<HTMLElement>(
      `label[for="${fieldId}"]`,
    );
    if (label) {
      label.style.scrollMargin = "100px";
      label.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  const actions = [
    { type: ActionTypes.ValidateForm, callback: formApi.validate },
    { type: ActionTypes.ClearForm, callback: formApi.reset },
    { type: ActionTypes.ChangeFormStep, callback: formApi.changeStep },
    { type: ActionTypes.UpdateFieldValue, callback: handleUpdateFieldValue },
    { type: ActionTypes.ScrollTo, callback: handleScrollToField },
  ];

  // Update field disabled/readonly states when props change
  const updateFieldStates = (formDisabled: boolean, formReadonly: boolean) => {
    if (fields.length > 0) {
      fields.forEach((field) => {
        field.update((state) => {
          const isAutoColumn = !!schema?.[state.name]?.autocolumn;
          state.fieldState.disabled =
            formDisabled ||
            state.fieldState.fieldDisabled ||
            (isAutoColumn && !editAutoColumns);
          state.fieldState.readonly =
            formReadonly ||
            state.fieldState.fieldReadOnly ||
            (schema?.[state.name] as any)?.readonly;
          return state;
        });
      });
    }
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