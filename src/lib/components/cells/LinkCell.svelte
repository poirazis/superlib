<script lang="ts">
	import { getContext, untrack, tick } from 'svelte';
	import { createEventDispatcher } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import SuperPopover from '../SuperPopover/SuperPopover.svelte';
	import { tooltip } from '../../actions/tooltip';
	import {
		buildFuzzyDataQuery,
		clampFocusIdx,
		PICKER_FETCH_MORE_INCREMENT,
		PICKER_SEARCH_DEBOUNCE_MS,
		schedulePickerFetchUpdate,
		shouldFetchMore
	} from './dropdownPickerHelpers';
	import {
		consumeOpenOnEnter,
		copyAndTransition,
		deferJustCopied,
		isTableCellRole,
		linkSelectionEqual,
		requestIconOpenOnEnter,
		requestOpenOnEnter,
		resolveEmptyViewText,
		resolveLinkRowDisplay,
		shouldShowCellViewChrome
	} from './helpers';
	import type { LinkItem } from './types';

	const dispatch = createEventDispatcher();
	const { API, fetchData, QueryUtils, Provider, ContextScopes } = getContext('sdk');

	let {
		id,
		value,
		fieldSchema,
		cellOptions,
		filter: filterProp = [],
		isUserSelect = false,
		autofocus = false,
		buttons = [],
		renderSlot = false,
		keepOpen = false,
		children
	} = $props();

	let anchor = $state<HTMLElement | null>(null);
	let popup = $state<HTMLElement | null>(null);
	let popupSearchInput = $state<HTMLInputElement | null>(null);
	let popupSearchTerm = $state('');
	let pickerFetch = $state<ReturnType<typeof fetchData> | undefined>();
	let pickerCurrentLimit = $state(15);
	let pickerSearchTimer = $state<ReturnType<typeof setTimeout>>();
	let changeTimer = $state<ReturnType<typeof setTimeout>>();
	let focusIdx = $state(-1);
	let open = $state(false);
	let localValue = $state<LinkItem[]>([]);
	let loadingMissing = $state(false);

	let config = $derived(cellOptions ?? {});
	let filter = $derived(filterProp?.length ? filterProp : (config.filter ?? []));
	let multi = $derived(!fieldSchema?.type?.includes('_single'));
	let isUser = $derived(fieldSchema?.type?.includes('bb_reference') || isUserSelect);
	let pills = $derived(config.relViewMode === 'pills');
	let links = $derived(config.relViewMode === 'links' && !isUser);
	let valueIcon = $derived(fieldSchema?.type === 'link' ? 'ri-edit-box-line' : 'ri-user-line');
	let plaintext = $derived(config.relViewMode === 'text' || !config.relViewMode);
	let multirow = $derived(
		config.controlType === 'expanded' && ((localValue?.length ?? 0) > 1 || $csm === 'editing')
	);
	let singleSelect = $derived(!multi || fieldSchema?.relationshipType === 'one-to-many');
	let placeholder = $derived(config.placeholder || '');
	let disabled = $derived(config.disabled);
	let readonly = $derived(config.readonly);
	let copyable = $derived(config.copyable);
	let copyIcon = $derived(config.copyIcon ?? 'always');
	let role = $derived(config.role ?? 'form');
	let isTableCell = $derived(isTableCellRole(role));
	let inEdit = $derived($csm === 'editing');
	let error = $derived(config.error);
	let icon = $derived(config.icon);
	let showDirty = $derived(config.showDirty);
	let debounceMs = $derived(config.debounce ?? null);
	let isDirty = $derived(inEdit && !linkSelectionEqual(getEmittedValue(), value));
	let tableId = $derived(fieldSchema?.tableId);
	let isEmpty = $derived((localValue?.length ?? 0) < 1);
	let dirty = $derived(config.dirty);
	let tabindex = $state(0);
	let pickerWidth = $derived(config.pickerWidth);
	let searchEnabled = $derived(config.search ?? true);
	let pickerInitLimit = 15;
	let listElement = $state<HTMLElement | null>(null);

	let primaryDisplayField = $derived(
		isUser ? 'email' : $pickerFetch?.definition?.primaryDisplay || '_id'
	);

	let pickerRows = $derived.by(() => $pickerFetch?.rows ?? []);
	let pickerLoading = $derived.by(() => $pickerFetch?.loading ?? false);
	let pickerLoaded = $derived.by(() => $pickerFetch?.loaded ?? false);
	let pickerHasMore = $derived.by(() => pickerRows.length >= pickerCurrentLimit);

	let canFetchPicker = $derived(isUser || !!tableId);
	let writable = $derived(!disabled && !readonly);

	const toRelationshipItem = (item: LinkItem): LinkItem => ({
		_id: item._id,
		primaryDisplay: item.primaryDisplay
	});

	const createPickerFetch = () => {
		if (!canFetchPicker || !writable) return;

		pickerCurrentLimit = pickerInitLimit;
		pickerFetch = fetchData({
			API,
			datasource: getPickerDatasource(),
			options: {
				...(isUser ? {} : { query: buildPickerQuery('') }),
				limit: pickerInitLimit
			}
		});
	};

	const destroyPickerFetch = () => {
		pickerFetch = undefined;
		clearTimeout(pickerSearchTimer);
	};

	const parseLinkItem = (
		item: unknown,
		primaryDisplay: string | undefined = undefined
	): LinkItem | null => {
		if (!item) return null;

		if (typeof item === 'string') {
			return { _id: item, primaryDisplay: item };
		}

		if (typeof item !== 'object') return null;

		const row = item as Record<string, unknown>;
		const rowId = (row._id ?? row.id) as string | undefined;
		if (!rowId) return null;

		return {
			_id: String(rowId),
			primaryDisplay: resolveLinkRowDisplay(row, primaryDisplay || primaryDisplayField)
		};
	};

	const toLocalValue = (raw: unknown): LinkItem[] => {
		if (raw == null || raw === '') return [];

		if (multi) {
			return Array.isArray(raw)
				? raw
						.map((item) => parseLinkItem(item, primaryDisplayField))
						.filter((item): item is LinkItem => !!item)
				: [];
		}

		const item = parseLinkItem(raw, primaryDisplayField);
		return item ? [item] : [];
	};

	const getEmittedValue = (): LinkItem | LinkItem[] | null => {
		const items = localValue.map(toRelationshipItem);
		if (multi) return items;
		return items[0] ?? null;
	};

	const getCopyText = () => localValue.map((item) => item.primaryDisplay).join(', ');

	const getPickerDatasource = () => {
		if (isUser) {
			return { type: 'user' as const };
		}
		return { type: 'table' as const, tableId: tableId! };
	};

	const buildUserPickerQuery = (term: string) => {
		if (!term) return {};
		return { fuzzy: { email: term } };
	};

	const loadMissingOptions = async (
		items: LinkItem[],
		linkedTableId: string | undefined = undefined
	) => {
		if (!writable) return;

		const missingIds = items
			.filter((item) => item.primaryDisplay === item._id || !item.primaryDisplay)
			.map((item) => item._id);

		if (!missingIds.length || loadingMissing) return;

		loadingMissing = true;
		try {
			const enriched = new Map(localValue.map((item) => [item._id, item]));

			if (isUser) {
				const res = await API.searchUsers({
					query: {
						oneOf: {
							_id: missingIds
						}
					},
					limit: missingIds.length
				});

				for (const row of res?.data ?? []) {
					const option = parseLinkItem(row);
					if (option) enriched.set(option._id, option);
				}
			} else {
				if (!linkedTableId) return;

				const res = await API.searchTable(linkedTableId, {
					query: {
						oneOf: {
							_id: missingIds
						}
					}
				});

				for (const row of res.rows ?? []) {
					const option = parseLinkItem(row);
					if (option) enriched.set(option._id, option);
				}
			}

			for (const id of missingIds) {
				if (!enriched.has(id)) {
					enriched.set(id, { _id: id, primaryDisplay: id });
				}
			}

			localValue = items.map((item) => enriched.get(item._id) ?? item);
		} catch (err) {
			console.error('Error loading missing relationship rows', err);
		} finally {
			loadingMissing = false;
		}
	};

	const csm = fsm('view', {
		'*': {
			goTo: (state: string) => state,
			copy() {},
			click() {},
			toggle() {}
		},
		view: {
			focus: () => {
				if (!readonly && !disabled) {
					requestOpenOnEnter();
					return 'editing';
				}
			},
			toggle: () => {
				if (!readonly && !disabled) {
					requestIconOpenOnEnter();
					return 'editing';
				}
			}
		},
		editing: {
			_enter: () => {
				localValue = toLocalValue(value);
				open = keepOpen ? true : consumeOpenOnEnter();
				focusIdx = -1;
				createPickerFetch();
				dispatch('enteredit');
				if (!keepOpen && searchEnabled) {
					setTimeout(() => popupSearchInput?.focus(), 0);
				}
			},
			_exit: () => {
				open = false;
				popupSearchTerm = '';
				focusIdx = -1;
				destroyPickerFetch();
				dispatch('exitedit');
			},
			change() {
				if (debounceMs) {
					clearTimeout(changeTimer);
					changeTimer = setTimeout(() => {
						dispatch('change', getEmittedValue());
					}, debounceMs);
				}
			},
			submit() {
				if (isDirty && !debounceMs) {
					dispatch('change', getEmittedValue());
				}
			},
			cancel() {
				clearTimeout(changeTimer);
				localValue = toLocalValue(value);
				open = false;
				dispatch('cancel');
				anchor?.focus();
				return 'view';
			},
			toggle: () => {
				open = !open;
			},
			click() {
				this.toggle();
			},
			keydown: (e: KeyboardEvent) => {
				if (e.key === ' ' || e.keyCode === 32) {
					e.preventDefault();
					this.toggle();
				} else if (e.key === 'Escape') {
					e.preventDefault();
					if (open) {
						open = false;
						anchor?.focus();
					} else {
						return this.cancel();
					}
				} else if (open) {
					if (searchEnabled) {
						popupSearchInput?.focus();
					} else {
						navigatePickerOptions(e);
					}
				}
			},
			focusout: (e: FocusEvent) => {
				if (keepOpen) return;

				const related = e.relatedTarget as Node | null;
				if (popup?.contains(related)) return;

				if (debounceMs && isDirty) {
					clearTimeout(changeTimer);
					dispatch('change', getEmittedValue());
				} else {
					csm.submit();
				}

				return 'view';
			},
			popupFocusout: (e: FocusEvent) => {
				if (keepOpen) return;
				if (e.relatedTarget === anchor) return;
				csm.submit();
				return 'view';
			},
			popupKeydown(e: KeyboardEvent) {
				if (e.key === 'Tab') {
					anchor?.focus();
					return 'view';
				}
				navigatePickerOptions(e);
			},
			selectChange: (nextValue: LinkItem[]) => {
				localValue = nextValue;

				if (!singleSelect) {
					csm.change();
					return;
				}

				csm.change();
				if (keepOpen) return;
				open = false;
				popupSearchTerm = '';
				focusIdx = -1;
				anchor?.focus();
			}
		},
		readonly: {},
		disabled: {},
		copyable: {
			copy() {
				copyAndTransition(() => csm, getCopyText());
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

	const buildPickerQuery = (term: string) => {
		if (isUser) {
			return buildUserPickerQuery(term);
		}

		if (!primaryDisplayField || !term) {
			return QueryUtils.buildQuery(filter);
		}

		return buildFuzzyDataQuery(QueryUtils, filter, primaryDisplayField, term);
	};

	const schedulePickerSearch = (term: string) => {
		if (!searchEnabled) return;
		schedulePickerFetchUpdate({
			fetch: pickerFetch,
			timer: pickerSearchTimer,
			setTimer: (timer) => {
				pickerSearchTimer = timer;
			},
			query: buildPickerQuery(term),
			limit: pickerInitLimit,
			debounceMs: PICKER_SEARCH_DEBOUNCE_MS,
			onScheduled: () => {
				pickerCurrentLimit = pickerInitLimit;
			}
		});
	};

	const fetchMorePickerRows = () => {
		if ($pickerFetch?.loading) return;
		if (($pickerFetch?.rows?.length ?? 0) < pickerCurrentLimit) return;

		pickerCurrentLimit += PICKER_FETCH_MORE_INCREMENT;
		pickerFetch?.update({
			query: buildPickerQuery(searchEnabled ? popupSearchTerm : ''),
			limit: pickerCurrentLimit
		});
	};

	const rowSelected = (row: Record<string, unknown>) => {
		const rowId = row._id ?? row.id;
		return localValue.some((item) => item._id == rowId);
	};

	const handlePickerScroll = (e: Event) => {
		const element = e.target as HTMLElement;
		if (shouldFetchMore(element, pickerLoading, pickerHasMore)) {
			fetchMorePickerRows();
		}
	};

	const selectPickerRow = (row: Record<string, unknown>) => {
		const rowId = row._id ?? row.id;
		const item: LinkItem = {
			_id: String(rowId),
			primaryDisplay: resolveLinkRowDisplay(row, primaryDisplayField)
		};

		let nextValue: LinkItem[];
		if (singleSelect) {
			nextValue = localValue[0]?._id == rowId ? [] : [item];
		} else {
			const pos = localValue.findIndex((v) => v._id == rowId);
			nextValue = pos > -1 ? localValue.filter((_, i) => i !== pos) : [...localValue, item];
		}

		csm.selectChange(nextValue);
	};

	const scrollHighlightedIntoView = async () => {
		if (focusIdx < 0 || !popup) return;
		await tick();
		const highlighted = popup.querySelector('.option.highlighted');
		highlighted?.scrollIntoView({ block: 'nearest' });
	};

	const navigatePickerOptions = (e: KeyboardEvent) => {
		const rows = pickerRows;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			focusIdx = clampFocusIdx(focusIdx + 1, rows.length);
			if (focusIdx < 0 && rows.length) focusIdx = 0;
			scrollHighlightedIntoView();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			focusIdx = clampFocusIdx(focusIdx - 1, rows.length);
			scrollHighlightedIntoView();
		} else if (e.key === 'Enter' && focusIdx > -1 && rows[focusIdx]) {
			e.preventDefault();
			selectPickerRow(rows[focusIdx]);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			open = false;
			anchor?.focus();
		}
	};

	const handlePopupSearch = (e: Event) => {
		popupSearchTerm = (e.target as HTMLInputElement).value;
		focusIdx = popupSearchTerm && pickerRows.length ? 0 : -1;
		schedulePickerSearch(popupSearchTerm);
	};

	const clearPopupSearch = () => {
		popupSearchTerm = '';
		focusIdx = -1;
		schedulePickerSearch('');
	};

	$effect(() => {
		focusIdx = clampFocusIdx(focusIdx, pickerRows.length);
	});

	$effect(() => {
		if (!pickerLoaded || pickerLoading || !pickerHasMore || !listElement) return;
		if (pickerRows.length === 0) return;

		void pickerRows.length;
		tick().then(() => {
			if (!listElement || pickerLoading || !pickerHasMore) return;
			if (listElement.scrollHeight <= listElement.clientHeight) {
				fetchMorePickerRows();
			}
		});
	});

	$effect(() => {
		const raw = value;
		const linkedTableId = tableId;

		if (inEdit) return;

		untrack(async () => {
			localValue = toLocalValue(raw);

			if (!isTableCell && writable) {
				await loadMissingOptions(localValue, linkedTableId);
			}
		});
	});

	$effect(() => {
		if (disabled) {
			csm.goTo('disabled');
		} else if (readonly && copyable && !isEmpty) {
			csm.goTo('copyable');
		} else if (readonly) {
			csm.goTo('readonly');
		} else if (keepOpen) {
			if ($csm !== 'editing') {
				csm.goTo('editing');
			}
			open = true;
		} else {
			csm.goTo('view');
		}

		tabindex = readonly || disabled ? -1 : 0;
	});

	$effect(() => {
		if (autofocus) {
			setTimeout(() => csm.focus(), 50);
		}
	});

	$effect(() => {
		return () => clearTimeout(changeTimer);
	});
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
	{multirow}
	isDirty={dirty && showDirty}
	popupOpen={open || keepOpen}
	controlIcon={'ph ph-caret-down'}
	{copyIcon}
	{tabindex}
	{buttons}
>
	{#key $csm}
		<div
			class="value-contents"
			class:placeholder={isEmpty && shouldShowCellViewChrome(role, inEdit)}
			use:tooltip
		>
			<div class="value">
				{#key localValue}
					{#if isEmpty}
						{resolveEmptyViewText(placeholder || 'Select...', role, inEdit)}
					{:else if plaintext}
						{#if role === 'form' && localValue.length > 1}
							({localValue.length})
						{/if}
						{localValue.map((item) => item.primaryDisplay).join(', ')}
					{:else}
						<div
							class="items"
							class:pills
							class:links
							class:isUser
							class:withCount={localValue.length > 5}
						>
							{#each localValue as val, idx (val._id)}
								{#if idx < 5}
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div
										class="item"
										on:click={links
											? () => {
													dispatch('linkClick', val);
												}
											: null}
									>
										{#if isUser}
											<i class={valueIcon}></i>
										{/if}
										<span>{val.primaryDisplay}</span>
									</div>
								{/if}
							{/each}

							{#if localValue.length > 5}
								<span class="count">(+ {localValue.length - 5})</span>
							{/if}
						</div>
					{/if}
				{/key}
			</div>
		</div>
	{/key}
</BaseCell>

{#if $csm === 'editing'}
	<SuperPopover
		{anchor}
		open={open || keepOpen}
		useAnchorWidth={true}
		dismissible={false}
		minWidth={pickerWidth}
		align={config.pickerAlign ?? 'left'}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore event_directive_deprecated -->
		<div
			class="popup"
			bind:this={popup}
			on:focusout={csm.popupFocusout}
			on:keydown={csm.popupKeydown}
		>
			{#if searchEnabled}
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
							on:mousedown|preventDefault|stopPropagation={clearPopupSearch}
						></i>
					{/if}
				</div>
			{/if}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore event_directive_deprecated -->
			<div
				class="options"
				bind:this={listElement}
				on:scroll={handlePickerScroll}
				on:mousedown|preventDefault={() => {}}
			>
				{#key pickerRows}
					{#if !pickerLoaded}
						<div class="option disabled loading">
							<i class="ph ph-spinner spin"></i>
							Loading...
						</div>
					{:else if pickerRows.length === 0}
						<div class="option disabled">No options available</div>
					{:else}
						{#each pickerRows as row, idx (idx)}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="option"
								class:selected={rowSelected(row)}
								class:highlighted={focusIdx === idx}
								on:mouseenter={() => (focusIdx = idx)}
								on:mousedown|preventDefault={() => selectPickerRow(row)}
							>
								{#if renderSlot}
									<Provider
										data={{
											value: row._id ?? row.id,
											label: row[primaryDisplayField],
											row
										}}
										scope={ContextScopes.Local}
									>
										{@render children?.()}
									</Provider>
								{:else}
									<span class="label">{row[primaryDisplayField]}</span>
									{#if rowSelected(row)}
										<span class="ph ph-check"></span>
									{/if}
								{/if}
							</div>
						{/each}
						{#if pickerLoading && pickerLoaded}
							<div class="option disabled loading">
								<i class="ph ph-spinner spin"></i>
								Loading more...
							</div>
						{/if}
					{/if}
				{/key}
			</div>
		</div>
	</SuperPopover>
{/if}

<style>
	.value-contents {
		font-size: 13px;
		min-width: 0;
		max-width: 100%;
		flex: 1 1 auto;
		display: flex;
		align-items: center;
		height: 100%;
		background: transparent;
		color: inherit;
		border: none;
		outline: none;
		cursor: inherit;
		padding: var(--super-cell-padding);
	}

	.value {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.value:has(.items) {
		display: flex;
		align-items: center;
	}

	.value-contents.placeholder {
		color: var(--spectrum-global-color-gray-500);
		font-style: italic !important;
	}

	.items {
		flex: 1 1 auto;
		display: flex;
		flex-wrap: nowrap;
		overflow: hidden;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		width: 100%;
	}

	.item {
		display: flex;
		align-items: center;
		overflow: hidden;
		min-width: 0;
		flex: 0 1 auto;
		max-width: 100%;
		gap: 0.35rem;
		padding: 0rem 0.5rem;
	}

	.item i {
		flex-shrink: 0;
	}

	.item span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	.items.pills .item {
		background-color: var(--spectrum-global-color-gray-100);
		border: 1px solid var(--spectrum-global-color-gray-200);
		border-radius: 4px;
		padding: 0.25rem 0.5rem;
		font-size: 12px;
	}

	.items.links .item {
		cursor: pointer;
		color: var(--spectrum-global-color-blue-600);
	}

	.items.links .item:hover {
		text-decoration: underline;
	}

	.count {
		flex-shrink: 0;
		color: var(--spectrum-global-color-gray-600);
		font-size: 12px;
	}

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

	.picker-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		min-height: 200px;
		color: var(--spectrum-global-color-gray-500);
		font-style: italic;
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
