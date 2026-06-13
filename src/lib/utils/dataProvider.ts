export const LogicalOperator = {
	AND: '$and',
	OR: '$or'
} as const;

export const EmptyFilterOption = {
	RETURN_NONE: 'none'
} as const;

export const extendQuery = (
	defaultQuery: Record<string, unknown> | null | undefined,
	extensions: Record<string, unknown>
) => {
	if (!Object.keys(extensions).length) {
		return defaultQuery ?? {};
	}

	const extended = {
		[LogicalOperator.AND]: {
			conditions: [...(defaultQuery ? [defaultQuery] : []), ...Object.values(extensions || {})]
		},
		onEmptyFilter: EmptyFilterOption.RETURN_NONE
	};

	return (extended[LogicalOperator.AND]?.conditions?.length ?? 0) > 0 ? extended : {};
};

export const sanitizeSchema = (schema: Record<string, { visible?: boolean }> | null) => {
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