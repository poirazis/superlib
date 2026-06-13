<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { dndzone } from 'svelte-dnd-action';
	import { generate } from 'shortid';
	import fsm from 'svelte-fsm';
	import StringCell from './StringCell.svelte';

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
	let inactive = $state(true);
	let focusedRowIndex = $state(-1);
	let cell = $state<HTMLElement | null>(null);
	let rowErrors = $state<string[]>([]);
	let draggableItems = $state<Array<{ id: string; value: string; index: number }>>([]);

	let config = $derived(cellOptions ?? {});
	let readonly = $derived(config.readonly);
	let disabled = $derived(config.disabled);

	let parsedMin = $derived.by(() => {
		const raw = minItems ? parseInt(minItems, 10) : 0;
		return isNaN(raw) ? 0 : raw;
	});

	let parsedMax = $derived.by(() => {
		const raw = maxItems ? parseInt(maxItems, 10) : 0;
		return isNaN(raw) ? 0 : raw;
	});

	let outputValue = $derived(cellValues.filter((x) => x));

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

		while (result.length < parsedMin) {
			result.push('');
		}

		return result;
	};

	const commitValue = () => {
		dispatch('change', [...outputValue]);
		dispatch('labelChange', outputValue.join(', ') || null);
	};

	const clearAllRowErrors = () => {
		rowErrors = cellValues.map(() => '');
	};

	const setRowError = (index: number, message: string) => {
		rowErrors = cellValues.map((_, i) => (i === index ? message : rowErrors[i] ?? ''));
	};

	const focusRow = (index: number) => {
		focusedRowIndex = index;
	};

	const brain = {
		handleChange: (detail: unknown, index: number) => {
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
			if (!inactive) return;

			let filtered = cellValues.filter((x) => x);

			if (filtered.length < parsedMin) {
				filtered = [...filtered];
				while (filtered.length < parsedMin) {
					filtered.push('');
				}
			}

			if (parsedMax > 0 && filtered.length > parsedMax) {
				filtered = filtered.slice(0, parsedMax);
			}

			if (filtered.length === 0) filtered = [''];

			cellValues = [...filtered];
			clearAllRowErrors();
		},
		moveItem: (fromIndex: number, toIndex: number) => {
			if (toIndex < 0 || toIndex >= cellValues.length) return;
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
			focusedRowIndex = -1;
			draggableItems = e.detail.items;
		},
		handleFinalize: (e: CustomEvent<{ items: typeof draggableItems }>) => {
			inactive = true;
			brain.updateRowOrder(e);
			cellValues = draggableItems.map((item) => item.value);
			commitValue();
		},
		handleDragStart: () => {
			inactive = false;
			focusedRowIndex = -1;
		},
		handleDragEnd: () => {
			inactive = true;
		},
		handleRemove: (idx: number) => {
			if (cellValues.length <= parsedMin) return;

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
			if (index > 0 && reorder !== 'disabled') {
				const newIndex = index - 1;
				brain.moveItem(index, newIndex);
				focusedRowIndex = newIndex;
			}
		},
		moveRowDown: (index: number) => {
			if (index < cellValues.length - 1 && reorder !== 'disabled') {
				const newIndex = index + 1;
				brain.moveItem(index, newIndex);
				focusedRowIndex = newIndex;
			}
		},
		handleKeyDown: (event: KeyboardEvent) => {
			if (
				event.key === 'Enter' &&
				focusedRowIndex === cellValues.length - 1 &&
				cellValues[focusedRowIndex]?.trim()
			) {
				event.preventDefault();
				event.stopPropagation();
				brain.handleAdd();
			}

			if (reorder === 'disabled') return;

			if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
				if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
					event.preventDefault();
					event.stopPropagation();

					if (event.key === 'ArrowUp') {
						brain.moveRowUp(focusedRowIndex);
					} else if (event.key === 'ArrowDown') {
						brain.moveRowDown(focusedRowIndex);
					}
				}
			}
		},
		init: (min: number, max: number) => {
			let updated = [...cellValues];

			while (updated.length < min) {
				updated.push('');
			}

			while (updated.length > min && updated[updated.length - 1] === '') {
				updated.pop();
			}

			if (max > 0 && updated.length > max) {
				updated = updated.slice(0, max);
			}

			if (updated.length !== cellValues.length) {
				cellValues = updated;
			}
		}
	};

	const editState = fsm('view', {
		view: {
			focus: () => {
				if (readonly || disabled) return 'view';
				return 'edit';
			}
		},
		edit: {
			focusout: () => 'view'
		}
	});

	$effect(() => {
		cellValues = enrichValue(value);
		rowErrors = cellValues.map(() => '');
	});

	$effect(() => {
		brain.init(parsedMin, parsedMax);
	});

	$effect(() => {
		if (inactive) {
			draggableItems = cellValues.map((item, index) => ({
				id: `item-${index}`,
				value: item,
				index
			}));
		}
	});

	$effect(() => {
		if (autofocus) {
			setTimeout(() => editState.focus(), 50);
		}
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore event_directive_deprecated -->
<div
	bind:this={cell}
	class="array-cell"
	class:inEdit={$editState === 'edit'}
	class:disabled
	class:readonly
	on:focusin={editState.focus}
	on:focusout={editState.focusout}
>
	{#if reorder !== 'disabled' && !readonly && !disabled}
		<!-- svelte-ignore event_directive_deprecated -->
		<div
			class="cells"
			tabindex="-1"
			use:dndzone={{
				items: draggableItems,
				dropTargetStyle: {
					outline: 'none',
					border: '1px dashed var(--spectrum-global-color-blue-700)'
				},
				dragDisabled: readonly || disabled || !inactive || reorder === 'disabled',
				type: zoneType,
				dropFromOthersDisabled: true
			}}
			on:finalize={brain.handleFinalize}
			on:consider={brain.updateRowOrder}
		>
			{#each draggableItems as draggableItem, idx (draggableItem.id)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<!-- svelte-ignore event_directive_deprecated -->
				<div
					class="row"
					tabindex={readonly || disabled ? -1 : 0}
					class:focused={focusedRowIndex === idx}
					on:focusin={() => (focusedRowIndex = readonly || disabled ? -1 : idx)}
					on:focusout={(e) => {
						if (!cell?.contains(e.relatedTarget as Node)) brain.validateInstances();
						focusedRowIndex = -1;
					}}
					on:keydown={brain.handleKeyDown}
				>
					{#if reorder === 'handle' || reorder === 'full'}
						<!-- svelte-ignore a11y_interactive_supports_focus -->
						<!-- svelte-ignore event_directive_deprecated -->
						<div
							class="drag-handle"
							class:readonly={readonly || disabled}
							style={inactive ? 'cursor: grab' : 'cursor: grabbing'}
							role="button"
							tabindex="-1"
							on:mousedown={brain.handleDragStart}
							on:mouseup={brain.handleDragEnd}
							on:mouseleave={brain.handleDragEnd}
						>
							<i
								class={focusedRowIndex == idx
									? 'ph ph-pencil-simple'
									: 'ph ph-dots-six-vertical'}
							></i>
						</div>
					{/if}
					<StringCell
						{id}
						cellOptions={{
							...config,
							role: 'inline',
							clearIcon: false,
							error: rowErrors[idx] || undefined
						}}
						{fieldSchema}
						value={draggableItem.value}
						autofocus={focusedRowIndex === idx}
						{disabled}
						{readonly}
						on:change={(e) => brain.handleChange(e.detail, idx)}
					/>
					{#if !disabled && !readonly && !(parsedMin > 0 && parsedMax > 0 && parsedMin === parsedMax)}
						<div class="action-buttons">
							{#if reorder === 'full'}
								<!-- svelte-ignore event_directive_deprecated -->
								<button
									class="action-button"
									disabled={readonly || disabled || idx === 0}
									on:click={() => brain.moveItem(idx, idx - 1)}
									aria-label="Move up"
								>
									<i class="ph ph-caret-up"></i>
								</button>
								<!-- svelte-ignore event_directive_deprecated -->
								<button
									class="action-button"
									disabled={readonly || disabled || idx === cellValues.length - 1}
									on:click={() => brain.moveItem(idx, idx + 1)}
									aria-label="Move down"
								>
									<i class="ph ph-caret-down"></i>
								</button>
							{/if}
							<!-- svelte-ignore event_directive_deprecated -->
							<button
								class="action-button"
								class:delete={idx < cellValues.length - 1}
								disabled={readonly ||
									disabled ||
									(parsedMax > 0 &&
										idx === cellValues.length - 1 &&
										cellValues.length >= parsedMax) ||
									(idx < cellValues.length - 1 && cellValues.length <= parsedMin)}
								on:click={() => {
									if (idx < cellValues.length - 1) {
										brain.handleRemove(idx);
									} else {
										brain.handleAdd();
									}
								}}
								aria-label={idx < cellValues.length - 1 ? 'Remove' : 'Add'}
							>
								<i
									class={idx < cellValues.length - 1
										? 'ph ph-trash-simple'
										: 'ph ph-plus'}
								></i>
							</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<div class="cells" tabindex="-1">
			{#each cellValues as _, idx (idx)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<!-- svelte-ignore event_directive_deprecated -->
				<div
					class="row"
					class:focused={focusedRowIndex === idx}
					on:keydown={brain.handleKeyDown}
					on:focusin={() => (focusedRowIndex = idx)}
					on:focusout={(e) => {
						if (!cell?.contains(e.relatedTarget as Node)) brain.validateInstances();
						focusedRowIndex = -1;
					}}
				>
					<StringCell
						{id}
						cellOptions={{
							...config,
							role: 'inline',
							clearIcon: false,
							error: rowErrors[idx] || undefined
						}}
						{fieldSchema}
						value={cellValues[idx]}
						{disabled}
						{readonly}
						autofocus={focusedRowIndex === idx}
						on:change={(e) => brain.handleChange(e.detail, idx)}
					/>
					{#if !readonly && !disabled && !(parsedMin > 0 && parsedMax > 0 && parsedMin === parsedMax)}
						<div class="action-buttons">
							<!-- svelte-ignore event_directive_deprecated -->
							<button
								class="action-button"
								class:delete={idx < cellValues.length - 1}
								disabled={readonly ||
									disabled ||
									(parsedMax > 0 &&
										idx === cellValues.length - 1 &&
										cellValues.length >= parsedMax) ||
									(idx < cellValues.length - 1 && cellValues.length <= parsedMin)}
								on:click={() => {
									if (idx < cellValues.length - 1) {
										brain.handleRemove(idx);
									} else {
										brain.handleAdd();
									}
								}}
								aria-label={idx < cellValues.length - 1 ? 'Remove' : 'Add'}
							>
								<i
									class={idx < cellValues.length - 1
										? 'ph ph-trash-simple'
										: 'ph ph-plus'}
								></i>
							</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.array-cell {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.25rem;
		width: 100%;
		height: 100%;
		align-self: flex-start;
		overflow: auto;
		background-color: var(--spectrum-global-color-gray-50);
		border: 1px solid var(--spectrum-global-color-gray-300);
		border-radius: 2px;
		min-height: 2rem;
	}

	.array-cell.inEdit {
		border: 1px solid var(--spectrum-global-color-gray-300);
	}

	.array-cell.disabled {
		background-color: var(--spectrum-global-color-gray-300);
		border: 1px solid var(--spectrum-global-color-gray-200);
	}

	.array-cell.readonly {
		border: 1px solid var(--spectrum-global-color-gray-200);
	}

	.array-cell.readonly:focus-within {
		border: 1px dashed var(--spectrum-global-color-blue-500) !important;
	}

	.cells {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		overflow: auto;
	}

	.row {
		display: flex;
		align-items: stretch;
		user-select: none;
		border-bottom: 1px solid var(--spectrum-global-color-gray-300);
		overflow: hidden;
		min-height: 30px;
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
		min-width: 26px;
		height: 30px;
		cursor: grab;
		color: var(--spectrum-global-color-gray-700);
		transition: background-color 0.2s;
		user-select: none;
		border-right: 1px solid var(--spectrum-global-color-gray-100);
		font-weight: 600;
	}

	.drag-handle:hover:not(.readonly) {
		color: var(--spectrum-global-color-gray-900);
	}

	.drag-handle.readonly {
		cursor: default;
		opacity: 0.5;
	}

	.drag-handle:active:not(.readonly) {
		cursor: grabbing;
		background-color: var(--spectrum-global-color-gray-200);
	}

	.action-buttons {
		display: flex;
		flex-direction: row;
		gap: 4px;
		align-items: center;
		padding: 0rem 0.25rem;
	}

	.action-button {
		all: unset;
		cursor: pointer;
		border-radius: 4px;
		width: 24px;
		height: 24px;
		display: flex;
		justify-content: center;
		align-items: center;
		background-color: transparent;
		color: var(--spectrum-global-color-gray-700);
		font-size: 12px;
		transition:
			background-color 0.2s,
			color 0.2s;
	}

	.action-button:hover:not(:disabled) {
		background-color: var(--spectrum-global-color-gray-100);
		color: var(--spectrum-global-color-gray-900);
	}

	.action-button:hover.delete {
		color: var(--spectrum-global-color-red-600);
	}

	.action-button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.action-button:focus {
		outline: 1px dashed var(--spectrum-global-color-blue-600);
	}
</style>