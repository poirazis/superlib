<svelte:options runes={false} />

<script>
  import { getContext } from "svelte";
  import SuperColumnRow from "./SuperColumnRow.svelte";
  import SuperColumnRowNew from "./SuperColumnRowNew.svelte";
  const columnSettings = getContext("stColumnOptions");
  const columnState = getContext("stColumnState");
  const stbVisibleRows = getContext("stbVisibleRows");
  const new_row = getContext("new_row");

  export let field;
  export let idField;
  export let isLast;
  export let isFirst;
  export let zebra;
  export let rowHeight;
  export let rows;

  $: inserting = $columnState == "Inserting";
  $: quiet = $columnSettings.quiet;
  $: editing =
    $columnState == "EditingCell" &&
    ($columnSettings.highlighters == "vertical" ||
      $columnSettings.highlighters == "both");
</script>

<div
  class="super-column-body"
  style:margin-top={"var(--super-column-top-offset)"}
  tabindex="-1"
  class:quiet
  class:zebra
  class:inserting
  class:filtered={$columnState == "Filtered"}
  class:is-editing={editing}
  class:is-last={isLast}
>
  {#each $stbVisibleRows as index (index)}
    <SuperColumnRow
      {isLast}
      {index}
      row={rows[index]}
      {field}
      {idField}
      disabled={inserting}
      {rowHeight}
    >
      <slot />
    </SuperColumnRow>
  {/each}
  {#if inserting}
    <SuperColumnRowNew {isFirst} {isLast} row={$new_row} />
  {/if}
</div>
