<script lang="ts">
	import { createEventDispatcher, getContext } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import SuperPopover from '../SuperPopover/SuperPopover.svelte';
	import { tooltip } from '../../actions/tooltip';
	import {
		attachmentCopyText,
		consumeOpenOnEnter,
		copyAndTransition,
		deferJustCopied,
		normalizeAttachments,
		requestIconOpenOnEnter,
		requestOpenOnEnter,
		resolveEmptyViewText,
		shouldShowCellViewChrome,
		uploadAttachments
	} from './helpers.js';
	import type { AttachmentItem } from './types.js';

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
	let popup = $state<HTMLElement | null>(null);
	let open = $state(false);
	let focusedOptionIdx = $state<number | undefined>();
	let fileInput = $state<HTMLInputElement | undefined>();
	let localValue = $state<AttachmentItem[]>([]);
	let hasUserEdit = $state(false);
	let tabindex = $state(0);

	let config = $derived(cellOptions ?? {});
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
	let baseRole = $derived(config.role ?? 'form');
	let isFormField = $derived(baseRole === 'form');
	let usePopup = $derived(!readonly && !disabled);

	let error = $derived(optionError);
	let icon = $derived(error ? 'ph ph-warning' : optionIcon);
	let dirty = $derived(config.dirty);
	let inEdit = $derived($csm === 'editing');
	let propAttachments = $derived(normalizeAttachments(value, true));
	let attachments = $derived(localValue);
	let isDirty = $derived(
		hasUserEdit && JSON.stringify(localValue) !== JSON.stringify(propAttachments)
	);
	let isEmpty = $derived(attachments.length < 1);
	let showPlaceholder = $derived(isEmpty && shouldShowCellViewChrome(baseRole, inEdit));

	const updateLocal = (nextValue: AttachmentItem[]) => {
		hasUserEdit = true;
		localValue = nextValue;
	};

	const processFiles = async (fileList: File[]) => {
		if (!API || !tableid) return [];
		try {
			const res = await uploadAttachments(API, tableid, fileList);
			updateLocal([...localValue, ...res]);
			return res;
		} catch (error) {
			console.error('Upload failed:', error);
			return [];
		}
	};

	const handleFileSelect = async (event: Event) => {
		const target = event.target as HTMLInputElement;
		const files = Array.from(target.files || []);
		await processFiles(files);
		target.value = '';
	};

	const handleDelete = (key: number) => {
		const next = [...localValue];
		next.splice(key, 1);
		updateLocal(next);
	};

	const csm = fsm('view', {
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
				if (!readonly && !disabled) {
					requestOpenOnEnter();
					return 'editing';
				}
			},
			toggle() {
				if (!readonly && !disabled) {
					requestIconOpenOnEnter();
					return 'editing';
				}
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
			copy() {
				copyAndTransition(() => csm, attachmentCopyText(propAttachments));
			},
			keydown(e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.copy();
				}
			}
		},
		justCopied: deferJustCopied(() => csm),
		disabled: {
			_enter() {
				open = false;
			}
		},
		editing: {
			_enter() {
				localValue = propAttachments;
				open = consumeOpenOnEnter();
				dispatch('enteredit');
			},
			_exit() {
				open = false;
				dispatch('exitedit');
			},
			toggle() {
				open = !open;
			},
			click() {
				csm.toggle();
			},
			keydown(e) {
				if (e.key === ' ' || e.key === 'Enter') {
					e.preventDefault();
					csm.toggle();
				}

				if (e.key === 'Escape') {
					csm.cancel();
				}
			},
			submit() {
				if (isDirty) {
					dispatch('change', localValue);
				}
				dispatch('focusout');
				open = false;
				return isFormField ? 'editing' : 'view';
			},
			exitEdit() {
				return this.submit();
			},
			close() {
				return this.submit();
			},
			focusout(e: FocusEvent) {
				const related = e.relatedTarget as Node | null;
				if (related === fileInput) return;
				if (related && popup?.contains(related)) return;
				if (related && anchor?.contains(related)) return;
				return this.submit();
			},
			popupFocusout(e: FocusEvent) {
				if (anchor?.contains(e.relatedTarget as Node)) return;
				return this.submit();
			},
			popupKeydown(e: KeyboardEvent) {
				if (e.key === 'Tab') {
					e.preventDefault();
					anchor?.focus();
				}
				if (e.key === 'Escape') {
					e.preventDefault();
					csm.cancel();
				}
			},
			cancel() {
				hasUserEdit = false;
				localValue = propAttachments;
				open = false;
				return isFormField ? 'editing' : 'view';
			}
		}
	});

	$effect(() => {
		const next = propAttachments;
		if (!hasUserEdit) {
			localValue = next;
			return;
		}
		if (JSON.stringify(next) === JSON.stringify(localValue)) {
			hasUserEdit = false;
		}
	});

	$effect(() => {
		if (disabled) {
			csm.goTo('disabled');
		} else if (readonly && copyable && propAttachments.length) {
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
				csm.toggle();
			}, 30);
		}
	});
</script>

<!-- svelte-ignore event_directive_deprecated -->
<BaseCell
	{id}
	role={baseRole}
	{csm}
	bind:anchor
	{icon}
	isDirty={dirty && showDirty}
	clearable={false}
	{error}
	{copyIcon}
	{color}
	{background}
	popupOpen={open}
	controlIcon={usePopup ? 'ph ph-caret-down' : undefined}
	{tabindex}
>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	{#key $csm}
		{#key isEmpty}
			<div class="value-contents" class:placeholder={showPlaceholder} use:tooltip>
				<div class="value">
					{#if isEmpty}
						{resolveEmptyViewText(placeholder, baseRole, inEdit)}
					{:else}
						<div class="items">
							{#each attachments.slice(0, 5) as file}
								{#if file}
									<div class="item pill">
										<span>{file?.extension?.toUpperCase()}</span>
									</div>
								{/if}
							{/each}
							{#if attachments.length > 5}
								<span class="remaining-count">( + {attachments.length - 5} )</span>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{/key}
	{/key}
</BaseCell>

{#if inEdit}
	<!-- svelte-ignore event_directive_deprecated -->
	<SuperPopover
		{anchor}
		align="right"
		{open}
		maxHeight={350}
		useAnchorWidth
		dismissible={true}
		on:close={csm.close}
	>
		{#snippet children()}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore event_directive_deprecated -->
			<div
				class="popup"
				bind:this={popup}
				on:focusout={csm.popupFocusout}
				on:keydown={csm.popupKeydown}
			>
				<div class="attachments">
					{#if localValue?.length}
						{#each localValue as attachment, idx (idx)}
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
						multiple
						style="display: none;"
						on:change={handleFileSelect}
					/>
				</div>
			</div>
		{/snippet}
	</SuperPopover>
{/if}

<style>
	.value-contents {
		font-size: 13px;
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
		overflow: hidden;
		padding: var(--super-cell-padding);
	}

	.value-contents.placeholder {
		color: var(--spectrum-global-color-gray-500);
		font-style: italic !important;
	}

	.value {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-style: inherit;
		min-width: 0;
	}

	.items {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		min-width: 0;
		flex: 1 1 auto;
		flex-wrap: nowrap;
		overflow: hidden;
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
		flex-shrink: 0;
	}

	a.filename {
		line-height: 22px;
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
		text-decoration: underline;
		color: var(--spectrum-global-color-blue-700);
		flex: 1 1 auto;
		min-width: 0;
	}

	.popup {
		display: flex;
		flex-direction: column;
		overflow: hidden;
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
