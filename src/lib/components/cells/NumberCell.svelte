<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import { copyAndTransition, deferJustCopied } from './helpers';
	import { isTableCellRole, resolveEmptyViewText, shouldShowCellViewChrome } from './helpers';

	import { tooltip } from '../../actions/tooltip';
	import NumberStepper from './NumberStepper.svelte';
	import { flexAlignToCellAlign } from '../../utils/columnAlign.ts';

	const dispatch = createEventDispatcher();

	let {
		id,
		value,
		displayValue = undefined,
		cellOptions = {
			role: 'form',
			debounce: false
		},
		autofocus = false,
		buttons = []
	} = $props();

	let timer = $state();
	let editText = $state('');

	function normalizeStoredValue(val) {
		if (val == null || val === '') return null;
		const num = Number(val);
		return Number.isNaN(num) ? null : num;
	}

	let localValue = $state();

	let errors = $state([]);
	let editor = $state();
	let config = $derived(cellOptions ?? {});
	let readonly = $derived(config.readonly);
	let disabled = $derived(config.disabled);
	let calculated = $derived(config.calculated);
	let optionError = $derived(config.error);
	let optionIcon = $derived(config.icon);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let showDirty = $derived(config.showDirty);
	let debounceMs = $derived(config.debounce ?? null);
	let copyable = $derived(config.copyable);
	let copyIcon = $derived(config.copyIcon ?? 'always');
	let textAlign = $derived(
		config.align != null && String(config.align).trim() !== ''
			? flexAlignToCellAlign(config.align)
			: 'right'
	);
	let placeholder = $derived(config.placeholder);
	let decimals = $derived(config.decimals ?? 0);
	let thousandsSeparator = $derived(config.thousandsSeparator ?? ',');
	let showStepper = $derived(config.showStepper ?? !isTableCellRole(config.role));
	let stepValue = $derived(config.stepSize ?? config.step ?? 1);
	let min = $derived(config.min);
	let max = $derived(config.max);
	let clearValueEnabled = $derived(
		config.clearValue === true && !isTableCellRole(config.role)
	);

	let error = $derived(optionError || errors.length > 0);
	let icon = $derived(error ? 'ph ph-warning' : optionIcon);
	let dirty = $derived(config.dirty);
	let inEdit = $derived($csm === 'editing');
	let isDirty = $derived(
		inEdit && normalizeStoredValue(value) !== normalizeStoredValue(localValue)
	);
	let formattedValue = $derived.by(() => {
		if (typeof displayValue === 'string') return displayValue;
		return formatNumber(value, thousandsSeparator, decimals);
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
			_enter() {
				localValue = normalizeStoredValue(value);
			},
			focus() {
				if (!readonly && !disabled && !calculated) {
					return 'editing';
				}
			},

			reset(newValue) {
				if (newValue == localValue) return;
				localValue = normalizeStoredValue(value);
				errors = [];
				return 'view';
			}
		},
		copyable: {
			copy() {
				copyAndTransition(() => csm, formattedValue || String(value ?? ''));
			},
			keydown(e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.copy();
				}
			}
		},
		justCopied: deferJustCopied(() => csm),
		readonly: {
			_enter() {
				localValue = normalizeStoredValue(value);
			},
			focus() {}
		},
		disabled: {
			_enter() {
				localValue = normalizeStoredValue(value);
			},
			focus() {}
		},
		editing: {
			_enter() {
				localValue = normalizeStoredValue(value);
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
				clearTimeout(timer);
				const next = parseEditableValue(editText);
				localValue = next;
				if (isDirty) {
					dispatch('change', next == null ? null : Number(next));
				}
				return 'view';
			},
			cancel() {
				clearTimeout(timer);
				localValue = normalizeStoredValue(value);
				syncEditTextFromValue();
				dispatch('cancel');
				return 'view';
			},
			change() {
				if (!debounceMs) return;

				clearTimeout(timer);
				timer = setTimeout(() => {
					dispatch('change', localValue == null ? null : Number(localValue));
				}, debounceMs);
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
					this.change();
				}
			},
			increment(e) {
				const multiplier = e?.shiftKey ? 10 : 1;
				const base = localValue == null ? 0 : Number(localValue);
				localValue = clampValue(Number((base + stepValue * multiplier).toFixed(decimals ?? 0)));
				syncEditTextFromValue();
				this.change();
			},
			decrement(e) {
				const multiplier = e?.shiftKey ? 10 : 1;
				const base = localValue == null ? 0 : Number(localValue);
				localValue = clampValue(Number((base - stepValue * multiplier).toFixed(decimals ?? 0)));
				syncEditTextFromValue();
				this.change();
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
		if (!inEdit) {
			localValue = normalizeStoredValue(value);
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

		tabindex = readonly || disabled ? -1 : 0;
	});
</script>

<!-- svelte-ignore event_directive_deprecated -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<BaseCell
	{id}
	role={config.role ?? 'form'}
	{csm}
	{icon}
	isDirty={dirty && showDirty}
	{clearable}
	{error}
	{copyIcon}
	align={textAlign}
	{color}
	{background}
	{buttons}
>
	{#key $csm}
		{#if inEdit}
			<input
				bind:this={editor}
				class="editor"
				class:placeholder={!localValue}
				style:text-align={textAlign}
				{tabindex}
				value={editText}
				{placeholder}
				on:keydown={csm.keydown}
				on:input={csm.handleInput}
				on:wheel={(e) => csm.handleWheel(e)}
			/>

			{#if showStepper}
				<NumberStepper
					onIncrement={(e) => csm.increment(e)}
					onDecrement={(e) => csm.decrement(e)}
				/>
			{/if}
		{:else}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="value-contents"
				class:placeholder={isEmpty && shouldShowCellViewChrome(config.role, inEdit)}
				use:tooltip
				style:text-align={textAlign}
				on:click={() => anchor?.focus()}
			>
				<div class="value">
					{isEmpty ? resolveEmptyViewText(placeholder, config.role, inEdit) : formattedValue}
				</div>
			</div>
		{/if}
	{/key}
</BaseCell>

<style>
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
		font-style: inherit;
	}
</style>
