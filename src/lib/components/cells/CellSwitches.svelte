<script lang="ts">
	import { getContext, untrack } from 'svelte';
	import BaseCell from './BaseCell.svelte';
	import Switch from '../UI/elements/Switch.svelte';
	import { createEventDispatcher } from 'svelte';
	import fsm from 'svelte-fsm';
	import { copyAndTransition, deferJustCopied } from './cellClipboard';

	const { API, fetchData, QueryUtils } = getContext('sdk');

	interface Option {
		label: string;
		value: any;
		color?: string;
		icon?: string;
	}

	let {
		id,
		cellOptions,
		fieldSchema,
		value,
		multi: multiProp = false,
		autofocus = false
	} = $props();

	const dispatch = createEventDispatcher();

	let fetch = $state();

	let multi = $derived(fieldSchema?.type === 'array' ? true : multiProp);
	let disabled = $derived(cellOptions?.disabled);
	let readonly = $derived(cellOptions?.readonly);
	let copyable = $derived(cellOptions?.copyable);
	let role = $derived(cellOptions?.role);
	let error = $derived(cellOptions?.error);
	let icon = $derived(cellOptions?.icon);
	let filter = $derived(cellOptions?.filter);
	let controlType = $derived(cellOptions?.controlType ?? 'switch');
	let toggleAll = $derived(cellOptions?.toggleAll);
	let showDirty = $derived(cellOptions?.showDirty);
	let debounceDelay = $derived(cellOptions?.debounce);
	let isButtons = $derived(controlType === 'buttons');
	let isRadios = $derived(controlType === 'radio');
	let isSwitches = $derived(controlType === 'switch');
	let cellMultirow = $derived(isSwitches || isRadios);

	let timer = $state<ReturnType<typeof setTimeout>>();

	let _message = $state<string | null>(null);

	let source = $derived(cellOptions?.optionsSource);
	let datasource = $derived(cellOptions.optionsSource == 'data' ? cellOptions.datasource : null);

	let options: Option[] = $derived.by(() => {
		if (source == 'schema') {
			const inclusion = fieldSchema?.constraints?.inclusion || [];
			return inclusion?.map((opt) => ({
				label: opt,
				value: opt,
				color: fieldSchema?.optionColors?.[opt]
			}));
		} else if (source === 'custom') {
			return (
				cellOptions.customOptions?.map((opt) => ({
					label: opt.label,
					value: opt.value,
					color: opt.color,
					icon: opt.icon
				})) ?? []
			);
		} else if (source === 'data' && datasource) {
			return $fetch?.rows?.map((row) => ({
				label: row[cellOptions.labelColumn || cellOptions.valueColumn],
				value: row[cellOptions.valueColumn],
				color: cellOptions.colorColumn ? row[cellOptions.colorColumn] : undefined,
				icon: cellOptions.iconColumn ? row[cellOptions.iconColumn] : undefined
			}));
		}
	});

	let anchor = $state<HTMLElement | null>(null);
	let localValue = $state<Option[]>([]);
	let originalValue = $state('[]');

	let isEmpty = $derived(localValue?.length < 1);
	let allSelected = $derived((options?.length ?? 0) > 0 && localValue.length === options.length);

	let tabindex = $state(0);

	function resolveToOptions(raw: any): Option[] {
		const items = Array.isArray(raw) ? raw : raw != null && raw !== '' ? [raw] : [];

		return items
			.map((item) => {
				if (item && typeof item === 'object' && 'value' in item) {
					const matched = options?.find((option) => option.value === item.value);
					return (
						matched ?? {
							label: item.label ?? String(item.value),
							value: item.value,
							color: item.color
						}
					);
				}

				const matched = options?.find((option) => option.value === item);
				if (matched) return matched;

				return null;
			})
			.filter((item): item is Option => item != null);
	}

	function getEmittedValue() {
		if (multi) {
			return localValue.map((option) => option.value);
		}

		return localValue[0]?.value ?? null;
	}

	function isSelected(option: Option) {
		return localValue.some((selected) => selected.value === option.value);
	}

	function ensureEditing() {
		if ($csm === 'view') {
			csm.focus();
		}
	}

	function scheduleChange() {
		if (!isButtons && !isRadios && !debounceDelay) return;

		clearTimeout(timer);
		timer = setTimeout(() => {
			dispatch('change', getEmittedValue());
			originalValue = JSON.stringify(getEmittedValue());
		}, debounceDelay ?? 0);
	}

	function handleToggle(newValue: string) {
		if (disabled || readonly) return;
		ensureEditing();
		csm.selectOption(newValue);

		if (isButtons || isRadios || debounceDelay) {
			scheduleChange();
		}
	}

	function handleToggleAll() {
		if (disabled || readonly) return;
		ensureEditing();
		csm.toggleAll();

		if (debounceDelay) {
			scheduleChange();
		}
	}

	let csm = fsm('view', {
		'*': {
			goTo: (state) => state
		},
		view: {
			focus: () => {
				anchor?.focus();
				return 'editing';
			}
		},
		editing: {
			_enter: () => {
				originalValue = JSON.stringify(getEmittedValue());

				if (options.length === 0) {
					console.warn('No options available');
					_message = 'No options available';
					setTimeout(() => {
						_message = null;
					}, 1000);
					anchor?.blur();
					return 'view';
				}
			},
			_exit: () => {
				dispatch('change', getEmittedValue());
			},
			toggleAll: () => {
				if (allSelected) {
					localValue = [];
				} else {
					localValue = [...(options ?? [])];
				}
			},
			selectOption: (newValue: string) => {
				const option = options?.find((item) => item.value === newValue);
				if (!option) return;

				const pos = localValue.findIndex((item) => item.value === newValue);

				if (multi) {
					if (pos > -1) {
						localValue = localValue.filter((_, index) => index !== pos);
					} else {
						localValue = [...localValue, option];
					}
					return;
				}

				if (isRadios || pos === -1) {
					localValue = [option];
				} else {
					localValue = [];
				}
			},
			focusout: (e: FocusEvent) => {
				if (anchor?.contains(e.relatedTarget as Node) || anchor?.contains(document.activeElement)) {
					return;
				}
				return 'view';
			}
		},
		copyable: {
			click() {
				const copyValue = localValue.map((option) => option.label).join(', ');

				copyAndTransition(() => csm, copyValue);
			},
			keydown(e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.click();
				}
			}
		},
		justCopied: deferJustCopied(() => csm)
	});

	let canEdit = $derived($csm === 'editing');
	let isDirty = $derived(canEdit && originalValue !== JSON.stringify(getEmittedValue()));

	$effect(() => {
		void value;
		void options;
		localValue = resolveToOptions(value);
	});

	$effect(() => {
		void filter;
		if (datasource) {
			untrack(() => {
				let query = QueryUtils.buildQuery(filter);
				fetch = fetchData({ API, datasource, options: { query } });
			});
		}
	});

	$effect(() => {
		if (disabled) {
			csm.goTo('disabled');
		} else if (readonly && copyable && !isEmpty) {
			csm.goTo('copyable');
		} else if (readonly) {
			csm.goTo('readonly');
		} else {
			csm.goTo('view');
		}

		tabindex = readonly || disabled ? -1 : 0;
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

<!-- svelte-ignore a11y_interactive_supports_focus -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore event_directive_deprecated -->
<BaseCell
	{id}
	bind:anchor
	{csm}
	{role}
	{error}
	{icon}
	multirow={cellMultirow}
	isDirty={isDirty && showDirty}
>
	{#key controlType}
		{#if isRadios}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="radios column" class:inline={role === 'inline'} class:view-mode={!canEdit}>
				{#key options}
					{#if options?.length}
						{#each options as option (option.value)}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="radio"
								class:selected={isSelected(option)}
								on:mousedown={() => handleToggle(option.value)}
							>
								<i
									style:color={option.color}
									class={isSelected(option) ? 'ph-fill ph-radio-button' : 'ph ph-circle'}
								></i>
								{option.label || option.value}
							</div>
						{/each}
					{:else}
						<div class="empty-options">
							{_message || cellOptions?.placeholder || 'No options available'}
						</div>
					{/if}
				{/key}
			</div>
		{:else if isButtons}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="buttons" class:view-mode={!canEdit}>
				{#key options}
					{#if options?.length}
						{#each options as option (option.value)}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="button"
								class:selected={isSelected(option)}
								style:--option-color={option.color}
								on:click={() => handleToggle(option.value)}
							>
								{#if option.icon}
									<i class={option.icon}></i>
								{/if}
								{option.label || option.value}
							</div>
						{/each}
					{:else}
						<div class="empty-options">
							{_message || cellOptions?.placeholder || 'No options available'}
						</div>
					{/if}
				{/key}
			</div>
		{:else if isSwitches}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="switches column" class:view-mode={!canEdit}>
				{#if toggleAll}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="switch toggle-all">
						<div class="text">All</div>
						{#if !(readonly || disabled)}
							<Switch
								checked={allSelected}
								disabled={readonly || disabled || !canEdit}
								size="small"
								on:change={() => handleToggleAll()}
							/>
						{/if}
					</div>
				{/if}
				{#key options}
					{#if options?.length}
						{#each options as option (option.value)}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="switch"
								class:selected={isSelected(option)}
								style:--option-color={option.color}
								on:click|stopPropagation={() => handleToggle(option.value)}
							>
								{#if option.icon}
									<i class={option.icon}></i>
								{/if}
								<div class="text">{option.label || option.value}</div>
								<Switch
									checked={isSelected(option)}
									disabled={readonly || disabled || !canEdit}
									size="small"
									on:change={() => handleToggle(option.value)}
								/>
							</div>
						{/each}
					{:else}
						<div class="empty-options">
							{_message || cellOptions?.placeholder || 'No options available'}
						</div>
					{/if}
				{/key}
			</div>
		{/if}
	{/key}
</BaseCell>

<style>
	.switches {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding: 0.25rem 0.25rem;
		overflow-y: auto;
		min-width: 0;
		width: 100%;
	}

	.switches.column {
		flex-direction: column;
	}

	.switches.view-mode .switch {
		cursor: default;
	}

	.switch {
		width: 100%;
		display: flex;
		gap: 0.35rem;
		align-items: center;
		justify-content: space-between;
		cursor: pointer;
		min-height: 1.75rem;
		padding: 0.25rem 0.5rem;
		color: var(--spectrum-global-color-gray-700);
		box-sizing: border-box;
	}

	.switch > i {
		color: var(--spectrum-global-color-gray-600);
		min-width: 13px;
		font-size: 13px;
	}

	.switch > .text {
		flex: 1 1 auto;
		text-overflow: ellipsis;
		overflow: hidden;
		white-space: nowrap;
	}

	.switch.selected {
		color: var(--spectrum-global-color-gray-800);
	}

	.switch.selected > i {
		color: var(--option-color, var(--spectrum-global-color-gray-700));
	}

	.switch.toggle-all .text {
		font-weight: 600;
		color: var(--spectrum-global-color-gray-600);
	}

	.switch :global(.switch-container) {
		margin-right: unset !important;
	}

	.empty-options {
		padding: 0.25rem 0.75rem;
		color: var(--spectrum-global-color-gray-500);
		font-style: italic;
		font-size: 13px;
	}

	.buttons {
		flex: auto;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		padding: 0.25rem 0.25rem;
		min-width: 0;
		width: 100%;
	}

	.buttons.view-mode .button {
		cursor: default;
	}

	.buttons > .button {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.25rem 0.75rem;
		border: 1px solid var(--spectrum-global-color-gray-400);
		border-radius: 0.5rem;
		background-color: var(--spectrum-global-color-gray-100);
		color: var(--spectrum-global-color-gray-600);
		cursor: pointer;
		user-select: none;
		font-weight: 400;
		transition: all 0.15s ease-in-out;
		white-space: nowrap;
		text-overflow: ellipsis;
		overflow: hidden;
		max-width: 100%;
		gap: 0.35rem;
		max-height: 1.75rem;
	}

	.button:hover {
		background-color: var(--spectrum-global-color-gray-300);
		border-color: var(--spectrum-global-color-gray-300);
		color: var(--spectrum-global-color-gray-800);
	}

	.button:active {
		border-color: var(--spectrum-global-color-gray-500);
		color: var(--spectrum-global-color-gray-800);
	}

	.button.selected {
		background-color: var(--option-color, var(--spectrum-global-color-gray-200));
		border-color: var(--spectrum-global-color-gray-400);
		color: var(--spectrum-global-color-gray-800);
		font-weight: 600;
	}

	.button > i {
		font-size: 13px;
	}

	.radios {
		flex: auto;
		display: flex;
		flex-wrap: wrap;
		padding: 0.25rem 0.25rem;
		min-width: 0;
		width: 100%;
	}

	.radios.inline {
		border: 1px solid var(--spectrum-global-color-gray-300);
		border-radius: 4px;
	}

	.radios.column {
		flex-direction: column;
		min-width: 0;
	}

	.radios.view-mode .radio {
		cursor: default;
	}

	.radio {
		height: 1.75rem;
		display: flex;
		gap: 0.55rem;
		align-items: center;
		cursor: pointer;
		padding: 0 0.5rem;
		opacity: 0.75;
		border-radius: 0.25rem;
		color: var(--spectrum-global-color-gray-700);
	}

	.radio:hover > i {
		color: var(--option-color, var(--spectrum-global-color-gray-700));
		opacity: 1;
	}

	.radio.selected {
		color: var(--spectrum-global-color-gray-800);
		opacity: 1;
	}

	.radio > i {
		font-size: 16px;
		color: var(--spectrum-global-color-gray-600);
	}
</style>
