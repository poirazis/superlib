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
		background-color: var(--switch-track-off, var(--spectrum-global-color-gray-400));
		border-radius: 1rem;
		transition:
			background-color 0.22s cubic-bezier(0.4, 0, 0.2, 1),
			box-shadow 0.22s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.switch-thumb {
		position: absolute;
		top: var(--switch-thumb-inset, 0.125rem);
		left: var(--switch-thumb-inset, 0.125rem);
		background-color: var(--spectrum-global-color-gray-50);
		border-radius: 50%;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.18);
		transform: translateX(0);
		transition:
			transform 0.28s cubic-bezier(0.34, 1.2, 0.64, 1),
			box-shadow 0.22s cubic-bezier(0.4, 0, 0.2, 1);
		will-change: transform;
	}

	.switch-container.small {
		--switch-thumb-inset: 0.15rem;
		--switch-thumb-travel: 1rem;
		--switch-thumb-travel-mid: 0.45rem;
	}

	.switch-container.small .switch-track {
		width: 2rem;
		height: 1rem;
	}

	.switch-container.small .switch-thumb {
		width: 0.7rem;
		height: 0.7rem;
	}

	.switch-container.medium {
		--switch-thumb-travel: 1.25rem;
		--switch-thumb-travel-mid: 0.625rem;
	}

	.switch-container.medium .switch-track {
		width: 2.5rem;
		height: 1.25rem;
	}

	.switch-container.medium .switch-thumb {
		width: 1rem;
		height: 1rem;
	}

	.switch-container.large {
		--switch-thumb-travel: 1.5rem;
		--switch-thumb-travel-mid: 0.75rem;
	}

	.switch-container.large .switch-track {
		width: 3rem;
		height: 1.5rem;
	}

	.switch-container.large .switch-thumb {
		width: 1.25rem;
		height: 1.25rem;
	}

	.switch-container.checked .switch-thumb {
		transform: translateX(var(--switch-thumb-travel));
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.22);
	}

	.switch-container.indeterminate .switch-thumb {
		transform: translateX(var(--switch-thumb-travel-mid));
	}

	.switch-container.checked .switch-track {
		background-color: var(--switch-track-on, var(--spectrum-global-color-blue-500));
	}

	.switch-container.indeterminate .switch-track {
		background-color: var(--switch-track-mid, var(--spectrum-global-color-orange-500));
	}

	.switch-container:active:not(.disabled) .switch-thumb {
		transition-duration: 0.16s;
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
