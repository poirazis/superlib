<script>
	let { children } = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore event_directive_deprecated -->
<div class="picker" on:mousedown|stopPropagation|preventDefault>
	{@render children?.()}
</div>
