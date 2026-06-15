<svelte:options runes={false} />

<script>
  import { getContext } from "svelte";

  import Checkbox from "../../UI/elements/Checkbox.svelte";
  import IconButton from "../../UI/elements/IconButton.svelte";

  const stbState = getContext("stbState");
  const stbSettings = getContext("stbSettings");
  const stbHorizontalScrollPos = getContext("stbHorizontalScrollPos");
  const stbHovered = getContext("stbHovered");
  const stbMenuID = getContext("stbMenuID");
  const stbSelected = getContext("stbSelected");
  const stbAPI = getContext("stbAPI");
  const stbVisibleRows = getContext("stbVisibleRows");
  const stbRowMetadata = getContext("stbRowMetadata");
  const data = getContext("data");

  export let sticky;
  export let hideSelectionColumn;

  $: partialSelection =
    $stbSelected.length && $stbSelected.length != $data.length;

  $: fullSelection = $stbSelected.length == $data.length && $data.length > 0;

  $: numbering = $stbSettings.appearance.numberingColumn;
  $: checkBoxes = $stbSettings.features.canSelect && !hideSelectionColumn;
  $: canDelete = $stbSettings.features.canDelete;
  $: sticky = $stbHorizontalScrollPos > 0;
  $: visible = (numbering || checkBoxes || canDelete) && !hideSelectionColumn;
  $: zebra = $stbSettings.appearance.zebraColors;
  $: quiet = $stbSettings.appearance.quiet;
  $: headerCheckbox =
    checkBoxes &&
    $stbSettings.features.maxSelected != 1 &&
    $stbVisibleRows.length > 0;
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<!-- svelte-ignore a11y-click-events-have-key-events -->
{#if visible}
  <div class="super-column control-column" class:sticky>
    {#if $stbSettings?.showHeader}
      <div class="control-column-header" style:gap={"1rem"}>
        {#if numbering}
          <span class="row-number"></span>
        {/if}

        {#if headerCheckbox}
          <Checkbox
            checked={fullSelection}
            partial={partialSelection}
            on:change={stbAPI.selectAllRows}
          />
        {/if}

        {#if canDelete && $stbSelected.length > 1}
          <IconButton
            icon="trash"
            size="small"
            variant="warning"
            disabled={$stbSelected.length == 0}
            tooltip="Delete Selected Rows"
            on:click={stbAPI.deleteSelectedRows}
          />
        {/if}
      </div>
    {/if}

    <div
      class="super-column-body"
      class:zebra
      class:quiet
      class:sticky
      style:margin-top={"var(--super-column-top-offset)"}
      style:border-right={"1px solid var(--super-table-devider-color, --spectrum-global-color-gray-200)"}
    >
      {#each $stbVisibleRows as visibleRow (visibleRow)}
        {@const selected = $stbRowMetadata[visibleRow]?.selected}
        <div
          class="super-row selection"
          class:selected
          class:hovered={$stbHovered == visibleRow || $stbMenuID == visibleRow}
          class:disabled={$stbRowMetadata[visibleRow]?.disabled}
          style:height={$stbRowMetadata[visibleRow]?.height + "px"}
          on:mouseenter={() => ($stbHovered = visibleRow)}
          on:mouseleave={() => ($stbHovered = null)}
        >
          {#if numbering}
            <div class="row-number">
              {visibleRow + 1}
            </div>
          {/if}

          {#if $stbSettings.features.canSelect && !hideSelectionColumn}
            <Checkbox
              checked={selected}
              locked={$stbRowMetadata[visibleRow]?.disabled}
              hovered={$stbHovered == visibleRow}
              on:change={() => stbAPI.selectRow(visibleRow)}
            />
          {/if}

          {#if canDelete}
            <IconButton
              icon="trash"
              size="small"
              variant="warning"
              disabled={$stbRowMetadata[visibleRow]?.disabled}
              tooltip="Delete Row"
              on:click={() => stbAPI.deleteRow(visibleRow)}
            />
          {/if}
        </div>
      {/each}

      {#if $stbState == "Inserting"}
        <div class="add-row" style="padding: unset;"></div>
      {/if}
    </div>

    {#if $stbSettings.showFooter}
      <div class="super-column-footer" style:padding={"unset"}></div>
    {/if}
  </div>
{/if}

<style>
  .selection {
    flex: auto;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
    gap: 0.5rem;
    font-size: 13px;
    font-weight: 500;
    align-items: center;
    justify-content: center;
  }
</style>
