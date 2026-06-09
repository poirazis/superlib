<script>
	import { getContext, createEventDispatcher } from 'svelte';
	import fsm from 'svelte-fsm';
	import PickerPopover from './PickerPopover.svelte';
	import CellLinkPickerSelect from './CellLinkPickerSelect.svelte';
	import CellLinkPickerTree from './CellLinkPickerTree.svelte';
	import './CellCommon.css';

	const dispatch = createEventDispatcher();
	const { API } = getContext('sdk');

	let {
		value,
		fieldSchema,
		cellOptions,
		simpleView: simpleViewProp = true,
		filter = [],
		limit = 100,
		ownId: ownIdProp,
		isUserSelect = false
	} = $props();

	// svelte-ignore state_referenced_locally
	let originalValue = $state(JSON.stringify(value));
	let anchor = $state();
	let popup = $state();
	let pickerApi = $state();
	let localValue = $state([]);

	let config = $derived(cellOptions ?? {});
	let multi = $derived(!fieldSchema?.type?.includes('_single'));
	let isUser = $derived(fieldSchema?.type?.includes('bb_reference') || isUserSelect);
	let pills = $derived(config.relViewMode == 'pills');
	let valueIcon = $derived(fieldSchema?.type == 'link' ? 'ri-edit-box-line' : 'ri-user-line');
	let links = $derived(config.relViewMode == 'links' && !isUser);
	let ownId = $derived(ownIdProp || config?.ownId);
	let inEdit = $derived($cellState == 'Editing');
	let isDirty = $derived(inEdit && originalValue != JSON.stringify(localValue));
	let simpleView = $derived(config.relViewMode == 'text');
	let inline = $derived(config.role == 'inlineInput');
	let multirow = $derived(
		config.controlType == 'expanded' && ((localValue?.length ?? 0) > 1 || inEdit)
	);
	let singleSelect = $derived(
		fieldSchema?.relationshipType == 'one-to-many' ||
			fieldSchema?.relationshipType == 'self' ||
			!multi
	);
	let returnSingle = $derived(isUser && !multi);
	let placeholder = $derived(config.placeholder || '');
	let readonly = $derived(config.readonly || config.disabled);

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
			focusout(e) {
				if (popup?.contains(e?.relatedTarget)) return;
				this.submit();
			},
			popupfocusout(e) {
				if (anchor != e?.relatedTarget) {
					this.submit();
				}
			},
			toggle() {
				editorState.toggle();
			},
			clear() {
				localValue = [];
			},
			submit() {
				if (isDirty) {
					dispatch('change', returnSingle && localValue ? localValue[0] : localValue);
				}
				return 'View';
			},
			cancel() {
				localValue = JSON.parse(originalValue);
				anchor?.blur();
				return 'View';
			}
		}
	});

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

	const enrichValue = (x) => {
		if (fieldSchema?.relationshipType == 'self' && x && !Array.isArray(x)) {
			API.fetchRow(fieldSchema.tableId, x, true)
				.then((row) => {
					localValue = [
						{
							_id: row.id,
							primaryDisplay: fieldSchema.primaryDisplay
								? row[fieldSchema.primaryDisplay]
								: row.name || row.id
						}
					];
				})
				.catch(() => {
					localValue = [];
				});
			return localValue || [];
		} else if (multi) {
			return x ? [...x] : [];
		}
		return x ? [x] : [];
	};

	$effect(() => {
		localValue = enrichValue(value);
	});

	const handleKeyboard = (e) => {
		if (e.key == 'Escape' && $editorState == 'Open') {
			editorState.close();
			return;
		} else if (e.key == 'Escape') {
			cellState.cancel();
		} else if (e.keyCode == 32 && $cellState == 'Editing') {
			editorState.toggle();
		} else if (e.key == 'Tab' && $editorState == 'Open') {
			cellState.focusout();
		} else if ($editorState == 'Open') {
			pickerApi?.focus();
		}
	};

	const handleChange = (e) => {
		localValue = e.detail;

		if (singleSelect) {
			editorState.close();
		}

		if (config.debounced) {
			dispatch('change', returnSingle && localValue ? localValue[0] : localValue);
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
	class:multirow
	class:tableCell={config.role == 'tableCell'}
	class:formInput={config.role == 'formInput'}
	class:disabled={config.disabled}
	class:readonly
	class:open-popup={$editorState == 'Open'}
	class:error={config.error}
	style:color={config.color}
	style:background={config.background}
	on:focus={cellState.focus}
	on:keydown|self={handleKeyboard}
	on:focusout={cellState.focusout}
	on:mousedown={cellState.toggle}
>
	{#if config?.icon}
		<i class={config.icon + ' field-icon'}></i>
	{/if}

	<div class="value" class:placeholder={(localValue?.length ?? 0) < 1}>
		{#if simpleView}
			<span>
				{#if config.role == 'formInput' && localValue.length > 1}
					({localValue.length})
				{/if}
				{localValue.map((v) => v.primaryDisplay).join(', ') || placeholder}
			</span>
		{:else}
			<div
				class="items"
				class:pills
				class:links
				class:isUser
				class:withCount={localValue.length > 5}
				class:inEdit
			>
				{#each localValue as val, idx (val)}
					{#if idx < 5}
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

				{#if localValue.length == 0}
					<span>{placeholder}</span>
				{/if}

				{#if localValue.length > 5}
					<span class="count">
						(+ {localValue.length - 5})
					</span>
				{/if}
			</div>
		{/if}
	</div>
	{#if !readonly && (config.role == 'formInput' || inEdit)}
		<i class="ph ph-caret-down control-icon"></i>
	{/if}
</div>

<PickerPopover {anchor} visible={inEdit} useAnchorWidth open={$editorState == 'Open'}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore event_directive_deprecated -->
	<div
		class="picker-container"
		bind:this={popup}
		on:keydown={(e) => {
			if (e.key == 'Escape' || e.key == 'Tab') {
				anchor?.focus();
				editorState.close();
				e.preventDefault();
			}
		}}
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
				multi={fieldSchema.relationshipType == 'many-to-many' ||
					fieldSchema.relationshipType == 'many-to-one'}
				on:change={handleChange}
			/>
		{:else}
			<CellLinkPickerSelect
				bind:api={pickerApi}
				{fieldSchema}
				filter={filter ?? []}
				{singleSelect}
				value={localValue}
				wide={config.wide && !singleSelect}
				on:change={handleChange}
				on:focusout={cellState.popupfocusout}
			/>
		{/if}
	</div>
</PickerPopover>