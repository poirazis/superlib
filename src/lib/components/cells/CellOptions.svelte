<script>
	import { createEventDispatcher, tick } from 'svelte';
	import CellPickerFrame from './CellPickerFrame.svelte';
	import CellPickerOptionsList from './CellPickerOptionsList.svelte';
	import CellPickerOption from './CellPickerOption.svelte';
	import PickerPopover from './PickerPopover.svelte';
	import { OPTIONS_COLORS_ARRAY } from './optionsColors';
	import { useOptionsSource } from './useOptionsSource.svelte';
	import './CellCommon.css';
	import fsm from 'svelte-fsm';

	const dispatch = createEventDispatcher();

	let {
		id,
		cellOptions,
		value,
		fieldSchema,
		multi: multiProp = false,
		autofocus = false
	} = $props();

	let anchor = $state();
	let editor = $state();
	let optionsList = $state();
	let focusedOptionIdx = $state(-1);
	let timer = $state();
	let localValue = $state([]);

	let searchTerm = $state(null);
	let inputValue = $state(null);

	let config = $derived(cellOptions ?? {});

	let controlType = $derived(config.controlType);
	let optionsViewMode = $derived(config.optionsViewMode);
	let role = $derived(config.role);
	let readonly = $derived(config.readonly);
	let disabled = $derived(config.disabled);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let pickerWidth = $derived(config.pickerWidth);
	let autocomplete = $derived(config.autocomplete);
	let placeholder = $derived(config.placeholder || '');
	let align = $derived(config.align);
	let padding = $derived(config.padding);
	let showDirty = $derived(config.showDirty);
	let iconColumn = $derived(config.iconColumn);

	const source = useOptionsSource({
		getCellOptions: () => cellOptions ?? {},
		getFieldSchema: () => fieldSchema
	});

	const { options, labels, dataSourceStore, colors } = source;
	let optionsSource = $derived(source.optionsSource);

	const editorState = fsm('Closed', {
		'*': {
			toggleOption(idx) {
				if (idx < 0) return;

				if (cellOptions.disabled || cellOptions.readonly) return;
				let option = source.filteredOptions[idx];
				let pos = localValue.indexOf(option);

				if (multi && pos > -1) {
					localValue.splice(pos, 1);
					localValue = [...localValue];
				} else if (multi) {
					localValue = [...localValue, option];
				} else {
					if (localValue[0] == option) localValue.length = 0;
					else localValue[0] = option;

					localValue = [...localValue];

					inputValue = $labels[localValue[0]] || localValue[0] || '';
				}

				if (cellOptions.debounce) {
					clearTimeout(timer);
					timer = setTimeout(() => {
						dispatch('change', multi ? localValue : localValue[0]);
						dispatch(
							'labelChange',
							multi
								? localValue.map((val) => $labels[val] || val)
								: $labels[localValue[0]] || localValue[0]
						);
					}, cellOptions.debounce ?? 0);
				}

				if (cellOptions.autocomplete) {
					if (multi) {
						this.filterOptions();
					}
				}
				if (!multi) {
					this.close.debounce(10);
					if (cellOptions.controlType != 'inputSelect') anchor?.focus();
					else editor?.focus();
				}
			},
			filterOptions(term) {
				source.filterOptions(term);
			},
			clearFilter() {
				searchTerm = null;
				this.filterOptions();
			}
		},
		Open: {
			_enter() {
				searchTerm = '';
				focusedOptionIdx = -1;
			},
			toggle() {
				return 'Closed';
			},
			close() {
				return 'Closed';
			},
			handleKeyboard(e) {
				if (e.key === 'Backspace' || e.key === 'Delete') {
					searchTerm = searchTerm.slice(0, -1);
					this.filterOptions(searchTerm);
				} else if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
					searchTerm = searchTerm + e.key;
					this.filterOptions(searchTerm);
					if (searchTerm?.length && $editorState == 'Closed') this.toggle();
				}

				if (e.keyCode == 32) {
					if (focusedOptionIdx > -1) {
						this.toggleOption(focusedOptionIdx, e.preventDefault());
						if (!multi) this.close(e.preventDefault());
					} else if (!inputSelect) {
						this.close();
					}
				}

				if (e.key == 'Escape') {
					e.stopPropagation();
					e.preventDefault();
					searchTerm = null;
					//anchor?.focus();
					return 'Closed';
				}

				if (e.key == 'Enter') {
					if (focusedOptionIdx > -1 && source.filteredOptions[focusedOptionIdx])
						if (!multi) this.toggleOption(focusedOptionIdx);

					cellState.submit();
					editorState.close();
				}

				if (e.key == 'ArrowDown') this.highlightNext();
				if (e.key == 'ArrowUp') this.highlightPrevious();
			},
			highlightNext() {
				focusedOptionIdx += 1;
				if (focusedOptionIdx > source.filteredOptions.length - 1) focusedOptionIdx = 0;
				tick().then(() => {
					const focusedElement = optionsList.querySelector('.option.focused');
					if (focusedElement) {
						focusedElement.scrollIntoView({
							behavior: 'smooth',
							block: 'nearest'
						});
					}
				});
			},
			highlightPrevious() {
				focusedOptionIdx -= 1;
				if (focusedOptionIdx < 0) focusedOptionIdx = source.filteredOptions.length - 1;
				tick().then(() => {
					const focusedElement = optionsList.querySelector('.option.focused');
					if (focusedElement) {
						focusedElement.scrollIntoView({
							behavior: 'smooth',
							block: 'nearest'
						});
					}
				});
			},
			fetchMore() {
				source.fetchMore();
			},
			handleScroll(e) {
				source.handleScroll(e);
			}
		},
		Closed: {
			_enter() {},
			toggle() {
				return 'Open';
			},
			open() {
				return 'Open';
			},
			highlightNext() {
				this.open();
				focusedOptionIdx = 0;
				tick().then(() => {
					const focusedElement = optionsList.querySelector('.option.focused');
					if (focusedElement) {
						focusedElement.scrollIntoView({
							behavior: 'smooth',
							block: 'nearest'
						});
					}
				});
			},
			handleKeyboard(e) {
				if (!inEdit) return;

				if (e.key == 'Escape') {
					cellState.cancel();
					return;
				}

				if (e.key == 'Enter') {
					if (inputValue?.trim()) {
						if (multi) {
							localValue = [...localValue, inputValue.trim()];
						} else {
							localValue = [inputValue.trim()];
						}
						inputValue = '';
					}
				}

				if (controlType == 'select') {
					this.open();
					this.handleKeyboard(e);
					if (e.key == 'ArrowDown' || e.keyCode == 32) this.toggle();
					if (e.key == 'Backspace' || e.key == 'Delete') {
						localValue = [];
						dispatch('change', localValue);
					}
				}
			}
		}
	});

	export const cellState = fsm('View', {
		'*': {
			goTo(state) {
				return state;
			},
			refresh() {
				return source.refresh() ? 'Loading' : 'View';
			},
			reload() {
				source.loadOptions(optionsSource);
			},
			loadOptions(src) {
				source.loadOptions(src);
			}
		},
		Loading: {
			_enter() {
				source.fetch = source.createFetch($dataSourceStore);
				source.loading = true;
			},
			_exit() {
				source.loading = false;
			},
			refresh() {},
			reload() {},
			syncFetch(fetchState) {
				if (source.syncFetchLoaded(fetchState?.loaded)) {
					return cellOptions.initialState || 'View';
				}
			},
			focus(e) {
				if (!cellOptions.readonly && !cellOptions.disabled) {
					return 'Editing';
				}
			}
		},
		View: {
			_enter() {
				searchTerm = null;
				editorState.filterOptions();
			},
			toggle(e) {
				if (cellOptions.disabled || cellOptions.readonly) return;
				return 'Editing';
			},
			focus(e) {
				if (!readonly && !disabled) {
					return 'Editing';
				}
			}
		},
		Editing: {
			_enter() {
				editorState.open();

				setTimeout(() => {
					editor?.focus();
				}, 30);
				originalValue = JSON.stringify(Array.isArray(value) ? value : value ? [value] : []);
				inputValue = multi ? '' : $labels[localValue[0]] || localValue[0] || '';

				dispatch('enteredit');
			},
			_exit() {
				searchTerm = null;
				inputValue = null;
				editorState.close();
				dispatch('exitedit');
			},
			toggle(e) {
				if (!inputSelect && searchTerm) {
					return;
				}
				e.preventDefault();
				editorState.toggle();
			},
			focusout(e) {
				if (anchor.contains(e.relatedTarget)) {
					return;
				}

				if (cellOptions.debounce && isDirty) {
					clearTimeout(timer);
					dispatch('change', multi ? localValue : localValue[0]);
					dispatch(
						'labelChange',
						multi
							? localValue.map((val) => $labels[val] || val)
							: $labels[localValue[0]] || localValue[0]
					);
				} else {
					this.submit();
				}
				dispatch('focusout');
				return 'View';
			},
			popupfocusout(e) {
				if (anchor != e?.relatedTarget) {
					this.submit();
					return 'View';
				}
			},
			submit() {
				if (isDirty && !cellOptions.debounce) {
					if (multi) dispatch('change', localValue);
					else dispatch('change', localValue[0]);

					if (multi) {
						dispatch(
							'labelChange',
							localValue.map((val) => $labels[val] || val)
						);
					} else {
						dispatch('labelChange', $labels[localValue[0]] || localValue[0]);
					}
				}
			},
			clear() {
				localValue = [];
				anchor?.focus();
				if (cellOptions.debounce) {
					dispatch('change', null);
					dispatch('labelChange', null);
				}
			},
			cancel() {
				localValue = JSON.parse(originalValue);
				searchTerm = null;
				anchor?.blur();
				return 'View';
			}
		}
	});

	let originalValue = $state('[]');

	let inputSelect = $derived(controlType == 'inputSelect');

	let isObjects = $derived(localValue.length && typeof localValue[0] == 'object' ? true : false);
	let isEmpty = $derived(localValue.length < 1);
	let nooptions = $derived(!$options || $options.length < 1);
	let loading = $derived(source.loading);
	let fetch = $derived(source.fetch);
	let inEdit = $derived($cellState == 'Editing');
	let isDirty = $derived(inEdit && originalValue !== JSON.stringify(localValue));
	let pills = $derived(optionsViewMode == 'pills');
	let bullets = $derived(optionsViewMode == 'bullets');
	let plaintext = $derived(optionsViewMode == 'text');
	let multi = $derived(fieldSchema && fieldSchema.type ? fieldSchema.type == 'array' : multiProp);
	let icon = $derived(searchTerm && isEmpty ? 'ph ph-magnifying-glass' : cellOptions.icon);
	let open = $derived($editorState == 'Open');

	/* 	$effect(() => {
		dataSourceStore.set(cellOptions?.datasource);
	});

	$effect(() => {
		fetch?.update?.({ query: defaultQuery });
	});

	$effect(() => {
		cellState.syncFetch($fetch);
	});

	$effect(() => {
		cellState.loadDataOptions($fetch?.rows);
	});

	$effect(() => {
		cellState.refresh($dataSourceStore, optionsSource);
	}); */

	/* 	$effect(() => {
		cellState.reload(fieldSchema, labelColumn, valueColumn, iconColumn, colorColumn, customOptions);
	});

	$effect(() => {
		localValue = Array.isArray(value) ? value : value ? [value] : [];
	}); */

	$effect(() => {
		if (autofocus) {
			setTimeout(() => {
				cellState.focus();
				editor?.focus();
			}, 30);
		}

		return () => {
			if (timer) {
				clearTimeout(timer);
			}
		};
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore event_directive_deprecated -->
<div
	bind:this={anchor}
	class="superCell {role}"
	{id}
	tabindex={cellOptions?.disabled ? -1 : 0}
	class:isDirty={isDirty && showDirty}
	class:inEdit
	class:disabled
	class:readonly
	class:error
	class:placeholder={isEmpty && !searchTerm}
	style:color
	style:background
	on:focusin={cellState.focus}
	on:focusout={cellState.focusout}
	on:keydown={editorState.handleKeyboard}
	on:mousedown={cellState.toggle}
>
	{#if icon}
		<i class={icon + ' field-icon'} class:active={searchTerm}></i>
	{/if}

	{#key $cellState}
		{#if inEdit && controlType == 'inputSelect'}
			{#if multi}
				{#if localValue.length > 0}
					<div
						class="value"
						style:width={'auto'}
						style:padding-left={cellOptions.icon ? '32px' : padding}
					>
						<div class="items" class:pills style:justify-content={align ?? 'flex-start'}>
							{#each localValue as val (val)}
								<div class="item" style:--option-color={$colors[val]} style:min-width={'4rem'}>
									{#if pills}
										<div class="loope"></div>
									{/if}
									<span> {$labels[val] || val} </span>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			{/if}

			<input
				bind:this={editor}
				class="editor"
				bind:value={inputValue}
				on:input={(e) => {
					if (!multi) localValue[0] = e.target.value?.trim();
					editorState.filterOptions(e.target.value);
				}}
				on:focusout={cellState.focusout}
				{placeholder}
			/>
			<div
				class="control-icon"
				style:border-left="1px solid var(--spectrum-global-color-blue-400)"
				style:padding-left="0.75rem"
			>
				<i class="ph ph-caret-down"></i>
			</div>
		{:else}
			<div class="value" class:placeholder={isEmpty && !searchTerm}>
				{#key isEmpty}
					{#if localValue?.length < 1}
						{#if open}
							{searchTerm ? searchTerm : 'Type to search...'}
						{:else}
							{loading
								? 'Loading...'
								: nooptions
									? 'No options'
									: placeholder
										? placeholder
										: 'Select...'}
						{/if}
					{:else}
						<div
							class="items"
							class:pills
							class:bullets
							style:justify-content={align ?? 'flex-start'}
						>
							{#if plaintext}
								{#each localValue as val, idx (val)}
									{$labels[val] || val}
									{idx < localValue.length - 1 ? ', ' : ''}
								{/each}
							{:else}
								{#each localValue as val, idx (val)}
									<div
										class="item"
										style:--option-color={$colors[val] || OPTIONS_COLORS_ARRAY[idx % OPTIONS_COLORS_ARRAY.length]}
									>
										<div class="loope"></div>
										<span> {isObjects ? 'JSON' : $labels[val] || val} </span>
									</div>
								{/each}
							{/if}
						</div>
					{/if}
				{/key}
			</div>
			{#if !readonly && (role == 'formInput' || inEdit)}
				<i class="ph ph-caret-down control-icon"></i>
			{/if}
		{/if}
	{/key}
</div>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<PickerPopover
	{anchor}
	visible={inEdit}
	minWidth={pickerWidth}
	{open}
	onClose={cellState.focusout}
>
	<CellPickerFrame>
				{#if searchTerm && !inputSelect && !isEmpty}
					<div class="searchControl">
						<i class="search-icon ph ph-magnifying-glass" class:active={searchTerm}></i>
						<span class="search-term">{searchTerm}</span>
					</div>
				{/if}
				<CellPickerOptionsList
					bind:optionsList
					onMouseLeave={() => (focusedOptionIdx = -1)}
					onScroll={optionsSource == 'data' ? editorState.handleScroll : undefined}
				>
					{#if fetch?.loading && !fetch?.loaded}
						<div class="option loading">
							<i class="ph ph-spinner spin"></i>
							Loading...
						</div>
					{/if}

					{#if source.filteredOptions?.length}
						{#each source.filteredOptions as option, idx (idx)}
							<CellPickerOption
								textMode={optionsViewMode == 'text'}
								focused={focusedOptionIdx === idx}
								selected={localValue?.includes(option)}
								optionColor={$colors[option]}
								onSelect={() => editorState.toggleOption(idx)}
								onFocus={() => (focusedOptionIdx = idx)}
							>
								<span>
									<i
										class={iconColumn
											? 'ph ph-' + fetch?.rows?.[idx]?.[iconColumn]
											: 'ph-fill ph-square'}
										style:color={$colors[option]}
									></i>
									{$labels[option] || option}
								</span>
								<i class="ph ph-check"></i>
							</CellPickerOption>
						{/each}
						{#if fetch?.loading}
							<div class="option loading">
								<i class="ph ph-spinner spin"></i>
								Loading more...
							</div>
						{/if}
					{/if}

					{#if source.filteredOptions?.length === 0}
						<div class="option">
							<span>
								<i class="ri-close-line"></i>
								No Options Found
							</span>
						</div>
					{/if}
				</CellPickerOptionsList>
	</CellPickerFrame>
</PickerPopover>

<style>
	.searchControl {
		display: flex;
		align-items: center;
		min-height: 2rem;
		border-bottom: 1px solid var(--spectrum-global-color-gray-300);
	}
	:global(.options) {
		flex: auto;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		overflow-y: auto;
		color: var(--spectrum-global-color-gray-700);
	}

	:global(.option) {
		min-height: 1.85rem;
		display: flex;
		gap: 0.5rem;
		align-items: center;
		justify-content: space-between;
		cursor: pointer;
		padding: 0rem 0.5rem;

		&.selected {
			color: var(--spectrum-global-color-gray-800);
			background-color: var(--spectrum-global-color-gray-75);
			font-weight: 600;
		}

		&.focused {
			background-color: var(--spectrum-global-color-gray-100);
			color: var(--spectrum-global-color-gray-800);
		}

		& > span {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}

	:global(.option > span > .ph-square) {
		font-size: 16px;
		color: var(--option-color, var(--spectrum-global-color-gray-300));
	}
	:global(.option.text > span > .ph-square) {
		display: none;
	}

	:global(.option .ph-check) {
		display: none;
		font-size: 16px;
		color: var(--spectrum-global-color-green-400);
	}

	:global(.option.selected .ph-check) {
		display: inline-block;
	}
	:global(.option.loading) {
		justify-content: center;
		color: var(--spectrum-global-color-gray-500);
		font-style: italic;
	}

	.search-icon {
		font-size: 16px;
		color: var(--spectrum-global-color-gray-500);
		display: flex;
		align-items: center;
		padding-left: 0.5rem;
	}

	.search-icon.active {
		color: var(--spectrum-global-color-blue-700);
	}

	.search-term {
		flex: auto;
		padding-left: 0.5rem;
		color: var(--spectrum-global-color-gray-700);
		font-style: italic;
		font-weight: 500;
	}
	:global(.picker) {
		display: flex;
		flex-direction: column;
		max-height: 248px;
		width: 100%;
		overflow: hidden;
	}

	.loope {
		width: 14px;
		height: 14px;
		border-radius: 2px;
		background-color: var(--option-color, var(--spectrum-global-color-gray-300));
		flex-shrink: 0;
	}
</style>
