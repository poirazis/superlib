<script>
	import { getCellComponent } from '../../../utils/cellComponentMap.ts';

	let { row = {}, isFirstInsertable = false, isLast, color, columnSettings, stbState } = $props();

	let CellComponent = $derived(
		getCellComponent(
			columnSettings.schema,
			Boolean(columnSettings.canEdit && columnSettings.canInsert),
			true
		)
	);
	let fieldError = $derived(row.errors && row.errors[columnSettings.name]);
</script>

<div class="super-row new-row" style:min-height={'2rem'} style:color class:isLast>
	<CellComponent
		cellOptions={{
			...columnSettings.cellOptions,
			readonly: false,
			error: fieldError,
			showDirty: false
		}}
		autofocus={isFirstInsertable}
		fieldSchema={columnSettings.schema}
		tableid={columnSettings.tableId}
		value={row[columnSettings.name]}
		multi={columnSettings.schema.type == 'array'}
		on:change={(e) => {
			stbState.setValue(columnSettings.name, e.detail);
		}}
	/>
	{#if fieldError}
		<div class="info" class:bottom={true}>{fieldError}</div>
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
