<script lang="ts">
	import { createEventDispatcher, getContext, untrack, tick } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import SuperPopover from '../SuperPopover/SuperPopover.svelte';
	import SQLLinkPicker from './SQLLinkPicker.svelte';
	import LinkPickerTree from './LinkPickerTree.svelte';
	import { tooltip } from '../../actions/tooltip';
	import { copyAndTransition, deferJustCopied } from './cellClipboard';

	interface SQLLinkItem {
		primaryDisplay: string;
		[key: string]: unknown;
	}

	const dispatch = createEventDispatcher();
	const { API, fetchData, QueryUtils } = getContext('sdk');
	const EMPTY_FILTER = [];

	let {
		id,
		value,
		fieldSchema,
		cellOptions = {},
		filter = [],
		limit = 100,
		multi = false,
		ownId: ownIdProp,
		autofocus = false,
		buttons = []
	} = $props();

	let anchor = $state<HTMLElement | null>(null);
	let popup = $state<HTMLElement | null>(null);
	let popupSearchInput = $state<HTMLInputElement | null>(null);
	let popupSearchTerm = $state('');
	let pickerFetch = $state<ReturnType<typeof fetchData> | undefined>();
	let pickerCurrentLimit = $state(15);
	let pickerSearchTimer = $state<ReturnType<typeof setTimeout>>();
	let focusIdx = $state(-1);
	let open = $state(false);
	let localValue = $state<SQLLinkItem[]>([]);
	let originalValue = $state('[]');
	let primaryDisplayField = $state<string | undefined>();
	let isLoading = $state(false);
	let enrichGeneration = 0;

	let config = $derived(cellOptions ?? {});
	let resolvedFilter = $derived(filter ?? EMPTY_FILTER);
	let relatedField = $derived(fieldSchema?.relatedField || 'id');
	let relatedTableId = $derived(fieldSchema?.tableId);
	let pills = $derived(config.relViewMode === 'pills');
	let plaintext = $derived(config.relViewMode === 'text' || !config.relViewMode);
	let ownId = $derived(ownIdProp || config?.ownId);
	let placeholder = $derived(config.placeholder || '');
	let disabled = $derived(config.disabled);
	let readonly = $derived(config.readonly);
	let copyable = $derived(config.copyable);
	let copyIcon = $derived(config.copyIcon ?? 'always');
	let role = $derived(config.role);
	let error = $derived(config.error);
	let icon = $derived(config.icon);
	let showDirty = $derived(config.showDirty);
	let debounced = $derived(config.debounced);
	let writable = $derived(!disabled && !readonly);
	let isEmpty = $derived((localValue?.length ?? 0) < 1);
	let tabindex = $state(0);
	let showPopupSearch = $derived(fieldSchema?.recursiveTable ? !!config.search : true);
	let isRecursiveTable = $derived(!!fieldSchema?.recursiveTable);
	let relatedColumns = $derived(fieldSchema?.relatedColumns || []);
	let pickerInitLimit = $derived(isRecursiveTable ? limit : 15);
	let pickerPrimaryDisplay = $derived(
		primaryDisplayField || $pickerFetch?.definition?.primaryDisplay || relatedField
	);
	let pickerIdColumn = $derived($pickerFetch?.definition?.primary?.[0] ?? '_id');
	let pickerRows = $derived($pickerFetch?.rows ?? []);
	let pickerLoading = $derived($pickerFetch?.loading ?? false);
	let pickerLoaded = $derived($pickerFetch?.loaded ?? false);

	const getEmittedLabel = () => {
		if (!localValue.length) return null;
		return localValue.map((item) => item.primaryDisplay).join(', ');
	};

	const parseRow = (row: Record<string, unknown>, displayField?: string): SQLLinkItem | null => {
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
			goTo: (state: string) => state
		},
		view: {
			focus: () => {
				if (!readonly && !disabled) return 'editing';
			}
		},
		editing: {
			_enter: () => {
				originalValue = JSON.stringify(localValue);
				open = true;
				focusIdx = -1;
				pickerCurrentLimit = pickerInitLimit;
				dispatch('enteredit');
				setTimeout(() => {
					if (showPopupSearch) {
						popupSearchInput?.focus();
					}
				}, 0);
			},
			_exit: () => {
				open = false;
				popupSearchTerm = '';
				focusIdx = -1;
				clearTimeout(pickerSearchTimer);
				dispatch('exitedit');
				if (!debounced) {
					dispatch('change', localValue);
					dispatch('labelChange', getEmittedLabel());
				}
			},
			cancel() {
				localValue = JSON.parse(originalValue);
				open = false;
				dispatch('cancel');
				anchor?.focus();
				return 'view';
			},
			click: () => {
				open = !open;
			},
			keydown: (e: KeyboardEvent) => {
				if (e.key === ' ' || e.keyCode === 32) {
					e.preventDefault();
					open = !open;
				} else if (e.key === 'Escape') {
					e.preventDefault();
					if (open) {
						open = false;
						anchor?.focus();
					} else {
						return this.cancel();
					}
				} else if (open && showPopupSearch) {
					popupSearchInput?.focus();
				}
			},
			focusout: (e: FocusEvent) => {
				const related = e.relatedTarget as Node | null;
				if (popup?.contains(related)) return;
				return 'view';
			},
			popupFocusout: (e: FocusEvent) => {
				if (anchor?.contains(e.relatedTarget as Node)) return;
				return 'view';
			},
			popupKeydown(e: KeyboardEvent) {
				if (e.key === 'Tab') {
					anchor?.focus();
					return 'view';
				}
				if (!isRecursiveTable) {
					navigatePickerOptions(e);
				}
			},
			selectChange: (nextValue: SQLLinkItem[]) => {
				localValue = nextValue;

				if (debounced) {
					dispatch('change', localValue);
					dispatch('labelChange', getEmittedLabel());
				}

				if (!multi) {
					open = false;
					anchor?.focus();
					return 'view';
				}
			}
		},
		readonly: {},
		disabled: {},
		copyable: {
			click() {
				copyAndTransition(() => csm, getEmittedLabel() ?? '');
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

	let isDirty = $derived($csm === 'editing' && originalValue !== JSON.stringify(localValue));

	const handlePickerChange = (e: CustomEvent<SQLLinkItem[]>) => {
		csm.selectChange(e.detail);
	};

	const extendQuery = (
		baseQuery: Record<string, unknown>,
		extensions: Record<string, unknown>
	) => {
		if (!Object.keys(extensions).length) {
			return baseQuery;
		}

		const extended = {
			$and: {
				conditions: [...(baseQuery ? [baseQuery] : []), ...Object.values(extensions || {})]
			},
			onEmptyFilter: 'none'
		};

		return (extended.$and?.conditions?.length ?? 0) > 0 ? extended : {};
	};

	const buildPickerQuery = (term: string) => {
		const defaultQuery = QueryUtils.buildQuery(resolvedFilter);

		if (!term || !showPopupSearch) {
			return defaultQuery;
		}

		if (relatedColumns.length > 0) {
			return extendQuery(defaultQuery, {
				search: {
					$or: {
						conditions: relatedColumns.map((col: { name: string }) => ({
							fuzzy: {
								[col.name]: term
							}
						}))
					}
				}
			});
		}

		const displayField = primaryDisplayField || relatedField;

		return extendQuery(defaultQuery, {
			search: QueryUtils.buildQuery([
				{
					field: displayField,
					type: 'string',
					operator: 'fuzzy',
					value: term,
					valueType: 'Value'
				}
			])
		});
	};

	const schedulePickerSearch = (term: string) => {
		if (!pickerFetch) return;

		clearTimeout(pickerSearchTimer);
		pickerSearchTimer = setTimeout(() => {
			pickerCurrentLimit = pickerInitLimit;
			pickerFetch?.update({
				query: buildPickerQuery(term),
				limit: pickerCurrentLimit
			});
		}, 200);
	};

	const fetchMorePickerRows = () => {
		if ($pickerFetch?.loading) return;
		if (($pickerFetch?.rows?.length ?? 0) < pickerCurrentLimit) return;

		pickerCurrentLimit += 100;
		pickerFetch?.update({
			query: buildPickerQuery(popupSearchTerm),
			limit: pickerCurrentLimit
		});
	};

	const selectPickerRow = (row: Record<string, unknown>) => {
		const item = parseRow(row, pickerPrimaryDisplay);
		if (!item) return;

		let nextValue: SQLLinkItem[];
		if (!multi) {
			nextValue = localValue[0]?.[relatedField] == item[relatedField] ? [] : [item];
		} else {
			const pos = localValue.findIndex((v) => v[relatedField] == item[relatedField]);
			nextValue =
				pos > -1 ? localValue.filter((_, i) => i !== pos) : [...localValue, item];
		}

		csm.selectChange(nextValue);
	};

	const scrollHighlightedIntoView = async () => {
		if (focusIdx < 0 || !popup) return;
		await tick();
		const highlighted = popup.querySelector('.option.highlighted, .data-row.highlighted');
		highlighted?.scrollIntoView({ block: 'nearest' });
	};

	const navigatePickerOptions = (e: KeyboardEvent) => {
		const fetchedRows = $pickerFetch?.rows ?? [];
		const totalRows = localValue.length + fetchedRows.length;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			focusIdx = Math.min(focusIdx + 1, totalRows - 1);
			if (focusIdx < 0 && totalRows) focusIdx = 0;
			scrollHighlightedIntoView();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			focusIdx = Math.max(focusIdx - 1, 0);
			scrollHighlightedIntoView();
		} else if (e.key === 'Enter' && focusIdx > -1) {
			e.preventDefault();
			const row =
				focusIdx < localValue.length
					? localValue[focusIdx]
					: fetchedRows[focusIdx - localValue.length];
			if (row) selectPickerRow(row as Record<string, unknown>);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			open = false;
			anchor?.focus();
		}
	};

	const handlePopupSearch = (e: Event) => {
		popupSearchTerm = (e.target as HTMLInputElement).value;
		const fetchedRows = $pickerFetch?.rows ?? [];
		focusIdx =
			popupSearchTerm && fetchedRows.length ? localValue.length : -1;
		schedulePickerSearch(popupSearchTerm);
	};

	const clearPopupSearch = () => {
		popupSearchTerm = '';
		focusIdx = -1;
		schedulePickerSearch('');
	};

	$effect(() => {
		if ($csm !== 'editing' || !relatedTableId || !writable) {
			pickerFetch = undefined;
			return;
		}

		const initLimit = pickerInitLimit;
		pickerCurrentLimit = initLimit;

		untrack(() => {
			pickerFetch = fetchData({
				API,
				datasource: {
					type: 'table',
					tableId: relatedTableId
				},
				options: {
					query: buildPickerQuery(''),
					limit: initLimit,
					...(isRecursiveTable && config.sortColumn
						? { sortColumn: config.sortColumn, sortOrder: config.sortOrder }
						: {})
				}
			});
		});
	});

	$effect(() => {
		const fetchedRows = $pickerFetch?.rows ?? [];
		const totalRows = localValue.length + fetchedRows.length;
		if (totalRows) {
			focusIdx = Math.min(focusIdx, totalRows - 1);
		}
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
	isDirty={isDirty && showDirty}
	popupOpen={open}
	{copyIcon}
	{tabindex}
	{buttons}
>
	{#key $csm}
		<span class="value" class:placeholder={isEmpty}>
			<div class="value-content" use:tooltip>
				{#if isLoading}
					Loading...
				{:else}
					{#key localValue}
						{#if isEmpty}
							{placeholder || 'Select...'}
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
		</span>

		{#if $csm === 'view' || $csm === 'editing'}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<i class="ph ph-caret-down control-icon" on:click|self={csm.click}></i>
		{/if}
	{/key}
</BaseCell>

{#if $csm === 'editing'}
	<SuperPopover
		{anchor}
		{open}
		useAnchorWidth={true}
		minWidth={config.pickerWidth || undefined}
		align="left"
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
			{#if showPopupSearch}
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
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<i
						class="ph ph-x clear-icon"
						on:mousedown|preventDefault|stopPropagation={clearPopupSearch}
					></i>
				</div>
			{/if}
			{#if isRecursiveTable}
				{#key `${pickerLoaded}-${pickerRows.length}`}
					<LinkPickerTree
						{fieldSchema}
						rows={pickerRows}
						loading={pickerLoading}
						loaded={pickerLoaded}
						primaryDisplay={pickerPrimaryDisplay}
						idColumn={pickerIdColumn}
						joinColumn={config.joinColumn}
						value={localValue}
						{ownId}
						{multi}
						on:change={handlePickerChange}
					/>
				{/key}
			{:else}
				{#key `${pickerLoaded}-${pickerRows.length}`}
					<SQLLinkPicker
						{fieldSchema}
						rows={pickerRows}
						loading={pickerLoading}
						loaded={pickerLoaded}
						primaryDisplay={pickerPrimaryDisplay}
						{multi}
						value={localValue}
						bind:focusIdx
						on:change={handlePickerChange}
						on:fetchmore={fetchMorePickerRows}
					></SQLLinkPicker>
				{/key}
			{/if}
		</div>
	</SuperPopover>
{/if}

<style>
	span.value {
		min-width: 0;
		max-width: 100%;
		flex: 1 1 auto;
		display: flex;
		align-items: stretch;
		height: 100%;
		background: transparent;
		color: inherit;
		border: none;
		outline: none;
		cursor: inherit;
		padding: 0.25rem 0.75rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	span.value:has(.items) {
		white-space: normal;
	}

	.value-content {
		min-width: 0;
		flex: 1;
		font-style: inherit;
		font-size: 13px;
		text-overflow: ellipsis;
		overflow: hidden;
		white-space: nowrap;
		display: flex;
		align-items: center;
	}

	.value-content:has(.items) {
		white-space: normal;
		display: flex;
	}

	.value.placeholder .value-content {
		color: var(--spectrum-global-color-gray-500);
		font-style: italic !important;
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
		padding: 0rem 0.75rem;
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
</style>
