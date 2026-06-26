<script>
	import { untrack } from 'svelte';
	import SuperPopover from '../../SuperPopover/SuperPopover.svelte';
	let { columnOptions, columnState, sorted = undefined } = $props();

	let headerAnchor = $state();
	let showFilteringOptions = $state(false);
	let filterValue = $state(null);
	let filterOperator = $state();
	let hovered = $state(false);

	const showFilterCell = $derived(
		$columnState === 'Entering' ||
			$columnState === 'Filtered' ||
			(hovered && columnOptions.canFilter)
	);

	const filterCellOptions = $derived({
		...columnOptions.headerCellOptions,
		placeholder: filterOperator,
		debounce: 200,
		disabled: filterOperator == 'empty' || filterOperator == 'notEmpty'
	});

	$effect(() => {
		const nextOperator = columnOptions.defaultFilteringOperator;
		if ($columnState == 'Idle') {
			untrack(() => {
				filterValue = null;
				filterOperator = nextOperator;
			});
		} else if (filterOperator === undefined) {
			filterOperator = nextOperator;
		}
	});

	const handleValueChange = (e) => {
		if (e.detail != undefined && e.detail != null && e.detail != '') {
			let nextValue = e.detail;
			if (columnOptions.schema.type == 'boolean' && nextValue === false) {
				filterValue = nextValue;
				columnState.submitFilter({ operator: 'notEqual', value: true });
			} else if (Array.isArray(e.detail) && e.detail.length == 0) {
				filterValue = null;
				columnState.clearValue();
			} else {
				if (
					filterOperator != 'oneOf' &&
					filterOperator != 'containsAny' &&
					Array.isArray(nextValue)
				) {
					nextValue = nextValue[0];
				}
				filterValue = nextValue;
				columnState.submitFilter({ operator: filterOperator, value: filterValue });
			}
		} else {
			filterValue = null;
			columnState.clearValue();
		}
	};

	const handleOperatorChange = (op) => {
		filterOperator = op;
		if (filterValue || op == 'empty' || op == 'notEmpty')
			columnState.submitFilter({ operator: op, value: filterValue ?? '' });

		showFilteringOptions = false;
	};

	const handleBlur = () => {
		if (headerAnchor.matches(':focus-within')) return;
		if ($columnState === 'Entering') {
			columnState.cancel();
		}
	};
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore event_directive_deprecated -->

<div
	bind:this={headerAnchor}
	class="super-column-header"
	class:idle={!showFilterCell}
	style:padding-left={columnOptions.headerCellOptions?.padding}
	style:padding-right={columnOptions.headerCellOptions?.padding}
	on:mouseenter={() => (hovered = true)}
	on:mouseleave={() => (hovered = false)}
	on:focusout={handleBlur}
	on:focusin={columnState.headerClicked}
>
	{#key showFilterCell}
		{#if showFilterCell}
			{@const Cell = columnOptions.headerCellComponent}

			{#if columnOptions.canFilter == 'advanced'}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<!-- svelte-ignore event_directive_deprecated -->
				<i
					class="ri-filter-3-line"
					tabindex="0"
					style="align-self: center; font-size: 14px;"
					on:click|preventDefault={() => (showFilteringOptions = !showFilteringOptions)}
				></i>
			{/if}

			<Cell
				cellOptions={filterCellOptions}
				value={filterValue}
				fieldSchema={columnOptions.schema}
				multi={filterOperator == 'containsAny' || filterOperator == 'oneOf'}
				on:change={handleValueChange}
			/>
		{:else}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore event_directive_deprecated -->
			<div class="headerLabel" style:justify-content={columnOptions.headerCellOptions?.align}>
				<div class="innerText" class:sortable={columnOptions.canSort}>
					{columnOptions.displayName}
				</div>
			</div>
		{/if}
	{/key}

	{#if columnOptions.canSort && $columnState == 'Idle'}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore event_directive_deprecated -->
		<span class="placeholder" on:click={columnState.sort}>
			{#if hovered || sorted}
				<i class={sorted == 'ascending' ? 'ri-sort-asc' : 'ri-sort-desc'} class:sorted></i>
			{/if}
		</span>
	{/if}
</div>

{#if columnOptions.canFilter == 'advanced' && showFilterCell}
	<SuperPopover
		anchor={headerAnchor}
		open={showFilteringOptions}
		align={'left'}
		minWidth={160}
		on:close={() => {
			showFilteringOptions = false;
			handleBlur();
		}}
	>
		<ul
			class="spectrum-Menu"
			role="menu"
			style="background-color: var(--spectrum-global-color-gray-75 );"
		>
			{#each columnOptions.filteringOperators ?? [] as option}
				<!-- svelte-ignore event_directive_deprecated -->
				<li
					class="spectrum-Menu-item"
					class:selected={option.value == filterOperator}
					role="menuitem"
					on:mousedown|preventDefault={() => handleOperatorChange(option.value)}
				>
					<span class="spectrum-Menu-itemLabel">{option.label}</span>
				</li>
			{/each}
		</ul>
	</SuperPopover>
{/if}

<style>
	i {
		&:hover {
			cursor: pointer;
		}
	}

	.placeholder {
		min-width: 1rem;
		height: 1rem;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--spectrum-global-color-gray-500);
		&:hover {
			color: var(--spectrum-global-color-gray-800);
			cursor: pointer;
		}
	}

	.sorted {
		color: var(--spectrum-global-color-gray-800);
	}

	.sortable {
		cursor: pointer;
	}
	.sortable:hover {
		filter: brightness(120%);
	}
	.selected {
		color: var(--primaryColor);
		background-color: var(--spectrum-global-color-gray-75);
	}
</style>
