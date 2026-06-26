<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import fsm from 'svelte-fsm';
	import VirtualList from '@sveltejs/svelte-virtual-list';
	import BaseCell from './BaseCell.svelte';
	import {
		consumeOpenOnEnter,
		copyAndTransition,
		deferJustCopied,
		requestIconOpenOnEnter,
		requestOpenOnEnter
	} from './helpers';
	import SuperPopover from '../SuperPopover/SuperPopover.svelte';
	import { ICON_CATEGORIES, ICONS_BY_CATEGORY } from './helpers';

	const dispatch = createEventDispatcher();

	let { id, value, align = 'left', cellOptions = {} } = $props();

	let anchor = $state(null);
	let popup = $state<HTMLElement | null>(null);
	let open = $state(false);
	let searchQuery = $state('');
	let selectedCategory = $state('all');
	let localValue = $state();

	let config = $derived(cellOptions ?? {});
	let readonly = $derived(config.readonly);
	let disabled = $derived(config.disabled);
	let optionError = $derived(config.error);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let showDirty = $derived(config.showDirty);
	let copyable = $derived(config.copyable);
	let copyIcon = $derived(config.copyIcon ?? 'always');
	let showCategories = $derived(config.showCategories);

	let inEdit = $derived($csm === 'editing');
	let error = $derived(optionError);
	let icon = $derived.by(() => {
		const raw = config.icon;
		if (!raw) return undefined;
		return raw.replace(/^ph ph-/, '').replace(/^ph-/, '');
	});
	let dirty = $derived(config.dirty);
	let isDirty = $derived(inEdit && localValue !== value);

	let categories = $derived(
		Object.entries(ICON_CATEGORIES).map(([categoryId, label]) => ({
			id: categoryId,
			label,
			icons: ICONS_BY_CATEGORY[categoryId] || []
		}))
	);

	let iconName = $derived.by(() => {
		if (!localValue) return '';
		const raw = String(localValue);
		return raw.replace(/^ph ph-/, '').replace(/^ph-/, '');
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
	let input;

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
		const selectedValue = iconId === localValue ? null : iconId;
		localValue = selectedValue;
		csm.submit();
	};

	const handleKeydown = (event, iconId) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onChange(iconId);
		}
	};

	const clearSelection = () => {
		localValue = null;
		dispatch('change', null);
		open = false;
	};

	const csm = fsm('view', {
		'*': {
			goTo(state) {
				return state;
			},
			copy() {},
			click() {},
			toggle() {}
		},
		view: {
			_enter() {
				localValue = value;
			},
			focus() {
				if (!readonly && !disabled) {
					requestOpenOnEnter();
					return 'editing';
				}
			},
			toggle() {
				if (!readonly && !disabled) {
					requestIconOpenOnEnter();
					return 'editing';
				}
			}
		},
		readonly: {},
		copyable: {
			copy() {
				copyAndTransition(() => csm, String(localValue ?? ''));
			},
			keydown(e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.copy();
				}
			}
		},
		justCopied: deferJustCopied(() => csm),
		disabled: {},
		editing: {
			_enter() {
				localValue = value;
				searchQuery = '';
				selectedCategory = 'all';
				open = consumeOpenOnEnter();
				dispatch('enteredit');
			},
			toggle() {
				open = !open;
			},
			click() {
				this.toggle();
			},
			_exit() {
				open = false;
				dispatch('exitedit');
			},
			keydown(e) {
				if (e.key === ' ' || e.keyCode === 32) {
					e.stopPropagation();
					e.preventDefault();
					this.toggle();
				}

				if (e.key === 'Escape') {
					this.cancel();
				}
			},
			focusout(e) {
				const related = e.relatedTarget;
				if (popup?.contains(related)) return;
				return this.submit();
			},
			popupFocusout(e) {
				if (anchor?.contains(e.relatedTarget)) return;
				return this.submit();
			},
			popupKeydown(e) {
				if (e.key === 'Tab') {
					e.preventDefault();
					anchor?.focus();
					return this.submit();
				}
				if (e.key === 'Escape') {
					e.preventDefault();
					if (open) {
						open = false;
						anchor?.focus();
						return;
					}
					return this.cancel();
				}
			},
			submit() {
				if (isDirty) {
					dispatch('change', localValue);
				}
				return 'view';
			},
			cancel() {
				localValue = value;
				return 'view';
			}
		}
	});

	$effect(() => {
		if (!inEdit) {
			localValue = value;
		}
	});

	$effect(() => {
		if (disabled) {
			csm.goTo('disabled');
		} else if (readonly && copyable && localValue) {
			csm.goTo('copyable');
		} else if (readonly) {
			csm.goTo('readonly');
		} else {
			csm.goTo('view');
		}
	});
</script>

<!-- svelte-ignore event_directive_deprecated -->
<BaseCell
	{id}
	role={config.role ?? 'form'}
	{csm}
	bind:anchor
	{icon}
	isDirty={dirty && showDirty}
	clearable={false}
	naked={true}
	{error}
	{copyIcon}
	{color}
	{background}
	popupOpen={open}
	controlIcon={'ph ph-caret-down'}
	tabindex={disabled || (readonly && !copyable) ? -1 : 0}
>
	{#key localValue}
		<div class="icon-display" class:inEdit>
			{#if localValue}
				<i class="ph ph-{iconName}"></i>
			{:else}
				<div class="empty-state">
					<i class="ph ph-image"></i>
				</div>
			{/if}
		</div>
	{/key}
</BaseCell>

<!-- svelte-ignore event_directive_deprecated -->
<!-- svelte-ignore a11y_no_static_element_interactions -->

{#if $csm === 'editing'}
	<SuperPopover {anchor} {open} {align} dismissible={false} maxHeight={450} useAnchorWidth={false}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore event_directive_deprecated -->
		<div
			class="popup"
			bind:this={popup}
			on:focusout={csm.popupFocusout}
			on:keydown={csm.popupKeydown}
		>
			<div
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
					{#if localValue}
						<!-- svelte-ignore event_directive_deprecated -->
						<button class="clear-button" on:click={clearSelection}>
							<i class="ph ph-x"></i> Clear
						</button>
					{/if}
				</div>
			</div>
		</div>
	</SuperPopover>
{/if}

<style>
	.popup {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.icon-display {
		display: flex;
		aspect-ratio: 1;
		align-items: center;
		justify-content: center;
		flex: 1 1 auto;
		min-width: 0;
		height: 2rem;
		box-sizing: border-box;
		font-size: 1rem;
		border: 1px solid var(--spectrum-global-color-gray-300);
		border-radius: 4px;
	}

	.icon-display.inEdit {
		background: var(--spectrum-global-color-gray-50);
		border-color: var(--spectrum-global-color-gray-400);
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

	.search-input:focus,
	.search-input:focus-visible {
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

	.icon-button:focus,
	.icon-button:focus-visible {
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
