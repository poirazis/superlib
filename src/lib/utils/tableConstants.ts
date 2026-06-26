export const sizingMap = {
	S: {
		cellPadding: '0.4rem',
		rowFontSize: 12,
		rowHeight: 32,
		headerFontSize: 10,
		headerHeight: 32,
		checkboxSize: 12
	},
	M: {
		cellPadding: '0.5rem',
		rowFontSize: 13,
		rowHeight: 36,
		headerFontSize: 11,
		headerHeight: 40,
		checkboxSize: 14
	},
	L: {
		cellPadding: '0.85rem',
		rowFontSize: 15,
		rowHeight: 42,
		headerFontSize: 12,
		headerHeight: 48,
		checkboxSize: 14
	}
} as const;

export const defaultOperatorMap: Record<string, string> = {
	string: 'fuzzy',
	longform: 'fuzzy',
	formula: 'fuzzy',
	array: 'contains',
	options: 'equal',
	datetime: 'rangeLow',
	boolean: 'equal',
	number: 'equal',
	bigint: 'equal',
	link: 'fuzzy',
	bb_reference_single: 'equal',
	bb_reference: 'equal'
};

export const supportFilteringMap: Record<string, boolean> = {
	string: true,
	longform: true,
	array: true,
	options: true,
	datetime: true,
	boolean: true,
	number: true,
	bigint: true,
	link: true,
	bb_reference_single: false,
	bb_reference: false
};

export const supportSortingMap: Record<string, boolean> = {
	string: true,
	longform: true,
	formula: true,
	array: true,
	options: true,
	datetime: true,
	boolean: true,
	number: true,
	bigint: true
};

type FilterOperatorOption = { label: string; value: string };

type QueryUtilsFilterLike = {
	getValidOperatorsForType: (fieldType: { type?: string }) => FilterOperatorOption[];
};

export function resolveColumnFilterOptions(
	type: string | undefined,
	QueryUtils: QueryUtilsFilterLike
) {
	const fieldType = type ?? 'string';

	return {
		filteringOperators: QueryUtils.getValidOperatorsForType({ type: fieldType }),
		defaultFilteringOperator: defaultOperatorMap[fieldType] ?? defaultOperatorMap.string
	};
}

const TABLE_OPTION_FIELD_TYPES = new Set(['options', 'array', 'jsonarray']);
const TABLE_RELATIONSHIP_FIELD_TYPES = new Set(['link', 'bb_reference', 'bb_reference_single']);

/** Inline table edit: option columns hide picker search; relationship columns keep it. */
export function resolveTableCellSearch(type?: string): boolean | undefined {
	if (!type) return undefined;
	if (TABLE_OPTION_FIELD_TYPES.has(type)) return false;
	if (TABLE_RELATIONSHIP_FIELD_TYPES.has(type)) return true;
	return undefined;
}

export const supportEditingMap: Record<string, boolean> = {
	string: true,
	longform: true,
	array: true,
	link: true,
	json: true,
	bb_reference: true,
	bb_reference_single: true,
	options: true,
	datetime: true,
	boolean: true,
	number: true,
	bigint: true,
	attachment: true,
	attachment_single: true
};
