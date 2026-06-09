<script>
	import { createEventDispatcher, getContext, untrack } from 'svelte';
	import { DatePicker } from 'date-picker-svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import { copyTextToClipboard } from './cellClipboard';
	import PickerPopover from './PickerPopover.svelte';

	const dispatch = createEventDispatcher();
	const { processStringSync } = getContext('sdk');

	let {
		id,
		value,
		cellOptions = {},
		autofocus = false
	} = $props();

	let anchor = $state(null);
	let picker = $state();
	let open = $state(false);
	let originalValue = $state(null);
	let localValue = $state(null);
	let fromTimePicker = $state();
	let toTimePicker = $state();

	let config = $derived(cellOptions ?? {});
	let currentDateFormat = $derived(config.dateFormat);
	let currentShowTime = $derived(config.showTime);
	let readonly = $derived(config.readonly);
	let disabled = $derived(config.disabled);
	let optionError = $derived(config.error);
	let optionIcon = $derived(config.icon);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let showDirty = $derived(config.showDirty);
	let copyable = $derived(config.copyable);
	let copyIcon = $derived(config.copyIcon ?? 'always');
	let align = $derived(config.align);

	let justCopied = $state(false);
	let fromTime = $derived(currentShowTime && localValue?.fromTime ? localValue.fromTime : '00:00');
	let toTime = $derived(currentShowTime && localValue?.toTime ? localValue.toTime : '00:00');
	let fromDate = $derived(localValue?.from ? new Date(localValue.from) : new Date());
	let toDate = $derived(localValue?.to ? new Date(localValue.to) : new Date());
	let fromDateTime = $derived(
		currentShowTime && localValue?.from
			? new Date(`${fromDate.toISOString().split('T')[0]}T${fromTime}`)
			: fromDate
	);
	let toDateTime = $derived(
		currentShowTime && localValue?.to
			? new Date(`${toDate.toISOString().split('T')[0]}T${toTime}`)
			: toDate
	);
	let inEdit = $derived($cellState === 'editing');
	let error = $derived(optionError);
	let icon = $derived(error ? 'ph ph-warning' : optionIcon);
	let isDirty = $derived(inEdit && JSON.stringify(localValue) != JSON.stringify(originalValue));
	let baseRole = $derived(
		config.role === 'inlineInput' || config.role === 'inline'
			? 'inline'
			: config.role === 'tableCell' || config.role === 'cell'
				? 'cell'
				: 'form'
	);
	let placeholder = $derived(
		readonly || disabled ? '' : config.placeholder || 'Select date range'
	);

	const formatDateRange = (from, to, dateFormat) => {
		if (!dateFormat || dateFormat === 'default') {
			return {
				from: from.toDateString(),
				to: to.toDateString()
			};
		}

		if (dateFormat === 'MM/DD/YYYY') {
			return {
				from: `${(from.getMonth() + 1).toString().padStart(2, '0')}/${from.getDate().toString().padStart(2, '0')}/${from.getFullYear()}`,
				to: `${(to.getMonth() + 1).toString().padStart(2, '0')}/${to.getDate().toString().padStart(2, '0')}/${to.getFullYear()}`
			};
		}

		if (dateFormat === 'DD/MM/YYYY') {
			return {
				from: `${from.getDate().toString().padStart(2, '0')}/${(from.getMonth() + 1).toString().padStart(2, '0')}/${from.getFullYear()}`,
				to: `${to.getDate().toString().padStart(2, '0')}/${(to.getMonth() + 1).toString().padStart(2, '0')}/${to.getFullYear()}`
			};
		}

		if (dateFormat === 'YYYY-MM-DD') {
			return {
				from: `${from.getFullYear()}-${(from.getMonth() + 1).toString().padStart(2, '0')}-${from.getDate().toString().padStart(2, '0')}`,
				to: `${to.getFullYear()}-${(to.getMonth() + 1).toString().padStart(2, '0')}-${to.getDate().toString().padStart(2, '0')}`
			};
		}

		const options = {
			'MMM DD, YYYY': {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
				timeZone: 'UTC'
			},
			'DD MMM YYYY': {
				day: 'numeric',
				month: 'short',
				year: 'numeric',
				timeZone: 'UTC'
			}
		};

		const format = options[dateFormat];
		if (format) {
			return {
				from: from.toLocaleDateString('en-US', format),
				to: to.toLocaleDateString('en-US', format)
			};
		}

		return {
			from: from.toDateString(),
			to: to.toDateString()
		};
	};

	const formatDateRangeWithTime = (from, to, dateFormat, fromTimeValue, toTimeValue, showTime) => {
		if (!showTime) {
			return {
				from: formatDateRange(from, from, dateFormat).from,
				to: formatDateRange(to, to, dateFormat).to
			};
		}

		return {
			from: formatDateRange(from, from, dateFormat).from + ' ' + fromTimeValue,
			to: formatDateRange(to, to, dateFormat).to + ' ' + toTimeValue
		};
	};

	let isValidRange = $derived.by(() => {
		if (!localValue?.from || !localValue?.to) return true;
		if (currentShowTime) {
			return fromDateTime <= toDateTime;
		}
		return fromDate <= toDate;
	});

	let formattedTemplateValue = $derived.by(() => {
		if (config.template && localValue) {
			return processStringSync(config.template, { value: localValue });
		}
		return undefined;
	});

	let rangeDisplay = $derived.by(() => {
		if (formattedTemplateValue) return formattedTemplateValue;
		if (!localValue?.from && !localValue?.to) return placeholder;

		let fromFormatted = placeholder;
		let toFormatted = placeholder;

		if (localValue?.from) {
			if (currentDateFormat === 'default' || !currentDateFormat) {
				fromFormatted = currentShowTime
					? fromDate.toDateString() + ' ' + fromTime
					: fromDate.toDateString();
			} else if (currentShowTime) {
				fromFormatted = formatDateRangeWithTime(
					fromDate,
					fromDate,
					currentDateFormat,
					fromTime,
					fromTime,
					true
				).from;
			} else {
				fromFormatted = formatDateRange(fromDate, fromDate, currentDateFormat).from;
			}
		}

		if (localValue?.to) {
			if (currentDateFormat === 'default' || !currentDateFormat) {
				toFormatted = currentShowTime
					? toDate.toDateString() + ' ' + toTime
					: toDate.toDateString();
			} else if (currentShowTime) {
				toFormatted = formatDateRangeWithTime(
					toDate,
					toDate,
					currentDateFormat,
					toTime,
					toTime,
					true
				).to;
			} else {
				toFormatted = formatDateRange(toDate, toDate, currentDateFormat).to;
			}
		}

		if (localValue?.from && localValue?.to) {
			return `${fromFormatted} - ${toFormatted}`;
		}
		if (localValue?.from) {
			return `${fromFormatted} - [Select end date]`;
		}
		if (localValue?.to) {
			return `[Select start date] - ${toFormatted}`;
		}

		return placeholder;
	});

	let showPlaceholder = $derived(!localValue?.from && !localValue?.to);

	export const cellState = fsm('view', {
		'*': {
			goTo(state) {
				return state;
			}
		},
		view: {
			focus() {
				if (!readonly && !disabled) return 'editing';
			}
		},
		readonly: {
			_enter() {
				open = false;
			}
		},
		copyable: {
			_enter() {
				open = false;
			},
			click() {
				copyTextToClipboard(rangeDisplay || '', (copied) => (justCopied = copied));
			},
			keydown(e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.click();
				}
			}
		},
		disabled: {
			_enter() {
				open = false;
			}
		},
		editing: {
			_enter() {
				originalValue = localValue ? { ...localValue } : null;
				open = false;
				dispatch('enteredit');
			},
			_exit() {
				open = false;
				dispatch('exitedit');
			},
			click() {
				open = !open;
			},
			keydown(e) {
				if (e.key === ' ' || e.keyCode === 32) {
					e.stopPropagation();
					e.preventDefault();
					open = !open;
				}

				if (e.key === 'Escape') {
					this.cancel();
				}
			},
			focusout(e) {
				const isInPicker = picker?.contains(e.relatedTarget);
				const isInFromTime = fromTimePicker?.contains?.(e.relatedTarget);
				const isInToTime = toTimePicker?.contains?.(e.relatedTarget);

				if (!isInPicker && !isInFromTime && !isInToTime) {
					open = false;
					if (JSON.stringify(localValue) != JSON.stringify(originalValue)) {
						dispatch('change', localValue);
					}
					return readonly ? 'readonly' : 'view';
				}
			},
			cancel() {
				localValue = originalValue ? { ...originalValue } : null;
				open = false;
				return readonly ? 'readonly' : 'view';
			}
		}
	});

	const handleFromDateChange = (e) => {
		const newFromDate = e.detail;
		localValue = {
			...localValue,
			from: newFromDate
		};

		if (localValue.to && new Date(localValue.to) < newFromDate) {
			localValue = {
				...localValue,
				to: null
			};
		}

		dispatch('change', localValue);
	};

	const handleToDateChange = (e) => {
		const newToDate = e.detail;
		localValue = {
			...localValue,
			to: newToDate
		};
		dispatch('change', localValue);
	};

	const handleFromTimeChange = (e) => {
		localValue = {
			...localValue,
			fromTime: e.target.value
		};
		dispatch('change', localValue);
	};

	const handleToTimeChange = (e) => {
		localValue = {
			...localValue,
			toTime: e.target.value
		};
		dispatch('change', localValue);
	};

	const clearRange = (e) => {
		e?.stopPropagation?.();
		localValue = null;
		dispatch('change', null);
	};

	$effect(() => {
		const externalValue = value;
		untrack(() => {
			localValue = externalValue ? { ...externalValue } : null;
		});
	});

	$effect(() => {
		if (autofocus) {
			setTimeout(() => {
				cellState.focus();
				cellState.click?.();
			}, 30);
		}
	});

	$effect(() => {
		if (disabled) {
			cellState.goTo('disabled');
		} else if (readonly && copyable && (localValue?.from || localValue?.to)) {
			cellState.goTo('copyable');
		} else if (readonly) {
			cellState.goTo('readonly');
		} else if (!inEdit) {
			cellState.goTo('view');
		}
	});
