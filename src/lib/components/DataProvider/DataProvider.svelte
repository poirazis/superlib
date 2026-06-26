<script lang="ts">
	import { getContext, untrack } from 'svelte';
	import { createAutoRefresh } from '../../utils/autoRefresh.js';
	import { extendQuery, sanitizeSchema } from '../../utils/dataProvider.js';

	type ProviderDatasource = {
		type: string;
		tableId?: string;
		[key: string]: unknown;
	};

	let {
		dataSource,
		filter = undefined,
		sortColumn = undefined,
		sortOrder = undefined,
		limit = 10,
		paginate = true,
		autoRefresh = undefined,
		bare = false,
		showLoading = true,
		queryExtensions = $bindable({}),
		fetch = $bindable(),
		children
	} = $props();

	const sdk = getContext<{
		API?: unknown;
		fetchData?: (args: Record<string, unknown>) => {
			subscribe: (fn: (value: Record<string, unknown>) => void) => () => void;
			update: (options: Record<string, unknown>) => void;
			refresh: () => void;
			prevPage: () => void;
			nextPage: () => void;
		};
		QueryUtils?: { buildQuery: (filter: unknown) => Record<string, unknown> };
		Provider?: unknown;
		ActionTypes?: Record<string, string>;
		styleable?: unknown;
		builderStore?: { inBuilder?: boolean; selectedComponentId?: string };
	}>('sdk');

	const component = getContext<{ id?: string; styles?: Record<string, unknown> } | undefined>(
		'component'
	);

	const { API, fetchData, QueryUtils, Provider, ActionTypes, styleable, builderStore } = sdk ?? {};

	const autoRefreshActions = createAutoRefresh();

	let defaultQuery = $derived(QueryUtils?.buildQuery(filter) ?? {});
	let query = $derived(extendQuery(defaultQuery, queryExtensions));

	let dataContext = $derived({
		rows: $fetch?.rows ?? [],
		info: $fetch?.info,
		datasource: dataSource || {},
		schema: sanitizeSchema($fetch?.schema ?? null),
		rowsLength: $fetch?.rows?.length ?? 0,
		pageNumber: ($fetch?.pageNumber ?? 0) + 1,
		id: component?.id,
		state: {
			query: $fetch?.query
		},
		limit,
		primaryDisplay: $fetch?.definition?.primaryDisplay,
		loaded: $fetch?.loaded
	});

	let actions = $derived([
		{
			type: ActionTypes?.RefreshDatasource,
			callback: () => fetch?.refresh(),
			metadata: { dataSource }
		},
		{
			type: ActionTypes?.AddDataProviderQueryExtension,
			callback: addQueryExtension
		},
		{
			type: ActionTypes?.RemoveDataProviderQueryExtension,
			callback: removeQueryExtension
		},
		{
			type: ActionTypes?.SetDataProviderSorting,
			callback: ({ column, order }: { column?: string; order?: string }) => {
				const newOptions: Record<string, unknown> = {};
				if (column) {
					newOptions.sortColumn = column;
				}
				if (order) {
					newOptions.sortOrder = order;
				}
				if (Object.keys(newOptions).length) {
					fetch?.update(newOptions);
				}
			}
		}
	]);

	const addQueryExtension = (key: string, extension: unknown) => {
		if (!key || !extension) {
			return;
		}
		queryExtensions = { ...queryExtensions, [key]: extension };
	};

	const removeQueryExtension = (key: string) => {
		if (!key) {
			return;
		}
		const next = { ...queryExtensions };
		delete next[key];
		queryExtensions = next;
	};

	$effect(() => {
		if (!dataSource || !fetchData || !API) {
			fetch = undefined;
			return;
		}

		const datasource = dataSource;
		untrack(() => {
			fetch = fetchData({
				API,
				datasource,
				options: {
					query: defaultQuery,
					sortColumn,
					sortOrder,
					limit,
					paginate
				}
			});
		});
	});

	$effect(() => {
		if (!fetch) return;
		fetch.update({ query, sortColumn, sortOrder, limit, paginate });
	});

	$effect(() => {
		const enabled = !builderStore?.inBuilder || !builderStore?.selectedComponentId;
		autoRefreshActions.setUp(enabled ? autoRefresh : null, () => fetch?.refresh());

		return () => {
			autoRefreshActions.clear();
		};
	});
</script>

<!-- svelte-ignore event_directive_deprecated -->
{#if bare}
	{@render children?.()}
{:else}
	<div use:styleable={component?.styles} class="container">
		<Provider {actions} data={dataContext}>
			{#if showLoading && !$fetch?.loaded}
				<div class="loading">
					<i class="ph ph-spinner spin"></i>
				</div>
			{:else}
				{@render children?.()}
				{#if paginate && $fetch?.supportsPagination}
					<div class="pagination">
						<button
							type="button"
							class="page-button"
							aria-label="Previous page"
							disabled={!$fetch?.hasPrevPage}
							on:click={() => fetch?.prevPage()}
						>
							<i class="ph ph-caret-left"></i>
						</button>
						<span class="page-label">Page {$fetch.pageNumber + 1}</span>
						<button
							type="button"
							class="page-button"
							aria-label="Next page"
							disabled={!$fetch?.hasNextPage}
							on:click={() => fetch?.nextPage()}
						>
							<i class="ph ph-caret-right"></i>
						</button>
					</div>
				{/if}
			{/if}
		</Provider>
	</div>
{/if}

<style>
	.container {
		display: flex;
		flex-direction: column;
		justify-content: flex-start;
		align-items: stretch;
	}

	.loading {
		display: flex;
		flex-direction: row;
		justify-content: center;
		align-items: center;
		height: 100px;
		color: var(--spectrum-global-color-gray-600);
	}

	.pagination {
		display: flex;
		flex-direction: row;
		justify-content: flex-end;
		align-items: center;
		gap: 0.5rem;
		margin-top: var(--spacing-xl, 1rem);
	}

	.page-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--spectrum-global-color-gray-300);
		background: var(--spectrum-global-color-gray-50);
		border-radius: 4px;
		padding: 0.25rem 0.5rem;
		cursor: pointer;
	}

	.page-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.page-label {
		font-size: 13px;
		color: var(--spectrum-global-color-gray-700);
	}
</style>
