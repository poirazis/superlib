<script>
	import { createEventDispatcher, getContext, untrack } from 'svelte';
	import { DatePicker } from 'date-picker-svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import { copyAndTransition, deferJustCopied } from './cellClipboard';
	import SuperPopover from '../SuperPopover/SuperPopover.svelte';

	const dispatch = createEventDispatcher();
	const { processStringSync } = getContext('sdk');

	let { id, value, cellOptions = {}, autofocus = false } = $props();

	let anchor = $state(null);
	let popup = $state();
	let timePicker = $state();
	let dateInput = $state();
	let open = $state(false);
	let selection = $state(false);
	let originalValue = $state();
	let innerDate = $state(null);
	let timeValue = $state('');
	let editText = $state('');

	let config = $derived(cellOptions ?? {});
	let controlType = $derived(config.controlType);
	let inputDate = $derived(controlType === 'inputDate');
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
	let copyIcon = $derived(config.copyIcon ?? 'always');

	let inEdit = $derived($csm === 'editing');
	let error = $derived(optionError);
	let isDirty = $derived(inEdit && selection);
	let baseRole = $derived(config.role === 'inline' ? 'inline' : 'form');

	const parseValueToDate = (valueStr) => {
		if (valueStr == null || valueStr === '') return null;
		if (valueStr instanceof Date) {
			return Number.isNaN(valueStr.getTime()) ? null : valueStr;
		}
		const parsed = new Date(valueStr);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
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
		if (!innerDate) return null;

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
		if (!innerDate) {
			timeValue = '';
			return;
		}

		timeValue = innerDate.toLocaleTimeString('en-US', {
			hour12: !show24HTime,
			hour: '2-digit',
			minute: '2-digit'
		});
	};

	const syncEditTextFromDate = () => {
		editText = innerDate ? formatDateTime(innerDate, currentDateFormat, currentShowTime) : '';
	};

	const parseTypedDate = (text, dateFormat) => {
		if (!text?.trim()) return null;

		const trimmed = text.trim();
		let day;
		let month;
		let year;

		if (dateFormat === 'MM/DD/YYYY') {
			const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
			if (!match) return null;
			month = parseInt(match[1], 10) - 1;
			day = parseInt(match[2], 10);
			year = parseInt(match[3], 10);
		} else if (dateFormat === 'YYYY-MM-DD') {
			const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
			if (!match) return null;
			year = parseInt(match[1], 10);
			month = parseInt(match[2], 10) - 1;
			day = parseInt(match[3], 10);
		} else if (dateFormat === 'DD/MM/YYYY' || !dateFormat || dateFormat === 'default') {
			const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
			if (!match) return null;
			day = parseInt(match[1], 10);
			month = parseInt(match[2], 10) - 1;
			year = parseInt(match[3], 10);
		} else {
			const parsed = new Date(trimmed);
			return Number.isNaN(parsed.getTime()) ? null : parsed;
		}

		const date = new Date(year, month, day);
		if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
			return null;
		}

		return date;
	};

	const commitInputDate = () => {
		if (!inputDate) return null;

		const trimmed = editText.trim();
		if (trimmed === '') {
			innerDate = null;
			timeValue = '';
			selection = true;
			return null;
		}

		const parsed = parseTypedDate(trimmed, currentDateFormat);
		if (!parsed) {
			innerDate = parseValueToDate(originalValue);
			syncEditTextFromDate();
			syncTimeValue();
			selection = innerDate != null;
			return undefined;
		}

		if (currentShowTime) {
			parsed.setHours(
				innerDate.getHours(),
				innerDate.getMinutes(),
				innerDate.getSeconds(),
				innerDate.getMilliseconds()
			);
		} else {
			parsed.setHours(0, 0, 0, 0);
		}

		innerDate = parsed;
		syncTimeValue();
		editText = formatDateTime(innerDate, currentDateFormat, currentShowTime);
		selection = true;
		return buildOutputValue();
	};

	let dateInputPlaceholder = $derived.by(() => {
		if (placeholder) return placeholder;
		if (currentDateFormat === 'MM/DD/YYYY') return 'MM/DD/YYYY';
		if (currentDateFormat === 'YYYY-MM-DD') return 'YYYY-MM-DD';
		if (currentDateFormat === 'MMM DD, YYYY') return 'MMM DD, YYYY';
		if (currentDateFormat === 'DD MMM YYYY') return 'DD MMM YYYY';
		return 'DD/MM/YYYY';
	});

	let formattedValue = $derived.by(() => {
		if (!innerDate) return '';

		if (config.template) {
			return processStringSync(config.template, {
				value: innerDate
			});
		}

		return formatDateTime(innerDate, currentDateFormat, currentShowTime);
	});

	let inputShowsPlaceholder = $derived(innerDate == null);

	const csm = fsm('view', {
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
			mousedown() {},
			focus() {
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
			click() {
				copyAndTransition(() => csm, formattedValue || String(value ?? ''));
			},
			keydown(e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.click();
				}
			}
		},
		justCopied: deferJustCopied(() => csm),
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
				if (inputDate) {
					syncEditTextFromDate();
					dateInput?.focus();
				}
				open = true;
				dispatch('enteredit');
			},
			_exit() {
				open = false;
				dispatch('exitedit');
			},
			mousedown(e) {
				e.stopPropagation();
				open = !open;
			},
			keydown(e) {
				if (inputDate && dateInput?.contains(e.target)) {
					if (e.key === 'Escape') {
						e.preventDefault();
						this.cancel();
					}
					return;
				}

				if (e.key === ' ' || e.keyCode === 32) {
					e.stopPropagation();
					e.preventDefault();
					open = !open;
				}

				if (e.code === 'Delete' || e.code === 'Backspace') {
					e.stopPropagation();
					e.preventDefault();
					innerDate = null;
					editText = '';
					timeValue = '';
					selection = true;
					dispatch('change', null);
				}

				if (e.key === 'Escape') {
					this.cancel();
				}
			},
			focusout(e) {
				const target = e.relatedTarget;
				if (
					anchor?.contains(target) ||
					popup?.contains(target) ||
					timePicker?.contains(target) ||
					dateInput?.contains(target)
				) {
					return;
				}

				open = false;
				this.submit();
				return readonly ? 'readonly' : 'view';
			},
			submit() {
				if (inputDate) {
					const committed = commitInputDate();
					if (committed === null) {
						dispatch('change', null);
					} else if (committed !== undefined) {
						dispatch('change', committed);
					}
				} else if (selection) {
					dispatch('change', buildOutputValue());
				}
			},
			cancel() {
				innerDate = parseValueToDate(originalValue);
				syncTimeValue();
				if (inputDate) {
					syncEditTextFromDate();
				}
				open = false;
				return readonly ? 'readonly' : 'view';
			}
		}
	});

	const ensureInnerDate = () => {
		if (!innerDate) {
			innerDate = new Date();
		}
		return innerDate;
	};

	const handleStartTime = () => {
		const date = ensureInnerDate();
		const startTime = show24HTime ? '00:00' : '12:00 AM';
		timeValue = startTime;
		date.setHours(0, 0, 0, 0);
		innerDate = new Date(date);
		selection = true;
		anchor?.focus();
	};

	const handleEndTime = () => {
		const date = ensureInnerDate();
		const endTime = show24HTime ? '23:59' : '11:59 PM';
		timeValue = endTime;
		date.setHours(23, 59, 0, 0);
		innerDate = new Date(date);
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
		csm.submit();
	};

	const handleTimeChange = (e) => {
		if (!currentShowTime || !innerDate) return;
		selection = true;

		const newTime = e.target.value;
		const time24h = show24HTime ? newTime : parse12HourTime(newTime);
		if (!time24h) return;

		const [hours, minutes] = time24h.split(':').map(Number);
		innerDate.setHours(hours, minutes, 0, 0);
		innerDate = new Date(innerDate);
	};

	const handleDateInput = (e) => {
		selection = true;
		editText = e.target.value;

		const trimmed = editText.trim();
		if (!trimmed) {
			innerDate = null;
			timeValue = '';
			return;
		}

		const parsed = parseTypedDate(trimmed, currentDateFormat);
		if (!parsed) {
			innerDate = null;
			return;
		}

		const previousDate = innerDate;

		if (currentShowTime && previousDate) {
			parsed.setHours(
				previousDate.getHours(),
				previousDate.getMinutes(),
				previousDate.getSeconds(),
				previousDate.getMilliseconds()
			);
		} else {
			parsed.setHours(0, 0, 0, 0);
		}

		innerDate = parsed;
		syncTimeValue();
	};

	const handleDateChange = (e) => {
		const newDate = e.detail;
		selection = true;

		if (currentShowTime && innerDate) {
			newDate.setHours(
				innerDate.getHours(),
				innerDate.getMinutes(),
				innerDate.getSeconds(),
				innerDate.getMilliseconds()
			);
		}

		innerDate = newDate;
		syncTimeValue();
		if (inputDate) {
			editText = formatDateTime(innerDate, currentDateFormat, currentShowTime);
			dateInput?.focus();
		} else {
			anchor?.focus();
		}
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
				csm.focus();
				if (inputDate) {
					dateInput?.focus();
				}
			}, 30);
		}
	});

	$effect(() => {
		if (disabled) {
			csm.goTo('disabled');
		} else if (readonly && copyable && value) {
			csm.goTo('copyable');
		} else if (readonly) {
			csm.goTo('readonly');
		} else if (!inEdit) {
			csm.goTo('view');
		}
	});
