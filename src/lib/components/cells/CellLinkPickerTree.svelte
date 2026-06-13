<script>
	import { createEventDispatcher, getContext } from 'svelte';
	import SuperTree from '../SuperTree/SuperTree.svelte';
	import StringCell from './StringCell.svelte';

	const { API, fetchData, notificationStore } = getContext('sdk');
	const dispatch = createEventDispatcher();

	let {
		value = [],
		ownId,
		fieldSchema,
		joinColumn,
		sortColumn,
		sortOrder,
		filter = [],
		limit = 250,
		multi = false,
		quiet = false,
		search = false
	} = $props();

	let selectedNodes = $state([]);
	let maxNodeSelection = 10;
	let name = $derived(joinColumn || fieldSchema.name);
	let appliedFilter = $state([]);

	let tree = $state({
		root: true,
		id: 'root',
		label: 'Super Tree',
		children: []
	});

	let fetch = $state();

	$effect(() => {
		fetch = fetchData({
			API,
			datasource: {
				type: 'table',
				tableId: fieldSchema.tableId
			},
			options: {
				sortOrder,
				sortColumn,
				filter,
				limit
			}
		});
	});

	let primaryDisplay = $derived($fetch?.definition?.primaryDisplay);
	let idColumn = $derived($fetch?.definition?.primary?.[0] ?? '_id');

	const getChildren = (rows, parent) => {
		let children = [];
		rows?.forEach((row) => {
			if (row[name] == parent[idColumn]) {
				children.push({
					id: row[idColumn],
					disabled: row[idColumn] == ownId,
					disableChildren: true,
					label: row[$fetch.definition.primaryDisplay],
					children: getChildren(rows, row)
				});
			}
		});
		return children;
	};

	const buildRootTree = (rows) => {
		const nextTree = {
			root: true,
			id: 'root',
			label: 'Super Tree',
			children: []
		};
		if (rows?.length) {
			rows?.forEach((row) => {
				if (!row[name]) {
					nextTree.children.push({
						id: row[idColumn],
						disabled: row[idColumn] == ownId,
						disableChildren: true,
						label: row[$fetch.definition.primaryDisplay],
						children: getChildren(rows, row)
					});
				}
			});
		}
		tree = nextTree;
	};

	$effect(() => {
		buildRootTree($fetch?.rows);
	});

	$effect(() => {
		if (value && value.length) {
			selectedNodes = value.map((x) => ({
				id: x['_id'],
				label: x['primaryDisplay']
			}));
		} else {
			selectedNodes = [];
		}
	});

	const pickerCellOptions = {
		icon: 'ri-search-line',
		initialState: 'Editing',
		role: 'inline',
		debounce: 50
	};

	const handleNodeSelect = (e) => {
		if (e.detail.id == ownId) return;

		if (multi) {
			let index = selectedNodes.findIndex((x) => x.id == e.detail.id);
			if (index > -1) {
				selectedNodes = selectedNodes.filter((_, i) => i !== index);
			} else if (selectedNodes.length < maxNodeSelection) {
				selectedNodes = [...selectedNodes, e.detail];
			} else if (maxNodeSelection == 1) {
				selectedNodes = [e.detail];
			} else {
				notificationStore.actions.warning('Cannot select more than ' + maxNodeSelection + ' items');
			}
		} else {
			selectedNodes =
				selectedNodes[0]?.id !== e.detail.id ? [{ id: e.detail.id, label: e.detail.label }] : [];
		}

		if (pickerCellOptions.debounce) {
			dispatch(
				'change',
				selectedNodes.map((x) => ({
					_id: x.id,
					primaryDisplay: x.label
				}))
			);
		}
	};

	const handleSearch = (e) => {
		if (e.detail && e.detail != '') {
			appliedFilter = [
				...filter,
				{
					field: primaryDisplay,
					type: 'string',
					operator: 'fuzzy',
					value: e.detail,
					valueType: 'Value'
				}
			];
		} else {
			appliedFilter = filter ?? [];
		}

		fetch?.update({
			filter: appliedFilter
		});
	};
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore event_directive_deprecated -->
<div class="control">
	{#if search}
		<div class="search">
			<StringCell
				cellOptions={pickerCellOptions}
				autofocus
				on:change={handleSearch}
				on:exitedit={() => dispatch('focusout', {})}
			/>
		</div>
	{/if}
	<ul class="spectrum-TreeView" style="margin: unset;" class:spectrum-TreeView--quiet={quiet}>
		{#key $fetch?.rows}
			{#if $fetch?.loaded && $fetch?.rows?.length}
				{#each tree?.children as node, idx (idx)}
					<SuperTree tree={node} nodeSelection {selectedNodes} on:nodeSelect={handleNodeSelect} />
				{/each}
			{:else if $fetch?.loading}
				<li class="spectrum-TreeView-item" class:is-open={true}>
					<div class="spectrum-TreeView-itemLink">Loading</div>
				</li>
			{:else}
				<li class="spectrum-TreeView-item" class:is-open={true}>
					<div class="spectrum-TreeView-itemLink">No Matches</div>
				</li>
			{/if}
		{/key}
	</ul>
</div>

<style>
	.control {
		flex: auto;
		flex-direction: column;
		display: flex;
		align-items: stretch;
		justify-content: stretch;
		overflow-x: hidden;
		overflow-y: auto;
		gap: 0.25rem;
		min-height: 260px;
		max-height: 260px;
	}

	.search {
		height: 2rem;
		border-bottom: 1px solid var(--spectrum-global-color-gray-300);
		display: flex;
		align-items: stretch;
	}

	.spectrum-TreeView {
		width: 100%;
	}
</style>
