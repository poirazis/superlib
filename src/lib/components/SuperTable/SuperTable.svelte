<script lang="ts">
	import { getContext, setContext, onDestroy, tick, untrack } from 'svelte';
	import fsm from 'svelte-fsm';
	import { get, writable } from 'svelte/store';
	import type { SearchFilters } from '@budibase/types';
	import {
		sizingMap,
		resolveColumnFilterOptions,
		supportFilteringMap,
		supportSortingMap,
		supportEditingMap,
		resolveTableCellSearch
	} from '../../utils/tableConstants.ts';
	import { resolveConfiguredButtons } from '../../utils/buttonConditions.ts';
	import { deepGet } from '../../utils/objectUtils.ts';
	import './SuperTable.css';

	// Overlays
	import ScrollbarsOverlay from './overlays/ScrollbarsOverlay.svelte';
	import EmptyResultSetOverlay from './overlays/EmptyResultSetOverlay.svelte';
	import AddNewRowOverlay from './overlays/AddNewRowOverlay.svelte';
	import SelectedActionsOverlay from './overlays/SelectedActionsOverlay.svelte';
	import LoadingOverlay from './overlays/LoadingOverlay.svelte';
	import BaseTableCell from '../cells/BaseTableCell.svelte';

	// Components
	import SuperTableColumn from '../SuperTableColumn/SuperTableColumn.svelte';
	import { resolveColumnFlexAlign } from '../../utils/columnAlign.ts';
	import { getHeaderComponent } from '../../utils/cellComponentMap.ts';
	import RowButtonsColumn from './controls/RowButtonsColumn.svelte';
	import SelectionColumn from './controls/SelectionColumn.svelte';
	import RowContextMenu from './overlays/RowContextMenu.svelte';

	// Sections
	import ControlSection from './controls/ControlSection.svelte';
	import ColumnsSection from './controls/ColumnsSection.svelte';
	const sdk = getContext('sdk');
	const {
		API,
		processStringSync,
		notificationStore,
		enrichButtonActions,
		ActionTypes,
		Provider,
		fetchData,
		QueryUtils
	} = sdk;

	const context = getContext('context');
	const component = getContext('component');

	import StringCell from '../cells/StringCell.svelte';
	import NumberCell from '../cells/NumberCell.svelte';
	import BaseDropdownCell from '../cells/BaseDropdownCell.svelte';
	import BooleanCell from '../cells/BooleanCell.svelte';
	import DatetimeCell from '../cells/DatetimeCell.svelte';
	import LinkCell from '../cells/LinkCell.svelte';
	import JSONCell from '../cells/JSONCell.svelte';
	import AttachmentCell from '../cells/AttachmentCell.svelte';
	import AttachmentsCell from '../cells/AttachmentsCell.svelte';

	export const cellComponents: Record<string, Component> = {
		string: StringCell,
		longform: StringCell,
		number: NumberCell,
		bigint: NumberCell,
		options: BaseDropdownCell,
		array: BaseDropdownCell,
		jsonarray: BaseDropdownCell,
		boolean: BooleanCell,
		datetime: DatetimeCell,
		link: LinkCell,
		json: JSONCell,
		attachment_single: AttachmentCell,
		attachment: AttachmentsCell,
		bb_reference_single: LinkCell,
		bb_reference: LinkCell
	};

	// Internally used to appropriately enrich context
	// this is component.id of the wrapper component seen by budibase
	let {
		comp_id,
		inBuilder,
		dataSource,
		sortColumn = $bindable(),
		sortOrder = $bindable(),
		limit = 50,
		autoRefreshRate,
		filter,
		columnList,
		tableActions,
		showFooter,
		showHeader = true,
		size = 'M',
		canInsert,
		canDelete,
		canEdit,
		canResize,
		canFilter,
		canSort = true,
		canSelect,
		insertFieldsConfig,
		superColumnsPos,
		showAutoColumns,
		showSpecialColumns,
		rowMenu,
		rowMenuItems = [],
		rowMenuIcon = 'ri-more-fill',
		menuItemsVisible = 1,
		rowContextMenuItems = [],
		hideSelectionColumn,
		numberingColumn,
		stickFirstColumn = false,
		maxSelected = 0,
		selectedActions = [],
		beautifyLabels,
		columnSizing = 'flex',
		columnMinWidth = '7rem',
		columnMaxWidth = 'auto',
		columnFixedWidth = '7rem',
		dividers = 'horizontal',
		dividersColor,
		rowColorTemplate,
		rowBGColorTemplate,
		rowDisabledTemplate,
		rowHeight,
		optionsViewMode = 'bullets',
		relViewMode = 'pills',
		zebraColors = false,
		quiet,
		entitySingular = 'Row',
		entityPlural = 'Rows',
		onRowSelect,
		onRowClick,
		onCellClick,
		onLinkClick,
		onInsert,
		afterInsert,
		onDelete,
		afterDelete,
		afterEdit,
		onRefresh,
		children
	} = $props();

	const dataSourceStore = $derived(dataSource);
	const columnsStore = $derived(columnList || []);
	const filterStore = $derived(filter);
	let cachedRows = $state([]);
	let resizing = $state(false);

	let _rowHeight = $derived(
		rowHeight ? Number(rowHeight) || sizingMap[size].rowHeight : sizingMap[size].rowHeight
	);

	const headerHeightPx = $derived(showHeader ? sizingMap[size].headerHeight : 0);
	const footerHeightPx = $derived(showFooter ? sizingMap[size].headerHeight : 0);
	const emptyMessage = $derived(entityPlural ? 'No ' + entityPlural + ' found' : 'No Rows Found');

	// Internal Variables
	let tableId = $state();
	let timer = $state();

	let highlighted = $state();
	let scrollHeight = $state();
	let clientHeight = $state();
	// Plain array — svelte-fsm proxies lose methods if stored in $state.
	let columnStates = [];
	let canScroll = $state();
	let horizontalVisible = $state();
	let maxBodyHeight = $state();
	let viewport = $state();
	let columnsViewport = $state();
	let touchStartY = $state(0);
	let touchStartX = $state(0);
	let isEmpty = $state();

	let initializing = $state(false);

	let initTimer = $state();
	let start = $state();
	let end = $state();

	let stbData = writable({
		rows: [],
		count: 0,
		definition: {},
		loading: true,
		loaded: false,
		pageNumber: 0,
		hasNextPage: false
	});

	const idColumn = $derived(tableAPI.detectPK($stbData, dataSourceStore));

	// Scrolling width lock variables
	let scrollLockTimeout = $state();
	let isScrolling = $state(false);
	let tableWidth = $state(0);
	let scrollbarsOverlay = $state();

	// Keep track of the applied query extentions when filtering
	let stbColumnFilters = $state(new Set());
	let queryExtensions = $state({});
	let stbSchema = $state({});

	// Inserting New Record
	let temp_scroll_pos = $state();
	const new_row = writable({});
	let errorTimer = $state(); // Timer for auto-clearing errors

	let stbScrollPos = $state(0);
	let stbScrollOffset = $state(0);
	let stbScrollPercent = $state(0);
	let stbHorizontalScrollPos = $state(0);
	let stbHorizontalScrollPercent = $state(0);
	let stbVisibleRows = $state([]);
	let stbSelected = $state(new Set());

	const rowState = $state({
		hovered: -1,
		menuRow: -1,
		menuAnchor: -1,
		editing: -1
	});

	const specialColumns = [
		'created_by',
		'created_at',
		'updated_by',
		'updated_at',
		'deleted_by',
		'deleted_at'
	];

	const createFetch = (datasource) => {
		const defaultQ = QueryUtils.buildQuery(filterStore);
		const q = tableAPI.extendQuery(defaultQ, queryExtensions);

		return fetchData({
			API,
			datasource,
			options: {
				query: q,
				sortColumn: canSort ? sortColumn : undefined,
				sortOrder: canSort ? sortOrder : undefined,
				limit
			}
		});
	};

	const linkDefinitionCache = new Map();

	// The Super Table API
	const tableAPI = {
		unflattenObject: (obj, delimiter = '.') => {
			if (!obj) return {};

			return Object.keys(obj).reduce((res, k) => {
				const keys = k.split(delimiter);
				keys.reduce((acc, e, i) => {
					// Check if this is the last key in the path
					if (i === keys.length - 1) {
						acc[e] = obj[k]; // Assign the original value (including booleans)
						return acc;
					}

					// Determine the type for the next level
					const nextKey = keys[i + 1];
					if (!acc[e]) {
						acc[e] = isNaN(Number(nextKey)) ? {} : [];
					}
					return acc[e];
				}, res);
				return res;
			}, {});
		},
		populateColumns: (schema, list, auto, special) => {
			let jsoncolumnslist = [];
			let autocolumnsList = [];
			let specialColumnsList = [];
			let columns = [];

			if (schema) {
				if (list?.length) {
					columns = list.map((column) => {
						return tableAPI.enrichColumn(schema, {
							...column,
							field: column.name
						});
					});
				} else {
					if (auto) {
						autocolumnsList = Object.keys(schema)
							.filter((v) => schema[v]?.autocolumn)
							.map((v) => tableAPI.enrichColumn(schema, schema[v]));
					}

					if (special) {
						specialColumnsList = Object.keys(schema)
							.filter((v) => specialColumns.includes(v))
							.map((v) => tableAPI.enrichColumn(schema, schema[v]));
					}

					jsoncolumnslist = Object.keys(schema)
						.filter((v) => schema[v].nestedJSON)
						.map((v) => tableAPI.enrichColumn(schema, schema[v]));

					columns = Object.keys(schema)
						.filter(
							(v) =>
								!schema[v].autocolumn &&
								!specialColumns.includes(v) &&
								!schema[v].nestedJSON &&
								schema[v]?.visible != false &&
								v != idColumn
						)
						.map((v) => {
							return tableAPI.enrichColumn(schema, schema[v]);
						});
				}

				return [...autocolumnsList, ...columns, ...jsoncolumnslist, ...specialColumnsList].sort(
					(a, b) => a.order - b.order
				);
			}
			return [];
		},
		resolveColumnAlignment: (columnSchema, align) => {
			const type =
				columnSchema?.type === 'formula'
					? (columnSchema.responseType ?? 'string')
					: (columnSchema?.type ?? 'string');
			return resolveColumnFlexAlign(type, align);
		},
		get schema() {
			return stbSchema;
		},
		get canEdit() {
			return Boolean(canEdit);
		},
		get canFilter() {
			return Boolean(canFilter);
		},
		get canSort() {
			return Boolean(canSort);
		},
		get canResize() {
			return Boolean(canResize);
		},
		getComponentId: () => comp_id,
		enrichColumn: (schema, bbcolumn) => {
			let type;
			let columnSchema;
			const columnTableId = dataSource?.type === 'viewV2' ? dataSource?.id : dataSource?.tableId;
			const columnName = bbcolumn.name ?? bbcolumn.field;

			if (bbcolumn.schema) {
				columnSchema = bbcolumn.schema;
				type = columnSchema.type ?? 'string';
			} else if (columnName?.includes('.')) {
				let words = columnName.split('.');
				let outerSchema = schema[words[0]]?.schema;
				if (outerSchema && outerSchema[words[1]]) {
					columnSchema = outerSchema[words[1]];
					type = columnSchema.type;
				} else {
					type = 'string';
					columnSchema = {};
				}
			} else {
				columnSchema = schema[columnName];
				if (columnSchema) {
					type = columnSchema.type;
				} else {
					type = 'string';
					columnSchema = {};
				}
			}

			const tableCanEdit = Boolean(canEdit);
			const requestedCanEdit =
				bbcolumn.canEdit !== undefined ? Boolean(bbcolumn.canEdit) && tableCanEdit : tableCanEdit;
			const columnCanEdit =
				requestedCanEdit &&
				supportEditingMap[type] &&
				!columnSchema?.readonly &&
				!bbcolumn.autocolumn &&
				(inBuilder || Boolean(columnTableId));
			const tableCanFilter = bbcolumn.canFilter !== undefined ? bbcolumn.canFilter : canFilter;
			const columnCanFilter = supportFilteringMap[type] ? Boolean(tableCanFilter) : false;
			const tableCanSort = bbcolumn.canSort !== undefined ? bbcolumn.canSort : canSort;
			const cellComponent = columnCanEdit ? cellComponents[type] : BaseTableCell;
			const columnAlign = bbcolumn.align;

			const resolvedAlign = tableAPI.resolveColumnAlignment(columnSchema, columnAlign);
			const headerFilterMeta = resolveColumnFilterOptions(type, QueryUtils);
			const filterOptions = columnCanFilter ? headerFilterMeta : null;

			const cellPadding = bbcolumn.cellPadding ?? sizingMap[size].cellPadding;
			const tableCellSearch = resolveTableCellSearch(type);

			return {
				name: columnName,
				order: bbcolumn.order,
				widthOverride: bbcolumn.width,
				template: bbcolumn.template,
				footerTemplate: bbcolumn.footerTemplate,
				displayName: tableAPI.beautifyLabel(bbcolumn.displayName ?? columnName),
				schema: columnSchema,
				canEdit: columnCanEdit,
				canFilter: columnCanFilter,
				canSort: tableCanSort && supportSortingMap[type],
				...(filterOptions ?? {}),
				columnAlign,
				canResize: canResize,
				maxWidth: bbcolumn.maxWidth ?? columnMaxWidth ?? 'auto',
				minWidth: bbcolumn.minWidth ?? columnMinWidth ?? '7rem',
				fixedWidth: bbcolumn.fixedWidth ?? columnFixedWidth ?? '7rem',
				sizing: bbcolumn.sizing ?? columnSizing,
				showFooter: bbcolumn.showFooter ?? showFooter,
				showHeader: showHeader,
				cellComponent,
				cellOptions: {
					optionsViewMode: optionsViewMode,
					relViewMode: relViewMode,
					role: 'cell',
					align: resolvedAlign,
					readonly: inBuilder,
					...(tableCellSearch !== undefined ? { search: tableCellSearch } : {}),
					...(type === 'boolean' && columnCanEdit
						? {
								controlType: 'icon',
								selectedColor: 'var(--spectrum-global-color-green-700)'
							}
						: {})
				},
				headerCellComponent: getHeaderComponent(columnSchema),
				headerCellOptions: {
					padding: cellPadding,
					clearable: true,
					align: resolvedAlign,
					...(tableCellSearch !== undefined ? { search: tableCellSearch } : {})
				},
				idColumn,
				tableId: columnTableId,
				canInsert: canInsert,
				sortColumn: canSort ? sortColumn : undefined,
				sortOrder: canSort ? sortOrder : undefined
			};
		},
		enrichContext: (row) => {
			const selectedRows = stbSelectedRows;
			const rows = cachedRows;
			const data = get(stbData);
			const ctx = get(context);

			return {
				...ctx,
				[comp_id]: {
					...ctx[comp_id],
					row: row ?? {},
					newRow: get(new_row),
					rows,
					selectedRows,
					selectedIds: stbSelectedIds,
					id: get(component).id,
					info: data?.info,
					datasource: dataSourceStore || {},
					schema: stbSchema,
					state: { query: data?.query },
					loaded: data?.loaded,
					rowsLength: rows?.length ?? 0,
					pageNumber: (data?.pageNumber ?? 0) + 1
				}
			};
		},
		resolveRowButtons: (buttons, row, options = {}) => {
			const enrichedContext = tableAPI.enrichContext(row);
			return resolveConfiguredButtons(buttons, enrichedContext, sdk, options);
		},
		resolveSelectionButtons: (buttons, options = {}) => {
			const selectedRows = stbSelectedRows;
			const row = Array.isArray(selectedRows) ? selectedRows[0] : selectedRows;
			const enrichedContext = tableAPI.enrichContext(row);
			return resolveConfiguredButtons(buttons, enrichedContext, sdk, options);
		},
		registerSuperColumn: (id, csm) => {
			columnStates.push({ id, csm });
		},
		unregisterSuperColumn: (id) => {
			const pos = columnStates.findIndex((col) => col.id == id);
			if (pos > -1) columnStates.splice(pos, 1);
		},
		applyColumnFilter: async (columnId, { name, schema }, { operator, value }) => {
			const isLink = schema?.type === 'link';
			let normalizedValue = value;

			if (operator === 'oneOf' && !Array.isArray(value)) {
				normalizedValue = value.split(',');
			} else if (operator !== 'oneOf' && operator !== 'containsAny' && Array.isArray(value)) {
				normalizedValue = value[0];
			}

			let field = name;
			if (isLink) {
				let primaryDisplay = schema?.primaryDisplay;
				const tableId = schema?.tableId;

				if (!primaryDisplay && tableId) {
					let definition = linkDefinitionCache.get(tableId);
					if (!definition) {
						definition = await API.fetchTableDefinition(tableId);
						linkDefinitionCache.set(tableId, definition);
					}
					primaryDisplay = definition?.primaryDisplay;
				}

				if (primaryDisplay) {
					field = `1:${name}.${primaryDisplay}`;
				}
			}

			const filterObj = {
				field,
				operator,
				value: normalizedValue,
				type: isLink ? 'string' : schema.type,
				valueType: 'Value'
			};

			stbState.addFilter({ ...filterObj, id: columnId });
		},
		executeRowButtonAction: async (index, action) => {
			let cmd = enrichButtonActions(action, tableAPI.enrichContext(cachedRows[index]));
			await cmd?.();
		},
		executeRowOnClickAction: async (index) => {
			await tableAPI.executeRowButtonAction(index, onRowClick);
		},
		executeCellOnClickAction: async (index, column, value, id) => {
			let cmd = enrichButtonActions(onCellClick, tableAPI.enrichContext(cachedRows[index]));
			await cmd?.({ column, value, id });
		},
		executeOnLinkClickAction: async (column, linkItem) => {
			let cmd = enrichButtonActions(onLinkClick, {
				column,
				id: linkItem._id,
				primaryDisplay: linkItem.primaryDisplay
			});
			await cmd?.({
				column,
				id: linkItem._id,
				primaryDisplay: linkItem.primaryDisplay
			});
		},
		executeRowOnSelectAction: async (index) => {
			await tick();
			let cmd = enrichButtonActions(onRowSelect, tableAPI.enrichContext(cachedRows[index]));
			await cmd?.();
		},
		showContextMenu: (id, anchor) => {
			if (rowContextMenuItems?.length && rowState.menuRow != id) {
				rowState.menuRow = id;
				rowState.menuAnchor = anchor;
			} else {
				rowState.menuRow = -1;
				rowState.menuAnchor = -1;
			}
		},
		executeRowContextMenuAction: async (id, action) => {
			await tableAPI.executeRowButtonAction(id, action);
			rowState.menuRow = -1;
			rowState.menuAnchor = -1;
		},
		executeSelectedRowsAction: async (action) => {
			tableAPI.executeRowButtonAction(null, action);
		},
		selectRow: (index) => {
			let disabled = cachedRows[index]?.__meta?.disabled;

			if (maxSelected != 1) {
				if (stbSelected.has(index)) {
					stbSelected.delete(index);
					stbSelected = new Set(stbSelected);
				} else {
					if (maxSelected == 0 || stbSelected.size < maxSelected)
						stbSelected = new Set([...stbSelected, index]);
					else
						notificationStore.actions.warning(
							'Cannot select more than ' + maxSelected + ' ' + (entityPlural || 'Rows')
						);
				}
			} else {
				if (stbSelected.has(index)) {
					stbSelected = new Set();
				} else {
					stbSelected = new Set([index]);
				}
			}

			// Fire Assigned Events
			if (stbSelected.size) tableAPI.executeRowOnSelectAction(index);
		},
		selectAllRows: () => {
			if (stbSelected.size != cachedRows.length)
				stbSelected = new Set(cachedRows.keys());
			else stbSelected = new Set();
		},
		clearSelection: () => {
			stbSelected = new Set();
		},
		insertRow: async (row) => {
			let cmd_after = enrichButtonActions(afterInsert, $context);
			let saved_row;
			if (onInsert && onInsert.length) {
				let cmd = enrichButtonActions(onInsert, $context);
				await cmd?.();
			} else {
				stbState.startSave();
				try {
					saved_row = await API.saveRow({ ...$new_row, tableId }, { suppressErrors: true });

					// Clear errors on success
					$new_row.errors = {};
					$new_row = $new_row;

					let richContext = { ...$context, [comp_id]: { row: saved_row } };
					let cmd_after = enrichButtonActions(afterInsert, richContext);
					await cmd_after?.({ row: saved_row });
					stbState.endSave(); // Only on success
					stbState.refresh();
					return saved_row;
				} catch (e) {
					// Auto-clear errors after 2 seconds
					if (errorTimer) clearTimeout(errorTimer);
					errorTimer = setTimeout(() => {
						$new_row = { ...$new_row, errors: {} };
					}, 2000);

					// Parse Budibase API error
					$new_row.errors = {};
					if (e.json && e.json.validationErrors) {
						// Handle Budibase validation errors
						const validationErrors = e.json.validationErrors;
						Object.keys(validationErrors).forEach((field) => {
							$new_row.errors[field] = validationErrors[field][0] || 'Validation error';
						});
					} else if (e.details || e.errors) {
						const errorDetails = e.details || e.errors;
						errorDetails.forEach((err) => {
							if (err.field) {
								$new_row.errors[err.field] = err.message || 'Validation error';
							}
						});
					} else {
						// Fallback for generic errors
						$new_row.errors = { general: e.message || 'Save failed' };
						stbState.endSave(); // End save state on generic errors as well
						notificationStore.actions.error(
							'Failed to insert ' +
								(entitySingular || 'Row') +
								': ' +
								(e.message || 'Unknown error')
						);
					}
				}
			}
		},
		deleteRow: async (index) => {
			let row = cachedRows[index];
			tableAPI.markRowDisabled(index);
			await tick();
			let id = row[idColumn];

			if (!id || !tableId) return;

			let autoDelete = [
				{
					parameters: {
						confirm: true,
						notificationOverride: false,
						customTitleText: 'Delete ' + (entitySingular || 'Row') + ' ?',
						confirmText: 'Are you sure you want to delete this ' + (entitySingular || 'Row') + ' ?',
						tableId: tableId,
						rowId: id
					},
					'##eventHandlerType': 'Delete Row'
				}
			];

			let cmd;
			let cmd_after = enrichButtonActions(afterDelete, tableAPI.enrichContext(cachedRows[index]));

			if (onDelete?.length) {
				cmd = enrichButtonActions(onDelete, tableAPI.enrichContext(cachedRows[index]));
			} else {
				cmd = enrichButtonActions(autoDelete, {});
			}

			const result = await cmd?.({ row });

			if (result === false) {
				tableAPI.restoreRowAt(index);
			} else {
				stbSelected = new Set([...stbSelected].filter(i => i !== index).map(i => i > index ? i - 1 : i));
				tableAPI.removeRowAt(index);
			}

			await cmd_after?.({ row });
		},
		deleteSelectedRows: async () => {
			const indicesToDelete = [...stbSelected];
			const rowsToDelete = indicesToDelete.map(i => cachedRows[i]).filter(Boolean);
			const idsToDelete = rowsToDelete.map((row) => row._id);
			const disabledIndices = indicesToDelete.filter(i => cachedRows[i]);

			rowsToDelete.forEach((row) => {
				const rowIndex = cachedRows.indexOf(row);
				if (rowIndex !== -1) {
					tableAPI.markRowDisabled(rowIndex);
				}
			});

			await tick();

			let autoDelete = [
				{
					parameters: {
						confirm: true,
						notificationOverride: true,
						customTitleText: 'Delete ' + stbSelected.size + ' ' + (entityPlural || 'Rows') + ' ?',
						confirmText: 'Are you sure you want to delete these ' + (entityPlural || 'Rows') + ' ?',
						tableId: tableId,
						rowId: idsToDelete.map((x) => ({ _id: x.toString() }))
					},
					'##eventHandlerType': 'Delete Row'
				}
			];
			let cmd = enrichButtonActions(autoDelete, {});
			let cmd_after = enrichButtonActions(afterDelete, $context);

			const result = await cmd?.();

			if (result === false) {
				disabledIndices.forEach((rowIndex) => tableAPI.restoreRowAt(rowIndex));
			} else {
				tableAPI.removeRowsByIds(idsToDelete);
				stbSelected = new Set();
			}

			await cmd_after?.();
		},
		markRowDisabled: (index) => {
			if (!cachedRows[index]) return;
			cachedRows[index] = {
				...cachedRows[index],
				__meta: { ...cachedRows[index].__meta, disabled: true }
			};
		},
		enrichSingleRow: (row, index, priorMeta, columns) => {
			const templateColumns = (columns ?? []).filter((column) => column?.template);
			const { __meta, ...rowData } = row;
			const templateContext = {
				...get(context),
				[comp_id]: { row: rowData }
			};
			const templateDisabled = rowDisabledTemplate
				? processStringSync(rowDisabledTemplate, templateContext)
				: undefined;

			const formattedValues = {};
			for (const column of templateColumns) {
				const cellValue = deepGet(rowData, column.name, true);
				formattedValues[column.name] = processStringSync(column.template, {
					...templateContext,
					Value: cellValue,
					value: cellValue
				});
			}

			return {
				...rowData,
				__meta: {
					bgcolor: rowBGColorTemplate
						? processStringSync(rowBGColorTemplate, templateContext)
						: undefined,
					color: rowColorTemplate
						? processStringSync(rowColorTemplate, templateContext)
						: undefined,
					disabled: priorMeta?.disabled === true ? true : templateDisabled,
					...(Object.keys(formattedValues).length ? { formattedValues } : {})
				}
			};
		},
		mergeRowAt: (index, patchedRow, columns) => {
			if (!cachedRows[index] || !patchedRow) return;
			const priorMeta = cachedRows[index].__meta;
			cachedRows[index] = tableAPI.enrichSingleRow(patchedRow, index, priorMeta, columns);
		},
		removeRowAt: (index) => {
			if (index < 0 || index >= cachedRows.length) return;
			cachedRows.splice(index, 1);
			isEmpty = cachedRows.length < 1;
			stbState.calculateRowBoundaries();
		},
		restoreRowAt: (index, columns) => {
			if (!cachedRows[index]?.__meta?.disabled) return;
			const priorMeta = { ...cachedRows[index].__meta };
			delete priorMeta.disabled;
			cachedRows[index] = tableAPI.enrichSingleRow(cachedRows[index], index, priorMeta, columns ?? superColumns);
		},
		removeRowsByIds: (ids) => {
			const idSet = new Set(ids.map((id) => id?.toString()).filter(Boolean));
			if (!idSet.size) return;
			cachedRows = cachedRows.filter((row, i) => !idSet.has(tableAPI.getRowId(row, i)));
			isEmpty = cachedRows.length < 1;
			stbState.calculateRowBoundaries();
		},
		patchRow: async (index, patch) => {
			// We can only patch tables
			if (!tableId) return;
			const { __meta, ...cleanPatch } = patch;
			patch = tableAPI.unflattenObject(cleanPatch);

			const row = await API.patchRow(
				{
					tableId,
					...patch
				},
				true
			);

			if (index != null && row) {
				tableAPI.mergeRowAt(index, row, superColumns);
			}

			let richContext = {
				...get(context),
				[comp_id]: { row }
			};
			let cmd_after = enrichButtonActions(afterEdit, richContext);
			await cmd_after?.({ row });
			return row;
		},
		getRowId: (row, index) => {
			if (idColumn) {
				return row[idColumn]?.toString() ?? index.toString();
			} else {
				return index.toString();
			}
		},
		getRowById: (id) => {
			if (idColumn) {
				return cachedRows.find((row) => row[idColumn]?.toString() === id);
			} else {
				return cachedRows[parseInt(id)];
			}
		},
		extendQuery: (defaultQuery: SearchFilters, extensions: Record<string, any>): SearchFilters => {
			if (!Object.keys(extensions).length) {
				return defaultQuery;
			}
			const extended: SearchFilters = {
				['$and']: {
					conditions: [...(defaultQuery ? [defaultQuery] : []), ...Object.values(extensions || {})]
				},
				onEmptyFilter: 'none'
			};

			// If there are no conditions applied at all, clear the request.
			return (extended['$and']?.conditions?.length ?? 0) > 0 ? extended : {};
		},
		addQueryExtension: (key, extension) => {
			if (!key || !extension) {
				return;
			}
			queryExtensions = { ...queryExtensions, [key]: extension };
		},
		removeQueryExtension: (key) => {
			if (!key) {
				return;
			}
			const newQueryExtensions = { ...queryExtensions };
			delete newQueryExtensions[key];
			queryExtensions = newQueryExtensions;
		},
		beautifyLabel: (label) => {
			if (!beautifyLabels || !label) return label;

			let fields = label.split('.');
			fields.forEach((field, index) => {
				let words = field.split('_');
				words.forEach((word, index) => {
					if (word) words[index] = word[0]?.toUpperCase() + word?.slice(1);
				});
				fields[index] = words.join(' ');
			});
			return fields.join(' - ');
		},
		refreshColumns: () => {
			if ($stbState !== 'Idle') return;
			for (const { csm } of columnStates) csm.unlockWidth();
			tick().then(() => scrollbarsOverlay?.calculate?.());
			setTimeout(() => scrollbarsOverlay?.calculate?.(), 160);
		},
		startResize: () => {
			resizing = true;
		},
		endResize: () => {
			resizing = false;
		},
		detectPK: (fetchState, dataSource) => {
			if (fetchState?.definition?.primary?.length === 1) return fetchState.definition.primary[0];
			const schema = fetchState?.definition?.schema || fetchState?.schema || {};

			if ('id' in schema) return 'id';
			if ('_id' in schema || dataSource?.type == 'viewV2') return '_id';
			return null;
		}
	};

	function exitFilteredIfEmpty() {
		if (stbColumnFilters.size === 0) {
			columnStates.forEach(({ csm }) => csm.reset());
			return 'Idle';
		}
	}

	function resolveLoadedState() {
		return stbColumnFilters.size > 0 ? 'Filtered' : 'Idle';
	}

	// Super Table State Machine
	const stbState = fsm('Init', {
		'*': {
			init() {
				return 'Init';
			},
			enrichRows(
				rows,
				rowBGColorTemplate,
				rowColorTemplate,
				rowDisabledTemplate,
				columns
			) {
				if (!rows?.length) {
					if (cachedRows.length) cachedRows = [];
					return;
				}

				const enriched = rows.map((row, index) =>
					tableAPI.enrichSingleRow(row, index, row.__meta, columns)
				);

				const prevMetaKey = JSON.stringify(rows.map((row) => row.__meta));
				const nextMetaKey = JSON.stringify(enriched.map((row) => row.__meta));
				if (prevMetaKey !== nextMetaKey) {
					cachedRows = enriched;
				}
			},
			lockColumnWidths() {
				if (isScrolling) return; // Already locked
				isScrolling = true;
				// Clear any existing timeout
				if (scrollLockTimeout) {
					clearTimeout(scrollLockTimeout);
					scrollLockTimeout = null;
				}
				columnStates.forEach(({ csm }) => csm.lockWidth());
			},
			unlockColumnWidths() {
				// Only unlock if currently locked
				if (!isScrolling) return;
				isScrolling = false;
				// Clear any existing timeout
				if (scrollLockTimeout) {
					clearTimeout(scrollLockTimeout);
					scrollLockTimeout = null;
				}
				// Unlock all columns immediately (no delay needed for table resize)
				columnStates.forEach(({ csm }) => csm.unlockWidth());
			},
			scrollToTop() {
				stbScrollPos = 0;
				stbScrollOffset = 0;
				this.calculateRowBoundaries();
			},
			scrollTo(position) {
				stbScrollPos = position;
				this.calculateRowBoundaries();
			},
			scrollToEnd() {
				stbScrollPos = scrollHeight > maxBodyHeight ? scrollHeight - maxBodyHeight : stbScrollPos;
				this.calculateRowBoundaries();
			},
			calculateBoundaries() {
				if (!viewport) return;

				const rowCount = cachedRows?.length ?? 0;
				scrollHeight = rowCount * _rowHeight + (canInsert ? 4 * _rowHeight : 2 * _rowHeight);
				maxBodyHeight = viewport.clientHeight - headerHeightPx - footerHeightPx + _rowHeight;
				canScroll = scrollHeight > maxBodyHeight;
				stbScrollPercent =
					scrollHeight > maxBodyHeight ? stbScrollPos / (scrollHeight - maxBodyHeight) : 0;
			},
			calculateRowBoundaries() {
				const rows = cachedRows || [];
				if (!rows.length) {
					stbVisibleRows = [];
					return;
				}

				const rh = _rowHeight;
				start = Math.min(Math.max(Math.floor(stbScrollPos / rh), 0), rows.length - 1);
				end = Math.min(Math.ceil((stbScrollPos + maxBodyHeight) / rh), rows.length);
				stbVisibleRows = Array.from({ length: end - start }, (_, i) => i + start);
				stbScrollOffset = stbScrollPos - start * rh;

				if (rows.length - end < 10) {
					stbState.fetchMoreRows();
				}
			},
			handleVerticalScroll(delta) {
				// Lock column widths during scrolling to prevent flickering
				this.lockColumnWidths();

				stbScrollPos = Math.max(
					Math.min(stbScrollPos + delta, Math.max(0, scrollHeight - maxBodyHeight)),
					0
				);
				stbScrollPercent =
					scrollHeight > maxBodyHeight ? stbScrollPos / (scrollHeight - maxBodyHeight) : 0;
				window.requestAnimationFrame(() => this.calculateRowBoundaries());
				// Note: We don't unlock here - columns stay locked during scrolling
			},
			handleWheel(e) {
				if ($stbState == 'Inserting') {
					e.preventDefault();
					e.stopPropagation();
					return;
				}

				if (e.deltaY && canScroll) {
					e.preventDefault();
					e.stopPropagation();
					this.handleVerticalScroll(e.deltaY);
				} else if (e.deltaX) {
					// Lock column widths during horizontal scrolling too
					this.lockColumnWidths();

					if (stbHorizontalScrollPos + e.deltaX < 0) {
						stbHorizontalScrollPos = 0;
						stbHorizontalScrollPercent = 0;
						return;
					}
					if (
						stbHorizontalScrollPos + e.deltaX >
						columnsViewport?.scrollWidth - columnsViewport.clientWidth
					) {
						stbHorizontalScrollPos = columnsViewport?.scrollWidth - columnsViewport.clientWidth;
						stbHorizontalScrollPercent = 1;
						return;
					}

					stbHorizontalScrollPos += e.deltaX;
					stbHorizontalScrollPercent = stbHorizontalScrollPos / columnsViewport.scrollWidth;

					// Note: We don't unlock here - columns stay locked during scrolling
				}
			},
			handleTouch(e, type) {
				if ($stbData.loading || $stbState === 'Inserting') {
					e.preventDefault();
					return;
				}

				if (type === 'start') {
					touchStartY = e.touches[0].clientY;
					touchStartX = e.touches[0].clientX;
				} else if (type === 'move' && canScroll) {
					const touchY = e.touches[0].clientY;
					const touchX = e.touches[0].clientX;
					const deltaY = touchStartY - touchY; // Positive for swipe up, negative for swipe down
					const deltaX = touchStartX - touchX;

					// Prioritize vertical scrolling if swipe is mostly vertical
					if (Math.abs(deltaY) > Math.abs(deltaX)) {
						e.preventDefault(); // Prevent native vertical scroll
						this.handleVerticalScroll(deltaY * 0.5); // Adjust sensitivity (0.5 for smoother scrolling)
						touchStartY = touchY; // Update start position for continuous scrolling
					} else if (Math.abs(deltaX) > Math.abs(deltaY)) {
						// Handle horizontal touch scrolling
						this.lockColumnWidths();
						if (stbHorizontalScrollPos + deltaX < 0) {
							stbHorizontalScrollPos = 0;
							stbHorizontalScrollPercent = 0;
						} else if (
							stbHorizontalScrollPos + deltaX >
							columnsViewport?.scrollWidth - columnsViewport.clientWidth
						) {
							stbHorizontalScrollPos = columnsViewport?.scrollWidth - columnsViewport.clientWidth;
							stbHorizontalScrollPercent = 1;
						} else {
							stbHorizontalScrollPos += deltaX;
							stbHorizontalScrollPercent = stbHorizontalScrollPos / columnsViewport.scrollWidth;
						}
						touchStartX = touchX;
						// Note: We don't unlock here - columns stay locked during scrolling
					}
				}
			},
			sortBy(column, order) {
				if (!canSort) return;
				sortColumn = column;
				sortOrder = order;
			},
			handleRowClick(index, column, value, id) {
				if (canSelect && !canEdit) tableAPI.selectRow(index);
				if (onCellClick) {
					tableAPI.executeCellOnClickAction(index, column, value, id);
					tableAPI.executeRowOnClickAction(index);
				} else {
					tableAPI.executeRowOnClickAction(index);
				}
			},
			addRow() {
				if (!onInsert || onInsert?.length == 0) {
					return 'Inserting';
				} else {
					tableAPI.insertRow();
				}
			},
			edit() {
				return 'Editing';
			}
		},
		Init: {
			_enter() {
				if (timer) clearInterval(timer);
				if (initTimer) clearTimeout(initTimer);

				stbScrollPos = 0;
				stbScrollOffset = 0;
				stbHorizontalScrollPos = 0;
				stbSelected = new Set();
				cachedRows = [];
				stbVisibleRows = [];
				stbSchema = {};

				stbData = createFetch(dataSourceStore);

				// If Initialization takes more than 130ms, show loading state
				initTimer = setTimeout(() => {
					initializing = true;
				}, 130);
			},
			synch(fetchState) {
				tableId = dataSourceStore?.tableId;

				if (fetchState.loaded) {
					if (autoRefreshRate && !inBuilder) {
						timer = setInterval(() => {
							stbState.refresh();
							onRefresh?.();
						}, autoRefreshRate * 1000);
					}

					cachedRows = [...fetchState.rows];
					stbSchema = fetchState.definition?.schema || {};
					this.enrichRows(
						cachedRows, rowBGColorTemplate, rowColorTemplate, rowDisabledTemplate, superColumns
					);
					return 'Idle';
				}
			}
		},
		Idle: {
			_enter() {
				clearTimeout(initTimer);
				initializing = false;
				isEmpty = cachedRows.length < 1;
			},
			_exit() {},
			addFilter(filterObj) {
				let extention = QueryUtils.buildQuery([{ ...filterObj }]);
				stbColumnFilters.add(filterObj.id);
				tableAPI.addQueryExtension(filterObj.id, extention);
				return 'Filtered';
			},
			synch(fetchState) {
				if (fetchState.loading) return;
				if (fetchState.loaded) {
					isEmpty = fetchState.rows.length < 1;
					cachedRows = [...fetchState.rows];
					this.enrichRows(
						cachedRows, rowBGColorTemplate, rowColorTemplate, rowDisabledTemplate, superColumns
					);
					this.calculateRowBoundaries();
				}
			},
			refresh() {
				if ($stbData?.loading) return;

				if ($stbData.pageNumber > 0) {
					stbData.update({ limit: cachedRows.length });
				} else {
					stbData.refresh();
				}

				return 'Refreshing';
			},
			fetchMoreRows(size) {
				if ($stbData.hasNextPage && !$stbData.loading) {
					stbData.nextPage();
					return 'Fetching';
				}
			}
		},
		Refreshing: {
			_enter() {},
			_exit() {},
			synch(fetchState) {
				if (fetchState.loading) return;
				if (fetchState.loaded) {
					cachedRows = [...fetchState.rows];
					this.enrichRows(
						cachedRows, rowBGColorTemplate, rowColorTemplate, rowDisabledTemplate, superColumns
					);
					return resolveLoadedState();
				}
			}
		},
		Fetching: {
			_enter() {},
			_exit() {},
			synch(fetchState) {
				if (!fetchState.loading) {
					isEmpty = fetchState.rows.length < 1;
					cachedRows = [...cachedRows, ...fetchState.rows];
					this.enrichRows(
						cachedRows, rowBGColorTemplate, rowColorTemplate, rowDisabledTemplate, superColumns
					);
					return resolveLoadedState();
				}
			}
		},
		Filtered: {
			_enter() {},
			_exit() {},
			addFilter(filterObj) {
				let extention = QueryUtils.buildQuery([{ ...filterObj }]);
				stbColumnFilters.add(filterObj.id);
				tableAPI.addQueryExtension(filterObj.id, extention);
			},
			clearFilter(id) {
				stbColumnFilters.delete(id);
				tableAPI.removeQueryExtension(id);
				return exitFilteredIfEmpty();
			},
			clear() {
				try {
					stbColumnFilters.forEach((id) => {
						tableAPI.removeQueryExtension(id);
					});
					stbColumnFilters.clear();
					columnStates.forEach(({ csm }) => csm.reset());
				} catch (e) {
					console.error('Error clearing filters:', e);
				} finally {
					return 'Idle';
				}
			},
			refresh() {
				if ($stbData?.loading) return;
				stbData.refresh();
			},
			synch(fetchState) {
				if (fetchState.loading) return;
				if (fetchState.loaded) {
					isEmpty = fetchState.rows.length < 1;
					cachedRows = [...fetchState.rows];
					this.enrichRows(
						cachedRows, rowBGColorTemplate, rowColorTemplate, rowDisabledTemplate, superColumns
					);
					this.calculateRowBoundaries();
				}
			},
			fetchMoreRows(size) {
				if ($stbData.hasNextPage && !$stbData.loading) {
					stbData.nextPage();
					return 'Fetching';
				}
			}
		},
		Editing: {
			enter() {
				if (timer) clearInterval(timer);
			},
			_exit() {
				if (autoRefreshRate && !inBuilder) {
					timer = setInterval(() => {
						stbState.refresh();
						onRefresh?.();
					}, autoRefreshRate * 1000);
				}
			},
			async patchRow(index, id, rev, field, change) {
				let patch = { _id: id, _rev: rev, [field]: change };
				const row = await tableAPI.patchRow(index, patch);
				return row ? 'Idle' : 'Editing';
			},
			endEdit() {
				return 'Idle';
			}
		},
		Inserting: {
			_enter() {
				isEmpty = false;
				columnStates.forEach(({ csm }) => csm.addRow());
				$new_row = {};

				// Set Field Default Values if configured
				insertFieldsConfig?.forEach((cfg) => {
					if (cfg.defaultValue) $new_row[cfg.field] = processStringSync(cfg.defaultValue, $context);
				});

				temp_scroll_pos = stbScrollPos;
				this.scrollToEnd();
			},
			_exit() {
				columnStates.forEach(({ csm }) => csm.cancelAddRow());
				this.scrollTo(temp_scroll_pos);
			},
			cancelAddRow() {
				return 'Idle';
			},
			endSave() {
				this.refresh();
				return 'Idle';
			},
			setValue(field, value) {
				$new_row[field] = value;
				// Clear errors for this field and cancel auto-clear timer
				if ($new_row.errors && $new_row.errors[field]) {
					delete $new_row.errors[field];
					if (errorTimer) {
						clearTimeout(errorTimer);
						errorTimer = null;
					}
				}
				$new_row = { ...$new_row }; // Trigger reactivity
			}
		}
	});

	// Derived columns to render
	const superColumns = $derived.by(() => {
		const columns = columnsStore;
		void canEdit;
		void canSort;
		void canFilter;
		void canResize;
		void showHeader;
		void showFooter;
		void columnSizing;
		void columnMinWidth;
		void columnMaxWidth;
		void columnFixedWidth;
		void size;
		void optionsViewMode;
		void relViewMode;
		void inBuilder;
		void sortColumn;
		void sortOrder;
		void canInsert;
		void stbSchema;
		return tableAPI.populateColumns(stbSchema, columns, showAutoColumns, showSpecialColumns);
	});

	const stbSettings = $derived.by(() => ({
		componentID: comp_id,
		schema: stbSchema,
		superColumnsPos,
		columnSizing: columnSizing || 'flexible',
		columnMaxWidth: columnMaxWidth || 'auto',
		columnMinWidth: columnMinWidth || '7rem',
		columnFixedWidth: columnFixedWidth || '7rem',
		showFooter,
		showHeader,
		rowMenuIcon,
		footerHeight: footerHeightPx,
		features: {
			canSelect,
			maxSelected,
			canFilter,
			canSort,
			canEdit,
			canDelete: canDelete && tableId,
			canResize
		},
		appearance: {
			numberingColumn,
			hideSelectionColumn: hideSelectionColumn || superColumns.length === 0,
			quiet,
			zebraColors,
			cellPadding: sizingMap[size].cellPadding
		}
	}));

	const tableStyles = $derived({
		color: dividersColor ?? 'var(--spectrum-global-color-gray-200)',
		horizontal:
			dividers == 'both' || dividers == 'horizontal'
				? '1px solid var(--super-table-devider-color)'
				: '1px solid transparent',
		vertical:
			dividers == 'both' || dividers == 'vertical'
				? '1px solid var(--super-table-devider-color)'
				: 'none',
		headerHeight: headerHeightPx || '0px',
		footerHeight: footerHeightPx || '0px'
	});

	let defaultQuery = $derived(QueryUtils.buildQuery(filterStore));
	let query = $derived(tableAPI.extendQuery(defaultQuery, queryExtensions));

	const stbSelectedIds = $derived(
		[...stbSelected].map(i => tableAPI.getRowId(cachedRows[i], i))
	);

	const stbSelectedRows = $derived.by(() => {
		const selectedRows = [...stbSelected].map(i => cachedRows[i]).filter(Boolean);
		if (maxSelected === 1) {
			return selectedRows.length > 0 ? selectedRows[0] : [];
		}
		return selectedRows;
	});

	let fetchUpdateKey = $state('');

	// Initialize and Enrich Rows
	$effect(() => {
		dataSourceStore;
		untrack(() => stbState.init(dataSourceStore));
	});
	$effect(() => {
		$stbData;
		untrack(() => stbState.synch($stbData));
	});
	// Re-enrich when template props change in the builder
	$effect(() => {
		rowBGColorTemplate;
		rowColorTemplate;
		rowDisabledTemplate;
		if (!cachedRows.length) return;
		untrack(() =>
			stbState.enrichRows(
				cachedRows,
				rowBGColorTemplate,
				rowColorTemplate,
				rowDisabledTemplate,
				superColumns
			)
		);
	});

	// Validate indices still in range after row removal
	$effect(() => {
		cachedRows;
		untrack(() => {
			stbSelected = new Set([...stbSelected].filter(i => i < cachedRows.length));
		});
	});

	// Scroll to Top when filter changes
	$effect(() => {
		query;
		untrack(() => stbState.scrollToTop());
	});

	// Data Related
	$effect(() => {
		const effectiveSortColumn = canSort ? sortColumn : undefined;
		const effectiveSortOrder = canSort ? sortOrder : undefined;
		const key = JSON.stringify({
			query,
			sortColumn: effectiveSortColumn,
			sortOrder: effectiveSortOrder,
			limit,
			canSort
		});
		if (key !== fetchUpdateKey) {
			fetchUpdateKey = key;
			untrack(() => {
				stbData?.update({
					query,
					sortColumn: effectiveSortColumn,
					sortOrder: effectiveSortOrder,
					limit
				});
			});
		}
	});

	// Allow Columns to resize
	$effect(() => {
		tableWidth;
		superColumns;
		untrack(() => tableAPI.refreshColumns());
	});

	// Virtual List Capabilities reacting to viewport change
	$effect(() => {
		clientHeight;
		canInsert;
		sortColumn;
		sortOrder;
		_rowHeight;
		cachedRows.length;
		untrack(() => {
			stbState.calculateBoundaries();
			stbState.calculateRowBoundaries();
		});
	});

	// Build our data and actions ontext
	let actions = $derived([
		{
			type: ActionTypes.ClearRowSelection,
			callback: tableAPI.clearSelection
		},
		{
			type: ActionTypes.RefreshDatasource,
			callback: stbState.refresh
		},
		{
			type: ActionTypes.AddDataProviderQueryExtension,
			callback: tableAPI.addQueryExtension
		},
		{
			type: ActionTypes.RemoveDataProviderQueryExtension,
			callback: tableAPI.removeQueryExtension
		}
	]);

	// The "row" is dynamically enriched, but show the first one in the builder for preview
	let dataContext = $derived({
		row: inBuilder ? cachedRows?.[0] : {},
		newRow: $new_row,
		rows: cachedRows,
		selectedRows: stbSelectedRows,
		selectedIds: stbSelectedIds,
		id: $component.id,
		info: $stbData?.info,
		datasource: dataSourceStore || {},
		schema: stbSchema,
		state: {
			query: $stbData.query
		},
		loaded: $stbData?.loaded,
		rowsLength: cachedRows.length,
		pageNumber: $stbData?.pageNumber + 1
	});

	// Show Action Buttons Column
	let showButtonColumnRight = $derived(rowMenu == 'columnRight' && rowMenuItems?.length);
	let showButtonColumnLeft = $derived(rowMenu == 'columnLeft' && rowMenuItems?.length);

	// Expose context for SuperTableColumn plugin subtree
	setContext('stbSettings', () => stbSettings);
	setContext('tableAPI', tableAPI);
	setContext('stbState', stbState);
	setContext('rowState', rowState);
	setContext('data', () => cachedRows);
	setContext('stbVisibleRows', () => stbVisibleRows);
	setContext('new_row', new_row);
	setContext('stbSelected', () => stbSelected);

	onDestroy(() => {
		clearInterval(timer);
		clearTimeout(scrollLockTimeout);
	});

