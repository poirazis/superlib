<script>
	import { createEventDispatcher } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import { copyTextToClipboard } from './cellClipboard';
	import Switch from '../UI/elements/Switch.svelte';
	import Checkbox from '../UI/elements/Checkbox.svelte';
	import './CellCommon.css';

	const dispatch = createEventDispatcher();

	let {
		id,
		value,
		cellOptions = {
			role: 'form',
			initialState: 'editing',
			debounce: false,
			controlType: 'switch'
		}
	} = $props();

	let timer = $state();
	let localValue = $state();
	let originalValue = $state();

	let config = $derived(cellOptions ?? {});
	let initialState = $derived(config.initialState || 'editing');
	let role = $derived(config.role || 'form');
	let readonly = $derived(config.readonly);
	let disabled = $derived(config.disabled);
	let optionError = $derived(config.error);
	let optionIcon = $derived(config.icon);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let showDirty = $derived(config.showDirty);
	let debounceDelay = $derived(config.debounce);
	let controlType = $derived(config.controlType || 'switch');
	let inlineLabel = $derived(config.inlineLabel);
	let align = $derived(config.align ?? 'flex-start');
	let showFalse = $derived(config.showFalse);
	let copyable = $derived(config.copyable);
	let copyIcon = $derived(config.copyIcon ?? 'always');

	let justCopied = $state(false);
	let error = $derived(optionError);
	let icon = $derived(error ? 'ph ph-warning' : optionIcon);
	let isDirty = $derived(localValue !== value);
	let tableCell = $derived(role === 'cell');
	let showEditor = $derived($cellState === 'editing' || !tableCell);

	const emitChange = (nextValue) => {
		if (debounceDelay) {
			clearTimeout(timer);
			timer = setTimeout(() => {
				dispatch('change', nextValue);
			}, debounceDelay);
			return;
		}

		dispatch('change', nextValue);
	};

	const handleToggle = (checked) => {
		localValue = checked;
		emitChange(checked);
	};

	const handleKeydown = (event) => {
		if (event.code === 'Space' && !disabled && !readonly) {
			event.preventDefault();
			handleToggle(!localValue);
		}
	};

	export const cellState = fsm('editing', {
		'*': {
			goTo(state) {
				return state;
			},
			reset(newValue) {
				if (newValue == localValue) return;
				localValue = value;
				return initialState;
			},
			toggle() {
				if (disabled || readonly) return;
				handleToggle(!localValue);
			}
		},
		view: {
			_enter() {
				localValue = value;
			},
			focus() {
				if (!readonly && !disabled) {
					return 'editing';
				}
			}
		},
		readonly: {
			_enter() {
				localValue = value;
			}
		},
		copyable: {
			_enter() {
				localValue = value;
			},
			copy() {
				copyTextToClipboard(String(!!value), (copied) => (justCopied = copied));
			}
		},
		disabled: {
			_enter() {
				localValue = value;
			}
		},
		editing: {
			_enter() {
				originalValue = value;
				localValue = value;
				dispatch('enteredit');
			},
			_exit() {
				dispatch('exitedit');
			},
			focus() {},
			focusout() {
				if (localValue !== originalValue) {
					emitChange(localValue);
				}
				dispatch('focusout');
				return readonly ? 'readonly' : tableCell ? 'view' : 'editing';
			},
			cancel() {
				localValue = value;
				dispatch('cancel');
				return readonly ? 'readonly' : tableCell ? 'view' : 'editing';
			}
		}
	});

	export const cellApi = {
		reset: () => cellState.reset(),
		isDirty: () => isDirty,
		getValue: () => localValue,
		setValue: (val) => {
			localValue = !!val;
		}
	};

	$effect(() => {
		localValue = value;
	});

	$effect(() => {
		if (disabled) {
			cellState.goTo('disabled');
		} else if (readonly && copyable && value != null) {
			cellState.goTo('copyable');
		} else if (readonly) {
			cellState.goTo('readonly');
		} else if (tableCell) {
			cellState.goTo('view');
		} else {
			cellState.goTo('editing');
		}
	});

	$effect(() => {
		return () => {
			if (timer) {
				clearTimeout(timer);
			}
		};
	});
</script>

<!-- svelte-ignore event_directive_deprecated -->
<BaseCell
	{id}
	role={role === 'inline' ? 'inline' : role === 'cell' ? 'cell' : 'form'}
	state={cellState}
	{icon}
	isDirty={isDirty && showDirty}
	clearable={false}
	{error}
	{justCopied}
	{copyIcon}
	{color}
	{background}
>
	{#if icon}
		<i class={icon + ' field-icon'} class:with-error={error}></i>
	{/if}

	{#if showEditor}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="boolean-editor" style:justify-content={align} on:keydown={handleKeydown}>
			{#if controlType === 'switch'}
				<div class="switch-wrapper">
					<Switch
						checked={localValue}
						disabled={disabled || readonly}
						size="medium"
						on:change={(e) => handleToggle(e.detail.checked)}
					/>
					{#if inlineLabel}
						<span class="switch-label">{inlineLabel}</span>
					{/if}
				</div>
			{:else}
				<div class="checkbox-wrapper">
					<Checkbox
						checked={localValue}
						size="medium"
						disabled={disabled || readonly}
						on:change={(e) => handleToggle(e.detail.checked)}
					/>
					{#if inlineLabel}
						<span class="checkbox-label">{inlineLabel}</span>
					{/if}
				</div>
			{/if}
		</div>
	{:else}
		<div class="boolean-value" style:justify-content={align}>
			{#if localValue}
				<i class="ph ph-check valueicon"></i>
			{:else if showFalse}
				<i class="ph ph-x valueicon"></i>
			{/if}
		</div>
	{/if}
</BaseCell>

<style>
	.boolean-editor,
	.boolean-value {
		display: flex;
		align-items: center;
		width: 100%;
		height: 100%;
		padding: 0.25rem 0.75rem;
		box-sizing: border-box;
	}

	.switch-wrapper,
	.checkbox-wrapper {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.switch-label,
	.checkbox-label {
		margin-left: 0.25rem;
	}

	.valueicon {
		font-size: 1rem;
		color: var(--spectrum-global-color-gray-700);
	}
</style>