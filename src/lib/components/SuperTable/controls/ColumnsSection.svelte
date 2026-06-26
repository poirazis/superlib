<script>
  import SuperTableColumn from "../../SuperTableColumn/SuperTableColumn.svelte";

  let {
    superColumns,
    stbSettings,
    columnsViewport = $bindable(),
    showButtonColumnRight = false,
    canScroll,
    children,
  } = $props();
</script>

<div bind:this={columnsViewport} class="st-master-columns" tabIndex="-1">
  {#if stbSettings.superColumnsPos == "first"}
    {@render children?.()}
  {/if}

  {#each superColumns as column, idx (`${column.name}-${column.canEdit ? 'edit' : 'view'}`)}
    <SuperTableColumn
      columnOptions={{
        ...column,
        isFirst: idx == 0,
        isFirstInsertable:
          idx ==
          superColumns.findIndex((c) => c.canEdit && c.canInsert),
        isLast:
          idx == superColumns.length - 1 && !showButtonColumnRight && canScroll,
      }}
    />
  {/each}

  {#if stbSettings.superColumnsPos == "last"}
    {@render children?.()}
  {/if}
</div>