<script>
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	let {
		checked = $bindable(false),
		partial = false,
		disabled = false,
		hovered = false,
		locked = false,
		size = 'small',
		anchor = $bindable(null)
	} = $props();

	function toggle() {
		if (disabled || locked) return;
		checked = !checked;
		dispatch('change', { checked });
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore event_directive_deprecated -->
<button
	bind:this={anchor}
	class:checked
	class:disabled
	class:hovered
	class:locked
	class={size}
	tabindex={disabled || locked ? -1 : 0}
	on:click={toggle}
>
	{#if checked}
		<i class="ph ph-bold ph-check"></i>
	{:else if partial}
		<i class="ph ph-minus"></i>
	{:else if locked}
		<i class="ph ph-lock"></i>
	{/if}
</button>

<style>
	button {
		all: unset;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 0.25rem;
		border: 1px solid var(--spectrum-global-color-gray-500);
		background-color: var(--spectrum-global-color-gray-50);
		transition: all 0.1s ease-in-out;
	}

	button.small {
		width: 0.85rem;
		height: 0.85rem;
	}

	button.small i {
		font-size: 0.65rem;
	}

	button.medium {
		width: 1rem;
		height: 1rem;
	}

	button.medium i {
		font-size: 0.75rem;
	}

	button.large {
		width: 1.25rem;
		height: 1.25rem;
	}

	button.large i {
		font-size: 0.9rem;
	}

	button.checked {
		border-color: var(--spectrum-global-color-blue-600) !important;
		background-color: var(--spectrum-global-color-blue-600);
	}

	button.checked i {
		color: white;
		font-weight: 900;
	}

	button.disabled {
		cursor: not-allowed;
		background-color: var(--spectrum-global-color-gray-200);
		border-color: var(--spectrum-global-color-gray-300);
	}

	button.locked {
		border-color: transparent;
	}

	button.locked i {
		font-size: 1rem !important;
		font-weight: 400 !important;
		color: var(--spectrum-global-color-gray-500) !important;
	}

	button:hover:not(.disabled):not(.locked):not(.checked) {
		background-color: var(--spectrum-global-color-gray-100);
		border-color: var(--spectrum-global-color-gray-600);
	}

	button.hovered:not(.disabled):not(.locked):not(.checked) {
		border: 1px solid var(--spectrum-global-color-gray-600);
	}

	button:active:not(.disabled):not(.locked):not(.checked) {
		background-color: var(--spectrum-global-color-blue-100);
	}

	button:focus:not(.disabled):not(.locked) {
		border: 1px solid var(--spectrum-global-color-gray-700);
	}

	i {
		font-weight: 700;
		color: var(--spectrum-global-color-gray-700);
		animation: scaleIn 0.13s ease-out;
	}

	@keyframes scaleIn {
		from {
			transform: scale(0);
		}
		to {
			transform: scale(1);
		}
	}
</style>
