<script lang="ts">
	import { createEventDispatcher, getContext, untrack } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import SuperPopover from '../SuperPopover/SuperPopover.svelte';
	import CellSQLLinkPicker from './CellSQLLinkPicker.svelte';
	import CellLinkPickerTree from './CellLinkPickerTree.svelte';
	import { tooltip } from '../../actions/tooltip';
	import { copyAndTransition, deferJustCopied } from './cellClipboard';

	interface SQLLinkItem {
		primaryDisplay: string;
		[key: string]: unknown;
	}

	const dispatch = createEventDispatcher();
	const { API } = getContext('sdk');

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
		children
	} = $props();

	let anchor = $state<HTMLElement | null>(null);
	let picker = $state<HTMLElement | null>(null);
	let popup = $state<HTMLElement | null>(null);
	let pickerApi = $state<{ focus?: () => void }>();
	let open = $state(false);
	let localValue = $state<SQLLinkItem[]>([]);
	let originalValue = $state('[]');
	let primaryDisplayField = $state<string | undefined>();
	let isLoading = $state(false);
	let enrichGeneration = 0;

	let config = $derived(cellOptions ?? {});
	let resolvedFilter = $derived(filter ?? []);
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
	let writable = $derived(!disabled && !readonly);
	let isEmpty = $derived((localValue?.length ?? 0) < 1);
	let tabindex = $state(0);

	const getEmittedLabel = () => {
		if (!localValue.length) return null;
		return localValue.map((item) => item.primaryDisplay).join(', ');
	};

	const focusMovedToPicker = (related: EventTarget | null) => {
		if (!(related instanceof Node)) {
			return popup?.matches(':focus-within') ?? false;
		}
		return (
			picker?.contains(related) ||
			popup?.contains(related) ||
			anchor?.contains(related)
		);
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
				dispatch('enteredit');
				setTimeout(() => pickerApi?.focus?.(), 0);
			},
			_exit: () => {
				open = false;
				dispatch('exitedit');
				if (isDirty) {
					dispatch('change', localValue);
					dispatch('labelChange', getEmittedLabel());
				}
			},
			click: () => {
				open = !open;
			},
			keydown: (e: KeyboardEvent) => {
				if (e.key === ' ' || e.keyCode === 32) {
					e.preventDefault();
					open = !open;
				} else if (e.key === 'Escape') {
					if (open) {
						open = false;
					} else {
						localValue = JSON.parse(originalValue);
						anchor?.blur();
						return 'view';
					}
				} else if (e.key === 'Tab' && open) {
					anchor?.blur();
					return 'view';
				} else if (open) {
					pickerApi?.focus?.();
				}
			},
			focusout: (e: FocusEvent) => {
				if (focusMovedToPicker(e.relatedTarget)) return;
				return 'view';
			},
			popupfocusout: (e: FocusEvent) => {
				if (focusMovedToPicker(e.relatedTarget)) return;
				return 'view';
			},
			selectChange: (nextValue: SQLLinkItem[]) => {
				localValue = nextValue;

				if (!multi) {
					open = false;
					anchor?.blur();
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

		{#if !readonly && ($csm === 'view' || $csm === 'editing')}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<i class="ph ph-caret-down control-icon" on:click|self={csm.click}></i>
		{/if}
	{/key}
</BaseCell>

{#if $csm === 'editing'}
	<SuperPopover
		{anchor}
		bind:open
		bind:popup
		useAnchorWidth={true}
		minWidth={config.pickerWidth || undefined}
		align="left"
		dismissible={false}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore event_directive_deprecated -->
		<div
			class="picker-container"
			bind:this={picker}
			on:keydown={(e) => {
				if (e.key === 'Escape' || e.key === 'Tab') {
					anchor?.focus();
					open = false;
					e.preventDefault();
				}
			}}
		>
			{#if fieldSchema?.recursiveTable}
				<CellLinkPickerTree
					{fieldSchema}
					filter={resolvedFilter}
					search={config.search}
					{limit}
					joinColumn={config.joinColumn}
					value={localValue}
					{ownId}
					{multi}
					on:change={handlePickerChange}
				/>
			{:else}
				<CellSQLLinkPicker
					{fieldSchema}
					filter={resolvedFilter}
					{multi}
					value={localValue}
					bind:api={pickerApi}
					on:change={handlePickerChange}
					on:focusout={csm.popupfocusout}
				>
					{@render children?.()}
				</CellSQLLinkPicker>
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

	.picker-container {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
</style>