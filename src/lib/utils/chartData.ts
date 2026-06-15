export type CarbonChartRow = {
	group: string;
	label: string;
	value: number;
};

export function mapRowsToCarbonData(
	rows: Record<string, unknown>[] | undefined,
	chartType: string,
	labelColumn: string,
	valueColumn: string[],
): CarbonChartRow[] {
	if (!labelColumn || !valueColumn?.length || !rows?.length) return [];

	const mappedData: CarbonChartRow[] = [];

	for (const row of rows) {
		const label = String(row[labelColumn]);

		if (chartType === 'pieChart' || chartType === 'donutChart') {
			mappedData.push({
				group: label,
				label,
				value: Number(row[valueColumn[0]]) || 0
			});
		} else {
			for (const col of valueColumn) {
				mappedData.push({
					group: col,
					label,
					value: Number(row[col]) || 0
				});
			}
		}
	}

	return mappedData;
}

export function mapRowsToHeatmapData(
	rows: Record<string, unknown>[] | undefined,
	xAxisColumn: string,
	yAxisColumn: string,
	valueColumn: string
) {
	if (!rows?.length || !xAxisColumn || !yAxisColumn || !valueColumn) return [];

	return rows.map((row) => ({
		x: row[xAxisColumn],
		y: row[yAxisColumn],
		value: Number(row[valueColumn])
	}));
}

export function mapRowsToBubbleData(
	rows: Record<string, unknown>[] | undefined,
	xAxisColumn: string,
	yAxisColumn: string,
	valueColumn: string,
	groupColumn: string,
	sizeColumn: string
) {
	if (
		!rows?.length ||
		!xAxisColumn ||
		!yAxisColumn ||
		!valueColumn ||
		!groupColumn ||
		!sizeColumn
	) {
		return [];
	}

	return rows.map((row) => ({
		x: Number(row[xAxisColumn]),
		y: Number(row[yAxisColumn]),
		value: Number(row[valueColumn]),
		group: row[groupColumn],
		size: Number(row[sizeColumn])
	}));
}

export function mapRowsToTinyChartData(
	rows: Record<string, unknown>[] | undefined,
	labelColumn: string,
	valueColumn: string
): Record<string, number> {
	if (!rows?.length || !labelColumn || !valueColumn) return {};

	return rows.reduce<Record<string, number>>((acc, row) => {
		const label = String(row[labelColumn] ?? '');
		if (label) {
			acc[label] = Number(row[valueColumn]) || 0;
		}
		return acc;
	}, {});
}