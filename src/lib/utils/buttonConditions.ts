type ProcessStringSync = (value: string, context: Record<string, unknown>) => unknown;

type QueryUtilsType = {
	buildQuery: (conditions: unknown[]) => { onEmptyFilter?: string };
	runQuery: (conditions: unknown[], query: { onEmptyFilter?: string }) => unknown[];
};

type EnrichButtonActions = (
	actions: unknown,
	context: Record<string, unknown>
) => (() => Promise<void>) | undefined;

export type ButtonCondition = {
	id?: string;
	action?: 'show' | 'hide' | 'update';
	setting?: string;
	settingValue?: unknown;
	referenceValue?: unknown;
	newValue?: unknown;
	valueType?: 'string' | 'number' | 'datetime' | 'boolean';
	operator?: string;
	type?: string;
};

export type ConfiguredButton = Record<string, unknown> & {
	conditions?: ButtonCondition[];
	_conditions?: ButtonCondition[];
	disabledTemplate?: string;
	onClick?: unknown;
	icon?: string;
};

export type ButtonConditionsSdk = {
	QueryUtils: QueryUtilsType;
	processStringSync: ProcessStringSync;
	enrichButtonActions: EnrichButtonActions;
};

export type ResolveConfiguredButtonsOptions = {
	forceDisabled?: boolean;
};

const EMPTY_FILTER_RETURN_NONE = 'none';

const BINDING_PROPS = ['text', 'tooltip'] as const;

export const enrichButtonConditions = (
	conditions: ButtonCondition[] | undefined,
	context: Record<string, unknown>,
	processStringSync: ProcessStringSync
): ButtonCondition[] | undefined => {
	return conditions?.map((condition) => ({
		...condition,
		referenceValue: processStringSync(String(condition.referenceValue ?? ''), context),
		newValue: processStringSync(String(condition.newValue ?? ''), context)
	}));
};

export const getActiveConditions = (
	conditions: ButtonCondition[] | undefined,
	QueryUtils: QueryUtilsType
): ButtonCondition[] => {
	if (!conditions?.length) {
		return [];
	}

	return conditions.filter((condition) => {
		const parsed = { ...condition };

		if (parsed.valueType === 'number') {
			parsed.referenceValue = parseFloat(String(parsed.referenceValue));
			parsed.newValue = parseFloat(String(parsed.newValue));
		} else if (parsed.valueType === 'datetime') {
			if (parsed.referenceValue) {
				parsed.referenceValue = new Date(String(parsed.referenceValue)).toISOString();
			}
			if (parsed.newValue) {
				parsed.newValue = new Date(String(parsed.newValue)).toISOString();
			}
		} else if (parsed.valueType === 'boolean') {
			parsed.referenceValue = `${parsed.referenceValue}`.toLowerCase() === 'true';
			parsed.newValue = `${parsed.newValue}`.toLowerCase() === 'true';
		}

		const luceneCondition = {
			...parsed,
			type: parsed.valueType,
			field: 'newValue',
			value: parsed.referenceValue
		};

		const query = QueryUtils.buildQuery([luceneCondition]);
		query.onEmptyFilter = EMPTY_FILTER_RETURN_NONE;
		const result = QueryUtils.runQuery([luceneCondition], query);
		return result.length > 0;
	});
};

export const reduceConditionActions = (conditions: ButtonCondition[] | undefined) => {
	const settingUpdates: Record<string, unknown> = {};
	let visible: boolean | null = null;

	conditions?.forEach((condition) => {
		if (condition.action === 'show') {
			visible = true;
		} else if (condition.action === 'hide') {
			visible = false;
		} else if (condition.setting) {
			settingUpdates[condition.setting] = condition.settingValue;
		}
	});

	return { settingUpdates, visible };
};

export const evaluateButtonConditions = (
	conditions: ButtonCondition[] | undefined,
	QueryUtils: QueryUtilsType
) => {
	if (!conditions?.length) {
		return { visible: true, settingUpdates: {} as Record<string, unknown> };
	}

	let visible = !conditions.find((condition) => condition.action === 'show');
	const activeConditions = getActiveConditions(conditions, QueryUtils);
	const result = reduceConditionActions(activeConditions);

	if (result.visible != null) {
		visible = result.visible;
	}

	return { visible, settingUpdates: result.settingUpdates };
};

const enrichStringProp = (
	value: unknown,
	context: Record<string, unknown>,
	processStringSync: ProcessStringSync
) => {
	if (typeof value !== 'string' || !value.includes('{{')) {
		return value;
	}
	return processStringSync(value, context);
};

const resolveConfiguredButton = (
	button: ConfiguredButton,
	context: Record<string, unknown>,
	sdk: ButtonConditionsSdk,
	options: ResolveConfiguredButtonsOptions = {}
) => {
	const { QueryUtils, processStringSync, enrichButtonActions } = sdk;
	const rawConditions = button._conditions ?? button.conditions;
	const enrichedConditions = enrichButtonConditions(rawConditions, context, processStringSync);
	const { visible, settingUpdates } = evaluateButtonConditions(enrichedConditions, QueryUtils);

	if (!visible) {
		return null;
	}

	const { conditions: _conditions, _conditions: __conditions, disabledTemplate, onClick, icon, ...rest } =
		button;

	const resolved: Record<string, unknown> = {
		...rest,
		...settingUpdates
	};

	for (const prop of BINDING_PROPS) {
		if (prop in resolved) {
			resolved[prop] = enrichStringProp(resolved[prop], context, processStringSync);
		}
	}

	if (icon) {
		resolved.icon = icon.startsWith('ph ') ? icon : `ph ph-${icon}`;
	}

	const templateDisabled = processStringSync(disabledTemplate ?? '', context) === true;
	resolved.disabled = Boolean(resolved.disabled) || templateDisabled || Boolean(options.forceDisabled);
	resolved.onClick = enrichButtonActions(onClick, context);

	return resolved;
};

export const resolveConfiguredButtons = (
	buttons: ConfiguredButton[] | undefined,
	context: Record<string, unknown>,
	sdk: ButtonConditionsSdk,
	options: ResolveConfiguredButtonsOptions = {}
): Record<string, unknown>[] => {
	if (!buttons?.length) {
		return [];
	}

	return buttons
		.map((button) => resolveConfiguredButton(button, context, sdk, options))
		.filter((button): button is Record<string, unknown> => button != null);
};