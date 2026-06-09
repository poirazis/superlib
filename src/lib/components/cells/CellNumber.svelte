<script>
	import { createEventDispatcher, getContext } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import Textbox from '../UI/elements/Textbox.svelte';
	import CellNumberWheelWrap from './CellNumberWheelWrap.svelte';
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
	let localValue = $state(null);
	let lastEdit = $state();
	let errors = $state([]);
	let editor = $state();
	let justCopied = $state(false);

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
	let copyIcon = $derived(config.copyIcon);
	let align = $derived(config.align ?? 'right');
	let placeholder = $derived(config.placeholder);
	let template = $derived(config.template);
	let decimals = $derived(config.decimals ?? 0);
	let thousandsSeparator = $derived(config.thousandsSeparator ?? ',');
	let showStepper = $derived(config.showStepper ?? true);
	let stepValue = $derived(config.stepSize ?? config.step ?? 1);
	let min = $derived(config.min);
	let max = $derived(config.max);
	let clearValueEnabled = $derived(
		config.clearValue !== false && config.role != 'tableCell'
	);

	let error = $derived(optionError || errors.length > 0);
	let icon = $derived(error ? 'ph ph-warning' : optionIcon);
	let isDirty = $derived(!!lastEdit && value !== localValue);
	let inEdit = $derived($cellState === 'editing');
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

	let clearable = $derived(clearValueEnabled && inEdit && localValue != null && localValue !== '');

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

	function parseEditableValue(raw) {
		if (raw === '' || raw === '-' || raw == null) return null;
		const parsed = Number(raw);
		return Number.isNaN(parsed) ? null : clampValue(Number(parsed.toFixed(decimals ?? 0)));
	}

	export const cellState = fsm('view', {
		'*': {
			goTo(state) {
				return state;
			},
			reset(newValue) {
				if (newValue == localValue) return;
				const num = Number(value);
				localValue = isNaN(num) ? null : num;
				lastEdit = undefined;
				errors = [];
				return initialState;
			}
		},
		view: {
			_enter() {
				const num = Number(value);
				localValue = isNaN(num) ? null : num;
				lastEdit = undefined;
			},
			focus() {
				if (!readonly && !disabled && !calculated) {
					return 'editing';
				}
			}
		},
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
				dispatch('enteredit');
				setTimeout(() => {
					editor?.focus();
				}, 50);
			},
			_exit() {
				lastEdit = undefined;
				dispatch('exitedit');
			},
			focus() {},
			clear() {
				localValue = null;
				lastEdit = new Date();
				dispatch('change', null);
				dispatch('clear', null);
			},
			focusout() {
				dispatch('focusout');
				this.submit();
			},
			submit() {
				if (isDirty) {
					dispatch('change', localValue == null ? null : Number(localValue));
				}
				return initialState;
			},
			cancel() {
				const num = Number(value);
				localValue = isNaN(num) ? null : num;
				lastEdit = undefined;
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
			handleKeyboard(e) {
				const input = e.target;
				const key = e.key;

				if (
					[
						'Enter',
						'Escape',
						'ArrowLeft',
						'ArrowRight',
						'Tab',
						'ArrowUp',
						'ArrowDown'
					].includes(key)
				) {
					if (key === 'Enter') return this.submit();
					if (key === 'Escape') return this.cancel();
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

				if (
					(key.length === 1 && !/[\d.-]/.test(key)) ||
					(key === '.' && input.value.includes('.')) ||
					(key === '.' && (decimals ?? 0) === 0) ||
					(key === '-' && (input.value.includes('-') || input.selectionStart !== 0))
				) {
					e.preventDefault();
				}
			},
			handleInput(e) {
				const input = e.target;
				const newValue = input.value;

				if (
					newValue !== '' &&
					newValue !== '-' &&
					!/^-?\d*\.?\d*$/.test(newValue)
				) {
					input.value = localValue?.toString() ?? '';
					return;
				}

				if (
					newValue.includes('.') &&
					newValue.split('.')[1].length > (decimals ?? 0)
				) {
					input.value = localValue?.toString() ?? '';
					return;
				}

				if (newValue === '' || newValue === '-') {
					localValue = null;
				} else {
					localValue = parseEditableValue(newValue);
					input.value = localValue?.toString() ?? '';
				}

				lastEdit = new Date();
				this.debouncedDispatch();
			},
			increment(e) {
				const multiplier = e?.shiftKey ? 10 : 1;
				const base = localValue == null ? 0 : Number(localValue);
				localValue = clampValue(Number((base + stepValue * multiplier).toFixed(decimals ?? 0)));
				lastEdit = new Date();
				this.debouncedDispatch();
			},
			decrement(e) {
				const multiplier = e?.shiftKey ? 10 : 1;
				const base = localValue == null ? 0 : Number(localValue);
				localValue = clampValue(Number((base - stepValue * multiplier).toFixed(decimals ?? 0)));
				lastEdit = new Date();
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
		focus: () => cellState.focus(),
		reset: () => cellState.reset(value),
		isEditing: () => $cellState === 'editing',
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
		cellState.reset(value);
	});

	$effect(() => {
		if (autofocus) {
			setTimeout(() => {
				cellState.focus();
			}, 50);
		}

		return () => {
			clearTimeout(timer);
		};
	});

	$effect(() => {
		if (disabled) {
			cellState.goTo('disabled');
		} else if (readonly) {
			cellState.goTo('readonly');
		} else if (!inEdit) {
			cellState.goTo('view');
		}
	});
</script>

<!-- svelte-ignore event_directive_deprecated -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<BaseCell
	{id}
	role={config.role}
	state={cellState}
	{icon}
	isDirty={isDirty && showDirty}
	{clearable}
	{error}
	{justCopied}
	{color}
	{background}
>
	{#if icon}
		<i class={icon + ' field-icon'} class:with-error={error}></i>
	{/if}

	{#if inEdit}
		<CellNumberWheelWrap onWheel={cellState.handleWheel}>
			<input
				bind:this={editor}
				class="editor"
				class:placeholder={localValue == null}
				style:text-align={align}
				value={localValue ?? ''}
				{placeholder}
				on:keydown={cellState.handleKeyboard}
				on:input={cellState.handleInput}
				on:focusout={cellState.focusout}
			/>
		</CellNumberWheelWrap>

		{#if showStepper}
			<CellNumberStepper
				onIncrement={(e) => cellState.increment(e)}
				onDecrement={(e) => cellState.decrement(e)}
			/>
		{/if}
	{:else if readonly}
		<Textbox
			bind:justCopied
			value={formattedValue || placeholder}
			{align}
			{copyable}
			{copyIcon}
		/>
	{:else}
		<span
			class="value-display"
			class:placeholder={!formattedValue}
			style:text-align={align}
		>
			{formattedValue || placeholder}
		</span>
	{/if}
</BaseCell>

<style>
	.value-display {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 0.25rem 0.75rem;
	}

	.value-display.placeholder {
		font-style: italic;
		color: var(--spectrum-global-color-gray-600);
	}
</style>