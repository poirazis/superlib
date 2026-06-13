<script>
	import { createEventDispatcher } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import Switch from '../UI/elements/Switch.svelte';
	import Checkbox from '../UI/elements/Checkbox.svelte';

	const dispatch = createEventDispatcher();

	let {
		id,
		value,
		cellOptions = {
			role: 'form',
			initialState: 'view',
			debounce: false,
			controlType: 'switch'
		}
	} = $props();

	let timer = $state();
	let localValue = $state(false);
	let originalValue = $state(false);

	function normalizeBoolean(val) {
		return val === true;
	}

	let config = $derived(cellOptions ?? {});
	let initialState = $derived(config.initialState || 'view');
	let role = $derived(config.role || 'form');
	let readonly = $derived(config.readonly);
	let disabled = $derived(config.disabled);
	let error = $derived(config.error);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let showDirty = $derived(config.showDirty);
	let debounceDelay = $derived(config.debounce);
	let controlType = $derived(config.controlType || 'switch');
	let inlineLabel = $derived(config.inlineLabel);
	let controlIcon = $derived(config.controlIcon ?? 'ph ph-check');
	let selectedColor = $derived(config.selectedColor || 'var(--spectrum-global-color-blue-700)');

	let isDirty = $derived(localValue !== normalizeBoolean(value));
	let iconToggleDisabled = $derived(disabled || readonly);
	let anchor = $state(null);
	let editor = $state(null);

	const focusEditor = () => {
		if (disabled || readonly) return;

		setTimeout(() => {
			editor?.focus?.();
		}, 50);
	};

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
		const nextValue = checked === true;
		localValue = nextValue;
		emitChange(nextValue);
	};

	const handleKeydown = (event) => {
		if (event.code === 'Space' && !disabled && !readonly) {
			event.preventDefault();
			handleToggle(!localValue);
		}
	};

	export const csm = fsm('view', {
		'*': {
			goTo(state) {
				return state;
			},
			reset(newValue) {
				if (newValue == localValue) return;
				localValue = normalizeBoolean(value);
				return initialState;
			},
			toggle() {
				if (disabled || readonly) return;
				handleToggle(!localValue);
			}
		},
		view: {
			_enter() {
				localValue = normalizeBoolean(value);
			},
			click() {
				return this.focus();
			},
			focus() {
				if (!readonly && !disabled) {
					return 'editing';
				}
			}
		},
		readonly: {
			_enter() {
				localValue = normalizeBoolean(value);
			}
		},
		disabled: {
			_enter() {
				localValue = normalizeBoolean(value);
			}
		},
		editing: {
			_enter() {
				originalValue = normalizeBoolean(value);
				localValue = normalizeBoolean(value);
				dispatch('enteredit');
				focusEditor();
			},
			_exit() {
				dispatch('exitedit');
			},
			focus() {
				focusEditor();
			},
			focusout(e) {
				if (anchor?.contains(e.relatedTarget)) return;

				if (localValue !== originalValue) {
					emitChange(localValue);
				}
				dispatch('focusout');
				return readonly ? 'readonly' : initialState;
			},
			cancel() {
				localValue = normalizeBoolean(value);
				dispatch('cancel');
				return readonly ? 'readonly' : initialState;
			}
		}
	});

	export const cellApi = {
		focus: () => csm.focus(),
		reset: () => csm.reset(),
		isDirty: () => isDirty,
		getValue: () => localValue,
		setValue: (val) => {
			localValue = !!val;
		}
	};

	$effect(() => {
		localValue = normalizeBoolean(value);
	});

	$effect(() => {
		if (disabled) {
			csm.goTo('disabled');
		} else if (readonly) {
			csm.goTo('readonly');
		} else {
			csm.goTo('view');
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
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<BaseCell
	{id}
	{role}
	{csm}
	bind:anchor
	naked={true}
	isDirty={isDirty && showDirty}
	clearable={false}
	{error}
	{color}
	{background}
	on:keydown={handleKeydown}
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	{#key controlType}
		{#if controlType === 'switch'}
			<div class="switch-wrapper">
				<Switch
					bind:anchor={editor}
					checked={localValue === true}
					disabled={iconToggleDisabled}
					size="medium"
					on:change={(e) => handleToggle(e.detail.checked)}
				/>
				{#if inlineLabel}
					<span class="switch-label">{inlineLabel}</span>
				{/if}
			</div>
		{:else if controlType === 'icon'}
			<div class="icon-wrapper">
				<!-- svelte-ignore a11y_consider_explicit_label -->
				<button
					bind:this={editor}
					type="button"
					class="icon-toggle"
					class:selected={localValue}
					disabled={iconToggleDisabled}
					aria-pressed={localValue}
					on:click={() => handleToggle(!localValue)}
				>
					{#if controlIcon}
						<i class={controlIcon} style:color={localValue ? selectedColor : undefined}></i>
					{/if}
				</button>
				{#if inlineLabel}
					<span class="icon-label">{inlineLabel}</span>
				{/if}
			</div>
		{:else}
			<div class="checkbox-wrapper">
				<Checkbox
					bind:anchor={editor}
					checked={localValue}
					size="medium"
					disabled={iconToggleDisabled}
					on:change={(e) => handleToggle(e.detail.checked)}
				/>
				{#if inlineLabel}
					<span class="checkbox-label">{inlineLabel}</span>
				{/if}
			</div>
		{/if}
	{/key}
</BaseCell>

<style>
	.switch-wrapper,
	.checkbox-wrapper,
	.icon-wrapper {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		height: 2rem;
	}

	.switch-label,
	.checkbox-label,
	.icon-label {
		margin-left: 0.25rem;
	}

	.icon-toggle {
		flex: 1;
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: none;
		background: transparent;
		cursor: pointer;
		align-self: stretch;
		transition:
			background 0.15s ease,
			border-color 0.15s;
	}

	.icon-toggle:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.icon-toggle i {
		font-size: 1rem;
		color: var(--spectrum-global-color-gray-400);
		transition: color 0.15s ease;
	}

	.icon-toggle:not(:disabled):hover {
		filter: brightness(1.1);
		background: var(--spectrum-global-color-gray-100);
		border-radius: 4px;
		cursor: pointer;
	}

	.icon-toggle.selected i {
		color: var(--selected-color, var(--spectrum-global-color-blue-700));
	}

	.icon-toggle:focus {
		filter: brightness(1.1);
		background: var(--spectrum-global-color-gray-100);
		border-radius: 4px;
		cursor: pointer;
	}
</style>
