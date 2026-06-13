<script>
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	let {
		checked = false,
		disabled = false,
		hovered = false,
		size = 'medium',
		tristate = false,
		anchor = $bindable(null)
	} = $props();

	let isChecked = $derived(checked === true);
	let isIndeterminate = $derived(tristate && checked === null);

	function toggle() {
		if (disabled) return;

		let next = checked;

		if (tristate) {
			if (checked === false) {
				next = true;
			} else if (checked === true) {
				next = null;
			} else {
				next = false;
			}
		} else {
			next = !isChecked;
		}

		dispatch('change', { checked: next });
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore event_directive_deprecated -->
<div
	bind:this={anchor}
	class="switch-container {size}"
	class:checked={isChecked}
	class:indeterminate={isIndeterminate}
	class:disabled
	class:hovered
	role="switch"
	aria-checked={isChecked}
	tabindex={disabled ? -1 : 0}
	on:click|stopPropagation={() => {
		toggle();
	}}
	on:keydown={(e) => {
		if (e.key === ' ' || e.key === 'Enter') {
			e.preventDefault();
			toggle();
		}
	}}
>
	<div class="switch-track">
		<div class="switch-thumb"></div>
	</div>
</div>

<style>
	.switch-container {
		display: inline-flex;
		align-items: center;
		cursor: pointer;
		user-select: none;
	}

	.switch-container.disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.switch-track {
		position: relative;
		background-color: var(--spectrum-global-color-gray-400);
		border-radius: 1rem;
	}

	.switch-thumb {
		position: absolute;
		background-color: var(--spectrum-global-color-gray-50);
		border-radius: 50%;
		transition: transform 0.2s ease-in-out;
	}

	.switch-container.small .switch-track {
		width: 2rem;
		height: 1rem;
	}

	.switch-container.small .switch-thumb {
		width: 0.7rem;
		height: 0.7rem;
		top: 0.15rem;
		left: 0.15rem;
	}

	.switch-container.small.checked .switch-thumb {
		transform: translateX(1rem);
	}

	.switch-container.small.checked .switch-track {
		justify-content: flex-end;
	}

	.switch-container.small.indeterminate .switch-thumb {
		transform: translateX(0.45rem);
	}

	.switch-container.medium .switch-track {
		width: 2.5rem;
		height: 1.25rem;
	}

	.switch-container.medium .switch-thumb {
		width: 1rem;
		height: 1rem;
		top: 0.125rem;
		left: 0.125rem;
	}

	.switch-container.medium.checked .switch-thumb {
		transform: translateX(1.25rem);
	}

	.switch-container.medium.indeterminate .switch-thumb {
		transform: translateX(0.625rem);
	}

	.switch-container.large .switch-track {
		width: 3rem;
		height: 1.5rem;
	}

	.switch-container.large .switch-thumb {
		width: 1.25rem;
		height: 1.25rem;
		top: 0.125rem;
		left: 0.125rem;
	}

	.switch-container.large.checked .switch-thumb {
		transform: translateX(1.5rem);
	}

	.switch-container.large.indeterminate .switch-thumb {
		transform: translateX(0.75rem);
	}

	.switch-container.checked .switch-track {
		background-color: var(--spectrum-global-color-blue-500);
	}

	.switch-container.indeterminate .switch-track {
		background-color: var(--spectrum-global-color-orange-500);
	}

	.switch-container:hover:not(.disabled),
	.switch-container.hovered:not(.disabled) {
		filter: brightness(1.1);
	}

	.switch-container:focus-visible {
		outline: 2px solid var(--spectrum-global-color-blue-600);
		outline-offset: 2px;
		border-radius: 0.5rem;
	}
</style>
