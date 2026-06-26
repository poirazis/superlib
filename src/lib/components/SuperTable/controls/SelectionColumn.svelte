<script>
	import { getContext } from 'svelte';
	import Checkbox from '../../UI/elements/Checkbox.svelte';
	import SimpleButton from '../../buttons/SimpleButton.svelte';

	let {
		stbSettings,
		stbState,
		tableAPI,
		rowState,
		rows = [],
		visibleRows = [],
		horizontalScrollPos = 0
	} = $props();

	const getStbSelected = getContext('stbSelected');

	let partialSelection = $derived(getStbSelected().size && getStbSelected().size != rows.length);
	let fullSelection = $derived(getStbSelected().size == rows.length && rows.length > 0);
	let hideSelectionColumn = $derived(stbSettings.appearance?.hideSelectionColumn);
	let numbering = $derived(stbSettings.appearance?.numberingColumn);
	let checkBoxes = $derived(stbSettings.features?.canSelect && !hideSelectionColumn);
	let canDelete = $derived(stbSettings.features?.canDelete);
	let sticky = $derived(horizontalScrollPos > 0);
	let visible = $derived((numbering || checkBoxes || canDelete) && !hideSelectionColumn);
	let quiet = $derived(stbSettings.appearance?.quiet);
	let headerCheckbox = $derived(
		checkBoxes && stbSettings.features?.maxSelected != 1 && visibleRows.length > 0
	);
	let inInsert = $derived($stbState == 'Inserting');
</script>

{#if visible}
	<div class="super-column control-column" class:sticky>
		{#if stbSettings?.showHeader}
			<div class="control-column-header" style:gap={'1rem'}>
				{#if numbering}
					<span class="row-number"></span>
				{/if}

				{#if headerCheckbox}
					<Checkbox
						checked={fullSelection}
						partial={partialSelection}
						on:change={tableAPI.selectAllRows}
					/>
				{/if}

				{#if canDelete && getStbSelected().size > 1}
					<SimpleButton
						iconOnly
						icon="ph ph-trash"
						color="var(--spectrum-global-color-red-400)"
						disabled={getStbSelected().size == 0}
						on:click={tableAPI.deleteSelectedRows}
					/>
				{/if}
			</div>
		{/if}

		<div
			class="super-column-body"
			class:quiet
			class:sticky
			style:margin-top={'var(--super-column-top-offset)'}
			style:border-right={'1px solid var(--super-table-devider-color, --spectrum-global-color-gray-200)'}
		>
			{#each visibleRows as visibleRow (visibleRow)}
				{@const row = rows[visibleRow]}
				{@const meta = row?.__meta}
				{@const selected = getStbSelected().has(visibleRow)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<!-- svelte-ignore event_directive_deprecated -->
				<div
					class="super-row selection"
					class:selected
					class:hovered={rowState.hovered == visibleRow || rowState.menuRow == visibleRow}
					class:disabled={meta?.disabled}
					on:mouseenter={() => (rowState.hovered = visibleRow)}
					on:mouseleave={() => (rowState.hovered = -1)}
				>
					{#if numbering}
						<div class="row-number">
							{visibleRow + 1}
						</div>
					{/if}

					{#if stbSettings.features.canSelect && !hideSelectionColumn}
						<Checkbox
							checked={selected}
							locked={inInsert || meta?.disabled}
							disabled={inInsert}
							hovered={rowState.hovered == visibleRow}
							on:change={() => tableAPI.selectRow(visibleRow)}
						/>
					{/if}

					{#if canDelete}
						<SimpleButton
							iconOnly
							icon="ph ph-trash"
							color="var(--spectrum-global-color-red-400)"
							disabled={inInsert || meta?.disabled}
							on:click={() => tableAPI.deleteRow(visibleRow)}
						/>
					{/if}
				</div>
			{/each}

			{#if $stbState == 'Inserting'}
				<div class="add-row" style="padding: unset;"></div>
			{/if}
		</div>

		{#if stbSettings.showFooter}
			<div class="super-column-footer" style:padding={'unset'}></div>
		{/if}
	</div>
{/if}

<style>
	.selection {
		flex: auto;
		padding-left: 0.5rem;
		padding-right: 0.5rem;
		gap: 0.5rem;
		font-size: 13px;
		font-weight: 500;
		align-items: center;
		justify-content: center;
	}

	.row-number {
		color: var(--spectrum-global-color-gray-500);
		font-family: monospace;
		margin-right: 0.5rem;
	}
</style>
