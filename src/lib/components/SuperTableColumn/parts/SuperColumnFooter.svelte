<svelte:options runes={false} />

<script>
  import { getContext } from "svelte";
  const columnOptions = getContext("stColumnOptions");
  export let footerLabel;
</script>

<div
  class="super-column-footer"
  style:justify-content={$columnOptions?.headerAlign}
>
  <span>
    {footerLabel || $columnOptions.displayName || $columnOptions.name}
  </span>
</div>
