<script>
	import SuperPopover from '../../SuperPopover/SuperPopover.svelte';

	let { anchor, content, show = false, align = 'top' } = $props();
</script>

<SuperPopover
	{anchor}
	{align}
	open={show}
	dismissible={false}
	animate={true}
	customZindex={1000}
	offsetBelow={12}
>
	<div class="tooltip-content info">
		{content}
	</div>
</SuperPopover>

<style>
	.tooltip-content {
		padding: 4px 12px;
		font-size: 12px;
		color: var(--spectrum-global-color-gray-700);
		background-color: var(--spectrum-global-color-gray-50);
		border: 1px solid var(--spectrum-global-color-gray-300);
		border-radius: 4px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
		max-width: 200px;
		word-wrap: break-word;
	}

	.tooltip-content.info {
		padding: 4px 12px;
		background-color: var(--spectrum-global-color-blue-100);
		border-color: rgb(from var(--spectrum-global-color-blue-500) r g b / 50%);
		color: var(--spectrum-global-color-gray-800);
	}
</style>
