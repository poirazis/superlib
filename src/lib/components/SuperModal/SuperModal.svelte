<script lang="ts">
	import { createEventDispatcher, onDestroy } from 'svelte';
	import { portalNode, resolvePortalTarget, restoreNode } from '../../utils/portal.ts';

	const dispatch = createEventDispatcher<{
		open: void;
		close: void;
	}>();

	let {
		open = $bindable(false),
		portalTarget = '#app-body',
		closeOnBackdrop = true,
		closeOnEscape = true,
		lockScroll = true,
		preserveLayout = true,
		zIndex = 10000,
		panelWidth = 'min(96vw, 1440px)',
		panelHeight = 'min(88vh, 920px)',
		panelClass = '',
		animate = true,
		children
	} = $props();

	let shellEl = $state<HTMLElement | null>(null);
	let inlineSlot = $state<HTMLElement | null>(null);
	let modalRoot = $state<HTMLElement | null>(null);
	let placeholderHeight = $state<number | null>(null);

	export const show = () => {
		dispatch('open');
		open = true;
	};

	export const hide = () => {
		dispatch('close');
		open = false;
	};

	export const toggle = () => {
		if (open) {
			hide();
		} else {
			show();
		}
	};

	const handleBackdropClick = () => {
		if (closeOnBackdrop) {
			hide();
		}
	};

	$effect(() => {
		if (!modalRoot || !inlineSlot) return;

		if (open) {
			if (preserveLayout && shellEl) {
				placeholderHeight = shellEl.offsetHeight;
			}
			portalNode(modalRoot, resolvePortalTarget(portalTarget), inlineSlot);
		} else {
			placeholderHeight = null;
			restoreNode(modalRoot, inlineSlot);
		}
	});

	$effect(() => {
		if (!open || !lockScroll) return;

		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		return () => {
			document.body.style.overflow = previousOverflow;
		};
	});

	$effect(() => {
		if (!open || !closeOnEscape) return;

		const handleKeydown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				hide();
			}
		};

		window.addEventListener('keydown', handleKeydown);

		return () => {
			window.removeEventListener('keydown', handleKeydown);
		};
	});

	onDestroy(() => {
		document.body.style.overflow = '';

		if (modalRoot && inlineSlot) {
			restoreNode(modalRoot, inlineSlot);
		}
	});
</script>

<div
	class="super-modal-shell"
	bind:this={shellEl}
	style:min-height={placeholderHeight ? `${placeholderHeight}px` : undefined}
>
	<div bind:this={inlineSlot} class="super-modal-inline">
		<div
			bind:this={modalRoot}
			class="super-modal-root"
			class:active={open}
			class:animated={animate}
			style:--super-modal-z-index={open ? String(zIndex) : undefined}
		>
			{#if open && closeOnBackdrop}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<!-- svelte-ignore event_directive_deprecated -->
				<div class="super-modal-backdrop" role="presentation" on:click={handleBackdropClick}></div>
			{/if}

			<div
				class="super-modal-panel {panelClass}"
				class:open
				style:--super-modal-panel-width={panelWidth}
				style:--super-modal-panel-height={panelHeight}
			>
				{@render children?.()}
			</div>
		</div>
	</div>
</div>

<style>
	.super-modal-shell {
		position: relative;
		width: 100%;
	}

	.super-modal-inline {
		width: 100%;
	}

	.super-modal-root {
		width: 100%;
	}

	.super-modal-root.active {
		position: fixed;
		inset: 0;
		z-index: var(--super-modal-z-index, 10000);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
		box-sizing: border-box;
		pointer-events: none;
	}

	.super-modal-backdrop {
		position: absolute;
		inset: 0;
		z-index: 0;
		margin: 0;
		padding: 0;
		border: none;
		background: color-mix(in srgb, var(--spectrum-global-color-gray-50, #fafafa) 68%, transparent);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		cursor: pointer;
		pointer-events: auto;
	}

	.super-modal-panel {
		width: 100%;
	}

	.super-modal-panel.open {
		position: relative;
		z-index: 1;
		width: var(--super-modal-panel-width, min(96vw, 1440px));
		height: var(--super-modal-panel-height, min(88vh, 920px));
		max-height: var(--super-modal-panel-height, min(88vh, 920px));
		pointer-events: auto;
		box-sizing: border-box;
	}

	.super-modal-root.animated.active .super-modal-backdrop {
		animation: super-modal-backdrop-in 1s ease-out both;
	}

	.super-modal-root.animated.active .super-modal-panel.open {
		animation: super-modal-panel-in 1s cubic-bezier(0.22, 1, 0.36, 1) 150ms both;
	}

	@keyframes super-modal-backdrop-in {
		from {
			opacity: 0;
		}

		to {
			opacity: 1;
		}
	}

	@keyframes super-modal-panel-in {
		from {
			opacity: 0;
			transform: translateY(1.25rem) scale(0.97);
		}

		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.super-modal-root.animated.active .super-modal-backdrop,
		.super-modal-root.animated.active .super-modal-panel.open {
			animation: none;
		}
	}
</style>
