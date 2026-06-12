<script lang="ts">
	import { getContext, untrack } from 'svelte';
	import BaseCell from './BaseCell.svelte';
	import SuperPopover from '../SuperPopover/SuperPopover.svelte';
	import { tooltip } from '../../actions/tooltip';
	import { createEventDispatcher } from 'svelte';
	import fsm from 'svelte-fsm';

	const { API, fetchData, QueryUtils } = getContext('sdk');

	interface Option {
		label: string;
		value: any;
		color?: string;
		icon?: string;
	}

	let { id, cellOptions, fieldSchema, value, autofocus = false } = $props();

	const dispatch = createEventDispatcher();

	let fetch = $state();

	let inputSelect = $derived(cellOptions?.controlType === 'inputSelect');
	let disabled = $derived(cellOptions?.disabled);
	let readonly = $derived(cellOptions?.readonly);
	let copyable = $derived(cellOptions?.copyable);
	let role = $derived(cellOptions?.role);
	let error = $derived(cellOptions?.error);
	let icon = $derived(cellOptions?.icon);
	let filter = $derived(cellOptions?.filter);

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
	let localValue = $derived<Option | null>(
		inputSelect
			? {
					value: options?.find((option) => option.value === value)?.value ?? value,
					label: options?.find((option) => option.value === value)?.label ?? value
				}
			: {
					value: options?.find((option) => option.value === value)?.value,
					label: options?.find((option) => option.value === value)?.label
				}
	);

	let tabindex = $state(0);

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
				dispatch('change', localValue?.value);
				open = false;
			},
			debounce() {
				localValue = {
					value: editor?.value,
					label: editor?.value
				};
			},
			mousedown: (e) => {
				e.preventDefault();
				e.stopPropagation();
				open = !open;
			},
			selectOption: (newValue: string) => {
				if (localValue?.value === newValue) {
					localValue = null;
					return;
				}

				localValue = options.find((option) => option.value === newValue);
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
				navigator.clipboard
					.writeText(value)
					.then(() => {
						// Optionally, you can provide feedback to the user here
						console.log('Value copied to clipboard');
					})
					.catch((err) => {
						console.error('Failed to copy to clipboard:', err);
					});

				return 'justCopied';
			},
			keydown(e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.click();
				}
			}
		},
		justCopied: {
			_enter() {
				setTimeout(() => {
					csm.goTo('copyable');
				}, 400);
			}
		}
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
		} else if (readonly && copyable && value) {
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

	$inspect('Options List', options);
	$inspect('Current Value', localValue);
</script>

<!-- svelte-ignore a11y_interactive_supports_focus -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore event_directive_deprecated -->
<BaseCell {id} bind:anchor {csm} {role} {error} {icon} popupOpen={open}>
	{#key $csm}
		{#if $csm !== 'editing' || !inputSelect}
			<span class="value" class:placeholder={!localValue?.value}>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="value-content" use:tooltip on:mousedown={csm.mousedown}>
					{_message || localValue?.label || cellOptions?.placeholder}
				</div>
			</span>
		{:else}
			<input
				bind:this={editor}
				class="editor"
				{tabindex}
				class:placeholder={!localValue?.value}
				value={_message || localValue?.value}
				placeholder={cellOptions?.placeholder}
				style:text-align={cellOptions.align}
				on:input={csm.debounce}
				on:focusout={csm.focusout}
				on:keydown={csm.keydown}
			/>
		{/if}
		{#if $csm === 'view' || $csm == 'editing'}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<i class="ph ph-caret-down control-icon" on:mousedown|self={csm.mousedown}></i>
		{/if}
	{/key}
</BaseCell>

<SuperPopover {anchor} {open} useAnchorWidth={true} dismissible={false}>
	{#snippet renderOption(option: Option, selected: boolean = option.value === localValue?.value)}
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
