<script lang="ts">
	import { createEventDispatcher, getContext } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import SuperPopover from '../SuperPopover/SuperPopover.svelte';
	import { tooltip } from '../../actions/tooltip';
	import { copyAndTransition, deferJustCopied } from './cellClipboard';

	const dispatch = createEventDispatcher();
	const { processStringSync } = getContext('sdk');

	let {
		id,
		value,
		cellOptions = {
			role: 'form',
			debounce: 250
		},
		autofocus = false
	} = $props();

	let timer = $state<ReturnType<typeof setTimeout>>();
	let localValue = $state<string | null>(null);
	let originalValue = $state<string | null>(null);
	let errors = $state<string[]>([]);
	let anchor = $state<HTMLElement | null>(null);
	let editor = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
	let popup = $state<HTMLElement | null>(null);
	let open = $state(false);
	let isValidJson = $state(true);
	let tabindex = $state(0);

	let config = $derived(cellOptions ?? {});
	let controlType = $derived(config.controlType ?? 'singleLine');
	let isPopup = $derived(controlType === 'popup');
	let isMultiline = $derived(
		controlType === 'multiline' || config.multiline || controlType === 'textarea'
	);
	let isInline = $derived(!isPopup);

	let readonly = $derived(config.readonly);
	let disabled = $derived(config.disabled);
	let optionError = $derived(config.error);
	let icon = $derived(config.icon);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let showDirty = $derived(config.showDirty);
	let debounceDelay = $derived(config.debounce);
	let copyable = $derived(config.copyable);
	let copyIcon = $derived(config.copyIcon ?? 'always');
	let placeholder = $derived(config.placeholder);
	let popupHeight = $derived(config.popupHeight ?? 280);
	let baseRole = $derived(config.role === 'inline' ? 'inline' : 'form');

	const validateJson = (input: unknown) => {
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

	const normalizeIncoming = (raw: unknown): string | null => {
		if (raw == null || raw === '') return null;
		if (typeof raw === 'string') return raw;
		try {
			return JSON.stringify(raw);
		} catch {
			return String(raw);
		}
	};

	let normalizedValue = $derived(normalizeIncoming(value));

	let formattedValue = $derived.by(() => {
		if (config.template && normalizedValue) {
			return processStringSync(config.template, { value: normalizedValue });
		}
		return normalizedValue;
	});

	const formatJson = (raw: string | null, pretty = false) => {
		if (!raw) return '';
		if (!validateJson(raw)) return 'Invalid JSON';
		try {
			const parsed = JSON.parse(raw);
			return pretty ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed);
		} catch {
			return raw;
		}
	};

	let displayValue = $derived.by(() => {
		if (!normalizedValue && placeholder) return placeholder;
		return formatJson(normalizedValue, isMultiline || isPopup);
	});

	let editValue = $derived.by(() => {
		if (localValue == null) return '';
		if (!validateJson(localValue)) return localValue;
		return formatJson(localValue, isMultiline || isPopup);
	});

	let error = $derived(optionError || errors.length > 0 || !isValidJson);
	let inEdit = $derived($csm === 'editing');
	let isEmpty = $derived(!formattedValue && formattedValue !== '0');
	let isDirty = $derived(inEdit && localValue !== originalValue);
	let clearable = $derived(
		config.role !== 'inline' && inEdit && localValue != null && localValue !== ''
	);

	const emitChange = (nextValue: string | null) => {
		dispatch('change', nextValue);
		dispatch('labelChange', nextValue);
	};

	const applyInput = (newValue: string) => {
		isValidJson = validateJson(newValue);
		localValue = newValue;

		if (debounceDelay && isValidJson) {
			clearTimeout(timer);
			timer = setTimeout(() => emitChange(localValue), debounceDelay);
		}
	};

	const csm = fsm('view', {
		'*': {
			goTo: (state: string) => state
		},
		view: {
			_enter() {
				localValue = normalizedValue;
				isValidJson = validateJson(normalizedValue);
			},
			focus() {
				if (!readonly && !disabled) return 'editing';
			},
			click() {
				if (!readonly && !disabled) return 'editing';
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
				copyAndTransition(() => csm, String(displayValue ?? ''));
			},
			keydown(e: KeyboardEvent) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.click();
				}
			}
		},
		justCopied: deferJustCopied(() => csm),
		disabled: {
			_enter() {
				localValue = normalizedValue;
			}
		},
		editing: {
			_enter() {
				originalValue = normalizedValue;
				localValue = normalizedValue;
				isValidJson = validateJson(normalizedValue);
				open = isPopup;
				dispatch('enteredit');
				setTimeout(() => editor?.focus(), isPopup ? 0 : 50);
			},
			_exit() {
				open = false;
				dispatch('exitedit');
			},
			click() {
				if (isPopup) {
					open = !open;
					if (open) {
						setTimeout(() => editor?.focus(), 0);
					}
				}
			},
			clear() {
				localValue = null;
				isValidJson = true;
				if (debounceDelay) {
					emitChange(null);
				}
				dispatch('clear', null);
			},
			focusout(e: FocusEvent) {
				if (!isPopup) return;
				if (popup?.contains(e.relatedTarget as Node)) return;
				this.submit();
			},
			popupFocusout(e: FocusEvent) {
				if (anchor?.contains(e.relatedTarget as Node)) return;
				return this.submit();
			},
			popupKeydown(e: KeyboardEvent) {
				if (e.key === 'Tab') {
					e.preventDefault();
					anchor?.focus();
					return this.submit();
				}
			},
			submit() {
				if (isDirty && isValidJson) {
					emitChange(localValue);
				}
				return 'view';
			},
			cancel() {
				localValue = originalValue;
				isValidJson = validateJson(originalValue);
				open = false;
				dispatch('cancel');
				return 'view';
			},
			debounce(e: Event) {
				applyInput((e.target as HTMLInputElement | HTMLTextAreaElement).value);
			},
			keydown(e: KeyboardEvent) {
				const target = e.target as HTMLElement | null;
				const typingInEditor =
					target === editor ||
					target?.tagName === 'TEXTAREA' ||
					target?.tagName === 'INPUT' ||
					(target != null && popup?.contains(target));

				if (e.key === 'Enter' && !isMultiline && !isPopup) {
					this.submit();
				}
				if (e.key === 'Escape') {
					if (isPopup && open) {
						open = false;
						e.preventDefault();
						anchor?.focus();
						return;
					}
					this.cancel();
				}
				if (
					isPopup &&
					(e.key === ' ' || e.keyCode === 32) &&
					!typingInEditor
				) {
					e.preventDefault();
					open = !open;
					if (open) setTimeout(() => editor?.focus(), 0);
				}
			}
		}
	});

	$effect(() => {
		if ($csm !== 'editing') {
			localValue = normalizedValue;
			isValidJson = validateJson(normalizedValue);
		}
	});

	$effect(() => {
		if (disabled) {
			csm.goTo('disabled');
		} else if (readonly && copyable && normalizedValue) {
			csm.goTo('copyable');
		} else if (readonly) {
			csm.goTo('readonly');
		} else if ($csm !== 'editing') {
			csm.goTo('view');
		}

		tabindex = readonly || disabled ? -1 : 0;
	});

	$effect(() => {
		if (autofocus) {
			setTimeout(() => csm.focus(), 50);
		}

		return () => {
			if (timer) clearTimeout(timer);
		};
	});
