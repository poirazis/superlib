<script>
	let {
		focused = false,
		selected = false,
		textMode = false,
		optionColor,
		onSelect,
		onFocus,
		children
	} = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore event_directive_deprecated -->
<div
	class="option"
	class:text={textMode}
	class:focused
	class:selected
	style:--option-color={optionColor}
	on:mousedown|preventDefault|stopPropagation={onSelect}
	on:mouseenter={onFocus}
>
	{@render children?.()}
</div>
