export type FormDataContextOptions = {
	valid?: boolean;
	dirty?: boolean;
	currentStep?: number;
	currentStepValid?: boolean;
	editing?: boolean;
	baseContext?: Record<string, unknown>;
};

export const buildFormDataContext = (
	formValue: Record<string, unknown> = {},
	{
		valid = true,
		dirty = false,
		currentStep = 1,
		currentStepValid = true,
		editing = true,
		baseContext = {}
	}: FormDataContextOptions = {}
): Record<string, unknown> => ({
	...baseContext,
	...formValue,
	__value: formValue,
	__valid: valid,
	__dirty: dirty,
	__currentStep: currentStep,
	__currentStepValid: currentStepValid,
	__editing: editing
});
