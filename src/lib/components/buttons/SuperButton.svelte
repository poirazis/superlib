<script lang="ts">
	import { untrack } from 'svelte';
	import { tooltip as showTooltip } from '../../actions/tooltip';

	let {
		size = 'M',
		menuItem = false,
		menuAlign = 'right',
		icon = undefined,
		iconAfterText = undefined,
		iconColor = undefined,
		filledIcon = undefined,
		text = 'Button',
		quiet = undefined,
		selected = undefined,
		disabled = undefined,
		onClick = undefined,
		buttonClass = 'actionButton',
		type = 'primary',
		tooltip = undefined,
		confirm = false,
		condition = undefined,
		actionsMode = 'normal',
		loopSource = undefined,
		loopDelay = 750,
		loopEvent = undefined,
		timerDuration = 60,
		fullWidth = undefined,
		iconOnly = undefined,
		// Events
		onTimer = undefined,
		onLoopStart = undefined,
		onLoopEvent = undefined,
		onLoopEnd = undefined,
		onTrueCondition = undefined,
		onFalseCondition = undefined,
		workingState = undefined
	} = $props();

	let confirmMode = $state(false);
	let working = $state(false);

	let tooltipOptions = $derived(
		tooltip
			? { text: tooltip, whenTruncated: false }
			: { enabled: false }
	);
	let ui_timer: ReturnType<typeof setInterval>;
	let elapsed = 0;
	let buttonText = $derived(
		confirmMode ? 'Confirm ?' : text || (actionsMode == 'timer' ? timerDuration : '')
	);

	let effectiveButtonClass = $derived(
		buttonClass == 'actionButton'
			? 'spectrum-ActionButton spectrum-ActionButton--size' + size
			: 'spectrum-Button spectrum-Button--size' + size
	);

	let icon_class = $derived(
		working || workingState
			? 'ph ph-spinner-gap ph-spin'
			: icon && !icon.startsWith('ri-')
				? 'ph ph-' + icon
				: icon
					? icon
					: actionsMode == 'timer'
						? 'ph ph-timer'
						: undefined
	);

	$effect(() => {
		if (actionsMode == 'timer') {
			untrack(() => {
				text = timerDuration.toString();
				ui_timer = setInterval(() => {
					elapsed += 1;
					if (elapsed == timerDuration) {
						working = true;
						elapsed = 0;
						onTimer?.();
						sleep(200).then(() => {
							working = false;
						});
					}
					text = (timerDuration - elapsed).toString();
				}, 1000);
			});
		}

		return () => {
			clearInterval(ui_timer);
		};
	});

	async function handleClick(e: MouseEvent) {
		if (disabled || actionsMode == 'timer' || workingState) return;

		// Handle confirmation flow
		if (confirm && !confirmMode) {
			confirmMode = true;
			return;
		}

		console.log(actionsMode, onClick, onLoopEvent);

		// Reset confirm mode after executing action
		confirmMode = false;
		working = true;
		if (actionsMode == 'loop') {
			if (onLoopStart) await onLoopStart({ iterations: loopSource?.length });
			if (Array.isArray(loop) && onLoopEvent) {
				for (var i = 0; i < loop.length; i++) {
					buttonText = `Processing ${i + 1}/${loop.length}`;
					await onLoopEvent({ idx: i, value: loop[i] });
					await sleep(loopDelay);
				}
				buttonText = 'Done';
				await sleep(300);
				buttonText = text;
			}
			if (onLoopEnd) await onLoopEnd();
		} else if (actionsMode == 'conditional') {
			if (condition == true) await onTrueCondition?.();
			else await onFalseCondition?.();
		} else if (onClick) {
			await onClick?.(e);
		}
		working = false;
	}

	const safeParse = (input: string | undefined) => {
		if (!input) return undefined;

		let res = [];
		try {
			res = JSON.parse(input);
			if (!Array.isArray(res)) res = [input];
		} catch (ex) {
			res = input?.split(',') ?? [input];
		}

		return res;
	};

	function sleep(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	let loop = $derived(safeParse(loopSource));

	let buttonState = $derived.by(() => {
		if (disabled) return 'disabled';
		if (working || workingState) return 'working';
		return '';
	});

	let typeClass = $derived(menuItem ? '' : type);
</script>

<!-- svelte-ignore event_directive_deprecated -->
<button
	use:showTooltip={tooltipOptions}
	on:click={(e) => {
		handleClick(e);
	}}
	on:blur={() => {
		confirmMode = false;
	}}
	tabindex={disabled ? -1 : 0}
	class="super-button {typeClass} {buttonState} {effectiveButtonClass}"
	class:menu-item={menuItem}
	class:menu-item-right={menuItem && menuAlign == 'right'}
	class:xsmall={size == 'XS'}
	class:small={size == 'S'}
	class:large={size == 'L'}
	class:is-selected={selected}
	class:quiet
	class:icon={icon_class}
	class:iconOnly={iconOnly || !text}
	class:full-width={fullWidth}
>
	<i
		class={confirmMode ? 'ph ph-check' : icon_class}
		class:ph-fill={filledIcon}
		style:order={iconAfterText ? 1 : 0}
		style:color={disabled ? 'var(--spectrum-global-color-gray-400)' : iconColor}
	></i>

	<span>{buttonText}</span>
</button>

<style>
	.super-button {
		border: 1px solid var(--spectrum-global-color-gray-400);
		background-color: var(--spectrum-global-color-gray-50);
		color: var(--spectrum-global-color-gray-800);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0rem 1rem;
		min-width: 4rem;
		gap: 0.75rem;
		height: 2rem;
		transition: all 150ms ease-in-out;

		&.spectrum-ActionButton {
			padding: 0rem 0.75rem !important;
			border-radius: 4px !important;
		}
		&.spectrum-ActionButton.xsmall {
			padding: 0rem 0.5rem !important;
			border-radius: 4px !important;
		}
		&.xsmall {
			height: 1.5rem;
			padding: 0rem 0.75rem;
			min-width: unset;
			gap: 0.5rem;
			font-size: 12px;
			border-radius: 1rem;
		}

		&.small {
			min-width: 4rem;
			padding: 0rem 0.75rem;
			gap: 0.5rem;
			height: 1.75rem;
			font-size: 13px;
		}

		&.large {
			height: 2.25rem;
			font-size: 16px;
			padding: 0rem 1.25rem;

			& > i {
				font-size: 18px;
			}
		}

		& > span {
			white-space: nowrap;
			font-weight: 600;
		}

		&.icon {
			& > i {
				display: block;
			}
		}

		&.iconOnly {
			min-width: unset;
			padding: 0rem 0.5rem;
			border-radius: 0.25rem;
			aspect-ratio: 1 / 1;
			& > span {
				display: none;
			}
		}
		& > i {
			display: none;
			opacity: 0.9;
		}
	}

	.menu-item {
		width: 100%;
		justify-content: flex-start;
		border: unset !important;
		border-radius: 0;
		background-color: transparent !important;
		font-weight: 500;

		&:hover {
			background-color: var(--spectrum-global-color-gray-200) !important;
			color: var(--spectrum-global-color-gray-900);
		}
	}

	.menu-item-right {
		width: 100%;
		justify-content: flex-end !important;
	}

	.full-width {
		width: 100%;
	}

	.cta {
		background-color: var(--spectrum-global-color-blue-400);
		border: 1px solid transparent;
		color: white;

		&.quiet {
			background-color: transparent;
			border: 1px solid var(--spectrum-global-color-blue-100);
			color: var(--spectrum-global-color-blue-700);
			&:hover {
				background-color: var(--spectrum-global-color-blue-400);
				color: white;
			}

			&:focus {
				border: 1px dashed var(--spectrum-global-color-blue-700);
				font-weight: bolder;
			}
		}
		&:hover {
			background-color: var(--spectrum-global-color-blue-600);
			border-color: var(--spectrum-global-color-blue-600);
		}

		&:active {
			border: 1px solid var(--spectrum-global-color-blue-700);
		}
	}
	.ink {
		background-color: var(--spectrum-global-color-gray-800);
		border: 1px solid transparent;
		color: var(--spectrum-global-color-gray-50);

		&.quiet {
			border-color: transparent !important;
			background-color: transparent;
			color: var(--spectrum-global-color-gray-800);
			&:hover,
			&:focus {
				color: var(--spectrum-global-color-gray-50);
				background-color: var(--spectrum-global-color-gray-900);
			}
		}
		&:hover,
		&:focus:not(.working) {
			background-color: var(--spectrum-global-color-gray-900);
		}
	}
	.primary {
		&:hover,
		&:focus {
			border: 1px solid var(--spectrum-global-color-gray-500);
			background-color: var(--spectrum-global-color-gray-200);
			color: var(--spectrum-global-color-gray-900);
		}
		&:active {
			background-color: var(--spectrum-global-color-gray-100);
			scale: 0.9;
		}

		&.quiet {
			border-color: transparent;
			background-color: transparent;
			&:hover {
				background-color: var(--spectrum-global-color-gray-400);
				color: var(--spectrum-global-color-gray-900);
			}
		}
	}

	.secondary {
		background-color: var(--spectrum-global-color-gray-200);
		border-color: transparent;
		color: var(--spectrum-global-color-gray-700);
		font-weight: 500;

		&.quiet {
			background-color: transparent;

			&:hover {
				background-color: var(--spectrum-global-color-gray-300);
			}
		}

		&:hover {
			background-color: var(--spectrum-global-color-gray-300);
			color: var(--spectrum-global-color-gray-900);
		}
		&:focus {
			border: 1px dashed var(--spectrum-global-color-gray-400);
			color: var(--spectrum-global-color-gray-900);
		}
	}

	.warning {
		border: 1px solid transparent;
		background-color: var(--spectrum-global-color-red-400);
		color: white;
		&.quiet {
			border-color: transparent;
			background-color: transparent;
			color: var(--spectrum-global-color-red-400);

			&:hover {
				border-color: var(--spectrum-global-color-red-400);
				background-color: var(--spectrum-global-color-red-400);
				color: white;
				font-weight: bolder;
			}

			&:focus {
				border: 1px dashed var(--spectrum-global-color-red-700);
				font-weight: bolder;
			}
		}
		&:hover:not(.quiet) {
			background-color: var(--spectrum-global-color-red-700);
			font-weight: bolder;
		}
		&:focus {
			border: 1px dashed var(--spectrum-global-color-red-700);
			font-weight: bolder;
		}
	}

	.overBackground {
		background-color: transparent;

		&.quiet {
			border: unset;
		}
	}

	.disabled {
		background-color: var(--spectrum-global-color-gray-200) !important;
		color: var(--spectrum-global-color-gray-400) !important;
		cursor: not-allowed;
		border-color: var(--spectrum-global-color-gray-300);
		&.quiet {
			background-color: unset !important;
			border: unset !important;
		}
	}

	.working {
		cursor: progress;
		border: 1px solid var(--spectrum-global-color-gray-400) !important;
		background-color: var(--spectrum-global-color-gray-300) !important;
		& > span {
			color: var(--spectrum-global-color-gray-600) !important;
		}
		& > i {
			display: block;
			animation: spin 1s linear infinite !important;
			color: var(--spectrum-global-color-gray-700) !important;
		}
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}
</style>
