import type { Component } from 'svelte';
import StringCell from '../components/cells/StringCell.svelte';
import NumberCell from '../components/cells/NumberCell.svelte';
import BaseDropdownCell from '../components/cells/BaseDropdownCell.svelte';
import BooleanCell from '../components/cells/BooleanCell.svelte';
import DatetimeCell from '../components/cells/DatetimeCell.svelte';
import LinkCell from '../components/cells/LinkCell.svelte';
import JSONCell from '../components/cells/JSONCell.svelte';
import AttachmentCell from '../components/cells/AttachmentCell.svelte';
import AttachmentsCell from '../components/cells/AttachmentsCell.svelte';
import BaseTableCell from '../components/cells/BaseTableCell.svelte';

type SchemaLike = { type?: string } | undefined;

export const cellComponents: Record<string, Component> = {
	string: StringCell,
	longform: StringCell,
	number: NumberCell,
	bigint: NumberCell,
	options: BaseDropdownCell,
	array: BaseDropdownCell,
	jsonarray: BaseDropdownCell,
	boolean: BooleanCell,
	datetime: DatetimeCell,
	link: LinkCell,
	json: JSONCell,
	attachment_single: AttachmentCell,
	attachment: AttachmentsCell,
	bb_reference_single: LinkCell,
	bb_reference: LinkCell
};

export const headerComponents: Record<string, Component | null> = {
	string: StringCell,
	number: NumberCell,
	bigint: NumberCell,
	options: BaseDropdownCell,
	array: BaseDropdownCell,
	jsonarray: BaseDropdownCell,
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
	canEdit = true,
	isEditing = false
): Component {
	if (!canEdit || !isEditing) return BaseTableCell;

	const type = columnSchema?.type ?? 'string';
	return cellComponents[type] ?? StringCell;
}

export function getHeaderComponent(columnSchema: SchemaLike): Component {
	const type = columnSchema?.type ?? 'string';
	return headerComponents[type] ?? StringCell;
}
