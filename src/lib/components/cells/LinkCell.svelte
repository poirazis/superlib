<script lang="ts">
	import { getContext, untrack } from 'svelte';
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
		autofocus = false
	} = $props();

	let anchor = $state<HTMLElement | null>(null);
	let popup = $state<HTMLElement | null>(null);
	let pickerApi = $state<{ focus?: () => void }>();
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

	let datasourceType = $derived(isUser ? 'user' : 'table');
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

	const loadMissingOptions = async (
		items: LinkItem[],
		linkedTableId?: string,
		primaryDisplay?: string
	) => {
		if (!linkedTableId || !primaryDisplay || !writable) return;

		const missingIds = items
			.filter((item) => item.primaryDisplay === item._id || !item.primaryDisplay)
			.map((item) => item._id);

		if (!missingIds.length || loadingMissing) return;

		loadingMissing = true;
		try {
			const res = await API.searchTable(linkedTableId, {
				query: {
					oneOf: {
						_id: missingIds
					}
				}
			});

			const enriched = new Map(localValue.map((item) => [item._id, item]));

			for (const row of res.rows ?? []) {
				const option = parseLinkItem(row, primaryDisplay);
				if (option) enriched.set(option._id, option);
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
				dispatch('enteredit');
				setTimeout(() => pickerApi?.focus?.(), 0);
			},
			_exit: () => {
				open = false;
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
				} else if (open) {
					pickerApi?.focus?.();
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
				if (e.key === 'Escape') {
					e.preventDefault();
					if (open) {
						open = false;
						anchor?.focus();
					} else {
						return this.cancel();
					}
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

	$effect(() => {
		const raw = value;
		const linkedTableId = tableId;
		const generation = ++enrichGeneration;

		untrack(async () => {
			localValue = toLocalValue(raw);
			await enrichSelfReference(raw, linkedTableId, generation);
			if (generation !== enrichGeneration) return;

			const displayField = primaryDisplayField || fieldSchema?.primaryDisplay;

			if (displayField) {
				await loadMissingOptions(localValue, linkedTableId, displayField);
			}
		});
	});

	$effect(() => {
		if (!tableId || !writable) return;

		untrack(() => {
			const query = QueryUtils.buildQuery(filter);
			optionsFetch = fetchData({
				API,
				datasource: {
					type: datasourceType,
					tableId
				},
				options: {
					query,
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
			{#if fieldSchema?.recursiveTable}
				<LinkPickerTree
					{fieldSchema}
					{filter}
					search={config.search}
					{limit}
					joinColumn={config.joinColumn}
					value={localValue}
					{ownId}
					multi={fieldSchema.relationshipType === 'many-to-many' ||
						fieldSchema.relationshipType === 'many-to-one'}
					on:change={handlePickerChange}
				/>
			{:else}
				<LinkPickerSelect
					bind:api={pickerApi}
					{fieldSchema}
					{filter}
					{singleSelect}
					value={localValue}
					wide={config.wide && !singleSelect}
					on:change={handlePickerChange}
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
</style>
