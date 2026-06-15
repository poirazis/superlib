<script>
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	let {
		selected = false,
		disabled = false,
		viewMode = false,
		iconOnly = false,
		color = undefined,
		icon = undefined,
		label = '',
		fieldbutton = false
	} = $props();

	function handleSelect() {
		if (disabled || viewMode) return;
		dispatch('select');
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore event_directive_deprecated -->
<div
	class="simple-button"
	class:selected
	class:disabled
	class:icon-only={iconOnly}
	class:view-mode={viewMode}
	class:field-button={fieldbutton}
	style:--option-color={color}
	on:click={handleSelect}
>
	{#if icon}
		<i class={icon}></i>
	{/if}
	{#if !iconOnly && label}
		<span class="label">{label}</span>
	{/if}
</div>

<style>
	.simple-button {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.25rem 0.75rem;
		border: 1px solid var(--spectrum-global-color-gray-400);
		border-radius: 0.5rem;
		background-color: var(--spectrum-global-color-gray-100);
		color: var(--spectrum-global-color-gray-600);
		cursor: pointer;
		user-select: none;
		font-weight: 400;
		transition: all 0.15s ease-in-out;
		white-space: nowrap;
		text-overflow: ellipsis;
		overflow: hidden;
		max-width: 100%;
		gap: 0.35rem;
		max-height: 1.75rem;
		min-width: 0;
		font-size: 12px;
	}

	.simple-button.field-button {
		border: 1px solid var(--spectrum-global-color-gray-200);
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
	}

	.simple-button.view-mode,
	.simple-button.disabled {
		cursor: default;
	}

	.simple-button.disabled {
		opacity: 0.6;
	}

	.simple-button:hover:not(.disabled):not(.view-mode) {
		background-color: var(--spectrum-global-color-gray-300);
		border-color: var(--spectrum-global-color-gray-300);
		color: var(--spectrum-global-color-gray-800);
	}

	.simple-button:active:not(.disabled):not(.view-mode) {
		border-color: var(--spectrum-global-color-gray-500);
		color: var(--spectrum-global-color-gray-800);
	}

	.simple-button.selected {
		background-color: var(--option-color, var(--spectrum-global-color-gray-200));
		border-color: var(--spectrum-global-color-gray-400);
		color: var(--spectrum-global-color-gray-800);
		font-weight: 600;
	}

	.simple-button.icon-only {
		aspect-ratio: 1;
		border-radius: 0.25rem;
		padding: 0.25rem;
		flex: none;
	}

	.label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
