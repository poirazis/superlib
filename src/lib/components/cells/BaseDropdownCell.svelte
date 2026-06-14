<script lang="ts">
	import { getContext, untrack, tick } from 'svelte';
	import BaseCell from './BaseCell.svelte';
	import SuperPopover from '../SuperPopover/SuperPopover.svelte';
	import { tooltip } from '../../actions/tooltip';
	import { createEventDispatcher } from 'svelte';
	import fsm from 'svelte-fsm';
	import { copyAndTransition, deferJustCopied } from './cellClipboard';

	const { API, fetchData, QueryUtils } = getContext('sdk');

	interface Option {
		label: string;
		value: any;
		color?: string;
		icon?: string;
	}

	let {
		id,
		cellOptions,
		fieldSchema,
		value,
		multi: multiProp = false,
		autofocus = false
	} = $props();

	const dispatch = createEventDispatcher();

	let fetch = $state<ReturnType<typeof fetchData>>();

	let multi = $derived(fieldSchema?.type === 'array' ? true : multiProp);
	let inputSelect = $derived(cellOptions?.controlType === 'inputSelect');
	let disabled = $derived(cellOptions?.disabled);
	let readonly = $derived(cellOptions?.readonly);
	let copyable = $derived(cellOptions?.copyable);
	let role = $derived(cellOptions?.role);
	let error = $derived(cellOptions?.error);
	let icon = $derived(cellOptions?.icon);
	let filter = $derived(cellOptions?.filter);
	let optionsViewMode = $derived(cellOptions?.optionsViewMode ?? 'text');
	let source = $derived(cellOptions?.optionsSource);
	let datasource = $derived(cellOptions?.optionsSource == 'data' ? cellOptions.datasource : null);
	let isDataSource = $derived(source === 'data' && !!datasource);
	let serverSearch = $derived(isDataSource && (cellOptions?.search ?? true));
	let showPopupSearch = $derived(
		!inputSelect && (source === 'schema' || source === 'custom' || isDataSource)
	);
	let limit = $derived(cellOptions?.limit ?? 15);
	let labelColumn = $derived(cellOptions?.labelColumn || cellOptions?.valueColumn);
	let valueColumn = $derived(cellOptions?.valueColumn);
	let sortColumn = $derived(cellOptions?.sortColumn);
	let sortOrder = $derived(cellOptions?.sortOrder);
	let debounceDelay = $derived(cellOptions?.debounce || 250);
	let debounced = $derived(cellOptions?.debounced ?? false);
	let showDirty = $derived(cellOptions?.showDirty);

	let _message = $state<string | null>(null);
	let originalValue = $state<unknown>(null);
	let filterTerm = $state('');
	let popupSearchTerm = $state('');
	let focusIdx = $state(-1);
	let listElement = $state<HTMLElement | null>(null);
	let popupSearchInput = $state<HTMLInputElement | null>(null);
	let searchTimer = $state<ReturnType<typeof setTimeout>>();
	let currentLimit = $state(15);
	let isInitialLoad = $state(true);

	let anchor = $state<HTMLElement | null>(null);
	let popup = $state<HTMLElement | null>(null);
	let editor = $state<HTMLInputElement | null>(null);

	let open = $state(false);
	let localValue = $state<Option[]>([]);

	let isEmpty = $derived(localValue?.length < 1);
	let pills = $derived(optionsViewMode === 'pills');
	let bullets = $derived(optionsViewMode === 'bullets');
	let plaintext = $derived(optionsViewMode === 'text');

	let tabindex = $state(0);

	const emitChange = () => {
		dispatch('change', getEmittedValue());
		dispatch('labelChange', getEmittedLabel());
	};

	const clearSearchState = () => {
		popupSearchTerm = '';
		filterTerm = '';
		focusIdx = -1;
	};

	let allOptions: Option[] = $derived.by(() => {
		if (source == 'schema') {
			const inclusion = fieldSchema?.constraints?.inclusion || [];
			return inclusion?.map((opt) => ({
				label: opt,
				value: opt,
				color: fieldSchema?.optionColors?.[opt]
			}));
		} else if (source === 'custom') {
			return (
				cellOptions.customOptions?.map((opt) => ({
					label: opt.label,
					value: opt.value,
					color: opt.color,
					icon: opt.icon
				})) ?? []
			);
		} else if (isDataSource) {
			return (
				$fetch?.rows?.map((row) => ({
					label: row[labelColumn],
					value: row[valueColumn],
					color: cellOptions.colorColumn ? row[cellOptions.colorColumn] : undefined,
					icon: cellOptions.iconColumn ? row[cellOptions.iconColumn] : undefined
				})) ?? []
			);
		}

		return [];
	});

	let activeSearchTerm = $derived(
		inputSelect ? filterTerm || editor?.value || '' : popupSearchTerm
	);

	let displayOptions: Option[] = $derived.by(() => {
		const base = allOptions ?? [];
		const term = activeSearchTerm.trim();

		if (!term) {
			return base;
		}

		if (isDataSource && serverSearch) {
			return base;
		}

		const lower = term.toLowerCase();
		return base.filter((option) =>
			String(option.label ?? option.value)
				.toLowerCase()
				.includes(lower)
		);
	});

	function resolveToOptions(raw: any): Option[] {
		const items = Array.isArray(raw) ? raw : raw != null && raw !== '' ? [raw] : [];

		return items
			.map((item) => {
				if (item && typeof item === 'object' && 'value' in item) {
					const matched = allOptions?.find((option) => option.value === item.value);
					return (
						matched ?? {
							label: item.label ?? String(item.value),
							value: item.value,
							color: item.color
						}
					);
				}

				const matched = allOptions?.find((option) => option.value === item);
				if (matched) return matched;

				if (inputSelect) {
					return { label: String(item), value: item };
				}

				return null;
			})
			.filter((item): item is Option => item != null);
	}

	function getEmittedValue() {
		if (multi) {
			return localValue.map((option) => option.value);
		}

		return localValue[0]?.value ?? null;
	}

	function getEmittedLabel() {
		if (multi) {
			return localValue.map((option) => option.label);
		}

		return localValue[0]?.label ?? null;
	}

	function isSelected(option: Option) {
		return localValue.some((selected) => selected.value === option.value);
	}

	const buildDataQuery = (term: string) => {
		const baseFilter = filter ?? [];

		if (!term) {
			return QueryUtils.buildQuery(baseFilter);
		}

		return QueryUtils.buildQuery([
			...baseFilter,
			{
				field: labelColumn,
				type: 'string',
				operator: 'fuzzy',
				value: term,
				valueType: 'Value'
			}
		]);
	};

	const scheduleDataSearch = (term: string) => {
		if (!fetch || !isDataSource || !serverSearch) return;

		clearTimeout(searchTimer);
		const delay = inputSelect ? debounceDelay : 200;

		searchTimer = setTimeout(() => {
			currentLimit = limit;
			fetch?.update({
				query: buildDataQuery(term),
				limit: currentLimit,
				sortColumn,
				sortOrder
			});
		}, delay);
	};

	const fetchMore = () => {
		if ($fetch?.loading) return;
		if (($fetch?.rows?.length ?? 0) < currentLimit) return;
		currentLimit += 100;
		fetch?.update({
			query: buildDataQuery(activeSearchTerm),
			limit: currentLimit,
			sortColumn,
			sortOrder
		});
	};

	const handleScroll = (e: Event) => {
		if (!isDataSource) return;
		const element = e.target as HTMLElement;
		if (element.scrollTop + element.clientHeight >= element.scrollHeight - 50) {
			fetchMore();
		}
	};

	const scrollHighlightedIntoView = async () => {
		if (focusIdx < 0 || !listElement) return;
		await tick();
		const highlighted = listElement.querySelector('.option.highlighted');
		highlighted?.scrollIntoView({ block: 'nearest' });
	};

	const handlePopupSearch = (e: Event) => {
		popupSearchTerm = (e.target as HTMLInputElement).value;
		focusIdx = popupSearchTerm && displayOptions.length ? 0 : -1;
		if (isDataSource && serverSearch) {
			scheduleDataSearch(popupSearchTerm);
		}
	};

	const navigateOptions = (e: KeyboardEvent) => {
		const opts = displayOptions;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (!open) {
				open = true;
				focusIdx = opts.length ? 0 : -1;
				return;
			}
			focusIdx = Math.min(focusIdx + 1, opts.length - 1);
			if (focusIdx < 0 && opts.length) focusIdx = 0;
			scrollHighlightedIntoView();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			focusIdx = Math.max(focusIdx - 1, 0);
			scrollHighlightedIntoView();
		} else if (e.key === 'Enter' && focusIdx > -1 && opts[focusIdx]) {
			e.preventDefault();
			csm.selectOption(opts[focusIdx].value);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			if (open) {
				open = false;
				clearSearchState();
				anchor?.focus();
			} else {
				csm.cancel();
			}
		}
	};

	let csm = fsm('view', {
		'*': {
			goTo: (state) => state
		},
		view: {
			focus: () => {
				return 'editing';
			},
			keydown(e: KeyboardEvent) {
				if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
					navigateOptions(e);
					return 'editing';
				}
			}
		},
		editing: {
			_enter: () => {
				if (allOptions.length === 0 && !inputSelect && !isDataSource) {
					_message = 'No options available';
					setTimeout(() => {
						_message = null;
					}, 1000);
					return 'view';
				}
				originalValue = getEmittedValue();
				open = true;
				focusIdx = -1;
				dispatch('enteredit');
			},
			_exit: () => {
				open = false;
				clearSearchState();
				dispatch('exitedit');
				if (!debounced) {
					emitChange();
				}
			},
			cancel() {
				localValue = resolveToOptions(originalValue);
				open = false;
				clearSearchState();
				dispatch('cancel');
				anchor?.focus();
				return 'view';
			},
			debounce() {
				const term = editor?.value ?? '';
				filterTerm = term;
				open = true;
				focusIdx = term && displayOptions.length ? 0 : -1;

				if (isDataSource) {
					scheduleDataSearch(term);
				}

				localValue = term
					? [
							{
								value: term,
								label: term
							}
						]
					: [];

				if (debounced) {
					emitChange();
				}
			},
			click: () => {
				open = !open;
				if (open) {
					focusIdx = -1;
				}
			},
			selectOption: (newValue: string) => {
				const option =
					displayOptions.find((item) => item.value === newValue) ??
					allOptions.find((item) => item.value === newValue);
				if (!option) return;

				const pos = localValue.findIndex((item) => item.value === newValue);

				if (multi) {
					if (pos > -1) {
						localValue = localValue.filter((_, index) => index !== pos);
					} else {
						localValue = [...localValue, option];
					}
					if (debounced) {
						emitChange();
					}
					return;
				}

				if (pos > -1) {
					localValue = [];
				} else {
					localValue = [option];
					if (inputSelect && editor) {
						editor.value = String(option.label ?? option.value);
						filterTerm = editor.value;
					}
				}

				if (debounced) {
					emitChange();
				}

				open = false;
				clearSearchState();
				anchor?.focus();
				return 'view';
			},
			focusout: (e: FocusEvent) => {
				const related = e.relatedTarget as Node | null;
				if (related) {
					if (related == editor || related == popupSearchInput) {
						return;
					}
				}
				return 'view';
			},
			popupFocusout: (e: FocusEvent) => {
				if (anchor?.contains(e.relatedTarget as Node | null)) {
					return;
				}
				return 'view';
			},
			keydown(e: KeyboardEvent) {
				navigateOptions(e);
			},
			popupKeydown(e: KeyboardEvent) {
				if (e.key === 'Tab') {
					anchor?.focus();
					return 'view';
				}
				navigateOptions(e);
			}
		},
		readonly: {},
		disabled: {},
		copyable: {
			click() {
				const copyValue = Array.isArray(value)
					? value.join(', ')
					: value != null
						? String(value)
						: '';

				copyAndTransition(() => csm, copyValue);
			},
			keydown(e: KeyboardEvent) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.click();
				}
			}
		},
		justCopied: deferJustCopied(() => csm)
	});

	let isDirty = $derived(
		$csm === 'editing' && JSON.stringify(getEmittedValue()) !== JSON.stringify(originalValue)
	);

	$effect(() => {
		void value;
		void allOptions;
		localValue = resolveToOptions(value);
	});

	$effect(() => {
		void datasource;
		void filter;
		void limit;
		if (!isDataSource) return;

		untrack(() => {
			currentLimit = limit;
			isInitialLoad = true;
			fetch = fetchData({
				API,
				datasource,
				options: {
					query: QueryUtils.buildQuery(filter ?? []),
					limit: currentLimit,
					sortColumn,
					sortOrder
				}
			});
		});
	});

	$effect(() => {
		if ($fetch?.loaded) {
			isInitialLoad = false;
		}
	});

	$effect(() => {
		void displayOptions;
		focusIdx = Math.min(focusIdx, Math.max(displayOptions.length - 1, -1));
	});

	$effect(() => {
		if (disabled) {
			csm.goTo('disabled');
		} else if (readonly && copyable && !isEmpty) {
			csm.goTo('copyable');
		} else if (readonly) {
			csm.goTo('readonly');
		} else {
			csm.goTo('view');
		}

		tabindex = readonly || disabled ? -1 : 0;
	});

	$effect(() => {
		if (autofocus) {
			setTimeout(() => {
				csm.focus();
			}, 50);
		}

		return () => {
			clearTimeout(searchTimer);
		};
	});

	const focus = (node: HTMLElement) => {
		node?.focus();
	};
