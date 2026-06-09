import { getContext } from 'svelte';
import { buildOptionColorMap } from './optionsColors';

export type OptionsSourceCellConfig = {
	optionsSource?: string;
	datasource?: unknown;
	filter?: unknown;
	sortColumn?: string;
	sortOrder?: string;
	limit?: number;
	valueColumn?: string;
	labelColumn?: string;
	iconColumn?: string;
	colorColumn?: string;
	customOptions?: Array<{ value?: string; label?: string } | string>;
};

type OptionsSourceArgs = {
	getCellOptions: () => OptionsSourceCellConfig;
	getFieldSchema: () => Record<string, unknown> | undefined;
	defaultLimit?: number;
	skipCustomPalette?: boolean;
};

export function useOptionsSource({
	getCellOptions,
	getFieldSchema,
	defaultLimit = 15,
	skipCustomPalette = false
}: OptionsSourceArgs) {
	const { API, QueryUtils, fetchData, memo, derivedMemo } = getContext<{
		API: unknown;
		QueryUtils: {
			buildQuery: (filter: unknown) => unknown;
		};
		fetchData: (args: unknown) => {
			update: (args: unknown) => void;
			subscribe?: (fn: (value: unknown) => void) => () => void;
			loading?: boolean;
			loaded?: boolean;
			rows?: Array<Record<string, unknown>>;
			definition?: { primaryDisplay?: string };
		};
		memo: <T>(initial: T) => {
			subscribe: (fn: (value: T) => void) => () => void;
			set: (value: T) => void;
		};
		derivedMemo: <T, R>(
			source: { subscribe: (fn: (value: T) => void) => () => void },
			fn: (value: T) => R
		) => { subscribe: (fn: (value: R) => void) => () => void };
	}>('sdk');

	const options = memo<string[]>([]);
	const labels = memo<Record<string, string>>({});
	const dataSourceStore = memo<unknown>(undefined);

	let optionColors = $state<Record<string, string>>({});
	let optionIcons = $state<Record<string, string>>({});
	let filteredOptions = $state<string[]>([]);
	let fetch = $state<ReturnType<typeof fetchData>>();
	let loading = $state(false);
	let initLimit = $state(defaultLimit);

	const config = $derived(getCellOptions());
	const fieldSchema = $derived(getFieldSchema());
	const optionsSource = $derived(config.optionsSource ?? 'schema');

	const colors = derivedMemo(options, ($options) =>
		buildOptionColorMap($options, optionColors, skipCustomPalette && optionsSource === 'custom')
	);

	const createFetch = (datasource: unknown) => {
		initLimit = config.limit || defaultLimit;

		return fetchData({
			API,
			datasource,
			options: {
				query: QueryUtils.buildQuery(config.filter || []),
				sortColumn: config.sortColumn,
				sortOrder: config.sortOrder,
				limit: config.limit
			}
		});
	};

	const resetOptionStores = () => {
		options.set([]);
		labels.set({});
		optionColors = {};
		optionIcons = {};
		filteredOptions = [];
	};

	const loadSchemaOptions = () => {
		try {
			optionColors = (fieldSchema?.optionColors as Record<string, string>) || {};
			const inclusion = (fieldSchema?.constraints as { inclusion?: string[] })?.inclusion || [];
			options.set(inclusion);
			labels.set({});
			filteredOptions = inclusion;
		} catch {
			resetOptionStores();
		}
	};

	const loadDataOptions = (rows?: Array<Record<string, unknown>>) => {
		const nextOptions: string[] = [];
		const nextLabels: Record<string, string> = {};
		const valueColumn = config.valueColumn;
		const labelColumn = config.labelColumn;
		const colorColumn = config.colorColumn;
		const iconColumn = config.iconColumn;
		const primaryDisplay = labelColumn || fetch?.definition?.primaryDisplay;

		if (rows?.length && valueColumn) {
			rows.forEach((row) => {
				const value = row[valueColumn]?.toString();
				if (!value) return;

				nextOptions.push(value);
				nextLabels[value] = (row[primaryDisplay as string] as string) ?? value;
				if (colorColumn) optionColors[value] = row[colorColumn] as string;
				if (iconColumn) optionIcons[value] = row[iconColumn] as string;
			});
		}

		options.set(nextOptions);
		labels.set(nextLabels);
		filteredOptions = nextOptions;
	};

	const loadCustomOptions = () => {
		const nextOptions: string[] = [];
		const nextLabels: Record<string, string> = {};

		config.customOptions?.forEach((row) => {
			if (typeof row === 'string') {
				nextOptions.push(row);
				nextLabels[row] = row;
				return;
			}

			const value = row.value || '';
			nextOptions.push(value);
			nextLabels[value] = row.label || value;
		});

		options.set(nextOptions);
		labels.set(nextLabels);
		filteredOptions = nextOptions;
	};

	const loadOptions = (src = optionsSource) => {
		if (src === 'data') {
			loadDataOptions(fetch?.rows);
		} else if (src === 'custom') {
			loadCustomOptions();
		} else {
			loadSchemaOptions();
		}
	};

	const filterClientOptions = (term?: string | null) => {
		const currentOptions = getOptionsSnapshot();
		if (term) {
			filteredOptions = currentOptions.filter((x) =>
				x?.toLocaleLowerCase().includes(term.toLocaleLowerCase())
			);
		} else {
			filteredOptions = currentOptions;
		}
	};

	const filterPrefixOptions = (term?: string | null) => {
		const currentOptions = getOptionsSnapshot();
		if (term) {
			filteredOptions = currentOptions.filter((x) => x?.startsWith(term));
		} else {
			filteredOptions = currentOptions;
		}
	};

	const buildSearchFilter = (term?: string | null) => {
		let appliedFilter: Record<string, unknown> = {};

		if (
			config.filter &&
			typeof config.filter === 'object' &&
			Object.keys(config.filter).length > 0
		) {
			appliedFilter = JSON.parse(JSON.stringify(config.filter));
		} else {
			appliedFilter = {
				logicalOperator: 'all',
				onEmptyFilter: 'all',
				groups: []
			};
		}

		if (term != null && term.trim() !== '') {
			const searchFilterGroup = {
				logicalOperator: 'any',
				filters: [
					{
						valueType: 'Value',
						field: config.labelColumn || config.valueColumn,
						type: 'string',
						constraints: {
							type: 'string',
							length: {},
							presence: false
						},
						operator: 'fuzzy',
						noValue: false,
						value: term
					}
				]
			};

			if (!appliedFilter.groups) {
				appliedFilter.groups = [];
			}
			(appliedFilter.groups as unknown[]).push(searchFilterGroup);
		}

		return QueryUtils.buildQuery(appliedFilter);
	};

	const filterDataOptions = (term?: string | null) => {
		fetch?.update({
			query: buildSearchFilter(term)
		});
	};

	const filterOptions = (term?: string | null, mode: 'fuzzy' | 'prefix' = 'fuzzy') => {
		if (optionsSource === 'data') {
			filterDataOptions(term);
			return;
		}

		if (mode === 'prefix') {
			filterPrefixOptions(term);
		} else {
			filterClientOptions(term);
		}
	};

	const fetchMore = () => {
		if (fetch?.loading) return;
		if ((fetch?.rows?.length ?? 0) < initLimit) return;

		initLimit += 100;
		fetch?.update({
			limit: initLimit
		});
	};

	const handleScroll = (event: Event) => {
		const element = event.target as HTMLElement;
		const scrollTop = element.scrollTop;
		const scrollHeight = element.scrollHeight;
		const clientHeight = element.clientHeight;

		if (scrollTop + clientHeight >= scrollHeight - 50) {
			fetchMore();
		}
	};

	const refresh = () => {
		resetOptionStores();
		if (optionsSource !== 'data') {
			loadOptions(optionsSource);
		}
		return optionsSource === 'data';
	};

	const beginDataLoad = () => {
		fetch = createFetch(dataSourceStoreSnapshot());
		loading = true;
	};

	const endDataLoad = () => {
		loading = false;
	};

	const syncFetchLoaded = (loaded?: boolean) => loaded;

	let optionsSnapshot = $state<string[]>([]);
	let labelsSnapshot = $state<Record<string, string>>({});

	$effect(() => {
		const unsubscribe = options.subscribe((value) => {
			optionsSnapshot = value;
		});
		return unsubscribe;
	});

	$effect(() => {
		const unsubscribe = labels.subscribe((value) => {
			labelsSnapshot = value;
		});
		return unsubscribe;
	});

	const getOptionsSnapshot = () => optionsSnapshot;
	const getLabelsSnapshot = () => labelsSnapshot;

	let dataSourceStoreSnapshot = $state<unknown>(undefined);

	$effect(() => {
		const unsubscribe = dataSourceStore.subscribe((value) => {
			dataSourceStoreSnapshot = value;
		});
		return unsubscribe;
	});

	return {
		get options() {
			return options;
		},
		get labels() {
			return labels;
		},
		get dataSourceStore() {
			return dataSourceStore;
		},
		get optionColors() {
			return optionColors;
		},
		set optionColors(value) {
			optionColors = value;
		},
		get optionIcons() {
			return optionIcons;
		},
		get filteredOptions() {
			return filteredOptions;
		},
		set filteredOptions(value) {
			filteredOptions = value;
		},
		get fetch() {
			return fetch;
		},
		set fetch(value) {
			fetch = value;
		},
		get loading() {
			return loading;
		},
		set loading(value) {
			loading = value;
		},
		get initLimit() {
			return initLimit;
		},
		get colors() {
			return colors;
		},
		get optionsSource() {
			return optionsSource;
		},
		createFetch,
		resetOptionStores,
		loadSchemaOptions,
		loadDataOptions,
		loadCustomOptions,
		loadOptions,
		filterOptions,
		filterClientOptions,
		filterPrefixOptions,
		filterDataOptions,
		buildSearchFilter,
		fetchMore,
		handleScroll,
		refresh,
		beginDataLoad,
		endDataLoad,
		syncFetchLoaded,
		getOptionsSnapshot,
		getLabelsSnapshot
	};
}
