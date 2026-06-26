<script lang="ts">
	import { createEventDispatcher, getContext, untrack } from 'svelte';
	import { DatePicker } from 'date-picker-svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import {
		consumeOpenOnEnter,
		copyAndTransition,
		deferJustCopied,
		isTableCellRole,
		requestIconOpenOnEnter,
		requestOpenOnEnter,
		shouldShowCellViewChrome
	} from './helpers';
	import SuperPopover from '../SuperPopover/SuperPopover.svelte';

	const dispatch = createEventDispatcher();
	const { processStringSync } = getContext('sdk');

	let { id, value, cellOptions = {}, autofocus = false, buttons = [] } = $props();

	let anchor = $state(null);
	let popup = $state<HTMLElement | null>(null);
	let open = $state(false);
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
	let debounceMs = $derived(config.debounce ?? null);
	let changeTimer = $state<ReturnType<typeof setTimeout>>();

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
	let inEdit = $derived($csm === 'editing');
	let isDirty = $derived(inEdit && !rangeValuesEqual(localValue, value));
	let error = $derived(optionError);
	let dirty = $derived(config.dirty);
	let baseRole = $derived(config.role ?? 'form');
	let placeholder = $derived(readonly || disabled ? '' : config.placeholder || 'Select date range');

	const rangeValuesEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

	const isFocusWithinPicker = (related: Node | null) => {
		if (!related) return false;
		if (popup?.contains(related)) return true;
		if (popup instanceof Node && related.contains(popup)) return true;
		if (anchor?.contains(related)) return true;
		return false;
	};

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
		if (!localValue?.from && !localValue?.to) {
			return shouldShowCellViewChrome(baseRole, inEdit) ? placeholder : '';
		}

		let fromFormatted = shouldShowCellViewChrome(baseRole, inEdit) ? placeholder : '';
		let toFormatted = shouldShowCellViewChrome(baseRole, inEdit) ? placeholder : '';

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
			return inEdit || !isTableCellRole(baseRole)
				? `${fromFormatted} - [Select end date]`
				: fromFormatted;
		}
		if (localValue?.to) {
			return inEdit || !isTableCellRole(baseRole)
				? `[Select start date] - ${toFormatted}`
				: toFormatted;
		}

		return shouldShowCellViewChrome(baseRole, inEdit) ? placeholder : '';
	});

	let showPlaceholder = $derived(
		!localValue?.from && !localValue?.to && shouldShowCellViewChrome(baseRole, inEdit)
	);

	const csm = fsm('view', {
		'*': {
			goTo(state) {
				return state;
			},
			copy() {},
			click() {},
			toggle() {}
		},
		view: {
			focus() {
				if (!readonly && !disabled) {
					requestOpenOnEnter();
					return 'editing';
				}
			},
			toggle() {
				anchor?.focus();
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
			copy() {
				copyAndTransition(() => csm, rangeDisplay || '');
			},
			keydown(e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.copy();
				}
			}
		},
		justCopied: deferJustCopied(() => csm),
		disabled: {
			_enter() {
				open = false;
			}
		},
		editing: {
			_enter() {
				localValue = value ? { ...value } : null;
				open = consumeOpenOnEnter();
				dispatch('enteredit');
			},
			_exit() {
				open = false;
				dispatch('exitedit');
			},
			toggle() {
				open = !open;
			},
			keydown(e) {
				if (e.key === ' ' || e.keyCode === 32) {
					e.stopPropagation();
					e.preventDefault();
					this.toggle();
				}

				if (e.key === 'Escape') {
					e.preventDefault();
					if (open) {
						open = false;
						anchor?.focus();
					} else {
						this.cancel();
					}
				}
			},
			change() {
				if (debounceMs) {
					clearTimeout(changeTimer);
					changeTimer = setTimeout(() => {
						if (isDirty) {
							dispatch('change', localValue);
						}
					}, debounceMs);
				}
			},
			submit() {
				clearTimeout(changeTimer);
				if (isDirty) {
					dispatch('change', localValue);
				}
			},
			focusout(e) {
				if (isFocusWithinPicker(e.relatedTarget as Node | null)) return;

				if (debounceMs && isDirty) {
					clearTimeout(changeTimer);
					dispatch('change', localValue);
				} else {
					csm.submit();
				}
				return 'view';
			},
			popupFocusout(e) {
				if (isFocusWithinPicker(e.relatedTarget as Node | null)) return;

				if (debounceMs && isDirty) {
					clearTimeout(changeTimer);
					dispatch('change', localValue);
				} else {
					csm.submit();
				}
				return 'view';
			},
			popupKeydown(e) {
				if (e.key === 'Tab') {
					e.preventDefault();
					anchor?.focus();
					return 'view';
				}
				if (e.key === 'Escape') {
					e.preventDefault();
					if (open) {
						open = false;
						anchor?.focus();
					} else {
						this.cancel();
					}
				}
			},
			cancel() {
				clearTimeout(changeTimer);
				localValue = value ? { ...value } : null;
				open = false;
				dispatch('cancel');
				anchor?.focus();
				return 'view';
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

		csm.change();
	};

	const handleToDateChange = (e) => {
		const newToDate = e.detail;
		localValue = {
			...localValue,
			to: newToDate
		};
		csm.change();
	};

	const handleFromTimeChange = (e) => {
		localValue = {
			...localValue,
			fromTime: e.target.value
		};
		csm.change();
	};

	const handleToTimeChange = (e) => {
		localValue = {
			...localValue,
			toTime: e.target.value
		};
		csm.change();
	};

	const clearRange = (e) => {
		e?.stopPropagation?.();
		localValue = null;
		csm.change();
	};

	$effect(() => {
		return () => clearTimeout(changeTimer);
	});

	$effect(() => {
		const externalValue = value;
		if ($csm === 'editing') return;
		untrack(() => {
			localValue = externalValue ? { ...externalValue } : null;
		});
	});

	$effect(() => {
		if (autofocus) {
			setTimeout(() => {
				csm.focus();
			}, 30);
		}
	});

	$effect(() => {
		if (disabled) {
			csm.goTo('disabled');
		} else if (readonly && copyable && (localValue?.from || localValue?.to)) {
			csm.goTo('copyable');
		} else if (readonly) {
			csm.goTo('readonly');
		} else {
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
	isDirty={dirty && showDirty}
	clearable={false}
	{error}
	{copyIcon}
	{color}
	{background}
	popupOpen={open}
	controlIcon={'ph ph-calendar-blank'}
	tabindex={disabled || (readonly && !copyable) ? -1 : 0}
	{buttons}
>
	<div class="value-contents" class:placeholder={showPlaceholder}>
		<div class="value">{rangeDisplay}</div>
	</div>
	{#if $csm === 'editing'}
		{#if localValue && showDirty != false}
			<!-- svelte-ignore event_directive_deprecated -->
			<button
				class="clear-button ph ph-x"
				on:click|stopPropagation={clearRange}
				aria-label="Clear date range"
			></button>
		{/if}
	{/if}
</BaseCell>

{#if $csm === 'editing'}
	<SuperPopover
		bind:popup
		{anchor}
		{open}
		align="right"
		maxHeight={400}
		useAnchorWidth={false}
		dismissible={false}
	>
		{#snippet children()}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore event_directive_deprecated -->
			<div class="popup" on:focusout={csm.popupFocusout} on:keydown={csm.popupKeydown}>
				<div
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
			</div>
		{/snippet}
	</SuperPopover>
{/if}

<style>
	.popup {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.value-contents {
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
		overflow: hidden;
		padding: var(--super-cell-padding);
	}

	.value-contents.placeholder {
		color: var(--spectrum-global-color-gray-500);
		font-style: italic !important;
	}

	.value {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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

	.time-input:focus,
	.time-input:focus-visible {
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
