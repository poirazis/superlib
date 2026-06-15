<svelte:options runes={false} />

<script>
  import { getContext } from "svelte";
  import SuperPopover from "../../SuperPopover/SuperPopover.svelte";

  const columnOptions = getContext("stColumnOptions");
  const cellOptions = getContext("stHeaderCellOptions");
  const columnState = getContext("stColumnState");
  const { API } = getContext("sdk");

  export let sorted;

  let headerAnchor;
  let showFilteringOptions = false;
  let filterValue;
  let filterOperator = $columnOptions.defaultFilteringOperator;
  let schema;
  let filterColumn;
  let hovered;

  $: isLink = $columnOptions.schema.type == "link";
  $: if (isLink && !schema && $columnOptions.canFilter)
    fetchDefinition($columnOptions.schema.tableId);

  $: if (isLink && schema) {
    filterColumn = "1:" + $columnOptions.name + "." + schema?.primaryDisplay;
  } else {
    filterColumn = $columnOptions.name;
  }

  $: isEntering = $columnState == "Entering";
  $: if ($columnState == "Idle") {
    filterValue = null;
    filterOperator = $columnOptions.defaultFilteringOperator;
  }

  const handleValueChange = (e) => {
    if (e.detail != undefined && e.detail != null && e.detail != "") {
      filterValue = e.detail;
      if ($columnOptions.schema.type == "boolean" && filterValue === false) {
        columnState.filter(buildFilter("notEqual", true));
      } else if (Array.isArray(e.detail) && e.detail.length == 0) {
        columnState.clear();
      } else {
        columnState.filter(buildFilter(filterOperator, filterValue));
      }
    } else {
      showFilteringOptions = false;
      filterValue = null;
      columnState.clear();
    }
  };

  const buildFilter = (operator, value) => {
    let temp;
    if (operator == "oneOf" && !Array.isArray(value)) {
      temp = value.split(",");
    } else if (
      operator != "oneOf" &&
      operator != "containsAny" &&
      Array.isArray(value)
    ) {
      temp = value[0];
      filterValue = temp;
    } else {
      temp = value;
    }

    return {
      field: filterColumn,
      operator: operator,
      value: temp,
      type: isLink ? "string" : $columnOptions.schema.type,
      valueType: "Value",
    };
  };

  const handleOperatorChange = (op) => {
    filterOperator = op;
    if (filterValue || op == "empty" || op == "notEmpty")
      columnState.filter(buildFilter(filterOperator, filterValue ?? ""));

    showFilteringOptions = false;
  };

  const handleBlur = (e) => {
    if (headerAnchor.matches(":focus-within")) return;
    columnState.cancel();
  };

  const fetchDefinition = async (tableId) => {
    if (tableId) {
      schema = await API.fetchTableDefinition(tableId);
    }
  };
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  bind:this={headerAnchor}
  class="super-column-header"
  class:isEntering
  class:filtered={$columnState == "Filtered"}
  class:idle={$columnState != "Entering" && $columnState != "Filtered"}
  style:padding-left={$cellOptions.padding}
  style:padding-right={$cellOptions.padding}
  on:mouseenter={() => (hovered = true)}
  on:mouseleave={() => (hovered = false)}
>
  {#key $columnState}
    {#if $columnState == "Entering" || $columnState == "Filtered"}
      {#if $columnOptions.canFilter == "advanced"}
        <i
          class="ri-filter-3-line"
          tabindex="0"
          style="align-self: center; font-size: 14px;"
          on:click|preventDefault={() =>
            (showFilteringOptions = !showFilteringOptions)}
        ></i>
      {/if}
      <svelte:component
        this={$columnOptions.headerComponent}
        cellOptions={{
          ...$cellOptions,
          placeholder: filterOperator,
          disabled: filterOperator == "empty" || filterOperator == "notEmpty",
        }}
        value={filterValue}
        fieldSchema={$columnOptions.schema}
        multi={filterOperator == "containsAny" || filterOperator == "oneOf"}
        on:change={handleValueChange}
        on:focusout={handleBlur}
      />
    {:else}
      <div
        class="headerLabel"
        style:justify-content={$columnOptions?.headerAlign}
        on:click={columnState.headerClicked}
      >
        <div class="innerText" class:sortable={$columnOptions.canSort}>
          {$columnOptions.displayName ?? $columnOptions.name}
        </div>
      </div>
    {/if}

    {#if $columnOptions.canSort && $columnState == "Idle"}
      <span class="placeholder" on:click={columnState.sort}>
        {#if hovered || sorted}
          <i
            class={sorted == "ascending" ? "ri-sort-asc" : "ri-sort-desc"}
            class:sorted
          ></i>
        {/if}
      </span>
    {/if}
  {/key}
</div>

{#if $columnOptions.canFilter == "advanced" && $columnState != "Idle"}
  <SuperPopover
    anchor={headerAnchor}
    open={showFilteringOptions}
    align={"left"}
    minWidth={160}
    on:close={() => {
      showFilteringOptions = false;
      handleBlur();
    }}
  >
    <ul
      class="spectrum-Menu"
      role="menu"
      style="background-color: var(--spectrum-global-color-gray-75 );"
    >
      {#each $columnOptions.filteringOperators as option}
        <li
          class="spectrum-Menu-item"
          class:selected={option.value == filterOperator}
          role="menuitem"
          on:mousedown|preventDefault={() => handleOperatorChange(option.value)}
        >
          <span class="spectrum-Menu-itemLabel">{option.label}</span>
        </li>
      {/each}
    </ul>
  </SuperPopover>
{/if}

<style>
  i {
    &:hover {
      cursor: pointer;
    }
  }
  .isEntering {
    gap: 0.5rem;
  }

  .placeholder {
    min-width: 1rem;
    height: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--spectrum-global-color-gray-500);
    &:hover {
      color: var(--spectrum-global-color-gray-800);
      cursor: pointer;
    }
  }

  .sorted {
    color: var(--spectrum-global-color-gray-800);
  }
  .filtered {
    gap: 0.5rem;
    color: var(--spectrum-global-color-gray-800);
    font-weight: 600;
    background-color: var(--spectrum-global-color-gray-100);
  }

  .sortable {
    cursor: pointer;
  }
  .sortable:hover {
    filter: brightness(120%);
  }
  .selected {
    color: var(--primaryColor);
    background-color: var(--spectrum-global-color-gray-75);
  }
</style>
