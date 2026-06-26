<script lang="ts">
	import SimpleButton from '../buttons/SimpleButton.svelte';
	import type { BaseCellProps } from './types';
	import {
		beginControlIconGesture,
		endControlIconGesture,
		requestIconOpenOnEnter,
		resolveCopyIconOnHover,
		shouldShowCellViewChrome
	} from './helpers';

	const handleControlIconClick = () => {
		try {
			if ($csm === 'view') {
				requestIconOpenOnEnter();
			}
			csm.toggle();
		} finally {
			endControlIconGesture();
		}
	};

	let {
		id,
		role = 'form',
		csm,
		icon,
		clearable = false,
		error = false,
		isDirty = false,
		multirow = false,
		copyIcon = 'always',
		align = undefined,
		controlIcon = undefined,
		grabber = false,
		naked = false,
		popupOpen = undefined,
		color,
		background,
		tabindex: tabindexOverride,
		anchor = $bindable(null),
		buttons = undefined,
		children
	}: BaseCellProps = $props();

	let cellTabindex = $derived(tabindexOverride ?? ($csm == 'view' || $csm == 'copyable' ? 0 : -1));
	let actionIcon = $derived($csm === 'justCopied' ? 'ph ph-check' : 'ph ph-copy');
	let copyIconOnHover = $derived(resolveCopyIconOnHover(copyIcon, align));
	let inEdit = $derived($csm === 'editing');
	let showFieldIcon = $derived(!!icon && shouldShowCellViewChrome(role, inEdit));
</script>

<!-- Common a11y ignores for interactive cell root (cell-like divs are intentionally focusable) -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore event_directive_deprecated -->

<div
	bind:this={anchor}
	{id}
	tabindex={cellTabindex}
	class="super-cell {role} {$csm}"
	class:error
	class:with-popup={popupOpen !== undefined}
	class:open={popupOpen}
	class:multirow
	class:naked-field={naked}
	class:icon-on-hover={$csm === 'copyable' && copyIconOnHover}
	class:isDirty
	title={$csm === 'copyable' ? 'Click copy icon to copy' : undefined}
	style:color
	style:background
	on:focusin={csm.focus}
	on:focusout={csm.focusout}
	on:click={csm.click}
	on:keydown={csm.keydown}
