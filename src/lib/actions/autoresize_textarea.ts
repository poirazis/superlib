function resize(target: HTMLTextAreaElement) {
	target.style.height = '1px';
	target.style.height = `${target.scrollHeight}px`;
}

export default function autoresizeTextarea(el: HTMLTextAreaElement) {
	resize(el);
	el.style.overflow = 'hidden';
	el.addEventListener('input', () => resize(el));

	return {
		destroy: () => el.removeEventListener('input', () => resize(el))
	};
}