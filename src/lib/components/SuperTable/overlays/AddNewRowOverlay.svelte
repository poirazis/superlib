<svelte:options runes={false} />

<script>
  export let stbState;
  export let tableAPI;
  export let highlighted;
  export let footer;
  export let tableActions;

  $: inInsert = $stbState == "Inserting";
</script>

{#if $stbState == "Idle" || inInsert || tableActions?.length}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="overlay-button add-row-overlay"
    class:highlighted
    class:footer
    class:in-insert={inInsert}
    on:click={() => (inInsert ? stbState.cancelAddRow() : stbState.addRow())}
  >
    <span> + </span>
  </div>

  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="overlay-button save-row-overlay"
    class:highlighted
    class:footer
    class:in-insert={inInsert}
    on:click={tableAPI.insertRow}
  >
    {#if $stbState == "Saving"}
      <i class="ri-loader-2-line"></i>
    {:else}
      <i class="ri-save-fill"></i>
    {/if}
  </div>
{/if}

{#if $stbState == "Filtered"}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="overlay-button filter-row-overlay"
    class:highlighted
    class:footer
    on:click={stbState.clear}
  >
    <i class="ri-filter-off-line"></i>
  </div>
{/if}
