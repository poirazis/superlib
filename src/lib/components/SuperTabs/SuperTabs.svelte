<script>
	import { createEventDispatcher, tick, untrack } from 'svelte';
	import { tooltip } from '../../actions/tooltip.ts';

	const dispatch = createEventDispatcher();

	let {
		containers,
		direction,
		selectedTab,
		hAlign,
		vAlign,
		theme = 'buttons',
		tabsPosition = 'top',
		tabsAlignment = 'flex-start',
		buttonsAlignment = 'flex-start',
		tabsIconsOnly,
		list_icon,
		list_title,
		tabsWidth = '200px',
		listBackground = 'var(--spectrum-global-color-gray-50)',
		quietTabs
	} = $props();

	let isVertical = $derived(tabsPosition == 'left' || theme === 'list');
	let justify = $derived(direction === 'row' ? (hAlign ?? 'flex-start') : (vAlign ?? 'flex-start'));
	let button = $derived(theme === 'buttons');
	let useSlidingIndicator = $derived(theme === 'buttons' || theme === 'list');
	let tabTooltipPosition = $derived(isVertical ? 'below-start' : 'above-center');

	let tabsEl = $state(null);
	let tabRefs = $state({});
	let indicatorVisible = $state(false);
	let indicatorTop = $state(0);
	let indicatorLeft = $state(0);
	let indicatorWidth = $state(0);
	let indicatorHeight = $state(0);

	let selectedContainer = $derived(containers?.find((container) => container.id === selectedTab));

	function setTabRef(id, node) {
		if (!id) return;

		if (node) {
			tabRefs[id] = node;
		} else {
			delete tabRefs[id];
		}
	}

	async function updateIndicator() {
		await tick();

		const tabsNode = tabsEl;
		const selectedNode = selectedTab ? tabRefs[selectedTab] : null;
		const canShow =
			useSlidingIndicator &&
			selectedContainer &&
			!selectedContainer.isTabSection &&
			tabsNode &&
			selectedNode;

		if (!canShow) {
			indicatorVisible = false;
			return;
		}

		indicatorTop = selectedNode.offsetTop;
		indicatorLeft = selectedNode.offsetLeft;
		indicatorWidth = selectedNode.offsetWidth;
		indicatorHeight = selectedNode.offsetHeight;
		indicatorVisible = true;
	}

	$effect(() => {
		selectedTab;
		containers?.length;
		theme;
		isVertical;
		buttonsAlignment;
		tabsWidth;

		untrack(() => {
			updateIndicator();
		});
	});

	$effect(() => {
		const node = tabsEl;
		if (!node) return;

		const resizeObserver = new ResizeObserver(() => {
			updateIndicator();
		});

		resizeObserver.observe(node);

		return () => resizeObserver.disconnect();
	});

	function tabRef(node, id) {
		setTabRef(id, node);
		return {
			destroy() {
				setTabRef(id, null);
			}
		};
	}
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
			bind:this={tabsEl}
			class="tabs"
			class:vertical={isVertical}
			class:buttons={button}
			class:list={theme === 'list'}
			class:sliding-indicator={useSlidingIndicator}
			style:justify-content={buttonsAlignment}
			style:--tab-alignment={tabsAlignment}
			style:--tab-max-width={tabsWidth || '200px'}
			style:--tab-track-thickness="1px"
			style:--list-background={listBackground}
		>
			{#if indicatorVisible}
				<div
					class="tab-indicator"
					class:button
					class:list={theme === 'list'}
					style:top="{indicatorTop}px"
					style:left="{indicatorLeft}px"
					style:width="{indicatorWidth}px"
					style:height="{indicatorHeight}px"
				></div>
			{/if}
			{#if theme === 'list' && list_title}
				<div class="tab list-title">
					{#if list_icon}
						<i class={'ph ph-' + list_icon}></i>
					{/if}
					{list_title}
				</div>
			{/if}
			{#each containers as container, idx (container.id ?? idx)}
				<!-- svelte-ignore event_directive_deprecated -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<button
					class="tab"
					class:vertical={isVertical}
					class:button
					style:flex={buttonsAlignment == 'stretch' ? '1' : null}
					style:justify-content={isVertical && button ? 'flex-start' : null}
					style:text-align={isVertical && button ? 'left' : null}
					class:list={theme === 'list'}
					class:selected={container.id === selectedTab}
					class:disabled={container.disabled}
					class:list-section={container.isTabSection}
					use:tabRef={container.id}
					on:click={() => {
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
						{@const tabLabel = container.title || `Tab ${idx + 1}`}
						<span
							class="tab-text"
							use:tooltip={{
								text: tabLabel,
								whenTruncated: true,
								position: tabTooltipPosition
							}}
						>
							{tabLabel}
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
		justify-content: flex-start;
		margin-bottom: 0.5rem;
		--selected-tab: var(--spectrum-global-color-gray-100);
	}

	.outer-tabs.vertical {
		padding-left: 0.25rem;
		padding-right: 0.25rem;
		flex-direction: column;
		align-items: stretch;
		align-self: flex-start;
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

	.tabs.sliding-indicator {
		position: relative;
	}

	.tab-indicator {
		position: absolute;
		top: 0;
		left: 0;
		pointer-events: none;
		z-index: 0;
		opacity: 1;
		transition:
			top 0.28s cubic-bezier(0.34, 1.2, 0.64, 1),
			left 0.28s cubic-bezier(0.34, 1.2, 0.64, 1),
			width 0.28s cubic-bezier(0.34, 1.2, 0.64, 1),
			height 0.28s cubic-bezier(0.34, 1.2, 0.64, 1),
			opacity 0.15s ease;
	}

	.tab-indicator.button {
		border-radius: 0.25rem;
		background-color: rgb(from var(--spectrum-global-color-gray-200) r g b / 0.85);
		border: 1px solid rgb(from var(--spectrum-global-color-gray-400) r g b / 0.75);
	}

	.tab-indicator.list {
		border-radius: 0.25rem;
		background-color: var(--selected-tab);
	}

	.tabs.buttons {
		gap: 0.25rem;
	}

	.tabs.list {
		gap: 0;
		background-color: var(--list-background, var(--spectrum-global-color-gray-50));
		border: unset;
		padding: unset;
		padding-bottom: 0.5rem;
	}

	.tabs.vertical {
		flex-direction: column;
		align-items: stretch;
		width: 100%;
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
		justify-content: var(--tab-alignment, flex-start);
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

	.tabs:not(.vertical) .tab:not(.vertical):not(.list-title):not(.list-section) {
		max-width: var(--tab-max-width, 200px);
	}

	.tab.button.vertical {
		width: 100%;
		padding: 0.5rem 0.75rem;
		justify-content: flex-start;
		text-align: left;
	}

	.tab.button:active:not(.disabled):not(.list-section):not(.selected) {
		background-color: rgb(from var(--spectrum-global-color-gray-200) r g b / 0.45);
	}

	.tab.button.selected {
		color: var(--spectrum-global-color-gray-700);
		font-weight: 500;
		border-color: transparent;
		background-color: transparent;
		z-index: 1;
	}

	.tab.list {
		padding: 0.5rem 0.5rem;
		border-radius: 0.25rem;
		max-width: 100%;
		color: var(--spectrum-global-color-gray-700);
	}

	.tab.list.selected {
		color: var(--tab-selected-color);
		background-color: transparent;
		z-index: 1;
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

	.tab.button:hover:not(.selected):not(.disabled):not(.list-section) {
		background-color: rgb(from var(--spectrum-global-color-gray-200) r g b / 0.35);
		border-color: var(--spectrum-global-color-gray-200);
	}

	.tab.selected {
		color: var(--tab-selected-color);
	}

	.tab.selected:hover {
		cursor: default;
	}

	.tab-text {
		flex: 1 1 auto;
		min-width: 0;
		max-width: 100%;
		text-align: left;
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
	}

	.tabs.vertical .tab-text {
		text-align: left;
	}
</style>
