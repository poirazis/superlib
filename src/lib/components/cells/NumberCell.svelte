<script>
	import { createEventDispatcher, getContext } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import { copyAndTransition, deferJustCopied } from './cellClipboard';
	import { tooltip } from '../../actions/tooltip';
	import CellNumberStepper from './CellNumberStepper.svelte';
	import './CellCommon.css';

	const dispatch = createEventDispatcher();
	const { processStringSync } = getContext('sdk');
	const context = getContext('context');

	let {
		id,
		value,
		cellOptions = {
			role: 'form',
			initialState: 'view',
			debounce: false
		},
		autofocus = false
	} = $props();

	let timer = $state();
	let localValue = $derived(value);
	let editText = $state('');

	let errors = $state([]);
	let editor = $state();
	let config = $derived(cellOptions ?? {});
	let initialState = $derived(config.initialState || 'view');
	let readonly = $derived(config.readonly);
	let disabled = $derived(config.disabled);
	let calculated = $derived(config.calculated);
	let optionError = $derived(config.error);
	let optionIcon = $derived(config.icon);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let showDirty = $derived(config.showDirty);
	let debounceDelay = $derived(config.debounce);
	let copyable = $derived(config.copyable);
	let copyIcon = $derived(config.copyIcon ?? 'always');
	let align = $derived(config.align ?? 'right');
	let placeholder = $derived(config.placeholder);
	let template = $derived(config.template);
	let decimals = $derived(config.decimals ?? 0);
	let thousandsSeparator = $derived(config.thousandsSeparator ?? ',');
	let showStepper = $derived(config.showStepper ?? true);
	let stepValue = $derived(config.stepSize ?? config.step ?? 1);
	let min = $derived(config.min);
	let max = $derived(config.max);
	let clearValueEnabled = $derived(config.clearValue !== false && config.role !== 'inline');

	let error = $derived(optionError || errors.length > 0);
	let icon = $derived(error ? 'ph ph-warning' : optionIcon);
	let isDirty = $derived(value !== localValue);
	let inEdit = $derived($csm === 'editing');
	let displayValue = $derived(inEdit ? localValue : (value ?? null));

	let formattedValue = $derived.by(() => {
		const formatted = formatNumber(displayValue, thousandsSeparator, decimals);
		if (template) {
			return processStringSync(template, {
				...$context,
				value: formatted
			});
		}
		return formatted;
	});

	let isEmpty = $derived(formattedValue === '' || formattedValue == null);

	let clearable = $derived(clearValueEnabled && inEdit && editText !== '');
	let tabindex = $state(0);

	function formatNumber(num, separator, decimalPlaces) {
		const parsedNum = typeof num === 'string' ? parseFloat(num) : num;
		if (isNaN(parsedNum) || (parsedNum !== 0 && !parsedNum)) return '';

		let fixed;
		if (decimalPlaces === undefined && typeof num === 'string') {
			fixed = parsedNum.toString();
		} else {
			fixed = parsedNum.toFixed(decimalPlaces ?? 0);
		}

		if (!separator) return fixed;

		const parts = fixed.split('.');
		parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separator);
		return parts.join('.');
	}

	function clampValue(num) {
		let result = num;
		if (min !== undefined && result < min) result = min;
		if (max !== undefined && result > max) result = max;
		return result;
	}

	function normalizeEditText(raw) {
		return raw.replace(',', '.');
	}

	function isValidEditText(raw) {
		return raw === '' || raw === '-' || /^-?\d*\.?\d*$/.test(raw);
	}

	function hasTooManyDecimals(raw) {
		if (!raw.includes('.')) return false;
		return raw.split('.')[1].length > (decimals ?? 0);
	}

	function isCompleteEditText(raw) {
		if (raw === '' || raw === '-') return true;
		return !raw.endsWith('.');
	}

	function parseEditableValue(raw) {
		const normalized = normalizeEditText(raw);
		if (normalized === '' || normalized === '-' || normalized == null) return null;
		const parsed = Number(normalized);
		return Number.isNaN(parsed) ? null : clampValue(Number(parsed.toFixed(decimals ?? 0)));
	}

	function syncEditTextFromValue() {
		editText = localValue != null ? String(localValue) : '';
	}

	export const csm = fsm('view', {
		'*': {
			goTo(state) {
				return state;
			}
		},
		view: {
			_enter() {},
			click() {
				return this.focus();
			},
			focus() {
				if (!readonly && !disabled && !calculated) {
					return 'editing';
				}
			},

			reset(newValue) {
				if (newValue == localValue) return;
				const num = Number(value);
				localValue = isNaN(num) ? null : num;
				errors = [];
				return initialState;
			}
		},
		copyable: {
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
		readonly: {
			_enter() {
				const num = Number(value);
				localValue = isNaN(num) ? null : num;
			},
			focus() {}
		},
		disabled: {
			_enter() {
				const num = Number(value);
				localValue = isNaN(num) ? null : num;
			},
			focus() {}
		},
		editing: {
			_enter() {
				syncEditTextFromValue();
				dispatch('enteredit');
				setTimeout(() => {
					editor?.focus();
				}, 50);
			},
			_exit() {
				dispatch('exitedit');
			},
			focus() {},
			clear() {
				editText = '';
				localValue = null;
				dispatch('change', null);
				dispatch('clear', null);
			},
			focusout() {
				dispatch('focusout');
				this.submit();
			},
			submit() {
				const next = parseEditableValue(editText);
				localValue = next;
				if (value != next) {
					dispatch('change', next == null ? null : Number(next));
				}
				return initialState;
			},
			cancel() {
				const num = Number(value);
				localValue = isNaN(num) ? null : num;
				syncEditTextFromValue();
				dispatch('cancel');
				return initialState;
			},
			debouncedDispatch() {
				if (debounceDelay) {
					clearTimeout(timer);
					timer = setTimeout(() => {
						dispatch('change', localValue == null ? null : Number(localValue));
					}, debounceDelay);
				}
			},
			keydown(e) {
				const input = e.target;
				const key = e.key;

				if (
					['Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'Tab', 'ArrowUp', 'ArrowDown'].includes(
						key
					)
				) {
					if (key === 'Enter') {
						e.preventDefault();
						e.stopPropagation();
						return this.submit();
					}
					if (key === 'Escape') {
						e.preventDefault();
						e.stopPropagation();
						return this.cancel();
					}
					if (key === 'ArrowUp') {
						e.preventDefault();
						this.increment(e);
						return;
					}
					if (key === 'ArrowDown') {
						e.preventDefault();
						this.decrement(e);
						return;
					}
					return;
				}

				const hasDecimal = input.value.includes('.') || input.value.includes(',');

				if (
					(key.length === 1 && !/[\d.,-]/.test(key)) ||
					((key === '.' || key === ',') && hasDecimal) ||
					((key === '.' || key === ',') && (decimals ?? 0) === 0) ||
					(key === '-' && (input.value.includes('-') || input.selectionStart !== 0))
				) {
					e.preventDefault();
				}
			},
			handleInput(e) {
				const input = e.target;
				const newValue = normalizeEditText(input.value);

				if (!isValidEditText(newValue)) {
					input.value = editText;
					return;
				}

				if (hasTooManyDecimals(newValue)) {
					input.value = editText;
					return;
				}

				editText = newValue;
				input.value = newValue;

				if (newValue === '' || newValue === '-') {
					localValue = null;
				} else if (isCompleteEditText(newValue)) {
					localValue = parseEditableValue(newValue);
				}

				if (isCompleteEditText(newValue)) {
					this.debouncedDispatch();
				}
			},
			increment(e) {
				const multiplier = e?.shiftKey ? 10 : 1;
				const base = localValue == null ? 0 : Number(localValue);
				localValue = clampValue(Number((base + stepValue * multiplier).toFixed(decimals ?? 0)));
				syncEditTextFromValue();
				this.debouncedDispatch();
			},
			decrement(e) {
				const multiplier = e?.shiftKey ? 10 : 1;
				const base = localValue == null ? 0 : Number(localValue);
				localValue = clampValue(Number((base - stepValue * multiplier).toFixed(decimals ?? 0)));
				syncEditTextFromValue();
				this.debouncedDispatch();
			},
			handleWheel(e) {
				e.preventDefault();
				e.stopPropagation();
				if (e.shiftKey) {
					if (e.deltaX < 0) this.increment(e);
					else this.decrement(e);
				} else {
					if (e.deltaY < 0) this.increment(e);
					else this.decrement(e);
				}
			}
		}
	});

	export const cellApi = {
		focus: () => csm.focus(),
		reset: () => csm.reset(value),
		isEditing: () => $csm === 'editing',
		isDirty: () => isDirty,
		getValue: () => localValue,
		setError: (err) => {
			errors = [...errors, err];
		},
		clearError: () => {
			errors = [];
		},
		setValue: (val) => {
			value = val;
		}
	};

	$effect(() => {
		if (autofocus) {
			setTimeout(() => {
				csm.focus();
			}, 50);
		}

		return () => {
			clearTimeout(timer);
		};
	});

	$effect(() => {
		if (disabled) {
			csm.goTo('disabled');
		} else if (readonly && copyable && value != null && value !== '') {
			csm.goTo('copyable');
		} else if (readonly) {
			csm.goTo('readonly');
		} else {
			csm.goTo('view');
		}

		tabindex = readonly || disabled ? -1 : 0;
	});
</script>

<!-- svelte-ignore event_directive_deprecated -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<BaseCell
	{id}
	role={config.role}
	{csm}
	{icon}
	isDirty={isDirty && showDirty}
	{clearable}
	{error}
	{copyIcon}
	{color}
	{background}
>
	{#if inEdit}
		<input
			bind:this={editor}
			class="editor"
			class:placeholder={!localValue}
			style:text-align={align}
			{tabindex}
			value={editText}
			{placeholder}
			on:keydown={csm.keydown}
			on:input={csm.handleInput}
			on:wheel={(e) => csm.handleWheel(e)}
		/>

		{#if showStepper}
			<CellNumberStepper
				onIncrement={(e) => csm.increment(e)}
				onDecrement={(e) => csm.decrement(e)}
			/>
		{/if}
	{:else}
		<span class="value" class:placeholder={isEmpty}>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="value-content" use:tooltip style:text-align={align} on:click={csm.click}>
				{isEmpty ? placeholder : formattedValue}
			</div>
		</span>
	{/if}
</BaseCell>

<style>
	span.value {
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
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.value-content {
		min-width: 0;
		flex: 1;
		font-style: inherit;
		font-size: 13px;
		text-overflow: ellipsis;
		overflow: hidden;
		white-space: nowrap;
	}

	.value.placeholder .value-content {
		color: var(--spectrum-global-color-gray-500);
		font-style: italic !important;
	}
</style>
