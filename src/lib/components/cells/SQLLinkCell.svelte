<script lang="ts">
	import { createEventDispatcher, getContext, untrack, tick } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import SuperPopover from '../SuperPopover/SuperPopover.svelte';
	import { tooltip } from '../../actions/tooltip';
	import {
		buildSqlPickerQuery,
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
		linkSelectionEqual,
		requestIconOpenOnEnter,
		requestOpenOnEnter,
		resolveEmptyViewText,
		shouldShowCellViewChrome
	} from './helpers';
	import type { SQLLinkItem } from './types';

	const dispatch = createEventDispatcher();
	const { API, fetchData, QueryUtils, Provider, ContextScopes } = getContext('sdk');
	const EMPTY_FILTER = [];

	let {
		id,
		value,
		fieldSchema,
		cellOptions = {},
		filter = [],
		multi = false,
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
	let localValue = $state<SQLLinkItem[]>([]);
	let primaryDisplayField = $state<string | undefined>();
	let isLoading = $state(false);
	let enrichGeneration = 0;

	let config = $derived(cellOptions ?? {});
	let resolvedFilter = $derived(filter ?? EMPTY_FILTER);
	let relatedField = $derived(fieldSchema?.relatedField || 'id');
	let relatedTableId = $derived(fieldSchema?.tableId);
	let pills = $derived(config.relViewMode === 'pills');
	let plaintext = $derived(config.relViewMode === 'text' || !config.relViewMode);
	let placeholder = $derived(config.placeholder || '');
	let disabled = $derived(config.disabled);
	let readonly = $derived(config.readonly);
	let copyable = $derived(config.copyable);
	let copyIcon = $derived(config.copyIcon ?? 'always');
	let role = $derived(config.role ?? 'form');
	let inEdit = $derived($csm === 'editing');
	let error = $derived(config.error);
	let icon = $derived(config.icon);
	let showDirty = $derived(config.showDirty);
	let debounceMs = $derived(config.debounce ?? null);
	let searchEnabled = $derived(config.search ?? true);
	let isDirty = $derived(
		inEdit && !linkSelectionEqual(localValue, value, relatedField)
	);
	let writable = $derived(!disabled && !readonly);
	let isEmpty = $derived((localValue?.length ?? 0) < 1);
	let tabindex = $state(0);
	let relatedColumns = $derived(fieldSchema?.relatedColumns || []);
	let isMultiColumn = $derived(relatedColumns.length > 1);
	let gridTemplate = $derived(
		relatedColumns
			.map((col: { width?: string }) => col.width || '1fr')
			.concat('32px')
			.join(' ')
	);
	let pickerInitLimit = 15;
	let listElement = $state<HTMLElement | null>(null);
	let optionRefs = $state<(HTMLElement | undefined)[]>([]);
	let pickerPrimaryDisplay = $derived(
		primaryDisplayField || $pickerFetch?.definition?.primaryDisplay || relatedField
	);
	let pickerRows = $derived($pickerFetch?.rows ?? []);
	let pickerLoading = $derived($pickerFetch?.loading ?? false);
	let pickerLoaded = $derived($pickerFetch?.loaded ?? false);
	let pickerHasMore = $derived(pickerRows.length >= pickerCurrentLimit);
	let visibleFetchedRows = $derived(
		pickerRows.filter((row) => !localValue.some((item) => item[relatedField] == row[relatedField]))
	);
	let totalPickerRows = $derived(localValue.length + visibleFetchedRows.length);

	const getCopyText = () => localValue.map((item) => item.primaryDisplay).join(', ');

	const createPickerFetch = () => {
		if (!relatedTableId || !writable) return;

		pickerCurrentLimit = pickerInitLimit;
		pickerFetch = fetchData({
			API,
			datasource: {
				type: 'table',
				tableId: relatedTableId
			},
			options: {
				query: buildPickerQuery(''),
				limit: pickerInitLimit
			}
		});
	};

	const destroyPickerFetch = () => {
		pickerFetch = undefined;
		clearTimeout(pickerSearchTimer);
	};

	const parseRow = (row: Record<string, unknown>, displayField: string | undefined = undefined): SQLLinkItem | null => {
		const rowId = row[relatedField];
		if (rowId == null) return null;

		const display =
			row.primaryDisplay != null
				? String(row.primaryDisplay)
				: displayField && row[displayField] != null
					? String(row[displayField])
					: String(row.name ?? rowId);

		return {
			...row,
			[relatedField]: rowId,
			primaryDisplay: display
		};
	};

	const toLocalValue = (raw: unknown): SQLLinkItem[] => {
		if (raw == null || raw === '') return [];

		if (multi) {
			return Array.isArray(raw)
				? raw
						.map((item) =>
							typeof item === 'object' && item !== null
								? parseRow(item as Record<string, unknown>, primaryDisplayField)
								: null
						)
						.filter((item): item is SQLLinkItem => !!item)
				: [];
		}

		if (typeof raw === 'object' && !Array.isArray(raw)) {
			const item = parseRow(raw as Record<string, unknown>, primaryDisplayField);
			return item ? [item] : [];
		}

		return [];
	};

	const enrichValue = async (raw: unknown, generation: number) => {
		if (!API || !relatedTableId || !writable) return;

		if (multi && Array.isArray(raw)) {
			const ids = raw.filter((item) => typeof item !== 'object');
			if (!ids.length) return;

			const existingIds = new Set(
				localValue.map((item) => item[relatedField]).filter((id) => id != null)
			);
			const missingIds = ids.filter((id) => !existingIds.has(id));
			if (!missingIds.length) return;

			isLoading = true;
			try {
				const definition = await API.fetchTableDefinition(relatedTableId);
				if (generation !== enrichGeneration) return;

				const displayField =
					primaryDisplayField || definition?.primaryDisplay || fieldSchema?.primaryDisplay;
				if (displayField) primaryDisplayField = displayField;

				const rows = await Promise.all(
					missingIds.map((id) => API.fetchRow(relatedTableId, id, true))
				);
				if (generation !== enrichGeneration) return;

				const enriched = rows
					.map((row) => parseRow(row as Record<string, unknown>, displayField))
					.filter((item): item is SQLLinkItem => !!item);

				localValue = [...localValue, ...enriched];
				dispatch('enrich', { rows: enriched });
			} catch (err) {
				console.error('Error enriching SQL relationship rows', err);
			} finally {
				if (generation === enrichGeneration) isLoading = false;
			}
			return;
		}

		if (!multi && raw != null && !Array.isArray(raw) && typeof raw !== 'object') {
			const existing = localValue.find((item) => item[relatedField] === raw);
			if (existing) return;

			isLoading = true;
			try {
				const definition = await API.fetchTableDefinition(relatedTableId);
				if (generation !== enrichGeneration) return;

				const displayField =
					primaryDisplayField || definition?.primaryDisplay || fieldSchema?.primaryDisplay;
				if (displayField) primaryDisplayField = displayField;

				const row = await API.fetchRow(relatedTableId, raw, true);
				if (generation !== enrichGeneration) return;

				const enriched = parseRow(row as Record<string, unknown>, displayField);
				localValue = enriched ? [enriched] : [];
				if (enriched) dispatch('enrich', { rows: [enriched] });
			} catch (err) {
				console.error('Error enriching SQL relationship row', err);
				if (generation === enrichGeneration) localValue = [];
			} finally {
				if (generation === enrichGeneration) isLoading = false;
			}
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
						dispatch('change', localValue);
					}, debounceMs);
				}
			},
			submit() {
				if (isDirty && !debounceMs) {
					dispatch('change', localValue);
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
					dispatch('change', localValue);
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
			selectChange: (nextValue: SQLLinkItem[]) => {
				localValue = nextValue;
				this.change();

				if (!multi) {
					if (keepOpen) return;
					open = false;
					popupSearchTerm = '';
					focusIdx = -1;
					anchor?.focus();
				}
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

	let dirty = $derived(config.dirty);

	const buildPickerQuery = (term: string) =>
		buildSqlPickerQuery(
			QueryUtils,
			resolvedFilter,
			relatedColumns,
			relatedField,
			primaryDisplayField,
			term,
			true
		);

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

	const getRowContext = (row: Record<string, unknown>) => ({
		value: row[relatedField],
		label:
			row.primaryDisplay ||
			row[pickerPrimaryDisplay] ||
			(relatedColumns[0] ? row[relatedColumns[0].name] : ''),
		row
	});

	const rowSelected = (row: Record<string, unknown>) =>
		localValue.some((item) => item[relatedField] == row[relatedField]);

	const selectSqlRow = (row: Record<string, unknown>) => {
		const displayValue =
			relatedColumns.length > 0 ? row[relatedColumns[0].name] : row[pickerPrimaryDisplay];

		const selectedItem = parseRow(
			{
				...row,
				primaryDisplay: displayValue
			},
			pickerPrimaryDisplay
		);
		if (!selectedItem) return;

		let nextValue: SQLLinkItem[];
		if (!multi) {
			nextValue = localValue[0]?.[relatedField] == selectedItem[relatedField] ? [] : [selectedItem];
		} else {
			const pos = localValue.findIndex((v) => v[relatedField] == selectedItem[relatedField]);
			nextValue = pos > -1 ? localValue.filter((_, i) => i !== pos) : [...localValue, selectedItem];
		}

		csm.selectChange(nextValue);
	};

	const handlePickerScroll = (e: Event) => {
		const element = e.target as HTMLElement;
		if (shouldFetchMore(element, pickerLoading, pickerHasMore)) {
			fetchMorePickerRows();
		}
	};

	const scrollHighlightedIntoView = async () => {
		if (focusIdx < 0 || !popup) return;
		await tick();
		const highlighted = popup.querySelector('.option.highlighted, .data-row.highlighted');
		highlighted?.scrollIntoView({ block: 'nearest' });
	};

	const getFocusedRow = () => {
		if (focusIdx < 0) return null;
		if (focusIdx < localValue.length) {
			return localValue[focusIdx] as Record<string, unknown>;
		}
		return visibleFetchedRows[focusIdx - localValue.length] as Record<string, unknown> | undefined;
	};

	const navigatePickerOptions = (e: KeyboardEvent) => {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			focusIdx = clampFocusIdx(focusIdx + 1, totalPickerRows);
			if (focusIdx < 0 && totalPickerRows) focusIdx = 0;
			scrollHighlightedIntoView();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			focusIdx = clampFocusIdx(focusIdx - 1, totalPickerRows);
			scrollHighlightedIntoView();
		} else if (e.key === 'Enter' && focusIdx > -1) {
			e.preventDefault();
			const row = getFocusedRow();
			if (row) selectSqlRow(row);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			open = false;
			anchor?.focus();
		}
	};

	const handlePopupSearch = (e: Event) => {
		popupSearchTerm = (e.target as HTMLInputElement).value;
		focusIdx = popupSearchTerm && visibleFetchedRows.length ? localValue.length : -1;
		schedulePickerSearch(popupSearchTerm);
	};

	const clearPopupSearch = () => {
		popupSearchTerm = '';
		focusIdx = -1;
		schedulePickerSearch('');
	};

	$effect(() => {
		focusIdx = clampFocusIdx(focusIdx, totalPickerRows);
	});

	$effect(() => {
		if (focusIdx >= 0 && optionRefs[focusIdx]) {
			tick().then(() => {
				optionRefs[focusIdx]?.scrollIntoView({ block: 'nearest' });
			});
		}
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
		const definition = $pickerFetch?.definition;
		if (!definition) return;

		primaryDisplayField =
			fieldSchema?.primaryDisplay ||
			('primaryDisplay' in definition ? definition.primaryDisplay : undefined);
	});

	$effect(() => {
		const raw = value;
		const generation = ++enrichGeneration;

		untrack(async () => {
			localValue = toLocalValue(raw);
			await enrichValue(raw, generation);
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
				{#if isLoading}
					Loading...
				{:else}
					{#key localValue}
						{#if isEmpty}
							{resolveEmptyViewText(placeholder || 'Select...', role, inEdit)}
						{:else if plaintext}
							{#if role === 'form' && localValue.length > 1}
								({localValue.length})
							{/if}
							{localValue.map((item) => item.primaryDisplay).join(', ')}
						{:else if pills}
							<div class="items pills" class:withCount={localValue.length > 5}>
								{#each localValue as val, idx (idx)}
									{#if idx < 5}
										<div class="item">
											<span>{val.primaryDisplay}</span>
										</div>
									{/if}
								{/each}
								{#if localValue.length > 5}
									<span class="count">(+ {localValue.length - 5})</span>
								{/if}
							</div>
						{:else}
							{localValue.map((item) => item.primaryDisplay).join(', ')}
						{/if}
					{/key}
				{/if}
			</div>
		</div>
	{/key}
</BaseCell>

{#if $csm === 'editing'}
	<SuperPopover
		{anchor}
		open={open || keepOpen}
		useAnchorWidth={true}
		minWidth={config.pickerWidth || undefined}
		align={config.pickerAlign ?? 'left'}
		dismissible={false}
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
						<i class="ph ph-x clear-icon" on:mousedown|preventDefault|stopPropagation={clearPopupSearch}
						></i>
					{/if}
				</div>
			{/if}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore event_directive_deprecated -->

			<div
				class="picker-list"
				bind:this={listElement}
				on:scroll={handlePickerScroll}
				on:mousedown|preventDefault={() => {}}
			>
				{#key pickerRows}
					{#if isMultiColumn}
						<div class="grid-container" style="--grid-template: {gridTemplate}">
							<div class="header-row">
								{#each relatedColumns as col}
									<div class="header-cell">{col.displayName || col.name}</div>
								{/each}
								<div class="header-cell check"></div>
							</div>
							{#each localValue as row, idx (row[relatedField])}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="data-row"
									class:selected={rowSelected(row)}
									class:highlighted={focusIdx === idx}
									bind:this={optionRefs[idx]}
									on:mouseenter={() => (focusIdx = idx)}
									on:mousedown|preventDefault={() => selectSqlRow(row)}
								>
									{#if renderSlot}
										<div class="data-cell slot-cell">
											<Provider data={getRowContext(row)} scope={ContextScopes.Local}>
												{@render children?.()}
											</Provider>
										</div>
									{:else}
										{#each relatedColumns as col}
											<div class="data-cell">{row[col.name] || ''}</div>
										{/each}
										<div class="data-cell check"><i class="ri-check-line"></i></div>
									{/if}
								</div>
							{/each}
							{#if !pickerLoaded}
								<div class="data-row loading">
									<div class="data-cell" style="grid-column: 1 / -1;">
										<i class="ph ph-spinner spin"></i> Loading...
									</div>
								</div>
							{:else if visibleFetchedRows.length}
								{#each visibleFetchedRows as row, idx (row[relatedField])}
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div
										class="data-row"
										class:highlighted={focusIdx === idx + localValue.length}
										bind:this={optionRefs[idx + localValue.length]}
										on:mouseenter={() => (focusIdx = idx + localValue.length)}
										on:mousedown|preventDefault={() => selectSqlRow(row)}
									>
										{#if renderSlot}
											<div class="data-cell slot-cell">
												<Provider data={getRowContext(row)} scope={ContextScopes.Local}>
													{@render children?.()}
												</Provider>
											</div>
										{:else}
											{#each relatedColumns as col}
												<div class="data-cell">{row[col.name] || ''}</div>
											{/each}
											<div class="data-cell check"><i class="ri-check-line"></i></div>
										{/if}
									</div>
								{/each}
								{#if pickerLoading && pickerLoaded}
									<div class="data-row loading">
										<div class="data-cell" style="grid-column: 1 / -1;">
											<i class="ph ph-spinner spin"></i> Loading more...
										</div>
									</div>
								{/if}
							{:else if !localValue.length}
								<div class="data-row">
									<div class="data-cell" style="grid-column: 1 / -1;">No Results Found</div>
								</div>
							{/if}
						</div>
					{:else}
						<div class="options">
							{#each localValue as row, idx (row[relatedField])}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="option"
									class:selected={rowSelected(row)}
									class:highlighted={focusIdx === idx}
									bind:this={optionRefs[idx]}
									on:mouseenter={() => (focusIdx = idx)}
									on:mousedown|preventDefault={() => selectSqlRow(row)}
								>
									{#if renderSlot}
										<Provider data={getRowContext(row)} scope={ContextScopes.Local}>
											{@render children?.()}
										</Provider>
									{:else}
										<span>{row.primaryDisplay || row[pickerPrimaryDisplay]}</span>
										<i class="ri-check-line"></i>
									{/if}
								</div>
							{/each}
							{#if !relatedTableId}
								<div class="option">Configure a related table</div>
							{:else if !pickerLoaded}
								<div class="option loading">
									<i class="ph ph-spinner spin"></i>
									Loading...
								</div>
							{:else if visibleFetchedRows.length}
								{#each visibleFetchedRows as row, idx (row[relatedField])}
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div
										class="option"
										class:highlighted={focusIdx === idx + localValue.length}
										bind:this={optionRefs[idx + localValue.length]}
										on:mouseenter={() => (focusIdx = idx + localValue.length)}
										on:mousedown|preventDefault={() => selectSqlRow(row)}
									>
										{#if renderSlot}
											<Provider data={getRowContext(row)} scope={ContextScopes.Local}>
												{@render children?.()}
											</Provider>
										{:else}
											<span>{row.primaryDisplay || row[pickerPrimaryDisplay]}</span>
											<i class="ri-check-line"></i>
										{/if}
									</div>
								{/each}
								{#if pickerLoading && pickerLoaded}
									<div class="option loading">
										<i class="ph ph-spinner spin"></i>
										Loading more...
									</div>
								{/if}
							{:else if !localValue.length}
								<div class="option">No Results Found</div>
							{/if}
						</div>
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

	.value-contents.placeholder {
		color: var(--spectrum-global-color-gray-500);
		font-style: italic !important;
	}

	.value {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.items {
		flex: auto;
		display: flex;
		overflow: hidden;
		align-items: stretch;
		flex-wrap: wrap;
		gap: 0.5rem;
		min-width: 0;
	}

	.item {
		display: flex;
		align-items: center;
		overflow: hidden;
		min-width: 0;
		gap: 0.35rem;
		padding: 0rem 0.5rem;
	}

	.item span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.items.pills .item {
		background-color: var(--spectrum-global-color-gray-100);
		border: 1px solid var(--spectrum-global-color-gray-200);
		border-radius: 4px;
		align-self: stretch;
		padding: 0.25rem 0.5rem;
		font-size: 12px;
	}

	.count {
		color: var(--spectrum-global-color-gray-600);
		font-size: 12px;
		align-self: center;
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

	.picker-list {
		max-height: 300px;
		overflow-y: auto;
		overflow-x: hidden;
	}

	.options {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.option {
		line-height: 1.5rem;
		padding: 0.5em 1em;
		overflow: hidden;
		display: flex;
		min-width: 0;
		justify-content: space-between;
		cursor: pointer;
	}

	.option > i {
		visibility: hidden;
	}

	.option > span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
	}

	.option.selected > i {
		visibility: visible;
		color: var(--spectrum-global-color-green-500);
	}

	.option.highlighted {
		background-color: var(--spectrum-global-color-gray-100);
	}

	.option:hover {
		background-color: var(--spectrum-global-color-gray-100);
	}

	.option.loading {
		justify-content: center;
		color: var(--spectrum-global-color-gray-500);
		font-style: italic;
	}

	.grid-container {
		min-width: 0;
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
		background-color: var(--spectrum-global-color-gray-100);
	}

	.data-row.selected .data-cell.check i {
		visibility: visible;
		color: var(--spectrum-global-color-green-500);
	}

	.data-cell.check i {
		visibility: hidden;
	}

	.data-cell.slot-cell {
		grid-column: 1 / -1;
	}

	.data-row.loading {
		color: var(--spectrum-global-color-gray-500);
		font-style: italic;
	}

	.data-row.loading .data-cell {
		text-align: center;
		border-bottom: none;
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