</script>

<!-- svelte-ignore event_directive_deprecated -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<BaseCell
	{id}
	role={baseRole}
	{csm}
	bind:anchor
	{icon}
	multirow={isMultiline}
	isDirty={isDirty && showDirty}
	{clearable}
	{error}
	{copyIcon}
	{color}
	{background}
	popupOpen={isPopup ? open : undefined}
	{tabindex}
>
	{#key $csm}
		{#if inEdit && isInline}
			{#if isMultiline}
				<textarea
					bind:this={editor}
					class="editor json-editor"
					class:placeholder={!localValue && !formattedValue}
					placeholder={placeholder ?? ''}
					value={editValue}
					on:input={csm.debounce}
					on:focusout={csm.focusout}
					on:keydown={csm.keydown}
				></textarea>
			{:else}
				<input
					bind:this={editor}
					class="editor"
					class:placeholder={!localValue && !formattedValue}
					value={localValue ?? ''}
					placeholder={placeholder ?? ''}
					style:text-align={config.align}
					on:input={csm.debounce}
					on:focusout={csm.focusout}
					on:keydown={csm.keydown}
				/>
			{/if}
		{:else}
			<span class="value" class:placeholder={isEmpty}>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="value-content" class:json-preview={isPopup} use:tooltip>
					{isEmpty ? placeholder : displayValue}
				</div>
			</span>
			{#if isPopup && ($csm === 'view' || inEdit)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<i class="ph ph-arrows-out-simple control-icon" on:click|self={csm.click}></i>
			{/if}
		{/if}
	{/key}
</BaseCell>

{#if isPopup && inEdit}
	<!-- svelte-ignore event_directive_deprecated -->
	<SuperPopover
		{anchor}
		{open}
		useAnchorWidth={true}
		minWidth={360}
		maxHeight={popupHeight + 48}
		dismissible={false}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore event_directive_deprecated -->
		<div
			class="popup"
			bind:this={popup}
			style:--popup-height="{popupHeight}px"
			on:focusout={csm.popupFocusout}
			on:keydown={csm.popupKeydown}
		>
			<div class="json-popup">
			<div class="json-popup-header">
				<span>JSON Editor</span>
				{#if !isValidJson}
					<span class="json-popup-error">Invalid JSON</span>
				{/if}
			</div>
			<textarea
				bind:this={editor}
				class="json-popup-editor"
				class:invalid={!isValidJson}
				placeholder={placeholder ?? 'Enter JSON'}
				value={editValue}
				on:input={csm.debounce}
				on:keydown={csm.keydown}
			></textarea>
			</div>
		</div>
	</SuperPopover>
{/if}

<style>
	.popup {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	span.value {
		min-width: 0;
		max-width: 100%;
		flex: 1 1 auto;
		display: flex;
		align-items: stretch;
		height: 100%;
		background: transparent;
		color: inherit;
		border: none;
		outline: none;
		cursor: inherit;
		padding: 0.25rem 0.75rem;
		overflow: hidden;
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

	.value-content.json-preview {
		font-family: monospace;
	}

	.value.placeholder .value-content {
		color: var(--spectrum-global-color-gray-500);
		font-style: italic !important;
	}

	:global(.super-cell > textarea.json-editor) {
		font-family: monospace;
		white-space: pre-wrap;
		overflow-wrap: break-word;
		min-height: 8rem;
		overflow-y: auto;
		resize: vertical;
	}

	.json-popup {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.json-popup-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--spectrum-global-color-gray-200);
		font-size: 12px;
		color: var(--spectrum-global-color-gray-700);
	}

	.json-popup-error {
		color: var(--spectrum-global-color-red-600);
		font-weight: 600;
	}

	.json-popup-editor {
		width: 100%;
		height: var(--popup-height);
		min-height: var(--popup-height);
		box-sizing: border-box;
		border: none;
		outline: none;
		resize: vertical;
		padding: 0.75rem;
		font-family: monospace;
		font-size: 12px;
		line-height: 1.45;
		color: var(--spectrum-global-color-gray-800);
		background: var(--spectrum-global-color-gray-50);
	}

	.json-popup-editor.invalid {
		box-shadow: inset 0 0 0 1px var(--spectrum-global-color-red-400);
	}
</style>