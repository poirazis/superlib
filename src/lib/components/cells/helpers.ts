import type { FieldSchema, FieldType } from '@budibase/types';
import { flexAlignToCellAlign } from '../../utils/columnAlign.ts';
import type {
	AttachmentItem,
	FsmController,
	OptionFieldSchema,
	ParseDateOptions,
	ReadOnlyOptionCellOptions,
	SchemaLike,
	TableCellFormatOptions
} from './types.ts';

/** Right-aligned copyable cells keep the copy icon visible to avoid empty trailing space. */
export function resolveCopyIconOnHover(
	copyIcon?: string,
	align?: string | null
): boolean {
	if (copyIcon !== 'onhover') return false;
	if (align == null || String(align).trim() === '') return true;
	return flexAlignToCellAlign(align) !== 'right';
}

export function emittedFieldValuesEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (Array.isArray(a) && Array.isArray(b)) {
		return JSON.stringify(a) === JSON.stringify(b);
	}
	if (a == null && b == null) return true;
	if (a == null || b == null) return false;
	return String(a) === String(b);
}

function extractLinkSelectionIds(value: unknown, idKey = '_id'): string[] {
	if (value == null || value === '') return [];

	if (Array.isArray(value)) {
		return value
			.map((item) => {
				if (typeof item === 'string') return item;
				if (item && typeof item === 'object' && idKey in item) {
					return String((item as Record<string, unknown>)[idKey]);
				}
				return null;
			})
			.filter((id): id is string => id != null);
	}

	if (typeof value === 'string') return [value];
	if (typeof value === 'object' && value !== null && idKey in value) {
		return [String((value as Record<string, unknown>)[idKey])];
	}

	return [];
}

export function firstRowKey(row: Record<string, unknown> | undefined): string | undefined {
	if (!row) return undefined;
	const keys = Object.keys(row);
	return keys.length ? keys[0] : undefined;
}

export function inferDisplayFieldFromRow(
	row: Record<string, unknown> | undefined
): string | undefined {
	return firstRowKey(row);
}

/** Resolve a link row label from primaryDisplay, a known field, or the first row key. */
export function resolveLinkRowDisplay(
	row: Record<string, unknown>,
	displayField?: string
): string {
	if (row.primaryDisplay != null && row.primaryDisplay !== '') {
		return String(row.primaryDisplay);
	}

	if (displayField && row[displayField] != null && row[displayField] !== '') {
		return String(row[displayField]);
	}

	const firstKey = firstRowKey(row);
	if (firstKey && row[firstKey] != null && row[firstKey] !== '') {
		return String(row[firstKey]);
	}

	return String(row._id ?? row.id ?? '');
}

/** Compare link/SQL-link emitted values by selected ids only (ignores label enrichment). */
export function linkSelectionEqual(a: unknown, b: unknown, idKey = '_id'): boolean {
	const aIds = extractLinkSelectionIds(a, idKey).sort().join('\0');
	const bIds = extractLinkSelectionIds(b, idKey).sort().join('\0');
	return aIds === bIds;
}

export function isFocusMovingWithin(
	anchor: HTMLElement | null | undefined,
	e: FocusEvent
): boolean {
	const related = e.relatedTarget as Node | null;
	return !!related && !!anchor?.contains(related);
}

export function normalizeBooleanValue(value: unknown): boolean {
	if (value === true || value === 1) return true;
	if (value === false || value === 0 || value == null || value === '') return false;
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
		if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
	}
	return false;
}

// --- Attachments ---

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];

const ATTACHMENT_SINGLE = 'attachment_single' as FieldType;

export function isImage(attachment: AttachmentItem | null | undefined) {
	return IMAGE_EXTENSIONS.includes(attachment?.extension?.toLowerCase() ?? '');
}

export function isMultiAttachment(fieldSchema: Pick<FieldSchema, 'type'> | null | undefined) {
	const type = fieldSchema?.type;
	if (!type) return false;
	return !String(type).includes('single');
}

export function normalizeSingleAttachment(
	value: AttachmentItem | AttachmentItem[] | string | null | undefined
): AttachmentItem[] {
	if (value == null || value === '') return [];

	if (typeof value === 'string') {
		try {
			return normalizeSingleAttachment(JSON.parse(value) as AttachmentItem | AttachmentItem[]);
		} catch {
			return [];
		}
	}

	if (Array.isArray(value)) {
		const item = value.find((entry) => entry != null && typeof entry === 'object');
		return item ? [item] : [];
	}

	if (typeof value === 'object') {
		return [value];
	}

	return [];
}

export function hasAttachmentValue(value: unknown): boolean {
	return normalizeSingleAttachment(value as AttachmentItem | AttachmentItem[] | string | null | undefined)
		.length > 0;
}

export function normalizeAttachments(
	value: AttachmentItem | AttachmentItem[] | string | null | undefined,
	multi: boolean
): AttachmentItem[] {
	if (value == null || value === '') return [];
	if (multi) return Array.isArray(value) ? value : [value as AttachmentItem];
	return normalizeSingleAttachment(value);
}

export function isAttachmentFieldType(type?: string): boolean {
	return type === 'attachment' || type === 'attachment_single';
}

export function formatAttachmentExtensionLabel(
	attachment: AttachmentItem | null | undefined
): string {
	const ext = attachment?.extension?.trim();
	if (ext) return ext.toUpperCase();

	const name = attachment?.name?.trim();
	if (!name) return '';

	const fromName = name.includes('.') ? name.split('.').pop() : '';
	return fromName ? fromName.toUpperCase() : name.toUpperCase();
}

export function normalizeTableCellAttachments(
	value: unknown,
	fieldSchema?: SchemaLike
): AttachmentItem[] {
	const type = fieldSchema?.type;
	if (type === 'attachment_single') {
		return normalizeSingleAttachment(
			value as AttachmentItem | AttachmentItem[] | string | null | undefined
		);
	}
	if (type === 'attachment') {
		return normalizeAttachments(
			value as AttachmentItem | AttachmentItem[] | string | null | undefined,
			true
		);
	}
	return [];
}

export async function uploadAttachments(
	API: { uploadAttachment: (tableId: string, data: FormData) => Promise<AttachmentItem[]> },
	tableid: string,
	fileList: File[]
): Promise<AttachmentItem[]> {
	const data = new FormData();
	for (let i = 0; i < fileList.length; i++) {
		data.append('file', fileList[i]);
	}
	return API.uploadAttachment(tableid, data);
}

export function isTableCellRole(role?: string) {
	return role === 'cell';
}

/** Form fields show placeholders and field icons in view; table cells only while editing. */
export function shouldShowCellViewChrome(role?: string, inEdit = false): boolean {
	return !isTableCellRole(role) || inEdit;
}

