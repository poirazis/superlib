export function getToolbarOptions(showToolbar: boolean) {
	return { enabled: showToolbar };
}

export function getZoomBarOptions(
	showZoombar: boolean,
	zoombarType: string,
	zoombarAxes = 'bottom'
) {
	return {
		[zoombarAxes]: {
			enabled: showZoombar,
			type: zoombarType
		}
	};
}

export function getLegendOptions(
	showLegend: boolean,
	legendPosition: string,
	legendAlign: string,
	legendClickable: boolean,
	defaultPosition = 'bottom'
) {
	const validPositions = ['top', 'bottom', 'left', 'right'];
	const validAlignments = ['start', 'center', 'end'];
	const orientation = ['top', 'bottom'].includes(legendPosition) ? 'horizontal' : 'vertical';

	return {
		enabled: showLegend,
		position: validPositions.includes(legendPosition) ? legendPosition : defaultPosition,
		orientation,
		alignment: validAlignments.includes(legendAlign) ? legendAlign : 'center',
		clickable: legendClickable
	};
}

export const spectrumChartPalette = [
	'#4CC8FFE6',
	'#6CCE6BE6',
	'#FF7066E6',
	'#FFB84CE6',
	'#C77DFFE6',
	'#4FD8CCE6',
	'#FF73A3E6',
	'#FFD666E6',
	'#4C6BFFE6',
	'#33BBFFE6',
	'#55C256E6',
	'#FF5C4DE6',
	'#FFAB33E6',
	'#B266FFE6',
	'#33CCC0E6',
	'#FF5C8CE6',
	'#FFCC33E6',
	'#3358FFE6',
	'#1AADFFE6',
	'#3FB540E6',
	'#FF4733E6',
	'#FF991AE6',
	'#9C4CFFE6',
	'#1AC0B4E6',
	'#FF4673E6',
	'#FFBF1AE6',
	'#1A45FFE6',
	'#009EFFE6',
	'#29A92AE6',
	'#FF331AE6',
	'#FF8A00E6',
	'#8633FFE6',
	'#00B4A8E6',
	'#FF305CE6',
	'#FFB200E6',
	'#0033FFE6'
];

export const sequentialBluePalette = [
	'var(--spectrum-global-color-blue-100)',
	'var(--spectrum-global-color-blue-200)',
	'var(--spectrum-global-color-blue-300)',
	'var(--spectrum-global-color-blue-400)',
	'var(--spectrum-global-color-blue-500)',
	'var(--spectrum-global-color-blue-600)',
	'var(--spectrum-global-color-blue-700)',
	'var(--spectrum-global-color-blue-800)',
	'var(--spectrum-global-color-blue-900)',
	'var(--spectrum-global-color-blue-1000)'
];

export const divergingPalette = [
	'var(--spectrum-global-color-red-600)',
	'var(--spectrum-global-color-red-400)',
	'var(--spectrum-global-color-gray-100)',
	'var(--spectrum-global-color-blue-400)',
	'var(--spectrum-global-color-blue-600)'
];

export function calculateTimeWindow(
	timeWindow: string,
	timeUnit: string,
	timeValue: number
): number {
	if (timeWindow === 'custom' && timeUnit && timeValue) {
		const unitMap: Record<string, number> = {
			minute: 60 * 1000,
			minutes: 60 * 1000,
			hour: 60 * 60 * 1000,
			hours: 60 * 60 * 1000,
			day: 24 * 60 * 60 * 1000,
			days: 24 * 60 * 60 * 1000,
			week: 7 * 24 * 60 * 60 * 1000,
			weeks: 7 * 24 * 60 * 60 * 1000,
			month: 30 * 24 * 60 * 60 * 1000,
			months: 30 * 24 * 60 * 60 * 1000,
			year: 365 * 24 * 60 * 60 * 1000,
			years: 365 * 24 * 60 * 60 * 1000
		};
		return timeValue * (unitMap[timeUnit] || 60 * 60 * 1000);
	}

	const cleanedWindow = timeWindow.replace(/\s+/g, '');
	const minuteMatch = cleanedWindow.match(/^(\d+)(m|min|minute|minutes)$/i);
	if (minuteMatch) return parseInt(minuteMatch[1], 10) * 60 * 1000;

	const hourMatch = cleanedWindow.match(/^(\d+)(h|hr|hour|hours)$/i);
	if (hourMatch) return parseInt(hourMatch[1], 10) * 60 * 60 * 1000;

	const dayMatch = cleanedWindow.match(/^(\d+)(d|day|days)$/i);
	if (dayMatch) return parseInt(dayMatch[1], 10) * 24 * 60 * 60 * 1000;

	const weekMatch = cleanedWindow.match(/^(\d+)(w|week|weeks)$/i);
	if (weekMatch) return parseInt(weekMatch[1], 10) * 7 * 24 * 60 * 60 * 1000;

	const monthMatch = cleanedWindow.match(/^(\d+)(mo|month|months)$/i);
	if (monthMatch) return parseInt(monthMatch[1], 10) * 30 * 24 * 60 * 60 * 1000;

	const yearMatch = cleanedWindow.match(/^(\d+)(y|yr|year|years)$/i);
	if (yearMatch) return parseInt(yearMatch[1], 10) * 365 * 24 * 60 * 60 * 1000;

	return 60 * 60 * 1000;
}
