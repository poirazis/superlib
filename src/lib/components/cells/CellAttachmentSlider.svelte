<script lang="ts">
	// @ts-expect-error svelte-carousel has no types
	import Carousel from 'svelte-carousel';
	import { createEventDispatcher, getContext } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import SuperLightbox from '../SuperLightbox/SuperLightbox.svelte';
	import {
		attachmentCopyText,
		isImage,
		isMultiAttachment,
		mapCellRole,
		normalizeAttachments,
		uploadAttachments,
		type AttachmentItem
	} from './attachmentUtils';
	import { copyTextToClipboard } from './cellClipboard';

	const dispatch = createEventDispatcher<{
		change: AttachmentItem[];
		enteredit: void;
		exitedit: void;
		focusout: void;
	}>();

	const sdk = getContext<{ API?: { uploadAttachment: (tableId: string, data: FormData) => Promise<AttachmentItem[]> } }>('sdk');

	let {
		value,
		cellOptions = {},
		fieldSchema,
		tableid,
		API = sdk?.API,
		inBuilder = false,
		children
	} = $props();

	let anchor = $state<HTMLElement | null>(null);
	let fileInput = $state<HTMLInputElement | undefined>();
	let selectedIndices = $state(new Set<number>());
	let currentIndex = $state(0);
	let showModal = $state(false);
	let modalImageIndex = $state(0);
	let localvalue = $state<AttachmentItem[]>([]);
	let originalValue = $state<AttachmentItem[] | AttachmentItem | null | undefined>();

	let config = $derived(cellOptions ?? {});
	let multi = $derived(isMultiAttachment(fieldSchema));
	let canAdd = $derived(!config.readonly && !config.disabled);
	let isGallery = $derived(config.isGallery);
	let disabled = $derived(config.disabled);
	let readonly = $derived(config.readonly);
	let copyable = $derived(config.copyable);
	let copyIcon = $derived(config.copyIcon ?? 'always');
	let canSelect = $derived(!readonly && !disabled && !isGallery);

	let justCopied = $state(false);
	let canDelete = $derived(!readonly && !disabled && !isGallery);
	let slotted = $derived(config.slotted);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let baseRole = $derived(mapCellRole(config.role));
	let onClickAction = $derived(config.onClickAction);

	let dots = $derived(
		config.carouselDots !== undefined ? config.carouselDots : (localvalue?.length ?? 0) > 1
	);
	let arrows = $derived(
		config.carouselArrows !== undefined ? config.carouselArrows : (localvalue?.length ?? 0) > 1
	);
	let infinite = $derived(
		config.carouselInfinite !== undefined ? config.carouselInfinite : (localvalue?.length ?? 0) > 1
	);
	let autoplay = $derived(config.carouselAutoplay !== undefined ? config.carouselAutoplay : false);
	let duration = $derived(
		config.carouselAutoplaySpeed !== undefined ? config.carouselAutoplaySpeed : 1000
	);
	let particlesToShow = $derived(
		config.carouselItemsToShow !== undefined ? config.carouselItemsToShow : 3
	);
	let particlesToScroll = $derived(
		config.carouselItemsToScroll !== undefined ? config.carouselItemsToScroll : 1
	);
	let marquee = $derived(config.carouselMode === 'marquee');

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

	const handleDelete = (key: number) => {
		const next = [...localvalue];
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

	const uploadNewAttachment = () => {
		fileInput?.click();
	};

	const handleFileSelect = (event: Event) => {
		const target = event.target as HTMLInputElement;
		const files = Array.from(target.files || []);
		processFiles(files);
		target.value = '';
	};

	const openModal = (index: number = currentIndex) => {
		if (!disabled && !inBuilder && localvalue?.[index] && isImage(localvalue[index])) {
			modalImageIndex = index;
			showModal = true;
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
			const item = localvalue[index];
			config.onItemClick?.({ item, index });
		}
	};

	export const cellState = fsm('editing', {
		'*': {
			goTo(state: string) {
				return state;
			}
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
				copyTextToClipboard(attachmentCopyText(localvalue), (copied) => (justCopied = copied));
			}
		},
		disabled: {
			_enter() {}
		},
		editing: {
			_enter() {
				originalValue = value;
				localvalue = normalizeAttachments(value, multi);
				anchor?.focus();
				dispatch('enteredit');
			},
			_exit() {
				dispatch('exitedit');
			},
			focusout(e: FocusEvent) {
				const related = e.relatedTarget as Node | null;
				if (!anchor?.contains(related)) {
					return readonly ? 'readonly' : baseRole === 'cell' ? 'view' : 'editing';
				}
			},
			cancel() {
				localvalue = normalizeAttachments(originalValue, multi);
				return readonly ? 'readonly' : baseRole === 'cell' ? 'view' : 'editing';
			}
		}
	});

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
</script>

