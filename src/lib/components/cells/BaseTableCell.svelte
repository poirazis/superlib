<script lang="ts">
	import { tooltip } from '../../actions/tooltip';
	import {
		formatAttachmentExtensionLabel,
		formatTableCellValue,
		isAttachmentFieldType,
		normalizeTableCellAttachments
	} from './helpers';
	import type { BaseTableCellProps } from './types';

	let {
		value = null,
		displayValue = undefined,
		fieldSchema,
		cellOptions = {},
		disabled = false
	}: BaseTableCellProps = $props();

	let viewMode = $derived(
		fieldSchema?.type == 'link' ? cellOptions.relViewMode : (cellOptions.optionsViewMode ?? 'text')
	);
	let colors = $derived(fieldSchema?.optionColors);
	let arrayValue = $derived(Array.isArray(value) ? value : value ? [value] : null);
	let normalizezedArrayValue = $derived(
		arrayValue?.map((v) => String(v.primaryDisplay ? v.primaryDisplay : v))
	);

	let fallbackDisplayValue = $derived(
		formatTableCellValue(value, fieldSchema, {
			dateFormat: cellOptions.dateFormat,
			showTime: cellOptions.showTime,
			show24HTime: cellOptions.show24HTime
		})
	);
	let cellText = $derived(
		typeof displayValue === 'string' ? displayValue : fallbackDisplayValue
	);
	let isBooleanColumn = $derived(fieldSchema?.type === 'boolean');
	let isAttachmentColumn = $derived(isAttachmentFieldType(fieldSchema?.type));
	let attachmentItems = $derived(
		isAttachmentColumn ? normalizeTableCellAttachments(value, fieldSchema) : []
	);
	let showAttachmentPills = $derived(isAttachmentColumn && attachmentItems.length > 0);
	let visibleAttachmentItems = $derived(attachmentItems.slice(0, 5));
	let hiddenAttachmentCount = $derived(
		attachmentItems.length > 5 ? attachmentItems.length - 5 : 0
	);

	let showOptionPill = $derived(
		(viewMode === 'pills' && colors) || (viewMode === 'pills' && fieldSchema?.type == 'link')
	);
	let showOptionBullet = $derived(viewMode === 'bullets' && colors);
</script>

<div class="super-table-cell" class:disabled>
	{#key viewMode}
		<div
			class="value-contents"
			class:bullets={showOptionBullet}
			style:justify-content={cellOptions.align}
		>
			{#if showAttachmentPills}
				{#each visibleAttachmentItems as attachment (attachment.key ?? attachment.name)}
					<div class="attachment-pill" use:tooltip title={attachment.name}>
						{formatAttachmentExtensionLabel(attachment)}
					</div>
				{/each}
				{#if hiddenAttachmentCount > 0}
					<span class="remaining-count">( + {hiddenAttachmentCount} )</span>
				{/if}
			{:else if showOptionPill}
				{#each normalizezedArrayValue as _value}
					<div class="value option pill" style:--option-color={colors?.[_value]} use:tooltip>
						{_value}
					</div>
				{/each}
			{:else if showOptionBullet}
				{#each normalizezedArrayValue as _value}
					<div class="option-item" style:--option-color={colors?.[_value]}>
						<div class="bullet"></div>
						<div class="option-label">{_value}</div>
					</div>
				{/each}
			{:else if isBooleanColumn}
				{#if value == true || value === 'true' || value === 'True'}
					<div class="value"><i class="ph ph-check"></i></div>
				{/if}
			{:else}
				<div class="value" use:tooltip>{cellText}</div>
			{/if}
		</div>
	{/key}
</div>

<style>
	.super-table-cell {
		display: flex;
		align-items: center;
		align-self: stretch;
		justify-content: flex-start;
		flex: 1 1 auto;
		width: 100%;
		height: 100%;
		min-width: 0;
		box-sizing: border-box;
		overflow: hidden;
		padding: 0 var(--super-table-cell-padding, 0.75rem);
		color: inherit;
		font-size: 12px;
		line-height: 1.25;
		background-color: transparent;
	}

	.super-table-cell.disabled {
		color: var(--spectrum-global-color-gray-500);
		font-style: italic;
		opacity: 0.85;
	}

	.value-contents {
		flex: 1 1 auto;
		display: flex;
		align-items: center;
		min-width: 0;
		overflow: hidden;
		gap: 0.55rem;
	}

	.value-contents.bullets {
		gap: 0.75rem;
	}

	.value {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.value.option.pill {
		display: inline-block;
		width: auto;
		max-width: 100%;
		background-color: var(--option-color, var(--spectrum-global-color-gray-100));
		border: 1px solid var(--option-color, var(--spectrum-global-color-gray-300));
		border-radius: 4px;
		padding: 0.25rem 0.5rem;
	}

	.option-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		max-width: 100%;
		overflow: hidden;
	}

	.bullet {
		width: 16px;
		height: 16px;
		border-radius: 1rem;
		background-color: var(--option-color, var(--spectrum-global-color-gray-300));
		flex-shrink: 0;
	}

	.option-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	.attachment-pill {
		border: 1px solid var(--spectrum-global-color-gray-500);
		padding: 0 0.25rem;
		border-radius: 3px;
		font-size: 11px;
		display: flex;
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
		justify-content: center;
		flex-shrink: 0;
	}

	.remaining-count {
		display: flex;
		align-items: center;
		color: var(--spectrum-global-color-gray-700);
		font-size: 12px;
		font-weight: 500;
		white-space: nowrap;
		flex-shrink: 0;
	}
</style>
