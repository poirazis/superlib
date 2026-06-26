<script>
	import { getContext, onMount, onDestroy, untrack } from 'svelte';
	import fsm from 'svelte-fsm';
	import { deepGet } from '../../utils/objectUtils.ts';

	const { processStringSync } = getContext('sdk');

	import SuperColumnHeader from './parts/SuperColumnHeader.svelte';
	import SuperColumnBody from './parts/SuperColumnBody.svelte';
	import SuperColumnFooter from './parts/SuperColumnFooter.svelte';

	const rowState = getContext('rowState');
	const stbState = getContext('stbState');
	const tableAPI = getContext('tableAPI');
	const getStbVisibleRows = getContext('stbVisibleRows');
	let visibleRows = $derived(getStbVisibleRows());

	const getData = getContext('data');
	let data = $derived(getData());
	const new_row = getContext('new_row');

	let { columnOptions, sticky, scrollPos, children } = $props();

	const MIN_COLUMN_WIDTH = 48;

	let id = Math.random() * 100;
	let resizing = $state(false);
	let considerResizing = $state(false);
	let startPoint = $state(0);
	let startWidth = $state(0);
	let sorted = $state(undefined);
	let viewport;
	let columnLockWidth = $state(0);
	let hasUserWidth = $state(false);

	const columnState = fsm('Idle', {
		'*': {
			reset() {
				return 'Idle';
			},
			headerClicked() {
				if (columnOptions.canFilter) return this.filter();
				return this.sort();
			},
			sort() {
				if (columnOptions.canSort) {
					stbState.sortBy(columnOptions.name, sorted == 'ascending' ? 'descending' : 'ascending');
				}
			},
			lockWidth() {
				if (!resizing && viewport?.clientWidth) {
					columnLockWidth = viewport.clientWidth;
				}
			},
			unlockWidth() {
				if (resizing) return;
				columnLockWidth = 0;
				if (!columnOptions.asComponent) this.lockWidth.debounce(150);
			},
			startResizing(e) {
				e.stopPropagation();
				e.preventDefault();
				tableAPI.startResize();
				resizing = true;
				startPoint = e.clientX;
				startWidth = viewport?.clientWidth ?? columnLockWidth ?? MIN_COLUMN_WIDTH;
				columnLockWidth = startWidth;
			},
			resize(e) {
				columnLockWidth = Math.max(MIN_COLUMN_WIDTH, startWidth + e.clientX - startPoint);
			},
			stopResizing(e) {
				e.preventDefault();
				e.stopPropagation();
				tableAPI.endResize();
				resizing = false;
				startPoint = 0;
				hasUserWidth = columnLockWidth > 0;
			},
			resetSize(e) {
				e.preventDefault();
				e.stopPropagation();
				columnLockWidth = 0;
				hasUserWidth = false;
			}
		},
		Idle: {
			_enter() {
				if (!hasUserWidth) {
					columnLockWidth = 0;
				}
			},
			filter() {
				return columnOptions.canFilter ? 'Entering' : 'Idle';
			},
			enteredit(index) {
				rowState.editing = index;
				stbState.edit();
				return 'EditingCell';
			},
			addRow() {
				return 'Inserting';
			},
			unlockWidth() {
				if (resizing) return;
				columnLockWidth = 0;
				if (!columnOptions.asComponent) this.lockWidth.debounce(150);
			}
		},
		Entering: {
			_enter() {
				if (viewport?.clientWidth) {
					columnLockWidth = viewport.clientWidth;
				}
			},
			submitFilter(input) {
				tableAPI.applyColumnFilter(id, columnOptions, input);
				return 'Filtered';
			},
			clearValue() {
				stbState.clearFilter(id);
				return 'Entering';
			},
			cancel() {
				return 'Idle';
			}
		},
		Filtered: {
			submitFilter(input) {
				tableAPI.applyColumnFilter(id, columnOptions, input);
			},
			clearValue() {
				stbState.clearFilter(id);
				return 'Entering';
			}
		},
		EditingCell: {
			_enter() {
				if (viewport?.clientWidth) {
					columnLockWidth = Math.max(viewport.clientWidth, 80);
				}
				stbState.edit.debounce(30);
			},
			patchRow(index, id, rev, field, change) {
				stbState.patchRow(index, id, rev, field, change);
			},
			exitedit(index) {
				rowState.editing = -1;
				stbState.endEdit.debounce(50);
				return 'Idle';
			}
		},
		Inserting: {
			_enter() {
				if (viewport?.clientWidth) {
					columnLockWidth = viewport.clientWidth;
				}
			},
			_exit() {
				if (!hasUserWidth) {
					columnLockWidth = 0;
				}
			},
			cancelAddRow() {
				return 'Idle';
			}
		}
	});

	let maxWidth = $derived(getMaxWidth(columnLockWidth, columnOptions));
	let minWidth = $derived(getMinWidth(columnLockWidth, columnOptions));
	let lockedWidth = $derived(columnLockWidth > 0 ? `${columnLockWidth}px` : undefined);

	let values = $derived(data.map((row) => deepGet(row, columnOptions.name, true)));

	let footerLabel = $derived(
		columnOptions.footerTemplate
			? processStringSync(columnOptions.footerTemplate, {
					values
				})
			: undefined
	);

	$effect(() => {
		const columnName = columnOptions.name;
		const sortColumn = columnOptions.sortColumn;
		const sortOrder = columnOptions.sortOrder;
		untrack(() => {
			if (sortColumn == columnName) {
				sorted = sortOrder;
			} else if (sortColumn != columnName && sorted) {
				sorted = undefined;
			}
		});
	});

	let inserting = $derived($columnState === 'Inserting');

	const getMinWidth = (val, options) => {
		if (val > 0) return `${val}px`;
		if (options.widthOverride) return options.widthOverride;

		return options.sizing == 'fixed' ? options.fixedWidth : options.minWidth;
	};

	const getMaxWidth = (val, options) => {
		if (val > 0) return `${val}px`;
		if (options.widthOverride) return options.widthOverride;

		if (options.sizing == 'fixed') return options.fixedWidth;

		const configuredMax = options.maxWidth;
		return configuredMax && configuredMax !== 'auto' && configuredMax !== 'none'
			? configuredMax
			: 'unset';
	};

	onMount(() => {
		tableAPI?.registerSuperColumn(id, columnState);

		// Auto-lock width after initial render for flexible columns only
		if (
			(columnOptions.sizing === 'flexible' || columnOptions.sizing === 'flex') &&
			columnOptions.sizing !== 'fixed'
		) {
			// Use a timeout to ensure the DOM has rendered
			setTimeout(() => {
				if (viewport && columnLockWidth === 0 && !hasUserWidth && !columnOptions.asComponent) {
					columnLockWidth = viewport.clientWidth;
				}
			}, 0);
		}
	});

	onDestroy(() => {
		tableAPI?.unregisterSuperColumn(id);
	});
