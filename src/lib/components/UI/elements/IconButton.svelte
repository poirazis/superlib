<svelte:options runes={false} />

<script lang="ts">
  import { createEventDispatcher, onDestroy } from "svelte";
  import Tooltip from "./Tooltip.svelte";

  const dispatch = createEventDispatcher();

  export let icon: string;
  export let disabled: boolean = false;
  export let size: "small" | "medium" | "large" = "medium";
  export let tooltip: string | undefined = undefined;
  export let variant: "primary" | "secondary" | "warning" | "danger" =
    "primary";

  let buttonElement: HTMLButtonElement;
  let tooltipShow = false;
  let tooltipTimer: number | undefined;

  const showTooltip = () => {
    if (tooltipTimer) clearTimeout(tooltipTimer);
    tooltipTimer = setTimeout(() => {
      tooltipShow = true;
    }, 750);
  };

  const hideTooltip = () => {
    if (tooltipTimer) {
      clearTimeout(tooltipTimer);
      tooltipTimer = undefined;
    }
    tooltipShow = false;
  };

  onDestroy(() => {
    if (tooltipTimer) clearTimeout(tooltipTimer);
  });

  function handleClick() {
    if (disabled) return;
    dispatch("click");
  }
</script>

<!-- svelte-ignore a11y_consider_explicit_label -->
<button
  bind:this={buttonElement}
  class="icon-button {size} {variant}"
  class:disabled
  on:click={handleClick}
  on:mouseenter={tooltip ? showTooltip : undefined}
  on:mouseleave={tooltip ? hideTooltip : undefined}
>
  <i class="ph ph-{icon}"></i>
</button>

{#if tooltip}
  <Tooltip anchor={buttonElement} content={tooltip} show={tooltipShow} />
{/if}

<style>
  .icon-button {
    all: unset;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.25rem;
    transition: all 0.1s ease-in-out;
    background-color: transparent;
    border: 1px solid transparent;
  }

  .icon-button:hover:not(.disabled) {
    background-color: var(--spectrum-global-color-gray-200);
  }

  .icon-button:active:not(.disabled) {
    background-color: var(--spectrum-global-color-gray-300);
  }

  .icon-button.disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .icon-button.small {
    width: 1.5rem;
    height: 1.5rem;
  }

  .icon-button.medium {
    width: 2rem;
    height: 2rem;
  }

  .icon-button.large {
    width: 2.5rem;
    height: 2.5rem;
  }

  .icon-button.small i {
    font-size: 0.9rem;
  }

  .icon-button.medium i {
    font-size: 1rem;
  }

  .icon-button.large i {
    font-size: 1.25rem;
  }

  .icon-button.warning {
    color: var(--spectrum-global-color-red-400);
  }
</style>