export default function positionDropdown(element, opts) {
	let resizeObserver;
	let latestOpts = opts;
	let rafId = null;
	let lastAnchorRectKey = '';
	let anchorLostDispatched = false;

	const scrollUpdate = () => {
		updatePosition(latestOpts);
	};

	const formatRectKey = (rect) => `${rect.top},${rect.left},${rect.width},${rect.height}`;

	const trackAnchor = () => {
		const { anchor } = latestOpts;

		if (!anchor) {
			rafId = requestAnimationFrame(trackAnchor);
			return;
		}

		if (!anchor.isConnected) {
			if (!anchorLostDispatched) {
				anchorLostDispatched = true;
				element.dispatchEvent(new CustomEvent('anchorlost', { bubbles: false }));
			}
			return;
		}

		anchorLostDispatched = false;
		const rect = anchor.getBoundingClientRect();
		const key = formatRectKey(rect);
		if (key !== lastAnchorRectKey) {
			lastAnchorRectKey = key;
			updatePosition(latestOpts);
		}

		rafId = requestAnimationFrame(trackAnchor);
	};

	const updatePosition = (opts) => {
		const {
			anchor,
			align,
			maxHeight,
			maxWidth,
			minWidth = 0,
			useAnchorWidth,
			offset = 5,
			customUpdate,
			offsetBelow
		} = opts;
		if (!anchor || !anchor.isConnected) {
			return;
		}

		const anchorBounds = anchor.getBoundingClientRect();
		const elementBounds = element.getBoundingClientRect();
		let styles = {
			maxHeight: null,
			minWidth: null,
			maxWidth,
			left: null,
			top: null
		};

		if (typeof customUpdate === 'function') {
			styles = customUpdate(anchorBounds, elementBounds, styles);
		} else {
			if (align === 'right-outside' || align === 'left-outside') {
				styles.top = anchorBounds.top;
			} else if (window.innerHeight - anchorBounds.bottom < (maxHeight || 50)) {
				styles.top = anchorBounds.top - elementBounds.height - offset;
				styles.maxHeight = maxHeight || 240;
			} else {
				styles.top = anchorBounds.bottom + (offsetBelow || offset);
				styles.maxHeight = maxHeight || window.innerHeight - anchorBounds.bottom - 20;
			}

			if (!maxWidth && useAnchorWidth) {
				styles.maxWidth = anchorBounds.width;
			}
			if (useAnchorWidth) {
				styles.minWidth = Math.max(minWidth, anchorBounds.width);
			} else if (minWidth) {
				styles.minWidth = minWidth;
			}

			if (align === 'right') {
				styles.left = anchorBounds.left + anchorBounds.width - elementBounds.width;
			} else if (align === 'right-outside') {
				styles.left = anchorBounds.right + offset;
			} else if (align === 'left-outside') {
				styles.left = anchorBounds.left - elementBounds.width - offset;
			} else {
				styles.left = anchorBounds.left;
			}
		}

		Object.entries(styles).forEach(([style, value]) => {
			if (value != null) {
				element.style[style] = `${value.toFixed(0)}px`;
			} else {
				element.style[style] = null;
			}
		});
	};

	const update = (newOpts) => {
		latestOpts = newOpts;
		lastAnchorRectKey = '';

		if (resizeObserver) {
			resizeObserver.disconnect();
		}

		const { anchor } = newOpts;
		if (!anchor) {
			return;
		}

		resizeObserver = new ResizeObserver(() => updatePosition(newOpts));
		resizeObserver.observe(anchor);
		resizeObserver.observe(element);
		resizeObserver.observe(document.body);

		updatePosition(newOpts);
	};

	element.style.position = 'fixed';
	element.style.zIndex = '9999';

	document.addEventListener('scroll', scrollUpdate, true);

	update(opts);
	rafId = requestAnimationFrame(trackAnchor);

	return {
		update,
		destroy() {
			if (rafId) {
				cancelAnimationFrame(rafId);
				rafId = null;
			}
			if (resizeObserver) {
				resizeObserver.disconnect();
			}
			document.removeEventListener('scroll', scrollUpdate, true);
		}
	};
}
