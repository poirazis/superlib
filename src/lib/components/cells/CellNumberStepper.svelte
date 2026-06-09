<script>
	let { onIncrement, onDecrement } = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore event_directive_deprecated -->
<div class="controls">
	<i class="ph ph-minus" on:mousedown|preventDefault|stopPropagation={onDecrement}></i>
	<i class="ph ph-plus" on:mousedown|preventDefault|stopPropagation={onIncrement}></i>
</div>

<style>
	.controls {
		height: 100%;
		display: flex;
		flex-direction: row;
		align-items: stretch;
		gap: 0.25rem;
		padding: 0.25rem 0;
	}

	.controls i {
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0.25rem;
		background-color: var(--spectrum-global-color-gray-100);
		border-radius: 0.25rem;
		transition: all 0.2s ease-in-out;
	}

	.controls i:hover {
		background-color: var(--spectrum-global-color-gray-300);
		color: var(--spectrum-global-color-gray-900);
	}
</style>