<script>
	import { createEventDispatcher } from 'svelte';
	import fsm from 'svelte-fsm';
	import VirtualList from '@sveltejs/svelte-virtual-list';
	import BaseCell from './BaseCell.svelte';
	import { copyTextToClipboard } from './cellClipboard';
	import PickerPopover from './PickerPopover.svelte';
	import { ICON_CATEGORIES, ICONS_BY_CATEGORY } from './phosphorIcons';

	const dispatch = createEventDispatcher();

	let {
		id,
		value,
		align = 'left',
		cellOptions = {}
	} = $props();

	let anchor = $state(null);
	let picker = $state(null);
	let open = $state(false);
	let searchQuery = $state('');
	let selectedCategory = $state('all');
	let originalValue = $state();

	let config = $derived(cellOptions ?? {});
	let readonly = $derived(config.readonly);
	let disabled = $derived(config.disabled);
	let optionError = $derived(config.error);
	let optionIcon = $derived(config.icon);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let showDirty = $derived(config.showDirty);
	let copyable = $derived(config.copyable);
	let copyIcon = $derived(config.copyIcon ?? 'always');
	let showCategories = $derived(config.showCategories);

	let justCopied = $state(false);
	let inEdit = $derived($cellState === 'editing');
	let tableCell = $derived(config.role === 'cell' || config.role === 'tableCell');
	let error = $derived(optionError);
	let icon = $derived(error ? 'ph ph-warning' : optionIcon);
	let isDirty = $derived(inEdit && value !== originalValue);

	let baseRole = $derived(
		config.role === 'inlineInput' || config.role === 'inline'
			? 'inline'
			: config.role === 'tableCell' || config.role === 'cell'
				? 'cell'
				: 'form'
	);

	let categories = $derived(
		Object.entries(ICON_CATEGORIES).map(([categoryId, label]) => ({
			id: categoryId,
			label,
			icons: ICONS_BY_CATEGORY[categoryId] || []
		}))
	);

	let iconName = $derived.by(() => {
		if (!value) return '';
		return value.startsWith('ph-') ? value.slice(3) : value;
	});

	const buttonSize = 32;
	const rowsToShow = 8;
	const containerPadding = 8;
	const itemHeight = buttonSize;
	const iconSize = 24;
	const iconPadding = 4;
	const rowHeight = buttonSize + iconPadding * 2;

	let itemsPerRow = $derived(showCategories ? 9 : 6);
	let containerHeight = $derived(buttonSize * rowsToShow + containerPadding * 2);

	let rowData = $derived.by(() => {
		const currentCategory = categories.find((cat) => cat.id === selectedCategory);
		if (!currentCategory) return [];

		let icons = [...currentCategory.icons];

		if (searchQuery) {
			const query = searchQuery.toLowerCase();
			icons = icons.filter((iconId) => {
				const baseName = iconId.replace(/-line|-fill$/, '');
				return baseName.toLowerCase().includes(query);
			});
		}

		const rows = [];
		for (let i = 0; i < icons.length; i += itemsPerRow) {
			rows.push(icons.slice(i, i + itemsPerRow));
		}

		return rows;
	});

	const onChange = (iconId) => {
		const selectedValue = iconId === value ? '' : iconId;
		dispatch('change', selectedValue || null);
		open = false;
		if (tableCell) {
			cellState.submit();
		}
	};

	const handleKeydown = (event, iconId) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onChange(iconId);
		}
	};

	const clearSelection = () => {
		dispatch('change', null);
		open = false;
	};

	export const cellState = fsm('view', {
		'*': {
			goTo(state) {
				return state;
			}
		},
		view: {
			_enter() {
				open = false;
			},
			focus() {
				if (!readonly && !disabled) return 'editing';
			},
			copy() {
				if (!readonly && !disabled) return 'editing';
			}
		},
		readonly: {
			_enter() {
				open = false;
			}
		},
		copyable: {
			_enter() {
				open = false;
			},
			copy() {
				copyTextToClipboard(String(value ?? ''), (copied) => (justCopied = copied));
			}
		},
		disabled: {
			_enter() {
				open = false;
			}
		},
		editing: {
			_enter() {
				originalValue = value;
				searchQuery = '';
				selectedCategory = 'all';
				open = true;
				dispatch('enteredit');
			},
			_exit() {
				open = false;
				dispatch('exitedit');
			},
			copy() {
				open = !open;
			},
			handleKeyboard(e) {
				if (e.keyCode == 32) {
					e.stopPropagation();
					e.preventDefault();
					open = !open;
				}
			},
			focusout(e) {
				if (picker?.contains(e.relatedTarget)) return;
				open = false;
				return readonly ? 'readonly' : tableCell ? 'view' : 'editing';
			},
			submit() {
				open = false;
				return readonly ? 'readonly' : tableCell ? 'view' : 'editing';
			},
			cancel() {
				open = false;
				return readonly ? 'readonly' : tableCell ? 'view' : 'editing';
			}
		}
	});

	$effect(() => {
		if (disabled) {
			cellState.goTo('disabled');
		} else if (readonly && copyable && value) {
			cellState.goTo('copyable');
		} else if (readonly) {
			cellState.goTo('readonly');
		} else if (tableCell) {
			if (!inEdit) cellState.goTo('view');
		} else {
			cellState.goTo('editing');
		}
	});
