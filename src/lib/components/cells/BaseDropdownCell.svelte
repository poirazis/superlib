<script lang="ts">
	import { getContext, untrack, tick } from 'svelte';
	import BaseCell from './BaseCell.svelte';
	import SuperPopover from '../SuperPopover/SuperPopover.svelte';
	import { tooltip } from '../../actions/tooltip';
	import { createEventDispatcher } from 'svelte';
	import fsm from 'svelte-fsm';
	import {
		consumeOpenOnEnter,
		copyAndTransition,
		deferJustCopied,
		emittedFieldValuesEqual,
		requestIconOpenOnEnter,
		requestOpenOnEnter,
		resolveCustomOptionColor,
		resolveEmptyViewText,
		resolveOptionColor,
		shouldShowCellViewChrome
	} from './helpers';
	import type { CellOption as Option } from './types';

	const SEARCH_DEBOUNCE_MS = 250; // independent from value-change debounce

	const { API, fetchData, QueryUtils, Provider, ContextScopes } = getContext('sdk');

	let {
		id,
		cellOptions = {},
		fieldSchema,
		value,
		multi: multiProp = false,
		autofocus = false,
		buttons = [],
		renderSlot = false,
		keepOpen = false,
		children
	} = $props();

	const dispatch = createEventDispatcher();

	let fetch = $state<ReturnType<typeof fetchData>>();

	let multi = $derived(fieldSchema?.type === 'array' ? true : multiProp);
	let inputSelect = $derived(cellOptions?.controlType === 'inputSelect');
	let disabled = $derived(cellOptions?.disabled);
	let readonly = $derived(cellOptions?.readonly);
	let copyable = $derived(cellOptions?.copyable);
	let copyIcon = $derived(cellOptions?.copyIcon ?? 'always');
	let role = $derived(cellOptions?.role ?? 'form');
	let error = $derived(cellOptions?.error);
	let icon = $derived(cellOptions?.icon);
	let filter = $derived(cellOptions?.filter);
	let optionsViewMode = $derived(cellOptions?.optionsViewMode ?? 'text');
	let source = $derived(cellOptions?.optionsSource ?? 'schema');
	let datasource = $derived(source === 'data' ? cellOptions?.datasource : null);
	let isDataSource = $derived(source === 'data' && !!datasource);
	let searchEnabled = $derived(cellOptions?.search ?? true);
	let serverSearch = $derived(isDataSource && searchEnabled);
	let limit = $derived(cellOptions?.limit ?? 15);
	let labelColumn = $derived(cellOptions?.labelColumn || cellOptions?.valueColumn);
	let valueColumn = $derived(cellOptions?.valueColumn);
	let sortColumn = $derived(cellOptions?.sortColumn);
	let sortOrder = $derived(cellOptions?.sortOrder);
	let debounceMs = $derived(cellOptions?.debounce ?? null);
	let showDirty = $derived(cellOptions?.showDirty);
	let pickerWidth = $derived(cellOptions?.pickerWidth);

	let _message = $state<string | null>(null);
	let filterTerm = $state('');
	let popupSearchTerm = $state('');
	let focusIdx = $state(-1);
	let listElement = $state<HTMLElement | null>(null);
	let popupSearchInput = $state<HTMLInputElement | null>(null);
	let searchTimer = $state<ReturnType<typeof setTimeout>>();
	let changeTimer = $state<ReturnType<typeof setTimeout>>();
	let currentLimit = $state(15);
	let isInitialLoad = $state(true);

	let anchor = $state<HTMLElement | null>(null);
	let editor = $state<HTMLInputElement | null>(null);

	let open = $state(false);
	let localValue = $state<Option[]>([]);

	let isEmpty = $derived(localValue?.length < 1);
	let pills = $derived(optionsViewMode === 'pills');
	let bullets = $derived(optionsViewMode === 'bullets');
	let plaintext = $derived(optionsViewMode === 'text');

	let tabindex = $state(0);

	const emitChange = () => {
		dispatch('change', getEmittedValue());
		dispatch('labelChange', getEmittedLabel());
	};

	const clearSearchState = () => {
		popupSearchTerm = '';
		filterTerm = '';
		focusIdx = -1;
	};

	let allOptions: Option[] = $derived.by(() => {
		if (source == 'schema') {
			const inclusion = fieldSchema?.constraints?.inclusion || [];
			return inclusion?.map((opt) => ({
				label: opt,
				value: opt,
				color: resolveOptionColor(opt, fieldSchema)
			}));
		} else if (source === 'custom') {
			return (
				cellOptions.customOptions?.map((opt) => ({
					label: opt.label,
					value: opt.value,
					color: resolveCustomOptionColor(opt.value, fieldSchema, cellOptions.customOptions),
					icon: opt.icon
				})) ?? []
			);
		} else if (isDataSource) {
			return (
				$fetch?.rows?.map((row) => ({
					label: row[labelColumn],
					value: row[valueColumn],
					row: row,
					color: cellOptions.colorColumn ? row[cellOptions.colorColumn] : undefined,
					icon: cellOptions.iconColumn ? row[cellOptions.iconColumn] : undefined
				})) ?? []
			);
		}

		return [];
	});

	let activeSearchTerm = $derived(
		inputSelect ? filterTerm || editor?.value || '' : popupSearchTerm
	);

	let displayOptions: Option[] = $derived.by(() => {
		const base = allOptions ?? [];
		if (!searchEnabled) return base;

		const term = activeSearchTerm.trim();

		if (!term) {
			return base;
		}

		if (isDataSource && serverSearch) {
			return base;
		}

		const lower = term.toLowerCase();
		return base.filter((option) =>
			String(option.label ?? option.value)
				.toLowerCase()
				.includes(lower)
		);
	});

	function resolveToOptions(raw: any): Option[] {
		const items = Array.isArray(raw) ? raw : raw != null && raw !== '' ? [raw] : [];

		return items
			.map((item) => {
				if (item && typeof item === 'object' && 'value' in item) {
					const matched = allOptions?.find((option) => option.value === item.value);
					return (
						matched ?? {
							label: item.label ?? String(item.value),
							value: item.value,
							color: item.color
						}
					);
				}

				const matched = allOptions?.find((option) => option.value === item);
				if (matched) return matched;

				if (inputSelect) {
					return { label: String(item), value: item };
				}

				return null;
			})
			.filter((item): item is Option => item != null);
	}

	function getEmittedValue() {
		if (multi) {
			return localValue.map((option) => option.value);
		}

		return localValue[0]?.value ?? null;
	}

	function getEmittedLabel() {
		if (multi) {
			return localValue.map((option) => option.label);
		}

		return localValue[0]?.label ?? null;
	}

	function isSelected(option: Option) {
		return localValue.some((selected) => selected.value === option.value);
	}

	const buildDataQuery = (term: string) => {
		const baseFilter = filter ?? [];

		if (!term) {
			return QueryUtils.buildQuery(baseFilter);
		}

		return QueryUtils.buildQuery([
			...baseFilter,
			{
				field: labelColumn,
				type: 'string',
				operator: 'fuzzy',
				value: term,
				valueType: 'Value'
			}
		]);
	};

	const scheduleDataSearch = (term: string) => {
		if (!fetch || !isDataSource || !searchEnabled) return;

		clearTimeout(searchTimer);
		const delay = SEARCH_DEBOUNCE_MS;

		searchTimer = setTimeout(() => {
			currentLimit = limit;
			fetch?.update({
				query: buildDataQuery(term),
				limit: currentLimit,
				sortColumn,
				sortOrder
			});
		}, delay);
	};

	const fetchMore = () => {
		if ($fetch?.loading) return;
		if (($fetch?.rows?.length ?? 0) < currentLimit) return;
		currentLimit += 100;
		fetch?.update({
			query: buildDataQuery(activeSearchTerm),
			limit: currentLimit,
			sortColumn,
			sortOrder
		});
	};

	const handleScroll = (e: Event) => {
		if (!isDataSource) return;
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

	const handlePopupSearch = (e: Event) => {
		if (!searchEnabled) return;
		popupSearchTerm = (e.target as HTMLInputElement).value;
		focusIdx = popupSearchTerm && displayOptions.length ? 0 : -1;
		if (isDataSource) {
			scheduleDataSearch(popupSearchTerm);
		}
	};

	const navigateOptions = (e: KeyboardEvent) => {
		const opts = displayOptions;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (!open) {
				open = true;
				focusIdx = opts.length ? 0 : -1;
				return;
			}
			focusIdx = Math.min(focusIdx + 1, opts.length - 1);
			if (focusIdx < 0 && opts.length) focusIdx = 0;
			scrollHighlightedIntoView();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			focusIdx = Math.max(focusIdx - 1, 0);
			scrollHighlightedIntoView();
		} else if (e.key === 'Enter' && focusIdx > -1 && opts[focusIdx]) {
			e.preventDefault();
			csm.selectOption(opts[focusIdx].value);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			if (open) {
				open = false;
				clearSearchState();
				anchor?.focus();
			} else {
				csm.cancel();
			}
		}
	};

	let csm = fsm('view', {
		'*': {
			goTo: (state) => state
		},
		view: {
			focus: () => {
				requestOpenOnEnter();
				return 'editing';
			},
			toggle: () => {
				requestIconOpenOnEnter();
				return 'editing';
			},
			keydown(e: KeyboardEvent) {
				if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
					requestOpenOnEnter();
					navigateOptions(e);
					return 'editing';
				}
			}
		},
		editing: {
			_enter: () => {
				if (allOptions.length === 0 && !inputSelect && !isDataSource) {
					_message = 'No options available';
					setTimeout(() => {
						_message = null;
					}, 1000);
					return 'view';
				}
				localValue = resolveToOptions(value);
				open = consumeOpenOnEnter();
				focusIdx = -1;
				dispatch('enteredit');
			},
			_exit: () => {
				open = false;
				clearSearchState();
				dispatch('exitedit');
			},
			change() {
				if (debounceMs) {
					clearTimeout(changeTimer);
					changeTimer = setTimeout(() => emitChange(), debounceMs);
				}
			},
			submit() {
				if (isDirty && !debounceMs) {
					emitChange();
				}
			},
			cancel() {
				clearTimeout(changeTimer);
				localValue = resolveToOptions(value);
				open = false;
				clearSearchState();
				dispatch('cancel');
				anchor?.focus();
				return 'view';
			},
			inputChange() {
				const term = editor?.value ?? '';
				filterTerm = searchEnabled ? term : '';
				open = true;
				focusIdx = searchEnabled && term && displayOptions.length ? 0 : -1;

				if (searchEnabled && isDataSource) {
					scheduleDataSearch(term);
				}

				localValue = term
					? [
							{
								value: term,
								label: term
							}
						]
					: [];

				this.change();
			},
			toggle: () => {
				open = !open;
				if (open) {
					focusIdx = -1;
				}
			},
			click() {
				this.toggle();
			},
			selectOption: (newValue: string) => {
				const option =
					displayOptions.find((item) => item.value === newValue) ??
					allOptions.find((item) => item.value === newValue);
				if (!option) return;

				const pos = localValue.findIndex((item) => item.value === newValue);

				if (multi) {
					if (pos > -1) {
						localValue = localValue.filter((_, index) => index !== pos);
					} else {
						localValue = [...localValue, option];
					}
					this.change();
					return;
				}

				if (pos > -1) {
					localValue = [];
				} else {
					localValue = [option];
					if (inputSelect && editor) {
						editor.value = String(option.label ?? option.value);
						filterTerm = editor.value;
					}
				}

				csm.change();

				open = false;
				clearSearchState();
				anchor?.focus();
			},
			focusout: (e: FocusEvent) => {
				const related = e.relatedTarget as Node | null;
				if (related) {
					if (related == editor || related == popupSearchInput) {
						return;
					}
				}

				if (debounceMs && isDirty) {
					clearTimeout(changeTimer);
					emitChange();
				} else {
					csm.submit();
				}
				return 'view';
			},
			popupFocusout: (e: FocusEvent) => {
				if (e.relatedTarget === anchor) {
					return;
				}
				csm.submit();
				return 'view';
			},
			keydown(e: KeyboardEvent) {
				navigateOptions(e);
			},
			popupKeydown(e: KeyboardEvent) {
				if (e.key === 'Tab') {
					anchor?.focus();
					return 'view';
				}
				navigateOptions(e);
			}
		},
		readonly: {},
		disabled: {},
		copyable: {
			copy() {
				const copyValue = Array.isArray(value)
					? value.join(', ')
					: value != null
						? String(value)
						: '';

				copyAndTransition(() => csm, copyValue);
			},
			keydown(e: KeyboardEvent) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.copy();
				}
			}
		},
		justCopied: deferJustCopied(() => csm)
	});

	let dirty = $derived(cellOptions?.dirty);
	let inEdit = $derived($csm === 'editing');
	let isDirty = $derived(inEdit && !emittedFieldValuesEqual(getEmittedValue(), value));
	let emptyViewText = $derived(_message || cellOptions?.placeholder || 'Select...');

	$effect(() => {
		return () => clearTimeout(changeTimer);
	});

	$effect(() => {
		void value;
		void allOptions;
		if (!inEdit) {
			localValue = resolveToOptions(value);
		}
	});

	$effect(() => {
		void datasource;
		void filter;
		void limit;
		if (!isDataSource) return;

		untrack(() => {
			currentLimit = limit;
			isInitialLoad = true;
			fetch = fetchData({
				API,
				datasource,
				options: {
					query: QueryUtils.buildQuery(filter ?? []),
					limit: currentLimit,
					sortColumn,
					sortOrder
				}
			});
		});
	});

	$effect(() => {
		if ($fetch?.loaded) {
			isInitialLoad = false;
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
			setTimeout(() => {
				csm.focus();
			}, 50);
		}
	});

	const focus = (node: HTMLElement) => {
		node?.focus();
	};
