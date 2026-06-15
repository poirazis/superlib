<svelte:options runes={false} />

<script>
  export let top;
  export let bottom;
  export let isEmpty;
  export let message = "No Records Found";
</script>

{#if isEmpty}
  <div class="emptyTable" style:top style:bottom>
    <i class="ri-search-line"></i>
    {message}
  </div>
{/if}
