<svelte:options runes={false} />

<script>
  import { createEventDispatcher } from "svelte";

  const dispatch = createEventDispatcher();
  export let limit = 50;
  export let pagination = "none";
  export let currentOffset = 0;
  export let dataSource = null;
  export let fetch = null;

  $: valid = hasParams($dataSource) && pagination === "limitOffset";
  $: currentOffset = $dataSource?.queryParams?.offset || 0;

  $: currentPage = Math.floor(currentOffset / limit) + 1;
  $: hasMorePages = $fetch?.rows?.length >= limit;

  function goToPrevious() {
    if (currentOffset > 0) {
      currentOffset = Math.max(0, currentOffset - limit);
      updateDataSource();
    }
  }

  function goToNext() {
    if (hasMorePages) {
      currentOffset += limit;
      updateDataSource();
    }
  }

  function goToFirst() {
    currentOffset = 0;
    updateDataSource();
  }

  function updateDataSource() {
    if (dataSource) {
      $dataSource = {
        ...$dataSource,
        queryParams: {
          ...$dataSource.queryParams,
          offset: currentOffset,
        },
      };
    }
  }

  const hasParams = (ds) => {
    if (!ds || !ds.parameters) return false;
    const paramNames = ds.parameters.map((p) => p.name.toLowerCase());
    return paramNames.includes("offset") && paramNames.includes("limit");
  };
</script>

{#if valid}
  <div class="pagination-limit-offset">
    <div class="pagination-controls">
      <button
        class="pagination-btn"
        style:margin-right="-0.25rem"
        on:click={goToFirst}
        disabled={currentPage <= 1}
        title="First Page"
      >
        <i class="ph ph-caret-double-left"></i>
      </button>

      <button
        class="pagination-btn"
        on:click={goToPrevious}
        disabled={currentPage <= 1}
        title="Previous Page"
      >
        <i class="ph ph-caret-left"></i>
      </button>

      <span class="pagination-info">
        Page {currentPage}
        ( {currentOffset} - {currentOffset + ($fetch?.rows?.length || 0)} )
      </span>

      <button
        class="pagination-btn"
        on:click={goToNext}
        disabled={!hasMorePages}
        title="Next Page"
      >
        <i class="ph ph-caret-right"></i>
      </button>
    </div>
  </div>
{/if}

<style>
  .pagination-limit-offset {
    display: flex;
    justify-content: flex-end;
    padding: 0.25rem 0rem;
  }

  .pagination-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .pagination-btn {
    aspect-ratio: 1 / 1;
    border-radius: 0.25rem;
    color: var(--spectrum-global-color-gray-700);
    background-color: transparent;
    cursor: pointer;
    transition: all 0.2s ease;
    outline: none;
    border: none;
  }

  .pagination-btn:hover:not(:disabled) {
    background: var(--spectrum-global-color-gray-200);
    border-color: var(--spectrum-global-color-gray-400);
  }

  .pagination-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pagination-info {
    color: var(--spectrum-global-color-gray-700);
    white-space: nowrap;
    opacity: 0.9;
  }
</style>
