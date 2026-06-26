<script>
	import { getContext, onDestroy } from 'svelte';
	import { deepGet } from '../../../utils/objectUtils.ts';
	const { Provider, ContextScopes } = getContext('sdk');

	let {
		index,
		row: rowProp,
		columnOptions,
		isLast,
		disabled: disabledProp = false,
		columnState,
		rowState,
		stbState,
		tableAPI,
		children
	} = $props();

	const field = $derived(columnOptions.name);
	const idField = $derived(columnOptions.idColumn);

	let row = $state();
	let value = $state();
	let info = $state(undefined);

	$effect(() => {
		row = rowProp;
		value = deepGet(rowProp, field, true);
	});

	let id = $derived(row?.[idField] ?? index);

	const getStbSelected = getContext('stbSelected');

	let meta = $derived(row?.__meta);
	let cellDisplayValue = $derived(
		field in (meta?.formattedValues ?? {}) ? meta.formattedValues[field] : undefined
	);
	let color = $derived(meta?.color);
	let bgcolor = $derived(meta?.background);

	let hovered = $derived(rowState.hovered == index || rowState.menuRow == index);
	let selected = $derived(getStbSelected().has(index));
	let disabled = $derived(disabledProp || (meta?.disabled ?? false));
	let hasChildren = $derived(columnOptions.hasChildren > 0);
	let columnCanEdit = $derived(Boolean(columnOptions.canEdit));
	let isCellEditing = $derived($columnState === 'EditingCell' && rowState.editing === index);

	const patchRow = async (change) => {
		const patch = {
			[idField]: row[idField],
			...(row._rev != null ? { _rev: row._rev } : {}),
			[field]: change
		};

		try {
			let patched_row = await tableAPI.patchRow(index, patch);
			row = { ...patched_row };
		} catch (ex) {
			if (ex.json.validationErrors) {
				info = ex.json.validationErrors[field][0];
			} else {
				info = ex.message;
			}

			setTimeout(() => {
				info = undefined;
			}, 3250);
		} finally {
			value = deepGet(row, field, true);
		}
	};

	const onClick = () => {
		if (disabled) return;
		stbState.handleRowClick(index, field, deepGet(row, field, true), id);
	};

	const onCellClick = (e) => {
		if (disabled || !columnCanEdit || isCellEditing) return;
		e.stopPropagation();
		columnState.enteredit(index);
	};

	onDestroy(() => {
		if (rowState.editing == index) {
			columnState.exitedit();
		}
	});

	const onContextMenu = (e) => {
		tableAPI.showContextMenu(index, e.__root);
	};
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore event_directive_deprecated -->
<div
	class="super-row"
	class:selected
	class:hovered
	class:isEditing={isCellEditing}
	class:disabled
	class:isLast
	style:color
	style:background-color={bgcolor}
	on:mouseenter={() => {
		rowState.hovered = index;
	}}
	on:mouseleave={() => (rowState.hovered = -1)}
	on:click={onClick}
	on:contextmenu|preventDefault={onContextMenu}
>
	{#if !hasChildren}
		{#key columnOptions.cellComponent}
			{@const Cell = columnOptions.cellComponent}
			<Cell
				cellOptions={{
					...columnOptions.cellOptions,
					disabled
				}}
				fieldSchema={columnOptions.schema}
				tableid={columnOptions.tableId}
				{value}
				displayValue={cellDisplayValue}
				on:enteredit={() => columnState.enteredit(index)}
				on:exitedit={columnState.exitedit}
				on:change={(e) => patchRow(e.detail)}
			/>
		{/key}
		{#if info}
			<div class="info" class:bottom={index == 0}>{info}</div>
		{/if}
	{:else}
		<Provider
			data={{
				id,
				value,
				row,
				index
			}}
			scope={ContextScopes.Local}
		>
			{@render children?.()}
		</Provider>
	{/if}
</div>

<style>
	.info {
		position: absolute;
		top: -26px;
		font-size: 11px;
		background-color: var(--spectrum-global-color-red-400);
		border-radius: 4px;
		padding: 4px;

		&.bottom {
			top: unset;
			bottom: -26px;
		}
	}
</style>
