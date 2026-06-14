<script>
	import { createEventDispatcher } from 'svelte';
	import SuperTree from '../SuperTree/SuperTree.svelte';
	import { getContext } from 'svelte';

	const { notificationStore } = getContext('sdk');
	const dispatch = createEventDispatcher();

	let {
		value = [],
		ownId,
		fieldSchema,
		joinColumn,
		rows = [],
		loading = false,
		loaded = false,
		primaryDisplay,
		idColumn = '_id',
		multi = false,
		quiet = false
	} = $props();

	let selectedNodes = $state([]);
	let maxNodeSelection = 10;
	let name = $derived(joinColumn || fieldSchema.name);

	let tree = $state({
		root: true,
		id: 'root',
		label: 'Super Tree',
		children: []
	});

	const getChildren = (allRows, parent) => {
		let children = [];
		allRows?.forEach((row) => {
			if (row[name] == parent[idColumn]) {
				children.push({
					id: row[idColumn],
					disabled: row[idColumn] == ownId,
					disableChildren: true,
					label: row[primaryDisplay],
					children: getChildren(allRows, row)
				});
			}
		});
		return children;
	};

	const buildRootTree = (allRows) => {
		const nextTree = {
			root: true,
			id: 'root',
			label: 'Super Tree',
			children: []
		};
		if (allRows?.length) {
			allRows?.forEach((row) => {
				if (!row[name]) {
					nextTree.children.push({
						id: row[idColumn],
						disabled: row[idColumn] == ownId,
						disableChildren: true,
						label: row[primaryDisplay],
						children: getChildren(allRows, row)
					});
				}
			});
		}
		tree = nextTree;
	};

	$effect(() => {
		buildRootTree(rows);
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

		dispatch(
			'change',
			selectedNodes.map((x) => ({
				_id: x.id,
				primaryDisplay: x.label
			}))
		);
	};
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore event_directive_deprecated -->
<div class="control" on:focusout={(e) => dispatch('focusout', e)}>
	<ul class="spectrum-TreeView" style="margin: unset;" class:spectrum-TreeView--quiet={quiet}>
		{#key rows}
			{#if loaded && rows?.length}
				{#each tree?.children as node, idx (idx)}
					<SuperTree tree={node} nodeSelection {selectedNodes} on:nodeSelect={handleNodeSelect} />
				{/each}
			{:else if loading}
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

	.spectrum-TreeView {
		width: 100%;
	}
</style>