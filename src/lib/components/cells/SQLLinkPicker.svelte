<script>
	import { createEventDispatcher, tick } from 'svelte';

	const dispatch = createEventDispatcher();

	let {
		value = [],
		fieldSchema,
		rows = [],
		loading = false,
		loaded = false,
		primaryDisplay: primaryDisplayProp,
		multi = false,
		focusIdx = $bindable(-1)
	} = $props();

	let tableId = $derived(fieldSchema?.tableId);
	let relatedField = $derived(fieldSchema?.relatedField || 'id');
	let relatedColumns = $derived(fieldSchema?.relatedColumns || []);
	let primaryDisplay = $derived(primaryDisplayProp || fieldSchema?.primaryDisplay || 'id');

	let localValue = $derived(Array.isArray(value) ? value : []);
	let listElement = $state();
	let optionRefs = $state([]);

	let gridTemplate = $derived(
		relatedColumns
			.map((col) => col.width || '1fr')
			.concat('32px')
			.join(' ')
	);

	let totalRows = $derived(localValue.length + (rows?.length || 0));

	$effect(() => {
		focusIdx = Math.min(focusIdx, totalRows - 1);
	});

	$effect(() => {
		if (focusIdx >= 0 && optionRefs[focusIdx]) {
			tick().then(() => {
				optionRefs[focusIdx]?.scrollIntoView({ block: 'nearest' });
			});
		}
	});

	const rowSelected = (val) => {
		if (value) {
			return value.find((e) => e[relatedField] == val[relatedField]);
		}
	};

	const selectRow = (val) => {
		const displayValue =
			relatedColumns && relatedColumns.length > 0
				? val[relatedColumns[0].name]
				: val[primaryDisplay];

		const selectedItem = {
			...val,
			[relatedField]: val[relatedField],
			primaryDisplay: displayValue
		};

		let nextValue;
		if (!multi) {
			if (localValue[0]?.[relatedField] == val[relatedField]) {
				nextValue = [];
			} else {
				nextValue = [selectedItem];
			}
		} else {
			let pos = localValue.findIndex((v) => v[relatedField] == val[relatedField]);
			if (pos > -1) {
				nextValue = localValue.filter((_, i) => i !== pos);
			} else {
				nextValue = [...localValue, selectedItem];
			}
		}
		dispatch('change', nextValue);
	};

	const handleScroll = (e) => {
		const element = e.target;
		if (element.scrollTop + element.clientHeight >= element.scrollHeight - 50) {
			dispatch('fetchmore');
		}
	};

	$effect(() => {
		if ((rows?.length ?? 0) > 0 && loaded && listElement) {
			if (listElement.scrollHeight <= listElement.clientHeight) {
				dispatch('fetchmore');
			}
		}
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore event_directive_deprecated -->
<div class="control">
	<div class="listWrapper" on:mousedown|preventDefault={() => {}}>
		<div
			class="list"
			class:table-mode={relatedColumns && relatedColumns.length > 0}
			bind:this={listElement}
			on:scroll={handleScroll}
		>
			{#if relatedColumns && relatedColumns.length > 1}
				<div
					class="grid-container"
					style="--grid-template: {gridTemplate}"
					on:scroll={handleScroll}
				>
					<div class="header-row">
						{#each relatedColumns as col}
							<div class="header-cell">
								{col.displayName || col.name}
							</div>
						{/each}
						<div class="header-cell check"></div>
					</div>
					{#each localValue as row, idx (row[relatedField])}
						<div
							class="data-row"
							class:selected={rowSelected(row)}
							class:highlighted={focusIdx == idx}
							bind:this={optionRefs[idx]}
							on:mouseenter={() => (focusIdx = idx)}
							on:mouseleave={() => (focusIdx = -1)}
							on:mousedown|preventDefault={() => selectRow(row)}
						>
							{#each relatedColumns as col}
								<div class="data-cell">
									{row[col.name] || ''}
								</div>
							{/each}
							<div class="data-cell check"><i class="ri-check-line"></i></div>
						</div>
					{/each}

					{#key rows}
						{#if rows?.length || (loading && !loaded)}
							{#each rows as row, idx (row[relatedField])}
								{#if !rowSelected(row)}
									<div
										class="data-row"
										class:highlighted={focusIdx == idx + localValue.length}
										bind:this={optionRefs[idx + localValue.length]}
										on:mouseenter={() => (focusIdx = idx + localValue.length)}
										on:mouseleave={() => (focusIdx = -1)}
										on:mousedown|preventDefault={() => selectRow(row)}
									>
										{#each relatedColumns as col}
											<div class="data-cell">{row[col.name] || ''}</div>
										{/each}
										<div class="data-cell check">
											<i class="ri-check-line"></i>
										</div>
									</div>
								{/if}
							{/each}
							{#if loading && loaded}
								<div class="data-row loading">
									<div class="data-cell" style="grid-column: 1 / -1;">
										<i class="ph ph-spinner spin"></i> Loading more...
									</div>
								</div>
							{/if}
						{:else if loading}
							<div class="data-row loading">
								<div class="data-cell" style="grid-column: 1 / -1;">
									<i class="ph ph-spinner spin"></i> Loading...
								</div>
							</div>
						{:else}
							<div class="data-row">
								<div class="data-cell" style="grid-column: 1 / -1;">No Results Found</div>
							</div>
						{/if}
					{/key}
				</div>
			{:else}
				<div class="options">
					{#each localValue as row, idx (row[relatedField])}
						<div
							class="option"
							class:selected={rowSelected(row)}
							class:highlighted={focusIdx == idx}
							bind:this={optionRefs[idx]}
							on:mouseenter={() => (focusIdx = idx)}
							on:mouseleave={() => (focusIdx = -1)}
							on:mousedown|preventDefault|stopPropagation={() => selectRow(row)}
						>
							<span>{row.primaryDisplay || row[primaryDisplay]}</span>
							<i class="ri-check-line"></i>
						</div>
					{/each}

					{#if !tableId}
						<div class="option">Configure a related table</div>
					{:else}
						{#key rows}
							{#if rows?.length || (loading && !loaded)}
								{#each rows as row, idx (row[relatedField])}
									{#if !rowSelected(row)}
										<div
											class="option"
											class:highlighted={focusIdx == idx + localValue.length}
											bind:this={optionRefs[idx + localValue.length]}
											on:mouseenter={() => (focusIdx = idx + localValue.length)}
											on:mouseleave={() => (focusIdx = -1)}
											on:mousedown|preventDefault={() => selectRow(row)}
										>
											<span>{row.primaryDisplay || row[primaryDisplay]}</span>
											<i class="ri-check-line"></i>
										</div>
									{/if}
								{/each}
								{#if loading && loaded}
									<div class="option loading">
										<i class="ph ph-spinner spin"></i>
										Loading more...
									</div>
								{/if}
							{:else if loading}
								<div class="option loading">
									<i class="ph ph-spinner spin"></i>
									Loading...
								</div>
							{:else}
								<div class="option">No Results Found</div>
							{/if}
						{/key}
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.control {
		flex: auto;
		flex-direction: column;
		display: flex;
		align-items: stretch;
		justify-content: space-around;
		gap: 0.25rem;
		padding: 0.25rem;
		overflow-x: hidden;
	}

	.listWrapper {
		flex: auto;
		display: flex;
		justify-content: stretch;
		align-content: stretch;
		gap: 0.25rem;
		overflow: hidden;
	}

	.list {
		flex: 1 1 50%;
		height: 200px;
		overflow-y: auto;
		overflow-x: hidden;
		color: var(--spectrum-global-color-gray-800);
	}

	.list.table-mode {
		overflow: visible;
		height: auto;
	}

	.options {
		display: flex;
		flex-direction: column;
		justify-content: flex-start;
		align-items: stretch;
		overflow-y: auto;
		gap: 0rem;
		min-width: 0;
	}

	.option {
		line-height: 1.5rem;
		padding: 0.15rem 0.5rem;
		overflow: hidden;
		display: flex;
		min-width: 0;
		justify-content: space-between;
	}

	.option > i {
		visibility: hidden;
	}

	.option > span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.option.selected > i {
		visibility: visible;
		color: var(--spectrum-global-color-green-500);
	}

	.option.highlighted {
		background-color: var(--spectrum-global-color-gray-75);
	}

	.option:hover {
		background-color: var(--spectrum-global-color-gray-75);
		border-radius: 4px;
		cursor: pointer;
	}

	.option.loading {
		justify-content: center;
		color: var(--spectrum-global-color-gray-500);
		font-style: italic;
	}

	.grid-container {
		height: 200px;
		overflow-y: auto;
	}

	.header-row {
		position: sticky;
		top: 0;
		background-color: var(--spectrum-global-color-gray-100);
		z-index: 1;
		display: grid;
		grid-template-columns: var(--grid-template);
		height: 1.75rem;
	}

	.data-row {
		display: grid;
		grid-template-columns: var(--grid-template);
		cursor: pointer;
	}

	.header-cell {
		padding: 0.15rem 0.5rem;
		text-align: left;
		border-bottom: 1px solid var(--spectrum-global-color-gray-300);
		font-weight: bold;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: flex;
		align-items: center;
	}

	.header-cell.check {
		text-align: center;
	}

	.data-cell {
		padding: 0.25rem 0.5rem;
		border-bottom: 1px solid var(--spectrum-global-color-gray-200);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.data-cell.check {
		text-align: center;
	}

	.data-row:hover,
	.data-row.highlighted {
		background-color: var(--spectrum-global-color-gray-75);
	}

	.data-row.selected .data-cell.check i {
		visibility: visible;
		color: var(--spectrum-global-color-green-500);
	}

	.data-cell.check i {
		visibility: hidden;
	}

	.data-row.loading {
		color: var(--spectrum-global-color-gray-500);
		font-style: italic;
	}

	.data-row.loading .data-cell {
		text-align: center;
		border-bottom: none;
	}
</style>