<script>
	import { createEventDispatcher } from 'svelte';
	import { fly } from 'svelte/transition';

	const dispatch = createEventDispatcher();

	let {
		rows = [],
		loading = false,
		loaded = false,
		primaryDisplay = 'email',
		value = [],
		wide = false,
		singleSelect = false,
		focusIdx = $bindable(-1)
	} = $props();

	let localValue = $derived(Array.isArray(value) ? value : []);
	let listElement = $state();

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

	$effect(() => {
		if (rows?.length) {
			focusIdx = Math.min(focusIdx, rows.length - 1);
		}
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore event_directive_deprecated -->
<div class="control">
	{#if wide}
		<div class="listWrapper" on:mousedown|preventDefault={() => {}}>
			<div class="list" bind:this={listElement} on:scroll={handleScroll}>
				<div class="options">
					{#key localValue}
						{#if rows?.length || (loading && loaded)}
							{#each rows as row, idx (row._id ?? idx)}
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
							{#if loading && loaded}
								<div class="option wide loading">
									<i class="ph ph-spinner spin"></i>
									Loading more...
								</div>
							{/if}
						{:else if loading}
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
						{#key rows}
							{#if rows?.length || (loading && !loaded)}
								{#each rows as row, idx (row._id ?? idx)}
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
					{/key}
				</div>
			</div>
		</div>
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