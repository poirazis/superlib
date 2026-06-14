<script lang="ts">
	import { getContext, untrack, tick } from 'svelte';
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
	let popup = $state<HTMLElement | null>(null);
	let editor = $state<HTMLInputElement | null>(null);
	let listElement = $state<HTMLElement | null>(null);
	let options = $state<string[]>([]);
	let filteredOptions = $state<string[]>([]);
	let focusIdx = $state(-1);
	let timer = $state<ReturnType<typeof setTimeout>>();
	let searchTimer = $state<ReturnType<typeof setTimeout>>();
	let initLimit = $state(30);
	let isInitialLoad = $state(true);
	let isFetchMore = $state(false);
	let localValue = $state<string[]>([]);
	let filterTerm = $state('');
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

	let displayOptions = $derived(filteredOptions.filter((option) => !localValue.includes(option)));
	let popupOpen = $derived(
		suggestions &&
			inEdit &&
			filterTerm.trim().length > 0 &&
			(displayOptions.length > 0 || !!$fetch?.loading)
	);

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

	const clearInputState = () => {
		filterTerm = '';
		if (editor) editor.value = '';
		focusIdx = -1;
	};

	const commitInput = () => {
		const term = (editor?.value ?? filterTerm).trim();
		if (!term && focusIdx < 0) return;

		if (focusIdx > -1 && displayOptions[focusIdx]) {
			addUniqueTags([displayOptions[focusIdx]]);
		} else if (term) {
			addUniqueTags(
				term
					.split(',')
					.map((tag) => tag.trim())
					.filter(Boolean)
			);
		}

		clearInputState();
	};

	const loadOptionsFromRows = (rows: Record<string, unknown>[] | undefined) => {
		let next: string[];

		if (isFetchMore) {
			if (rows?.length) {
				next = rows.map((row) => String(row[valueColumn]));
				if (JSON.stringify(next) !== JSON.stringify(options)) {
					options = next;
					filteredOptions = [...next];
				}
			}
			isFetchMore = false;
		} else {
			next = rows?.length ? rows.map((row) => String(row[valueColumn])) : [];
			if (JSON.stringify(next) !== JSON.stringify(options)) {
				options = next;
				filteredOptions = [...next];
			}
		}

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

		const option = typeof optionOrIdx === 'number' ? displayOptions[optionOrIdx] : optionOrIdx;
		if (!option) return;

		const pos = localValue.indexOf(option);
		if (pos > -1) {
			localValue = localValue.filter((_, index) => index !== pos);
			emitChange();
		}
	};

	const selectSuggestion = (option: string) => {
		addUniqueTags([option]);
		clearInputState();
		setTimeout(() => editor?.focus(), 0);
	};

	const scheduleDataSearch = (term: string) => {
		if (!fetch || !suggestions) return;

		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
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
		}, debounceDelay || 250);
	};

	const filterOptions = (term: string) => {
		filterTerm = term;

		if (suggestions) {
			scheduleDataSearch(term);
			filteredOptions = [...options];
			focusIdx = term.trim() && displayOptions.length ? 0 : -1;
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

	const handleEditorInput = () => {
		const term = editor?.value ?? '';
		filterOptions(term);
	};

	const fetchMore = () => {
		if ($fetch?.loading) return;
		if (($fetch?.rows?.length ?? 0) < initLimit) return;
		isFetchMore = true;
		initLimit += 100;
		fetch?.update({ limit: initLimit });
	};

	const handleScroll = (e: Event) => {
		const element = e.target as HTMLElement;
		if (element.scrollTop + element.clientHeight >= element.scrollHeight - 50) {
			fetchMore();
		}
	};

	const scrollHighlightedIntoView = async () => {
		if (focusIdx < 0 || !listElement) return;
		await tick();
		const highlighted = listElement.querySelector('.option.highlighted');
		highlighted?.scrollIntoView({ block: 'nearest' });
	};

	const navigateOptions = (e: KeyboardEvent) => {
		const opts = displayOptions;

		if (e.key === 'ArrowDown') {
			if (!suggestions) return;
			e.preventDefault();
			if (!popupOpen) {
				const term = (editor?.value ?? filterTerm).trim();
				if (!term) return;
				focusIdx = opts.length ? 0 : -1;
				return;
			}
			focusIdx = Math.min(focusIdx + 1, opts.length - 1);
			if (focusIdx < 0 && opts.length) focusIdx = 0;
			scrollHighlightedIntoView();
			return;
		}

		if (e.key === 'ArrowUp') {
			if (!suggestions || !popupOpen) return;
			e.preventDefault();
			focusIdx = Math.max(focusIdx - 1, 0);
			scrollHighlightedIntoView();
			return;
		}

		if (e.key === 'Enter') {
			e.preventDefault();
			commitInput();
			setTimeout(() => editor?.focus(), 0);
			return;
		}

		if (e.key === 'Tab') {
			if (popupOpen) {
				focusIdx = -1;
			}
			return;
		}

		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			if (popupOpen) {
				focusIdx = -1;
				editor?.focus();
			} else {
				localValue = JSON.parse(originalValue);
				clearInputState();
				anchor?.blur();
				csm.goTo('view');
			}
			return;
		}

		if (e.key === 'Backspace' && !(editor?.value ?? filterTerm) && localValue.length) {
			localValue = localValue.slice(0, -1);
			emitChange();
		}

		if (controlType === 'select' && e.key === 'Backspace' && !(editor?.value ?? filterTerm) && !popupOpen) {
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
				setTimeout(() => editor?.focus(), 0);
			},
			_exit: () => {
				if ((editor?.value ?? filterTerm).trim()) {
					commitInput();
				}
				clearInputState();
				dispatch('exitedit');
				if (isDirty) {
					emitChange(true);
				}
			},
			focusout: (e: FocusEvent) => {
				const related = e.relatedTarget as Node | null;
				if (related === editor) return;
				if (popup?.contains(related)) return;
				return 'view';
			},
			popupFocusout: (e: FocusEvent) => {
				if (anchor?.contains(e.relatedTarget as Node)) return;
				return 'view';
			},
			popupKeydown(e: KeyboardEvent) {
				if (e.key === 'Tab') {
					e.preventDefault();
					editor?.focus();
					focusIdx = -1;
					return 'view';
				}
				navigateOptions(e);
			},
			keydown: navigateOptions
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
		if (!fetch) return;
		const query = QueryUtils.buildQuery(filter);
		fetch.update({ query, limit: initLimit });
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
		void displayOptions;
		focusIdx = Math.min(focusIdx, Math.max(displayOptions.length - 1, -1));
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
			if (searchTimer) clearTimeout(searchTimer);
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
	popupOpen={popupOpen}
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
				<!-- svelte-ignore event_directive_deprecated -->
				<input
					bind:this={editor}
					class="editor tag-input"
					type="text"
					{tabindex}
					placeholder={isEmpty ? placeholder || 'Add tag...' : ''}
					value={filterTerm}
					on:input={handleEditorInput}
					on:keydown={csm.keydown}
					on:focusout={csm.focusout}
				/>
			{/if}
		</div>
	</div>
</BaseCell>

{#if inEdit && suggestions && popupOpen}
	<!-- svelte-ignore event_directive_deprecated -->
	<SuperPopover useAnchorWidth maxHeight={250} {anchor} open={popupOpen} dismissible={false}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore event_directive_deprecated -->
		<div
			class="popup"
			bind:this={popup}
			on:focusout={csm.popupFocusout}
			on:keydown={csm.popupKeydown}
		>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore event_directive_deprecated -->
			<div
				class="options"
				bind:this={listElement}
				on:wheel={(e) => e.stopPropagation()}
				on:scroll={handleScroll}
				on:mousedown|preventDefault|stopPropagation
			>
				{#if $fetch?.loading && !displayOptions.length}
					<div class="option loading">
						<i class="ph ph-spinner spin"></i>
						Loading...
					</div>
				{:else if displayOptions.length}
					{#each displayOptions as option, idx (option)}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="option"
							class:text={optionsViewMode === 'text'}
							class:highlighted={focusIdx === idx}
							style:--option-color={tagColors[option]}
							on:mousedown|preventDefault={() => selectSuggestion(option)}
							on:mouseenter={() => (focusIdx = idx)}
						>
							<span>
								{#if optionsViewMode !== 'text'}
									<i class="ri-checkbox-blank-fill"></i>
								{/if}
								{option}
							</span>
						</div>
					{/each}
					{#if $fetch?.loading}
						<div class="option loading">
							<i class="ph ph-spinner spin"></i>
							Loading more...
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</SuperPopover>
{/if}

<style>
	.popup {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

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

	.tag-input {
		flex: 1 1 4rem;
		min-width: 4rem;
		width: auto;
		height: 1.5rem;
		padding: 0.125rem 0.25rem !important;
		font-size: 12px;
		background: transparent !important;
		text-transform: none;
		font-weight: normal;
	}

	.options {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		overflow-y: auto;
		max-height: 200px;
		color: var(--spectrum-global-color-gray-700);
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
	.option.highlighted {
		background-color: var(--spectrum-global-color-gray-75);
		cursor: pointer;
	}

	.option.highlighted {
		color: var(--spectrum-global-color-gray-800);
	}

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
</style>