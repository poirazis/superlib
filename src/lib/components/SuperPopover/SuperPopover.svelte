<script>
	import { Portal } from '@jsrob/svelte-portal';
	import { createEventDispatcher } from 'svelte';
	import positionDropdown from '../../actions/position_dropdown.js';
	import clickOutside from '../../actions/click_outside.js';
	import { fly } from 'svelte/transition';

	const dispatch = createEventDispatcher();

	let {
		anchor,
		align = 'right',
		portalTarget,
		minWidth,
		maxWidth,
		maxHeight,
		open = $bindable(false),
		useAnchorWidth = false,
		dismissible = true,
		offset = 5,
		offsetBelow,
		customHeight,
		animate = true,
		customZindex,
		handlePositionUpdate,
		showPopover = true,
		clickOutsideOverride = false,
		ignoreAnchor = true,
		popup = $bindable(),
		className,
		children
	} = $props();

	let target = $derived(portalTarget || '.spectrum');

	export const show = () => {
		dispatch('open');
		open = true;
	};

	export const hide = () => {
		dispatch('close');
		open = false;
	};

	export const toggle = () => {
		if (!open) {
			show();
		} else {
			hide();
		}
	};

	export const hasFocus = () => {
		return popup?.matches(':focus-within');
	};

	const handleOutsideClick = (e) => {
		if (clickOutsideOverride) {
			return;
		}
		if (open) {
			let node = e.target;
			let fromAnchor = false;
			while (!fromAnchor && node && node.parentNode) {
				fromAnchor = node === anchor;
				node = node.parentNode;
			}
			if (!fromAnchor || (fromAnchor && !ignoreAnchor)) hide();
		}
	};

	function handleEscape(e) {
		if (!clickOutsideOverride) {
			return;
		}
		if (open && e.key === 'Escape') {
			hide();
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
{#if open}
	<Portal {target}>
		<!-- svelte-ignore event_directive_deprecated -->
		<div
			tabindex="0"
			bind:this={popup}
			use:positionDropdown={{
				anchor,
				align,
				maxHeight,
				maxWidth,
				minWidth,
				useAnchorWidth,
				offset,
				offsetBelow,
				customUpdate: handlePositionUpdate
			}}
			use:clickOutside={{
				callback: dismissible ? handleOutsideClick : () => {},
				anchor
			}}
			on:keydown={handleEscape}
			class={'spectrum-Popover is-open ' + (className ?? '')}
			class:customZindex
			class:hide-popover={open && !showPopover}
			role="presentation"
			style="height: {customHeight}; --customZindex: {customZindex};"
			transition:fly|local={{ y: -20, duration: animate ? 350 : 0 }}
		>
			{@render children?.()}
		</div>
	</Portal>
{/if}

<style>
	.hide-popover {
		display: contents;
	}

	.spectrum-Popover {
		border-color: var(--spectrum-global-color-gray-300);
		background-color: var(--spectrum-global-color-gray-50);
		overflow: auto;
	}

	.customZindex {
		z-index: var(--customZindex) !important;
	}
</style>
