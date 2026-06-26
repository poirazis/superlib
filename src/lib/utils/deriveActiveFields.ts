import { specialFields } from './formFieldMap.ts';

type SchemaField = {
	name: string;
	type?: string;
	subtype?: string;
	schema?: Record<string, SchemaField>;
	autocolumn?: boolean;
	readonly?: boolean;
	visible?: boolean;
	nestedJSON?: boolean;
	default?: unknown;
	label?: string;
	constraints?: { inclusion?: unknown[] };
};

type ConfiguredField = {
	field?: string;
	name?: string;
	label?: string;
	active?: boolean;
	placeholder?: string;
	order?: number;
	[key: string]: unknown;
};

type ActiveField = ConfiguredField & {
	name: string;
	special?: boolean;
	hidden?: boolean;
	readonly?: boolean;
	defaultValue?: unknown;
};

export type DeriveActiveFieldsOptions = {
	beautifyLabel: (label?: string) => string | undefined;
	useSpecialFields?: boolean;
	expandJsonFields?: boolean;
	currentUserEmail?: string;
};

function isSchemaFieldVisible(field: SchemaField) {
	return !field.autocolumn && field.visible !== false && !field.nestedJSON;
}

function resolveInnerType(field: SchemaField, fieldName: string): string {
	let innerType = field.type || 'string';
	const subtype = field.subtype;

	if (innerType === 'array') {
		if ((field.constraints?.inclusion?.length ?? 0) < 1 || subtype === 'array') {
			innerType = 'jsonarray';
		}
	}

	return innerType;
}

export function deriveActiveFields(
	fieldsStore: ConfiguredField[] | null | undefined,
	schemaStore: Record<string, SchemaField>,
	options: DeriveActiveFieldsOptions
): ActiveField[] {
	const {
		beautifyLabel,
		useSpecialFields = true,
		expandJsonFields = true,
		currentUserEmail
	} = options;

	if (!fieldsStore || !Array.isArray(fieldsStore) || fieldsStore.length === 0) {
		const schemaFields = Object.values(schemaStore || {}).filter(isSchemaFieldVisible);
		const expandedFields: ActiveField[] = [];

		schemaFields.forEach((field) => {
			if (expandJsonFields && field.type === 'json' && field.schema) {
				Object.keys(field.schema).forEach((key) => {
					const subField = field.schema?.[key];
					expandedFields.push({
						field: `${field.name}.${key}`,
						name: `${field.name}.${key}`,
						label: beautifyLabel(`${field.name} ${key}`),
						active: true,
						placeholder: beautifyLabel(`${field.name} ${key}`),
						special: useSpecialFields && specialFields.includes(field.name),
						hidden: field.visible === false,
						defaultValue: subField?.default
					});
				});
				return;
			}

			expandedFields.push({
				field: field.name,
				name: field.name,
				label: beautifyLabel(field.label || field.name),
				active: true,
				placeholder: beautifyLabel(field.label || field.name),
				special: useSpecialFields && specialFields.includes(field.name),
				hidden: field.visible === false,
				readonly: field.type === 'formula' || field.readonly === true,
				defaultValue:
					useSpecialFields && field.name === 'created_by'
						? currentUserEmail || 'system'
						: field.default
			});
		});

		return expandedFields;
	}

	const selectedFields = fieldsStore.filter((field) => {
		if (!field?.active) return false;
		const fieldName = field.field || field.name;
		if (!fieldName) return false;
		return (
			!!schemaStore[fieldName] ||
			(fieldName.includes('.') && !!schemaStore[fieldName.split('.')[0]])
		);
	});

	const selectedFieldNames = selectedFields.map((field) => field.field || field.name) as string[];
	const baseSelected = new Set<string>();
	const subSelected: Record<string, string[]> = {};

	selectedFieldNames.forEach((fieldName) => {
		if (fieldName.includes('.')) {
			const base = fieldName.split('.')[0];
			if (!subSelected[base]) subSelected[base] = [];
			subSelected[base].push(fieldName);
		} else {
			baseSelected.add(fieldName);
		}
	});

	const finalFields: ActiveField[] = [];

	selectedFields.forEach((field) => {
		const fieldName = (field.field || field.name) as string;
		if (!fieldName) return;

		if (fieldName.includes('.')) {
			finalFields.push({
				...field,
				name: fieldName,
				label: beautifyLabel((field.label as string) || fieldName),
				special: useSpecialFields && specialFields.includes(fieldName.split('.')[0])
			});
			return;
		}

		if (!baseSelected.has(fieldName)) return;

		const schemaField = schemaStore[fieldName];
		if (schemaField?.type === 'json' && schemaField.schema) {
			const subs = subSelected[fieldName] || [];
			if (subs.length === 0) {
				finalFields.push({
					...field,
					name: fieldName,
					label: beautifyLabel((field.label as string) || fieldName),
					special: useSpecialFields && specialFields.includes(fieldName)
				});
			}
			return;
		}

		finalFields.push({
			...field,
			name: fieldName,
			label: beautifyLabel((field.label as string) || fieldName),
			special: useSpecialFields && specialFields.includes(fieldName)
		});
	});

	return finalFields;
}

export function resolveFieldInnerType(
	schemaStore: Record<string, SchemaField>,
	field: ConfiguredField,
	useSpecialFields = true
): string | null {
	const fieldSchemaName = (field.field || field.name) as string;
	if (!fieldSchemaName) return null;

	let innerType: string | undefined;
	if (fieldSchemaName.includes('.')) {
		const jsonPath = fieldSchemaName.split('.');
		const jsonSchema = schemaStore[jsonPath[0]]?.schema;
		innerType = jsonSchema?.[jsonPath[1]]?.type;
		if (innerType === 'array') innerType = 'jsonarray';
	} else {
		const schemaField = schemaStore[fieldSchemaName];
		innerType = schemaField?.type;
		const subtype = schemaField?.subtype;

		if (innerType === 'array') {
			if ((schemaField?.constraints?.inclusion?.length ?? 0) < 1 || subtype === 'array') {
				innerType = 'jsonarray';
			}
		}

		if (useSpecialFields) {
			if (innerType === 'string' && subtype === 'array') {
				innerType =
					fieldSchemaName === 'tags' || fieldSchemaName === 'Tags' ? 'tags' : 'jsonarray';
			}
			if (innerType === 'string' && fieldSchemaName.toUpperCase() === 'COLOR') innerType = 'color';
			if (innerType === 'string' && fieldSchemaName.toUpperCase() === 'ICON') innerType = 'icon';
		}
	}

	if (!innerType) return null;
	return innerType;
}