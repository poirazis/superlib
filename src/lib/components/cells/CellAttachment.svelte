<script lang="ts">
	import { createEventDispatcher, getContext } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import PickerPopover from './PickerPopover.svelte';
	import {
		attachmentCopyText,
		isMultiAttachment,
		mapCellRole,
		normalizeAttachments,
		uploadAttachments,
		type AttachmentItem
	} from './attachmentUtils.js';
	import { copyAndTransition, deferJustCopied } from './cellClipboard.js';

	const dispatch = createEventDispatcher<{
		change: AttachmentItem[];
		enteredit: void;
		exitedit: void;
		focusout: void;
	}>();

	const sdk = getContext<{
		API?: { uploadAttachment: (tableId: string, data: FormData) => Promise<AttachmentItem[]> };
	}>('sdk');

	let {
		id,
		value,
		cellOptions = {},
		fieldSchema,
		tableid,
		API = sdk?.API,
		autofocus = false
	} = $props();

	let anchor = $state<HTMLElement | null>(null);
	let picker = $state<HTMLElement | undefined>();
	let open = $state(false);
	let focusedOptionIdx = $state<number | undefined>();
	let fileInput = $state<HTMLInputElement | undefined>();
	let originalValue = $state<AttachmentItem[] | AttachmentItem | null | undefined>();
	let localvalue = $state<AttachmentItem[]>([]);

	let config = $derived(cellOptions ?? {});
	let multi = $derived(isMultiAttachment(fieldSchema));
	let readonly = $derived(config.readonly);
	let disabled = $derived(config.disabled);
	let placeholder = $derived(config.placeholder ?? '');
	let optionError = $derived(config.error);
	let optionIcon = $derived(config.icon);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let showDirty = $derived(config.showDirty);
	let copyable = $derived(config.copyable);
	let copyIcon = $derived(config.copyIcon ?? 'always');
	let baseRole = $derived(mapCellRole(config.role));


	let error = $derived(optionError);
	let icon = $derived(error ? 'ph ph-warning' : optionIcon);
	let isDirty = $derived(
		JSON.stringify(localvalue) !== JSON.stringify(normalizeAttachments(value, multi))
	);
	let showPlaceholder = $derived(localvalue.length < 1);

	const emitChange = (nextValue: AttachmentItem[]) => {
		localvalue = nextValue;
		dispatch('change', nextValue);
	};

	const processFiles = async (fileList: File[]) => {
		if (!API || !tableid) return [];
		try {
			const res = await uploadAttachments(API, tableid, fileList);
			emitChange([...localvalue, ...res]);
			return res;
		} catch (error) {
			console.error('Upload failed:', error);
			return [];
		}
	};

	const handleFileSelect = (event: Event) => {
		const target = event.target as HTMLInputElement;
		const files = Array.from(target.files || []);
		processFiles(files);
		target.value = '';
	};

	const handleDelete = (key: number) => {
		const next = [...localvalue];
		next.splice(key, 1);
		emitChange(next);
	};

	export const cellState = fsm('view', {
		'*': {
			goTo(state: string) {
				return state;
			}
		},
		view: {
			_enter() {
				open = false;
			},
			focus() {
				if (!readonly && !disabled) return 'editing';
			}
		},
		readonly: {
			_enter() {
				open = false;
			}
		},
		copyable: {
			_enter() {
				open = false;
			},
			click() {
				copyAndTransition(() => cellState, attachmentCopyText(localvalue));
			},
			keydown(e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.click();
				}
			}
		},
		justCopied: deferJustCopied(() => cellState),
		disabled: {
			_enter() {
				open = false;
			}
		},
		editing: {
			_enter() {
				originalValue = value;
				localvalue = normalizeAttachments(value, multi);
				open = false;
				dispatch('enteredit');
			},
			_exit() {
				open = false;
				dispatch('exitedit');
			},
			click() {
				open = !open;
			},
			keydown(e) {
				if (e.key === ' ' || e.key === 'Enter') {
					e.preventDefault();
					this.click();
				}

				if (e.key === 'Escape') {
					this.cancel();
				}
			},
			focusout(e: FocusEvent) {
				const related = e.relatedTarget as Node | null;
				if (!anchor?.contains(related) && !picker?.contains(related)) {
					if (
						JSON.stringify(localvalue) !==
						JSON.stringify(normalizeAttachments(originalValue, multi))
					) {
						dispatch('change', localvalue);
					}
					dispatch('focusout');
					return readonly ? 'readonly' : baseRole === 'cell' ? 'view' : 'editing';
				}
			},
			submit(e: FocusEvent) {
				const related = e.relatedTarget as Node | null;
				if (!picker?.contains(related)) {
					if (
						JSON.stringify(localvalue) !==
						JSON.stringify(normalizeAttachments(originalValue, multi))
					) {
						dispatch('change', localvalue);
					}
					dispatch('focusout');
					return readonly ? 'readonly' : baseRole === 'cell' ? 'view' : 'editing';
				}
			},
			cancel() {
				localvalue = normalizeAttachments(originalValue, multi);
				open = false;
				return readonly ? 'readonly' : baseRole === 'cell' ? 'view' : 'editing';
			}
		}
	});

	let inEdit = $derived($cellState === 'editing');

	$effect(() => {
		localvalue = normalizeAttachments(value, multi);
	});

	$effect(() => {
		if (disabled) {
			cellState.goTo('disabled');
		} else if (readonly && copyable && localvalue.length) {
			cellState.goTo('copyable');
		} else if (readonly) {
			cellState.goTo('readonly');
		} else if (baseRole === 'cell') {
			cellState.goTo('view');
		} else {
			cellState.goTo('editing');
		}
	});

	$effect(() => {
		if (autofocus) {
			setTimeout(() => {
				cellState.focus();
				cellState.click?.();
			}, 30);
		}
	});
