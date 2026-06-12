<script>
	import { createEventDispatcher, getContext } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import { copyAndTransition, deferJustCopied } from './cellClipboard';
	import { tooltip } from '../../actions/tooltip';

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
	let clearable = $derived(config.role != 'tableCell' && $csm === 'editing' && localValue);

	let readonly = $derived(config.readonly);
	let optionError = $derived(config.error);
	let icon = $derived(config.icon);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let showDirty = $derived(config.showDirty);
	let debounceDelay = $derived(config.debounce);
	let copyable = $derived(config.copyable);
	let copyIcon = $derived(config.copyIcon ?? 'always');
	let disabled = $derived(config.disabled);

	// Derived values that do not depend on $csm
	let error = $derived(optionError || errors.length > 0);

	let isDirty = $derived(value !== localValue);
	let textarea = $derived(controlType === 'textarea');
	let inEdit = $derived($csm === 'editing');
	let isEmpty = $derived(!formattedValue && formattedValue !== 0);

	let tabindex = $state(0);

	// FSM created here — methods close over the derived/state values declared above
	export const csm = fsm('view', {
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
			click() {
				return this.focus();
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
				copyAndTransition(() => csm, String(value ?? ''));
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
		focus: () => csm.focus(),
		reset: () => csm.reset(),
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
				csm.focus();
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
			csm.goTo('disabled');
		} else if (readonly && copyable && value) {
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
	multirow={controlType == 'textarea'}
	isDirty={isDirty && showDirty}
	{clearable}
	{error}
	{copyIcon}
	{color}
	{background}
>
	{#key $csm}
		{#if inEdit}
			{#if textarea}
				<textarea
					bind:this={editor}
					class="editor"
					class:placeholder={!localValue}
					placeholder={cellOptions?.placeholder}
					value={localValue}
					on:input={csm.debounce}
					on:keydown={csm.keydown}
				></textarea>
			{:else}
				<input
					bind:this={editor}
					class="editor"
					{tabindex}
					class:placeholder={!localValue}
					value={localValue}
					placeholder={cellOptions?.placeholder}
					style:text-align={cellOptions.align}
					on:input={csm.debounce}
					on:focusout={csm.focusout}
					on:keydown={csm.keydown}
				/>
			{/if}
		{:else}
			<span class="value" class:placeholder={isEmpty}>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="value-content"
					use:tooltip
					style:text-align={cellOptions.align}
					on:click={csm.click}
				>
					{isEmpty ? cellOptions?.placeholder : formattedValue}
				</div>
			</span>
		{/if}
	{/key}
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
