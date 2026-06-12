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

	let labelElement = $state();

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
				bind:this={labelElement}
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

	<div class="inline-cells" class:multirow>
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

		&.multirow {
			max-height: var(--field-height);
		}

		&.left-label {
			flex-direction: row;
			align-items: center;
			gap: 1rem;
		}
		&.tall {
			height: 100%;
			justify-content: stretch;
			max-height: unset;
		}

		&.tall.left-label {
			flex-direction: row;
			align-items: stretch;
		}
	}

	.inline-cells {
		flex: 1;
		display: flex;
		align-items: stretch;
		min-height: 2rem;
		overflow: hidden;
	}

	.superlabel {
		width: var(--label-width);
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: space-between;
		line-height: 1.65rem;
		color: var(--spectrum-global-color-gray-700);
		font-family: 'inter', sans-serif;
		gap: 1rem;
		transition: 130ms;
		padding-left: 2px;
		opacity: 0.9;

		&.left {
			flex-direction: column;
			align-items: flex-start;
			justify-content: center;
			line-height: 1rem;
			gap: 0px;
			padding-left: unset;

			&.tall {
				justify-content: flex-start;
				padding-top: 0.5rem;
			}

			& > .label {
				width: var(--label-width);
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
			}
		}

		& > .label {
			min-width: 0;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			font-size: 12px;

			&.has-interaction {
				cursor: help;
			}
		}

		& > .error-message {
			color: var(--spectrum-global-color-red-400);
			font-size: 10px;
			white-space: nowrap;
		}
	}
</style>
