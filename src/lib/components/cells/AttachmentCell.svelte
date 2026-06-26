<script lang="ts">
	import { createEventDispatcher, getContext } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import { tooltip } from '../../actions/tooltip';
	import {
		attachmentCopyText,
		copyAndTransition,
		deferJustCopied,
		normalizeSingleAttachment,
		resolveEmptyViewText,
		uploadAttachments
	} from './helpers.js';
	import type { AttachmentItem } from './types.js';

	const dispatch = createEventDispatcher<{
		change: AttachmentItem | null;
		enteredit: void;
		exitedit: void;
		focusout: void;
	}>();

	const sdk = getContext<{
		API?: { uploadAttachment: (tableId: string, data: FormData) => Promise<AttachmentItem[]> };
	}>('sdk');

	let { id, value, cellOptions = {}, tableid, API = sdk?.API, autofocus = false } = $props();

	let fileInput = $state<HTMLInputElement | undefined>();
	let localAttachment = $state<AttachmentItem | null>(null);
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
	let selectFileText = $derived('Upload file...');

	let error = $derived(optionError);
	let icon = $derived(error ? 'ph ph-warning' : optionIcon);
	let dirty = $derived(config.dirty);
	let inEdit = $derived($csm === 'editing');
	let propAttachment = $derived(normalizeSingleAttachment(value)[0] ?? null);
	let isDirty = $derived(
		hasUserEdit && JSON.stringify(localAttachment) !== JSON.stringify(propAttachment)
	);
	let attachment = $derived(isDirty && inEdit ? localAttachment : propAttachment);
	let isEmpty = $derived(attachment == null);

	let anchor = $state<HTMLElement | null>(null);

	const emitChange = (nextValue: AttachmentItem | null) => {
		hasUserEdit = true;
		localAttachment = nextValue;
		dispatch('change', nextValue);
	};

	const processFiles = async (fileList: File[]) => {
		if (!API || !tableid) return [];
		try {
			const res = await uploadAttachments(API, tableid, fileList);
			emitChange(res[0] ?? null);
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
		anchor?.focus();
	};

	const handleDelete = () => {
		emitChange(null);
	};

	const triggerFileSelect = (event: Event) => {
		event.preventDefault();
		event.stopPropagation();
		fileInput?.click();
	};

	const csm = fsm('view', {
		'*': {
			goTo(state: string) {
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
		copyable: {
			copy() {
				copyAndTransition(() => csm, attachmentCopyText(propAttachment ? [propAttachment] : []));
			},
			keydown(e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.copy();
				}
			}
		},
		justCopied: deferJustCopied(() => csm),
		disabled: {},
		editing: {
			_enter() {
				localAttachment = propAttachment;
				dispatch('enteredit');
			},
			_exit() {
				dispatch('exitedit');
			},
			exitEdit() {
				if (isDirty) {
					dispatch('change', localAttachment);
				}
				dispatch('focusout');
				return 'view';
			},
			focusout(e) {
				let related = e.relatedTarget as Node | null;
				if (related && related == fileInput) return;
				if (anchor?.contains(related)) return;

				return 'view';
			},
			cancel() {
				hasUserEdit = false;
				localAttachment = propAttachment;
				return 'view';
			}
		}
	});

	$effect(() => {
		const next = propAttachment;
		if (!hasUserEdit) {
			localAttachment = next;
			return;
		}
		if (JSON.stringify(next) === JSON.stringify(localAttachment)) {
			hasUserEdit = false;
		}
	});

	$effect(() => {
		if (disabled) {
			csm.goTo('disabled');
		} else if (readonly && copyable && propAttachment) {
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
			setTimeout(() => csm.focus(), 30);
		}
	});
</script>

<!-- svelte-ignore event_directive_deprecated -->
<BaseCell
	{id}
	bind:anchor
	role={baseRole}
	{csm}
	{icon}
	isDirty={dirty && showDirty}
	clearable={false}
	{error}
	{copyIcon}
	{color}
	{background}
	{tabindex}
>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="value-contents" class:placeholder={isEmpty} use:tooltip>
		{#key $csm}
			{#key isEmpty}
				<div class="value">
					{#if isEmpty}
						{#if inEdit && !readonly && !disabled}
							<!-- svelte-ignore event_directive_deprecated -->
							<button
								class="select-link"
								type="button"
								on:click={triggerFileSelect}
								aria-label={selectFileText}
							>
								{selectFileText}
							</button>
						{:else}
							{resolveEmptyViewText(placeholder, baseRole, inEdit)}
						{/if}
					{:else if inEdit}
						<div class="inline-attachment">
							<div class="pill">{attachment.extension?.toUpperCase()}</div>
							<!-- svelte-ignore event_directive_deprecated -->
							<a href={attachment.url} class="filename" download on:click|stopPropagation>
								{attachment.name}
							</a>
							{#if !readonly}
								<!-- svelte-ignore event_directive_deprecated -->
								<button
									class="btn-delete-inline"
									on:click|stopPropagation={handleDelete}
									tabindex="-1"
									aria-label="Delete"
									title="Delete"
									type="button"
								>
									<i class="ph ph-trash-simple"></i>
								</button>
							{/if}
						</div>
					{:else}
						<div class="items">
							<div class="item pill">
								<span>{attachment.extension?.toUpperCase()}</span>
							</div>
							<span class="filename-view">{attachment.name}</span>
						</div>
					{/if}
				</div>
			{/key}
		{/key}
	</div>
</BaseCell>

{#if inEdit && !readonly && !disabled}
	<!-- svelte-ignore event_directive_deprecated -->
	<input bind:this={fileInput} type="file" style="display: none;" on:change={handleFileSelect} />
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

	.select-link {
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		font: inherit;
		font-style: italic;
		color: var(--spectrum-global-color-blue-700);
		text-decoration: underline;
		cursor: pointer;
	}

	.select-link:hover {
		color: var(--spectrum-global-color-blue-800);
	}

	.inline-attachment {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		width: 100%;
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

	.btn-delete-inline {
		color: var(--spectrum-global-color-gray-500);
		background: none;
		border: 1px solid transparent;
		cursor: pointer;
		padding: 0.25rem;
		border-radius: 3px;
		flex-shrink: 0;
	}

	.btn-delete-inline:hover {
		border-color: var(--spectrum-global-color-red-500);
		color: var(--spectrum-global-color-red-500);
	}

	.filename-view {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
</style>
