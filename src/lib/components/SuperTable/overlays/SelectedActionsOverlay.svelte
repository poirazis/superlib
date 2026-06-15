<svelte:options runes={false} />

<script>
  import { slide } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import SuperButton from "../../Button.svelte";

  export let stbState;
  export let stbSettings;
  export let tableAPI;
  export let highlighted;
  export let footer;
  export let selectedActions;
  export let stbSelected;
  export let entityPlural = "Rows";
  export let entitySingular = "Row";

  let hidden;
  $: if ($stbSelected.length == 0) hidden = false;
  $: checkboxes = !$stbSettings.appearance.hideSelectionColumn;

  $: left =
    1 +
    (checkboxes +
      $stbSettings.features.canDelete +
      $stbSettings.appearance.numberingColumn) *
      2 +
    "rem";
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
{#if $stbSelected.length && $stbState != "Inserting" && !hidden}
  <div
    class="selected-row-actions-overlay"
    style:bottom={$stbSettings.appearance.footerHeight + 20}
    style:left
    class:highlighted
    class:footer
    transition:slide={{ delay: 25, duration: 230, easing: quintOut, axis: "y" }}
  >
    <SuperButton
      icon="ri-close-line"
      quiet={true}
      size="S"
      type="secondary"
      onClick={() => (hidden = true)}
    />
    <span class="text">
      {$stbSelected.length == 1
        ? $stbSelected.length + " " + (entitySingular || "Row") + " "
        : $stbSelected.length + " " + (entityPlural || "Rows") + " "} Selected
    </span>
    {#each selectedActions as { text, icon, disabled, type, size, onClick }}
      <SuperButton
        {text}
        {icon}
        quiet={true}
        {type}
        {disabled}
        {size}
        onClick={tableAPI.executeSelectedRowsAction(onClick)}
      />
    {/each}
  </div>
{/if}