</script>

<!-- svelte-ignore event_directive_deprecated -->
<BaseCell
	{id}
	role={baseRole}
	{csm}
	bind:anchor
	icon={optionIcon}
	isDirty={isDirty && showDirty}
	clearable={false}
	{error}
	{copyIcon}
	{color}
	{background}
	popupOpen={open}
	tabindex={disabled || (readonly && !copyable) ? -1 : 0}
>
	{#if inputDate}
		<input
			bind:this={dateInput}
			type="text"
			class="editor"
			class:placeholder={inputShowsPlaceholder}
			value={editText}
			on:input={handleDateInput}
			on:focusout={csm.focusout}
			on:click={(e) => e.stopPropagation()}
			placeholder={dateInputPlaceholder}
		/>
	{:else}
		<span class="value" class:placeholder={!innerDate}>
			{formattedValue || placeholder}
		</span>
	{/if}
	{#if $csm === 'editing' || $csm === 'view'}
		<i class="ph ph-calendar-blank control-icon"></i>
	{/if}
</BaseCell>

<SuperPopover
	{anchor}
	{open}
	align="right"
	maxHeight={400}
	useAnchorWidth={false}
	dismissible={false}
	bind:popup
>
	{#snippet children()}
		<div
			class="datetime-picker-container"
			style:--date-picker-background="var(--spectrum-global-color-gray-75)"
			style:--date-picker-foreground="var(--spectrum-global-color-gray-800)"
			style:--date-picker-selected-background="var(--accent-color)"
		>
			<!-- svelte-ignore event_directive_deprecated -->
			<DatePicker value={innerDate ?? new Date()} on:select={handleDateChange} />

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
						on:focusout={csm.focusout}
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
	{/snippet}
</SuperPopover>

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

	span.value {
		font-style: inherit;
		font-size: 13px;
		min-width: 0;
		max-width: 100%;
		flex: 1 1 auto;
		display: flex;
		align-items: center;
		height: 100%;
		background: transparent;
		color: inherit;
		border: none;
		outline: none;
		cursor: inherit;
		padding: 0.25rem 0.75rem;
	}

	.value.placeholder {
		color: var(--spectrum-global-color-gray-500);
		font-style: italic !important;
	}
</style>