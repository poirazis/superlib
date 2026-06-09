export const OPTIONS_COLORS_ARRAY = [
	'hsla(175, 90%, 75%, 0.35)',
	'hsla(25, 90%, 75%, 0.35)',
	'hsla(340, 85%, 72%, 0.35)',
	'hsla(75, 80%, 75%, 0.35)',
	'hsla(265, 85%, 70%, 0.35)',
	'hsla(125, 90%, 75%, 0.35)',
	'hsla(0, 90%, 75%, 0.35)',
	'hsla(225, 90%, 75%, 0.35)',
	'hsla(100, 80%, 75%, 0.35)',
	'hsla(315, 85%, 70%, 0.35)',
	'hsla(50, 80%, 75%, 0.35)',
	'hsla(165, 85%, 70%, 0.35)',
	'hsla(200, 90%, 75%, 0.35)',
	'hsla(290, 85%, 72%, 0.35)',
	'hsla(85, 85%, 72%, 0.35)',
	'hsla(140, 85%, 72%, 0.35)',
	'hsla(250, 90%, 75%, 0.35)',
	'hsla(35, 85%, 72%, 0.35)',
	'hsla(190, 85%, 72%, 0.35)',
	'hsla(350, 90%, 75%, 0.35)',
	'hsla(60, 85%, 70%, 0.35)',
	'hsla(150, 90%, 75%, 0.35)',
	'hsla(300, 90%, 75%, 0.35)',
	'hsla(10, 85%, 70%, 0.35)',
	'hsla(215, 85%, 70%, 0.35)',
	'hsla(325, 90%, 75%, 0.35)',
	'hsla(115, 85%, 70%, 0.35)',
	'hsla(240, 85%, 72%, 0.35)',
	'hsla(275, 90%, 75%, 0.35)'
] as const;

export function buildOptionColorMap(
	options: string[],
	optionColors: Record<string, string>,
	skipPalette = false
) {
	const obj: Record<string, string> = {};
	if (skipPalette) return obj;

	options.forEach(
		(option, index) =>
			(obj[option] =
				optionColors[option] ?? OPTIONS_COLORS_ARRAY[index % OPTIONS_COLORS_ARRAY.length])
	);
	return obj;
}
