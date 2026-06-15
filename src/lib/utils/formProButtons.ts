import {
	resolveConfiguredButtons,
	type ButtonConditionsSdk,
	type ConfiguredButton
} from './buttonConditions.ts';

export type FormProButtonContext = {
	actionType: string;
	disabled?: boolean;
	isDirty?: boolean;
	stepStore: number;
	stepsLength: number;
	canReset?: boolean;
	canSave?: boolean;
	canEdit?: boolean;
	canDelete?: boolean;
	canNavigate?: boolean;
	fromView?: boolean;
	onNavBack?: () => void;
	onNavForward?: () => void;
	onReset?: () => void;
	onSave?: () => void;
	onDelete?: () => void;
	onEdit?: () => void;
	onCancelEdit?: () => void;
};

export function buildFormProButtons(
	context: Record<string, unknown>,
	sdk: ButtonConditionsSdk,
	options: FormProButtonContext,
	customActions: ConfiguredButton[] = []
) {
	const {
		actionType,
		disabled,
		isDirty,
		stepStore,
		stepsLength,
		canReset = true,
		canSave = true,
		canEdit = true,
		canDelete = false,
		canNavigate = true,
		fromView,
		onNavBack,
		onNavForward,
		onReset,
		onSave,
		onDelete,
		onEdit,
		onCancelEdit
	} = options;

	const navButtons: Record<string, unknown>[] = [];
	const buttons: Record<string, unknown>[] = [];

	if (stepsLength > 1 && actionType === 'Create' && canNavigate) {
		if (stepStore > 1) {
			navButtons.push({
				type: 'secondary',
				text: 'Back',
				quiet: true,
				disabled,
				onClick: onNavBack,
				icon: 'ph ph-caret-left'
			});
		}

		if (stepStore < stepsLength) {
			navButtons.push({
				type: 'secondary',
				text: 'Next',
				quiet: true,
				disabled,
				onClick: onNavForward,
				icon: 'ph ph-caret-right',
				iconAfterText: true
			});
		}
	}

	if (actionType === 'Create') {
		if (stepStore === stepsLength) {
			if (canReset) {
				buttons.push({
					type: 'primary',
					text: 'Reset',
					quiet: true,
					icon: 'ph ph-arrow-counter-clockwise',
					disabled,
					onClick: onReset
				});
			}

			if (canSave) {
				buttons.push({
					type: 'cta',
					text: actionType,
					variant: 'primary',
					icon: 'ph ph-floppy-disk',
					disabled,
					onClick: onSave
				});
			}
		}
	} else if (actionType === 'Update') {
		if (canSave) {
			buttons.push({
				type: 'cta',
				text: 'Save',
				variant: 'primary',
				icon: 'ph ph-floppy-disk',
				disabled,
				quiet: !isDirty,
				onClick: onSave
			});
		}

		if (canDelete) {
			buttons.unshift({
				type: 'warning',
				text: 'Delete',
				icon: 'ph ph-trash',
				disabled,
				quiet: true,
				onClick: onDelete
			});
		}

		if (fromView) {
			buttons.unshift({
				type: 'secondary',
				variant: 'secondary',
				icon: 'ph ph-x',
				disabled: false,
				quiet: true,
				onClick: onCancelEdit
			});
		}
	} else {
		if (canEdit) {
			buttons.push({
				type: 'primary',
				quiet: true,
				icon: 'ph ph-pencil',
				disabled,
				onClick: onEdit
			});
		}

		if (canDelete) {
			buttons.push({
				type: 'warning',
				icon: 'ph ph-trash',
				disabled,
				quiet: true,
				onClick: onDelete
			});
		}
	}

	const extraButtons =
		actionType !== 'Create' || stepStore === stepsLength
			? resolveConfiguredButtons(customActions, context, sdk, { forceDisabled: disabled })
			: [];

	return [...navButtons, ...extraButtons, ...buttons].map((btn) => ({
		...btn,
		size: 'S',
		buttonClass: 'button'
	}));
}