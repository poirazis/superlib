<script>
	import { createEventDispatcher } from 'svelte';
	import Tooltip from '../UI/elements/Tooltip.svelte';
	import SuperTree from './SuperTree.svelte';

	const dispatch = createEventDispatcher();

	let {
		tree,
		open = $bindable(false),
		nodeSelection = false,
		selectedNodes = [],
		selectedGroups = []
	} = $props();

	let labelElement = $state();
	let tooltipShow = $state(false);
	let tooltipTimer = $state();

	let selected = $derived(
		tree.isGroup ? selectedGroups.includes(tree.id) : !!selectedNodes.find((x) => x.id == tree.id)
	);

	let isOverflowing = $derived(labelElement && labelElement.scrollWidth > labelElement.clientWidth);

	let tooltip = $derived(isOverflowing ? tree.label || 'Not Set' : null);

	const hasSelectedDescendant = (children) => {
		if (!children || !children.length) return false;
		for (let child of children) {
			if (
				child.isGroup
					? selectedGroups.includes(child.id)
					: selectedNodes.some((node) => node.id === child.id)
			) {
				return true;
			}
			if (hasSelectedDescendant(child.children)) {
				return true;
			}
		}
		return false;
	};

	$effect(() => {
		if (tree.disabled) open = false;
	});

	$effect(() => {
		if (hasSelectedDescendant(tree.children || [])) open = true;
	});

	const showTooltip = () => {
		if (!tooltip) return;
		if (tooltipTimer) clearTimeout(tooltipTimer);
		tooltipTimer = setTimeout(() => {
			tooltipShow = true;
		}, 750);
	};

	const hideTooltip = () => {
		if (tooltipTimer) {
			clearTimeout(tooltipTimer);
			tooltipTimer = null;
		}
		tooltipShow = false;
	};

	const toggleOpen = () => {
		if (tree.disabled) return;
		if (open && hasSelectedDescendant(tree.children || [])) return;
		open = !open;
		dispatch('nodeClick', { id: tree.id, label: tree.label });
	};

	const toggleNode = () => {
		dispatch('nodeSelect', {
			id: tree.id,
			label: tree.label,
			row: tree.row,
			group: tree.group
		});
	};
</script>

<!-- svelte-ignore a11y_missing_attribute -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore event_directive_deprecated -->
<li class="spectrum-TreeView-item" class:is-disabled={tree.disabled} class:is-open={open}>
	<div class="spectrum-TreeView-itemLink" style:padding-right={'0.5rem'}>
		<i
			class={'ri-arrow-right-s-line'}
			class:open
			class:is-disabled={tree.children.length == 0 || tree.disabled}
			style:font-size={'16px'}
			style:z-index={'1'}
			on:mousedown|stopPropagation={toggleOpen}
		></i>
		<div
			style:width={'100%'}
			style:z-index={'1'}
			on:mousedown|stopPropagation|preventDefault={toggleNode}
		>
			<div
				class="spectrum-TreeView-itemLabel"
				style:padding-left={'0.25rem'}
				style:z-index={'10'}
				style:text-overflow={'ellipsis'}
				style:overflow={'hidden'}
				style:white-space={'nowrap'}
				bind:this={labelElement}
				on:mouseenter={showTooltip}
				on:mouseleave={hideTooltip}
			>
				{tree.label || 'Not Set'}
			</div>
		</div>

		{#if selected}
			<i
				class={'ri-checkbox-circle-fill'}
				style:color={'var(--spectrum-global-color-green-500)'}
				style:font-size={'16px'}
			></i>
		{/if}
	</div>

	{#if tooltip}
		<Tooltip anchor={labelElement} content={tooltip} show={tooltipShow} />
	{/if}

	{#if tree.children?.length}
		<ul class="spectrum-TreeView">
			{#each tree.children as node, idx (idx)}
				<SuperTree
					tree={node}
					{nodeSelection}
					{selectedNodes}
					{selectedGroups}
					open={node.open}
					on:nodeSelect
					on:nodeClick
				/>
			{/each}
		</ul>
	{/if}
</li>

<style>
	.spectrum-TreeView-item {
		transition: all 130ms;
	}

	.spectrum-TreeView-itemLink {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.25rem;
		max-height: 1.75rem;
		padding: 0.25rem 0.5rem;
	}

	i {
		transition: all 130ms;
	}

	i.is-disabled {
		opacity: 0.3;
		pointer-events: none;
	}
	.open {
		transform: rotate(90deg);
	}
</style>
