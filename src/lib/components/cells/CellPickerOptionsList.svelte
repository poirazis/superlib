<script>
	let {
		optionsList = $bindable(),
		onWheel = (e) => e.stopPropagation(),
		onMouseLeave,
		onScroll = undefined,
		children
	} = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={optionsList}
	class="options"
	onwheel={onWheel}
	onmouseleave={onMouseLeave}
	onscroll={onScroll}
>
	{@render children?.()}
</div>