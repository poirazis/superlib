<script>
	let { stbState, tableAPI, highlighted, footer, tableActions } = $props();

	let inInsert = $derived($stbState == 'Inserting');
</script>

{#if $stbState == 'Idle' || inInsert || tableActions?.length}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore event_directive_deprecated -->
	<div
		class="overlay-button add-row-overlay"
		class:highlighted
		class:footer
		class:in-insert={inInsert}
		on:click={() => (inInsert ? stbState.cancelAddRow() : stbState.addRow())}
	>
		<span> + </span>
	</div>

	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore event_directive_deprecated -->
	<div
		class="overlay-button save-row-overlay"
		class:highlighted
		class:footer
		class:in-insert={inInsert}
		on:click={tableAPI.insertRow}
	>
		{#if $stbState == 'Saving'}
			<i class="ri-loader-2-line"></i>
		{:else}
			<i class="ri-save-fill"></i>
		{/if}
	</div>
{/if}

{#if $stbState == 'Filtered'}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore event_directive_deprecated -->
	<div
		class="overlay-button filter-row-overlay"
		class:highlighted
		class:footer
		on:click={stbState.clear}
	>
		<i class="ri-filter-off-line"></i>
	</div>
{/if}
