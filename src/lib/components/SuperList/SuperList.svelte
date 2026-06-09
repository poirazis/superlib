<script>
	import { dndzone } from 'svelte-dnd-action';
	import { createEventDispatcher } from 'svelte';
	import { generate } from 'shortid';
	import { writable, get } from 'svelte/store';
	import SuperListRow from './SuperListRow.svelte';
	import SuperListActions from './SuperListActions.svelte';

	let {
		items = [],
		itemsColors = [],
		itemsLabels = [],
		showColors,
		listItemKey,
		draggable = true,
		focus,
		editorState,
		reorderOnly,
		placeholder,
		fullSelection,
		readonly,
		inactive = $bindable(true)
	} = $props();

	const dispatch = createEventDispatcher();
	const zoneType = generate();

	const store = writable({
		selected: null,
		actions: {
			select: (id) => {
				store.update((state) => ({
					...state,
					selected: id
				}));
			}
		}
	});

	let anchors = $state({});

	const buildDraggable = (sourceItems) => {
		return sourceItems
			.map((item) => ({
				id: listItemKey ? item[listItemKey] : generate(),
				color: itemsColors[item],
				item,
				type: zoneType
			}))
			.filter((item) => item.id);
	};

	let draggableItems = $state([]);

	$effect(() => {
		draggableItems = buildDraggable(items);
	});
	let inEdit = $derived(!readonly);
	let showHandle = $derived(draggable && inEdit);
	let isEmpty = $derived(draggableItems?.length < 1);

	$effect(() => {
		if (focus && store) {
			get(store).actions.select(focus);
		}
	});

	const updateRowOrder = (e) => {
		draggableItems = e.detail.items;
	};

	const serialiseUpdate = () => {
		return draggableItems.reduce((acc, ele) => {
			acc.push(ele.item);
			return acc;
		}, []);
	};

	const handleFinalize = (e) => {
		inactive = true;
		updateRowOrder(e);
		dispatch('change', serialiseUpdate());
	};

	const removeItem = (id) => {
		const index = draggableItems.findIndex((item) => item.id == id);
		if (index > -1) {
			draggableItems.splice(index, 1);
			dispatch('change', serialiseUpdate());
		}
	};
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore event_directive_deprecated -->
<ul
	class="list-wrap"
	class:inEdit
	use:dndzone={{
		items: draggableItems,
		dropTargetStyle: { outline: 'none' },
		dragDisabled: !draggable || inactive,
		type: zoneType,
		dropFromOthersDisabled: true
	}}
	onfinalize={handleFinalize}
	onconsider={updateRowOrder}
>
	{#each draggableItems as draggableItem, idx (draggableItem.id)}
		<SuperListRow
			{draggableItem}
			{showHandle}
			{inEdit}
			bind:inactive
			{reorderOnly}
			{showColors}
			itemColor={itemsColors[draggableItem.item]}
			itemLabel={itemsLabels[draggableItem.item]}
			onSelect={(id) => get(store).actions.select(id)}
			onRemove={removeItem}
			setAnchor={(el) => {
				anchors[draggableItem.id] = el;
			}}
		/>
	{/each}

	<SuperListActions
		{inEdit}
		{reorderOnly}
		{fullSelection}
		editorState={$editorState}
		hasItems={draggableItems.length > 0}
		on:togglePicker={() => dispatch('togglePicker')}
		on:clear={() => dispatch('clear')}
	/>
	{#if !(inEdit && !reorderOnly) && items.length < 1}
		<li class="buttons">
			<div class="add-button placeholder">{placeholder}</div>
		</li>
	{/if}
</ul>

<style>
	.list-wrap {
		list-style-type: none;
		margin: 0;
		padding: 0;
		width: 100%;
		border-radius: 4px;
		max-height: var(--height, 15rem);
		overflow-y: auto;
		height: 100%;
	}
	.list-wrap > :global(li:not(.buttons)) {
		background-color: transparent;
		transition: background-color ease-in-out 130ms;
		display: flex;
		align-items: center;
		border-bottom: 1px solid var(--spectrum-global-color-gray-200);
	}
	.list-wrap.inEdit > :global(li:not(.buttons):hover) {
		background-color: var(
			--spectrum-table-row-background-color-hover,
			var(--spectrum-alias-highlight-hover)
		);
		cursor: pointer;
	}
	.list-wrap > :global(li:first-child) {
		border-top-left-radius: 4px;
		border-top-right-radius: 4px;
	}
	.list-wrap > :global(li:last-child) {
		border-bottom-left-radius: 4px;
		border-bottom-right-radius: 4px;
		border-bottom: 0px;
	}
	.list-wrap :global(li) {
		padding-left: var(--spacing-s);
		padding-right: var(--spacing-s);
		line-height: 1.85rem;
	}

	.list-wrap :global(li:focus) {
		outline: none;
	}

	.add-button.placeholder {
		font-style: italic;
		color: var(--spectrum-global-color-gray-500);
	}
</style>