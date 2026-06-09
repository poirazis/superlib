<script>
	import { createEventDispatcher, getContext } from 'svelte';
	import fsm from 'svelte-fsm';
	import PickerPopover from './PickerPopover.svelte';
	import CellSQLLinkPicker from './CellSQLLinkPicker.svelte';
	import CellLinkPickerTree from './CellLinkPickerTree.svelte';
	import './CellCommon.css';

	const dispatch = createEventDispatcher();
	const { API } = getContext('sdk');

	let {
		value,
		fieldSchema,
		cellOptions,
		filter = [],
		limit = 100,
		multi = false,
		ownId: ownIdProp,
		children
	} = $props();

	// svelte-ignore state_referenced_locally
	let originalValue = $state(JSON.stringify(value));
	let anchor = $state();
	let popup = $state();
	let pickerApi = $state();
	let isLoading = $state(false);
	let localValue = $state([]);

	let config = $derived(cellOptions ?? {});
	let relatedField = $derived(fieldSchema?.relatedField || 'id');
	let relatedTableId = $derived(fieldSchema?.tableId);
	let pills = $derived(config.relViewMode == 'pills');
	let ownId = $derived(ownIdProp || config?.ownId);
	let inEdit = $derived($cellState == 'Editing');
	let isDirty = $derived(inEdit && originalValue != JSON.stringify(localValue));
	let inline = $derived(config.role == 'inlineInput');
	let placeholder = $derived(config.placeholder || '');
	let readonly = $derived(config.readonly || config.disabled);

	const editorState = fsm('Closed', {
		Open: {
			close() {
				return 'Closed';
			},
			toggle() {
				return 'Closed';
			}
		},
		Closed: {
			open() {
				return 'Open';
			},
			toggle() {
				return 'Open';
			}
		}
	});

	// svelte-ignore state_referenced_locally
	export const cellState = fsm(cellOptions?.initialState ?? 'View', {
		'*': {
			goTo(state) {
				return state;
			},
			reset() {
				localValue = undefined;
			}
		},
		View: {
			_enter() {},
			toggle() {},
			focus() {
				if (!config.readonly && !config.disabled) return 'Editing';
			}
		},
		Editing: {
			_enter() {
				originalValue = JSON.stringify(localValue);
				editorState.open();
				dispatch('enteredit');
			},
			_exit() {
				editorState.close();
				dispatch('exitedit');
			},
			toggle() {
				editorState.toggle();
			},
			focusout(e) {
				if (popup?.contains(e?.relatedTarget)) return;
				this.submit();
			},
			popupfocusout(e) {
				if (anchor != e?.relatedTarget) {
					this.submit();
				}
			},
			clear() {
				localValue = [];
			},
			submit() {
				if (isDirty) dispatch('change', localValue);
				return 'View';
			},
			cancel() {
				anchor?.blur();
				localValue = JSON.parse(originalValue);
				return 'View';
			}
		}
	});

	const enrichValue = (x) => {
		if (Array.isArray(x) && multi) {
			const existingIds = localValue ? localValue.map((v) => v[relatedField]) : [];
			const missingIds = x.filter((id) => !existingIds.includes(id));
			if (missingIds.length > 0) {
				isLoading = true;
				API.fetchTableDefinition(relatedTableId).then((def) => {
					fieldSchema.primaryDisplay = def.primaryDisplay;
				});

				Promise.all(missingIds.map((id) => API.fetchRow(relatedTableId, id, true)))
					.then((rows) => {
						const newEnriched = rows.map((row) => ({
							...row,
							primaryDisplay: fieldSchema.primaryDisplay
								? row[fieldSchema.primaryDisplay]
								: row.name || row.id
						}));
						localValue = [...(localValue || []), ...newEnriched];
						dispatch('enrich', { rows: newEnriched });
						isLoading = false;
					})
					.catch(() => {
						isLoading = false;
					});
			}
			return localValue || [];
		} else if (x && !Array.isArray(x)) {
			const existing = localValue && localValue.find((v) => v[relatedField] === x);
			if (!existing) {
				isLoading = true;
				API.fetchTableDefinition(relatedTableId).then((def) => {
					fieldSchema.primaryDisplay = def.primaryDisplay;
				});

				API.fetchRow(relatedTableId, x, true)
					.then((row) => {
						const enrichedRow = {
							...row,
							primaryDisplay: fieldSchema.primaryDisplay
								? row[fieldSchema.primaryDisplay]
								: row.name || row.id
						};
						localValue = [enrichedRow];
						dispatch('enrich', { rows: [enrichedRow] });
						isLoading = false;
					})
					.catch(() => {
						localValue = [];
						isLoading = false;
					});
			}
			return localValue || [];
		} else if (multi) {
			return value && Array.isArray(value) ? value : [];
		}
		return value ? [value] : [];
	};

	$effect(() => {
		localValue = enrichValue(value);
	});

	const handleKeyboard = (e) => {
		if (e.key == 'Escape') {
			if ($editorState == 'Open') {
				editorState.close();
			} else {
				cellState.focusout(e);
			}
		} else if (e.keyCode == 32 && $cellState == 'Editing') {
			editorState.toggle();
		} else if (e.key == 'Tab' && $editorState == 'Open') {
			cellState.focusout(e);
		} else if ($editorState == 'Open') {
			pickerApi?.focus();
		}
	};

	const handleChange = (e) => {
		localValue = e.detail;

		if (!multi) {
			editorState.close();
			anchor?.focus();
		}
	};
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore event_directive_deprecated -->
<div
	class="superCell has-popup"
	tabindex={config?.disabled ? -1 : 0}
	bind:this={anchor}
	class:isDirty={isDirty && config.showDirty}
	class:inEdit
	class:inline
	class:tableCell={config.role == 'tableCell'}
	class:formInput={config.role == 'formInput'}
	class:disabled={config.disabled}
	class:readonly
	class:open-popup={$editorState == 'Open'}
	class:error={config.error}
	style:color={config.color}
	style:background={config.background}
	on:focusin={cellState.focus}
	on:keydown|self={handleKeyboard}
	on:mousedown={cellState.toggle}
	on:focusout={cellState.focusout}