</script>

<!-- svelte-ignore a11y_interactive_supports_focus -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore event_directive_deprecated -->
<BaseCell
	{id}
	bind:anchor
	{csm}
	{role}
	{error}
	{icon}
	controlIcon={'ph ph-caret-down'}
	isDirty={dirty && showDirty}
	popupOpen={open}
	{copyIcon}
	align={cellOptions?.align}
	{buttons}
>
	{#key $csm}
		{#if $csm !== 'editing' || !inputSelect}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="value-contents"
				class:placeholder={isEmpty && shouldShowCellViewChrome(role, inEdit)}
				use:tooltip
			>
				<div class="value">
					{#key localValue}
						{#if isEmpty}
							{resolveEmptyViewText(emptyViewText, role, inEdit)}
						{:else}
							<div class="items" class:pills class:bullets>
								{#if plaintext}
									{#each localValue as val, idx (val.value)}
										{val.label}{idx < localValue.length - 1 ? ', ' : ''}
									{/each}
								{:else}
									{#each localValue as val (val.value)}
										<div class="item" style:--option-color={val.color}>
											<div class="loope"></div>
											<span>{val.label}</span>
										</div>
									{/each}
								{/if}
							</div>
						{/if}
					{/key}
				</div>
			</div>
		{:else}
			<input
				bind:this={editor}
				class="editor"
				{tabindex}
				class:placeholder={isEmpty}
				value={_message || localValue[0]?.value}
				placeholder={cellOptions?.placeholder}
				style:text-align={cellOptions.align}
				on:input={csm.inputChange}
				on:focusout={csm.focusout}
				on:keydown={csm.keydown}
				use:focus
			/>
		{/if}
	{/key}
</BaseCell>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore event_directive_deprecated -->
{#if $csm == 'editing'}
	<SuperPopover
		{anchor}
		open={open || keepOpen}
		useAnchorWidth={true}
		dismissible={false}
		minWidth={pickerWidth}
		align={cellOptions?.pickerAlign ?? 'left'}
	>
		{#snippet renderOption(option: Option, idx: number, selected: boolean = isSelected(option))}
			<div
				class="option"
				class:selected
				class:highlighted={focusIdx === idx}
				on:mouseenter={() => (focusIdx = idx)}
				on:mousedown|preventDefault={() => csm.selectOption(option.value)}
			>
				{#if renderSlot}
					<Provider
						data={{ value: option.value, label: option.label, row: option.row }}
						scope={ContextScopes.Local}
					>
						{@render children?.()}
					</Provider>
				{:else}
					{#if option?.icon}
						<span class="icon">{option.icon}</span>
					{/if}
					<span class="label" use:tooltip>{option?.label}</span>
					{#if selected}
						<span class="ph ph-check"></span>
					{/if}
				{/if}
			</div>
		{/snippet}

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore event_directive_deprecated -->
		<div class="popup" on:focusout={csm.popupFocusout} on:keydown={csm.popupKeydown}>
			{#if searchEnabled && !inputSelect}
				<div class="popup-search">
					<i class="ph ph-magnifying-glass"></i>
					<input
						bind:this={popupSearchInput}
						class="search"
						class:placeholder={!popupSearchTerm}
						type="text"
						placeholder={'Search...'}
						value={popupSearchTerm}
						use:focus
						on:input={handlePopupSearch}
					/>
					{#if popupSearchTerm}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<i
							class="ph ph-x clear-icon"
							on:mousedown|preventDefault|stopPropagation={() => (popupSearchTerm = '')}
						></i>
					{/if}
				</div>
			{/if}

			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore event_directive_deprecated -->
			<div
				class="options"
				bind:this={listElement}
				on:scroll={handleScroll}
				on:mousedown|preventDefault={() => {}}
			>
				{#if displayOptions.length === 0}
					<div class="option disabled">
						{#if isDataSource && $fetch?.loading}
							<i class="ph ph-spinner spin"></i>
							Loading...
						{:else}
							No options available
						{/if}
					</div>
				{:else}
					{#each displayOptions as option, idx (option.value)}
						{@render renderOption(option, idx)}
					{/each}
					{#if isDataSource && $fetch?.loading && $fetch.loaded}
						<div class="option disabled loading">
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
		min-width: 0;
	}

	.popup-search {
		height: 2rem;
		border-bottom: 1px solid var(--spectrum-global-color-gray-300);
		display: flex;
		align-items: center;
		gap: 0.25rem;
		flex-shrink: 0;
		min-width: 0;
		padding: 0rem 0.25rem 0rem 0.75rem;
	}

	.popup-search > i {
		color: var(--spectrum-global-color-gray-600);
	}

	.clear-icon {
		cursor: pointer;
		padding: 0.25rem;
		border-radius: 4px;
		color: var(--spectrum-global-color-red-400);
	}
	.clear-icon:hover {
		background-color: var(--spectrum-global-color-gray-100);
		color: var(--spectrum-global-color-red-700);
	}

	.popup-search > input {
		flex: 1;
		min-width: 0;
		height: 100%;
		max-width: 100%;
		outline: none;
		background: none;
		border: none;
		color: inherit;
		padding-left: 0.5rem;
		font-family: inherit;
		font-size: inherit;
	}

	.popup-search > input.placeholder {
		font-style: italic;
		color: var(--spectrum-global-color-gray-600);
	}

	.options {
		display: flex;
		flex-direction: column;
		height: auto;
		max-height: 300px;
		overflow-y: auto;
		overflow-x: hidden;
	}

	.option {
		padding: 0.5em 1em;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.5em;
		min-width: 0;
	}

	.option.disabled {
		color: var(--spectrum-global-color-gray-500);
		cursor: not-allowed;
		gap: 0.5rem;
	}

	.option.loading {
		font-style: italic;
		justify-content: center;
	}

	.option:hover,
	.option.highlighted {
		background-color: var(--spectrum-global-color-gray-100);
	}

	.option.selected {
		font-weight: 500;
	}

	.label {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.value-contents {
		min-width: 0;
		max-width: 100%;
		flex: 1 1 auto;
		display: flex;
		align-items: center;
		padding: var(--super-cell-padding);
	}

	.value {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.value-contents.placeholder {
		color: var(--spectrum-global-color-gray-500);
		font-style: italic !important;
	}

	.items {
		flex: auto;
		display: flex;
		overflow: hidden;
		align-items: stretch;
		gap: 0.5rem;
		min-width: 0;
	}

	.item {
		display: flex;
		align-items: center;
		overflow: hidden;
		min-width: 0;
		gap: 0.5rem;
		padding: 0rem 0.5rem;
	}

	.item span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.item .loope {
		display: none;
	}

	.items.pills .item {
		background-color: var(--option-color, var(--spectrum-global-color-gray-100));
		border: 1px solid var(--option-color, var(--spectrum-global-color-gray-200));
		border-radius: 4px;
		align-self: stretch;
		padding: 0.25rem 0.5rem;
		font-size: 12px;
	}

	.items.bullets .item {
		padding: unset;
	}

	.items.bullets .item .loope {
		display: block;
	}

	.loope {
		width: 16px;
		height: 16px;
		border-radius: 1rem;
		background-color: var(--option-color, var(--spectrum-global-color-gray-300));
		flex-shrink: 0;
	}

	:global(.spin) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