</script>

<!-- svelte-ignore event_directive_deprecated -->
<BaseCell
	{id}
	role={baseRole}
	state={cellState}
	bind:root={anchor}
	{icon}
	isDirty={isDirty && showDirty}
	clearable={false}
	{error}
	{copyIcon}
	{color}
	{background}
	popupOpen={open}
	tabindex={disabled || (readonly && !copyable) ? -1 : 0}
>
	{#if icon}
		<i class={icon + ' field-icon'} class:with-error={error}></i>
	{/if}

	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="attachment-display" class:placeholder={showPlaceholder}>
		{#if localvalue.length || inEdit}
			<div class="items">
				{#each localvalue.slice(0, 5) as file}
					{#if file}
						<div class="item pill">
							<span>{file?.extension?.toUpperCase()}</span>
						</div>
					{/if}
				{/each}
				{#if localvalue.length > 5}
					<span class="remaining-count">( + {localvalue.length - 5} )</span>
				{/if}
			</div>
		{:else}
			<span>{placeholder}</span>
		{/if}

		{#if !readonly && !disabled && baseRole !== 'cell'}
			<i class="ph ph-caret-down action-icon"></i>
		{/if}
	</div>
</BaseCell>

<PickerPopover
	{anchor}
	visible={inEdit}
	align="right"
	{open}
	maxHeight={350}
	useAnchorWidth
	onClose={cellState.focusout}
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="attachments" bind:this={picker}>
		{#if localvalue?.length}
			{#each localvalue as attachment, idx (idx)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<!-- svelte-ignore event_directive_deprecated -->
				<div
					class="attachment"
					class:focused={focusedOptionIdx === idx}
					on:mouseenter={() => (focusedOptionIdx = idx)}
				>
					<!-- svelte-ignore event_directive_deprecated -->
					<button
						class="btn-delete"
						on:click={() => handleDelete(idx)}
						tabindex="-1"
						aria-label="Delete"
						title="Delete"
						type="button"
					>
						<i class="ph ph-download-simple"></i>
					</button>
					<div class="pill">{attachment.extension?.toUpperCase()}</div>
					<a href={attachment.url} class="filename" download>{attachment.name}</a>
					{#if !readonly}
						<!-- svelte-ignore event_directive_deprecated -->
						<button
							class="btn-delete"
							on:click={() => handleDelete(idx)}
							tabindex="-1"
							aria-label="Delete"
							title="Delete"
							type="button"
						>
							<i class="ph ph-trash-simple"></i>
						</button>
					{/if}
				</div>
			{/each}
		{/if}

		<!-- svelte-ignore event_directive_deprecated -->
		<button
			class="btn-upload-empty"
			on:click={() => fileInput?.click()}
			aria-label="Upload attachment"
			type="button"
			disabled={disabled || readonly}
		>
			<i class="ph ph-plus"></i> Add Attachment
		</button>

		<!-- svelte-ignore event_directive_deprecated -->
		<input
			bind:this={fileInput}
			type="file"
			multiple={multi}
			style="display: none;"
			on:change={handleFileSelect}
		/>
	</div>
</PickerPopover>

<style>
	.attachment-display {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex: 1 1 auto;
		min-width: 0;
		height: 100%;
		padding: 0.25rem 0.75rem;
		box-sizing: border-box;
		cursor: inherit;
	}

	.attachment-display.placeholder {
		font-style: italic;
		color: var(--spectrum-global-color-gray-600);
	}

	.items {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		min-width: 0;
		flex: 1 1 auto;
	}

	.pill {
		border: 1px solid var(--spectrum-global-color-gray-500);
		padding: 0rem 0.25rem;
		border-radius: 3px;
		font-size: 11px;
		display: flex;
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
		justify-content: center;
	}

	a.filename {
		width: 100%;
		line-height: 22px;
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
		text-decoration: underline;
		color: var(--spectrum-global-color-blue-700);
		flex: auto;
	}

	.action-icon {
		display: flex;
		align-items: center;
		color: var(--spectrum-global-color-gray-600);
	}

	.action-icon:hover {
		cursor: pointer;
		color: var(--spectrum-global-color-static-blue-800);
	}

	.attachment {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.25rem;
		cursor: pointer;
		border-bottom: 1px solid var(--spectrum-global-color-gray-200);
	}

	.attachment:last-child {
		border-bottom: none;
	}

	.attachment:hover {
		background-color: var(--spectrum-global-color-gray-100);
	}

	.attachments {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		flex: auto;
		position: relative;
		width: 100%;
		height: 100%;
		overflow-y: auto;
		padding: 0.25rem;
	}

	.btn-delete {
		aspect-ratio: 1;
		color: var(--spectrum-global-color-gray-500);
		background: none;
		border: 1px solid transparent;
		cursor: pointer;
		padding: 0.25rem;
		border-radius: 3px;
		transition: all 0.2s ease;
	}

	.btn-delete:hover {
		border-color: var(--spectrum-global-color-red-500);
		color: var(--spectrum-global-color-red-500);
	}

	.btn-upload-empty {
		width: 100%;
		height: 3rem;
		background: none;
		border: 2px dashed var(--spectrum-global-color-gray-400);
		border-radius: 6px;
		padding: 1rem 2rem;
		cursor: pointer;
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		transition: all 0.2s ease;
		color: var(--spectrum-global-color-gray-600);
		font-size: 14px;
		justify-content: center;
		margin-top: 1rem;
	}

	.btn-upload-empty:hover:not(:disabled) {
		border-color: var(--spectrum-global-color-blue-500);
		color: var(--spectrum-global-color-blue-500);
		background-color: var(--spectrum-global-color-blue-50);
	}

	.btn-upload-empty:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.remaining-count {
		height: 100%;
		display: flex;
		align-items: center;
		color: var(--spectrum-global-color-gray-700);
		font-size: 12px;
		font-weight: 500;
		margin-left: 0.25rem;
		white-space: nowrap;
	}
</style>
