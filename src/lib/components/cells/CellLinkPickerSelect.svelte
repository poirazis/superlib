<script>
	import { getContext, createEventDispatcher } from 'svelte';
	import { fly } from 'svelte/transition';

	const { API, fetchData } = getContext('sdk');
	const dispatch = createEventDispatcher();

	let {
		value = [],
		fieldSchema,
		filter = [],
		wide = false,
		singleSelect = false,
		api = $bindable()
	} = $props();

	let tableId = $derived(fieldSchema.tableId);
	let isBBReference = $derived(fieldSchema?.type?.includes('bb_reference'));
	let type = $derived(isBBReference ? 'user' : 'table');
	let localValue = $derived(Array.isArray(value) ? value : []);

	let appliedFilter = $state([]);
	let focusIdx = $state(-1);
	let control = $state();
	let filterTerm = $state();
	let initLimit = $state(15);
	let listElement = $state();
	let isInitialLoad = $state(true);

	let fetch = $state();

	$effect(() => {
		fetch = fetchData({
			API,
			datasource: {
				type,
				tableId: tableId
			},
			options: {
				filter,
				limit: 15
			}
		});
	});

	let primaryDisplay = $derived($fetch?.definition?.primaryDisplay || 'email');

	$effect(() => {
		if ($fetch?.rows) {
			focusIdx = Math.min(focusIdx, $fetch.rows.length - 1);
		}
	});

	const rowSelected = (val) => {
		if (value) {
			return value.find((e) => e._id == val._id);
		}
	};

	const selectRow = (val) => {
		let nextValue;
		if (singleSelect) {
			if (localValue[0]?._id == val._id) {
				nextValue = [];
			} else {
				nextValue = [{ _id: val._id, primaryDisplay: val[primaryDisplay] }];
			}
		} else {
			let pos = localValue.findIndex((v) => v._id == val._id);
			if (pos > -1) {
				nextValue = localValue.filter((_, i) => i !== pos);
			} else {
				nextValue = [...localValue, { _id: val._id, primaryDisplay: val[primaryDisplay] }];
			}
		}
		dispatch('change', nextValue);
	};

	const unselectRow = (val) => {
		dispatch(
			'change',
			localValue.filter((e) => e._id !== val._id)
		);
	};

	const handleSearch = (e) => {
		filterTerm = e.target.value;

		if (e.target.value) {
			appliedFilter = [
				...filter,
				{
					field: primaryDisplay,
					type: 'string',
					operator: 'fuzzy',
					value: e.target.value,
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

	const fetchMore = () => {
		if ($fetch?.loading) return;
		if (($fetch?.rows?.length ?? 0) < initLimit) return;
		initLimit += 100;
		fetch?.update({
			limit: initLimit
		});
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
		if (e.key == 'Escape') {
			dispatch('close');
		} else if (e.key == 'ArrowDown') {
			e.preventDefault();
			focusIdx += 1;
			if (focusIdx > ($fetch?.rows?.length ?? 0) - 1) focusIdx = 0;
		} else if (e.key == 'ArrowUp') {
			e.preventDefault();
			focusIdx -= 1;
			if (focusIdx < 0) focusIdx = ($fetch?.rows?.length ?? 1) - 1;
		} else if (e.key == 'Enter' && focusIdx > -1) {
			selectRow($fetch.rows[focusIdx]);
		}
	};

	$effect(() => {
		if (($fetch?.rows?.length ?? 0) > 0 && !isInitialLoad && listElement) {
			const scrollHeight = listElement.scrollHeight;
			const clientHeight = listElement.clientHeight;
			if (scrollHeight <= clientHeight) {
				fetchMore();
			}
		}
	});

	api = {
		focus: () => {
			control?.focus();
		},
		hasFocus: () => {
			return document.activeElement === control;
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
			class={$fetch?.loading && isInitialLoad
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
			placeholder={$fetch?.loading && !$fetch?.rows?.length && isInitialLoad
				? 'Loading...'
				: 'Search'}
			on:input={handleSearch}
			on:keydown={handleNavigation}
			on:focusout
		/>
	</div>

	{#if $fetch?.rows}
		{#if wide}
			<div class="listWrapper" on:mousedown|preventDefault={() => {}}>
				<div class="list" bind:this={listElement} on:scroll={handleScroll}>
					<div class="options">
						{#key localValue}
							{#if $fetch?.rows?.length || ($fetch?.loading && !isInitialLoad)}
								{#each $fetch?.rows || [] as row, idx (idx)}
									{#if !rowSelected(row)}
										<div
											class="option wide"
											class:highlighted={focusIdx == idx}
											on:mouseenter={() => (focusIdx = idx)}
											on:mouseleave={() => (focusIdx = -1)}
											on:mousedown|preventDefault|stopPropagation={() => selectRow(row)}
										>
											{row[primaryDisplay]}
											<i class="ri-add-line"></i>
										</div>
									{/if}
								{/each}
								{#if $fetch?.loading && $fetch.loaded}
									<div class="option wide loading">
										<i class="ph ph-spinner spin"></i>
										Loading more...
									</div>
								{/if}
							{:else if $fetch?.loading}
								<div class="option wide loading">
									<i class="ph ph-spinner spin"></i>
									Loading...
								</div>
							{:else}
								<div class="option wide">No Results Found</div>
							{/if}
						{/key}
					</div>
				</div>
				<div class="list listSelected">
					<div class="options">
						{#if localValue.length}
							{#each localValue as val, idx (idx)}
								{#if rowSelected(val)}
									<div
										transition:fly={{ x: -20, duration: 130 }}
										class="option wide selected"
										on:mousedown|stopPropagation|preventDefault={() => unselectRow(val)}
									>
										{val.primaryDisplay}
										<i class="ri-close-line"></i>
									</div>
								{/if}
							{/each}
						{:else}
							<span>Nothing Selected</span>
						{/if}
					</div>
				</div>
			</div>
		{:else}
			<div class="listWrapper" on:mousedown|preventDefault={() => {}}>
				<div class="list" bind:this={listElement} on:scroll={handleScroll}>
					<div class="options">
						{#key localValue}
							{#key $fetch?.rows}
								{#if $fetch?.rows?.length || ($fetch?.loading && !$fetch?.loaded)}
									{#each $fetch?.rows || [] as row, idx (idx)}
										<div
											class="option"
											class:selected={rowSelected(row)}
											class:highlighted={focusIdx == idx}
											on:mouseenter={() => (focusIdx = idx)}
											on:mouseleave={() => (focusIdx = -1)}
											on:mousedown|preventDefault|stopPropagation={() => selectRow(row)}
										>
											{row[primaryDisplay]}
											<i class="ri-check-line"></i>
										</div>
									{/each}
									{#if $fetch?.loading && $fetch.loaded}
										<div class="option loading">
											<i class="ph ph-spinner spin"></i>
											Loading more...
										</div>
									{/if}
								{:else if $fetch?.loading}
									<div class="option loading">
										<i class="ph ph-spinner spin"></i>
										Loading...
									</div>
								{:else}
									<div class="option">No Results Found</div>
								{/if}
							{/key}
						{/key}
					</div>
				</div>
			</div>
		{/if}
	{/if}
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

	.listSelected {
		color: var(--spectrum-global-color-gray-800);
		border-left: 1px solid var(--spectrum-global-color-gray-300);
		padding-left: 0.25rem;
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
		text-overflow: ellipsis;
		white-space: nowrap;
		display: flex;
		justify-content: space-between;
	}

	.option > i {
		visibility: hidden;
	}

	.option.wide:hover > i {
		visibility: visible;
		color: var(--spectrum-global-color-green-500);
	}

	.option.selected > i {
		visibility: visible;
		color: var(--spectrum-global-color-green-500);
	}

	.option.highlighted {
		background-color: var(--spectrum-global-color-gray-75);
	}

	.options > span {
		color: var(--spectrum-global-color-gray-500);
		font-style: italic;
		flex: auto;
		display: flex;
		align-items: center;
		justify-content: center;
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
</style>
