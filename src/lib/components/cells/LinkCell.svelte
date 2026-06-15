<script lang="ts">
	import { getContext, untrack, tick } from 'svelte';
	import { createEventDispatcher } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import SuperPopover from '../SuperPopover/SuperPopover.svelte';
	import LinkPickerSelect from './LinkPickerSelect.svelte';
	import LinkPickerTree from './LinkPickerTree.svelte';
	import { tooltip } from '../../actions/tooltip';
	import { copyAndTransition, deferJustCopied } from './cellClipboard';

	interface LinkItem {
		_id: string;
		primaryDisplay: string;
	}

	const dispatch = createEventDispatcher();
	const { API, fetchData, QueryUtils } = getContext('sdk');

	let {
		id,
		value,
		fieldSchema,
		cellOptions,
		filter: filterProp = [],
		limit = 100,
		ownId: ownIdProp,
		isUserSelect = false,
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
	let localValue = $state<LinkItem[]>([]);
	let originalValue = $state('[]');
	let primaryDisplayField = $state<string | undefined>();
	let loadingMissing = $state(false);
	let enrichGeneration = 0;

	let config = $derived(cellOptions ?? {});
	let filter = $derived(filterProp?.length ? filterProp : (config.filter ?? []));
	let multi = $derived(!fieldSchema?.type?.includes('_single'));
	let isUser = $derived(fieldSchema?.type?.includes('bb_reference') || isUserSelect);
	let pills = $derived(config.relViewMode === 'pills');
	let links = $derived(config.relViewMode === 'links' && !isUser);
	let valueIcon = $derived(fieldSchema?.type === 'link' ? 'ri-edit-box-line' : 'ri-user-line');
	let ownId = $derived(ownIdProp || config?.ownId);
	let plaintext = $derived(config.relViewMode === 'text' || !config.relViewMode);
	let inline = $derived(config.role === 'inline');
	let multirow = $derived(
		config.controlType === 'expanded' && ((localValue?.length ?? 0) > 1 || $csm === 'editing')
	);
	let singleSelect = $derived(
		fieldSchema?.relationshipType === 'one-to-many' ||
			fieldSchema?.relationshipType === 'self' ||
			!multi
	);
	let returnSingle = $derived(isUser && !multi);
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
	let tableId = $derived(fieldSchema?.tableId);
	let isEmpty = $derived((localValue?.length ?? 0) < 1);
	let isDirty = $derived($csm === 'editing' && originalValue !== JSON.stringify(localValue));
	let tabindex = $state(0);
	let showPopupSearch = $derived(fieldSchema?.recursiveTable ? !!config.search : true);
	let isRecursiveTable = $derived(!!fieldSchema?.recursiveTable);
	let pickerInitLimit = $derived(isRecursiveTable ? limit : 15);
	let pickerPrimaryDisplay = $derived(
		primaryDisplayField ||
			$pickerFetch?.definition?.primaryDisplay ||
			(isUser ? 'email' : 'name')
	);
	let pickerIdColumn = $derived($pickerFetch?.definition?.primary?.[0] ?? '_id');

	let canFetchPicker = $derived(isUser || !!tableId);
	let writable = $derived(!disabled && !readonly);

	let optionsFetch = $state<ReturnType<typeof fetchData> | undefined>();

	const parseId = (id: string) => id;

	const parseLinkItem = (item: unknown, primaryDisplay?: string): LinkItem | null => {
		if (!item) return null;

		if (typeof item === 'string') {
			return { _id: parseId(item), primaryDisplay: item };
		}

		if (typeof item !== 'object') return null;

		const row = item as Record<string, unknown>;
		const rowId = (row._id ?? row.id) as string | undefined;
		if (!rowId) return null;

		if ('primaryDisplay' in row && Object.keys(row).length <= 2) {
			return {
				_id: parseId(rowId),
				primaryDisplay: String(row.primaryDisplay ?? rowId)
			};
		}

		const displayField = primaryDisplay || primaryDisplayField;
		if (displayField && row[displayField] != null) {
			return {
				_id: parseId(rowId),
				primaryDisplay: String(row[displayField])
			};
		}

		return {
			_id: parseId(rowId),
			primaryDisplay: String(row.name ?? rowId)
		};
	};

	const toLocalValue = (raw: unknown): LinkItem[] => {
		if (raw == null || raw === '') return [];

		if (
			fieldSchema?.relationshipType === 'self' &&
			!Array.isArray(raw) &&
			typeof raw !== 'object'
		) {
			return [{ _id: String(raw), primaryDisplay: String(raw) }];
		}

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

	const getEmittedValue = () => {
		if (returnSingle && localValue.length) return localValue[0];
		if (singleSelect && !multi) return localValue[0] ?? null;
		return localValue;
	};

	const getEmittedLabel = () => {
		if (!localValue.length) return null;
		return localValue.map((item) => item.primaryDisplay).join(', ');
	};

	const getPickerDatasource = () => {
		if (isUser) {
			return { type: 'user' as const };
		}
		return { type: 'table' as const, tableId: tableId! };
	};

	const buildUserPickerQuery = (term: string) => {
		if (!term || !showPopupSearch) {
			return {};
		}
		return { fuzzy: { email: term } };
	};

	const loadMissingOptions = async (
		items: LinkItem[],
		linkedTableId?: string,
		primaryDisplay?: string
	) => {
		if (!primaryDisplay || !writable) return;

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
					const option = parseLinkItem(row, primaryDisplay);
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
					const option = parseLinkItem(row, primaryDisplay);
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

	const enrichSelfReference = async (raw: unknown, linkedTableId?: string, generation?: number) => {
		if (
			fieldSchema?.relationshipType !== 'self' ||
			!raw ||
			Array.isArray(raw) ||
			typeof raw === 'object' ||
			!linkedTableId
		) {
			return;
		}

		try {
			const row = await API.fetchRow(linkedTableId, raw, true);
			if (generation !== enrichGeneration) return;

			const displayField = primaryDisplayField || fieldSchema?.primaryDisplay;
			localValue = [
				{
					_id: row.id ?? row._id,
					primaryDisplay: displayField
						? String(row[displayField] ?? row.id ?? row._id)
						: String(row.name ?? row.id ?? row._id)
				}
			];
		} catch {
			if (generation === enrichGeneration) localValue = [];
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
					dispatch('change', getEmittedValue());
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
			selectChange: (nextValue: LinkItem[]) => {
				localValue = nextValue;

				if (debounced) {
					dispatch('change', getEmittedValue());
					dispatch('labelChange', getEmittedLabel());
				}

				if (singleSelect) {
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

	const handlePickerChange = (e: CustomEvent<LinkItem[]>) => {
		csm.selectChange(e.detail);
	};

	const buildPickerQuery = (term: string) => {
		if (isUser) {
			return buildUserPickerQuery(term);
		}

		if (!term || !showPopupSearch) {
			return QueryUtils.buildQuery(filter);
		}

		const displayField = primaryDisplayField || 'name';

		return QueryUtils.buildQuery([
			...filter,
			{
				field: displayField,
				type: 'string',
				operator: 'fuzzy',
				value: term,
				valueType: 'Value'
			}
		]);
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
		const rowId = row._id ?? row.id;
		const item: LinkItem = {
			_id: String(rowId),
			primaryDisplay: String(row[pickerPrimaryDisplay] ?? rowId)
		};

		let nextValue: LinkItem[];
		if (singleSelect) {
			nextValue = localValue[0]?._id == rowId ? [] : [item];
		} else {
			const pos = localValue.findIndex((v) => v._id == rowId);
			nextValue =
				pos > -1 ? localValue.filter((_, i) => i !== pos) : [...localValue, item];
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
		const rows = $pickerFetch?.rows ?? [];

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			focusIdx = Math.min(focusIdx + 1, rows.length - 1);
			if (focusIdx < 0 && rows.length) focusIdx = 0;
			scrollHighlightedIntoView();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			focusIdx = Math.max(focusIdx - 1, 0);
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
		focusIdx = popupSearchTerm && ($pickerFetch?.rows?.length ?? 0) ? 0 : -1;
		schedulePickerSearch(popupSearchTerm);
	};

	const clearPopupSearch = () => {
		popupSearchTerm = '';
		focusIdx = -1;
		schedulePickerSearch('');
	};

	$effect(() => {
		if ($csm !== 'editing' || !canFetchPicker || !writable) {
			pickerFetch = undefined;
			return;
		}

		const initLimit = pickerInitLimit;
		pickerCurrentLimit = initLimit;

		untrack(() => {
			pickerFetch = fetchData({
				API,
				datasource: getPickerDatasource(),
				options: {
					...(isUser ? {} : { query: buildPickerQuery('') }),
					limit: initLimit,
					...(isRecursiveTable && config.sortColumn
						? { sortColumn: config.sortColumn, sortOrder: config.sortOrder }
						: {})
				}
			});
		});
	});

	$effect(() => {
		if ($pickerFetch?.rows) {
			focusIdx = Math.min(focusIdx, $pickerFetch.rows.length - 1);
		}
	});

	$effect(() => {
		const raw = value;
		const linkedTableId = tableId;
		const generation = ++enrichGeneration;

		untrack(async () => {
			localValue = toLocalValue(raw);
			await enrichSelfReference(raw, linkedTableId, generation);
			if (generation !== enrichGeneration) return;

			const displayField =
				primaryDisplayField || fieldSchema?.primaryDisplay || (isUser ? 'email' : undefined);

			if (displayField) {
				await loadMissingOptions(localValue, linkedTableId, displayField);
			}
		});
	});

	$effect(() => {
		if (!canFetchPicker || !writable) return;

		untrack(() => {
			optionsFetch = fetchData({
				API,
				datasource: getPickerDatasource(),
				options: {
					...(isUser ? {} : { query: QueryUtils.buildQuery(filter) }),
					limit: 1
				}
			});
		});
	});

	$effect(() => {
		const definition = $optionsFetch?.definition;
		if (!definition) return;
		primaryDisplayField =
			fieldSchema?.primaryDisplay ||
			('primaryDisplay' in definition ? definition.primaryDisplay : undefined) ||
			(isUser ? 'email' : undefined);
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
	{multirow}
	isDirty={isDirty && showDirty}
	popupOpen={open}
	{copyIcon}
	{tabindex}
	{buttons}
>
	{#key $csm}
		<span class="value" class:placeholder={isEmpty}>
			<div class="value-content" use:tooltip>
				{#key localValue}
					{#if isEmpty}
						{placeholder || 'Select...'}
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
		</span>

		{#if $csm === 'view' || $csm === 'editing'}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<i class="ph ph-caret-down control-icon" on:click|self={csm.click}></i>
		{/if}
	{/key}
</BaseCell>

{#if $csm === 'editing'}
	<SuperPopover {anchor} {open} useAnchorWidth={true} dismissible={false}>
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
				<LinkPickerTree
					{fieldSchema}
					rows={$pickerFetch?.rows ?? []}
					loading={$pickerFetch?.loading ?? false}
					loaded={$pickerFetch?.loaded ?? false}
					primaryDisplay={pickerPrimaryDisplay}
					idColumn={pickerIdColumn}
					joinColumn={config.joinColumn}
					value={localValue}
					{ownId}
					multi={fieldSchema.relationshipType === 'many-to-many' ||
						fieldSchema.relationshipType === 'many-to-one'}
					on:change={handlePickerChange}
				/>
			{:else if $pickerFetch}
				<LinkPickerSelect
					rows={$pickerFetch.rows ?? []}
					loading={$pickerFetch.loading ?? false}
					loaded={$pickerFetch.loaded ?? false}
					primaryDisplay={pickerPrimaryDisplay}
					{singleSelect}
					value={localValue}
					bind:focusIdx
					wide={config.wide && !singleSelect}
					on:change={handlePickerChange}
					on:fetchmore={fetchMorePickerRows}
				/>
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

	.items.links .item {
		cursor: pointer;
		color: var(--spectrum-global-color-blue-600);
	}

	.items.links .item:hover {
		text-decoration: underline;
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
