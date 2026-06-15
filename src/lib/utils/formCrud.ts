type SchemaField = {
	type?: string;
	schema?: Record<string, unknown>;
};

export function processFormValueForSave(
	formValue: Record<string, unknown>,
	schemaStore: Record<string, SchemaField>
) {
	const processed = { ...formValue };

	Object.keys(processed).forEach((key) => {
		if (!key.includes('.')) return;

		const parts = key.split('.');
		if (parts.length !== 2) return;

		const fieldName = parts[0];
		const subKey = parts[1];
		const schemaField = schemaStore[fieldName];

		if (schemaField?.type === 'json' && schemaField.schema) {
			if (!processed[fieldName] || typeof processed[fieldName] !== 'object') {
				processed[fieldName] = {};
			}
			(processed[fieldName] as Record<string, unknown>)[subKey] = processed[key];
			delete processed[key];
		}
	});

	Object.keys(processed).forEach((key) => {
		if (schemaStore[key]?.type === 'json' && typeof processed[key] === 'object') {
			processed[key] = JSON.stringify(processed[key]);
		}
	});

	return processed;
}

export function enrichFormTitle(options: {
	formTitle?: string;
	actionType?: string;
	dataSourceLabel?: string;
	primaryDisplay?: string;
	formValue?: Record<string, unknown>;
	processStringSync: (template: string, context: Record<string, unknown>) => string;
	context: Record<string, unknown>;
	beautifyLabel: (label?: string) => string | undefined;
}) {
	const {
		formTitle,
		actionType,
		dataSourceLabel,
		primaryDisplay,
		formValue,
		processStringSync,
		context,
		beautifyLabel
	} = options;

	if (formTitle) {
		return processStringSync(formTitle, context);
	}

	if (actionType === 'Create') {
		return `New ${beautifyLabel(dataSourceLabel) ?? dataSourceLabel ?? 'Record'}`;
	}

	if (primaryDisplay && formValue?.[primaryDisplay] && actionType !== 'Create') {
		return String(formValue[primaryDisplay]);
	}

	return undefined;
}

export function enrichFormFooter(options: {
	footerText?: string;
	useSpecialFields?: boolean;
	actionType?: string;
	formValue?: Record<string, unknown>;
	processStringSync: (template: string, context: Record<string, unknown>) => string;
	context: Record<string, unknown>;
}) {
	const { footerText, useSpecialFields, actionType, formValue, processStringSync, context } =
		options;

	if (useSpecialFields && !footerText && actionType !== 'Create' && formValue) {
		if (formValue.updated_by && formValue.updated_at) {
			return `Last updated by ${formValue.updated_by} on ${new Date(
				String(formValue.updated_at)
			).toLocaleString()}`;
		}

		if (formValue.created_by || formValue.created_at) {
			const createdBy =
				(formValue.created_by as { email?: string })?.email ||
				formValue.created_by ||
				'System';
			return `Created by ${createdBy} on ${new Date(String(formValue.created_at)).toLocaleString()}`;
		}

		return undefined;
	}

	return processStringSync(footerText ?? '', context) || undefined;
}