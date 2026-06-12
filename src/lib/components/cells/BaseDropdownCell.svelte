<script lang="ts">
	import { getContext, untrack } from 'svelte';
	import BaseCell from './BaseCell.svelte';
	import SuperPopover from '../SuperPopover/SuperPopover.svelte';
	import { tooltip } from '../../actions/tooltip';
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
	let inputSelect = $derived(cellOptions?.controlType === 'inputSelect');
	let disabled = $derived(cellOptions?.disabled);
	let readonly = $derived(cellOptions?.readonly);
	let copyable = $derived(cellOptions?.copyable);
	let role = $derived(cellOptions?.role);
	let error = $derived(cellOptions?.error);
	let icon = $derived(cellOptions?.icon);
	let filter = $derived(cellOptions?.filter);
	let optionsViewMode = $derived(cellOptions?.optionsViewMode ?? 'text');

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
					color: opt.color
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
	let editor = $state<HTMLInputElement | null>(null);

	let open = $state(false);
	let localValue = $state<Option[]>([]);

	let isEmpty = $derived(localValue?.length < 1);
	let pills = $derived(optionsViewMode === 'pills');
	let bullets = $derived(optionsViewMode === 'bullets');
	let plaintext = $derived(optionsViewMode === 'text');

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

				if (inputSelect) {
					return { label: String(item), value: item };
				}

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

	let csm = fsm('view', {
		'*': {
			goTo: (state) => state
		},
		view: {
			mousedown: () => {
				this.focus({});
			},
			focus: (e) => {
				if (options.length === 0) {
					console.warn('No options available for dropdown');
					_message = 'No options available';
					setTimeout(() => {
						_message = null;
					}, 1000);
					return;
				}

				anchor?.focus();
				return 'editing';
			}
		},
		editing: {
			_enter: () => {
				open = true;
				setTimeout(() => {
					editor?.focus();
				}, 0);
			},
			_exit: () => {
				dispatch('change', getEmittedValue());
				open = false;
			},
			debounce() {
				localValue = [
					{
						value: editor?.value,
						label: editor?.value
					}
				];
			},
			click: (e) => {
				open = !open;
			},
			selectOption: (newValue: string) => {
				const option = options.find((item) => item.value === newValue);
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

				if (pos > -1) {
					localValue = [];
				} else {
					localValue = [option];
				}

				open = false;
				anchor?.blur();
				return 'view';
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
				const copyValue = Array.isArray(value)
					? value.join(', ')
					: value != null
						? String(value)
						: '';

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
	});

	$effect(() => {
		console.log(localValue);
	});
</script>

<!-- svelte-ignore a11y_interactive_supports_focus -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore event_directive_deprecated -->
<BaseCell {id} bind:anchor {csm} {role} {error} {icon} popupOpen={open}>
	{#key $csm}
		{#if $csm !== 'editing' || !inputSelect}
			<span class="value" class:placeholder={isEmpty}>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="value-content" use:tooltip on:click={csm.click}>
					{#key localValue}
						{#if isEmpty}
							{_message || cellOptions?.placeholder || 'Select...'}
						{:else}
							<div class="items" class:pills class:bullets>
								{#if plaintext}
									{#each localValue as val, idx (val.value)}
										{val.label}{idx < localValue.length - 1 ? ', ' : ''}
									{/each}
								{:else}
									{#each localValue as val (val.value)}
										<div class="item" style:--option-color={val.color}>
											<div class="loope"></div>
											<span>{val.label}</span>
										</div>
									{/each}
								{/if}
							</div>
						{/if}
					{/key}
				</div>
			</span>
		{:else}
			<input
				bind:this={editor}
				class="editor"
				{tabindex}
				class:placeholder={isEmpty}
				value={_message || localValue[0]?.value}
				placeholder={cellOptions?.placeholder}
				style:text-align={cellOptions.align}
				on:input={csm.debounce}
				on:focusout={csm.focusout}
				on:keydown={csm.keydown}
			/>
		{/if}
		{#if $csm === 'view' || $csm == 'editing'}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<i class="ph ph-caret-down control-icon" on:click|self={csm.click}></i>
		{/if}
	{/key}
</BaseCell>

<SuperPopover {anchor} {open} useAnchorWidth={true} dismissible={false}>
	{#snippet renderOption(option: Option, selected: boolean = isSelected(option))}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore event_directive_deprecated -->
		<div
			class="option"
			class:selected
			on:mousedown|preventDefault={() => csm.selectOption(option.value)}
		>
			{#if option?.icon}
				<span class="icon">{option.icon}</span>
			{/if}
			<span class="label" use:tooltip>{option?.label}</span>
			{#if selected}
				<span class="ph ph-check"></span>
			{/if}
		</div>
	{/snippet}

	<div class="options">
		{#each options as option (option.value)}
			{@render renderOption(option)}
		{/each}
	</div>
</SuperPopover>

<style>
	.options {
		display: flex;
		flex-direction: column;
		height: auto;
		max-height: 300px;
		overflow-y: auto;
		overflow-x: hidden;
	}

	.option {
		padding: 0.5em 1em;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.5em;
		min-width: 0;
	}

	.option:hover,
	.option.selected {
		background-color: var(--spectrum-global-color-gray-100);
	}

	.option.selected {
		font-weight: 500;
	}

	.label {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	span.value:has(.items) {
		white-space: normal;
	}

	.value-content {
		min-width: 0;
		flex: 1;
		font-style: inherit;
		font-size: 13px;
		text-overflow: ellipsis;
		overflow: hidden;
		white-space: nowrap;
		display: flex;
		align-items: center;
	}

	.value-content:has(.items) {
		white-space: normal;
		display: flex;
	}

	.value.placeholder .value-content {
		color: var(--spectrum-global-color-gray-500);
		font-style: italic !important;
	}

	.items {
		flex: auto;
		display: flex;
		overflow: hidden;
		align-items: stretch;
		gap: 0.5rem;
		min-width: 0;
	}

	.item {
		display: flex;
		align-items: center;
		overflow: hidden;
		min-width: 0;
		gap: 0.5rem;
		padding: 0rem 0.5rem;
	}

	.item span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.item .loope {
		display: none;
	}

	.items.pills .item {
		background-color: var(--option-color, var(--spectrum-global-color-gray-100));
		border: 1px solid var(--option-color, var(--spectrum-global-color-gray-200));
		border-radius: 4px;
		align-self: stretch;
		padding: 0.25rem 0.5rem;
		font-size: 12px;
	}

	.items.bullets .item {
		padding: unset;
	}

	.items.bullets .item .loope {
		display: block;
	}

	.loope {
		width: 14px;
		height: 14px;
		border-radius: 2px;
		background-color: var(--option-color, var(--spectrum-global-color-gray-300));
		flex-shrink: 0;
	}
</style>