<!-- svelte-ignore event_directive_deprecated -->
<BaseCell
	role={baseRole}
	state={cellState}
	bind:root={anchor}
	multirow
	{justCopied}
	{copyIcon}
	{color}
	{background}
	tabindex={disabled || (readonly && !copyable) ? -1 : 0}
	onfocusout={cellState.focusout}
>
	<div class="slider">
		{#if localvalue?.length}
			{#key particlesToShow}
				<Carousel
					{particlesToShow}
					{particlesToScroll}
					dots={dots && !marquee}
					arrows={arrows && !marquee}
					{infinite}
					autoplay={autoplay || marquee}
					{duration}
					height={'100%'}
				>
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div slot="prev" let:showPrevPage on:click={showPrevPage} class="slider-navbutton">
						<i class="ph ph-caret-left"></i>
					</div>
					{#each localvalue as attachment, idx (idx)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div class="slider-item" style:height={'100%'} on:click={() => onItemClick(idx)}>
							{#if isImage(attachment)}
								<div
									class="slider-image"
									class:selected={selectedIndices.has(idx)}
									style="background-image: url('{attachment.url}')"
									aria-label={attachment.name}
								>
									{#if slotted}
										<div class="slot-container">
											{@render children?.()}
										</div>
									{/if}
								</div>
							{:else if !isGallery}
								<div class="slider-fallback">
									<div class="pill">{attachment.extension?.toUpperCase()}</div>
									<span class="filename">{attachment.name}</span>
								</div>
							{/if}
						</div>
					{/each}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div slot="next" let:showNextPage on:click={showNextPage} class="slider-navbutton">
						<i class="ph ph-caret-right"></i>
					</div>
				</Carousel>
			{/key}
		{:else if !isGallery}
			<div class="slider-placeholder">
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

	<input
		type="file"
		bind:this={fileInput}
		on:change={handleFileSelect}
		multiple={multi}
		style="display: none"
	/>

	<SuperLightbox
		bind:items={localvalue}
		bind:open={showModal}
		bind:currentIndex={modalImageIndex}
		bind:selectedIndices
		on:delete={(e) => handleDelete(e.detail.index)}
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

	.slider {
		flex: auto;
		display: flex;
		flex-direction: row;
		align-items: stretch;
		justify-content: stretch;
		height: 100%;
		width: 100%;
	}

	:global(.slider .sc-carousel__content-container) {
		height: 100%;
	}

	.slider-item {
		flex: 0 0 100%;
		min-width: 100%;
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
	}

	.slider-image {
		position: relative;
		width: 100%;
		height: 100%;
		background-size: cover;
		background-position: center;
		background-repeat: no-repeat;
		border-radius: 4px;
		cursor: pointer;
		padding: 1rem;
	}

	.slider-image.selected::after {
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

	.slider-image:hover .slot-container {
		opacity: 1;
	}

	.slider-fallback {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.slider-placeholder {
		flex: 1;
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}

	.slider-navbutton {
		display: flex;
		align-items: center;
		padding: 0 0.5rem;
	}

	.slider-navbutton:hover {
		color: var(--spectrum-global-color-blue-600);
		cursor: pointer;
	}

	.btn-upload-empty {
		background: none;
		border: 2px dashed var(--spectrum-global-color-gray-400);
		border-radius: 6px;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		color: var(--spectrum-global-color-gray-600);
		font-size: 14px;
		padding: 1rem;
	}

	.btn-upload-empty:hover:not(:disabled) {
		border-color: var(--spectrum-global-color-blue-500);
		color: var(--spectrum-global-color-blue-500);
		background-color: var(--spectrum-global-color-blue-50);
	}

	.slot-container {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: stretch;
		justify-content: stretch;
		background-color: rgba(0, 0, 0, 0.5);
		opacity: 0;
	}
</style>