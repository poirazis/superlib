export const PICKER_SEARCH_DEBOUNCE_MS = 200;
export const PICKER_FETCH_MORE_INCREMENT = 100;
export const PICKER_SCROLL_THRESHOLD_PX = 50;

type QueryUtilsLike = {
	buildQuery: (filters: unknown[]) => unknown;
};

export function clampFocusIdx(idx: number, count: number): number {
	if (count < 1) return -1;
	return Math.min(Math.max(idx, -1), count - 1);
}

export function shouldFetchMore(
	element: HTMLElement,
	loading: boolean,
	hasMore: boolean
): boolean {
	if (loading || !hasMore) return false;
	return (
		element.scrollTop + element.clientHeight >=
		element.scrollHeight - PICKER_SCROLL_THRESHOLD_PX
	);
}

export function extendQuery(
	baseQuery: Record<string, unknown>,
	extensions: Record<string, unknown>
): Record<string, unknown> {
	if (!Object.keys(extensions).length) {
		return baseQuery;
	}

	const extended = {
		$and: {
			conditions: [...(baseQuery ? [baseQuery] : []), ...Object.values(extensions || {})]
		},
		onEmptyFilter: 'none'
	};

	return (extended.$and?.conditions?.length ?? 0) > 0 ? extended : {};
}

export function buildFuzzyDataQuery(
	QueryUtils: QueryUtilsLike,
	filter: unknown[],
	labelField: string,
	term: string
) {
	if (!term) {
		return QueryUtils.buildQuery(filter);
	}

	return QueryUtils.buildQuery([
		...filter,
		{
			field: labelField,
			type: 'string',
			operator: 'fuzzy',
			value: term,
			valueType: 'Value'
		}
	]);
}

export function buildSqlPickerQuery(
	QueryUtils: QueryUtilsLike,
	filter: unknown[],
	relatedColumns: Array<{ name: string }>,
	relatedField: string,
	primaryDisplayField: string | undefined,
	term: string,
	serverSearch: boolean
) {
	const defaultQuery = QueryUtils.buildQuery(filter) as Record<string, unknown>;

	if (!term || !serverSearch) {
		return defaultQuery;
	}

	if (relatedColumns.length > 0) {
		return extendQuery(defaultQuery, {
			search: {
				$or: {
					conditions: relatedColumns.map((col) => ({
						fuzzy: {
							[col.name]: term
						}
					}))
				}
			}
		});
	}

	const displayField = primaryDisplayField || relatedField;

	return extendQuery(defaultQuery, {
		search: QueryUtils.buildQuery([
			{
				field: displayField,
				type: 'string',
				operator: 'fuzzy',
				value: term,
				valueType: 'Value'
			}
		])
	});
}

export function schedulePickerFetchUpdate(options: {
	fetch: { update: (opts: { query: unknown; limit: number }) => void } | undefined;
	timer: ReturnType<typeof setTimeout> | undefined;
	setTimer: (timer: ReturnType<typeof setTimeout> | undefined) => void;
	query: unknown;
	limit: number;
	debounceMs?: number;
	onScheduled?: () => void;
}) {
	const { fetch, timer, setTimer, query, limit, debounceMs = PICKER_SEARCH_DEBOUNCE_MS, onScheduled } =
		options;

	if (!fetch) return;

	if (timer) clearTimeout(timer);

	const nextTimer = setTimeout(() => {
		onScheduled?.();
		fetch.update({ query, limit });
	}, debounceMs);

	setTimer(nextTimer);
}