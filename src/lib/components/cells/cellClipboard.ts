type FsmController = { goTo: (state: string) => void };

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