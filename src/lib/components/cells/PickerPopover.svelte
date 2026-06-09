<script>
	import SuperPopover from '../SuperPopover/SuperPopover.svelte';

	let {
		anchor,
		open = false,
		visible = true,
		useAnchorWidth = true,
		minWidth = undefined,
		maxHeight = 250,
		align = 'left',
		dismissible = true,
		ignoreAnchor = true,
		onClose = undefined,
		children
	} = $props();
</script>

{#if visible}
	<!-- svelte-ignore event_directive_deprecated -->
	<SuperPopover
		{anchor}
		{useAnchorWidth}
		{minWidth}
		{align}
		{maxHeight}
		{dismissible}
		{ignoreAnchor}
		{open}
		on:close={onClose}
	>
		{#snippet children()}
			{@render children?.()}
		{/snippet}
	</SuperPopover>
{/if}