export function resolveEmptyViewText(
	placeholder: unknown,
	role?: string,
	inEdit = false
): string {
	if (!shouldShowCellViewChrome(role, inEdit)) {
		return '';
	}
	return placeholder == null ? '' : String(placeholder);
}

export function attachmentCopyText(attachments: AttachmentItem[] | null | undefined): string {
	if (!attachments?.length) return '';
	return attachments
		.map((item) => item?.name || item?.url || '')
		.filter(Boolean)
		.join(', ');
}

// --- Clipboard ---

export async function copyTextToClipboard(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch (err) {
		console.error('Failed to copy to clipboard:', err);
		return false;
	}
}

export function deferJustCopied(getFsm: () => FsmController, returnState = 'copyable') {
	return {
		_enter() {
			setTimeout(() => getFsm().goTo(returnState), 400);
		}
	};
}

export async function copyAndTransition(getFsm: () => FsmController, text: string): Promise<void> {
	if (await copyTextToClipboard(text)) {
		getFsm().goTo('justCopied');
	}
}

// --- Option colors ---

function getInclusionIndex(value: unknown, inclusion?: unknown[]) {
	if (!Array.isArray(inclusion) || value == null || value === '') return -1;

	const key = String(value);
	const directIndex = inclusion.indexOf(value);
	if (directIndex >= 0) return directIndex;

	return inclusion.findIndex((item) => String(item) === key);
}

export function resolveCustomOptionColor(
	value: unknown,
	fieldSchema?: OptionFieldSchema,
	customOptions?: Array<{ label?: string; value?: unknown }>
): string | undefined {
	const schemaColor = resolveOptionColor(value, fieldSchema);
	if (schemaColor) return schemaColor;

	if (!Array.isArray(customOptions) || value == null || value === '') {
		return undefined;
	}

	const key = String(value);
	const customIndex = customOptions.findIndex((opt) => String(opt.value ?? opt.label) === key);
	if (customIndex < 0) return undefined;

	const optionColors = fieldSchema?.optionColors;
	const inclusion = fieldSchema?.constraints?.inclusion;

	if (!Array.isArray(optionColors) || !Array.isArray(inclusion) || customIndex >= optionColors.length) {
		return undefined;
	}

	const inclusionValue = inclusion[customIndex];
	if (inclusionValue == null || String(inclusionValue) !== key) {
		return undefined;
	}

	return optionColors[customIndex] || undefined;
}

export function resolveOptionColor(
	value: unknown,
	fieldSchema?: OptionFieldSchema
): string | undefined {
	if (value == null || value === '') return undefined;

	const key = String(value);
	const optionColors = fieldSchema?.optionColors;
	const inclusion = fieldSchema?.constraints?.inclusion;
	const index = getInclusionIndex(value, inclusion);

	if (Array.isArray(optionColors) && index >= 0) {
		const explicit = optionColors[index];
		if (explicit) return explicit;
	}

	if (optionColors && !Array.isArray(optionColors) && optionColors[key]) {
		return optionColors[key];
	}

	return undefined;
}

export function resolveReadOnlyOptionDisplay(
	value: unknown,
	fieldSchema: OptionFieldSchema | undefined,
	displayLabel: string,
	cellOptions: ReadOnlyOptionCellOptions = {}
): { label: string; color?: string } {
	const key = String(value);

	if (cellOptions.optionsSource === 'custom' && Array.isArray(cellOptions.customOptions)) {
		const match = cellOptions.customOptions.find((opt) => String(opt.value) === key);
		return {
			label: match?.label ?? displayLabel,
			color: resolveCustomOptionColor(value, fieldSchema, cellOptions.customOptions)
		};
	}

	return {
		label: displayLabel,
		color: resolveOptionColor(value, fieldSchema)
	};
}

// --- Table cell formatting ---

const ISO_DATE_PATTERN =
	/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

const NON_DATE_TYPES = new Set([
	'number',
	'bigint',
	'boolean',
	'options',
	'array',
	'jsonarray',
	'json',
	'attachment',
	'attachment_single',
	'link',
	'bb_reference',
	'bb_reference_single'
]);

export function isDateLikeValue(value: unknown, options: ParseDateOptions = {}): boolean {
	return parseDateValue(value, options) != null;
}

export function parseDateValue(value: unknown, options: ParseDateOptions = {}): Date | null {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}

	if (typeof value === 'number' && Number.isFinite(value)) {
		if (!options.allowNumericTimestamps) return null;

		const ms = value > 1_000_000_000_000 ? value : value * 1000;
		const parsed = new Date(ms);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}

	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed || !ISO_DATE_PATTERN.test(trimmed)) return null;

		const parsed = new Date(trimmed);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}

	return null;
}

function shouldFormatAsDate(type: string, rawValue: unknown): boolean {
	if (type === 'datetime') {
		return parseDateValue(rawValue, { allowNumericTimestamps: true }) != null;
	}

	if (NON_DATE_TYPES.has(type)) return false;

	return isDateLikeValue(rawValue);
}

