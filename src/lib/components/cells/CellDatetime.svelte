<script>
	import { createEventDispatcher, getContext, untrack } from 'svelte';
	import { DatePicker } from 'date-picker-svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import PickerPopover from './PickerPopover.svelte';

	const dispatch = createEventDispatcher();
	const { processStringSync } = getContext('sdk');

	let { id, value, cellOptions = {}, autofocus = false } = $props();

	let anchor = $state(null);
	let picker = $state();
	let timePicker = $state();
	let open = $state(false);
	let selection = $state(false);
	let originalValue = $state();
	let innerDate = $state(new Date());
	let timeValue = $state('');

	let config = $derived(cellOptions ?? {});
	let currentDateFormat = $derived(config.dateFormat);
	let currentShowTime = $derived(config.showTime);
	let ignoreTimeZone = $derived(config.ignoreTimezone);
	let show24HTime = $derived(config.show24HTime);
	let placeholder = $derived(config.placeholder || '');
	let readonly = $derived(config.readonly);
	let disabled = $derived(config.disabled);
	let optionError = $derived(config.error);
	let optionIcon = $derived(config.icon);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let showDirty = $derived(config.showDirty);
	let copyable = $derived(config.copyable);
	let copyIcon = $derived(config.copyIcon ?? 'onhover');
	let align = $derived(config.align);
	let justCopied = $state(false);
	let inEdit = $derived($cellState === 'editing');
	let error = $derived(optionError);
	let icon = $derived(error ? 'ph ph-warning' : optionIcon);
	let isDirty = $derived(inEdit && selection);
	let baseRole = $derived(
		config.role === 'inlineInput' || config.role === 'inline'
			? 'inline'
			: config.role === 'tableCell' || config.role === 'cell'
				? 'cell'
				: 'form'
	);

	const parseValueToDate = (valueStr) => {
		if (!valueStr) return new Date();
		if (valueStr instanceof Date) return valueStr;
		return new Date(valueStr);
	};

	const parse12HourTime = (timeStr) => {
		const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
		if (!match) return null;
		let hours = parseInt(match[1]);
		const minutes = parseInt(match[2]);
		const ampm = match[3].toUpperCase();

		if (ampm === 'PM' && hours !== 12) hours += 12;
		if (ampm === 'AM' && hours === 12) hours = 0;

		return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
	};

	const formatDateTime = (date, dateFormat, showTime = false) => {
		if (!date) return '';

		let dateResult = '';

		if (!dateFormat || dateFormat === 'default') {
			dateResult = date?.toDateString();
		} else {
			const month = date.getMonth();
			const dayOfMonth = date.getDate();
			const year = date.getFullYear();

			if (dateFormat === 'MM/DD/YYYY') {
				dateResult = `${(month + 1).toString().padStart(2, '0')}/${dayOfMonth.toString().padStart(2, '0')}/${year}`;
			} else if (dateFormat === 'DD/MM/YYYY') {
				dateResult = `${dayOfMonth.toString().padStart(2, '0')}/${(month + 1).toString().padStart(2, '0')}/${year}`;
			} else if (dateFormat === 'YYYY-MM-DD') {
				dateResult = `${year}-${(month + 1).toString().padStart(2, '0')}-${dayOfMonth.toString().padStart(2, '0')}`;
			} else {
				const options = {
					'MMM DD, YYYY': {
						month: 'short',
						day: 'numeric',
						year: 'numeric'
					},
					'DD MMM YYYY': {
						day: 'numeric',
						month: 'short',
						year: 'numeric'
					}
				};

				const formatOption = options[dateFormat];
				if (formatOption) {
					dateResult = date.toLocaleDateString('en-US', formatOption);
				} else {
					dateResult = date?.toDateString();
				}
			}
		}

		if (!showTime) {
			return dateResult;
		}

		let hours = date.getHours();
		let minutes = date.getMinutes();

		let timeString;
		if (show24HTime) {
			timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
		} else {
			const ampm = hours >= 12 ? 'PM' : 'AM';
			const display12h = hours % 12 || 12;
			timeString = `${display12h.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
		}

		return `${dateResult} ${timeString}`;
	};

	const buildOutputValue = () => {
		let outputValue = innerDate.toISOString();
		if (!currentShowTime) {
			outputValue = innerDate.toLocaleDateString('en-CA');
		}
		if (ignoreTimeZone) {
			outputValue = innerDate.toISOString().slice(0, -1);
		}
		return outputValue;
	};

	const syncTimeValue = () => {
		timeValue = innerDate.toLocaleTimeString('en-US', {
			hour12: !show24HTime,
			hour: '2-digit',
			minute: '2-digit'
		});
	};

	let formattedValue = $derived.by(() => {
		if (config.template && value && value != '' && value != null) {
			return processStringSync(config.template, {
				value: innerDate
			});
		}
		if ((value && value != '' && value != null) || selection) {
			return formatDateTime(innerDate, currentDateFormat, currentShowTime);
		}
		return '';
	});

	let displayText = $derived(
		inEdit ? formattedValue || placeholder : value ? formattedValue || placeholder : placeholder
	);

	let showPlaceholder = $derived(!formattedValue && !value);

	export const cellState = fsm('view', {
		'*': {
			goTo(state) {
				return state;
			}
		},
		view: {
			_enter() {
				open = false;
				selection = false;
			},
			focus() {
				if (!readonly && !disabled) return 'editing';
			},
			copy() {
				if (!readonly && !disabled) return 'editing';
			}
		},
		readonly: {
			_enter() {
				open = false;
				selection = false;
			}
		},
		copyable: {
			_enter() {
				open = false;
				selection = false;
			},
			copy() {
				const textToCopy = formattedValue || String(value ?? '');
				navigator.clipboard
					.writeText(textToCopy)
					.then(() => {
						justCopied = true;
						setTimeout(() => {
							justCopied = false;
						}, 400);
					})
					.catch((err) => {
						console.error('Failed to copy to clipboard:', err);
					});
			}
		},
		disabled: {
			_enter() {
				open = false;
				selection = false;
			}
		},
		editing: {
			_enter() {
				originalValue = value;
				innerDate = parseValueToDate(value);
				syncTimeValue();
				open = true;
				dispatch('enteredit');
			},
			_exit() {
				open = false;
				dispatch('exitedit');
			},
			copy() {
				open = !open;
			},
			handleKeyboard(e) {
				if (e.keyCode == 32) {
					e.stopPropagation();
					e.preventDefault();
					open = !open;
				}

				if (e.code == 'Delete' || e.code == 'Backspace') {
					e.stopPropagation();
					e.preventDefault();
					dispatch('change', null);
				}
			},
			focusout(e) {
				const isInPicker = picker?.contains(e.relatedTarget);
				const isInTimePicker = timePicker?.contains(e.relatedTarget);

				if (isInPicker || isInTimePicker) return;

				open = false;
				if (selection) dispatch('change', buildOutputValue());
				return readonly ? 'readonly' : 'view';
			},
			submit() {
				dispatch('change', buildOutputValue());
				return readonly ? 'readonly' : 'view';
			},
			cancel() {
				innerDate = parseValueToDate(originalValue);
				syncTimeValue();
				open = false;
				return readonly ? 'readonly' : 'view';
			}
		}
	});

	const handleStartTime = () => {
		const startTime = show24HTime ? '00:00' : '12:00 AM';
		timeValue = startTime;
		innerDate.setHours(0, 0, 0, 0);
		innerDate = new Date(innerDate);
		selection = true;
		anchor?.focus();
	};

	const handleEndTime = () => {
		const endTime = show24HTime ? '23:59' : '11:59 PM';
		timeValue = endTime;
		innerDate.setHours(23, 59, 0, 0);
		innerDate = new Date(innerDate);
		selection = true;
		anchor?.focus();
	};

	const handleNowTime = () => {
		innerDate = new Date();
		syncTimeValue();
		selection = true;
		anchor?.focus();
	};

	const handleClearValue = () => {
		cellState.submit();
	};

	const handleTimeChange = (e) => {
		if (!currentShowTime) return;
		selection = true;

		const newTime = e.target.value;
		const time24h = show24HTime ? newTime : parse12HourTime(newTime);
		if (!time24h) return;

		const [hours, minutes] = time24h.split(':').map(Number);
		innerDate.setHours(hours, minutes, 0, 0);
		innerDate = new Date(innerDate);
	};

	const handleDateChange = (e) => {
		const newDate = e.detail;
		selection = true;

		if (currentShowTime) {
			newDate.setHours(
				innerDate.getHours(),
				innerDate.getMinutes(),
				innerDate.getSeconds(),
				innerDate.getMilliseconds()
			);
		}

		innerDate = newDate;
		syncTimeValue();
		anchor?.focus();
		open = false;
	};

	$effect(() => {
		const externalValue = value;
		untrack(() => {
			innerDate = parseValueToDate(externalValue);
			syncTimeValue();
		});
	});

	$effect(() => {
		if (autofocus) {
			setTimeout(() => {
				cellState.focus();
			}, 30);
		}
	});

	$effect(() => {
		if (disabled) {
			cellState.goTo('disabled');
		} else if (readonly && copyable && value) {
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
	onfocusout={cellState.focusout}
>
	{#if icon}
		<i class={icon + ' field-icon'} class:with-error={error}></i>
	{/if}

	<div class="datetime-display" class:placeholder={showPlaceholder} style:justify-content={align}>
		<span>{displayText}</span>
		{#if inEdit}
			<i class="ph ph-calendar-blank calendar-icon"></i>
		{/if}
	</div>
</BaseCell>

<PickerPopover
	{anchor}
	visible={inEdit}
	align="right"
	{open}
	maxHeight={400}
	useAnchorWidth={false}
	onClose={cellState.focusout}
>
	<div
		bind:this={picker}
		class="datetime-picker-container"
		style:--date-picker-background="var(--spectrum-global-color-gray-75)"
		style:--date-picker-foreground="var(--spectrum-global-color-gray-800)"
		style:--date-picker-selected-background="var(--accent-color)"
	>
		<!-- svelte-ignore event_directive_deprecated -->
		<DatePicker value={innerDate} on:select={handleDateChange} />

		{#if currentShowTime}
			<div class="time-section">
				<!-- svelte-ignore a11y_label_has_associated_control -->
				<!-- svelte-ignore event_directive_deprecated -->
				<input
					bind:this={timePicker}
					type="text"
					placeholder={show24HTime ? 'HH:MM' : 'HH:MM AM/PM'}
					bind:value={timeValue}
					on:change={handleTimeChange}
					on:focusout={cellState.focusout}
					class="time-input"
				/>
				<div class="time-buttons">
					<!-- svelte-ignore event_directive_deprecated -->
					<button class="time-button start-button" on:click={handleStartTime}>Start</button>
					<!-- svelte-ignore event_directive_deprecated -->
					<button class="time-button end-button" on:click={handleEndTime}>End</button>
					<!-- svelte-ignore event_directive_deprecated -->
					<button class="time-button now-button" on:click={handleNowTime}>Now</button>
					<!-- svelte-ignore event_directive_deprecated -->
					<button class="time-button clear-button" on:click={handleClearValue}>Select</button>
				</div>
			</div>
		{/if}
	</div>
</PickerPopover>

<style>
	.datetime-picker-container {
		display: contents;
		flex-direction: column;
		gap: 8px;
		padding: 0.5rem;
		border-radius: 8px;
		min-height: fit-content;
		z-index: 1000;
	}
	.time-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.time-buttons {
		display: flex;
		gap: 6px;
	}

	.time-button {
		flex: 1;
		padding: 6px 12px;
		border: 1px solid var(--spectrum-global-color-gray-300);
		border-radius: 4px;
		background: var(--spectrum-global-color-gray-50);
		color: var(--spectrum-global-color-gray-800);
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.time-button:hover {
		background: var(--spectrum-global-color-gray-100);
		border-color: var(--spectrum-global-color-gray-400);
	}

	.time-button:active {
		background: var(--spectrum-global-color-gray-200);
		border-color: var(--spectrum-global-color-gray-500);
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
</style>