>
	{#if !isLoading}
		{#if config?.icon}
			<i class={config.icon + ' field-icon'}></i>
		{/if}

		<div class="value" class:placeholder={(localValue?.length ?? 0) < 1}>
			{#key localValue}
				{#if (localValue?.length ?? 0) < 1}
					<span> {placeholder} </span>
				{:else if pills}
					<div class="items" class:pills class:withCount={localValue.length > 5} class:inEdit>
						{#each localValue as val, idx (idx)}
							{#if idx < 5}
								<div class="item">
									<span>{val.primaryDisplay}</span>
								</div>
							{/if}
						{/each}
						{#if localValue.length > 5}
							<span class="count">
								(+ {localValue.length - 5})
							</span>
						{/if}
					</div>
				{:else}
					<span>
						{#if config.role == 'formInput' && localValue.length > 1}
							({localValue.length})
						{/if}
						{localValue.map((v) => v.primaryDisplay).join(', ')}
					</span>
				{/if}
			{/key}
		</div>
		{#if !readonly && (config.role == 'formInput' || inEdit)}
			<i class="ph ph-caret-down control-icon"></i>
		{/if}
	{/if}
</div>

<PickerPopover
	{anchor}
	visible={inEdit}
	useAnchorWidth={true}
	minWidth={config.pickerWidth || undefined}
	align="left"
	open={$editorState == 'Open'}
>
	{#if fieldSchema?.recursiveTable}
		<CellLinkPickerTree
			{fieldSchema}
			filter={filter ?? []}
			search={config.search}
			{limit}
			joinColumn={config.joinColumn}
			value={localValue}
			{ownId}
			{multi}
			on:change={handleChange}
		/>
	{:else}
		<CellSQLLinkPicker
			{fieldSchema}
			{filter}
			{multi}
			value={localValue}
			bind:api={pickerApi}
			on:change={handleChange}
			on:focusout={cellState.popupfocusout}
		>
			{@render children?.()}
		</CellSQLLinkPicker>
	{/if}
</PickerPopover>
