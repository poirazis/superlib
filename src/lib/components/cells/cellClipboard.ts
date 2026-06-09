export function copyTextToClipboard(
	text: string,
	setJustCopied: (copied: boolean) => void
): void {
	navigator.clipboard
		.writeText(text)
		.then(() => {
			setJustCopied(true);
			setTimeout(() => setJustCopied(false), 400);
		})
		.catch((err) => {
			console.error('Failed to copy to clipboard:', err);
		});
}