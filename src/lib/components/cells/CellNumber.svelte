<script>
	import { createEventDispatcher } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';

	const dispatch = createEventDispatcher();

	let {
		id,
		value,
		cellOptions = {
			role: 'formInput',
			initialState: 'view',
			debounce: 250
		},
		autofocus = false
	} = $props();

	let timer = $state();
	let localValue = $derived(value);
	let errors = $state([]);
	let editor = $state();

	let config = $derived(cellOptions ?? {});
	let initialState = $derived(config.initialState || 'view');
	let min = $derived(config.min);
	let max = $derived(config.max);
	let step = $derived(config.step);
	let clearable = $derived(
		config.role != 'tableCell' && $cellState === 'editing' && localValue != null
	);

	let readonly = $derived(config.readonly);
	let optionError = $derived(config.error);
	let optionIcon = $derived(config.icon);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let showDirty = $derived(config.showDirty);
	let debounceDelay = $derived(config.debounce);
	let copyable = $derived(config.copyable);
	let disabled = $derived(config.disabled);

	let error = $derived(optionError || errors.length > 0);
	let icon = $derived(error ? 'ph ph-warning' : optionIcon);
	let isDirty = $derived(value !== localValue);

	let justCopied = $state(false);
	let tabindex = $state(0);

	const parseInputValue = (raw) => {
		if (raw === '' || raw == null) {
			return null;
		}
		const parsed = parseFloat(raw);
		return Number.isNaN(parsed) ? null : parsed;
	};

	export const cellState = fsm('view', {
		'*': {
			goTo(state) {
				return state;
			},
			reset(newValue) {
				if (newValue == localValue) return;
				localValue = value;
				errors = [];
				return initialState;
			}
		},
		view: {
			_enter() {
				localValue = value;
			},
			focus(e) {
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
			copy() {
				navigator.clipboard
					.writeText(value == null ? '' : String(value))
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
				localValue = value;
			}
		},
		editing: {
			_enter() {
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
				localValue = null;
				if (debounceDelay) {
					dispatch('change', localValue);
				}

				dispatch('clear', null);
			},
			focusout(e) {
				dispatch('focusout');
				this.submit();
			},
			submit() {
				if (isDirty) {
					dispatch('change', localValue);
				}
				return initialState;
			},
			cancel() {
				localValue = value;
				dispatch('cancel');
				return initialState;
			},
			debounce(e) {
				const target = e.target;
				localValue = parseInputValue(target.value);
				if (debounceDelay) {
					clearTimeout(timer);
					timer = setTimeout(() => {
						dispatch('change', localValue);
					}, debounceDelay);
				}
			},
			handleKeyboard(e) {
				if (e.key === 'Enter') {
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
		} else if (readonly && copyable && value != null) {
			cellState.goTo('copyable');
		} else if (readonly) {
			cellState.goTo('readonly');
		} else {
			cellState.goTo('view');
		}

		tabindex = readonly || disabled ? -1 : 0;
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

	<input
		bind:this={editor}
		class="editor"
		{tabindex}
		type="number"
		class:placeholder={localValue == null}
		disabled={$cellState != 'editing'}
		value={$cellState === 'editing' ? (localValue ?? '') : (value ?? '')}
		placeholder={cellOptions?.placeholder}
		style:text-align={cellOptions.align}
		{min}
		{max}
		{step}
		on:input={cellState.debounce}
		on:focusout={cellState.focusout}
		on:keydown={cellState.handleKeyboard}
	/>
</BaseCell>