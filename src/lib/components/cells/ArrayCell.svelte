<script lang="ts">
	import { createEventDispatcher, tick } from 'svelte';
	import { dndzone, dragHandleZone, dragHandle } from 'svelte-dnd-action';
	import { generate } from 'shortid';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import SimpleButton from '../buttons/SimpleButton.svelte';
	import { copyAndTransition, deferJustCopied } from './helpers';

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
			focus() {
				if (!readonly && !disabled) {
					return 'editing';
				}
			}
		},
		readonly: {},
		disabled: {},
		copyable: {
			copy() {
				copyAndTransition(() => csm, displayText);
			},
			keydown(e: KeyboardEvent) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.copy();
				}
			}
		},
		justCopied: deferJustCopied(() => csm),
		editing: {
			_enter() {
				localValue = enrichValue(value);
				syncDuplicateRowErrors();
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
				localValue = enrichValue(value);
				rowErrors = localValue.map(() => '');
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

	let zoneType = $state(generate());
	let localValue = $state<string[]>(['']);
	let dragging = $state(false);
	let focusedRowIndex = $state(-1);
	let inputRefs = $state<Record<number, HTMLInputElement>>({});
	let anchor = $state<HTMLElement | null>(null);
	let rowErrors = $state<string[]>([]);
	let draggableItems = $state<Array<{ id: string; value: string; index: number }>>([]);
	let rowIds = $state<string[]>([]);
	let tabindex = $state(0);

	let config = $derived(cellOptions ?? {});
	let role = $derived(config.role ?? 'form');
	let readonly = $derived(config.readonly);
	let disabled = $derived(config.disabled);
	let icon = $derived(config.icon);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let cellBackground = $derived(disabled || readonly ? undefined : background);
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

	let outputValue = $derived(localValue.filter((x) => x));
	let canEdit = $derived($csm === 'editing');
	let inEdit = $derived($csm === 'editing');
	let isDirty = $derived(
		inEdit &&
			JSON.stringify(outputValue) !==
				JSON.stringify(Array.isArray(value) ? value.filter((x) => x) : value ? [String(value)] : [])
	);
	let rowLocked = $derived(readonly || disabled || !canEdit);
	let dirty = $derived(config.dirty);
	let hasCopyValue = $derived(
		Array.isArray(value) ? value.length > 0 : value != null && value !== ''
	);
	let displayText = $derived(outputValue.join(', '));
	let showActions = $derived(
		!dragging && $csm === 'editing' && !(parsedMin > 0 && parsedMax > 0 && parsedMin === parsedMax)
	);
	let useDnD = $derived(reorder !== 'disabled');
	let dragDisabled = $derived(readonly || disabled);

	const bindInputRef = (node: HTMLInputElement, idx: number) => {
		inputRefs[idx] = node;

		return {
			update(newIdx: number) {
				inputRefs[newIdx] = node;
			},
			destroy() {
				delete inputRefs[idx];
			}
		};
	};

	function transformDraggedElement(draggedEl, data, index) {
		// draggedEl.querySelector('.row').style.transform = 'rotate(10deg)';
		draggedEl.style.backgroundColor = 'var(--spectrum-global-color-gray-100)';
		draggedEl.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
		draggedEl.style.border = '1px solid var(--spectrum-global-color-gray-300)';
		draggedEl.style.borderRadius = '4px';
		draggedEl.style.opacity = 1;
		draggedEl.style.outline = 'none';
		draggedEl.querySelector('.editor').style.backgroundColor = 'transparent';
		draggedEl.querySelector('.editor').style.border = 'none';
		draggedEl.querySelector('.editor').style.color = 'var(--spectrum-global-color-gray-900)';
		let actionButtons = draggedEl.querySelector('.action-buttons');
		if (actionButtons) {
			actionButtons.style.display = 'none';
		}
	}

	const dndZoneOptions = $derived({
		items: draggableItems,
		dropTargetStyle: {
			outline: 'none',
			border: '1px dashed var(--spectrum-global-color-blue-700)'
		},
		dragDisabled,
		type: zoneType,
		dropFromOthersDisabled: true,
		transformDraggedElement
	});

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

	const hasDuplicateValues = (rows: string[] = localValue) => {
		const seen = new Set<string>();

		for (const val of rows) {
			const normalized = normalizeValue(val);
			if (!normalized) continue;
			if (seen.has(normalized)) return true;
			seen.add(normalized);
		}

		return false;
	};

	const commitValue = () => {
		if (rowErrors.some((message) => message)) return;
		if (hasDuplicateValues()) return;

		dispatch('change', [...outputValue]);
	};

	const clearRowError = (index: number) => {
		if (!rowErrors[index]) return;
		rowErrors = localValue.map((_, i) => (i === index ? '' : (rowErrors[i] ?? '')));
	};

	const setRowError = (index: number, message: string) => {
		rowErrors = localValue.map((_, i) => (i === index ? message : (rowErrors[i] ?? '')));
	};

	const syncDuplicateRowErrors = () => {
		rowErrors = localValue.map((val, index) => {
			const trimmed = normalizeValue(val);
			if (!trimmed) return '';
			if (isDuplicateAt(index, trimmed)) return 'Duplicate value';
			return '';
		});
	};

	const focusRow = async (index: number) => {
		if (dragging || index < 0 || index >= localValue.length) return;

		focusedRowIndex = index;
		await tick();
		inputRefs[index]?.focus();
	};

	const normalizeValue = (value: unknown) => (value == null ? '' : String(value).trim());

	const isDuplicateAt = (index: number, value: string) => {
		const normalized = normalizeValue(value);
		if (!normalized) return false;

		return localValue.some((val, i) => i !== index && normalizeValue(val) === normalized);
	};

	const validateRowValue = (index: number, rawValue: unknown) => {
		const nextValue = rawValue == null ? '' : String(rawValue);
		const trimmed = normalizeValue(nextValue);

		if (!trimmed) {
			return { ok: false as const, message: 'Value cannot be empty' };
		}

		if (isDuplicateAt(index, trimmed)) {
			return { ok: false as const, message: 'Duplicate value' };
		}

		return { ok: true as const, value: nextValue };
	};

	const removeEmptyRow = (index: number) => {
		if (localValue.length <= parsedMin) {
			if (localValue[index] !== '') {
				localValue[index] = '';
				localValue = [...localValue];
				commitValue();
			}
			clearRowError(index);
			return;
		}

		rowErrors.splice(index, 1);
		localValue.splice(index, 1);
		localValue = [...localValue];
		rowErrors = [...rowErrors];

		if (localValue.length === 0) {
			localValue.push('');
			rowErrors.push('');
		}

		if (focusedRowIndex === index) {
			focusedRowIndex = -1;
		} else if (focusedRowIndex > index) {
			focusedRowIndex--;
		}

		commitValue();
	};

	const brain = {
		handleChange: (detail: unknown, index: number) => {
			if (rowLocked) return;

			const nextValue = detail == null ? '' : String(detail);
			const trimmed = normalizeValue(nextValue);

			if (!trimmed) {
				if (localValue[index] !== nextValue) {
					localValue[index] = nextValue;
					localValue = [...localValue];
				}
				clearRowError(index);
				commitValue();
				return;
			}

			if (localValue[index] !== nextValue) {
				localValue[index] = nextValue;
				localValue = [...localValue];
			}

			if (isDuplicateAt(index, trimmed)) {
				setRowError(index, 'Duplicate value');
				return;
			}

			clearRowError(index);
			commitValue();
		},
		validateInstances: () => {
			if (dragging) return;

			const next = applyMinMaxConstraints(
				localValue.filter((x) => x),
				parsedMin,
				parsedMax
			);

			if (JSON.stringify(next) !== JSON.stringify(localValue)) {
				localValue = next;
			}

			syncDuplicateRowErrors();
		},
		handleInputFocusOut: (event: FocusEvent, index: number) => {
			if (dragging || rowLocked) return;

			const related = event.relatedTarget as Node | null;
			const row = (event.currentTarget as HTMLElement).closest('.row');
			if (related && row?.contains(related)) return;

			const input = inputRefs[index];
			const trimmed = normalizeValue(input?.value ?? localValue[index]);

			if (!trimmed) {
				removeEmptyRow(index);
				return;
			}

			focusedRowIndex = -1;
		},
		moveItem: (fromIndex: number, toIndex: number) => {
			if (!canEdit || toIndex < 0 || toIndex >= localValue.length) return;
			const next = [...localValue];
			const item = next.splice(fromIndex, 1)[0];
			next.splice(toIndex, 0, item);
			localValue = next;

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
		handleDndConsider: (e: CustomEvent<{ items: typeof draggableItems }>) => {
			dragging = true;
			focusedRowIndex = -1;
			draggableItems = e.detail.items;
		},
		handleDndFinalize: (e: CustomEvent<{ items: typeof draggableItems }>) => {
			dragging = false;
			focusedRowIndex = -1;
			draggableItems = e.detail.items;
			localValue = draggableItems.map((item) => item.value);
			rowIds = draggableItems.map((item) => item.id);
			commitValue();
		},
		handleRemove: (idx: number) => {
			if (!canEdit || localValue.length <= parsedMin) return;

			localValue.splice(idx, 1);
			rowErrors.splice(idx, 1);
			if (localValue.length === 0) {
				localValue.push('');
				rowErrors.push('');
			}
			localValue = [...localValue];
			rowErrors = [...rowErrors];

			if (focusedRowIndex >= localValue.length) {
				focusedRowIndex = localValue.length - 1;
			} else if (focusedRowIndex > idx) {
				focusedRowIndex--;
			} else if (focusedRowIndex === idx) {
				focusedRowIndex = -1;
			}

			commitValue();
		},
		handleAdd: (index: number = localValue.length - 1) => {
			if (!canEdit) return false;

			if (parsedMax > 0 && localValue.length >= parsedMax) return false;

			const pendingValue = inputRefs[index]?.value ?? localValue[index];
			const validation = validateRowValue(index, pendingValue);
			if (!validation.ok) {
				setRowError(index, validation.message);
				focusRow(index);
				return false;
			}

			if (localValue[index] !== validation.value) {
				localValue[index] = validation.value;
				localValue = [...localValue];
			}

			commitValue();

			localValue = [...localValue, ''];
			rowErrors = [...rowErrors, ''];
			focusRow(localValue.length - 1);
			return true;
		},
		moveRowUp: (index: number) => {
			if (index > 0 && canEdit && reorder !== 'disabled') {
				const newIndex = index - 1;
				brain.moveItem(index, newIndex);
				focusedRowIndex = newIndex;
			}
		},
		moveRowDown: (index: number) => {
			if (index < localValue.length - 1 && canEdit && reorder !== 'disabled') {
				const newIndex = index + 1;
				brain.moveItem(index, newIndex);
				focusedRowIndex = newIndex;
			}
		},
		handleKeyDown: (event: KeyboardEvent, index: number = focusedRowIndex) => {
			if (!canEdit || index < 0) return;

			if (event.key === 'Enter') {
				event.preventDefault();
				event.stopPropagation();

				const input = event.currentTarget as HTMLInputElement | null;
				const pendingValue = input?.value ?? localValue[index];
				const validation = validateRowValue(index, pendingValue);

				if (!validation.ok) {
					setRowError(index, validation.message);
					focusRow(index);
					return;
				}

				if (localValue[index] !== validation.value) {
					localValue[index] = validation.value;
					localValue = [...localValue];
					commitValue();
				}

				if (index < localValue.length - 1) {
					focusRow(index + 1);
					return;
				}

				brain.handleAdd(index);
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
			if (dragging) return;

			const related = event.relatedTarget as Node | null;
			const row = event.currentTarget as HTMLElement;

			if (related && row.contains(related)) return;

			if (!anchor?.contains(related)) brain.validateInstances();
			focusedRowIndex = -1;
		}
	};

	$effect(() => {
		void reorder;

		dragging = false;
		focusedRowIndex = -1;
		zoneType = generate();
	});

	$effect(() => {
		void value;
		void parsedMin;
		void parsedMax;

		if ($csm === 'editing') return;

		const next = enrichValue(value);

		if (JSON.stringify(next) !== JSON.stringify(localValue)) {
			localValue = next;
			rowErrors = next.map(() => '');
		}
	});

	$effect(() => {
		if (dragging) return;

		const count = localValue.length;
		let ids = rowIds;

		if (ids.length < count) {
			ids = [...ids, ...Array.from({ length: count - ids.length }, () => generate())];
		} else if (ids.length > count) {
			ids = ids.slice(0, count);
		}

		if (ids !== rowIds) {
			rowIds = ids;
		}

		const next = localValue.map((item, index) => ({
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
		style:background={rowLocked ? 'transparent' : undefined}
		readonly={rowLocked}
		{disabled}
		tabindex={rowLocked ? -1 : 0}
		use:bindInputRef={idx}
		on:mousedown|stopPropagation
		on:focusin={() => {
			if (rowLocked || dragging) return;
			focusedRowIndex = idx;
		}}
		on:keydown={(e) => brain.handleKeyDown(e, idx)}
		on:input={(e) => brain.handleChange(e.currentTarget.value, idx)}
		on:focusout={(e) => brain.handleInputFocusOut(e, idx)}
	/>
{/snippet}

{#snippet rowActions(idx: number)}
	{#if showActions}
		<!-- svelte-ignore event_directive_deprecated -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="action-buttons" on:mousedown|stopPropagation>
			{#if reorder === 'full'}
				<SimpleButton
					iconOnly
					icon="ph ph-caret-up"
					disabled={idx === 0}
					on:click={() => brain.moveItem(idx, idx - 1)}
				/>
				<SimpleButton
					iconOnly
					icon="ph ph-caret-down"
					disabled={idx === localValue.length - 1}
					on:click={() => brain.moveItem(idx, idx + 1)}
				/>
			{/if}
			<SimpleButton
				iconOnly
				icon={idx < localValue.length - 1 ? 'ph ph-trash-simple' : 'ph ph-plus'}
				disabled={(parsedMax > 0 &&
					idx === localValue.length - 1 &&
					localValue.length >= parsedMax) ||
					(idx < localValue.length - 1 && localValue.length <= parsedMin)}
				on:click={() => {
					if (idx < localValue.length - 1) {
						brain.handleRemove(idx);
					} else {
						brain.handleAdd();
					}
				}}
			/>
		</div>
	{/if}
{/snippet}

{#snippet dndRow(draggableItem: (typeof draggableItems)[number], idx: number)}
	<div class="row-shell">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore event_directive_deprecated -->
		<div class="row" class:focused={canEdit && focusedRowIndex === idx}>
			{#if reorder === 'handle' || reorder === 'full'}
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				{#if reorder === 'handle'}
					<div
						class="drag-handle"
						class:locked={readonly || disabled}
						aria-label="Drag to reorder row {idx + 1}"
						use:dragHandle
					>
						<i class={focusedRowIndex == idx ? 'ph ph-pencil-simple' : 'ph ph-dots-six-vertical'}
						></i>
					</div>
				{:else}
					<div class="drag-handle" class:locked={readonly || disabled}>
						<i class={focusedRowIndex == idx ? 'ph ph-pencil-simple' : 'ph ph-dots-six-vertical'}
						></i>
					</div>
				{/if}
			{/if}
			{@render rowInput(idx, draggableItem.value)}
			{@render rowActions(idx)}
		</div>
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
	background={cellBackground}
	{copyIcon}
	{align}
	{tabindex}
	multirow={true}
	isDirty={dirty && showDirty}
>
	{#if useDnD}
		{#if reorder === 'handle'}
			<div
				class="cells"
				class:view-mode={!canEdit}
				tabindex="-1"
				use:dragHandleZone={dndZoneOptions}
				on:consider={brain.handleDndConsider}
				on:finalize={brain.handleDndFinalize}
			>
				{#each draggableItems as draggableItem, idx (draggableItem.id)}
					{@render dndRow(draggableItem, idx)}
				{/each}
			</div>
		{:else}
			<div
				class="cells"
				class:view-mode={!canEdit}
				tabindex="-1"
				use:dndzone={dndZoneOptions}
				on:consider={brain.handleDndConsider}
				on:finalize={brain.handleDndFinalize}
			>
				{#each draggableItems as draggableItem, idx (draggableItem.id)}
					{@render dndRow(draggableItem, idx)}
				{/each}
			</div>
		{/if}
	{:else}
		<div class="cells" class:view-mode={!canEdit} tabindex="-1">
			{#each localValue as _, idx (idx)}
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
					{@render rowInput(idx, localValue[idx])}
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

	.cells.view-mode .drag-handle.locked {
		cursor: default;
		opacity: 0.5;
	}

	.row-shell {
		display: flex;
		flex-direction: column;
	}

	.row {
		display: flex;
		align-items: stretch;
		user-select: none;
		border-bottom: 1px solid var(--spectrum-global-color-gray-300);
		overflow: hidden;
		min-width: 0;
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

	input.editor.row-error {
		color: var(--spectrum-global-color-red-700);
	}

	.row.focused > .drag-handle {
		color: var(--spectrum-global-color-blue-400) !important;
	}

	.row:focus,
	.row:focus-visible {
		outline: none;
	}

	.row-shell:last-child .row {
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
</style>
