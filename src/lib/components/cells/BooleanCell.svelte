<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import Switch from '../UI/elements/Switch.svelte';
	import Checkbox from '../UI/elements/Checkbox.svelte';

	import {
		cellAlignToJustify,
		resolveColumnCellAlignFromOptions
	} from '../../utils/columnAlign.ts';
	import { normalizeBooleanValue } from './helpers';

	const dispatch = createEventDispatcher();

	let {
		id,
		value,
		cellOptions = {
			role: 'form',
			debounce: false,
			controlType: 'switch'
		},
		autofocus = false
	} = $props();

	let timer = $state();
	let localValue = $state(false);

	let config = $derived(cellOptions ?? {});
	let role = $derived(config.role ?? 'form');
	let isTableCell = $derived(role === 'cell');
	let readonly = $derived(config.readonly);
	let disabled = $derived(config.disabled);
	let error = $derived(config.error);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let showDirty = $derived(config.showDirty);
	let debounceMs = $derived(config.debounce ?? null);
	let controlType = $derived(config.controlType ?? (isTableCell ? 'checkbox' : 'switch'));
	let inlineLabel = $derived(config.inlineLabel);
	let controlIcon = $derived(config.controlIcon ?? 'ph ph-check');
	let selectedColor = $derived(config.selectedColor || 'var(--spectrum-global-color-blue-700)');
	let controlSize = $derived(config.controlSize ?? (role === 'form' ? 'small' : 'medium'));

	let dirty = $derived(config.dirty);
	let align = $derived(
		config.align ??
			resolveColumnCellAlignFromOptions(config.columnSchemaType as string | undefined, {
				columnAlign: config.columnAlign,
				align: config.align
			})
	);
	let justifyContent = $derived(cellAlignToJustify(align));
	let iconToggleDisabled = $derived(disabled || readonly);
	let anchor = $state(null);
	let editor = $state(null);

	const normalizeBoolean = normalizeBooleanValue;

	const focusEditor = () => {
		if (disabled || readonly) return;

		setTimeout(() => {
			editor?.focus?.();
		}, 50);
	};

	const handleToggle = (checked) => {
		const nextValue = checked === true;
		csm.change(nextValue);
		if (!debounceMs) {
			csm.submit(nextValue);
		}
	};

	const handleKeydown = (event) => {
		if (event.code === 'Space' && !disabled && !readonly) {
			event.preventDefault();
			handleToggle(!localValue);
		}
	};

	const csm = fsm('view', {
		'*': {
			goTo(state) {
				return state;
			},
			copy() {},
			click() {},
			change(nextValue) {
				localValue = nextValue;
				if (debounceMs) {
					clearTimeout(timer);
					timer = setTimeout(() => {
						dispatch('change', nextValue);
					}, debounceMs);
				}
			},
			submit(nextValue) {
				clearTimeout(timer);
				dispatch('change', nextValue);
			},
			reset(newValue) {
				if (newValue == localValue) return;
				localValue = normalizeBoolean(value);
				return 'view';
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

				if (isDirty) {
					if (debounceMs) {
						clearTimeout(timer);
					}
					this.submit(localValue);
				}
				dispatch('focusout');
				return readonly ? 'readonly' : 'view';
			},
			cancel() {
				clearTimeout(timer);
				localValue = normalizeBoolean(value);
				dispatch('cancel');
				return readonly ? 'readonly' : 'view';
			}
		}
	});

	let inEdit = $derived($csm === 'editing');
	let isDirty = $derived(inEdit && normalizeBoolean(localValue) !== normalizeBoolean(value));
	let tableCheckboxDisabled = $derived(isTableCell && (disabled || readonly || !inEdit));

	$effect(() => {
		if (!inEdit) {
			localValue = normalizeBoolean(value);
		}
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
		if (autofocus) {
			setTimeout(() => {
				csm.focus();
			}, 50);
		}

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
	isDirty={dirty && showDirty}
	clearable={false}
	{error}
	{color}
	{background}
	on:keydown={handleKeydown}
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	{#key controlType}
		{#if controlType === 'switch'}
			<div
				class="switch-wrapper"
				class:table-cell={isTableCell}
				style:justify-content={justifyContent}
			>
				<Switch
					bind:anchor={editor}
					checked={localValue === true}
					disabled={iconToggleDisabled}
					size={controlSize}
					on:change={(e) => handleToggle(e.detail.checked)}
				/>
				{#if inlineLabel}
					<span class="switch-label">{inlineLabel}</span>
				{/if}
			</div>
		{:else if controlType === 'icon'}
			<div
				class="icon-wrapper"
				class:table-cell={isTableCell}
				style:justify-content={justifyContent}
			>
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
			<div
				class="checkbox-wrapper"
				class:table-cell={isTableCell}
				style:justify-content={justifyContent}
			>
				<span class:table-boolean-checkbox={isTableCell}>
					<Checkbox
						bind:anchor={editor}
						checked={localValue}
						size={controlSize}
						disabled={isTableCell ? tableCheckboxDisabled : iconToggleDisabled}
						on:change={(e) => handleToggle(e.detail.checked)}
					/>
				</span>
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

	.switch-wrapper.table-cell,
	.checkbox-wrapper.table-cell,
	.icon-wrapper.table-cell {
		width: 100%;
		min-width: 0;
	}

	.table-boolean-checkbox {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.table-boolean-checkbox :global(button) {
		border-color: var(--spectrum-global-color-gray-500);
	}

	.table-boolean-checkbox :global(button.disabled:not(.checked)) {
		background-color: rgb(from var(--spectrum-global-color-gray-50) r g b / 0.12);
	}

	.table-boolean-checkbox :global(button.checked) {
		border-color: var(--spectrum-global-color-blue-600) !important;
		background-color: var(--spectrum-global-color-blue-600);
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

	.icon-toggle:focus,
	.icon-toggle:focus-visible {
		outline: none;
		filter: brightness(1.1);
		background: var(--spectrum-global-color-gray-100);
		border-radius: 4px;
		cursor: pointer;
	}

	.table-boolean-view {
		display: flex;
		align-items: center;
		width: 100%;
		min-width: 0;
		flex: 1 1 auto;
		align-self: stretch;
		height: 2rem;
	}

	.table-boolean-check {
		font-size: 14px;
		color: var(--spectrum-global-color-gray-700);
		line-height: 1;
	}
</style>
