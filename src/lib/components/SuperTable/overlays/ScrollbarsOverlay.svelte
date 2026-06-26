<script>
  import { createEventDispatcher, untrack } from "svelte";

  let {
    scrollPos = $bindable(0),
    horizontalScrollPos = $bindable(0),
    highlighted,
    horizontalOffset = "0px",
    clientHeight,
    scrollHeight,
    visible = $bindable(),
    horizontalVisible = $bindable(),
    anchor,
    tableWidth,
  } = $props();

  const dispatch = createEventDispatcher();

  let startPos;
  let startScrollPos;
  let horizontalStartPos;
  let verticalRange = $state(0);
  let horizontalRange = $state(0);
  let dragging = $state(false);
  let horizontalDragging = $state(false);
  let mouseoffset = 0;
  let scrollWidth = $state(0);
  let width = $state("0%");

  let top = $derived((scrollPos / (scrollHeight + 32)) * 100 + "%");
  let left = $derived((horizontalScrollPos / scrollWidth) * 100 + "%");
  let height = $derived((clientHeight / scrollHeight) * 100 + "%");

  export const calculate = () => {
    if (!anchor) return;

    const nextVerticalRange = Math.max(scrollHeight - clientHeight, 0);
    const nextHorizontalRange = anchor.scrollWidth - anchor.clientWidth;
    const nextScrollWidth = anchor.scrollWidth;
    const nextWidth = (anchor.clientWidth / anchor.scrollWidth) * 100 + "%";

    verticalRange = nextVerticalRange;
    horizontalRange = nextHorizontalRange;
    scrollWidth = nextScrollWidth;
    width = nextWidth;

    visible = nextVerticalRange;
    horizontalVisible = nextHorizontalRange;
  };

  $effect(() => {
    anchor;
    clientHeight;
    scrollHeight;
    tableWidth;
    untrack(() => calculate());
  });

  $effect(() => {
    horizontalScrollPos;
    anchor;
    untrack(() => {
      if (anchor) anchor.scrollLeft = horizontalScrollPos;
    });
  });
</script>

<!-- svelte-ignore event_directive_deprecated -->
<svelte:window
  on:mouseup={() => {
    dragging = false;
    horizontalDragging = false;
    mouseoffset = 0;
    startPos = 0;
    horizontalStartPos = 0;
  }}
  on:mousemove={dragging || horizontalDragging
    ? (e) => {
        if (dragging) {
          e.preventDefault();
          e.stopPropagation();
          mouseoffset =
            (e.clientY - startPos) * (scrollHeight / clientHeight) +
            startScrollPos;
          if (mouseoffset > 0 && mouseoffset <= verticalRange)
            scrollPos = mouseoffset;
          dispatch("positionChange");
        }
        if (horizontalDragging) {
          e.preventDefault();
          e.stopPropagation();
          mouseoffset =
            (e.clientX - horizontalStartPos) *
              (anchor?.scrollWidth / anchor?.clientWidth) +
            startScrollPos;
          if (mouseoffset > 0 && mouseoffset <= horizontalRange)
            horizontalScrollPos = mouseoffset;
        }
        anchor.scrollLeft = horizontalScrollPos;
      }
    : () => {}}
/>

<div
  class="stb-scrollbar"
  class:hidden={!verticalRange}
  class:highlighted={highlighted || dragging}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore event_directive_deprecated -->
  <div
    class="stb-scrollbar-indicator"
    class:dragging
    style:top
    style:height
    on:mousedown={(e) => {
      e.stopPropagation();
      e.preventDefault();
      dragging = true;
      startPos = e.clientY;
      startScrollPos = scrollPos;
    }}
  ></div>
</div>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="stb-scrollbar horizontal"
  class:hidden={!horizontalRange}
  class:highlighted={highlighted || horizontalDragging}
  style:--horizontalOffset={horizontalOffset}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore event_directive_deprecated -->
  <div
    class="stb-scrollbar-indicator horizontal"
    style:left
    style:width
    class:dragging={horizontalDragging}
    on:mousedown={(e) => {
      e.stopPropagation();
      e.preventDefault();
      horizontalDragging = true;
      horizontalStartPos = e.clientX;
      startScrollPos = horizontalScrollPos;
    }}
  ></div>
</div>

<style>
  .stb-scrollbar {
    position: absolute;
    right: 8px;
    top: calc(var(--super-table-header-height, 0px) + 8px);
    bottom: calc(var(--super-table-footer-height, 0px) + 16px);
    width: 8px;
    border-radius: 4px;
    opacity: 0.2;
    z-index: 1;
    transition: 230ms;
    overflow: hidden;
  }

  .stb-scrollbar.hidden {
    display: none;
  }

  .stb-scrollbar.horizontal {
    top: unset;
    bottom: calc(var(--super-table-footer-height, 0px) + 8px);
    left: calc(var(--horizontalOffset) + 8px);
    width: calc(100% - 32px - var(--horizontalOffset));
    height: 8px;
  }

  .highlighted {
    opacity: 0.55 !important;
  }
  .stb-scrollbar-indicator {
    position: relative;
    width: 100%;
    border-radius: 4px;
    background-color: var(--spectrum-global-color-gray-500);
    min-height: 2rem;
    z-index: 2;
  }
  .stb-scrollbar-indicator:hover {
    cursor: pointer;
    background-color: var(--spectrum-global-color-gray-700);
  }
  .stb-scrollbar-indicator.dragging,
  .stb-scrollbar-indicator.horizontal.dragging {
    cursor: pointer;
    background-color: var(--spectrum-global-color-gray-700) !important;
  }

  .stb-scrollbar-indicator.horizontal {
    min-height: unset;
    min-width: 2rem;
    height: 100%;
  }
</style>