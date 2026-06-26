import type { Writable } from 'svelte/store';
import {
	fieldComponentMap,
	getDefaultFieldComponent,
	specialFields
} from './formFieldMap.ts';
import { deriveActiveFields, resolveFieldInnerType } from './deriveActiveFields.ts';

export type FormBrainOptions = {
	getSchema: () => Record<string, unknown>;
	beautifyLabels?: boolean;
	useSpecialFields?: boolean;
	labelPosition?: string;
	optionsViewMode?: string;
	relViewMode?: string;
	actionType?: string;
	currentUserEmail?: string;
	getReactiveProps?: () => Record<string, unknown>;
};

const RESERVED_FIELD_PROP_KEYS = new Set(['exclude', 'children']);

function sanitizeFieldProps(field: Record<string, unknown>) {
	const sanitized = { ...field };
	for (const key of RESERVED_FIELD_PROP_KEYS) {
		delete sanitized[key];
	}
	return sanitized;
}

export function beautifyLabel(label: string | undefined, enabled = true): string | undefined {
	if (!enabled || !label) return label;

	const fields = label.split('.').map((field) => {
		const words = field.split('_').map((word) => {
			if (!word) return word;
			return word[0]?.toUpperCase() + word.slice(1);
		});
		return words.join(' ');
	});

	return fields.join(' - ');
}

export function createFormBrain(options: FormBrainOptions) {
	const {
		getSchema,
		beautifyLabels = true,
		useSpecialFields = true,
		labelPosition = 'top',
		optionsViewMode = 'bullets',
		relViewMode = 'text',
		actionType = 'Create',
		currentUserEmail,
		getReactiveProps
	} = options;

	const label = (value?: string) => beautifyLabel(value, beautifyLabels);

	const brain = {
		getComponentForField(field: { field?: string; name?: string }) {
			const schema = getSchema();
			const innerType = resolveFieldInnerType(schema as never, field, useSpecialFields);
			if (!innerType) return null;
			return fieldComponentMap[innerType] || getDefaultFieldComponent();
		},
		getPropsForField(field: Record<string, unknown>, _idx?: number | Record<string, unknown>) {
			const reactive = getReactiveProps?.() ?? {};
			const currentOptionsViewMode = (reactive.optionsViewMode as string) ?? optionsViewMode;
			const currentRelViewMode = (reactive.relViewMode as string) ?? relViewMode;
			const currentActionType = (reactive.actionType as string) ?? actionType;
			const currentUseSpecialFields =
				(reactive.useSpecialFields as boolean | undefined) ?? useSpecialFields;
			const currentShowDirty = (reactive.showDirty as boolean | undefined) ?? false;
			const fieldName = (field.field || field.name) as string;
			const schema = getSchema();
			const schemaField = fieldName.includes('.')
				? schema[fieldName.split('.')[0]]
				: schema[fieldName];
			const schemaFieldType = schemaField?.type as string | undefined;
			const readonlyFromSchema =
				schemaFieldType === 'formula' || Boolean(schemaField?.readonly);

			return {
				...sanitizeFieldProps(field),
				span: Number(field.span) || 6,
				label: label(field.label as string | undefined),
				labelPosition:
					field.labelPosition != null && field.labelPosition !== ''
						? field.labelPosition
						: 'fieldGroup',
				placeholder:
					currentActionType !== 'View' ? label(field.placeholder as string | undefined) : ' ',
				optionsViewMode: currentOptionsViewMode,
				relViewMode: currentRelViewMode,
				disabled: Boolean(field.disabled),
				readonly: Boolean(field.readonly) || readonlyFromSchema,
				autocomplete: field.autocomplete,
				showDirty: currentShowDirty,
				direction: field.direction === 'vertical' ? 'column' : 'row',
				invisible: currentUseSpecialFields && field.special,
				defaultValue:
					currentUseSpecialFields && brain.isSpecial(fieldName)
						? brain.enrichSpecialField(field, currentActionType)
						: field.defaultValue
			};
		},
		isSpecial(fieldName?: string) {
			return !!fieldName && specialFields.includes(fieldName);
		},
		enrichSpecialField(field: Record<string, unknown>, currentActionType = actionType) {
			const fieldName = field.field as string;
			if (currentActionType === 'Create' && fieldName === 'created_by') {
				return currentUserEmail || 'system';
			}
			if (currentActionType === 'Update' && fieldName === 'updated_by') {
				return currentUserEmail || 'system';
			}
			return undefined;
		},
		beautifyLabel: label,
		deriveActiveFields(
			fieldsStore: Array<Record<string, unknown>> | null | undefined,
			expandJsonFields = true
		) {
			const schema = getSchema();
			return deriveActiveFields(fieldsStore as never, schema as never, {
				beautifyLabel: label,
				useSpecialFields,
				expandJsonFields,
				currentUserEmail
			});
		},
		registerStep(
			steps: Writable<Array<Record<string, unknown>>>,
			section: Record<string, unknown>
		) {
			let resolvedOrder = 1;
			steps.update((currentSteps) => {
				const existingIndex = currentSteps.findIndex((s) => s.id == section.id);
				if (existingIndex >= 0) {
					resolvedOrder = existingIndex + 1;
					const next = [...currentSteps];
					next[existingIndex] = section;
					return next;
				}
				resolvedOrder = currentSteps.length + 1;
				return [...currentSteps, section];
			});
			return resolvedOrder;
		},
		unregisterStep(steps: Writable<Array<Record<string, unknown>>>, section: { id: unknown }) {
			steps.update((currentSteps) => currentSteps.filter((s) => s.id != section.id));
		},
		getReactiveProps: getReactiveProps ?? (() => ({}))
	};

	return brain;
}