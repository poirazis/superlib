<svelte:options runes={false} />

<script>
  import { getContext } from "svelte";
  import SuperPopover from "../../SuperPopover/SuperPopover.svelte";
  import SuperButton from "../../Button.svelte";

  const stbSettings = getContext("stbSettings");
  const stbState = getContext("stbState");
  const stbHorizontalScrollPos = getContext("stbHorizontalScrollPos");
  const stbHovered = getContext("stbHovered");
  const stbEditing = getContext("stbEditing");
  const stbMenuID = getContext("stbMenuID");
  const rowMetadata = getContext("stbRowMetadata");
  const stbVisibleRows = getContext("stbVisibleRows");
  const data = getContext("data");

  const stbAPI = getContext("stbAPI");

  const allContext = getContext("context");

  export let right;
  export let rowMenu;
  export let rowMenuItems;
  export let menuItemsVisible = 0;
  export let canScroll;

  let menuAnchor;
  let openMenu;

  $: quiet = $stbSettings.appearance.quiet;
  $: menuIcon = $stbSettings.rowMenuIcon;
  $: sticky = $stbHorizontalScrollPos > 0 && !right;
  $: inInsert = $stbState == "Inserting";

  $: inlineButtons =
    menuItemsVisible < rowMenuItems?.length
      ? rowMenuItems.slice(0, menuItemsVisible)
      : rowMenuItems;

  $: menuItems =
    menuItemsVisible < rowMenuItems?.length
      ? rowMenuItems.slice(menuItemsVisible, rowMenuItems.length)
      : [];

  const handleMenu = (e, index) => {
    menuAnchor = e.target;
    openMenu = !openMenu;
    $stbMenuID = openMenu ? index : -1;
  };
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<!-- svelte-ignore a11y-click-events-have-key-events -->
<div class="super-column" class:right class:sticky style:flex="none">
  {#if $stbSettings.showHeader}
    <div class="super-column-header"><span> </span></div>
  {/if}

  <div
    class="super-column-body"
    style:margin-top={"var(--super-column-top-offset)"}
    style:border-right={right
      ? null
      : "1px solid var(--super-table-devider-color, --spectrum-global-color-gray-200)"}
    style:border-left={right
      ? "1px solid var(--super-table-devider-color, --spectrum-global-color-gray-200)"
      : null}
    class:quiet
    class:sticky
    class:zebra={$stbSettings.appearance.zebraColors}
  >
    {#each $stbVisibleRows as visibleRow}
      <div
        class="super-row"
        on:mouseenter={() => ($stbHovered = visibleRow)}
        on:mouseleave={() => ($stbHovered = null)}
        class:selected={$rowMetadata[visibleRow].selected}
        class:hovered={$stbHovered == visibleRow || $stbMenuID == visibleRow}
        class:is-editing={$stbEditing == visibleRow}
        class:disabled={$rowMetadata[visibleRow].disabled}
        style:height={$rowMetadata[visibleRow].height + "px"}
        style:padding-right={canScroll && right ? "1.5rem" : "0.5rem"}
      >
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div
          class="row-buttons"
          style:gap={inlineButtons.length > 1 ? "0.25rem" : "0rem"}
        >
          {#if rowMenu && inlineButtons?.length}
            {#each inlineButtons as { conditions, disabledTemplate, onClick, disabled, ...rest }}
              {#if stbAPI.shouldShowButton(conditions || [], stbAPI.enrichContext($data[visibleRow]))}
                <SuperButton
                  {...rest}
                  disabled={disabled ||
                    $stbEditing == visibleRow ||
                    $rowMetadata[visibleRow].disabled ||
                    stbAPI.shouldDisableButton(
                      disabledTemplate,
                      stbAPI.enrichContext($data[visibleRow]),
                      $allContext,
                    )}
                  onClick={() => {
                    stbAPI.executeRowButtonAction(visibleRow, onClick);
                  }}
                />
              {/if}
            {/each}
          {/if}
          {#if rowMenu && menuItems?.length}
            <SuperButton
              size="XS"
              icon={menuIcon}
              text=""
              quiet="true"
              type="secondary"
              onClick={(e) => handleMenu(e, visibleRow)}
            />
          {/if}
        </div>
      </div>
    {/each}
  </div>
  {#if inInsert}
    <div class="add-row" style="padding: unset;"></div>
  {/if}

  {#if $stbSettings.showFooter}
    <div class="super-column-footer"></div>
  {/if}
</div>

{#if openMenu}
  <SuperPopover
    open
    anchor={menuAnchor}
    minWidth={150}
    align={right ? "right" : "left"}
    on:close={() => {
      openMenu = false;
      $stbMenuID = undefined;
    }}
  >
    {#if menuItems?.length}
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="action-menu">
        {#each menuItems as { text, icon, disabled, onClick, size, conditions, disabledTemplate }}
          {#if stbAPI.shouldShowButton(conditions || [], stbAPI.enrichContext($data[$stbMenuID]))}
            <SuperButton
              {size}
              {icon}
              {text}
              disabled={disabled ||
                $stbEditing == $stbMenuID ||
                $rowMetadata[$stbMenuID].disabled ||
                stbAPI.shouldDisableButton(
                  disabledTemplate,
                  stbAPI.enrichContext($data[$stbMenuID]),
                )}
              menuItem
              menuAlign={right ? "right" : "left"}
              onClick={() => {
                stbAPI.executeRowButtonAction($stbMenuID, onClick);
                openMenu = false;
                $stbMenuID = undefined;
              }}
            />
          {/if}
        {/each}
      </div>
    {/if}
  </SuperPopover>
{/if}

<style>
  .row-buttons {
    display: flex;
    flex-direction: row;
    align-items: center;
    padding-left: 0.5rem;
    background: transparent;
  }

  .action-menu {
    min-width: 160px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    padding: 0.25rem;
  }
</style>
