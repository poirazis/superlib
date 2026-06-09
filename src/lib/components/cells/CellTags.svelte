<script>
	import { getContext, createEventDispatcher } from 'svelte';
	import fsm from 'svelte-fsm';
	import PickerPopover from './PickerPopover.svelte';
	import { OPTIONS_COLORS_ARRAY } from './optionsColors';
	import './CellCommon.css';

	const dispatch = createEventDispatcher();
	const { API, QueryUtils, fetchData, memo, derivedMemo } = getContext('sdk');

	let { cellOptions, value, autofocus = false } = $props();

	let anchor = $state();
	let editor = $state();
	let picker = $state();
	let searchInput = $state();
	let options = memo([]);
	let optionColors = $state({});
	let filteredOptions = $state([]);
	let focusedOptionIdx = $state(-1);
	let timer = $state();
	let initLimit = $state(30);
	let isInitialLoad = $state(true);
	let isFetchMore = $state(false);
	let localValue = $state([]);
	let newTag = $state();
	let searchTerm = $state('');
	let search = $state(false);

	const addUniqueTags = (tagsToAdd) => {
		if (!tagsToAdd || !tagsToAdd.length) return;

		const existingLower = new Set(
			(localValue || []).map((t) =>
				String(t || '')
					.toLowerCase()
					.trim()
			)
		);

		const newTags = [];
		tagsToAdd.forEach((tag) => {
			const trimmedTag = String(tag || '').trim();
			if (trimmedTag && !existingLower.has(trimmedTag.toLowerCase())) {
				newTags.push(trimmedTag);
				existingLower.add(trimmedTag.toLowerCase());
			}
		});

		if (newTags.length) {
			localValue = [...(localValue || []), ...newTags];
			cellState.change();
		}
	};

	const colors = derivedMemo(options, ($options) => {
		let obj = {};
		$options.forEach(
			(option, index) =>
				(obj[option] =
					optionColors[option] ?? OPTIONS_COLORS_ARRAY[index % OPTIONS_COLORS_ARRAY.length])
		);
		return obj;
	});

	let originalValue = $state('[]');

	let config = $derived(cellOptions ?? {});
	let controlType = $derived(config.controlType);
	let suggestions = $derived(config.suggestions);
	let valueColumn = $derived(config.valueColumn);
	let customOptions = $derived(config.customOptions);
	let optionsViewMode = $derived(config.optionsViewMode);
	let role = $derived(config.role);
	let readonly = $derived(config.readonly);
	let disabled = $derived(config.disabled);
	let error = $derived(config.error);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let placeholder = $derived(config.placeholder);
	let showDirty = $derived(config.showDirty);
	let align = $derived(config.align);

	// svelte-ignore state_referenced_locally
	const dataSourceStore = memo(config?.datasource ?? {});
	let fetch = $state();

	$effect(() => {
		dataSourceStore.set(config.datasource);
	});

	$effect(() => {
		if (config.suggestions) {
			initLimit = 15;
			isInitialLoad = true;
			isFetchMore = false;
		}
	});

	$effect(() => {
		const query = QueryUtils.buildQuery(config.filter);
		fetch?.update({
			query,
			limit: initLimit
		});
	});

	$effect(() => {
		if ($fetch) cellState.syncFetch($fetch);
	});

	$effect(() => {
		cellState.loadDataOptions($fetch?.rows);
	});

	$effect(() => {
		cellState.reset(value);
	});

	let isEmpty = $derived(localValue.length < 1);
	let inEdit = $derived($cellState == 'Editing');
	let isDirty = $derived(inEdit && originalValue !== JSON.stringify(localValue));
	let open = $derived($editorState == 'Open');

	export const cellState = fsm('Loading', {
		'*': {
			goTo(state) {
				return state;
			},
			refresh() {
				options.set([]);
				return 'Loading';
			},
			loadDataOptions(rows) {
				if (isFetchMore) {
					if (rows && rows.length) {
						const newOptions = rows.map((row) => row[valueColumn]);
						options.set([...getOptionsSnapshot(), ...newOptions]);
					}
					isFetchMore = false;
				} else {
					const nextOptions = [];
					if (rows && rows.length) {
						rows.forEach((row) => {
							nextOptions.push(row[valueColumn]);
						});
					}
					options.set(nextOptions);
				}
				filteredOptions = getOptionsSnapshot();
				if (isInitialLoad) isInitialLoad = false;
			},
			loadCustomOptions() {
				const nextOptions = [];
				if (customOptions?.length) {
					customOptions.forEach((row) => {
						nextOptions.push(row.value || row);
					});
				}
				options.set(nextOptions);
			},
			clearFilters() {
				filteredOptions = getOptionsSnapshot();
			},
			reset(newValue) {
				localValue = [...(newValue || [])];
				originalValue = JSON.stringify(localValue);
			}
		},
		Loading: {
			_enter() {
				if (!suggestions || $fetch?.loaded) this.goTo.debounce(5, config.initialState || 'View');
			},
			_exit() {
				if (config.suggestions) this.loadDataOptions($fetch?.rows);
				else if (config.optionsSource == 'custom') this.loadCustomOptions();

				filteredOptions = getOptionsSnapshot();
			},
			syncFetch(fetchState) {
				if (fetchState?.loaded) {
					return config.initialState || 'View';
				}
			}
		},
		View: {
			_enter() {},
			focus() {
				if (!config.readonly && !config.disabled) {
					return 'Editing';
				}
			}
		},
		Editing: {
			_enter() {
				originalValue = JSON.stringify(Array.isArray(value) ? value : value ? [value] : []);
				this.clearFilters();
				editorState.open();
				dispatch('enteredit');
			},
			_exit() {
				editorState.close();
				dispatch('exitedit');
			},
			focus() {
				anchor?.focus();
			},
			focusout(e) {
				if (anchor?.contains(e.relatedTarget) || editor?.contains(e.relatedTarget)) {
					return;
				}
				this.submit();
			},
			change() {
				if (config.debounce) {
					clearTimeout(timer);
					timer = setTimeout(() => {
						dispatch('change', localValue);
					}, config.debounce);
				}
			},
			submit() {
				if (isDirty) {
					dispatch('change', localValue);
					return 'View';
				}
				this.cancel();
			},
			clear() {
				localValue = [];
				this.submit();
			},
			cancel() {
				editorState.close();
				localValue = JSON.parse(originalValue);
				anchor?.blur();
				return 'View';
			}
		}
	});

	let editorState = fsm('Closed', {
		'*': {
			close() {
				return 'Closed';
			},
			toggleOption(idx) {
				if (config.disabled || config.readonly) return;

				if (typeof idx === 'string') {
					let option = idx;
					let pos = localValue.indexOf(option);
					if (pos > -1) {
						localValue.splice(pos, 1);
						localValue = [...localValue];
					} else {
						addUniqueTags([option]);
					}
					cellState.change();
					fetchMoreIfNeeded();
				} else {
					if (idx < 0) return;
					let option = filteredOptions[idx];
					let pos = localValue.indexOf(option);
					if (pos > -1) {
						localValue.splice(pos, 1);
						localValue = [...localValue];
					} else {
						addUniqueTags([option]);
					}
					cellState.change();
					fetchMoreIfNeeded();
				}
			}
		},
		Open: {
			_enter() {
				focusedOptionIdx = -1;
				setTimeout(() => searchInput?.focus(), 0);
				editorState.filterOptions(searchTerm);
			},
			_exit() {
				if (newTag?.trim() && filteredOptions.length == 0) {
					const tags = newTag
						.split(',')
						.map((tag) => tag.trim())
						.filter((tag) => tag);
					addUniqueTags(tags);
				}
				searchTerm = '';
				newTag = null;
			},
			filterOptions(term) {
				if (term) newTag = term.trim();
				else newTag = null;

				if (config.suggestions) {
					let appliedFilter = [];
					if (term) {
						appliedFilter = [
							...(config.filter || []),
							{
								field: valueColumn,
								type: 'string',
								operator: 'fuzzy',
								value: term,
								valueType: 'Value'
							}
						];
					} else {
						appliedFilter = config.filter || [];
					}
					isFetchMore = false;
					fetch?.update({
						query: QueryUtils.buildQuery(appliedFilter)
					});
					filteredOptions = getOptionsSnapshot();
				} else {
					if (term) {
						filteredOptions = getOptionsSnapshot().filter((x) =>
							x?.toLocaleLowerCase().startsWith(term.toLocaleLowerCase())
						);
					} else {
						filteredOptions = getOptionsSnapshot();
						search = false;
					}
				}
			},
			toggle() {
				return 'Closed';
			},
			handleInputKeyboard(e) {
				if (e.key == 'Enter') {
					if (newTag?.trim()) {
						const tags = newTag
							.split(',')
							.map((tag) => tag.trim())
							.filter((tag) => tag);
						addUniqueTags(tags);
						newTag = null;
						searchTerm = '';
						setTimeout(() => searchInput?.focus(), 0);
					}
					e.preventDefault();
					return;
				}
				if (e.key == ' ') {
					if (focusedOptionIdx > -1) {
						this.toggleOption(focusedOptionIdx);
						e.preventDefault();
					}
				}
				if (e.key == 'Tab') {
					anchor?.focus();
					editorState.close();
					e.preventDefault();
					return;
				}
				if (e.key == 'Escape') {
					newTag = null;
					editorState.close();
					anchor?.focus();
					e.preventDefault();
					e.stopPropagation();
					return;
				}
				if (e.key == 'ArrowDown') this.highlightNext(e.stopPropagation());
				if (e.key == 'ArrowUp') this.highlightPrevious(e.preventDefault(), e.stopPropagation());
				if (e.key == 'Escape') {
					cellState.cancel();
				}
			},
			handleKeyboard(e) {
				if (e.keyCode == 32) {
					if (focusedOptionIdx > -1) {
						this.toggleOption(focusedOptionIdx);
					} else if (!config.autocomplete) {
						this.close(e.preventDefault());
					}
				}
				if (e.key == 'Escape') {
					cellState.cancel();
				}
				if (e.key == 'Enter' || e.key == 'Tab') {
					if (focusedOptionIdx > -1 && filteredOptions[focusedOptionIdx])
						this.toggleOption(focusedOptionIdx);
				}
				if (e.key == 'ArrowDown') this.highlightNext();
				if (e.key == 'ArrowUp') this.highlightPrevious(e.preventDefault());
				if (controlType != 'inputSelect') search = true;
			},
			highlightNext() {
				focusedOptionIdx += 1;
				if (focusedOptionIdx > filteredOptions.length - 1) focusedOptionIdx = 0;
			},
			highlightPrevious() {
				focusedOptionIdx -= 1;
				if (focusedOptionIdx < 0) focusedOptionIdx = filteredOptions.length - 1;
			}
		},
		Closed: {
			toggle() {
				return 'Open';
			},
			open() {
				return 'Open';
			},
			highlightNext() {
				this.open();
				focusedOptionIdx = 0;
			},
			handleInputKeyboard(e) {
				if (e.key == 'Escape') cellState.cancel();
				if (e.key != 'Tab') {
					this.open();
					focusedOptionIdx = 0;
				}
			},
			handleKeyboard(e) {
				if (e.key == 'Escape') cellState.cancel();
				if (controlType == 'select' && e.key != 'Tab') {
					search = true;
					if (e.key == 'ArrowDown' || e.keyCode == 32) this.toggle();
					if (e.key == 'Backspace' || e.key == 'Delete') {
						localValue = [];
						cellState.change();
					}
				}
			}
		}
	});

	let optionsSnapshot = $state([]);

	$effect(() => {
		const unsubscribe = options.subscribe((next) => {
			optionsSnapshot = next;
		});
		return unsubscribe;
	});

	const getOptionsSnapshot = () => optionsSnapshot;

	const fetchMore = () => {
		if ($fetch?.loading) return;
		if (($fetch?.rows?.length ?? 0) < initLimit) return;
		isFetchMore = true;
		initLimit += 100;
		fetch?.update({
			limit: initLimit
		});
	};

	const fetchMoreIfNeeded = () => {
		const visibleOptions = filteredOptions.filter((option) => !localValue?.includes(option));
		const minVisibleThreshold = 10;

		if (
			visibleOptions.length < minVisibleThreshold &&
			!$fetch?.loading &&
			($fetch?.rows?.length ?? 0) >= initLimit
		) {
			fetchMore();
		}
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

	const createFetch = (datasource) => {
		if (!suggestions) return;

		return fetchData({
			API,
			datasource,
			options: {
				limit: initLimit
			}
		});
	};

	$effect(() => {
		fetch = createFetch(dataSourceStoreSnapshot);
	});

	let dataSourceStoreSnapshot = $state({});

	$effect(() => {
		const unsubscribe = dataSourceStore.subscribe((next) => {
			dataSourceStoreSnapshot = next;
		});
		return unsubscribe;
	});

	$effect(() => {
		if (filteredOptions && suggestions && !$fetch?.loading) {
			setTimeout(() => fetchMoreIfNeeded(), 0);
		}
	});

	$effect(() => {
		if (autofocus) {
			setTimeout(() => {
				cellState.focus();
			}, 30);
		}

		return () => {
			if (timer) clearTimeout(timer);
		};
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore event_directive_deprecated -->
<div
	bind:this={anchor}
	class="superCell"
	tabindex={config?.disabled ? -1 : 0}
	class:isDirty={isDirty && showDirty}
	class:inEdit
	class:disabled
	class:readonly
	class:error
	class:multirow={true}
	style:color
	style:background
	class:inline={role == 'inlineInput'}
	class:tableCell={role == 'tableCell'}
	class:formInput={role == 'formInput'}
	on:focusin={cellState.focus}
	on:focusout={cellState.focusout}
	on:keydown={editorState.handleKeyboard}
>
	<div class="value" class:placeholder={isEmpty} tabindex="-1">
		{#if isEmpty && !inEdit}
			<span>{placeholder || 'Add some Tags'}</span>
		{/if}

		<div
			class="tags"
			style:justify-content={align ?? 'flex-start'}
			style:flex-wrap={'wrap'}
			tabindex="-1"
		>
			{#if localValue.length}
				{#each localValue as tag, idx (tag)}
					<div
						class="tag"
						style:--option-color={$colors[tag] ||
							OPTIONS_COLORS_ARRAY[idx % OPTIONS_COLORS_ARRAY.length]}
					>
						<span class="tag-wrap">
							<span> {tag} </span>
						</span>
						{#if inEdit}
							<i
								class="ph ph-x"
								style:font-size={'12px'}
								style:z-index={2}
								on:mousedown|preventDefault|stopPropagation={() => editorState.toggleOption(tag)}
							></i>
						{/if}
					</div>
				{/each}
			{/if}

			{#if inEdit}
				<i
					class="ph ph-plus actionIcon"
					on:mouseup|preventDefault|stopPropagation={editorState.toggle}
				></i>
			{/if}
		</div>
	</div>
</div>

<PickerPopover
	{anchor}
	visible={inEdit}
	useAnchorWidth
	maxHeight={250}
	{open}
	onClose={cellState.focusout}
>
	<div bind:this={editor} class="editor" tabindex="-1">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore event_directive_deprecated -->
		<div class="searchControl" on:keydown={editorState.handleInputKeyboard}>
			<i
				class={suggestions ? 'ph ph-magnifying-glass' : 'ph ph-pencil-simple'}
				class:actionIcon={true}
			></i>
			<!-- svelte-ignore event_directive_deprecated -->
			<input
				type="text"
				placeholder={suggestions ? 'Search or Add' : 'Enter tag...'}
				class="searchInput"
				bind:value={searchTerm}
				bind:this={searchInput}
				on:input={(e) => editorState.filterOptions(e.target.value)}
				on:focusout={cellState.focusout}
			/>
		</div>

		{#if suggestions}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore event_directive_deprecated -->
			<div
				bind:this={picker}
				class="options"
				on:wheel={(e) => e.stopPropagation()}
				on:mouseleave={() => (focusedOptionIdx = -1)}
				on:scroll={suggestions ? handleScroll : null}
				on:mousedown|preventDefault|stopPropagation
			>
				{#if $fetch?.loading && !$fetch?.rows?.length}
					<div class="option loading">
						<i class="ph ph-spinner spin"></i>
						Loading...
					</div>
				{:else if filteredOptions?.length}
					{#each filteredOptions as option, idx (idx)}
						{#if !localValue?.includes(option)}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<!-- svelte-ignore event_directive_deprecated -->
							<div
								class="option"
								class:text={optionsViewMode == 'text'}
								class:focused={focusedOptionIdx === idx}
								style:--option-color={$colors[option]}
								on:mousedown|preventDefault={() => editorState.toggleOption(idx)}
								on:mouseenter={() => (focusedOptionIdx = idx)}
							>
								<span>
									{#if optionsViewMode !== 'text'}
										<i class="ri-checkbox-blank-fill"></i>
									{/if}
									{option}
								</span>
							</div>
						{/if}
					{/each}
					{#if $fetch?.loading}
						<div class="option loading">
							<i class="ph ph-spinner spin"></i>
							Loading more...
						</div>
					{/if}
				{:else}
					<div class="option not-found">
						<span>
							<i class="ri-close-line"></i>
							No matches found, Tag will be added as new
						</span>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</PickerPopover>

<style>
	.tags {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		max-height: 6rem;
		overflow-y: auto;
		box-sizing: border-box;
		flex-wrap: wrap;
	}

	.tag {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0rem 0.5rem;
		border-radius: 0.5rem;
		background-color: var(--option-color, var(--spectrum-global-color-gray-300));
		border: 1px solid var(--option-color, var(--spectrum-global-color-gray-400));
		box-sizing: border-box;
		font-size: 11px;
		font-weight: bold;
		text-transform: uppercase;
		outline: none;
		max-width: 7rem;
		transition: all 0.2s ease-in-out;
	}

	.tag:hover {
		filter: brightness(0.9);
	}

	.tag:hover > i {
		display: block;
		cursor: pointer;
	}

	.tag > span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tag > i {
		display: none;
		cursor: pointer;
		transition: all 0.2s ease-in-out;
	}

	.searchControl {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0rem 0.5rem;
	}

	.searchControl:focus-within > .actionIcon {
		color: var(--spectrum-global-color-blue-600);
		font-weight: 800;
	}

	.options {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		overflow-y: auto;
		color: var(--spectrum-global-color-gray-700);
		border-top: 1px solid var(--spectrum-global-color-gray-200);
	}

	.option {
		min-height: 1.75rem;
		display: flex;
		gap: 0.5rem;
		align-items: center;
		justify-content: space-between;
		padding: 0 0.5rem;
	}

	.option:hover {
		background-color: var(--spectrum-global-color-gray-75);
		cursor: pointer;
	}

	.option.focused {
		background-color: var(--spectrum-global-color-gray-75);
		color: var(--spectrum-global-color-gray-800);
	}

	.option.not-found {
		justify-content: center;
		color: var(--spectrum-global-color-gray-500);
		font-style: italic;
		height: 2rem;
	}

	.option > span {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.option > span > i {
		font-size: 16px;
		color: var(--option-color, var(--spectrum-global-color-gray-300));
	}

	.option.loading {
		justify-content: center;
		color: var(--spectrum-global-color-gray-500);
		font-style: italic;
	}

	.actionIcon {
		height: 100%;
		display: flex;
		justify-content: center;
		align-items: center;
		font-size: 0.85rem;
		color: var(--spectrum-global-color-gray-600);
	}

	.actionIcon:hover {
		cursor: pointer;
		color: var(--spectrum-global-color-blue-600);
		font-weight: 800;
	}

	.searchInput {
		width: 100%;
		background: inherit;
		font: inherit;
		color: inherit;
		border: none;
		outline: none;
		padding: 0.5rem;
		box-sizing: border-box;
	}

	.value {
		outline: none;
	}
</style>
