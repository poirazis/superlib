<svelte:options runes={false} />

<script lang="ts">
  import { getContext } from "svelte";
  import InnerForm from "./InnerForm.svelte";
  import { writable } from "svelte/store";
  import type {
    DataFetchDatasource,
    Table,
    TableSchema,
  } from "@budibase/types";

  // Local utility function
  const hashString = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  };

  export let dataSource: DataFetchDatasource;
  export let size: "Medium" | "Large";
  export let disabled: boolean = false;
  export let readonly: boolean = false;
  export let actionType: "Create" = "Create";
  export let initialFormStep: string | number = 1;
  export let disableSchemaValidation: boolean = false;
  export let editAutoColumns: boolean = false;
  export let provideContext: boolean = true;
  export let provideContextScope: "local" | "global" = "global";
  export let labelPosition: "above" | "left" | false;
  export let rowGap: string = "0.5rem";
  export let columnGap: string = "0.5rem";

  // Export the full form API to be used by parents
  export let form;
  export let formState;
  export let formValue: Record<string, any> = {};
  export let row;
  export let columns: number = 1;

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

  let definition: Table | undefined;
  let schema: TableSchema | undefined;
  let loaded = false;
  let currentStep =
    getContext("current-step") || writable(getInitialFormStep());

  $: fetchSchema(dataSource);
  $: schemaKey = generateSchemaKey(schema);
  $: initialValues = getInitialValues(
    actionType,
    dataSource,
    $component.path,
    $context,
    row,
  );
  $: resetKey = hashString(
    schemaKey + JSON.stringify(initialValues) + actionType,
  );

  const getInitialValues = (
    type: string,
    dataSource: DataFetchDatasource,
    path: string[],
    context: Record<string, any>,
  ) => {
    if (type !== "Update" && type !== "View") {
      return {};
    }

    const dsType = dataSource?.type;
    if (dsType !== "table" && dsType !== "viewV2") {
      return {};
    }

    if (row && dsType === "table" && row?.tableId === dataSource.tableId) {
      return row;
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

  const fetchSchema = async (dataSource: DataFetchDatasource) => {
    try {
      definition = await fetchDatasourceDefinition(dataSource);
    } catch (error) {
      definition = undefined;
    }
    const res = await fetchDatasourceSchema(dataSource);
    schema = res || {};
    if (!loaded) {
      loaded = true;
    }
  };

  const generateSchemaKey = (schema: TableSchema | undefined) => {
    if (!schema) {
      return null;
    }
    const fields = Object.keys(schema);
    fields.sort();
    return fields.map((field) => `${field}:${schema[field].type}`).join("-");
  };
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
      {rowGap}
      {columnGap}
      on:change
      on:reset
    >
      <slot />
    </InnerForm>
  {/key}
{/if}
