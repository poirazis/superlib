<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { dndzone, dragHandleZone, dragHandle } from 'svelte-dnd-action';
	import { generate } from 'shortid';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import SimpleButton from '../UI/elements/SimpleButton.svelte';
	import { copyAndTransition, deferJustCopied } from './cellClipboard';

	let {
		id,
		value = [],
		cellOptions,
		fieldSchema,
		reorder = 'handle',
		minItems = '',
		maxItems = '',
		autofocus = false
	} = $props();

	const dispatch = createEventDispatcher();

	let zoneType = generate();
	let cellValues = $state<string[]>(['']);
	let dragging = $state(false);
	let focusedRowIndex = $state(-1);
	let anchor = $state<HTMLElement | null>(null);
	let rowErrors = $state<string[]>([]);
	let draggableItems = $state<Array<{ id: string; value: string; index: number }>>([]);
	let rowIds = $state<string[]>([]);
	let originalValue = $state<string[]>([]);
	let tabindex = $state(0);

	let config = $derived(cellOptions ?? {});
	let role = $derived(config.role ?? 'form');
	let readonly = $derived(config.readonly);
	let disabled = $derived(config.disabled);
	let icon = $derived(config.icon);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let showDirty = $derived(config.showDirty);
	let copyable = $derived(config.copyable);
	let copyIcon = $derived(config.copyIcon ?? 'always');
	let placeholder = $derived(config.placeholder);
	let align = $derived(config.align);

	let parsedMin = $derived.by(() => {
		const raw = minItems ? parseInt(minItems, 10) : 0;
		return isNaN(raw) ? 0 : raw;
	});

	let parsedMax = $derived.by(() => {
		const raw = maxItems ? parseInt(maxItems, 10) : 0;
		return isNaN(raw) ? 0 : raw;
	});

	let outputValue = $derived(cellValues.filter((x) => x));
	let canEdit = $derived($csm === 'editing');
	let rowLocked = $derived(readonly || disabled || !canEdit);
	let isDirty = $derived(canEdit && JSON.stringify(outputValue) !== JSON.stringify(originalValue));
	let hasCopyValue = $derived(
		Array.isArray(value) ? value.length > 0 : value != null && value !== ''
	);
	let displayText = $derived(outputValue.join(', '));
	let showActions = $derived(
		canEdit &&
			!readonly &&
			!disabled &&
			!(parsedMin > 0 && parsedMax > 0 && parsedMin === parsedMax)
	);
	let useDnD = $derived(reorder !== 'disabled');

	const focusInput = (node: HTMLInputElement, active: boolean) => {
		if (active) {
			node.focus();
		}

		return {
			update(active: boolean) {
				if (active) {
					node.focus();
				}
			}
		};
	};

	const enrichValue = (val: unknown): string[] => {
		let result: string[];

		if (Array.isArray(val)) {
			result = val.length ? [...val.filter((x) => x)] : [''];
		} else if (val) {
			result = String(val)
				.split(',')
				.map((x) => x.trim())
				.filter((x) => x);
		} else {
			result = [''];
		}

		return applyMinMaxConstraints(result, parsedMin, parsedMax);
	};

	const applyMinMaxConstraints = (rows: string[], min: number, max: number) => {
		let updated = [...rows];

		while (updated.length < min) {
			updated.push('');
		}

		while (updated.length > min && updated[updated.length - 1] === '') {
			updated.pop();
		}

		if (max > 0 && updated.length > max) {
			updated = updated.slice(0, max);
		}

		if (updated.length === 0) {
			updated = [''];
		}

		return updated;
	};

	const commitValue = () => {
		dispatch('change', [...outputValue]);
		dispatch('labelChange', outputValue.join(', ') || null);
	};

	const clearAllRowErrors = () => {
		rowErrors = cellValues.map(() => '');
	};

	const setRowError = (index: number, message: string) => {
		rowErrors = cellValues.map((_, i) => (i === index ? message : (rowErrors[i] ?? '')));
	};

	const focusRow = (index: number) => {
		focusedRowIndex = index;
	};

	const brain = {
		handleChange: (detail: unknown, index: number) => {
			if (rowLocked) return;

			clearAllRowErrors();

			const nextValue = detail == null ? '' : String(detail);
			const isDuplicate = cellValues.some(
				(val, i) => i !== index && val === nextValue && val !== ''
			);

			if (cellValues[index] !== nextValue && !isDuplicate) {
				cellValues[index] = nextValue;
				cellValues = [...cellValues];
			} else if (isDuplicate) {
				setRowError(index, 'Duplicate value');
				focusRow(index);
			} else if (!nextValue) {
				rowErrors.splice(index, 1);
				cellValues.splice(index, 1);
				cellValues = [...cellValues];
				rowErrors = [...rowErrors];
			}

			commitValue();
		},
		validateInstances: () => {
			if (dragging) return;

			const next = applyMinMaxConstraints(
				cellValues.filter((x) => x),
				parsedMin,
				parsedMax
			);

			if (JSON.stringify(next) !== JSON.stringify(cellValues)) {
				cellValues = next;
			}

			clearAllRowErrors();
		},
		moveItem: (fromIndex: number, toIndex: number) => {
			if (!canEdit || toIndex < 0 || toIndex >= cellValues.length) return;
			const next = [...cellValues];
			const item = next.splice(fromIndex, 1)[0];
			next.splice(toIndex, 0, item);
			cellValues = next;

			if (focusedRowIndex === fromIndex) {
				focusedRowIndex = toIndex;
			} else if (
				focusedRowIndex >= 0 &&
				focusedRowIndex > fromIndex &&
				focusedRowIndex <= toIndex
			) {
				focusedRowIndex--;
			}

			if (focusedRowIndex >= 0) focusRow(focusedRowIndex);
			commitValue();
		},
		updateRowOrder: (e: CustomEvent<{ items: typeof draggableItems }>) => {
			dragging = true;
			focusedRowIndex = -1;
			draggableItems = e.detail.items;
		},
		handleFinalize: (e: CustomEvent<{ items: typeof draggableItems }>) => {
			focusedRowIndex = -1;
			draggableItems = e.detail.items;
			dragging = false;
			cellValues = draggableItems.map((item) => item.value);
			rowIds = draggableItems.map((item) => item.id);
			commitValue();
		},
		handleRemove: (idx: number) => {
			if (!canEdit || cellValues.length <= parsedMin) return;

			cellValues.splice(idx, 1);
			rowErrors.splice(idx, 1);
			if (cellValues.length === 0) {
				cellValues.push('');
				rowErrors.push('');
			}
			cellValues = [...cellValues];
			rowErrors = [...rowErrors];

			if (focusedRowIndex >= cellValues.length) {
				focusedRowIndex = cellValues.length - 1;
			} else if (focusedRowIndex > idx) {
				focusedRowIndex--;
			} else if (focusedRowIndex === idx) {
				focusedRowIndex = -1;
			}

			commitValue();
		},
		handleAdd: () => {
			if (!canEdit) return;

			clearAllRowErrors();

			if (parsedMax > 0 && cellValues.length >= parsedMax) return;

			const lastIndex = cellValues.length - 1;
			const lastValue = (cellValues[lastIndex] || '').toString().trim();
			if (!lastValue) {
				setRowError(lastIndex, 'Value cannot be empty');
				focusRow(lastIndex);
				return;
			}

			const isDuplicate = cellValues
				.slice(0, -1)
				.some((val) => val.toString().trim() === lastValue);
			if (isDuplicate) {
				setRowError(lastIndex, 'Duplicate value');
				focusRow(lastIndex);
				return;
			}

			cellValues = [...cellValues, ''];
			rowErrors = [...rowErrors, ''];
			focusedRowIndex = cellValues.length - 1;
		},
		moveRowUp: (index: number) => {
			if (index > 0 && canEdit && reorder !== 'disabled') {
				const newIndex = index - 1;
				brain.moveItem(index, newIndex);
				focusedRowIndex = newIndex;
			}
		},
		moveRowDown: (index: number) => {
			if (index < cellValues.length - 1 && canEdit && reorder !== 'disabled') {
				const newIndex = index + 1;
				brain.moveItem(index, newIndex);
				focusedRowIndex = newIndex;
			}
		},
		handleKeyDown: (event: KeyboardEvent, index: number = focusedRowIndex) => {
			if (!canEdit || index < 0) return;

			if (
				event.key === 'Enter' &&
				index === cellValues.length - 1 &&
				cellValues[index]?.trim()
			) {
				event.preventDefault();
				event.stopPropagation();
				brain.handleAdd();
				return;
			}

			if (reorder === 'disabled') return;

			if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
				if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
					event.preventDefault();
					event.stopPropagation();

					if (event.key === 'ArrowUp') {
						brain.moveRowUp(index);
					} else if (event.key === 'ArrowDown') {
						brain.moveRowDown(index);
					}
				}
			}
		},
		handleRowFocusOut: (event: FocusEvent) => {
			const related = event.relatedTarget as Node | null;
			const row = event.currentTarget as HTMLElement;

			if (related && row.contains(related)) return;

			if (!anchor?.contains(related)) brain.validateInstances();
			focusedRowIndex = -1;
		}
	};

	const csm = fsm('view', {
		'*': {
			goTo(state) {
				return state;
			}
		},
		view: {
			focus() {
				if (!readonly && !disabled) {
					return 'editing';
				}
			}
		},
		readonly: {},
		disabled: {},
		copyable: {
			click() {
				copyAndTransition(() => csm, displayText);
			},
			keydown(e: KeyboardEvent) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.click();
				}
			}
		},
		justCopied: deferJustCopied(() => csm),
		editing: {
			_enter() {
				originalValue = [...outputValue];
				cellValues = enrichValue(value);
				rowErrors = cellValues.map(() => '');
				dispatch('enteredit');
			},
			_exit() {
				brain.validateInstances();
				dispatch('exitedit');
			},
			focusout(e: FocusEvent) {
				const related = e.relatedTarget as Node | null;
				if (related && anchor?.contains(related)) {
					return;
				}
				dispatch('focusout');
				return 'view';
			},
			cancel() {
				cellValues = enrichValue(value);
				rowErrors = cellValues.map(() => '');
				focusedRowIndex = -1;
				dispatch('cancel');
				return 'view';
			},
			keydown(e: KeyboardEvent) {
				if (e.key === 'Escape') {
					e.preventDefault();
					this.cancel();
				}
			}
		}
	});

	$effect(() => {
		void value;
		void parsedMin;
		void parsedMax;

		if ($csm === 'editing') return;

		const next = enrichValue(value);

		if (JSON.stringify(next) !== JSON.stringify(cellValues)) {
			cellValues = next;
			rowErrors = next.map(() => '');
		}
	});

	$effect(() => {
		if (dragging) return;

		const count = cellValues.length;
		let ids = rowIds;

		if (ids.length < count) {
			ids = [...ids, ...Array.from({ length: count - ids.length }, () => generate())];
		} else if (ids.length > count) {
			ids = ids.slice(0, count);
		}

		if (ids !== rowIds) {
			rowIds = ids;
		}

		const next = cellValues.map((item, index) => ({
			id: rowIds[index],
			value: item,
			index
		}));

		const currentValues = draggableItems.map((item) => item.value);
		const nextValues = next.map((item) => item.value);

		if (JSON.stringify(currentValues) !== JSON.stringify(nextValues)) {
			draggableItems = next;
		}
	});

	$effect(() => {
		if (disabled) {
			csm.goTo('disabled');
		} else if (readonly && copyable && hasCopyValue) {
			csm.goTo('copyable');
		} else if (readonly) {
			csm.goTo('readonly');
		} else if ($csm !== 'editing' && $csm !== 'justCopied') {
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
</script>

{#snippet rowInput(idx: number, rowValue: string)}
	{#if rowErrors[idx]}
		<i class="ph ph-warning row-error-icon" title={rowErrors[idx]}></i>
	{/if}
	<!-- svelte-ignore event_directive_deprecated -->
	<input
		class="editor"
		class:placeholder={!rowValue}
		class:row-error={!!rowErrors[idx]}
		value={rowValue}
		{placeholder}
		style:text-align={align}
		readonly={rowLocked}
		{disabled}
		tabindex={rowLocked ? -1 : 0}
		use:focusInput={canEdit && focusedRowIndex === idx}
		on:focusin={() => {
			if (!rowLocked) focusedRowIndex = idx;
		}}
		on:keydown={(e) => brain.handleKeyDown(e, idx)}
		on:input={(e) => brain.handleChange(e.currentTarget.value, idx)}
	/>
{/snippet}

{#snippet rowActions(idx: number)}
	{#if showActions}
		<div class="action-buttons">
			{#if reorder === 'full'}
				<SimpleButton
					icon="ph ph-caret-up"
					disabled={idx === 0}
					on:select={() => brain.moveItem(idx, idx - 1)}
				/>
				<SimpleButton
					icon="ph ph-caret-down"
					disabled={idx === cellValues.length - 1}
					on:select={() => brain.moveItem(idx, idx + 1)}
				/>
			{/if}
			<SimpleButton
				icon={idx < cellValues.length - 1 ? 'ph ph-trash-simple' : 'ph ph-plus'}
				disabled={(parsedMax > 0 &&
					idx === cellValues.length - 1 &&
					cellValues.length >= parsedMax) ||
					(idx < cellValues.length - 1 && cellValues.length <= parsedMin)}
				on:select={() => {
					if (idx < cellValues.length - 1) {
						brain.handleRemove(idx);
					} else {
						brain.handleAdd();
					}
				}}
			/>
		</div>
	{/if}
{/snippet}

{#snippet dndRow(draggableItem: (typeof draggableItems)[number], idx: number, withDragHandle: boolean)}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore event_directive_deprecated -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		class="row"
		tabindex={rowLocked ? -1 : 0}
		class:focused={canEdit && focusedRowIndex === idx}
		on:focusin={(e) => {
			if (rowLocked) return;
			if ((e.target as HTMLElement).closest('.drag-handle')) return;
			focusedRowIndex = idx;
		}}
		on:focusout={brain.handleRowFocusOut}
		on:keydown={(e) => brain.handleKeyDown(e, idx)}
	>
		{#if reorder === 'handle' || reorder === 'full'}
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			{#if withDragHandle}
				<div
					class="drag-handle"
					class:locked={rowLocked}
					aria-label="Drag to reorder row {idx + 1}"
					use:dragHandle
				>
					<i class={focusedRowIndex == idx ? 'ph ph-pencil-simple' : 'ph ph-dots-six-vertical'}
					></i>
				</div>
			{:else}
				<div class="drag-handle" class:locked={rowLocked}>
					<i class={focusedRowIndex == idx ? 'ph ph-pencil-simple' : 'ph ph-dots-six-vertical'}
					></i>
				</div>
			{/if}
		{/if}
		{@render rowInput(idx, draggableItem.value)}
		{@render rowActions(idx)}
	</div>
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore event_directive_deprecated -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<BaseCell
	{id}
	bind:anchor
	{csm}
	{role}
	{icon}
	{color}
	{background}
	{copyIcon}
	{tabindex}
	multirow={true}
	isDirty={isDirty && showDirty}
>
	{#if useDnD}
		{@const dndOptions = {
			items: draggableItems,
			dropTargetStyle: {
				outline: 'none',
				border: '1px dashed var(--spectrum-global-color-blue-700)'
			},
			dragDisabled: rowLocked,
			type: zoneType,
			dropFromOthersDisabled: true
		}}
		{#if reorder === 'handle'}
			<div
				class="cells"
				class:view-mode={!canEdit}
				tabindex="-1"
				use:dragHandleZone={dndOptions}
				onfinalize={brain.handleFinalize}
				onconsider={brain.updateRowOrder}
			>
				{#each draggableItems as draggableItem, idx (draggableItem.id)}
					{@render dndRow(draggableItem, idx, true)}
				{/each}
			</div>
		{:else}
			<div
				class="cells"
				class:view-mode={!canEdit}
				tabindex="-1"
				use:dndzone={dndOptions}
				onfinalize={brain.handleFinalize}
				onconsider={brain.updateRowOrder}
			>
				{#each draggableItems as draggableItem, idx (draggableItem.id)}
					{@render dndRow(draggableItem, idx, false)}
				{/each}
			</div>
		{/if}
	{:else}
		<div class="cells" class:view-mode={!canEdit} tabindex="-1">
			{#each cellValues as _, idx (idx)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<!-- svelte-ignore event_directive_deprecated -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div
					class="row"
					tabindex={rowLocked ? -1 : 0}
					class:focused={canEdit && focusedRowIndex === idx}
					on:keydown={(e) => brain.handleKeyDown(e, idx)}
					on:focusin={() => {
						if (!rowLocked) focusedRowIndex = idx;
					}}
					on:focusout={brain.handleRowFocusOut}
				>
					{@render rowInput(idx, cellValues[idx])}
					{@render rowActions(idx)}
				</div>
			{/each}
		</div>
	{/if}
</BaseCell>

<style>
	.cells {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		width: 100%;
		overflow: auto;
	}

	.cells.view-mode .drag-handle {
		cursor: default;
		opacity: 0.5;
	}

	.row {
		display: flex;
		align-items: stretch;
		user-select: none;
		border-bottom: 1px solid var(--spectrum-global-color-gray-300);
		overflow: hidden;
		height: 2rem;
		min-height: 2rem;
		box-sizing: border-box;
	}

	.row-error-icon {
		align-self: center;
		margin-left: 0.5rem;
		color: var(--spectrum-global-color-red-500);
		font-size: 14px;
		flex-shrink: 0;
	}

	.row :global(input.editor.row-error) {
		color: var(--spectrum-global-color-red-700);
	}

	.row.focused > .drag-handle {
		color: var(--spectrum-global-color-blue-400) !important;
	}

	.row:focus {
		outline: none;
	}

	.row:last-child {
		border-bottom: none;
	}

	.drag-handle {
		display: flex;
		align-items: center;
		justify-content: center;
		align-self: stretch;
		min-width: 26px;
		height: 100%;
		cursor: grab;
		color: var(--spectrum-global-color-gray-700);
		transition: background-color 0.2s;
		user-select: none;
		border-right: 1px solid var(--spectrum-global-color-gray-100);
		font-weight: 600;
	}

	.drag-handle:hover:not(.locked) {
		color: var(--spectrum-global-color-gray-900);
	}

	.drag-handle.locked {
		cursor: default;
		opacity: 0.5;
	}

	.drag-handle:active:not(.locked) {
		cursor: grabbing;
		background-color: var(--spectrum-global-color-gray-200);
	}

	.action-buttons {
		display: flex;
		flex-direction: row;
		gap: 0.25rem;
		align-self: stretch;
		align-items: center;
		padding: 0.15rem 0.25rem;
	}

	.action-buttons :global(.simple-button) {
		aspect-ratio: 1;
		border-radius: 0.25rem;
		padding: 0.25rem;
		height: 1.5rem;
		width: 1.5rem;
		min-width: 1.5rem;
		max-height: 1.5rem;
		flex: none;
	}

	.action-buttons :global(.simple-button .label:empty) {
		display: none;
	}
</style>