</script>

<!-- svelte-ignore event_directive_deprecated -->
<svelte:window
	on:mouseup={columnOptions.canResize
		? (e) => {
				if (resizing) columnState.stopResizing(e);
			}
		: null}
	on:mousemove={columnOptions.canResize
		? (e) => {
				if (resizing) columnState.resize(e);
			}
		: null}
/>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore event_directive_deprecated -->
<div
	bind:this={viewport}
	class="super-column"
	class:sticky={sticky && scrollPos}
	class:resizing
	class:considerResizing={considerResizing && !resizing}
	class:isLast={columnOptions.isLast}
	style:width={lockedWidth}
	style:max-width={maxWidth}
	style:min-width={minWidth}
	style:flex={columnLockWidth > 0 ? 'none' : undefined}
	on:mouseleave={() => (rowState.hovered = -1)}
>
	{#if columnOptions.showHeader && columnOptions.canResize}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore event_directive_deprecated -->
		<div
			class="grabber"
			on:mousedown={columnState.startResizing}
			on:dblclick={columnState.resetSize}
			on:mouseenter={() => (considerResizing = true)}
			on:mouseleave={() => (considerResizing = false)}
		></div>
	{/if}

	<SuperColumnHeader {columnOptions} {columnState} {sorted} />

	<SuperColumnBody
		rows={data}
		{visibleRows}
		{columnOptions}
		{columnState}
		{rowState}
		{stbState}
		{tableAPI}
		newRow={new_row}
		isLast={columnOptions.isLast}
		isFirst={columnOptions.isFirst}
		isFirstInsertable={columnOptions.isFirstInsertable}
		{inserting}
	>
		{@render children?.()}
	</SuperColumnBody>

	<SuperColumnFooter {columnOptions} {footerLabel} />
</div>
