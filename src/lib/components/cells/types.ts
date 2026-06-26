import type { RowAttachment } from '@budibase/types';

export type CellFsmState = 'view' | 'editing' | 'readonly' | 'disabled' | 'copyable' | 'justCopied';

export type AttachmentItem = RowAttachment;

export type FsmController = { goTo: (state: string) => void };

export type OptionFieldSchema = {
	optionColors?: string[] | Record<string, string>;
	constraints?: { inclusion?: string[] };
};

export type ReadOnlyOptionCellOptions = {
	optionsSource?: string;
	customOptions?: Array<{ label?: string; value?: unknown }>;
};

export type TableCellFormatOptions = {
	dateFormat?: string;
	showTime?: boolean;
	show24HTime?: boolean;
	template?: string;
	processTemplate?: (template: string, context: Record<string, unknown>) => string;
};

export type SchemaLike = { type?: string } | undefined;

export type ParseDateOptions = {
	allowNumericTimestamps?: boolean;
};

export type CellRole = 'form' | 'cell';

export interface BaseCellProps {
	role?: CellRole;
	csm?: any;
	id?: string;
	error?: boolean;
	isDirty?: boolean;
	multirow?: boolean;
	placeholder?: boolean;
	copyIcon?: 'always' | 'onhover' | string;
	align?: string | null;
	grabber?: boolean;
	naked?: boolean;
	color?: string;
	background?: string;
	styles?: Record<string, unknown>;
	tabindex?: number;
	popupOpen?: boolean;
	root?: HTMLElement | null;
	[key: string]: unknown;
}

export type TextAlign = 'left' | 'center' | 'right';

export interface BaseTableCellProps {
	value?: unknown;
	displayValue?: string;
	fieldSchema?: OptionFieldSchema & { type?: string };
	cellOptions?: ReadOnlyOptionCellOptions &
		Pick<TableCellFormatOptions, 'dateFormat' | 'showTime' | 'show24HTime'> & {
			align?: TextAlign;
			columnAlign?: string | null;
			disabled?: boolean;
			color?: string;
			background?: string;
			optionsViewMode?: string;
			relViewMode?: string;
		};
	disabled?: boolean;
	color?: string;
	background?: string;
}

export interface LinkItem {
	_id: string;
	primaryDisplay: string;
	[key: string]: unknown;
}

export interface SQLLinkItem {
	primaryDisplay: string;
	[key: string]: unknown;
}

export interface CellOption {
	label: string;
	value: unknown;
	color?: string;
	icon?: string;
}