/** Matches DatetimeCell.formatDateTime default behaviour. */
export function formatReadableDate(
	date: Date,
	options: { dateFormat?: string; showTime?: boolean; show24HTime?: boolean } = {}
): string {
	const { dateFormat, showTime = false, show24HTime = false } = options;
	let dateResult = '';

	if (!dateFormat || dateFormat === 'default') {
		dateResult = date.toDateString();
	} else if (dateFormat === 'MM/DD/YYYY') {
		dateResult = `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear()}`;
	} else if (dateFormat === 'DD/MM/YYYY') {
		dateResult = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
	} else if (dateFormat === 'YYYY-MM-DD') {
		dateResult = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
	} else {
		const localeOptions: Record<string, Intl.DateTimeFormatOptions> = {
			'MMM DD, YYYY': { month: 'short', day: 'numeric', year: 'numeric' },
			'DD MMM YYYY': { day: 'numeric', month: 'short', year: 'numeric' }
		};

		const formatOption = localeOptions[dateFormat];
		dateResult = formatOption
			? date.toLocaleDateString('en-US', formatOption)
			: date.toDateString();
	}

	if (!showTime) {
		return dateResult;
	}

	const hours = date.getHours();
	const minutes = date.getMinutes();

	let timeString;
	if (show24HTime) {
		timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
	} else {
		const ampm = hours >= 12 ? 'PM' : 'AM';
		const display12h = hours % 12 || 12;
		timeString = `${display12h.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
	}

	return `${dateResult} ${timeString}`;
}

function formatDateValue(
	rawValue: unknown,
	schemaType: string,
	options: Pick<TableCellFormatOptions, 'dateFormat' | 'showTime' | 'show24HTime'> = {}
): string {
	const parsed = parseDateValue(rawValue, {
		allowNumericTimestamps: schemaType === 'datetime'
	});
	if (!parsed) return rawValue == null ? '' : String(rawValue);

	return formatReadableDate(parsed, {
		dateFormat: options.dateFormat,
		showTime: options.showTime,
		show24HTime: options.show24HTime
	});
}

function formatTypedValue(rawValue: unknown, schema: SchemaLike): string {
	if (rawValue == null || rawValue === '') return '';

	const type = schema?.type ?? 'string';

	switch (type) {
		case 'boolean':
			return rawValue === true ? 'Yes' : rawValue === false ? 'No' : '';
		case 'number':
		case 'bigint':
			return String(rawValue);
		case 'array':
		case 'options':
		case 'jsonarray':
			return Array.isArray(rawValue) ? rawValue.join(', ') : String(rawValue);
		case 'json':
			if (typeof rawValue === 'string') return rawValue;
			try {
				return JSON.stringify(rawValue);
			} catch {
				return String(rawValue);
			}
		case 'attachment':
		case 'attachment_single': {
			const items = normalizeTableCellAttachments(rawValue, schema);
			return items
				.map((item) => formatAttachmentExtensionLabel(item))
				.filter(Boolean)
				.join(', ');
		}
		case 'link':
		case 'bb_reference':
		case 'bb_reference_single': {
			if (Array.isArray(rawValue)) {
				return rawValue
					.map((item) => item?.primaryDisplay || item?.label || '')
					.filter(Boolean)
					.join(', ');
			}
			if (typeof rawValue === 'object' && rawValue !== null) {
				const record = rawValue as { primaryDisplay?: string; label?: string };
				return record.primaryDisplay || record.label || '';
			}
			return String(rawValue);
		}
		default:
			return String(rawValue);
	}
}

export function formatTableCellValue(
	rawValue: unknown,
	schema?: SchemaLike,
	options: TableCellFormatOptions = {}
): string {
	if (rawValue == null || rawValue === '') return '';

	const type = schema?.type ?? 'string';
	const isDate = shouldFormatAsDate(type, rawValue);
	const formattedDate = isDate ? formatDateValue(rawValue, type, options) : null;

	if (options.template && options.processTemplate) {
		const result = options.processTemplate(options.template, {
			value: formattedDate ?? rawValue,
			rawValue
		});

		if (typeof result === 'string' && shouldFormatAsDate(type, result)) {
			return formatDateValue(result, type, options);
		}

		return result == null ? '' : String(result);
	}

	if (isDate) {
		return formattedDate ?? '';
	}

	return formatTypedValue(rawValue, schema);
}

// --- Phosphor icons ---
export const ICON_CATEGORIES = {
	all: 'All Icons',
	business: 'Business',
	communication: 'Communication',
	design: 'Design',
	development: 'Development',
	document: 'Document',
	editor: 'Editor',
	finance: 'Finance',
	health: 'Health',
	logistics: 'Logistics',
	map: 'Maps',
	media: 'Media',
	system: 'System',
	user: 'User',
	weather: 'Weather'
};

export const ICONS_BY_CATEGORY = {
	all: [
		'acorn',
		'address-book',
		'address-book-tabs',
		'air-traffic-control',
		'airplane',
		'airplane-in-flight',
		'airplane-landing',
		'airplane-takeoff',
		'airplane-taxiing',
		'airplane-tilt',
		'airplay',
		'alarm',
		'alien',
		'align-bottom',
		'align-bottom-simple',
		'align-center-horizontal',
		'align-center-horizontal-simple',
		'align-center-vertical',
		'align-center-vertical-simple',
		'align-left',
		'align-left-simple',
		'align-right',
		'align-right-simple',
		'align-top',
		'align-top-simple',
		'amazon-logo',
		'ambulance',
		'anchor',
		'anchor-simple',
		'android-logo',
		'angle',
		'angular-logo',
		'aperture',
		'app-store-logo',
		'app-window',
		'apple-logo',
		'apple-podcasts-logo',
		'approximate-equals',
		'archive',
		'armchair',
		'arrow-arc-left',
		'arrow-arc-right',
		'arrow-bend-double-up-left',
		'arrow-bend-double-up-right',
		'arrow-bend-down-left',
		'arrow-bend-down-right',
		'arrow-bend-left-down',
		'arrow-bend-left-up',
		'arrow-bend-right-down',
		'arrow-bend-right-up',
		'arrow-bend-up-left',
		'arrow-bend-up-right',
		'arrow-circle-down',
		'arrow-circle-down-left',
		'arrow-circle-down-right',
		'arrow-circle-left',
		'arrow-circle-right',
		'arrow-circle-up',
		'arrow-circle-up-left',
		'arrow-circle-up-right',
		'arrow-clockwise',
		'arrow-counter-clockwise',
		'arrow-down',
		'arrow-down-left',
		'arrow-down-right',
		'arrow-elbow-down-left',
		'arrow-elbow-down-right',
		'arrow-elbow-left',
		'arrow-elbow-left-down',
		'arrow-elbow-left-up',
		'arrow-elbow-right',
		'arrow-elbow-right-down',
		'arrow-elbow-right-up',
		'arrow-elbow-up-left',
		'arrow-elbow-up-right',
		'arrow-fat-down',
		'arrow-fat-left',
		'arrow-fat-line-down',
		'arrow-fat-line-left',
		'arrow-fat-line-right',
		'arrow-fat-line-up',
		'arrow-fat-lines-down',
		'arrow-fat-lines-left',
		'arrow-fat-lines-right',
		'arrow-fat-lines-up',
		'arrow-fat-right',
		'arrow-fat-up',
		'arrow-left',
		'arrow-line-down',
		'arrow-line-down-left',
		'arrow-line-down-right',
		'arrow-line-left',
		'arrow-line-right',
		'arrow-line-up',
		'arrow-line-up-left',
		'arrow-line-up-right',
		'arrow-right',
		'arrow-square-down',
		'arrow-square-down-left',
		'arrow-square-down-right',
		'arrow-square-in',
		'arrow-square-left',
		'arrow-square-out',
		'arrow-square-right',
		'arrow-square-up',
		'arrow-square-up-left',
		'arrow-square-up-right',
		'arrow-u-down-left',
		'arrow-u-down-right',
		'arrow-u-left-down',
		'arrow-u-left-up',
		'arrow-u-right-down',
		'arrow-u-right-up',
		'arrow-u-up-left',
		'arrow-u-up-right',
		'arrow-up',
		'arrow-up-left',
		'arrow-up-right',
		'arrows-clockwise',
		'arrows-counter-clockwise',
		'arrows-down-up',
		'arrows-horizontal',
		'arrows-in',
		'arrows-in-cardinal',
		'arrows-in-line-horizontal',
		'arrows-in-line-vertical',
		'arrows-in-simple',
		'arrows-left-right',
		'arrows-merge',
		'arrows-out',
		'arrows-out-cardinal',
		'arrows-out-line-horizontal',
		'arrows-out-line-vertical',
		'arrows-out-simple',
		'arrows-split',
		'arrows-vertical',
		'article',
		'article-medium',
		'article-ny-times',
		'asclepius',
		'caduceus',
		'asterisk',
		'asterisk-simple',
		'at',
		'atom',
		'avocado',
		'axe',
		'baby',
		'baby-carriage',
		'backpack',
		'backspace',
		'bag',
		'bag-simple',
		'balloon',
		'bandaids',
		'bank',
		'barbell',
		'barcode',
		'barn',
		'barricade',
		'baseball',
		'baseball-cap',
		'baseball-helmet',
		'basket',
		'basketball',
		'bathtub',
		'battery-charging',
		'battery-charging-vertical',
		'battery-empty',
		'battery-full',
		'battery-high',
		'battery-low',
		'battery-medium',
		'battery-plus',
		'battery-plus-vertical',
		'battery-vertical-empty',
		'battery-vertical-full',
		'battery-vertical-high',
		'battery-vertical-low',
		'battery-vertical-medium',
		'battery-warning',
		'battery-warning-vertical',
		'beach-ball',
		'beanie',
		'bed',
		'beer-bottle',
		'beer-stein',
		'behance-logo',
		'bell',
		'bell-ringing',
		'bell-simple',
		'bell-simple-ringing',
		'bell-simple-slash',
		'bell-simple-z',
		'bell-slash',
		'bell-z',
		'belt',
		'bezier-curve',
		'bicycle',
		'binary',
		'binoculars',
		'biohazard',
		'bird',
		'blueprint',
		'bluetooth',
		'bluetooth-connected',
		'bluetooth-slash',
		'bluetooth-x',
		'boat',
		'bomb',
		'bone',
		'book',
		'book-bookmark',
		'book-open',
		'book-open-text',
		'book-open-user',
		'bookmark',
		'bookmark-simple',
		'bookmarks',
		'bookmarks-simple',
		'books',
		'boot',
		'boules',
		'bounding-box',
		'bowl-food',
		'bowl-steam',
		'bowling-ball',
		'box-arrow-down',
		'archive-box',
		'box-arrow-up',
		'boxing-glove',
		'brackets-angle',
		'brackets-curly',
		'brackets-round',
		'brackets-square',
		'brain',
		'brandy',
		'bread',
		'bridge',
		'briefcase',
		'briefcase-metal',
		'broadcast',
		'broom',
		'browser',
		'browsers',
		'bug',
		'bug-beetle',
		'bug-droid',
		'building',
		'building-apartment',
		'building-office',
		'buildings',
		'bulldozer',
		'bus',
		'butterfly',
		'cable-car',
		'cactus',
		'cake',
		'calculator',
		'calendar',
		'calendar-blank',
		'calendar-check',
		'calendar-dot',
		'calendar-dots',
		'calendar-heart',
		'calendar-minus',
		'calendar-plus',
		'calendar-slash',
		'calendar-star',
		'calendar-x',
		'call-bell',
		'camera',
		'camera-plus',
		'camera-rotate',
		'camera-slash',
		'campfire',
		'car',
		'car-battery',
		'car-profile',
		'car-simple',
		'cardholder',
		'cards',
		'cards-three',
		'caret-circle-double-down',
		'caret-circle-double-left',
		'caret-circle-double-right',
		'caret-circle-double-up',
		'caret-circle-down',
		'caret-circle-left',
		'caret-circle-right',
		'caret-circle-up',
		'caret-circle-up-down',
		'caret-double-down',
		'caret-double-left',
		'caret-double-right',
		'caret-double-up',
		'caret-down',
		'caret-left',
		'caret-line-down',
		'caret-line-left',
		'caret-line-right',
		'caret-line-up',
		'caret-right',
		'caret-up',
		'caret-up-down',
		'carrot',
		'cash-register',
		'cassette-tape',
		'castle-turret',
		'cat',
		'cell-signal-full',
		'cell-signal-high',
		'cell-signal-low',
		'cell-signal-medium',
		'cell-signal-none',
		'cell-signal-slash',
		'cell-signal-x',
		'cell-tower',
		'certificate',
		'chair',
		'chalkboard',
		'chalkboard-simple',
		'chalkboard-teacher',
		'champagne',
		'charging-station',
		'chart-bar',
		'chart-bar-horizontal',
		'chart-donut',
		'chart-line',
		'chart-line-down',
		'chart-line-up',
		'chart-pie',
		'chart-pie-slice',
		'chart-polar',
		'chart-scatter',
		'chat',
		'chat-centered',
		'chat-centered-dots',
		'chat-centered-slash',
		'chat-centered-text',
		'chat-circle',
		'chat-circle-dots',
		'chat-circle-slash',
		'chat-circle-text',
		'chat-dots',
		'chat-slash',
		'chat-teardrop',
		'chat-teardrop-dots',
		'chat-teardrop-slash',
		'chat-teardrop-text',
		'chat-text',
		'chats',
		'chats-circle',
		'chats-teardrop',
		'check',
		'check-circle',
		'check-fat',
		'check-square',
		'check-square-offset',
		'checkerboard',
		'checks',
		'cheers',
		'cheese',
		'chef-hat',
		'cherries',
		'church',
		'cigarette',
		'cigarette-slash',
		'circle',
		'circle-dashed',
		'circle-half',
		'circle-half-tilt',
		'circle-notch',
		'circles-four',
		'circles-three',
		'circles-three-plus',
		'circuitry',
		'city',
		'clipboard',
		'clipboard-text',
		'clock',
		'clock-afternoon',
		'clock-clockwise',
		'clock-countdown',
		'clock-counter-clockwise',
		'clock-user',
		'closed-captioning',
		'cloud',
		'cloud-arrow-down',
		'cloud-arrow-up',
		'cloud-check',
		'cloud-fog',
		'cloud-lightning',
		'cloud-moon',
		'cloud-rain',
		'cloud-slash',
		'cloud-snow',
		'cloud-sun',
		'cloud-warning',
		'cloud-x',
		'clover',
		'club',
		'coat-hanger',
		'coda-logo',
		'code',
		'code-block',
		'code-simple',
		'codepen-logo',
		'codesandbox-logo',
		'coffee',
		'coffee-bean',
		'coin',
		'coin-vertical',
		'coins',
		'columns',
		'columns-plus-left',
		'columns-plus-right',
		'command',
		'compass',
		'compass-rose',
		'compass-tool',
		'computer-tower',
		'confetti',
		'contactless-payment',
		'control',
		'cookie',
		'cooking-pot',
		'copy',
		'copy-simple',
		'copyleft',
		'copyright',
		'corners-in',
		'corners-out',
		'couch',
		'court-basketball',
		'cow',
		'cowboy-hat',
		'cpu',
		'crane',
		'crane-tower',
		'credit-card',
		'cricket',
		'crop',
		'cross',
		'crosshair',
		'crosshair-simple',
		'crown',
		'crown-cross',
		'crown-simple',
		'cube',
		'cube-focus',
		'cube-transparent',
		'currency-btc',
		'currency-circle-dollar',
		'currency-cny',
		'currency-dollar',
		'currency-dollar-simple',
		'currency-eth',
		'currency-eur',
		'currency-gbp',
		'currency-inr',
		'currency-jpy',
		'currency-krw',
		'currency-kzt',
		'currency-ngn',
		'currency-rub',
		'cursor',
		'cursor-click',
		'cursor-text',
		'cylinder',
		'database',
		'desk',
		'desktop',
		'desktop-tower',
		'detective',
		'dev-to-logo',
		'device-mobile',
		'device-mobile-camera',
		'device-mobile-slash',
		'device-mobile-speaker',
		'device-rotate',
		'device-tablet',
		'device-tablet-camera',
		'device-tablet-speaker',
		'devices',
		'diamond',
		'diamonds-four',
		'dice-five',
		'dice-four',
		'dice-one',
		'dice-six',
		'dice-three',
		'dice-two',
		'disc',
		'disco-ball',
		'discord-logo',
		'divide',
		'dna',
		'dog',
		'door',
		'door-open',
		'dot',
		'dot-outline',
		'dots-nine',
		'dots-six',
		'dots-six-vertical',
		'dots-three',
		'dots-three-circle',
		'dots-three-circle-vertical',
		'dots-three-outline',
		'dots-three-outline-vertical',
		'dots-three-vertical',
		'download',
		'download-simple',
		'dress',
		'dresser',
		'dribbble-logo',
		'drone',
		'drop',
		'drop-half',
		'drop-half-bottom',
		'drop-simple',
		'drop-slash',
		'dropbox-logo',
		'ear',
		'ear-slash',
		'egg',
		'egg-crack',
		'eject',
		'eject-simple',
		'elevator',
		'engine',
		'envelope',
		'envelope-open',
		'envelope-simple',
		'envelope-simple-open',
		'equalizer',
		'equals',
		'eraser',
		'escalator-down',
		'escalator-up',
		'exam',
		'exclamation-mark',
		'exclude',
		'exclude-square',
		'export',
		'eye',
		'eye-closed',
		'eye-slash',
		'eyedropper',
		'eyedropper-sample',
		'eyeglasses',
		'eyes',
		'face-mask',
		'facebook-logo',
		'factory',
		'faders',
		'faders-horizontal',
		'fallout-shelter',
		'fan',
		'farm',
		'fast-forward',
		'fast-forward-circle',
		'feather',
		'fediverse-logo',
		'figma-logo',
		'file',
		'file-archive',
		'file-arrow-down',
		'file-arrow-up',
		'file-audio',
		'file-c',
		'file-c-sharp',
		'file-cloud',
		'file-code',
		'file-cpp',
		'file-css',
		'file-csv',
		'file-dashed',
		'file-dotted',
		'file-doc',
		'file-html',
		'file-image',
		'file-ini',
		'file-jpg',
		'file-js',
		'file-jsx',
		'file-lock',
		'file-magnifying-glass',
		'file-search',
		'file-md',
		'file-minus',
		'file-pdf',
		'file-plus',
		'file-png',
		'file-ppt',
		'file-py',
		'file-rs',
		'file-sql',
		'file-svg',
		'file-text',
		'file-ts',
		'file-tsx',
		'file-txt',
		'file-video',
		'file-vue',
		'file-x',
		'file-xls',
		'file-zip',
		'files',
		'film-reel',
		'film-script',
		'film-slate',
		'film-strip',
		'fingerprint',
		'fingerprint-simple',
		'finn-the-human',
		'fire',
		'fire-extinguisher',
		'fire-simple',
		'fire-truck',
		'first-aid',
		'first-aid-kit',
		'fish',
		'fish-simple',
		'flag',
		'flag-banner',
		'flag-banner-fold',
		'flag-checkered',
		'flag-pennant',
		'flame',
		'flashlight',
		'flask',
		'flip-horizontal',
		'flip-vertical',
		'floppy-disk',
		'floppy-disk-back',
		'flow-arrow',
		'flower',
		'flower-lotus',
		'flower-tulip',
		'flying-saucer',
		'folder',
		'folder-notch',
		'folder-dashed',
		'folder-dotted',
		'folder-lock',
		'folder-minus',
		'folder-notch-minus',
		'folder-open',
		'folder-notch-open',
		'folder-plus',
		'folder-notch-plus',
		'folder-simple',
		'folder-simple-dashed',
		'folder-simple-dotted',
		'folder-simple-lock',
		'folder-simple-minus',
		'folder-simple-plus',
		'folder-simple-star',
		'folder-simple-user',
		'folder-star',
		'folder-user',
		'folders',
		'football',
		'football-helmet',
		'footprints',
		'fork-knife',
		'four-k',
		'frame-corners',
		'framer-logo',
		'function',
		'funnel',
		'funnel-simple',
		'funnel-simple-x',
		'funnel-x',
		'game-controller',
		'garage',
		'gas-can',
		'gas-pump',
		'gauge',
		'gavel',
		'gear',
		'gear-fine',
		'gear-six',
		'gender-female',
		'gender-intersex',
		'gender-male',
		'gender-neuter',
		'gender-nonbinary',
		'gender-transgender',
		'ghost',
		'gif',
		'gift',
		'git-branch',
		'git-commit',
		'git-diff',
		'git-fork',
		'git-merge',
		'git-pull-request',
		'github-logo',
		'gitlab-logo',
		'gitlab-logo-simple',
		'globe',
		'globe-hemisphere-east',
		'globe-hemisphere-west',
		'globe-simple',
		'globe-simple-x',
		'globe-stand',
		'globe-x',
		'goggles',
		'golf',
		'goodreads-logo',
		'google-cardboard-logo',
		'google-chrome-logo',
		'google-drive-logo',
		'google-logo',
		'google-photos-logo',
		'google-play-logo',
		'google-podcasts-logo',
		'gps',
		'gps-fix',
		'gps-slash',
		'gradient',
		'graduation-cap',
		'grains',
		'grains-slash',
		'graph',
		'graphics-card',
		'greater-than',
		'greater-than-or-equal',
		'grid-four',
		'grid-nine',
		'guitar',
		'hair-dryer',
		'hamburger',
		'hammer',
		'hand',
		'hand-arrow-down',
		'hand-arrow-up',
		'hand-coins',
		'hand-deposit',
		'hand-eye',
		'hand-fist',
		'hand-grabbing',
		'hand-heart',
		'hand-palm',
		'hand-peace',
		'hand-pointing',
		'hand-soap',
		'hand-swipe-left',
		'hand-swipe-right',
		'hand-tap',
		'hand-waving',
		'hand-withdraw',
		'handbag',
		'handbag-simple',
		'hands-clapping',
		'hands-praying',
		'handshake',
		'hard-drive',
		'hard-drives',
		'hard-hat',
		'hash',
		'hash-straight',
		'head-circuit',
		'headlights',
		'headphones',
		'headset',
		'heart',
		'heart-break',
		'heart-half',
		'heart-straight',
		'heart-straight-break',
		'heartbeat',
		'hexagon',
		'high-definition',
		'high-heel',
		'highlighter',
		'highlighter-circle',
		'hockey',
		'hoodie',
		'horse',
		'hospital',
		'hourglass',
		'hourglass-high',
		'hourglass-low',
		'hourglass-medium',
		'hourglass-simple',
		'hourglass-simple-high',
		'hourglass-simple-low',
		'hourglass-simple-medium',
		'house',
		'house-line',
		'house-simple',
		'hurricane',
		'ice-cream',
		'identification-badge',
		'identification-card',
		'image',
		'image-broken',
		'image-square',
		'images',
		'images-square',
		'infinity',
		'lemniscate',
		'info',
		'instagram-logo',
		'intersect',
		'intersect-square',
		'intersect-three',
		'intersection',
		'invoice',
		'island',
		'jar',
		'jar-label',
		'jeep',
		'joystick',
		'kanban',
		'key',
		'key-return',
		'keyboard',
		'keyhole',
		'knife',
		'ladder',
		'ladder-simple',
		'lamp',
		'lamp-pendant',
		'laptop',
		'lasso',
		'lastfm-logo',
		'layout',
		'leaf',
		'lectern',
		'lego',
		'lego-smiley',
		'less-than',
		'less-than-or-equal',
		'letter-circle-h',
		'letter-circle-p',
		'letter-circle-v',
		'lifebuoy',
		'lightbulb',
		'lightbulb-filament',
		'lighthouse',
		'lightning',
		'lightning-a',
		'lightning-slash',
		'line-segment',
		'line-segments',
		'line-vertical',
		'link',
		'link-break',
		'link-simple',
		'link-simple-break',
		'link-simple-horizontal',
		'link-simple-horizontal-break',
		'linkedin-logo',
		'linktree-logo',
		'linux-logo',
		'list',
		'list-bullets',
		'list-checks',
		'list-dashes',
		'list-heart',
		'list-magnifying-glass',
		'list-numbers',
		'list-plus',
		'list-star',
		'lock',
		'lock-key',
		'lock-key-open',
		'lock-laminated',
		'lock-laminated-open',
		'lock-open',
		'lock-simple',
		'lock-simple-open',
		'lockers',
		'log',
		'magic-wand',
		'magnet',
		'magnet-straight',
		'magnifying-glass',
		'magnifying-glass-minus',
		'magnifying-glass-plus',
		'mailbox',
		'map-pin',
		'map-pin-area',
		'map-pin-line',
		'map-pin-plus',
		'map-pin-simple',
		'map-pin-simple-area',
		'map-pin-simple-line',
		'map-trifold',
		'markdown-logo',
		'marker-circle',
		'martini',
		'mask-happy',
		'mask-sad',
		'mastodon-logo',
		'math-operations',
		'matrix-logo',
		'medal',
		'medal-military',
		'medium-logo',
		'megaphone',
		'megaphone-simple',
		'member-of',
		'memory',
		'messenger-logo',
		'meta-logo',
		'meteor',
		'metronome',
		'microphone',
		'microphone-slash',
		'microphone-stage',
		'microscope',
		'microsoft-excel-logo',
		'microsoft-outlook-logo',
		'microsoft-powerpoint-logo',
		'microsoft-teams-logo',
		'microsoft-word-logo',
		'minus',
		'minus-circle',
		'minus-square',
		'money',
		'money-wavy',
		'monitor',
		'monitor-arrow-up',
		'monitor-play',
		'moon',
		'moon-stars',
		'moped',
		'moped-front',
		'mosque',
		'motorcycle',
		'mountains',
		'mouse',
		'mouse-left-click',
		'mouse-middle-click',
		'mouse-right-click',
		'mouse-scroll',
		'mouse-simple',
		'music-note',
		'music-note-simple',
		'music-notes',
		'music-notes-minus',
		'music-notes-plus',
		'music-notes-simple',
		'navigation-arrow',
		'needle',
		'network',
		'network-slash',
		'network-x',
		'newspaper',
		'newspaper-clipping',
		'not-equals',
		'not-member-of',
		'not-subset-of',
		'not-superset-of',
		'notches',
		'note',
		'note-blank',
		'note-pencil',
		'notebook',
		'notepad',
		'notification',
		'notion-logo',
		'nuclear-plant',
		'number-circle-eight',
		'number-circle-five',
		'number-circle-four',
		'number-circle-nine',
		'number-circle-one',
		'number-circle-seven',
		'number-circle-six',
		'number-circle-three',
		'number-circle-two',
		'number-circle-zero',
		'number-eight',
		'number-five',
		'number-four',
		'number-nine',
		'number-one',
		'number-seven',
		'number-six',
		'number-square-eight',
		'number-square-five',
		'number-square-four',
		'number-square-nine',
		'number-square-one',
		'number-square-seven',
		'number-square-six',
		'number-square-three',
		'number-square-two',
		'number-square-zero',
		'number-three',
		'number-two',
		'number-zero',
		'numpad',
		'nut',
		'ny-times-logo',
		'octagon',
		'office-chair',
		'onigiri',
		'open-ai-logo',
		'option',
		'orange',
		'orange-slice',
		'oven',
		'package',
		'paint-brush',
		'paint-brush-broad',
		'paint-brush-household',
		'paint-bucket',
		'paint-roller',
		'palette',
		'panorama',
		'pants',
		'paper-plane',
		'paper-plane-right',
		'paper-plane-tilt',
		'paperclip',
		'paperclip-horizontal',
		'parachute',
		'paragraph',
		'parallelogram',
		'park',
		'password',
		'path',
		'patreon-logo',
		'pause',
		'pause-circle',
		'paw-print',
		'paypal-logo',
		'peace',
		'pen',
		'pen-nib',
		'pen-nib-straight',
		'pencil',
		'pencil-circle',
		'pencil-line',
		'pencil-ruler',
		'pencil-simple',
		'pencil-simple-line',
		'pencil-simple-slash',
		'pencil-slash',
		'pentagon',
		'pentagram',
		'pepper',
		'percent',
		'person',
		'person-arms-spread',
		'person-simple',
		'person-simple-bike',
		'person-simple-circle',
		'person-simple-hike',
		'person-simple-run',
		'person-simple-ski',
		'person-simple-snowboard',
		'person-simple-swim',
		'person-simple-tai-chi',
		'person-simple-throw',
		'person-simple-walk',
		'perspective',
		'phone',
		'phone-call',
		'phone-disconnect',
		'phone-incoming',
		'phone-list',
		'phone-outgoing',
		'phone-pause',
		'phone-plus',
		'phone-slash',
		'phone-transfer',
		'phone-x',
		'phosphor-logo',
		'pi',
		'piano-keys',
		'picnic-table',
		'picture-in-picture',
		'piggy-bank',
		'pill',
		'ping-pong',
		'pint-glass',
		'pinterest-logo',
		'pinwheel',
		'pipe',
		'pipe-wrench',
		'pix-logo',
		'pizza',
		'placeholder',
		'planet',
		'plant',
		'play',
		'play-circle',
		'play-pause',
		'playlist',
		'plug',
		'plug-charging',
		'plugs',
		'plugs-connected',
		'plus',
		'plus-circle',
		'plus-minus',
		'plus-square',
		'poker-chip',
		'police-car',
		'polygon',
		'popcorn',
		'popsicle',
		'potted-plant',
		'power',
		'prescription',
		'presentation',
		'presentation-chart',
		'printer',
		'prohibit',
		'prohibit-inset',
		'projector-screen',
		'projector-screen-chart',
		'pulse',
		'activity',
		'push-pin',
		'push-pin-simple',
		'push-pin-simple-slash',
		'push-pin-slash',
		'puzzle-piece',
		'qr-code',
		'question',
		'question-mark',
		'queue',
		'quotes',
		'rabbit',
		'racquet',
		'radical',
		'radio',
		'radio-button',
		'radioactive',
		'rainbow',
		'rainbow-cloud',
		'ranking',
		'read-cv-logo',
		'receipt',
		'receipt-x',
		'record',
		'rectangle',
		'rectangle-dashed',
		'recycle',
		'reddit-logo',
		'repeat',
		'repeat-once',
		'replit-logo',
		'resize',
		'rewind',
		'rewind-circle',
		'road-horizon',
		'robot',
		'rocket',
		'rocket-launch',
		'rows',
		'rows-plus-bottom',
		'rows-plus-top',
		'rss',
		'rss-simple',
		'rug',
		'ruler',
		'sailboat',
		'scales',
		'scan',
		'scan-smiley',
		'scissors',
		'scooter',
		'screencast',
		'screwdriver',
		'scribble',
		'scribble-loop',
		'scroll',
		'seal',
		'circle-wavy',
		'seal-check',
		'circle-wavy-check',
		'seal-percent',
		'circle-wavy-question',
		'seal-warning',
		'circle-wavy-warning',
		'seat',
		'seatbelt',
		'security-camera',
		'selection',
		'selection-all',
		'selection-background',
		'selection-foreground',
		'selection-inverse',
		'selection-plus',
		'selection-slash',
		'shapes',
		'share',
		'share-fat',
		'share-network',
		'shield',
		'shield-check',
		'shield-checkered',
		'shield-chevron',
		'shield-plus',
		'shield-slash',
		'shield-star',
		'shield-warning',
		'shipping-container',
		'shirt-folded',
		'shooting-star',
		'shopping-bag',
		'shopping-bag-open',
		'shopping-cart',
		'shopping-cart-simple',
		'shovel',
		'shower',
		'shrimp',
		'shuffle',
		'shuffle-angular',
		'shuffle-simple',
		'sidebar',
		'sidebar-simple',
		'sigma',
		'sign-in',
		'sign-out',
		'signature',
		'signpost',
		'sim-card',
		'siren',
		'sketch-logo',
		'skip-back',
		'skip-back-circle',
		'skip-forward',
		'skip-forward-circle',
		'skull',
		'skype-logo',
		'slack-logo',
		'sliders',
		'sliders-horizontal',
		'slideshow',
		'smiley',
		'smiley-angry',
		'smiley-blank',
		'smiley-meh',
		'smiley-melting',
		'smiley-nervous',
		'smiley-sad',
		'smiley-sticker',
		'smiley-wink',
		'smiley-x-eyes',
		'snapchat-logo',
		'sneaker',
		'sneaker-move',
		'snowflake',
		'soccer-ball',
		'sock',
		'solar-panel',
		'solar-roof',
		'sort-ascending',
		'sort-descending',
		'soundcloud-logo',
		'spade',
		'sparkle',
		'speaker-hifi',
		'speaker-high',
		'speaker-low',
		'speaker-none',
		'speaker-simple-high',
		'speaker-simple-low',
		'speaker-simple-none',
		'speaker-simple-slash',
		'speaker-simple-x',
		'speaker-slash',
		'speaker-x',
		'speedometer',
		'sphere',
		'spinner',
		'spinner-ball',
		'spinner-gap',
		'spiral',
		'split-horizontal',
		'split-vertical',
		'spotify-logo',
		'spray-bottle',
		'square',
		'square-half',
		'square-half-bottom',
		'square-logo',
		'square-split-horizontal',
		'square-split-vertical',
		'squares-four',
		'stack',
		'stack-minus',
		'stack-overflow-logo',
		'stack-plus',
		'stack-simple',
		'stairs',
		'stamp',
		'standard-definition',
		'star',
		'star-and-crescent',
		'star-four',
		'star-half',
		'star-of-david',
		'steam-logo',
		'steering-wheel',
		'steps',
		'stethoscope',
		'sticker',
		'stool',
		'stop',
		'stop-circle',
		'storefront',
		'strategy',
		'stripe-logo',
		'student',
		'subset-of',
		'subset-proper-of',
		'subtitles',
		'subtitles-slash',
		'subtract',
		'subtract-square',
		'subway',
		'suitcase',
		'suitcase-rolling',
		'suitcase-simple',
		'sun',
		'sun-dim',
		'sun-horizon',
		'sunglasses',
		'superset-of',
		'superset-proper-of',
		'swap',
		'swatches',
		'swimming-pool',
		'sword',
		'synagogue',
		'syringe',
		't-shirt',
		'table',
		'tabs',
		'tag',
		'tag-chevron',
		'tag-simple',
		'target',
		'taxi',
		'tea-bag',
		'telegram-logo',
		'television',
		'television-simple',
		'tennis-ball',
		'tent',
		'terminal',
		'terminal-window',
		'test-tube',
		'text-a-underline',
		'text-aa',
		'text-align-center',
		'text-align-justify',
		'text-align-left',
		'text-align-right',
		'text-b',
		'text-bolder',
		'text-columns',
		'text-h',
		'text-h-five',
		'text-h-four',
		'text-h-one',
		'text-h-six',
		'text-h-three',
		'text-h-two',
		'text-indent',
		'text-italic',
		'text-outdent',
		'text-strikethrough',
		'text-subscript',
		'text-superscript',
		'text-t',
		'text-t-slash',
		'text-underline',
		'textbox',
		'thermometer',
		'thermometer-cold',
		'thermometer-hot',
		'thermometer-simple',
		'threads-logo',
		'three-d',
		'thumbs-down',
		'thumbs-up',
		'ticket',
		'tidal-logo',
		'tiktok-logo',
		'tilde',
		'timer',
		'tip-jar',
		'tipi',
		'tire',
		'toggle-left',
		'toggle-right',
		'toilet',
		'toilet-paper',
		'toolbox',
		'tooth',
		'tornado',
		'tote',
		'tote-simple',
		'towel',
		'tractor',
		'trademark',
		'trademark-registered',
		'traffic-cone',
		'traffic-sign',
		'traffic-signal',
		'train',
		'train-regional',
		'train-simple',
		'tram',
		'translate',
		'trash',
		'trash-simple',
		'tray',
		'tray-arrow-down',
		'archive-tray',
		'tray-arrow-up',
		'treasure-chest',
		'tree',
		'tree-evergreen',
		'tree-palm',
		'tree-structure',
		'tree-view',
		'trend-down',
		'trend-up',
		'triangle',
		'triangle-dashed',
		'trolley',
		'trolley-suitcase',
		'trophy',
		'truck',
		'truck-trailer',
		'tumblr-logo',
		'twitch-logo',
		'twitter-logo',
		'umbrella',
		'umbrella-simple',
		'union',
		'unite',
		'unite-square',
		'upload',
		'upload-simple',
		'usb',
		'user',
		'user-check',
		'user-circle',
		'user-circle-check',
		'user-circle-dashed',
		'user-circle-gear',
		'user-circle-minus',
		'user-circle-plus',
		'user-focus',
		'user-gear',
		'user-list',
		'user-minus',
		'user-plus',
		'user-rectangle',
		'user-sound',
		'user-square',
		'user-switch',
		'users',
		'users-four',
		'users-three',
		'van',
		'vault',
		'vector-three',
		'vector-two',
		'vibrate',
		'video',
		'video-camera',
		'video-camera-slash',
		'video-conference',
		'vignette',
		'vinyl-record',
		'virtual-reality',
		'virus',
		'visor',
		'voicemail',
		'volleyball',
		'wall',
		'wallet',
		'warehouse',
		'warning',
		'warning-circle',
		'warning-diamond',
		'warning-octagon',
		'washing-machine',
		'watch',
		'wave-sawtooth',
		'wave-sine',
		'wave-square',
		'wave-triangle',
		'waveform',
		'waveform-slash',
		'waves',
		'webcam',
		'webcam-slash',
		'webhooks-logo',
		'wechat-logo',
		'whatsapp-logo',
		'wheelchair',
		'wheelchair-motion',
		'wifi-high',
		'wifi-low',
		'wifi-medium',
		'wifi-none',
		'wifi-slash',
		'wifi-x',
		'wind',
		'windmill',
		'windows-logo',
		'wine',
		'wrench',
		'x',
		'x-circle',
		'x-square',
		'yarn',
		'yin-yang',
		'youtube-logo'
	],
	business: [
		'briefcase',
		'briefcase-fill',
		'building',
		'building-fill',
		'chart-bar',
		'chart-bar-fill',
		'chart-line',
		'chart-line-fill',
		'currency-dollar',
		'currency-dollar-fill',
		'presentation',
		'presentation-fill',
		'users',
		'users-fill'
	],
	communication: [
		'chat',
		'chat-fill',
		'envelope',
		'envelope-fill',
		'phone',
		'phone-fill',
		'video-camera',
		'video-camera-fill',
		'microphone',
		'microphone-fill',
		'speaker',
		'speaker-fill'
	],
	design: [
		'palette',
		'palette-fill',
		'paint-brush',
		'paint-brush-fill',
		'scissors',
		'scissors-fill',
		'crop',
		'crop-fill'
	],
	development: [
		'code',
		'code-fill',
		'terminal',
		'terminal-fill',
		'bug',
		'bug-fill',
		'git-branch',
		'git-branch-fill'
	],
	document: [
		'file',
		'file-fill',
		'file-text',
		'file-text-fill',
		'file-pdf',
		'file-pdf-fill',
		'folder',
		'folder-fill'
	],
	editor: [
		'pencil',
		'pencil-fill',
		'text-b',
		'text-b-fill',
		'text-italic',
		'text-italic-fill',
		'list',
		'list-fill'
	],
	finance: [
		'currency-dollar',
		'currency-dollar-fill',
		'credit-card',
		'credit-card-fill',
		'bank',
		'bank-fill'
	],
	health: ['heart', 'heart-fill', 'stethoscope', 'stethoscope-fill', 'pill', 'pill-fill'],
	logistics: ['truck', 'truck-fill', 'package', 'package-fill', 'map-pin', 'map-pin-fill'],
	map: ['map', 'map-fill', 'map-pin', 'map-pin-fill', 'navigation', 'navigation-fill'],
	media: [
		'play',
		'play-fill',
		'pause',
		'pause-fill',
		'stop',
		'stop-fill',
		'image',
		'image-fill',
		'video-camera',
		'video-camera-fill'
	],
	system: ['gear', 'gear-fill', 'settings', 'settings-fill', 'cog', 'cog-fill'],
	user: ['user', 'user-fill', 'users', 'users-fill', 'user-circle', 'user-circle-fill'],
	weather: ['sun', 'sun-fill', 'cloud', 'cloud-fill', 'rain', 'rain-fill', 'snow', 'snow-fill']
};

// --- Popup entry (control icon vs focus) ---

let controlIconGesture = false;
let openOnEnter = false;

/** Mark an in-progress control-icon press so focusin does not auto-open the popup. */
export function beginControlIconGesture(): void {
	controlIconGesture = true;
}

export function endControlIconGesture(): void {
	controlIconGesture = false;
}

/** Popup should open when entering edit via focus/tab/body click (not control icon). */
export function requestOpenOnEnter(): void {
	if (!controlIconGesture) {
		openOnEnter = true;
	}
}

/** Popup should open when entering edit via the control icon. */
export function requestIconOpenOnEnter(): void {
	openOnEnter = true;
}

export function consumeOpenOnEnter(): boolean {
	const shouldOpen = openOnEnter;
	openOnEnter = false;
	return shouldOpen;
}
