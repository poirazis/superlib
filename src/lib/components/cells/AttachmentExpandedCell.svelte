<script lang="ts">
	import { createEventDispatcher, getContext } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import SuperLightbox from '../SuperLightbox/SuperLightbox.svelte';
	import {
		attachmentCopyText,
		isImage,
		isMultiAttachment,
		normalizeAttachments,
		uploadAttachments,
		copyAndTransition,
		deferJustCopied
	} from './helpers.js';
	import type { AttachmentItem } from './types.js';

	const dispatch = createEventDispatcher<{
		change: AttachmentItem[];
		enteredit: void;
		exitedit: void;
		focusout: void;
		view: { attachment: AttachmentItem; index: number };
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
		autofocus = false,
		inBuilder = false,
		children
	} = $props();

	let anchor = $state<HTMLElement | null>(null);
	let picker = $state<HTMLElement | undefined>();
	let fileInput = $state<HTMLInputElement | undefined>();
	let focusedOptionIdx = $state<number | undefined>();
	let selectedIndices = $state(new Set<number>());
	let currentIndex = $state(0);
	let showModal = $state(false);
	let modalImageIndex = $state(0);
	let localValue = $derived<AttachmentItem[]>(value);

	let config = $derived(cellOptions ?? {});
	let multi = $derived(isMultiAttachment(fieldSchema));
	let controlType = $derived(config.controlType || 'list');
	let imageRatio = $derived(config.imageRatio || 'landscape');
	let gridColumns = $derived(config.gridColumns || 4);
	let canAdd = $derived(!config.readonly && !config.disabled);
	let isGallery = $derived(config.isGallery);
	let disabled = $derived(config.disabled);
	let readonly = $derived(config.readonly);
	let copyable = $derived(config.copyable);
	let copyIcon = $derived(config.copyIcon ?? 'always');
	let onClickAction = $derived(config.onClickAction);

	let canSelect = $derived(!readonly && !disabled && !isGallery);
	let canDelete = $derived(!readonly && !disabled && !isGallery);
	let slotted = $derived(config.slotted);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let baseRole = $derived(config.role ?? 'form');

	const aspectRatio = $derived(
		imageRatio === 'landscape' ? '4 / 3' : imageRatio === 'square' ? '1 / 1' : '3 / 4'
	);

	const emitChange = (nextValue: AttachmentItem[]) => {
		localValue = nextValue;
		dispatch('change', nextValue);
	};

	const processFiles = async (fileList: File[]) => {
		if (!API || !tableid) return [];
		try {
			const res = await uploadAttachments(API, tableid, fileList);
			emitChange([...localValue, ...res]);
			return res;
		} catch (error) {
			console.error('Upload failed:', error);
			return [];
		}
	};

	const handleDelete = (key: number) => {
		const next = [...localValue];
		next.splice(key, 1);
		emitChange(next);
	};

	const toggleSelection = (index: number) => {
		const newSet = new Set(selectedIndices);
		if (newSet.has(index)) {
			newSet.delete(index);
		} else {
			newSet.add(index);
		}
		selectedIndices = newSet;
	};

	const clearSelection = () => {
		selectedIndices = new Set();
	};

	const deleteSelected = () => {
		if (selectedIndices.size === 0) return;
		const indicesToDelete = Array.from(selectedIndices).sort((a, b) => b - a);
		const next = [...localValue];
		indicesToDelete.forEach((idx) => next.splice(idx, 1));
		clearSelection();
		emitChange(next);
	};

	const uploadNewAttachment = () => {
		fileInput?.click();
	};

	const handleFileSelect = (event: Event) => {
		const target = event.target as HTMLInputElement;
		const files = Array.from(target.files || []);
		processFiles(files);
		target.value = '';
	};

	const openModal = (index: number) => {
		if (!disabled && !inBuilder && localValue?.[index] && isImage(localValue[index])) {
			modalImageIndex = index;
			showModal = true;
		}
	};

	const carouselNext = () => {
		if (localValue?.length > 1) {
			currentIndex = (currentIndex + 1) % localValue.length;
			dispatch('view', {
				attachment: localValue[currentIndex],
				index: currentIndex
			});
		}
	};

	const carouselPrev = () => {
		if (localValue?.length > 1) {
			currentIndex = (currentIndex - 1 + localValue.length) % localValue.length;
			dispatch('view', {
				attachment: localValue[currentIndex],
				index: currentIndex
			});
		}
	};

	const carouselGoTo = (index: number) => {
		if (index >= 0 && index < localValue?.length) {
			currentIndex = index;
			dispatch('view', {
				attachment: localValue[currentIndex],
				index: currentIndex
			});
		}
	};

	const handleCarouselKeydown = (event: KeyboardEvent) => {
		if (controlType === 'carousel' && localValue?.length > 1) {
			if (event.key === 'ArrowLeft') {
				event.preventDefault();
				carouselPrev();
			} else if (event.key === 'ArrowRight') {
				event.preventDefault();
				carouselNext();
			}
		}
	};

	const onItemClick = (index: number) => {
		if (!onClickAction || onClickAction === 'none') {
			return;
		} else if (onClickAction === 'view') {
			openModal(index);
		} else if (onClickAction === 'select') {
			toggleSelection(index);
		} else if (onClickAction === 'custom') {
			const item = localValue[index];
			config.onItemClick?.({ item, index });
		}
	};

	const csm = fsm('editing', {
		'*': {
			goTo(state: string) {
				return state;
			},
			copy() {},
			click() {},
			toggle() {}
		},
		view: {
			_enter() {},
			focus() {
				if (!readonly) return 'editing';
			}
		},
		readonly: {
			_enter() {}
		},
		copyable: {
			_enter() {},
			copy() {
				copyAndTransition(() => csm, attachmentCopyText(localValue));
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
			_enter() {}
		},
		editing: {
			_enter() {
				localValue = normalizeAttachments(value, multi);
				anchor?.focus();
				dispatch('enteredit');
			},
			_exit() {
				dispatch('exitedit');
			},
			focusout(e: FocusEvent) {
				const related = e.relatedTarget as Node | null;
				if (!anchor?.contains(related)) {
					return readonly ? 'readonly' : 'editing';
				}
			},
			submit(e: FocusEvent) {
				const related = e.relatedTarget as Node | null;
				if (!picker?.contains(related)) {
					if (isDirty) {
						dispatch('change', localValue);
					}
					dispatch('focusout');
					return readonly ? 'readonly' : 'editing';
				}
			},
			cancel() {
				localValue = normalizeAttachments(value, multi);
				return readonly ? 'readonly' : 'editing';
			}
		}
	});

	let inEdit = $derived($csm === 'editing');
	let isDirty = $derived(
		inEdit && JSON.stringify(localValue) !== JSON.stringify(normalizeAttachments(value, multi))
	);

	$effect(() => {
		if ($csm === 'editing') return;
		localValue = normalizeAttachments(value, multi);
	});

	$effect(() => {
		if (disabled) {
			csm.goTo('disabled');
		} else if (readonly && copyable && localValue.length) {
			csm.goTo('copyable');
		} else if (readonly) {
			csm.goTo('readonly');
		} else {
			csm.goTo('editing');
		}
	});

	$effect(() => {
		if (autofocus) {
			setTimeout(() => {
				csm.focus();
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
	multirow
	{copyIcon}
	{color}
	{background}
	tabindex={disabled || (readonly && !copyable) ? -1 : 0}
>
	{#key $csm}
		{#key localValue}
			{#if controlType == 'list'}
				<div class="attachments" bind:this={picker}>
					{#if localValue?.length}
						{#each localValue as attachment, idx (idx)}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="attachment"
								class:focused={focusedOptionIdx === idx}
								class:selected={selectedIndices.has(idx)}
								on:mouseenter={() => (focusedOptionIdx = idx)}
								on:click={() => toggleSelection(idx)}
							>
								<!-- svelte-ignore event_directive_deprecated -->
								<button
									class="btn-download"
									on:click={() => handleDelete(idx)}
									tabindex="-1"
									aria-label="Download {attachment.name}"
									title="Download {attachment.name}"
									type="button"
								>
									<i class="ph ph-download-simple"></i>
								</button>
								<a href={attachment.url} class="filename">{attachment.name}</a>
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

					{#if canAdd}
						<!-- svelte-ignore event_directive_deprecated -->
						<button
							class="btn-upload-empty list"
							style:margin-top={localValue?.length ? '0.5rem' : '0'}
							on:click={uploadNewAttachment}
							aria-label="Upload attachment"
							type="button"
							disabled={disabled || readonly}
						>
							<i class="ph ph-plus"></i> Add Attachment
						</button>
					{/if}
				</div>
			{:else if controlType == 'carousel'}
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="carousel" on:keydown={handleCarouselKeydown}>
					{#if localValue?.length}
						<div class="carousel-content">
							{#if isImage(localValue[currentIndex])}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="carousel-image"
									class:selected={selectedIndices.has(currentIndex)}
									style="background-image: url('{localValue[currentIndex].url}')"
									aria-label={localValue[currentIndex].name}
									on:click={() => {
										if (inEdit) onItemClick(currentIndex);
									}}
								>
									{#if localValue.length > 1 || canAdd}
										<div class="carousel-controls">
											{#if localValue.length > 1}
												<!-- svelte-ignore event_directive_deprecated -->
												<button
													class="btn-nav"
													on:click|stopPropagation={carouselPrev}
													aria-label="Previous attachment"
													type="button"
													{disabled}
												>
													<i class="ph ph-caret-left"></i>
												</button>
												<div class="indicators">
													{#each localValue as _, idx}
														<!-- svelte-ignore event_directive_deprecated -->
														<button
															class="indicator"
															class:active={idx === currentIndex}
															on:click|stopPropagation={() => carouselGoTo(idx)}
															aria-label="Go to attachment {idx + 1}"
															type="button"
															{disabled}
														></button>
													{/each}
												</div>
												<!-- svelte-ignore event_directive_deprecated -->
												<button
													class="btn-nav"
													on:click|stopPropagation={carouselNext}
													aria-label="Next attachment"
													type="button"
													{disabled}
												>
													<i class="ph ph-caret-right"></i>
												</button>
												<!-- svelte-ignore event_directive_deprecated -->
												<button
													class="btn-nav"
													style="align-self: flex-end;"
													on:click|stopPropagation={() => openModal(currentIndex)}
													aria-label="Full Screen"
													type="button"
													{disabled}
												>
													<i class="ph ph-arrows-out-simple"></i>
												</button>
											{/if}
											{#if canAdd}
												<!-- svelte-ignore event_directive_deprecated -->
												<button
													class="btn-nav add"
													style="align-self: flex-end;"
													on:click|stopPropagation={uploadNewAttachment}
													aria-label="Upload attachment"
													type="button"
												>
													<i class="ph ph-upload"></i>
												</button>
											{/if}
										</div>
									{/if}
								</div>
							{:else if !isGallery}
								<div class="carousel-fallback">
									<div class="pill">{localValue[currentIndex].extension?.toUpperCase()}</div>
									<span class="filename">{localValue[currentIndex].name}</span>
								</div>
							{/if}
						</div>
					{:else if !isGallery}
						<div class="carousel-placeholder">
							{#if canAdd}
								<!-- svelte-ignore event_directive_deprecated -->
								<button
									class="btn-upload-empty"
									on:click={uploadNewAttachment}
									aria-label="Upload attachment"
									type="button"
									disabled={disabled || readonly}
								>
									<i class="ph ph-plus"></i>
									Upload Attachment
								</button>
							{/if}
						</div>
					{/if}
				</div>
			{:else if controlType == 'grid'}
				<div class="attachment-grid-wrapper">
					<div class="attachment-grid" style:--grid-columns={gridColumns}>
						{#if localValue?.length}
							{#each localValue as attachment, idx (idx)}
								{#if isImage(attachment)}
									<div
										class="grid-item"
										class:focused={focusedOptionIdx === idx}
										class:selected={selectedIndices.has(idx)}
										style="aspect-ratio: {aspectRatio}"
									>
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<div
											class="grid-image"
											style="background-image: url('{attachment.url}');"
											role="button"
											tabindex="0"
											aria-label={attachment.name}
											on:click={() => onItemClick(idx)}
											on:keydown={(e) => e.key === 'Enter' && toggleSelection(idx)}
										>
											{#if slotted}
												<div class="slot-container">
													{@render children?.()}
												</div>
											{/if}
											{#if !isGallery && !readonly}
												<div class="grid-overlay-top">
													<!-- svelte-ignore event_directive_deprecated -->
													<button
														class="btn-grid-download"
														on:click={() => {
															const link = document.createElement('a');
															link.href = attachment.url ?? '';
															link.download = attachment.name ?? '';
															document.body.appendChild(link);
															link.click();
															document.body.removeChild(link);
														}}
														tabindex="-1"
														aria-label="Download {attachment.name}"
														type="button"
													>
														<i class="ph ph-download-simple"></i>
													</button>
													<!-- svelte-ignore event_directive_deprecated -->
													<button
														class="btn-grid-delete"
														on:click={() => handleDelete(idx)}
														tabindex="-1"
														aria-label="Delete {attachment.name}"
														type="button"
													>
														<i class="ph ph-trash-simple"></i>
													</button>
												</div>
											{/if}
										</div>
									</div>
								{:else if !isGallery}
									<div
										class="grid-item"
										class:focused={focusedOptionIdx === idx}
										class:selected={selectedIndices.has(idx)}
										style="aspect-ratio: {aspectRatio}"
									>
										<div class="grid-fallback">
											<div class="pill">{attachment.extension?.toUpperCase()}</div>
											<span class="filename">{attachment.name}</span>
										</div>
									</div>
								{/if}
							{/each}

							{#if canAdd}
								<div class="grid-item grid-add-item" style="aspect-ratio: {aspectRatio}">
									<!-- svelte-ignore event_directive_deprecated -->
									<button
										class="btn-upload-empty grid"
										on:click={uploadNewAttachment}
										aria-label="Upload attachment"
										type="button"
										disabled={disabled || readonly}
									>
										<i class="ph ph-plus"></i>
										<span>Add Images</span>
									</button>
								</div>
							{/if}
						{:else}
							<div class="grid-empty">
								{#if canAdd}
									<!-- svelte-ignore event_directive_deprecated -->
									<button
										class="btn-upload-empty grid"
										on:click={uploadNewAttachment}
										aria-label="Upload attachment"
										type="button"
										disabled={disabled || readonly}
									>
										<i class="ph ph-plus"></i>
										<span>Add Images</span>
									</button>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		{/key}
	{/key}

	{#if selectedIndices.size > 0 && controlType === 'grid' && !readonly && !isGallery}
		<div class="bulk-actions-overlay">
			<!-- svelte-ignore event_directive_deprecated -->
			<button
				class="btn-bulk-action btn-close"
				on:click={clearSelection}
				type="button"
				title="Clear Selection"
			>
				<i class="ph ph-x"></i>
			</button>
			<span class="selection-count">
				{selectedIndices.size == 1
					? selectedIndices.size + ' Item '
					: selectedIndices.size + ' Items '}
				Selected
			</span>
			<!-- svelte-ignore event_directive_deprecated -->
			<button
				class="btn-bulk-action btn-bulk-delete"
				on:click={deleteSelected}
				type="button"
				title="Delete Selected"
			>
				<i class="ph ph-trash-simple"></i>
			</button>
		</div>
	{/if}

	<input
		type="file"
		bind:this={fileInput}
		on:change={handleFileSelect}
		multiple={multi}
		style="display: none"
	/>

	<SuperLightbox
		bind:items={localValue}
		bind:open={showModal}
		bind:currentIndex={modalImageIndex}
		bind:selectedIndices
		{canSelect}
		{canDelete}
	/>
</BaseCell>

<style>
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

	.filename {
		flex: auto;
		line-height: 22px;
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
		color: var(--spectrum-global-color-gray-700);
		font-size: 12px;
	}

	.btn-delete,
	.btn-download {
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

	.btn-download:hover {
		border-color: var(--spectrum-global-color-blue-500);
		color: var(--spectrum-global-color-blue-500);
	}

	.attachment {
		box-sizing: content-box;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0rem 0.25rem;
		min-height: 30px;
		cursor: pointer;
		border-bottom: 1px solid var(--spectrum-global-color-gray-200);
	}

	.attachment:last-child {
		border-bottom: none;
	}

	.attachment:hover {
		background-color: var(--spectrum-global-color-gray-100);
	}

	.attachment.selected {
		background-color: var(--spectrum-global-color-blue-100);
	}

	.attachments {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		position: relative;
		width: 100%;
		height: 100%;
		overflow-y: auto;
	}

	.carousel {
		position: relative;
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		min-width: 8rem;
		height: 100%;
	}

	.carousel:hover .carousel-controls {
		opacity: 1;
	}

	.carousel-content {
		flex: 1;
		display: flex;
		justify-content: center;
		align-items: center;
		width: 100%;
		height: 100%;
	}

	.carousel-image {
		width: 100%;
		height: 100%;
		min-width: 8rem;
		background-size: cover;
		background-position: center;
		background-repeat: no-repeat;
		border-radius: 4px;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		cursor: pointer;
		position: relative;
	}

	.carousel-image.selected::after {
		content: '\2713';
		position: absolute;
		top: 1rem;
		left: 1rem;
		width: 1.5rem;
		height: 1.5rem;
		background: var(--spectrum-global-color-blue-600);
		border-radius: 4px;
		pointer-events: none;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-size: 1rem;
		font-weight: bold;
	}

	.carousel-fallback {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.carousel-controls {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 1rem;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(4px);
		z-index: 10;
		opacity: 0.65;
		transition: opacity 0.2s ease;
	}

	.btn-nav {
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.7);
		border-radius: 50%;
		width: 1.5rem;
		height: 1.5rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-size: 12px;
	}

	.indicators {
		display: flex;
		gap: 0.25rem;
	}

	.indicator {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--spectrum-global-color-gray-400);
		border: none;
		cursor: pointer;
	}

	.indicator.active {
		background: var(--spectrum-global-color-static-blue-600);
	}

	.carousel-placeholder,
	.grid-empty {
		flex: 1;
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}

	.btn-upload-empty {
		flex: none;
		background: none;
		border: 2px dashed var(--spectrum-global-color-gray-400);
		border-radius: 6px;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--spectrum-global-color-gray-600);
		font-size: 14px;
		justify-content: center;
	}

	.btn-upload-empty.list {
		height: 2rem;
		flex-direction: row;
		padding: unset;
	}

	.btn-upload-empty:hover:not(:disabled) {
		border-color: var(--spectrum-global-color-blue-500);
		color: var(--spectrum-global-color-blue-500);
		background-color: var(--spectrum-global-color-blue-50);
	}

	.attachment-grid-wrapper {
		flex: auto;
		position: relative;
		width: 100%;
		height: 100%;
		overflow-y: auto;
	}

	.attachment-grid {
		flex: auto;
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), 1fr);
		grid-auto-rows: 1fr;
		gap: 0.25rem;
		padding: 0.25rem;
		min-width: 15rem;
		overflow-y: auto;
		min-height: 13rem;
	}

	.grid-item {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 0.25rem;
		border: 1px solid transparent;
		border-radius: 4px;
		overflow: hidden;
	}

	.grid-item.selected {
		border-color: var(--spectrum-global-color-blue-600);
	}

	.grid-item.selected::after {
		content: '\2713';
		position: absolute;
		top: 1rem;
		left: 1rem;
		width: 1.5rem;
		height: 1.5rem;
		background: var(--spectrum-global-color-blue-600);
		border-radius: 4px;
		pointer-events: none;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-size: 1rem;
		font-weight: bold;
	}

	.grid-image {
		width: 100%;
		height: 100%;
		background-size: cover;
		background-position: center;
		background-repeat: no-repeat;
		border-radius: 4px;
		cursor: pointer;
		filter: grayscale(50%);
		padding: 1rem;
		position: relative;
	}

	.grid-image:hover {
		filter: grayscale(0%);
	}

	.grid-fallback {
		height: 100%;
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		border: 1px solid var(--spectrum-global-color-gray-300);
		background-color: var(--spectrum-global-color-gray-100);
		padding: 1rem;
	}

	.grid-overlay-top {
		position: absolute;
		bottom: 0.25rem;
		left: 0.25rem;
		right: 0.25rem;
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 1rem;
		background-color: rgba(0, 0, 0, 0.5);
		z-index: 10;
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.grid-item:hover .grid-overlay-top {
		opacity: 1;
	}

	.btn-grid-download,
	.btn-grid-delete {
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.7);
		border-radius: 50%;
		width: 1.5rem;
		height: 1.5rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(255, 255, 255, 0.7);
		font-size: 12px;
	}

	.btn-upload-empty.grid {
		width: 100%;
		height: 100%;
		flex-direction: column;
		padding: 1rem;
	}

	.bulk-actions-overlay {
		position: absolute;
		bottom: 1.25rem;
		left: 1.25rem;
		height: 36px;
		border-radius: 4px;
		background: var(--spectrum-global-color-gray-200);
		border: 1px solid var(--spectrum-global-color-gray-400);
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0 0.75rem;
		z-index: 100;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
	}

	.selection-count {
		margin-right: 1.5rem;
		font-size: 13px;
	}

	.btn-bulk-action {
		background: none;
		border: none;
		border-radius: 4px;
		padding: 0.25rem 0.5rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		color: var(--spectrum-global-color-gray-700);
		font-size: 13px;
	}

	.btn-bulk-delete {
		color: var(--spectrum-global-color-red-600);
	}

	.slot-container {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: stretch;
		justify-content: stretch;
		pointer-events: none;
		background-color: rgba(0, 0, 0, 0.5);
		opacity: 0;
		transition: all 0.2s ease;
		border-radius: 8px;
	}

	.grid-image:hover .slot-container {
		opacity: 1;
	}
</style>
