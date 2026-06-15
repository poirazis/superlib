import type { Component } from 'svelte';
import StringCell from '../components/cells/StringCell.svelte';
import NumberCell from '../components/cells/NumberCell.svelte';
import AdvancedOptionsCell from '../components/cells/AdvancedOptionsCell.svelte';
import BooleanCell from '../components/cells/BooleanCell.svelte';
import DatetimeCell from '../components/cells/DatetimeCell.svelte';
import LinkCell from '../components/cells/LinkCell.svelte';
import JSONCell from '../components/cells/JSONCell.svelte';
import AttachmentCell from '../components/cells/AttachmentCell.svelte';

type SchemaLike = { type?: string } | undefined;

export const cellComponents: Record<string, Component> = {
	string: StringCell,
	longform: StringCell,
	number: NumberCell,
	bigint: NumberCell,
	options: AdvancedOptionsCell,
	array: AdvancedOptionsCell,
	jsonarray: AdvancedOptionsCell,
	boolean: BooleanCell,
	datetime: DatetimeCell,
	link: LinkCell,
	json: JSONCell,
	attachment_single: AttachmentCell,
	attachment: AttachmentCell,
	bb_reference_single: LinkCell,
	bb_reference: LinkCell
};

export const headerComponents: Record<string, Component | null> = {
	string: StringCell,
	number: NumberCell,
	bigint: NumberCell,
	options: AdvancedOptionsCell,
	array: AdvancedOptionsCell,
	jsonarray: AdvancedOptionsCell,
	boolean: BooleanCell,
	datetime: DatetimeCell,
	link: StringCell,
	json: JSONCell,
	attachment_single: null,
	attachment: null,
	bb_reference_single: StringCell,
	bb_reference: StringCell
};

export function getCellComponent(
	columnSchema: SchemaLike,
	canEdit = true
): Component {
	const type = columnSchema?.type ?? 'string';
	const comp = cellComponents[type] ?? StringCell;
	if (comp === StringCell && !canEdit) return StringCell;
	return comp;
}

export function getHeaderComponent(columnSchema: SchemaLike): Component {
	const type = columnSchema?.type ?? 'string';
	return headerComponents[type] ?? StringCell;
}

export function buildRowCellOptions(columnOptions: Record<string, unknown>) {
	return {
		role: 'tableCell',
		showDirty: true,
		readonly: !columnOptions.canEdit,
		align: columnOptions.align,
		template: columnOptions.template,
		optionsViewMode: columnOptions.optionsViewMode,
		relViewMode: columnOptions.relViewMode,
		padding: columnOptions.isFirst ? '1rem' : '0.5rem',
		background: columnOptions.background,
		color: columnOptions.color,
		controlType: 'checkbox'
	};
}

export function buildHeaderCellOptions(columnOptions: Record<string, unknown>) {
	return {
		align: columnOptions.align,
		color: columnOptions.color,
		background: 'var(--spectrum-global-color-gray-50)',
		fontWeight: columnOptions.fontWeight,
		padding: columnOptions.cellPadding,
		placeholder: columnOptions.defaultFilteringOperator,
		clearValueIcon: true,
		optionsViewMode: 'text',
		optionsSource: 'schema',
		debounce: 250,
		controlType: 'select',
		initialState: 'Editing',
		role: 'inlineInput'
	};
}