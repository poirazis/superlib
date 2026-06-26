<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import { copyAndTransition, deferJustCopied } from './helpers';
	import { resolveEmptyViewText } from './helpers';

	import { tooltip } from '../../actions/tooltip';

	const dispatch = createEventDispatcher();

	let {
		id,
		value,
		displayValue = undefined,
		cellOptions = {
			role: 'form'
		},
		autofocus = false,
		buttons = []
	} = $props();

	// Local state (runes)
	let timer = $state();
	let localValue = $state();
	let errors = $state([]);
	let editor = $state();

	// Destructure cellOptions reactively (must be before FSM because FSM methods close over these)
	let config = $derived(cellOptions ?? {});
	let viewText = $derived(typeof displayValue === 'string' ? displayValue : value);

	let controlType = $derived(config.controlType);
	let clearable = $derived(config.clearable && localValue && $csm === 'editing');

	let readonly = $derived(config.readonly);
	let optionError = $derived(config.error);
	let icon = $derived(config.icon);
	let color = $derived(config.color);
	let background = $derived(config.background);

	let debounceMs = $derived(config.debounce ?? null);
	let copyable = $derived(config.copyable);
	let copyIcon = $derived(config.copyIcon ?? 'always');
	let disabled = $derived(config.disabled);

	// Derived values that do not depend on $csm
	let error = $derived(optionError || errors.length > 0);

	let showDirty = $derived(config.showDirty);
	let dirty = $derived(config.dirty);
	let textarea = $derived(controlType === 'textarea');
	let inEdit = $derived($csm === 'editing');
	let isDirty = $derived(inEdit && value != localValue);
	let isEmpty = $derived(!viewText && viewText !== 0);

	let tabindex = $state(0);

	// FSM created here — methods close over the derived/state values declared above
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
				localValue = value;
			},
			focus(e) {
				if (!readonly && !disabled) {
					return 'editing';
				}
			}
		},
		readonly: {},
		copyable: {
			copy() {
				copyAndTransition(() => csm, String(value ?? ''));
			},
			keydown(e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.copy();
				}
			}
		},
		justCopied: deferJustCopied(() => csm),
		disabled: {},
		editing: {
			_enter() {
				localValue = value;
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
				if (debounceMs) {
					clearTimeout(timer);
					timer = setTimeout(() => dispatch('change', localValue), debounceMs);
				}

				dispatch('clear', null);
			},
			focusout(e) {
				dispatch('focusout');
				this.submit();
			},
			submit() {
				clearTimeout(timer);
				if (isDirty) {
					dispatch('change', localValue);
				}
				return 'view';
			},
			cancel() {
				clearTimeout(timer);
				localValue = value;
				dispatch('cancel');
				return 'view';
			},
			change(e) {
				const target = e.target;
				localValue = target.value;
				if (debounceMs) {
					clearTimeout(timer);
					timer = setTimeout(() => {
						dispatch('change', localValue);
					}, debounceMs);
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

	// Lifecycle via effect (replaces onMount + onDestroy)
	$effect(() => {
		if (autofocus) {
			setTimeout(() => {
				csm.focus();
			}, 50);
		}

		return () => clearTimeout(timer);
	});

	$effect(() => {
		if (!inEdit) {
			localValue = value;
		}
	});

	$effect(() => {
		if (disabled) {
			csm.goTo('disabled');
		} else if (readonly && copyable) {
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
	role={config.role ?? 'form'}
	{csm}
	{icon}
	multirow={controlType == 'textarea'}
	isDirty={dirty && showDirty}
	{clearable}
	{error}
	{copyIcon}
	align={cellOptions.align}
	{color}
	{background}
	{buttons}
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
					on:input={csm.change}
					on:focusout={csm.focusout}
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
					on:input={csm.change}
					on:focusout={csm.focusout}
					on:keydown={csm.keydown}
				/>
			{/if}
		{:else}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="value-contents"
				class:placeholder={isEmpty}
				class:textarea
				use:tooltip
				style:text-align={cellOptions.align}
			>
				<div class="value">
					{isEmpty ? resolveEmptyViewText(cellOptions?.placeholder, config.role, inEdit) : viewText}
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

	.value-contents.textarea {
		align-items: flex-start;
		align-self: stretch;
		height: auto;
		min-height: 100%;
		white-space: pre-wrap;
		overflow-wrap: break-word;
		overflow: auto;
		padding: var(--super-cell-padding);
	}

	.value-contents.textarea .value {
		white-space: pre-wrap;
		overflow-wrap: break-word;
		text-overflow: unset;
		overflow: visible;
	}
</style>
