<script lang="ts">
	let {
		children,
		columns = 1,
		labelPosition = 'above',
		padded = false,
		class: className = ''
	}: {
		children?: import('svelte').Snippet;
		columns?: number;
		labelPosition?: string | boolean;
		padded?: boolean;
		class?: string;
	} = $props();

	const normalizedColumns = $derived(Math.max(1, Number(columns) || 1));
</script>

<div
	class="super-form-inner-form {className}"
	class:labels-left={labelPosition === 'left'}
	class:no-labels={labelPosition === false || labelPosition === 'none'}
	class:field-group={normalizedColumns > 1}
	class:padded
	style:grid-template-columns={`repeat(${normalizedColumns * 6}, 1fr)`}
>
	{@render children?.()}
</div>

<style>
	.super-form-inner-form {
		flex: auto;
		display: flex;
		flex-direction: column;
	}

	.super-form-inner-form.field-group {
		flex: auto;
		display: grid;
		column-gap: 0.75rem;
		row-gap: 0.25rem;
		align-content: flex-start;
	}

	.super-form-inner-form.padded {
		padding: 0.75rem;
	}

	.super-form-inner-form.no-labels {
		row-gap: 0.25rem;
	}
</style>
