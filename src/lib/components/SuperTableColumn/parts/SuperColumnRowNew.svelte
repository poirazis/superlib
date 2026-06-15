<svelte:options runes={false} />

<script>
  import { getContext } from "svelte";
  import StringCell from "../../cells/StringCell.svelte";
  const columnSettings = getContext("stColumnOptions");
  const rowCellOptions = getContext("stRowCellOptions");
  const stbState = getContext("stbState");
  const stbSettings = getContext("stbSettings");

  export let row = {};
  export let isFirst;
  export let isLast;
  export let color;

  $: cellComponent = $columnSettings.cellComponent ?? StringCell;

  // Reactive: Use errors from the row prop
  $: fieldError = row.errors && row.errors[$columnSettings.name];
</script>

<div
  class="super-row new-row"
  style:min-height={"2rem"}
  style:color
  class:isLast
>
  <svelte:component
    this={cellComponent}
    cellOptions={{
      ...$rowCellOptions,
      readonly: false,
      error: fieldError,
      showDirty: false,
    }}
    autofocus={isFirst}
    fieldSchema={$columnSettings.schema}
    value={row[$columnSettings.name]}
    multi={$columnSettings.schema.type == "array"}
    on:change={(e) => {
      stbState.setValue($columnSettings.name, e.detail);
    }}
  />
  <!-- Add error display similar to plain row's info block -->
  {#if fieldError}
    <div class="info" class:bottom={true}>{fieldError}</div>
  {/if}
</div>

<style>
  .info {
    position: absolute;
    top: -26px;
    font-size: 11px;
    background-color: var(--spectrum-global-color-red-400);
    border-radius: 4px;
    padding: 4px;

    &.bottom {
      top: unset;
      bottom: -26px;
    }
  }
</style>