</script>

<!-- svelte-ignore a11y_interactive_supports_focus -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore event_directive_deprecated -->
<BaseCell
	{id}
	bind:anchor
	{csm}
	{role}
	{error}
	{icon}
	isDirty={isDirty && showDirty}
	popupOpen={open}
>
	{#key $csm}
		{#if $csm !== 'editing' || !inputSelect}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<span class="value" class:placeholder={isEmpty}>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="value-content" use:tooltip>
					{#key localValue}
						{#if isEmpty}
							{_message || cellOptions?.placeholder || 'Select...'}
						{:else}
							<div class="items" class:pills class:bullets>
								{#if plaintext}
									{#each localValue as val, idx (val.value)}
										{val.label}{idx < localValue.length - 1 ? ', ' : ''}
									{/each}
								{:else}
									{#each localValue as val (val.value)}
										<div class="item" style:--option-color={val.color}>
											<div class="loope"></div>
											<span>{val.label}</span>
										</div>
									{/each}
								{/if}
							</div>
						{/if}
					{/key}
				</div>
			</span>
		{:else}
			<input
				bind:this={editor}
				class="editor"
				{tabindex}
				class:placeholder={isEmpty}
				value={_message || localValue[0]?.value}
				placeholder={cellOptions?.placeholder}
				style:text-align={cellOptions.align}
				on:input={csm.debounce}
				on:focusout={csm.focusout}
				on:keydown={csm.keydown}
				use:focus
			/>
		{/if}
		{#if $csm === 'view' || $csm == 'editing'}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<i class="ph ph-caret-down control-icon" on:click|self={csm.click}></i>
		{/if}
	{/key}
</BaseCell>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore event_directive_deprecated -->
<SuperPopover {anchor} {open} useAnchorWidth={true} dismissible={false}>
	{#snippet renderOption(option: Option, idx: number, selected: boolean = isSelected(option))}
		<div
			class="option"
			class:selected
			class:highlighted={focusIdx === idx}
			on:mouseenter={() => (focusIdx = idx)}
			on:mousedown|preventDefault={() => csm.selectOption(option.value)}
		>
			{#if option?.icon}
				<span class="icon">{option.icon}</span>
			{/if}
			<span class="label" use:tooltip>{option?.label}</span>
			{#if selected}
				<span class="ph ph-check"></span>
			{/if}
		</div>
	{/snippet}

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore event_directive_deprecated -->
	<div class="popup" on:focusout={csm.popupFocusout} on:keydown={csm.popupKeydown}>
		{#if showPopupSearch}
			<div class="searchControl">
				<i
					class={$fetch?.loading && isInitialLoad
						? 'ph ph-spinner spin'
						: popupSearchTerm
							? 'ri-filter-fill'
							: 'ri-search-line'}
					style:color={popupSearchTerm
						? 'var(--spectrum-global-color-blue-400)'
						: 'var(--spectrum-global-color-gray-700)'}
				></i>
				<input
					bind:this={popupSearchInput}
					class="search"
					class:placeholder={!popupSearchTerm}
					type="text"
					placeholder={'Search...'}
					value={popupSearchTerm}
					use:focus
					on:input={handlePopupSearch}
				/>
			</div>
		{/if}

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore event_directive_deprecated -->
		<div
			class="options"
			bind:this={listElement}
			on:scroll={handleScroll}
			on:mousedown|preventDefault={() => {}}
		>
			{#if displayOptions.length === 0}
				<div class="option disabled">
					{#if isDataSource && $fetch?.loading}
						<i class="ph ph-spinner spin"></i>
						Loading...
					{:else}
						No options available
					{/if}
				</div>
			{:else}
				{#each displayOptions as option, idx (option.value)}
					{@render renderOption(option, idx)}
				{/each}
				{#if isDataSource && $fetch?.loading && $fetch.loaded}
					<div class="option disabled loading">
						<i class="ph ph-spinner spin"></i>
						Loading more...
					</div>
				{/if}
			{/if}
		</div>
	</div>
</SuperPopover>

<style>
	.popup {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.searchControl {
		height: 2rem;
		border-bottom: 1px solid var(--spectrum-global-color-gray-300);
		display: flex;
		align-items: center;
		padding-left: 0.5rem;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	.searchControl > i {
		font-size: 14px;
	}

	.searchControl > input {
		height: 100%;
		width: 100%;
		outline: none;
		background: none;
		border: none;
		color: inherit;
		padding-left: 0.5rem;
		font-family: inherit;
		font-size: inherit;
	}

	.searchControl > input.placeholder {
		font-style: italic;
		color: var(--spectrum-global-color-gray-600);
	}

	.options {
		display: flex;
		flex-direction: column;
		height: auto;
		max-height: 300px;
		overflow-y: auto;
		overflow-x: hidden;
	}

	.option {
		padding: 0.5em 1em;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.5em;
		min-width: 0;
	}

	.option.disabled {
		color: var(--spectrum-global-color-gray-500);
		cursor: not-allowed;
		gap: 0.5rem;
	}

	.option.loading {
		font-style: italic;
		justify-content: center;
	}

	.option:hover,
	.option.highlighted {
		background-color: var(--spectrum-global-color-gray-100);
	}

	.option.selected {
		font-weight: 500;
	}

	.label {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	span.value {
		min-width: 0;
		max-width: 100%;
		flex: 1 1 auto;
		display: flex;
		align-items: stretch;
		height: 100%;
		background: transparent;
		color: inherit;
		border: none;
		outline: none;
		cursor: inherit;
		padding: 0.25rem 0.75rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	span.value:has(.items) {
		white-space: normal;
	}

	.value-content {
		min-width: 0;
		flex: 1;
		font-style: inherit;
		font-size: 13px;
		text-overflow: ellipsis;
		overflow: hidden;
		white-space: nowrap;
		display: flex;
		align-items: center;
	}

	.value-content:has(.items) {
		white-space: normal;
		display: flex;
	}

	.value.placeholder .value-content {
		color: var(--spectrum-global-color-gray-500);
		font-style: italic !important;
	}

	.items {
		flex: auto;
		display: flex;
		overflow: hidden;
		align-items: stretch;
		gap: 0.5rem;
		min-width: 0;
	}

	.item {
		display: flex;
		align-items: center;
		overflow: hidden;
		min-width: 0;
		gap: 0.5rem;
		padding: 0rem 0.5rem;
	}

	.item span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.item .loope {
		display: none;
	}

	.items.pills .item {
		background-color: var(--option-color, var(--spectrum-global-color-gray-100));
		border: 1px solid var(--option-color, var(--spectrum-global-color-gray-200));
		border-radius: 4px;
		align-self: stretch;
		padding: 0.25rem 0.5rem;
		font-size: 12px;
	}

	.items.bullets .item {
		padding: unset;
	}

	.items.bullets .item .loope {
		display: block;
	}

	.loope {
		width: 14px;
		height: 14px;
		border-radius: 2px;
		background-color: var(--option-color, var(--spectrum-global-color-gray-300));
		flex-shrink: 0;
	}

	:global(.spin) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
