import type { SearchFilters, TableSchema } from '@budibase/types';

export const LogicalOperator = {
	AND: '$and',
	OR: '$or'
} as const;

export const EmptyFilterOption = {
	RETURN_NONE: 'none'
} as const;

export const extendQuery = (
	defaultQuery: SearchFilters | null | undefined,
	extensions: Record<string, SearchFilters>
): SearchFilters => {
	if (!Object.keys(extensions).length) {
		return defaultQuery ?? {};
	}

	const extended = {
		[LogicalOperator.AND]: {
			conditions: [...(defaultQuery ? [defaultQuery] : []), ...Object.values(extensions)]
		},
		onEmptyFilter: EmptyFilterOption.RETURN_NONE
	} as SearchFilters;

	return (extended[LogicalOperator.AND]?.conditions?.length ?? 0) > 0 ? extended : {};
};

export const sanitizeSchema = (schema: TableSchema | null): TableSchema | null => {
	if (!schema) {
		return schema;
	}

	const cloned = { ...schema };
	Object.entries(cloned).forEach(([field, fieldSchema]) => {
		if (fieldSchema.visible === false) {
			delete cloned[field];
		}
	});
	return cloned;
};