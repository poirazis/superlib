export type CarbonChartRow = {
	group: string;
	label: string;
	value: number;
};

export function normalizeValueColumns(
	valueColumn: string | string[] | null | undefined
): string[] {
	if (!valueColumn) return [];
	if (Array.isArray(valueColumn)) {
		return valueColumn.map((col) => String(col).trim()).filter(Boolean);
	}
	if (typeof valueColumn === 'string') {
		const trimmed = valueColumn.trim();
		return trimmed ? [trimmed] : [];
	}
	return [];
}

export function mapRowsToCarbonData(
	rows: Record<string, unknown>[] | undefined,
	chartType: string,
	labelColumn: string,
	valueColumn: string | string[] | null | undefined,
): CarbonChartRow[] {
	const valueColumns = normalizeValueColumns(valueColumn);
	if (!labelColumn || !valueColumns.length || !rows?.length) return [];

	const mappedData: CarbonChartRow[] = [];

	for (const row of rows) {
		const label = String(row[labelColumn]);

		if (
			chartType === 'pieChart' ||
			chartType === 'donutChart' ||
			chartType === 'meterChart'
		) {
			mappedData.push({
				group: label,
				label,
				value: Number(row[valueColumns[0]]) || 0
			});
		} else {
			for (const col of valueColumns) {
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