</script>

<!-- svelte-ignore event_directive_deprecated -->
<BaseCell
	{id}
	role={baseRole}
	state={cellState}
	bind:root={anchor}
	{icon}
	isDirty={isDirty && showDirty}
	clearable={false}
	{error}
	{justCopied}
	{copyIcon}
	{color}
	{background}
	popupOpen={open}
	tabindex={disabled || (readonly && !copyable) ? -1 : 0}
>
	{#if icon}
		<i class={icon + ' field-icon'} class:with-error={error}></i>
	{/if}

	<div
		class="datetime-display"
		class:placeholder={showPlaceholder}
		class:inline={baseRole === 'inline'}
		style:justify-content={align}
	>
		<span class:placeholder={showPlaceholder}>{rangeDisplay}</span>
		{#if inEdit}
			<i class="ph ph-calendar-blank calendar-icon"></i>
			{#if localValue && showDirty != false}
				<!-- svelte-ignore event_directive_deprecated -->
				<button
					class="clear-button ph ph-x"
					on:click|stopPropagation={clearRange}
					aria-label="Clear date range"
				></button>
			{/if}
		{/if}
	</div>
</BaseCell>

<PickerPopover
	anchor={anchor}
	visible={inEdit}
	align="right"
	{open}
	maxHeight={400}
	useAnchorWidth={false}
	dismissible={false}
>
	<div
		bind:this={picker}
		class="range-picker-container"
		style:--date-picker-background="var(--spectrum-global-color-gray-75)"
		style:--date-picker-foreground="var(--spectrum-global-color-gray-800)"
		style:--date-picker-selected-background="var(--accent-color)"
	>
		<div class="datepickers-container">
			<div class="range-section">
				<!-- svelte-ignore a11y_label_has_associated_control -->
				<span class="range-label">From:</span>
				<!-- svelte-ignore event_directive_deprecated -->
				<DatePicker value={fromDate} on:select={handleFromDateChange} />

				{#if currentShowTime}
					<div class="time-section">
						<!-- svelte-ignore event_directive_deprecated -->
						<input
							bind:this={fromTimePicker}
							type="time"
							value={fromTime}
							on:change={handleFromTimeChange}
							class="time-input"
							step="900"
						/>
					</div>
				{/if}
			</div>

			<div class="range-section">
				<!-- svelte-ignore a11y_label_has_associated_control -->
				<span class="range-label">To:</span>
				<!-- svelte-ignore event_directive_deprecated -->
				<DatePicker value={toDate} min={fromDate} on:select={handleToDateChange} />

				{#if currentShowTime}
					<div class="time-section">
						<!-- svelte-ignore event_directive_deprecated -->
						<input
							bind:this={toTimePicker}
							type="time"
							value={toTime}
							on:change={handleToTimeChange}
							class="time-input"
							step="900"
						/>
					</div>
				{/if}
			</div>
		</div>

		{#if !isValidRange}
			<div class="range-error">
				<i class="ph ph-warning" style="color: var(--spectrum-global-color-red-500);"></i>
				<span style="color: var(--spectrum-global-color-red-500); font-size: 12px;">
					End date cannot be before start date
				</span>
			</div>
		{/if}
	</div>
</PickerPopover>

<style>
	.datetime-display {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex: 1 1 auto;
		min-width: 0;
		height: 100%;
		padding: 0.25rem 0.75rem;
		box-sizing: border-box;
		cursor: inherit;
	}

	.datetime-display.inline {
		padding: 0.25rem;
	}

	.datetime-display.placeholder,
	.datetime-display.placeholder > span,
	.datetime-display > span.placeholder {
		font-style: italic;
		color: var(--spectrum-global-color-gray-600);
	}

	.calendar-icon {
		font-size: 16px;
		flex-shrink: 0;
		margin-left: 0.5rem;
		color: var(--spectrum-global-color-gray-600);
	}

	.range-picker-container {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 0.5rem;
		min-width: 300px;
	}

	.datepickers-container {
		display: flex;
		flex-direction: row;
		gap: 1rem;
	}

	.range-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.range-label {
		font-size: 14px;
		font-weight: 500;
		color: var(--spectrum-global-color-gray-800);
	}

	.time-section {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.time-input {
		padding: 6px 8px;
		border: 1px solid var(--spectrum-global-color-gray-300);
		border-radius: 4px;
		font-size: 14px;
		min-width: 120px;
		background: var(--spectrum-global-color-gray-50);
		color: var(--spectrum-global-color-gray-800);
	}

	.time-input:focus {
		outline: none;
		border-color: var(--spectrum-global-color-blue-500);
		box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.2);
	}

	.range-error {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px;
		background: var(--spectrum-global-color-red-200);
		border-radius: 4px;
	}

	.clear-button {
		background: none;
		border: none;
		cursor: pointer;
		padding: 4px;
		border-radius: 2px;
		font-size: 14px;
		color: var(--spectrum-global-color-gray-500);
		margin-left: 0.5rem;
	}

	.clear-button:hover {
		background-color: var(--spectrum-global-color-gray-200);
	}
</style>