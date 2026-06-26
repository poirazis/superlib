<script>
  import { getContext } from "svelte";
  import SuperPopover from "../../SuperPopover/SuperPopover.svelte";
  import SuperButton from "../../buttons/SuperButton.svelte";
  import {
    configuredButtonKey,
    splitRowMenuButtons,
  } from "../../../utils/buttonConditions.ts";

	let {
		right,
		rowMenu,
		rowMenuItems,
		menuItemsVisible = 1,
		canScroll,
		stbSettings,
		stbState,
		tableAPI,
		rowState,
		rows = [],
		visibleRows = [],
		horizontalScrollPos = 0,
	} = $props();

	const getStbSelected = getContext("stbSelected");

  let menuAnchor = $state();
  let openMenu = $state(false);

  let quiet = $derived(stbSettings.appearance?.quiet);
  let menuIcon = $derived(stbSettings.rowMenuIcon);
  let sticky = $derived(horizontalScrollPos > 0 && !right);
  let inInsert = $derived($stbState == "Inserting");

  let rowMenuSplit = $derived(
    splitRowMenuButtons(rowMenuItems, menuItemsVisible),
  );
  let inlineButtons = $derived(rowMenuSplit.inlineButtons);
  let menuItems = $derived(rowMenuSplit.overflowButtons);

  const handleMenu = (e, index) => {
    menuAnchor = e.target;
    openMenu = !openMenu;
    rowState.menuRow = openMenu ? index : -1;
  };
</script>

<div class="super-column" class:right class:sticky style:flex="none">
  {#if stbSettings.showHeader}
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
  >
    {#each visibleRows as visibleRow}
      {@const row = rows[visibleRow]}
      {@const meta = row?.__meta}
      {@const rowButtons = tableAPI.resolveRowButtons(inlineButtons, row, {
        forceDisabled:
          inInsert || rowState.editing == visibleRow || meta?.disabled,
      })}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore event_directive_deprecated -->
      <div
        class="super-row"
        on:mouseenter={() => (rowState.hovered = visibleRow)}
        on:mouseleave={() => (rowState.hovered = -1)}
		class:selected={getStbSelected().has(visibleRow)}
        class:hovered={rowState.hovered == visibleRow || rowState.menuRow == visibleRow}
        class:is-editing={rowState.editing == visibleRow}
        class:disabled={meta?.disabled}

        style:padding-right={canScroll && right ? "1.5rem" : "0.5rem"}
      >
        <div
          class="row-buttons"
          style:gap={inlineButtons.length > 1 ? "0.25rem" : "0rem"}
        >
          {#if rowMenu && rowButtons?.length}
            {#each rowButtons as button, index (configuredButtonKey(button, index))}
              <SuperButton
                {...button}
                onClick={() => button.onClick?.()}
              />
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

  {#if stbSettings.showFooter}
    <div class="super-column-footer"></div>
  {/if}
</div>

{#if openMenu}
  {@const menuRow = rows[rowState.menuRow]}
  {@const menuMeta = menuRow?.__meta}
  {@const overflowButtons = tableAPI.resolveRowButtons(menuItems, menuRow, {
    forceDisabled:
      inInsert || rowState.editing == rowState.menuRow || menuMeta?.disabled,
  })}
  <SuperPopover
    open
    anchor={menuAnchor}
    minWidth={150}
    align={right ? "right" : "left"}
    on:close={() => {
      openMenu = false;
      rowState.menuRow = -1;
    }}
  >
    {#if overflowButtons?.length}
      <div class="action-menu">
        {#each overflowButtons as button, index (configuredButtonKey(button, index))}
          <SuperButton
            {...button}
            menuItem
            menuAlign={right ? "right" : "left"}
            onClick={() => {
              button.onClick?.();
              openMenu = false;
              rowState.menuRow = -1;
            }}
          />
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