<script>
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	let {
		containers,
		direction,
		selectedTab,
		hAlign,
		vAlign,
		theme = 'buttons',
		tabsPosition = 'top',
		tabsAlignment,
		buttonsAlignment = 'flex-start',
		tabsIconsOnly,
		list_icon,
		list_title,
		tabsWidth = '200px',
		listBackground = 'var(--spectrum-global-color-gray-50)',
		quietTabs
	} = $props();

	let isVertical = $derived(tabsPosition == 'left' || theme === 'list');
	let justify = $derived(direction === 'row' ? hAlign : vAlign);
	let button = $derived(theme === 'buttons');
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if containers?.length}
	<div
		class="outer-tabs"
		class:quietTabs
		class:list={theme === 'list'}
		class:vertical={isVertical}
		style:justify-content={justify}
		style:width={isVertical ? tabsWidth || '200px' : '100%'}
	>
		<div
			class="tabs"
			class:vertical={isVertical}
			class:buttons={button}
			class:list={theme === 'list'}
			style:justify-content={buttonsAlignment}
			style:--tab-alignment={tabsAlignment}
			style:--tab-track-thickness="1px"
			style:--list-background={listBackground}
		>
			{#if theme === 'list' && list_title}
				<div class="tab list-title">
					{#if list_icon}
						<i class={'ph ph-' + list_icon}></i>
					{/if}
					{list_title}
				</div>
			{/if}
			{#each containers as container, idx (idx)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<button
					class="tab"
					class:vertical={isVertical}
					class:button
					style:flex={buttonsAlignment == 'stretch' ? '1' : null}
					class:list={theme === 'list'}
					class:selected={container.id === selectedTab}
					class:disabled={container.disabled}
					class:list-section={container.isTabSection}
					onclick={() => {
						if (!container.disabled && !container.isTabSection) dispatch('change', container);
					}}
				>
					{#if container.icon}
						<i
							class={container.icon}
							style:font-size={tabsIconsOnly ? '20px' : '12px'}
							style:color={container.color}
						></i>
					{/if}

					{#if !tabsIconsOnly || !container.icon}
						<span class="tab-text">
							{container.title || 'Tab ' + idx}
						</span>
					{/if}
				</button>
			{/each}
		</div>
	</div>
{/if}

<style>
	.outer-tabs {
		flex: none;
		display: flex;
		flex-direction: row;
		width: 100%;
		overflow: hidden;
		position: relative;
		justify-content: stretch;
		margin-bottom: 0.5rem;
		--selected-tab: var(--spectrum-global-color-gray-100);
	}

	.outer-tabs.vertical {
		padding-left: 0.25rem;
		padding-right: 0.25rem;
		flex-direction: column;
		align-items: stretch;
		margin-bottom: unset;
		--selected-tab: var(--spectrum-global-color-gray-200);
	}
	.outer-tabs.vertical.list {
		padding-left: unset;
		padding-right: unset;
		flex-direction: column;
		align-items: stretch;
		--selected-tab: var(--spectrum-global-color-gray-200);
		border-right: 1px solid var(--spectrum-global-color-gray-300);
	}

	.tabs {
		flex: auto;
		display: flex;
		gap: 1rem;
		padding-bottom: 0.25rem;
		border-bottom: 1px solid var(--spectrum-global-color-gray-300);
	}

	.tabs.buttons {
		gap: 0.25rem;
	}

	.tabs.list {
		gap: 0;
		background-color: var(
			--list-background,
			var(--spectrum-global-color-gray-50)
		);
		border: unset;
		padding: unset;
		padding-bottom: 0.5rem;
	}

	.tabs.vertical {
		flex-direction: column;
		border-bottom: unset;
		border-top: unset;
		border-right: 1px solid var(--spectrum-global-color-gray-300);
		padding-right: 0.25rem;
		gap: 0.25rem;
	}

	.tabs.vertical.list {
		border-right: unset;
		gap: 2px;
		padding: 2px;
		padding-top: 0rem;
	}

	.tab {
		position: relative;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		justify-content: var(--tab-alignment);
		color: var(--spectrum-global-color-gray-600);
		font-size: 13px;
		background: transparent;
		border: none;
	}

	.tab.disabled {
		color: var(--spectrum-global-color-gray-400);
	}

	.tab.disabled:hover {
		cursor: not-allowed;
	}

	.tab.button {
		border-radius: 0.25rem;
		padding: 0.5rem 1rem;
		line-height: 14px;
		border: 1px solid transparent;
		height: 1.75rem;
	}

	.tab.button.vertical {
		width: 100%;
		padding: 0.5rem 0.75rem;
	}

	.tab.button:active:not(.disabled):not(.list-section) {
		background-color: rgb(
			from var(--spectrum-global-color-gray-200) r g b / 0.85
		);
	}

	.tab.button.selected {
		color: var(--spectrum-global-color-gray-700);
		font-weight: 500;
		border: 1px solid
			rgb(from var(--spectrum-global-color-gray-400) r g b / 0.75);
		background-color: rgb(
			from var(--spectrum-global-color-gray-200) r g b / 0.85
		);
	}

	.tab.list {
		padding: 0.5rem 0.5rem;
		border-radius: 0.25rem;
		max-width: 100%;
		color: var(--spectrum-global-color-gray-700);
	}

	.tab.list.selected {
		color: var(--tab-selected-color);
		background-color: var(--selected-tab);
	}

	.tab.list:hover:not(.disabled):not(.list-section):not(.selected) {
		background-color: var(--spectrum-global-color-gray-100);
	}

	.tab.list-title {
		padding: 0.75rem 0.5rem;
		max-width: 100%;
		font-size: 12px;
		color: var(--spectrum-global-color-gray-800);
		text-transform: uppercase;
		letter-spacing: 1.2px;
		border-bottom: 1px solid var(--spectrum-global-color-gray-300);
	}

	.tab.list-section {
		text-transform: uppercase;
		font-size: 11px;
		color: var(--spectrum-global-color-gray-600);
		background-color: transparent;
	}

	.tab.list-section.vertical {
		margin-top: 4px;
	}

	.tab.list-section:hover {
		cursor: default;
	}

	.tab:hover:not(.disabled):not(.list-title):not(.list-section) {
		cursor: pointer;
	}

	.tab.button:hover:not(.selected) {
		background-color: rgb(
			from var(--spectrum-global-color-gray-200) r g b / 0.65
		);
		border-color: var(--spectrum-global-color-gray-200);
	}

	.tab.selected {
		color: var(--tab-selected-color);
	}

	.tab.selected:hover {
		cursor: default;
	}

	.tab-text {
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
	}
</style>