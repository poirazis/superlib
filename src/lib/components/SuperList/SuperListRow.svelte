<script>
	let {
		draggableItem,
		showHandle,
		inEdit,
		inactive = $bindable(true),
		reorderOnly,
		showColors,
		itemColor,
		itemLabel,
		onSelect,
		onRemove,
		setAnchor
	} = $props();

	let anchorEl = $state();

	$effect(() => {
		setAnchor?.(anchorEl);
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore event_directive_deprecated -->
<li on:click={() => onSelect(draggableItem.id)} bind:this={anchorEl}>
	{#if showHandle}
		<div
			class="handle"
			class:inEdit
			aria-label="drag-handle"
			style={!inactive ? 'cursor:grabbing' : 'cursor:grab'}
			on:mousedown={() => {
				inactive = false;
			}}
			on:mouseup={() => {
				inactive = true;
			}}
		>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="18"
				><path
					d="M8.5 7C9.32843 7 10 6.32843 10 5.5C10 4.67157 9.32843 4 8.5 4C7.67157 4 7 4.67157 7 5.5C7 6.32843 7.67157 7 8.5 7ZM8.5 13.5C9.32843 13.5 10 12.8284 10 12C10 11.1716 9.32843 10.5 8.5 10.5C7.67157 10.5 7 11.1716 7 12C7 12.8284 7.67157 13.5 8.5 13.5ZM10 18.5C10 19.3284 9.32843 20 8.5 20C7.67157 20 7 19.3284 7 18.5C7 17.6716 7.67157 17 8.5 17C9.32843 17 10 17.6716 10 18.5ZM15.5 7C16.3284 7 17 6.32843 17 5.5C17 4.67157 16.3284 4 15.5 4C14.6716 4 14 4.67157 14 5.5C14 6.32843 14.6716 7 15.5 7ZM17 12C17 12.8284 16.3284 13.5 15.5 13.5C14.6716 13.5 14 12.8284 14 12C14 11.1716 14.6716 10.5 15.5 10.5C16.3284 10.5 17 11.1716 17 12ZM15.5 20C16.3284 20 17 19.3284 17 18.5C17 17.6716 16.3284 17 15.5 17C14.6716 17 14 17.6716 14 18.5C14 19.3284 14.6716 20 15.5 20Z"
				></path></svg
			>
		</div>
	{/if}
	<div class="right-content" class:showColors style:--option-color={itemColor}>
		<i class="ri-checkbox-blank-fill"></i>
		<span>{itemLabel || draggableItem.item}</span>
	</div>
	{#if !reorderOnly && inEdit}
		<i class="ph ph-trash-simple" on:mousedown|preventDefault={() => onRemove(draggableItem.id)}
		></i>
	{/if}
</li>

<style>
	.right-content {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.right-content > span {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.right-content.showColors > i {
		display: block;
		color: var(--option-color);
		font-size: 16px;
	}

	.right-content > i {
		display: none;
	}

	.handle > svg:hover {
		cursor: grab;
	}

	.handle {
		display: flex;
		min-width: 1.5rem;
		align-items: center;
		color: var(--spectrum-global-color-gray-500);
		fill: var(--spectrum-global-color-gray-700);
		font-size: 14px;
	}

	i:hover {
		cursor: pointer;
	}
</style>
