<script>
	let { onWheel, children } = $props();
</script>

<div class="wheel-wrap" onwheel={onWheel}>
	{@render children?.()}
</div>

<style>
	.wheel-wrap {
		display: contents;
	}
</style>