>
	{#if error}
		<!-- svelte-ignore a11y_interactive_supports_focus -->
		<i class="ph ph-warning error-icon" title="Error"></i>
	{/if}

	{#if showFieldIcon}
		<!-- svelte-ignore a11y_interactive_supports_focus -->
		<i class={'ph ph-' + icon + ' field-icon'} title={icon}></i>
	{/if}

	{@render children?.()}

	{#if clearable}
		<!-- svelte-ignore a11y_interactive_supports_focus -->
		<i
			class="ph ph-x control-icon clear-icon"
			on:mousedown|preventDefault={csm.clear}
			role="button"
			title="Clear value"
		></i>
	{/if}

	{#if ($csm === 'view' || $csm == 'editing') && controlIcon}
		<i
			class={controlIcon + ' control-icon'}
			on:mousedown|capture|preventDefault|stopPropagation={beginControlIconGesture}
			on:click|preventDefault|stopPropagation={handleControlIconClick}
		></i>
	{/if}

	{#if buttons?.length && $csm !== 'copyable' && $csm !== 'justCopied'}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="buttons" on:mousedown|preventDefault>
			{#each buttons as button, index (index)}
				<SimpleButton
					fieldbutton={true}
					label={button.text}
					on:click={button.onClick}
					{...button}
				/>
			{/each}
		</div>
	{/if}

	{#if $csm === 'copyable' || $csm === 'justCopied'}
		<i
			class={actionIcon + ' copy-icon'}
			role="button"
			tabindex="-1"
			title="Copy"
			on:click|preventDefault|stopPropagation={csm.copy}
		></i>
	{/if}
</div>

<style>
	/* --- Base --- */
	.super-cell {
		display: flex;
		align-items: stretch;
		width: 100%;
		height: 100%;
		box-sizing: border-box;
		overflow: hidden;
		position: relative;
		border: 1px solid transparent;
		min-width: 0;
		height: 2rem;
		transition:
			background-color 0.15s ease,
			border-color 0.15s ease;
		color: var(--spectrum-global-color-gray-800);
	}

	.super-cell:focus,
	.super-cell:focus-visible,
	.super-cell:focus-within {
		outline: none;
	}

	.super-cell :is(:focus, :focus-visible) {
		outline: none;
	}

	.super-cell :global(.switch-container:focus-visible) {
		outline: none;
	}

	.buttons {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding-right: 0.25rem;
	}

	/* --- Shared states (both roles) --- */
	.super-cell.view {
		background: var(--spectrum-global-color-gray-50);
	}

	.super-cell.view:focus,
	.super-cell.view:focus-within {
		border-color: var(--spectrum-global-color-static-blue-400);
	}

	.super-cell.view:hover {
		border-color: rgb(from var(--spectrum-global-color-static-blue-400) r g b / 0.5);
		background: var(--spectrum-global-color-gray-50);
		cursor: text;
	}

	.super-cell.view.error {
		border-color: var(--spectrum-global-color-red-500);
	}

	.super-cell.editing {
		border-color: var(--spectrum-global-color-static-blue-400);
		background: var(--spectrum-global-color-gray-50);
	}

	.super-cell.error.editing {
		border-color: var(--spectrum-global-color-red-500);
	}

	.super-cell.error.editing:focus,
	.super-cell.error.editing:focus-within {
		border-color: var(--spectrum-global-color-red-500);
	}

	.super-cell.disabled {
		background: var(--spectrum-global-color-gray-200);
		color: var(--spectrum-global-color-gray-500);
		cursor: not-allowed;
	}

	.super-cell.readonly {
		cursor: default;
		background: rgb(from var(--spectrum-global-color-gray-50) r g b / 0.75);
		border-color: var(--spectrum-global-color-gray-100);
		color: var(--spectrum-global-color-gray-700);
	}

	.super-cell.copyable {
		color: var(--spectrum-global-color-gray-700);
		border-color: var(--spectrum-global-color-gray-300);
		background: var(--spectrum-global-color-gray-50);
		cursor: pointer;
	}

	.super-cell.copyable:hover,
	.super-cell.copyable:focus {
		border-color: var(--spectrum-global-color-gray-400);
		background: var(--spectrum-global-color-gray-100);
	}

	.super-cell.justCopied {
		border-color: rgb(from var(--spectrum-global-color-static-green-400) r g b / 0.75) !important;
	}

	.super-cell.justCopied .copy-icon {
		color: var(--spectrum-global-color-green-700);
		opacity: 1;
	}

	.super-cell.copyable.icon-on-hover .copy-icon {
		opacity: 0;
	}

	.super-cell.copyable:hover .copy-icon,
	.super-cell.copyable:focus .copy-icon {
		opacity: 0.85;
		cursor: pointer;
	}

	.super-cell.copyable:hover .copy-icon:hover,
	.super-cell.copyable:focus .copy-icon:hover {
		opacity: 1;
	}

	/* --- Form role --- */
	.super-cell.form {
		--super-cell-padding: 0rem 0.75rem;
		font-size: 13px;
		border-color: var(--spectrum-global-color-gray-300);
		border-radius: 0.25rem;
	}

	.super-cell.form.view.with-popup:hover {
		border-color: var(--spectrum-global-color-gray-300);
		background: var(--spectrum-global-color-gray-100);
		cursor: pointer;
	}

	.super-cell.form.editing.with-popup {
		border-color: var(--spectrum-global-color-gray-300);
		background: var(--spectrum-global-color-gray-100);
	}

	.super-cell.form.editing:is(:focus, :focus-within, .with-popup:is(:focus, :focus-within)) {
		border-color: var(--spectrum-global-color-blue-400);
	}

	/* --- Cell role --- */
	.super-cell.cell {
		--super-cell-padding: 0 var(--super-table-cell-padding, 0.75rem);
		height: auto;
		font-size: 12px;
		line-height: 1.25;
		background: transparent;
		color: inherit;
		border: 1px solid transparent;
	}

	.super-cell.cell :global(.value-contents) {
		font-size: inherit;
	}

	.super-cell.cell.view:hover {
		border-color: rgb(from var(--spectrum-global-color-static-blue-400) r g b / 0.5);
		cursor: text;
	}

	.super-cell.cell.view.with-popup:hover {
		cursor: pointer;
	}

	.super-cell.cell.view:is(:focus, :focus-within) {
		border-color: var(--spectrum-global-color-static-blue-400);
	}

	.super-cell.cell.editing {
		border-color: var(--spectrum-global-color-static-blue-400);
		background: var(--spectrum-global-color-gray-50);
	}

	.super-cell.cell.editing.with-popup {
		border-color: var(--spectrum-global-color-blue-400);
		cursor: pointer;
	}

	.super-cell.cell.editing:is(:focus, :focus-within, .with-popup:is(:focus, :focus-within)) {
		border-color: var(--spectrum-global-color-blue-400);
	}

	.super-cell.cell.error.editing {
		border-color: var(--spectrum-global-color-red-500);
	}

	.super-cell.cell.error.editing:is(:focus, :focus-within) {
		border-color: var(--spectrum-global-color-red-500);
	}

	.super-cell.cell:not(.editing) :global(.control-icon),
	.super-cell.cell:not(.editing) :global(.action-icon) {
		display: none;
	}

	/* --- Modifiers --- */
	.super-cell.isDirty {
		border-left: 2px solid var(--spectrum-global-color-orange-400) !important;
	}

	.super-cell.form.naked-field {
		height: auto;
		min-height: unset;
		background: transparent !important;
		border-color: transparent !important;
		padding: unset !important;
		max-width: fit-content !important;
	}

	.super-cell.form.naked-field:is(.view, .editing, .readonly, .disabled) {
		background: transparent;
		border-color: transparent;
	}

	.super-cell.form.naked-field:is(.view, .editing):hover,
	.super-cell.form.naked-field:is(.view, .editing).with-popup:hover {
		background: transparent;
		border-color: transparent;
		cursor: pointer;
	}

	.super-cell.form.naked-field:is(:focus, :focus-within) {
		border-color: transparent;
	}

	.super-cell.form.naked-field.error {
		border-color: transparent;
	}

	.super-cell.form.multirow {
		--super-cell-padding: 0.5rem 0.75rem;
		align-items: flex-start;
		height: auto;
	}

	.super-cell.form.multirow :is(.copy-icon, .field-icon, .clear-icon, .error-icon) {
		align-self: flex-start;
		margin-top: 0.5rem;
	}

	.super-cell.form.multirow :is(.field-icon, .clear-icon, .error-icon) {
		padding-left: 0.5rem;
	}

	.super-cell.form.multirow .field-icon {
		color: var(--spectrum-global-color-gray-600);
	}

	.super-cell.form.multirow .buttons {
		margin-top: 0.25rem;
		margin-bottom: 0.5rem;
		flex-direction: column;
		align-items: flex-start;
	}

	/* --- Icons --- */
	.super-cell > :is(.copy-icon, .control-icon) {
		opacity: 0.5;
		font-size: 15px;
		transition:
			color 0.15s ease,
			opacity 0.15s ease;
		align-self: stretch;
		display: flex;
		align-items: center;
		justify-content: center;
		padding-right: 0.5rem;
		padding-left: 0.5rem;
	}

	.super-cell > .copy-icon {
		color: var(--spectrum-global-color-gray-600);
		border-left: 1px solid var(--spectrum-global-color-gray-300);
	}

	.super-cell > .control-icon {
		color: var(--spectrum-global-color-gray-700);
	}

	.super-cell:hover > .control-icon,
	.super-cell.copyable > .copy-icon,
	.super-cell.copyable:hover > .copy-icon {
		cursor: pointer;
	}

	.super-cell:hover > .control-icon {
		opacity: 1;
	}

	.super-cell :is(.error-icon, .field-icon) {
		align-self: center;
		padding-left: 0.75rem;
	}

	.error-icon,
	.clear-icon {
		font-size: 14px;
	}

	.error-icon {
		color: var(--spectrum-global-color-red-500);
	}

	.clear-icon {
		color: var(--spectrum-global-color-red-400);
		z-index: 1;
	}

	.field-icon {
		color: var(--spectrum-global-color-gray-600);
	}

	.clear-icon:hover {
		color: var(--spectrum-global-color-red-700);
		cursor: pointer;
	}

	/* --- Editors --- */
	:global(.super-cell :is(input, textarea).editor) {
		box-sizing: border-box;
		min-width: 0;
		max-width: 100%;
		width: 0;
		flex: 1 1 0;
		height: 100%;
		color: inherit;
		border: none;
		outline: none;
		background: transparent;
		padding: var(--super-cell-padding);
		font-style: inherit;
		font-size: inherit;
		cursor: inherit;
	}

	:global(.super-cell :is(input, textarea).editor):is(:focus, :focus-visible) {
		outline: none;
		background: var(--spectrum-global-color-gray-50);
	}

	:global(.super-cell textarea.editor) {
		font-family: inherit;
		font-weight: inherit;
		resize: vertical;
	}

	:global(.super-cell :is(input, textarea).editor.placeholder) {
		font-style: italic !important;
		color: var(--spectrum-global-color-gray-600) !important;
	}
</style>