<script>
	import { tooltip } from '../../actions/tooltip';

	let {
		labelPos,
		multirow,
		tall,
		label,
		field,
		helpText,
		error,
		labelWidth,
		height,
		maxHeight,
		children
	} = $props();

	let width = $derived(labelPos == 'left' ? (labelWidth ? labelWidth : '6rem') : 'auto');
</script>

<div
	class="super-field"
	class:left-label={labelPos == 'left'}
	class:multirow
	class:tall
	style:--field-height={height}
	style:--max-height={maxHeight}
>
	{#if labelPos}
		<div
			class="superlabel"
			class:left={labelPos == 'left'}
			class:tall
			class:error
			style:--label-width={width}
		>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="label"
				class:has-interaction={!!helpText}
				use:tooltip={{ whenTruncated: !helpText }}
			>
				{label || field}
			</div>
			{#if error}
				<div class="error-message">
					{error}
				</div>
			{/if}
		</div>
	{/if}

	<div class="inline-cells">
		{@render children?.()}
	</div>
</div>

<style>
	.super-field {
		flex: 1;
		min-width: 80px;
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		overflow: hidden;
		min-height: var(--field-height, 2rem);
	}

	.super-field.multirow {
		max-height: var(--field-height);
	}

	.super-field.left-label {
		flex-direction: row;
		align-items: center;
		gap: 0.75rem;
	}

	.super-field.tall {
		height: 100%;
		justify-content: stretch;
		max-height: unset;
	}

	.super-field.tall.left-label {
		align-items: stretch;
	}

	.inline-cells {
		display: flex;
		align-items: stretch;
		min-height: 2rem;
		min-width: 0;
		overflow: hidden;
		width: 100%;
		height: 100%;
	}

	.superlabel {
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: space-between;
		line-height: 1.65rem;
		color: var(--spectrum-global-color-gray-600);
		font-family: 'inter', sans-serif;
		gap: 1rem;
		padding-left: 2px;
	}

	.superlabel.left {
		flex: 0 1 var(--label-width);
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		line-height: 1rem;
		gap: 0;
		padding-left: 0;
		min-width: 0;
	}

	.superlabel.left.tall {
		justify-content: flex-start;
		padding-top: 0.5rem;
	}

	.superlabel > .label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 12px;
		font-weight: 500;
	}

	.superlabel.left > .label {
		width: 100%;
	}

	.superlabel > .label.has-interaction {
		cursor: help;
	}

	.superlabel > .error-message {
		color: var(--spectrum-global-color-red-400);
		font-size: 10px;
		white-space: nowrap;
	}
</style>
