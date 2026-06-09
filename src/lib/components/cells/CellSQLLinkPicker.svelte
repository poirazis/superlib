<script>
	import { getContext, createEventDispatcher, tick } from 'svelte';

	const { API, fetchData, QueryUtils } = getContext('sdk');
	const dispatch = createEventDispatcher();

	let {
		value = [],
		fieldSchema,
		filter = [],
		multi = false,
		api = $bindable(),
		children
	} = $props();

	let tableId = $derived(fieldSchema.tableId);
	let relatedField = $derived(fieldSchema?.relatedField || 'id');
	let relatedColumns = $derived(fieldSchema?.relatedColumns || []);

	let focusIdx = $state(-1);
	let control = $state();
	let filterTerm = $state();
	let initLimit = $state(15);
	let isInitialLoad = $state(true);
	let hasMoreData = $state(true);
	let optionRefs = $state([]);
	let currentLimit = $state(initLimit);
	let searchFilter = $state();
	let searchExtensions = $state({});

	let localValue = $derived(Array.isArray(value) ? value : []);
	let defaultQuery = $derived(QueryUtils.buildQuery(filter));

	$effect(() => {
		if (searchFilter) {
			if (Array.isArray(searchFilter)) {
				searchExtensions = { search: QueryUtils.buildQuery(searchFilter) };
			} else {
				searchExtensions = { search: searchFilter };
			}
		} else {
			searchExtensions = {};
		}
	});

	const extendQuery = (baseQuery, extensions) => {
		if (!Object.keys(extensions).length) {
			return baseQuery;
		}
		const extended = {
			['$and']: {
				conditions: [...(baseQuery ? [baseQuery] : []), ...Object.values(extensions || {})]
			},
			onEmptyFilter: 'none'
		};
		return (extended['$and']?.conditions?.length ?? 0) > 0 ? extended : {};
	};

	let query = $derived(extendQuery(defaultQuery, searchExtensions));

	let optionsFetch = $state();

	$effect(() => {
		optionsFetch = fetchData({
			API,
			datasource: {
				type: 'table',
				tableId: tableId
			},
			options: {
				query: defaultQuery,
				limit: initLimit
			}
		});
	});

	$effect(() => {
		optionsFetch?.update({ query: query, limit: currentLimit });
	});

	let primaryDisplay = $derived($optionsFetch?.definition?.primaryDisplay || 'id');
	let gridTemplate = $derived(
		relatedColumns
			.map((col) => col.width || '1fr')
			.concat('32px')
			.join(' ')
	);

	$effect(() => {
		if ($optionsFetch?.loaded) {
			hasMoreData = ($optionsFetch.rows?.length ?? 0) >= currentLimit;
		}
	});

	let totalRows = $derived(localValue.length + ($optionsFetch?.rows?.length || 0));

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

	const handleSearch = (e) => {
		filterTerm = e.target.value;
		if (e.target.value) {
			if (relatedColumns && relatedColumns.length > 0) {
				searchFilter = {
					$or: {
						conditions: relatedColumns.map((col) => ({
							fuzzy: {
								[col.name]: e.target.value
							}
						}))
					}
				};
			} else {
				searchFilter = [
					{
						field: primaryDisplay,
						type: 'string',
						operator: 'fuzzy',
						value: e.target.value,
						valueType: 'Value'
					}
				];
			}
		} else {
			searchFilter = undefined;
		}
		currentLimit = initLimit;
	};

	const fetchMore = () => {
		if ($optionsFetch?.loading || !hasMoreData) return;
		currentLimit += 100;
	};

	const handleScroll = (e) => {
		const element = e.target;
		const scrollTop = element.scrollTop;
		const scrollHeight = element.scrollHeight;
		const clientHeight = element.clientHeight;

		if (scrollTop + clientHeight >= scrollHeight - 50) {
			fetchMore();
		}
	};

	const handleNavigation = (e) => {
		if (e.key == 'ArrowDown') {
			e.preventDefault();
			focusIdx += 1;
			if (focusIdx > totalRows - 1) focusIdx = 0;
		} else if (e.key == 'ArrowUp') {
			e.preventDefault();
			focusIdx -= 1;
			if (focusIdx < 0) focusIdx = totalRows - 1;
		} else if (e.key == 'Enter' && focusIdx > -1) {
			const row =
				focusIdx < localValue.length
					? localValue[focusIdx]
					: $optionsFetch.rows[focusIdx - localValue.length];
			selectRow(row);
		}
		if (e.key == 'Tab' || e.key == 'Escape') dispatch('close');
	};

	api = {
		focus: () => {
			control?.focus();
		},
		hasFocus: () => {
			return document.activeElement === control;
		},
		setSearch: (char) => {
			filterTerm = char;
			control?.focus();
		}
	};
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore event_directive_deprecated -->
<div class="control">
	<div class="searchControl">
		<i
			class={$optionsFetch?.loading && isInitialLoad
				? 'ph ph-spinner spin'
				: control?.value
					? 'ri-filter-fill'
					: 'ri-search-line'}
			style:color={filterTerm
				? 'var(--spectrum-global-color-blue-400)'
				: 'var(--spectrum-global-color-gray-700)'}
		></i>
		<input
			bind:this={control}
			class="search"
			class:placeholder={!filterTerm}
			type="text"
			placeholder={$optionsFetch?.loading &&
			!$optionsFetch?.rows?.length &&
			isInitialLoad
				? 'Loading...'
				: 'Search'}
			on:input={handleSearch}
			on:keydown={handleNavigation}
			on:focusout
		/>
	</div>

	<div class="listWrapper" on:mousedown|preventDefault={() => {}}>
		<div
			class="list"
			class:table-mode={relatedColumns && relatedColumns.length > 0}
			on:scroll={handleScroll}
		>
			{#if relatedColumns && relatedColumns.length > 1}
				<div class="grid-container" style="--grid-template: {gridTemplate}" on:scroll={handleScroll}>
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

					{#if $optionsFetch && $optionsFetch.loaded}
						{#key localValue.length}
							{#each $optionsFetch.rows as row, idx (row[relatedField])}
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
						{/key}
					{/if}

					{#if $optionsFetch?.loading}
						<div class="data-row loading">
							<div class="data-cell" style="grid-column: 1 / -1;">
								<i class="ph ph-spinner spin"></i> Loading more...
							</div>
						</div>
					{:else if $optionsFetch?.loading && !$optionsFetch.loaded}
						<div class="data-row loading">
							<div class="data-cell" style="grid-column: 1 / -1;">
								<i class="ph ph-spinner spin"></i> Loading...
							</div>
						</div>
					{:else if !$optionsFetch?.loading && $optionsFetch?.loaded && !$optionsFetch.rows?.length}
						<div class="data-row">
							<div class="data-cell" style="grid-column: 1 / -1;">No Results Found</div>
						</div>
					{/if}
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
							{@render children?.()}
							<span>{row.primaryDisplay || row[primaryDisplay]}</span>
							<i class="ri-check-line"></i>
						</div>
					{/each}

					{#if $optionsFetch}
						{#key localValue.length}
							{#each $optionsFetch.rows as row, idx (row[relatedField])}
								{#if !rowSelected(row)}
									<div
										class="option"
										class:highlighted={focusIdx == idx + localValue.length}
										bind:this={optionRefs[idx + localValue.length]}
										on:mouseenter={() => (focusIdx = idx + localValue.length)}
										on:mouseleave={() => (focusIdx = -1)}
										on:mousedown|preventDefault={() => selectRow(row)}
									>
										{@render children?.()}
										<span>{row.primaryDisplay || row[primaryDisplay]}</span>
										<i class="ri-check-line"></i>
									</div>
								{/if}
							{/each}
						{/key}
						{#if $optionsFetch?.loading}
							<div class="option loading">
								<i class="ph ph-spinner spin"></i>
								Loading...
							</div>
						{/if}
					{:else}
						<div class="option">No Results Found</div>
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
		padding-top: 0rem;
		overflow-x: hidden;
	}

	.searchControl {
		height: 2rem;
		border-bottom: 1px solid var(--spectrum-global-color-gray-300);
		display: flex;
		align-items: center;
		padding-left: 0.5rem;
		gap: 0.25rem;
	}

	.searchControl > i {
		font-size: 14px;
		transition: all 230ms;
	}

	.searchControl > input {
		height: 100%;
		width: 100%;
		outline: none;
		background: none;
		border: none;
		color: inherit;
		padding-left: 0.5rem;
		font-family: inherit;
		font-size: inherit;
	}

	.searchControl > input.placeholder {
		font-style: italic;
		color: var(--spectrum-global-color-gray-600);
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