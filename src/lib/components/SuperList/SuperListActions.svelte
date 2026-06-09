<script>
	import { createEventDispatcher } from 'svelte';

	let {
		inEdit,
		reorderOnly,
		fullSelection,
		editorState,
		hasItems
	} = $props();

	const dispatch = createEventDispatcher();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore event_directive_deprecated -->
{#if inEdit && !reorderOnly}
	<li class="buttons" class:inEdit>
		<div
			class="add-button"
			class:disabled={fullSelection}
			on:click|preventDefault={() => dispatch('togglePicker')}
		>
			{editorState == 'Closed' ? (fullSelection ? 'All Selected' : 'Select') : 'Close'}
		</div>
		{#if hasItems}
			<div class="clear-button" on:click|preventDefault={() => dispatch('clear')}>
				Clear
			</div>
		{/if}
	</li>
{/if}

<style>
	li.buttons {
		display: flex;
		padding: unset !important;
		color: var(--spectrum-global-color-gray-500);
	}

	li.buttons.inEdit {
		color: var(--spectrum-global-color-gray-700);
	}

	li.buttons:hover {
		background-color: transparent !important;
	}

	.add-button {
		flex: 1;
		min-width: 0;
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.add-button.disabled {
		background-color: var(--spectrum-global-color-gray-200);
		color: var(--spectrum-global-color-gray-500);
	}

	.clear-button {
		flex: 1;
		min-width: 0;
		display: flex;
		justify-content: center;
		align-items: center;
		border-left: 1px solid var(--spectrum-global-color-gray-300);
	}

	.clear-button:hover {
		color: var(--spectrum-global-color-red-500);
		cursor: pointer;
	}
</style>