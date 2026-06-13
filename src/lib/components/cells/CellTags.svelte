<script lang="ts">
	import { getContext, untrack } from 'svelte';
	import { createEventDispatcher } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import SuperPopover from '../SuperPopover/SuperPopover.svelte';
	import { OPTIONS_COLORS_ARRAY } from './optionsColors';
	import { copyAndTransition, deferJustCopied } from './cellClipboard';

	const dispatch = createEventDispatcher();
	const { API, QueryUtils, fetchData } = getContext('sdk');

	let { id, cellOptions, value, autofocus = false } = $props();

	let anchor = $state<HTMLElement | null>(null);
	let editor = $state<HTMLElement | null>(null);
	let picker = $state<HTMLElement | null>(null);
	let searchInput = $state<HTMLInputElement | null>(null);
	let options = $state<string[]>([]);
	let filteredOptions = $state<string[]>([]);
	let focusedOptionIdx = $state(-1);
	let timer = $state<ReturnType<typeof setTimeout>>();
	let initLimit = $state(30);
	let isInitialLoad = $state(true);
	let isFetchMore = $state(false);
	let localValue = $state<string[]>([]);
	let newTag = $state<string | null>(null);
	let searchTerm = $state('');
	let open = $state(false);
	let originalValue = $state('[]');
	let fetch = $state<ReturnType<typeof fetchData>>();

	let config = $derived(cellOptions ?? {});
	let controlType = $derived(config.controlType);
	let suggestions = $derived(config.suggestions);
	let valueColumn = $derived(config.valueColumn);
	let customOptions = $derived(config.customOptions);
	let optionsViewMode = $derived(config.optionsViewMode);
	let role = $derived(config.role);
	let readonly = $derived(config.readonly);
	let disabled = $derived(config.disabled);
	let copyable = $derived(config.copyable);
	let copyIcon = $derived(config.copyIcon ?? 'always');
	let error = $derived(config.error);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let placeholder = $derived(config.placeholder);
	let showDirty = $derived(config.showDirty);
	let align = $derived(config.align);
	let datasource = $derived(config.datasource);
	let filter = $derived(config.filter);
	let debounceDelay = $derived(config.debounce);

	let isEmpty = $derived(localValue.length < 1);
	let inEdit = $derived($csm === 'editing');
	let isDirty = $derived(inEdit && originalValue !== JSON.stringify(localValue));
	let tabindex = $state(0);

	let tagColors = $derived.by(() => {
		const colors: Record<string, string> = {};
		options.forEach((option, index) => {
			colors[option] = OPTIONS_COLORS_ARRAY[index % OPTIONS_COLORS_ARRAY.length];
		});
		localValue.forEach((tag, index) => {
			if (!colors[tag]) {
				colors[tag] = OPTIONS_COLORS_ARRAY[index % OPTIONS_COLORS_ARRAY.length];
			}
		});
		return colors;
	});

	const getCopyText = () => localValue.join(', ');

	const emitChange = (immediate = false) => {
		if (!debounceDelay || immediate) {
			dispatch('change', [...localValue]);
			dispatch('labelChange', getCopyText() || null);
			return;
		}

		clearTimeout(timer);
		timer = setTimeout(() => {
			dispatch('change', [...localValue]);
			dispatch('labelChange', getCopyText() || null);
		}, debounceDelay);
	};

	const addUniqueTags = (tagsToAdd: string[]) => {
		if (!tagsToAdd?.length) return;

		const existingLower = new Set(
			localValue.map((tag) =>
				String(tag || '')
					.toLowerCase()
					.trim()
			)
		);

		const newTags: string[] = [];
		tagsToAdd.forEach((tag) => {
			const trimmedTag = String(tag || '').trim();
			if (trimmedTag && !existingLower.has(trimmedTag.toLowerCase())) {
				newTags.push(trimmedTag);
				existingLower.add(trimmedTag.toLowerCase());
			}
		});

		if (newTags.length) {
			localValue = [...localValue, ...newTags];
			emitChange();
		}
	};

	const loadOptionsFromRows = (rows: Record<string, unknown>[] | undefined) => {
		if (isFetchMore) {
			if (rows?.length) {
				const newOptions = rows.map((row) => String(row[valueColumn]));
				options = [...options, ...newOptions];
			}
			isFetchMore = false;
		} else {
			options = rows?.length ? rows.map((row) => String(row[valueColumn])) : [];
		}

		filteredOptions = [...options];
		if (isInitialLoad) isInitialLoad = false;
	};

	const loadCustomOptions = () => {
		options =
			customOptions?.map((row: { value?: string } | string) =>
				typeof row === 'object' ? String(row.value ?? '') : String(row)
			) ?? [];
		filteredOptions = [...options];
	};

	const toggleOption = (optionOrIdx: string | number) => {
		if (disabled || readonly) return;

		const option =
			typeof optionOrIdx === 'number' ? filteredOptions[optionOrIdx] : optionOrIdx;
		if (!option) return;

		const pos = localValue.indexOf(option);
		if (pos > -1) {
			localValue = localValue.filter((_, index) => index !== pos);
		} else {
			addUniqueTags([option]);
			return;
		}

		emitChange();
		fetchMoreIfNeeded();
	};

	const filterOptions = (term: string) => {
		searchTerm = term;
		newTag = term.trim() || null;

		if (suggestions) {
			const appliedFilter = term
				? [
						...(filter || []),
						{
							field: valueColumn,
							type: 'string',
							operator: 'fuzzy',
							value: term,
							valueType: 'Value'
						}
					]
				: filter || [];

			isFetchMore = false;
			fetch?.update({
				query: QueryUtils.buildQuery(appliedFilter)
			});
			filteredOptions = [...options];
			return;
		}

		if (term) {
			filteredOptions = options.filter((option) =>
				option.toLocaleLowerCase().startsWith(term.toLocaleLowerCase())
			);
		} else {
			filteredOptions = [...options];
		}
	};

	const fetchMore = () => {
		if ($fetch?.loading) return;
		if (($fetch?.rows?.length ?? 0) < initLimit) return;
		isFetchMore = true;
		initLimit += 100;
		fetch?.update({ limit: initLimit });
	};

	const fetchMoreIfNeeded = () => {
		const visibleOptions = filteredOptions.filter((option) => !localValue.includes(option));
		if (
			visibleOptions.length < 10 &&
			!$fetch?.loading &&
			($fetch?.rows?.length ?? 0) >= initLimit
		) {
			fetchMore();
		}
	};

	const handleScroll = (e: Event) => {
		const element = e.target as HTMLElement;
		if (element.scrollTop + element.clientHeight >= element.scrollHeight - 50) {
			fetchMore();
		}
	};

	const openPicker = () => {
		open = true;
		focusedOptionIdx = -1;
		setTimeout(() => {
			searchInput?.focus();
			filterOptions(searchTerm);
		}, 0);
	};

	const closePicker = () => {
		if (newTag?.trim() && filteredOptions.length === 0) {
			addUniqueTags(
				newTag
					.split(',')
					.map((tag) => tag.trim())
					.filter(Boolean)
			);
		}
		searchTerm = '';
		newTag = null;
		open = false;
	};

	const handleInputKeyboard = (e: KeyboardEvent) => {
		if (e.key === 'Enter') {
			if (newTag?.trim()) {
				addUniqueTags(
					newTag
						.split(',')
						.map((tag) => tag.trim())
						.filter(Boolean)
				);
				newTag = null;
				searchTerm = '';
				setTimeout(() => searchInput?.focus(), 0);
			}
			e.preventDefault();
			return;
		}

		if (e.key === ' ') {
			if (focusedOptionIdx > -1) {
				toggleOption(focusedOptionIdx);
				e.preventDefault();
			}
			return;
		}

		if (e.key === 'Tab') {
			anchor?.focus();
			closePicker();
			e.preventDefault();
			return;
		}

		if (e.key === 'Escape') {
			newTag = null;
			closePicker();
			anchor?.focus();
			e.preventDefault();
			e.stopPropagation();
			return;
		}

		if (e.key === 'ArrowDown') {
			focusedOptionIdx = Math.min(focusedOptionIdx + 1, filteredOptions.length - 1);
			if (focusedOptionIdx < 0) focusedOptionIdx = 0;
			e.stopPropagation();
		}

		if (e.key === 'ArrowUp') {
			focusedOptionIdx = Math.max(focusedOptionIdx - 1, 0);
			e.preventDefault();
			e.stopPropagation();
		}
	};

	const handleCellKeyboard = (e: KeyboardEvent) => {
		if ($csm !== 'editing') return;

		if (e.keyCode === 32) {
			if (focusedOptionIdx > -1) {
				toggleOption(focusedOptionIdx);
			} else if (!open) {
				openPicker();
				e.preventDefault();
			}
		}

		if (e.key === 'Escape') {
			if (open) {
				closePicker();
			} else {
				localValue = JSON.parse(originalValue);
				anchor?.blur();
				csm.goTo('view');
			}
		}

		if (e.key === 'Enter' || e.key === 'Tab') {
			if (focusedOptionIdx > -1 && filteredOptions[focusedOptionIdx]) {
				toggleOption(focusedOptionIdx);
			}
		}

		if (e.key === 'ArrowDown' && !open) {
			openPicker();
			focusedOptionIdx = 0;
		}

		if (e.key === 'ArrowUp' && open) {
			focusedOptionIdx = Math.max(focusedOptionIdx - 1, 0);
			e.preventDefault();
		}

		if (controlType === 'select' && e.key === 'Backspace' && !open) {
			localValue = [];
			emitChange();
		}
	};

	const csm = fsm('view', {
		'*': {
			goTo: (state: string) => state
		},
		view: {
			focus: () => {
				if (!readonly && !disabled) return 'editing';
			}
		},
		editing: {
			_enter: () => {
				originalValue = JSON.stringify(Array.isArray(value) ? value : value ? [value] : []);
				dispatch('enteredit');
			},
			_exit: () => {
				closePicker();
				dispatch('exitedit');
				if (isDirty) {
					emitChange(true);
				}
			},
			focusout: (e: FocusEvent) => {
				const target = e.relatedTarget as Node | null;
				if (
					anchor?.contains(target) ||
					editor?.contains(target) ||
					picker?.contains(target) ||
					searchInput?.contains(target as Node)
				) {
					return;
				}
				return 'view';
			},
			keydown: handleCellKeyboard
		},
		readonly: {},
		disabled: {},
		copyable: {
			click() {
				copyAndTransition(() => csm, getCopyText());
			},
			keydown(e: KeyboardEvent) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.click();
				}
			}
		},
		justCopied: deferJustCopied(() => csm)
	});

	$effect(() => {
		const nextValue = Array.isArray(value) ? [...value] : value ? [value] : [];
		localValue = nextValue;
		originalValue = JSON.stringify(nextValue);
	});

	$effect(() => {
		if (suggestions) {
			initLimit = 15;
			isInitialLoad = true;
			isFetchMore = false;
		}
	});

	$effect(() => {
		if (!suggestions || !datasource) return;

		untrack(() => {
			const query = QueryUtils.buildQuery(filter);
			fetch = fetchData({
				API,
				datasource,
				options: {
					query,
					limit: initLimit
				}
			});
		});
	});

	$effect(() => {
		const query = QueryUtils.buildQuery(filter);
		fetch?.update({ query, limit: initLimit });
	});

	$effect(() => {
		if (suggestions) {
			loadOptionsFromRows($fetch?.rows);
		}
	});

	$effect(() => {
		if (!suggestions && config.optionsSource === 'custom') {
			loadCustomOptions();
		}
	});

	$effect(() => {
		if (filteredOptions.length && suggestions && !$fetch?.loading) {
			setTimeout(() => fetchMoreIfNeeded(), 0);
		}
	});

	$effect(() => {
		if (disabled) {
			csm.goTo('disabled');
		} else if (readonly && copyable && !isEmpty) {
			csm.goTo('copyable');
		} else if (readonly) {
			csm.goTo('readonly');
		} else {
			csm.goTo('view');
		}

		tabindex = readonly || disabled ? -1 : 0;
	});

	$effect(() => {
		if (autofocus) {
			setTimeout(() => csm.focus(), 30);
		}

		return () => {
			if (timer) clearTimeout(timer);
		};
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore event_directive_deprecated -->
<BaseCell
	{id}
	bind:anchor
	{csm}
	{role}
	{error}
	{copyIcon}
	multirow={true}
	isDirty={isDirty && showDirty}
	popupOpen={open}
	{color}
	{background}
	{tabindex}
>
	<div class="value" class:placeholder={isEmpty && !inEdit}>
		{#if isEmpty && !inEdit}
			<span class="placeholder-text">{placeholder || 'Add some Tags'}</span>
		{/if}

		<div class="tags" style:justify-content={align ?? 'flex-start'}>
			{#each localValue as tag, idx (tag)}
				<div
					class="tag"
					style:--option-color={tagColors[tag] ||
						OPTIONS_COLORS_ARRAY[idx % OPTIONS_COLORS_ARRAY.length]}
				>
					<span class="tag-wrap">
						<span>{tag}</span>
					</span>
					{#if inEdit}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<i
							class="ph ph-x remove-icon"
							on:mousedown|preventDefault|stopPropagation={() => toggleOption(tag)}
						></i>
					{/if}
				</div>
			{/each}

			{#if inEdit}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<i
					class="ph ph-plus action-icon"
					on:mousedown|preventDefault|stopPropagation={() => (open ? closePicker() : openPicker())}
				></i>
			{/if}
		</div>
	</div>
</BaseCell>

{#if inEdit}
	<!-- svelte-ignore event_directive_deprecated -->
	<SuperPopover useAnchorWidth maxHeight={250} {anchor} {open} dismissible={false}>
		<div bind:this={editor} class="editor">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore event_directive_deprecated -->
			<div class="search-control" on:keydown={handleInputKeyboard}>
				<i
					class={suggestions ? 'ph ph-magnifying-glass' : 'ph ph-pencil-simple'}
					class:action-icon={true}
				></i>
				<input
					type="text"
					placeholder={suggestions ? 'Search or Add' : 'Enter tag...'}
					class="search-input"
					bind:value={searchTerm}
					bind:this={searchInput}
					on:input={(e) => filterOptions((e.target as HTMLInputElement).value)}
					on:focusout={csm.focusout}
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
					on:scroll={handleScroll}
					on:mousedown|preventDefault|stopPropagation
				>
					{#if $fetch?.loading && !$fetch?.rows?.length}
						<div class="option loading">
							<i class="ph ph-spinner spin"></i>
							Loading...
						</div>
					{:else if filteredOptions.length}
						{#each filteredOptions as option, idx (option)}
							{#if !localValue.includes(option)}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="option"
									class:text={optionsViewMode === 'text'}
									class:focused={focusedOptionIdx === idx}
									style:--option-color={tagColors[option]}
									on:mousedown|preventDefault={() => toggleOption(idx)}
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
	</SuperPopover>
{/if}

<style>
	.value {
		flex: 1 1 auto;
		min-width: 0;
		padding: 0.25rem 0.75rem;
		outline: none;
	}

	.value.placeholder .placeholder-text {
		color: var(--spectrum-global-color-gray-500);
		font-style: italic;
	}

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

	.tag:hover > .remove-icon {
		display: block;
		cursor: pointer;
	}

	.tag > span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.remove-icon {
		display: none;
		font-size: 12px;
		z-index: 2;
		cursor: pointer;
		transition: all 0.2s ease-in-out;
	}

	.search-control {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0rem 0.5rem;
	}

	.search-control:focus-within > .action-icon {
		color: var(--spectrum-global-color-blue-600);
		font-weight: 800;
	}

	.options {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		overflow-y: auto;
		max-height: 200px;
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

	.option:hover,
	.option.focused {
		background-color: var(--spectrum-global-color-gray-75);
		cursor: pointer;
	}

	.option.focused {
		color: var(--spectrum-global-color-gray-800);
	}

	.option.not-found,
	.option.loading {
		justify-content: center;
		color: var(--spectrum-global-color-gray-500);
		font-style: italic;
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

	.action-icon {
		display: flex;
		justify-content: center;
		align-items: center;
		font-size: 0.85rem;
		color: var(--spectrum-global-color-gray-600);
	}

	.action-icon:hover {
		cursor: pointer;
		color: var(--spectrum-global-color-blue-600);
		font-weight: 800;
	}

	.search-input {
		width: 100%;
		background: inherit;
		font: inherit;
		color: inherit;
		border: none;
		outline: none;
		padding: 0.5rem;
		box-sizing: border-box;
	}
</style>