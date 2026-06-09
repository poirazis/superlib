export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];

export type AttachmentItem = {
	name?: string;
	url?: string;
	extension?: string;
	[key: string]: unknown;
};

export function isImage(attachment: AttachmentItem | null | undefined) {
	return IMAGE_EXTENSIONS.includes(attachment?.extension?.toLowerCase() ?? '');
}

export function isMultiAttachment(fieldSchema: { type?: string } | null | undefined) {
	return fieldSchema?.type?.includes('single') !== true;
}

export function normalizeAttachments(
	value: AttachmentItem | AttachmentItem[] | null | undefined,
	multi: boolean
): AttachmentItem[] {
	if (!value) return [];
	if (multi) return Array.isArray(value) ? value : [value];
	return [value];
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

export function mapCellRole(role?: string) {
	if (role === 'inlineInput' || role === 'inline') return 'inline';
	if (role === 'tableCell' || role === 'cell') return 'cell';
	return 'form';
}

export function attachmentCopyText(attachments: AttachmentItem[] | null | undefined): string {
	if (!attachments?.length) return '';
	return attachments
		.map((item) => item?.name || item?.url || '')
		.filter(Boolean)
		.join(', ');
}