</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore event_directive_deprecated -->
<div class="wrapper">
	<Provider {actions} data={dataContext} />
	<div
		class="super-table"
		class:quiet
		class:zebra={zebraColors}
		class:initializing={initializing || $stbData.loading}
		bind:this={viewport}
		bind:clientWidth={tableWidth}
		bind:clientHeight
		style:font-size={sizingMap[size].rowFontSize}
		style:--super-table-devider-color={tableStyles.color}
		style:--super-table-body-height={maxBodyHeight}
		style:--super-table-header-height="{headerHeightPx}px"
		style:--super-table-footer-height="{footerHeightPx}px"
		style:--super-table-row-height="{_rowHeight}px"
		style:--super-table-horizontal-dividers={tableStyles.horizontal}
		style:--super-table-vertical-dividers={tableStyles.vertical}
		style:--super-table-cell-padding={sizingMap[size].cellPadding}
		style:--super-column-top-offset={stbScrollOffset * -1}
		on:mouseenter={() => (highlighted = true)}
		on:mouseleave={() => {
			highlighted = false;
			rowState.hovered = -1;
		}}
		on:wheel={stbState.handleWheel}
		on:touchstart={(e) => stbState.handleTouch(e, 'start')}
		on:touchmove={(e) => stbState.handleTouch(e, 'move')}
		on:touchend={(e) => stbState.handleTouch(e, 'end')}
	>
		{#if !isEmpty}
			<ControlSection>
				<SelectionColumn
					{stbSettings}
					{stbState}
					{tableAPI}
					{rowState}
					rows={cachedRows}
					visibleRows={stbVisibleRows}
					horizontalScrollPos={stbHorizontalScrollPos}
				/>

				{#if showButtonColumnLeft && superColumns.length > 0 && $stbData.loaded}
					<RowButtonsColumn
						{rowMenuItems}
						{menuItemsVisible}
						{rowMenu}
						{stbSettings}
						{stbState}
						{tableAPI}
						{rowState}
						rows={cachedRows}
						visibleRows={stbVisibleRows}
						horizontalScrollPos={stbHorizontalScrollPos}
					/>
				{/if}

				{#if stickFirstColumn && superColumns.length > 1}
					<SuperTableColumn
						sticky={true}
						scrollPos={stbHorizontalScrollPos}
						columnOptions={{
							...superColumns[0],
							isFirst: true,
							isFirstInsertable:
								superColumns.findIndex((c) => c.canEdit && c.canInsert) === 0,
							isLast: superColumns?.length == 1 && !showButtonColumnRight && canScroll
						}}
					/>
				{/if}
			</ControlSection>
		{/if}

		<ColumnsSection
			{stbSettings}
			{superColumns}
			{canScroll}
			{showButtonColumnRight}
			bind:columnsViewport
		>
			{#key columnSizing}
				{@render children?.()}
			{/key}
		</ColumnsSection>

		{#if showButtonColumnRight && superColumns.length > 0 && !isEmpty}
			<ControlSection>
				<RowButtonsColumn
					{rowMenuItems}
					{menuItemsVisible}
					{rowMenu}
					{canScroll}
					right={true}
					{stbSettings}
					{stbState}
					{tableAPI}
					{rowState}
					rows={cachedRows}
					visibleRows={stbVisibleRows}
					horizontalScrollPos={stbHorizontalScrollPos}
				/>
			</ControlSection>
		{/if}

		<ScrollbarsOverlay
			bind:this={scrollbarsOverlay}
			bind:scrollPos={stbScrollPos}
			bind:horizontalScrollPos={stbHorizontalScrollPos}
			anchor={columnsViewport}
			clientHeight={maxBodyHeight}
			{scrollHeight}
			{tableWidth}
			{highlighted}
			bind:horizontalVisible
			on:positionChange={stbState.calculateRowBoundaries}
		/>

		<EmptyResultSetOverlay
			isEmpty={isEmpty && !$stbData.loading}
			message={emptyMessage}
			bottom={horizontalVisible ? 24 : 16}
		/>

		<RowContextMenu
			{rowContextMenuItems}
			row={cachedRows?.[rowState.menuRow]}
			{tableAPI}
			{rowState}
		/>

		{#if canInsert || $stbState == 'Filtered'}
			<AddNewRowOverlay {stbState} {tableAPI} {highlighted} {tableActions} footer={showFooter} />
		{/if}

		{#if canSelect && selectedActions?.length}
			<SelectedActionsOverlay
				{tableAPI}
				{stbSettings}
				footerHeight={footerHeightPx}
				{selectedActions}
				{stbSelected}
				{stbState}
				{highlighted}
				{entitySingular}
				{entityPlural}
			/>
		{/if}

		{#if $stbData.loading && $stbData.loaded}
			<LoadingOverlay />
		{/if}
	</div>
</div>

<style>
	.wrapper {
		flex: auto;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		overflow: hidden;
	}
</style>
