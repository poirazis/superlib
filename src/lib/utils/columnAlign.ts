const RIGHT_ALIGNED_TYPES = new Set(['number', 'bigint']);
const CENTER_ALIGNED_TYPES = new Set(['boolean']);

export function isUnsetColumnAlign(align?: string | null) {
	if (align == null || align === '') {
		return true;
	}

	return String(align).trim().toLowerCase() === 'default';
}

/** Raw align from columnList / column props before flex resolution. */
export function resolveRawColumnAlign(
	schemaType?: string,
	align?: string | null
): string | null | undefined {
	return isUnsetColumnAlign(align) ? align ?? null : align;
}

/** Budibase columnList uses Left/Center/Right; SuperTableColumn uses flex-start/center/flex-end. */
export function normalizeColumnAlignInput(align?: string | null): string | null | undefined {
	if (isUnsetColumnAlign(align)) {
		return align ?? null;
	}

	const token = String(align).trim().toLowerCase();

	switch (token) {
		case 'left':
		case 'flex-start':
		case 'start':
			return 'flex-start';
		case 'center':
			return 'center';
		case 'right':
		case 'flex-end':
		case 'end':
			return 'flex-end';
		default:
			return align;
	}
}

export function resolveColumnFlexAlign(
	schemaType?: string,
	align?: string | null
): string {
	const normalized = normalizeColumnAlignInput(align);
	const type = schemaType ?? 'string';

	// Type defaults apply only when alignment was not set in columnList / builder.
	if (isUnsetColumnAlign(normalized)) {
		if (RIGHT_ALIGNED_TYPES.has(type)) {
			return 'flex-end';
		}

		if (CENTER_ALIGNED_TYPES.has(type)) {
			return 'center';
		}

		return 'flex-start';
	}

	return normalized!;
}

export type CellTextAlign = 'left' | 'center' | 'right';

export function cellAlignToJustify(align?: CellTextAlign | string | null): string {
	switch (align) {
		case 'center':
			return 'center';
		case 'right':
			return 'flex-end';
		default:
			return 'flex-start';
	}
}

export function flexAlignToCellAlign(align?: string | null): CellTextAlign {
	const normalized = normalizeColumnAlignInput(align);

	switch (normalized) {
		case 'flex-end':
		case 'end':
		case 'right':
			return 'right';
		case 'center':
			return 'center';
		default:
			return 'left';
	}
}

export function resolveColumnCellAlign(
	schemaType?: string,
	align?: string | null
): 'left' | 'center' | 'right' {
	return flexAlignToCellAlign(resolveColumnFlexAlign(schemaType, align));
}

export function resolveColumnCellAlignFromOptions(
	schemaType?: string,
	columnOptions?: {
		columnAlign?: string | null;
		align?: string | null;
	}
): 'left' | 'center' | 'right' {
	// Use the raw columnList value when present so numeric defaults do not
	// read an already-resolved flex align from columnOptions.align.
	const rawAlign =
		columnOptions != null && 'columnAlign' in columnOptions
			? columnOptions.columnAlign
			: columnOptions?.align;

	return resolveColumnCellAlign(schemaType, rawAlign);
}