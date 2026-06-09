<script>
	import { createEventDispatcher, getContext } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import { copyTextToClipboard } from './cellClipboard';

	const dispatch = createEventDispatcher();
	const { processStringSync } = getContext('sdk');

	let {
		id,
		value,
		cellOptions = {
			role: 'form',
			initialState: 'view',
			debounce: 250
		},
		autofocus = false
	} = $props();

	let timer = $state();
	let localValue = $state(null);
	let errors = $state([]);
	let editor = $state();
	let isValidJson = $state(true);
	let lastEdit = $state();

	let config = $derived(cellOptions ?? {});
	let initialState = $derived(config.initialState || 'view');
	let readonly = $derived(config.readonly);
	let disabled = $derived(config.disabled);
	let optionError = $derived(config.error);
	let optionIcon = $derived(config.icon);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let showDirty = $derived(config.showDirty);
	let debounceDelay = $derived(config.debounce);
	let copyable = $derived(config.copyable);
	let copyIcon = $derived(config.copyIcon ?? 'always');
	let placeholder = $derived(config.placeholder);

	let justCopied = $state(false);
	let multiline = $derived(
		config.multiline || config.controlType === 'multiline' || config.controlType === 'textarea'
	);

	let baseRole = $derived(
		config.role === 'inlineInput' || config.role === 'inline'
			? 'inline'
			: config.role === 'tableCell' || config.role === 'cell'
				? 'cell'
				: 'form'
	);

	const validateJson = (input) => {
		if (input === null || input === undefined || input === '') return true;
		try {
			if (typeof input === 'string') {
				JSON.parse(input);
			} else {
				JSON.parse(JSON.stringify(input));
			}
			return true;
		} catch {
			return false;
		}
	};

	let normalizedValue = $derived(
		value && validateJson(value) && typeof value !== 'string' ? JSON.stringify(value) : value
	);

	let formattedValue = $derived.by(() => {
		if (config.template && normalizedValue) {
			return processStringSync(config.template, { value: normalizedValue });
		}
		return normalizedValue;
	});

	let displayValue = $derived.by(() => {
		if (!normalizedValue && placeholder) return placeholder;
		if (!validateJson(normalizedValue)) return 'Invalid JSON';
		try {
			return multiline
				? JSON.stringify(JSON.parse(normalizedValue), null, 2)
				: JSON.stringify(JSON.parse(normalizedValue));
		} catch {
			return normalizedValue ?? '';
		}
	});

	let editValue = $derived.by(() => {
		if ($cellState !== 'editing') return displayValue;
		if (multiline && localValue != null) {
			if (!validateJson(localValue)) return localValue;
			try {
				return JSON.stringify(JSON.parse(localValue), null, 2);
			} catch {
				return localValue;
			}
		}
		return localValue ?? '';
	});

	let error = $derived(optionError || errors.length > 0 || !isValidJson);
	let icon = $derived(error ? 'ph ph-warning' : optionIcon);
	let isDirty = $derived(!!lastEdit && normalizedValue !== localValue);
	let clearable = $derived(
		config.role != 'tableCell' && $cellState === 'editing' && localValue != null && localValue !== ''
	);

	export const cellState = fsm('view', {
		'*': {
			goTo(state) {
				return state;
			},
			reset(newValue) {
				localValue = normalizedValue;
				lastEdit = undefined;
				isValidJson = validateJson(value);
				errors = [];
				return initialState;
			}
		},
		view: {
			_enter() {
				localValue = normalizedValue;
				isValidJson = validateJson(value);
			},
			focus() {
				if (!readonly && !disabled) {
					return 'editing';
				}
			}
		},
		readonly: {
			_enter() {
				localValue = normalizedValue;
			}
		},
		copyable: {
			_enter() {
				localValue = normalizedValue;
			},
			click() {
				copyTextToClipboard(String(displayValue ?? ''), (copied) => (justCopied = copied));
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
				localValue = normalizedValue;
			}
		},
		editing: {
			_enter() {
				localValue = normalizedValue;
				isValidJson = validateJson(value);
				dispatch('enteredit');
				setTimeout(() => {
					editor?.focus();
				}, 50);
			},
			_exit() {
				dispatch('exitedit');
			},
			clear() {
				localValue = null;
				isValidJson = true;
				lastEdit = new Date();
				if (debounceDelay) {
					dispatch('change', null);
				}
				dispatch('clear', null);
			},
			focusout() {
				dispatch('focusout');
				this.submit();
			},
			submit() {
				if (isDirty && isValidJson) {
					dispatch('change', localValue);
				}
				return initialState;
			},
			cancel() {
				localValue = normalizedValue;
				isValidJson = validateJson(value);
				dispatch('cancel');
				return initialState;
			},
			debounce(e) {
				const target = e.target;
				const newValue = target.value;
				isValidJson = validateJson(newValue);
				localValue = newValue;
				lastEdit = new Date();
				if (debounceDelay && isValidJson) {
					clearTimeout(timer);
					timer = setTimeout(() => {
						dispatch('change', localValue);
					}, debounceDelay);
				}
			},
			keydown(e) {
				if (e.key === 'Enter' && !multiline) {
					this.submit();
				}
				if (e.key === 'Escape') {
					this.cancel();
				}
			}
		}
	});

	export const cellApi = {
		focus: () => cellState.focus(),
		reset: () => cellState.reset(),
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
		cellState.reset(normalizedValue);
	});

	$effect(() => {
		if (autofocus) {
			setTimeout(() => {
				cellState.focus();
			}, 50);
		}

		return () => {
			if (timer) {
				clearTimeout(timer);
			}
		};
	});

	$effect(() => {
		if (disabled) {
			cellState.goTo('disabled');
		} else if (readonly && copyable && normalizedValue) {
			cellState.goTo('copyable');
		} else if (readonly) {
			cellState.goTo('readonly');
		} else if ($cellState !== 'editing') {
			cellState.goTo('view');
		}
	});
</script>

<!-- svelte-ignore event_directive_deprecated -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<BaseCell
	{id}
	role={baseRole}
	state={cellState}
	{icon}
	multirow={multiline}
	isDirty={isDirty && showDirty}
	{clearable}
	{error}
	{justCopied}
	{copyIcon}
	{color}
	{background}
>
	{#if icon && !multiline}
		<i class={icon + ' field-icon'} class:with-error={error}></i>
	{/if}

	{#if multiline}
		<textarea
			bind:this={editor}
			class="editor json-editor"
			class:placeholder={!localValue && !formattedValue}
			disabled={$cellState != 'editing'}
			placeholder={placeholder ?? ''}
			value={$cellState === 'editing' ? editValue : displayValue}
			on:input={cellState.debounce}
			on:focusout={cellState.focusout}
			on:keydown={cellState.keydown}
		></textarea>
	{:else}
		<input
			bind:this={editor}
			class="editor"
			class:placeholder={!localValue && !formattedValue}
			disabled={$cellState != 'editing'}
			value={$cellState === 'editing' ? (localValue ?? '') : (formattedValue ?? displayValue ?? '')}
			placeholder={placeholder ?? ''}
			style:text-align={config.align}
			on:input={cellState.debounce}
			on:focusout={cellState.focusout}
			on:keydown={cellState.keydown}
		/>
	{/if}
</BaseCell>

<style>
	:global(.super-cell > textarea.json-editor) {
		font-family: monospace;
		white-space: pre-wrap;
		overflow-wrap: break-word;
		min-height: 8rem;
		overflow-y: auto;
		resize: vertical;
	}
</style>