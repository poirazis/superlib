/**
 * Tooltip action - shows a styled tooltip on hover when element text is truncated
 * Usage: use:tooltip={'Full text here'}
 */

interface TooltipOptions {
	text?: string;
	delay?: number;
	whenTruncated?: boolean;
}

let activeTooltip: HTMLElement | null = null;
let tooltipTimer: ReturnType<typeof setTimeout> | null = null;
let stylesheetInjected = false;

function injectStyles() {
	if (stylesheetInjected) return;
	stylesheetInjected = true;

	const style = document.createElement('style');
	style.textContent = `
		.tooltip-popup {
      background: var(--spectrum-global-color-gray-700);
      color: var(--spectrum-global-color-gray-50);
			position: fixed !important;
			z-index: 10000 !important;
			max-width: 20rem;
			padding: 0.35rem 0.5rem;
			border-radius: 0.25rem;
			font-family: 'inter', sans-serif;
			font-size: 11px;
			line-height: 1.35;
			white-space: normal;
			word-break: break-word;
			overflow-wrap: break-word;
			box-shadow: 0 2px 8px rgb(0 0 0 / 0.18);
			pointer-events: none;
			display: block !important;
			visibility: visible !important;
			opacity: 1 !important;
		}
	`;
	document.head.appendChild(style);
}

function createTooltipElement() {
	const tooltip = document.createElement('div');
	tooltip.className = 'tooltip-popup';
	tooltip.setAttribute('role', 'tooltip');

	// Mount to app-root or fallback to body
	const appRoot = document.getElementById('app-root') || document.body;
	appRoot.appendChild(tooltip);
	return tooltip;
}

function showTooltip(element: HTMLElement, text: string, delay = 500, whenTruncated = true) {
	// Check if truncated (unless whenTruncated is false)
	if (whenTruncated && element.scrollWidth <= element.offsetWidth) {
		return;
	}

	if (tooltipTimer) clearTimeout(tooltipTimer);

	tooltipTimer = setTimeout(() => {
		// Remove previous tooltip
		if (activeTooltip) {
			activeTooltip.remove();
		}

		// Create and position new tooltip
		const tooltip = createTooltipElement();
		tooltip.textContent = text;

		// Position relative to viewport
		const rect = element.getBoundingClientRect();
		const top = window.scrollY + rect.bottom + 4;
		const left = window.scrollX + rect.left;

		tooltip.style.top = `${top}px`;
		tooltip.style.left = `${left}px`;

		activeTooltip = tooltip;
	}, delay);
}

function hideTooltip() {
	if (tooltipTimer) {
		clearTimeout(tooltipTimer);
		tooltipTimer = null;
	}

	if (activeTooltip) {
		activeTooltip.remove();
		activeTooltip = null;
	}
}

export function tooltip(element: HTMLElement, options?: string | TooltipOptions) {
	injectStyles();

	let text = '';
	let delay = 500;
	let whenTruncated = true;

	if (typeof options === 'string') {
		text = options;
	} else if (options) {
		text = options.text ?? '';
		delay = options.delay ?? 500;
		whenTruncated = options.whenTruncated ?? true;
	}

	const handleMouseenter = () => {
		// Use provided text or fallback to element's text content
		const tooltipText = text || element.textContent || '';

		if (!tooltipText) {
			return; // Don't show tooltip if no text available
		}

		showTooltip(element, tooltipText, delay, whenTruncated);
	};
	const handleMouseleave = hideTooltip;

	element.addEventListener('mouseenter', handleMouseenter);
	element.addEventListener('mouseleave', handleMouseleave);

	return {
		destroy() {
			element.removeEventListener('mouseenter', handleMouseenter);
			element.removeEventListener('mouseleave', handleMouseleave);
			hideTooltip();
		}
	};
}
