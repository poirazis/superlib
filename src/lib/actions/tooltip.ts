/**
 * Tooltip action - shows a styled tooltip on hover when element text is truncated
 * Usage: use:tooltip={'Full text here'}
 * Usage: use:tooltip={{ text: 'Help', position: 'below-start' }}
 */

export type TooltipPosition =
	| 'above-center'
	| 'above-start'
	| 'above-end'
	| 'below-center'
	| 'below-start'
	| 'below-end';

export interface TooltipOptions {
	text?: string;
	delay?: number;
	whenTruncated?: boolean;
	enabled?: boolean;
	position?: TooltipPosition;
}

type TooltipParam = string | TooltipOptions | null | undefined;

interface TooltipConfig {
	active: boolean;
	text: string;
	delay: number;
	whenTruncated: boolean;
	position: TooltipPosition;
}

const TOOLTIP_GAP = 4;

function parseOptions(options: TooltipParam): TooltipConfig {
	if (options == null) {
		return {
			active: true,
			text: '',
			delay: 500,
			whenTruncated: true,
			position: 'above-center'
		};
	}

	if (typeof options === 'string') {
		return {
			active: options.length > 0,
			text: options,
			delay: 500,
			whenTruncated: false,
			position: 'above-center'
		};
	}

	if (options.enabled === false) {
		return {
			active: false,
			text: '',
			delay: 500,
			whenTruncated: true,
			position: 'above-center'
		};
	}

	return {
		active: true,
		text: options.text ?? '',
		delay: options.delay ?? 500,
		whenTruncated: options.whenTruncated ?? true,
		position: options.position ?? 'above-center'
	};
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

	const appRoot = document.getElementById('app-root') || document.body;
	appRoot.appendChild(tooltip);
	return tooltip;
}

function positionTooltip(tooltip: HTMLElement, anchor: DOMRect, position: TooltipPosition) {
	const tooltipRect = tooltip.getBoundingClientRect();
	const [vertical, horizontal] = position.split('-') as [
		'above' | 'below',
		'center' | 'start' | 'end'
	];

	let top =
		vertical === 'above'
			? anchor.top - tooltipRect.height - TOOLTIP_GAP
			: anchor.bottom + TOOLTIP_GAP;

	let left = anchor.left;
	if (horizontal === 'center') {
		left = anchor.left + (anchor.width - tooltipRect.width) / 2;
	} else if (horizontal === 'end') {
		left = anchor.right - tooltipRect.width;
	}

	const maxLeft = window.innerWidth - tooltipRect.width - TOOLTIP_GAP;
	const maxTop = window.innerHeight - tooltipRect.height - TOOLTIP_GAP;

	tooltip.style.top = `${Math.max(TOOLTIP_GAP, Math.min(top, maxTop))}px`;
	tooltip.style.left = `${Math.max(TOOLTIP_GAP, Math.min(left, maxLeft))}px`;
}

function showTooltip(
	element: HTMLElement,
	text: string,
	delay = 500,
	whenTruncated = true,
	position: TooltipPosition = 'above-center'
) {
	if (whenTruncated && element.scrollWidth <= element.offsetWidth) {
		return;
	}

	if (tooltipTimer) clearTimeout(tooltipTimer);

	tooltipTimer = setTimeout(() => {
		if (activeTooltip) {
			activeTooltip.remove();
		}

		const tooltip = createTooltipElement();
		tooltip.textContent = text;

		const rect = element.getBoundingClientRect();
		positionTooltip(tooltip, rect, position);

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

export function tooltip(element: HTMLElement, options?: TooltipParam) {
	injectStyles();

	let config = parseOptions(options);
	let handleMouseenter: (() => void) | undefined;

	const detach = () => {
		if (handleMouseenter) {
			element.removeEventListener('mouseenter', handleMouseenter);
			handleMouseenter = undefined;
		}
		element.removeEventListener('mouseleave', hideTooltip);
		hideTooltip();
	};

	const attach = () => {
		detach();
		if (!config.active) return;

		handleMouseenter = () => {
			const tooltipText = config.whenTruncated
				? config.text || element.textContent || ''
				: config.text || '';
			if (!tooltipText) return;
			showTooltip(element, tooltipText, config.delay, config.whenTruncated, config.position);
		};

		element.addEventListener('mouseenter', handleMouseenter);
		element.addEventListener('mouseleave', hideTooltip);
	};

	attach();

	return {
		update(newOptions: TooltipParam) {
			config = parseOptions(newOptions);
			attach();
		},
		destroy() {
			detach();
		}
	};
}
