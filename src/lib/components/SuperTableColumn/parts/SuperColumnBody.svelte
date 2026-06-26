<script>
	import SuperColumnRow from './SuperColumnRow.svelte';
	import SuperColumnRowNew from './SuperColumnRowNew.svelte';

	let {
		columnOptions,
		isLast,
		isFirst,
		isFirstInsertable,
		rows,
		visibleRows,
		inserting,
		columnState,
		rowState,
		stbState,
		tableAPI,
		newRow,
		children
	} = $props();
</script>

<div
	class="super-column-body"
	style:margin-top={'var(--super-column-top-offset)'}
	tabindex="-1"
	class:is-last={isLast}
>
	{#each visibleRows as index (index)}
		<SuperColumnRow
			{isLast}
			{index}
			row={rows[index]}
			disabled={inserting}
			{columnOptions}
			{columnState}
			{rowState}
			{stbState}
			{tableAPI}
		>
			{@render children?.()}
		</SuperColumnRow>
	{/each}

	{#if inserting}
		<SuperColumnRowNew
			{isFirstInsertable}
			{isLast}
			row={$newRow}
			columnSettings={columnOptions}
			{stbState}
		/>
	{/if}
</div>