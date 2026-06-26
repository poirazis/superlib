import type { ComponentCondition, EmptyFilterOption, SearchFilters } from '@budibase/types';

type ProcessStringSync = (value: string, context: Record<string, unknown>) => unknown;

type QueryUtilsType = {
	buildQuery: (conditions: unknown[]) => SearchFilters;
	runQuery: (conditions: unknown[], query: SearchFilters) => unknown[];
};

/** Shape passed to QueryUtils; must include enriched newValue on the doc row. */
type ButtonLuceneCondition = Record<string, unknown> & {
	type?: string;
	field: string;
	value: unknown;
};

type EnrichButtonActions = (
	actions: unknown,
	context: Record<string, unknown>
) => (() => Promise<void>) | undefined;

/** Budibase component condition; kept partial for in-progress builder state. */
export type ButtonCondition = Partial<ComponentCondition>;

export type ConfiguredButton = Record<string, unknown> & {
	conditions?: ButtonCondition[];
	_conditions?: ButtonCondition[];
	disabledTemplate?: string;
	onClick?: unknown;
	icon?: string;
};

/** Minimum sdk fields required for button resolution. */
export type ButtonConditionsSdk = {
	QueryUtils: QueryUtilsType;
	processStringSync: ProcessStringSync;
	enrichButtonActions: EnrichButtonActions;
};

/** Budibase client SDK — pass directly from getContext("sdk"). */
export type BudibaseSdk = ButtonConditionsSdk & Record<string, unknown>;

export type ResolveConfiguredButtonsOptions = {
	forceDisabled?: boolean;
};

const EMPTY_FILTER_RETURN_NONE = 'none' as EmptyFilterOption;

const BINDING_PROPS = ['text', 'tooltip'] as const;

export const getEnabledConditions = (
	conditions: ButtonCondition[] | undefined
): ButtonCondition[] => {
	return conditions?.filter((condition) => !condition.disabled) ?? [];
};

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
		if (condition.disabled) {
			return false;
		}

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

		// Spread parsed so newValue (the live binding value) is on the doc row
		// that QueryUtils.runQuery evaluates against.
		const luceneCondition: ButtonLuceneCondition = {
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

	const enabledConditions = getEnabledConditions(conditions);

	let visible = !enabledConditions.find((condition) => condition.action === 'show');
	const activeConditions = getActiveConditions(enabledConditions, QueryUtils);
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
	sdk: BudibaseSdk,
	options: ResolveConfiguredButtonsOptions = {}
) => {
	const { QueryUtils, processStringSync, enrichButtonActions } = sdk;
	const rawConditions = button._conditions ?? button.conditions;
	const enrichedConditions = enrichButtonConditions(rawConditions, context, processStringSync);
	const { visible, settingUpdates } = evaluateButtonConditions(enrichedConditions, QueryUtils);

	if (!visible) {
		return null;
	}

	const {
		conditions: _conditions,
		_conditions: __conditions,
		disabledTemplate,
		onClick,
		onLoopStart,
		onLoopEvent,
		onLoopEnd,
		onTrueCondition,
		onFalseCondition,
		icon,
		...rest
	} = button;

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
	resolved.disabled =
		Boolean(resolved.disabled) || templateDisabled || Boolean(options.forceDisabled);
	resolved.onClick = enrichButtonActions(onClick, context);
	resolved.onLoopStart = enrichButtonActions(onLoopStart, context);
	resolved.onLoopEvent = enrichButtonActions(onLoopEvent, context);
	resolved.onLoopEnd = enrichButtonActions(onLoopEnd, context);
	resolved.onTrueCondition = enrichButtonActions(onTrueCondition, context);
	resolved.onFalseCondition = enrichButtonActions(onFalseCondition, context);

	return resolved;
};

/** Resolve nestable SuperButton children. Pass the full sdk from getContext("sdk"). */
export const resolveConfiguredButtons = (
	buttons: ConfiguredButton[] | undefined,
	context: Record<string, unknown>,
	sdk: BudibaseSdk,
	options: ResolveConfiguredButtonsOptions = {}
): Record<string, unknown>[] => {
	if (!buttons?.length) {
		return [];
	}

	return buttons
		.map((button) => resolveConfiguredButton(button, context, sdk, options))
		.filter((button): button is Record<string, unknown> => button != null);
};

export function normalizeMenuItemsVisible(value: unknown, defaultValue = 1) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return defaultValue;
	}

	return Math.floor(parsed);
}

export function splitRowMenuButtons<T>(
	buttons: T[] | undefined,
	menuItemsVisible: unknown
): { inlineButtons: T[]; overflowButtons: T[] } {
	const items = Array.isArray(buttons) ? buttons : [];
	const visibleCount = normalizeMenuItemsVisible(menuItemsVisible);

	if (visibleCount === 0) {
		return { inlineButtons: [], overflowButtons: items };
	}

	if (visibleCount >= items.length) {
		return { inlineButtons: items, overflowButtons: [] };
	}

	return {
		inlineButtons: items.slice(0, visibleCount),
		overflowButtons: items.slice(visibleCount)
	};
}

export function configuredButtonKey(
	button: Record<string, unknown> | undefined,
	index: number
) {
	const id = button?._id ?? button?.id;
	if (id != null && id !== '') {
		return String(id);
	}

	return `button-${index}`;
}
