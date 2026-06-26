const DEFAULT_PORTAL_TARGET_ID = 'app-body';

export function resolvePortalTarget(target?: string | HTMLElement | null): HTMLElement {
	if (target instanceof HTMLElement) {
		return target;
	}

	if (typeof target === 'string' && target.length > 0) {
		return document.querySelector<HTMLElement>(target) ?? document.body;
	}

	return document.getElementById(DEFAULT_PORTAL_TARGET_ID) ?? document.body;
}

export function portalNode(node: HTMLElement, target: HTMLElement, home: HTMLElement): void {
	const destination = target ?? home;
	if (node.parentElement !== destination) {
		destination.appendChild(node);
	}
}

export function restoreNode(node: HTMLElement, home: HTMLElement): void {
	if (node.parentElement !== home) {
		home.appendChild(node);
	}
}
