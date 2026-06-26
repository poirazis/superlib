<script>
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	let {
		checked = false,
		disabled = false,
		viewMode = false,
		color = undefined,
		label = ''
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
	class="radiobox"
	class:selected={checked}
	class:disabled
	class:view-mode={viewMode}
	style:--option-color={color}
	on:mousedown|preventDefault={handleSelect}
>
	<i
		style:color={checked ? color : undefined}
		class={checked ? 'ph-fill ph-radio-button' : 'ph ph-circle'}
	></i>
	<span class="label">{label}</span>
</div>

<style>
	.radiobox {
		height: 1.75rem;
		display: flex;
		gap: 0.55rem;
		align-items: center;
		cursor: pointer;
		padding: 0 0.5rem;
		opacity: 0.75;
		border-radius: 0.25rem;
		color: var(--spectrum-global-color-gray-700);
		min-width: 0;
	}

	.radiobox.view-mode,
	.radiobox.disabled {
		cursor: default;
	}

	.radiobox.disabled {
		opacity: 0.6;
	}

	.radiobox:hover:not(.disabled):not(.view-mode) > i {
		color: var(--option-color, var(--spectrum-global-color-gray-700));
		opacity: 1;
	}

	.radiobox.selected {
		color: var(--spectrum-global-color-gray-800);
		opacity: 1;
	}

	.radiobox > i {
		font-size: 16px;
		color: var(--spectrum-global-color-gray-600);
		flex-shrink: 0;
	}

	.label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
