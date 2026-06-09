<script>
	import { createEventDispatcher, getContext } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';

	const dispatch = createEventDispatcher();
	const { processStringSync } = getContext('sdk');

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

	// Local state (runes)
	let timer = $state();
	let localValue = $derived(value);
	let errors = $state([]);
	let editor = $state();

	// Destructure cellOptions reactively (must be before FSM because FSM methods close over these)
	let config = $derived(cellOptions ?? {});
	let initialState = $derived(config.initialState || 'view');
	let formattedValue = $derived.by(() => {
		if (config.template && value) {
			return processStringSync(config.template, { value });
		}
		return value;
	});

	let controlType = $derived(config.controlType);
	let clearable = $derived(config.role != 'tableCell' && $cellState === 'editing' && localValue);

	let readonly = $derived(config.readonly);
	let optionError = $derived(config.error);
	let optionIcon = $derived(config.icon);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let showDirty = $derived(config.showDirty);
	let debounceDelay = $derived(config.debounce);
	let copyable = $derived(config.copyable);
	let copyIcon = $derived(config.copyIcon ?? 'always');
	let disabled = $derived(config.disabled);

	// Derived values that do not depend on $cellState
	let error = $derived(optionError || errors.length > 0);
	let icon = $derived(error ? 'ph ph-warning' : optionIcon);
	let isDirty = $derived(value !== localValue);
	let textarea = $derived(controlType === 'textarea');

	let justCopied = $state(false);
	let tabindex = $state(0);

	// FSM created here — methods close over the derived/state values declared above
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
			click() {
				navigator.clipboard
					.writeText(value)
					.then(() => {
						justCopied = true;
						setTimeout(() => {
							justCopied = false;
						}, 400);
					})
					.catch((err) => {
						console.error('Failed to copy to clipboard:', err);
					});
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
				localValue = target.value;
				if (debounceDelay) {
					clearTimeout(timer);
					timer = setTimeout(() => {
						dispatch('change', localValue);
					}, debounceDelay);
				}
			},
			keydown(e) {
				if (e.key === 'Enter' && !e.shiftKey) {
					this.submit();
				}
				if (e.key === 'Escape') {
					this.cancel();
				}
			}
		}
	});

	// Public API
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

	// Lifecycle via effect (replaces onMount + onDestroy)
	$effect(() => {
		if (autofocus) {
			setTimeout(() => {
				cellState.focus();
			}, 50);
		}

		// cleanup
		return () => {
			if (timer) {
				clearTimeout(timer);
			}
		};
	});

	$effect(() => {
		if (disabled) {
			cellState.goTo('disabled');
		} else if (readonly && copyable && value) {
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
	multirow={controlType == 'textarea'}
	isDirty={isDirty && showDirty}
	{clearable}
	{error}
	{justCopied}
	{copyIcon}
	{color}
	{background}
>
	{#if icon && !textarea}
		<i class={icon + ' field-icon'} class:with-error={error}></i>
	{/if}

	{#key textarea}
		{#if textarea}
			<textarea
				bind:this={editor}
				class="editor"
				class:placeholder={!localValue}
				disabled={$cellState != 'editing'}
				placeholder={cellOptions?.placeholder}
				value={localValue}
				on:input={cellState.debounce}
				on:focusout={cellState.focusout}
				on:keydown={cellState.keydown}
			></textarea>
		{:else}
			<input
				bind:this={editor}
				class="editor"
				{tabindex}
				class:placeholder={!localValue}
				disabled={$cellState != 'editing'}
				value={$cellState === 'editing' ? localValue : formattedValue}
				placeholder={cellOptions?.placeholder}
				style:text-align={cellOptions.align}
				on:input={cellState.debounce}
				on:focusout={cellState.focusout}
				on:keydown={cellState.keydown}
			/>
		{/if}
	{/key}
</BaseCell>
