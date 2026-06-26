<script>
	let { columnOptions, footerLabel } = $props();
</script>

{#if columnOptions.showFooter}
	<div class="super-column-footer">
		<span>
			{footerLabel}
		</span>
	</div>
{/if}