</script>

<!-- svelte-ignore event_directive_deprecated -->
<BaseCell
	{id}
	role={baseRole}
	state={cellState}
	bind:root={anchor}
	{icon}
	isDirty={isDirty && showDirty}
	clearable={false}
	{error}
	{justCopied}
	{copyIcon}
	{color}
	{background}
	popupOpen={open}
	tabindex={disabled || (readonly && !copyable) ? -1 : 0}
	onfocusout={cellState.focusout}
>
	{#if icon}
		<i class={icon + ' field-icon'} class:with-error={error}></i>
	{/if}

	<div class="icon-display">
		{#if value}
			<i class="ph ph-{iconName}"></i>
		{:else}
			<div class="empty-state">
				<i class="ph ph-image"></i>
			</div>
		{/if}
	</div>
</BaseCell>

<PickerPopover
	anchor={anchor}
	visible={inEdit}
	{align}
	{open}
	maxHeight={450}
	useAnchorWidth={false}
	onClose={cellState.focusout}
>
	<div
		bind:this={picker}
		class="icon-picker"
		class:with-categories={showCategories}
		style="
			--icon-size: {iconSize};
			--icon-padding: {iconPadding};
			--items-per-row: {itemsPerRow};
			--row-height: {rowHeight};
		"
	>
		<div class="header">
			{#if showCategories}
				<div class="category-tabs">
					{#each categories as category}
						<!-- svelte-ignore event_directive_deprecated -->
						<button
							class:selected={selectedCategory === category.id}
							on:click={() => (selectedCategory = category.id)}
							aria-label={`Show ${category.label} icons`}
						>
							{category.label}
						</button>
					{/each}
				</div>
			{/if}
			<div class="search-container">
				<i class="ph ph-magnifying-glass search-icon"></i>
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search icons..."
					class="search-input"
					aria-label="Search icons"
				/>
				{#if searchQuery}
					<!-- svelte-ignore event_directive_deprecated -->
					<button
						class="clear-search"
						on:click={() => (searchQuery = '')}
						aria-label="Clear search"
					>
						<i class="ph ph-x"></i>
					</button>
				{/if}
			</div>
		</div>

		<div class="icons-grid-container">
			{#if rowData.length > 0}
				<VirtualList
					items={rowData}
					{itemHeight}
					height={containerHeight}
					width="100%"
					let:item={rowIcons}
					let:style
				>
					<div class="icons-row" {style}>
						{#each rowIcons as iconId}
							<!-- svelte-ignore event_directive_deprecated -->
							<button
								class="icon-button"
								class:selected={iconName === iconId}
								on:click={() => onChange(iconId)}
								on:keydown={(e) => handleKeydown(e, iconId)}
								aria-label={`Select ${iconId} icon`}
								tabindex="0"
							>
								<i class="ph ph-{iconId}"></i>
							</button>
						{/each}
					</div>
				</VirtualList>
			{:else}
				<div class="no-results">
					<i class="ph ph-magnifying-glass"></i>
					<p>No icons found</p>
				</div>
			{/if}
		</div>

		<div class="footer">
			{#if value}
				<!-- svelte-ignore event_directive_deprecated -->
				<button class="clear-button" on:click={clearSelection}>
					<i class="ph ph-x"></i> Clear
				</button>
			{/if}
		</div>
	</div>
</PickerPopover>

<style>
	.icon-display {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1 1 auto;
		min-width: 0;
		height: 100%;
		padding: 0.25rem 0.75rem;
		box-sizing: border-box;
		font-size: 1.25rem;
	}

	.empty-state {
		color: var(--spectrum-global-color-gray-500);
	}

	.icon-picker {
		max-height: 400px;
		max-width: 14rem;
		display: flex;
		flex-direction: column;
		background: var(--spectrum-global-color-gray-50);
		border-radius: 4px;
		overflow: hidden;
		gap: 0.5rem;
	}

	.icon-picker.with-categories {
		max-width: 20rem;
	}

	.header {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.search-container {
		position: relative;
	}

	.search-icon {
		position: absolute;
		left: 8px;
		top: 50%;
		transform: translateY(-50%);
		color: var(--spectrum-global-color-gray-500);
		pointer-events: none;
	}

	.search-input {
		width: 100%;
		padding: 12px 32px;
		background: transparent;
		border: none;
		border-bottom: 1px solid var(--spectrum-global-color-gray-300);
		border-radius: 0;
		font-size: 14px;
		color: var(--spectrum-global-color-gray-700);
		outline: none;
		transition: border-color 0.2s ease;
	}

	.search-input:focus {
		outline: none;
	}

	.clear-search {
		position: absolute;
		right: 12px;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		color: var(--spectrum-global-color-gray-500);
		cursor: pointer;
		padding: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.category-tabs {
		display: flex;
		overflow-x: auto;
		gap: 4px;
		scrollbar-width: none;
		padding: 0.5rem;
	}

	.category-tabs::-webkit-scrollbar {
		display: none;
	}

	.category-tabs button {
		padding: 6px 12px;
		border: none;
		background: none;
		border-bottom: 2px solid transparent;
		font-size: 12px;
		font-weight: 500;
		color: var(--spectrum-global-color-gray-700);
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.2s ease;
		height: 1.75rem;
	}

	.category-tabs button:hover {
		background-color: var(--spectrum-global-color-gray-200);
	}

	.category-tabs button.selected {
		color: var(--spectrum-global-color-blue-600);
		border-bottom: 2px solid var(--spectrum-global-color-blue-600);
		background: none;
	}

	.icons-grid-container {
		position: relative;
		overflow: hidden;
		width: 100%;
		padding-left: 0.5rem;
	}

	.icons-row {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		width: 100%;
		box-sizing: border-box;
		height: 32px;
		align-items: center;
	}

	.with-categories .icons-row {
		grid-template-columns: repeat(9, 1fr);
	}

	.icon-button {
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--spectrum-global-color-gray-100);
		background: none;
		border-radius: 4px;
		cursor: pointer;
		color: var(--spectrum-global-color-gray-700);
		width: 32px;
		height: 32px;
		box-sizing: border-box;
		font-size: 20px;
		opacity: 0.9;
	}

	.icon-button:hover {
		background-color: var(--spectrum-global-color-gray-100);
		color: var(--spectrum-global-color-gray-800);
		opacity: 1;
	}

	.icon-button:focus {
		outline: none;
	}

	.icon-button.selected {
		color: var(--spectrum-global-color-gray-800);
		border: 1px dotted var(--spectrum-global-color-blue-500);
		background-color: var(--spectrum-global-color-gray-200);
	}

	.no-results {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 24px;
		color: var(--spectrum-global-color-gray-600);
		text-align: center;
	}

	.no-results i {
		font-size: 24px;
		margin-bottom: 8px;
		color: var(--spectrum-global-color-gray-500);
	}

	.footer {
		padding: 0 0.5rem;
		border-top: 1px solid var(--spectrum-global-color-gray-200);
		height: 2rem;
		display: flex;
		justify-content: flex-end;
		align-items: center;
		font-size: 0.75rem;
	}

	.clear-button {
		display: flex;
		align-items: center;
		gap: 4px;
		background: none;
		border: none;
		color: var(--spectrum-global-color-gray-700);
		font-size: 12px;
		cursor: pointer;
		padding: 4px 8px;
		border-radius: 4px;
	}

	.clear-button:hover {
		background-color: var(--spectrum-global-color-gray-200);
	}
</style>