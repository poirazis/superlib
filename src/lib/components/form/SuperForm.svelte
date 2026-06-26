<script lang="ts">
  import { getContext, untrack } from "svelte";
  import InnerForm from "./InnerForm.svelte";
  import { writable } from "svelte/store";
  import type {
    DataFetchDatasource,
    Table,
    TableSchema,
  } from "@budibase/types";

  const hashString = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  };

  let {
    children,
    dataSource,
    size,
    disabled = false,
    readonly = false,
    actionType = "Create",
    initialFormStep = 1,
    disableSchemaValidation = false,
    editAutoColumns = false,
    provideContext = true,
    provideContextScope = "global",
    labelPosition,
    form = $bindable(),
    formState = $bindable(),
    formValue = $bindable({}),
    row,
    columns = 1,
  } = $props();

  const context = getContext("context");
  const component = getContext("component");
  const { fetchDatasourceSchema, fetchDatasourceDefinition } =
    getContext("sdk");

  const getInitialFormStep = () => {
    const parsedFormStep = parseInt(initialFormStep.toString());
    if (isNaN(parsedFormStep)) {
      return 1;
    }
    return parsedFormStep;
  };

  let definition = $state<Table | undefined>();
  let schema = $state<TableSchema | undefined>();
  let loaded = $state(false);
  let currentStep =
    getContext("current-step") || writable(getInitialFormStep());

  const getInitialValues = (
    type: string,
    dataSource: DataFetchDatasource,
    path: string[],
    context: Record<string, any>,
    rowValue: typeof row,
  ) => {
    if (type !== "Update" && type !== "View") {
      return {};
    }

    const dsType = dataSource?.type;
    if (dsType !== "table" && dsType !== "viewV2") {
      return {};
    }

    if (rowValue && dsType === "table" && rowValue?.tableId === dataSource.tableId) {
      return rowValue;
    }
    for (let id of path.toReversed().slice(1)) {
      if (
        dataSource.type === "viewV2" &&
        context[id]?._viewId === dataSource.id
      ) {
        return context[id];
      }
      if (
        dataSource.type === "table" &&
        context[id]?.tableId === dataSource.tableId
      ) {
        return context[id];
      }
    }
    return {};
  };

  const generateSchemaKey = (schemaValue: TableSchema | undefined) => {
    if (!schemaValue) {
      return null;
    }
    const fields = Object.keys(schemaValue);
    fields.sort();
    return fields
      .map((field) => `${field}:${schemaValue[field].type}`)
      .join("-");
  };

  $effect(() => {
    dataSource;
    untrack(async () => {
      try {
        definition = await fetchDatasourceDefinition(dataSource);
      } catch {
        definition = undefined;
      }
      const res = await fetchDatasourceSchema(dataSource);
      schema = res || {};
      loaded = true;
    });
  });

  let schemaKey = $derived(generateSchemaKey(schema));
  let initialValues = $derived(
    getInitialValues(
      actionType,
      dataSource,
      $component.path,
      $context,
      row,
    ),
  );
  let resetKey = $derived(
    hashString(schemaKey + JSON.stringify(initialValues) + actionType),
  );
</script>

{#if loaded}
  {#key resetKey}
    <InnerForm
      bind:form
      bind:formState
      bind:formValue
      {dataSource}
      {size}
      {disabled}
      readonly={readonly || actionType == "View"}
      {schema}
      {definition}
      {initialValues}
      {disableSchemaValidation}
      {editAutoColumns}
      {currentStep}
      {columns}
      {provideContext}
      {provideContextScope}
      {labelPosition}
      on:change
      on:reset
    >
      {@render children?.()}
    </InnerForm>
  {/key}
{/if}