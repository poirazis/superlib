<script>
  let {
    bottom,
    isEmpty,
    message = "No Records Found",
  } = $props();
</script>

{#if isEmpty}
  <div class="emptyTable" style:bottom>
    <i class="ri-search-line"></i>
    {message}
  </div>
{/if}