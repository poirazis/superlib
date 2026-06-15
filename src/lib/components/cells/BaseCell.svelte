<script lang="ts">
	import Button from '../Button.svelte';
	import SimpleButton from '../UI/elements/SimpleButton.svelte';
	interface BaseCellProps {
		role?: string;
		csm?: any; // state machine instance
		id?: string;
		error?: boolean;
		isDirty?: boolean;
		multirow?: boolean;
		placeholder?: boolean; // applies the .placeholder visual class
		copyIcon?: 'always' | 'onhover' | string;
		grabber?: boolean;
		naked?: boolean;
		color?: string;
		background?: string;
		styles?: Record<string, any>; // for use with stylable action
		tabindex?: number;
		popupOpen?: boolean;
		root?: HTMLElement | null;

		// allow other attributes / listeners via spread
		[key: string]: any;
	}

	let {
		id,
		role = 'form',
		csm,
		icon,
		clearable = false,
		error = false,
		isDirty = false,
		multirow = false,
		placeholder = false,
		copyIcon = 'always',
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
	let copyIconOnHover = $derived(copyIcon === 'onhover');
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
	class="super-cell {$csm} {role}"
	class:error
	class:dropdown={popupOpen !== undefined}
	class:multirow
	class:grabber
	class:naked-field={naked}
	class:icon-on-hover={$csm === 'copyable' && copyIconOnHover}
	class:open-popup={popupOpen}
	class:isDirty
	title={$csm === 'copyable' ? 'Click to copy' : undefined}
	style:color
	style:background
	on:focusin={csm.focus}
	on:focusout={csm.focusout}
	on:click={csm.click}
	on:keydown={csm.keydown}
>
	{#if error || icon}
		<!-- svelte-ignore a11y_interactive_supports_focus -->
		<i
			class={error ? 'ph ph-warning error-icon' : 'ph ph-' + icon + ' field-icon'}
			title={error ? 'Error' : icon}
		></i>
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

	{#if $csm === 'copyable' || $csm === 'justCopied'}
		<i class={actionIcon + ' copy-icon'} aria-hidden="true"></i>
	{/if}

	{#if buttons}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="buttons" on:mousedown|preventDefault>
			{#each buttons as button, index (index)}
				<SimpleButton
					fieldbutton={true}
					label={button.text}
					on:select={button.onClick}
					{...button}
				/>
			{/each}
		</div>
	{/if}
</div>

<style>
	.super-cell {
		--super-cell-padding: 0rem 0.75rem;
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
		transition: border-color 0.15s ease;
		color: var(--spectrum-global-color-gray-800);
		font-size: 13px;
	}

	.super-cell.isDirty {
		border-left: 4px solid var(--spectrum-global-color-orange-400) !important;
	}

	.buttons {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0 0.25rem;
	}

	.super-cell.view:focus,
	.super-cell.view:focus-within {
		outline: 1px solid var(--spectrum-global-color-static-blue-400);
		border-color: var(--spectrum-global-color-static-blue-400);
	}

	.super-cell.view {
		background: var(--spectrum-global-color-gray-50);
	}

	.super-cell.view:hover {
		border-color: rgb(from var(--spectrum-global-color-static-blue-400) r g b / 0.5);
		background: var(--spectrum-global-color-gray-50);
		cursor: text;
	}
	.super-cell.view.dropdown:hover {
		border-color: var(--spectrum-global-color-gray-300);
		background: var(--spectrum-global-color-gray-100);
		cursor: pointer;
	}

	.super-cell.view.error {
		border-color: var(--spectrum-global-color-red-500);
	}

	.super-cell.form {
		border-color: var(--spectrum-global-color-gray-300);
		border-radius: 0.25rem;
	}

	.super-cell.naked-field {
		height: auto;
		min-height: unset;
		background: transparent !important;
		border-color: transparent !important;
		padding: unset !important;
		max-width: fit-content !important;
	}

	.super-cell.naked-field.view,
	.super-cell.naked-field.editing,
	.super-cell.naked-field.readonly,
	.super-cell.naked-field.disabled {
		background: transparent;
		border-color: transparent;
	}

	.super-cell.naked-field.view:hover,
	.super-cell.naked-field.editing:hover,
	.super-cell.naked-field.dropdown.view:hover,
	.super-cell.naked-field.dropdown.editing:hover {
		background: transparent;
		border-color: transparent;
		cursor: pointer;
	}

	.super-cell.naked-field:focus,
	.super-cell.naked-field:focus-within {
		border-color: transparent !important;
	}

	.super-cell.naked-field.error {
		border-color: transparent;
	}

	.super-cell.inline {
		background: transparent;
		height: auto;
		min-height: 1.5rem;
	}

	.super-cell.cell {
		height: auto;
		background: transparent;
		color: inherit !important;
	}
	.super-cell.multirow {
		align-items: flex-start;
		height: auto;
	}

	.super-cell.multirow .copy-icon {
		align-self: flex-start;
		margin-top: 0.75rem;
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

	.super-cell.editing {
		border-color: var(--spectrum-global-color-static-blue-400);
		background: var(--spectrum-global-color-gray-50);
	}

	.super-cell.dropdown.editing {
		border-color: var(--spectrum-global-color-gray-300);
		background: var(--spectrum-global-color-gray-100);
	}

	.super-cell.error.editing {
		border-color: var(--spectrum-global-color-red-500);
	}

	.super-cell.slider.view:hover,
	.super-cell.slider.editing:hover {
		cursor: default;
	}

	.super-cell.slider.grabber.view,
	.super-cell.slider.grabber.editing {
		background: var(--spectrum-global-color-gray-50);
		color: var(--spectrum-global-color-gray-800);
		border-color: transparent;
	}

	.super-cell.slider.grabber.view:hover,
	.super-cell.slider.grabber.editing:hover {
		border-color: rgb(from var(--spectrum-global-color-static-blue-400) r g b / 0.5);
		background: var(--spectrum-global-color-gray-50);
	}

	:global(.super-cell > .copy-icon) {
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
		color: var(--spectrum-global-color-gray-600);
		border-left: 1px solid var(--spectrum-global-color-gray-300);
	}
	:global(.super-cell > .control-icon) {
		opacity: 0.5;
		font-size: 15px;
		transition:
			color 0.15s ease,
			opacity 0.15s ease;
		align-self: stretch;
		display: flex;
		align-items: center;
		justify-content: center;
		padding-right: 0.75rem;
		padding-left: 0.5rem;
		color: var(--spectrum-global-color-gray-700);
	}

	:global(.super-cell:hover > .control-icon) {
		opacity: 1;
		cursor: pointer;
	}

	.error-icon {
		color: var(--spectrum-global-color-red-500);
		font-size: 14px;
		align-self: center;
		padding: var(--super-cell-padding, 0.75rem);
		padding-right: unset;
	}

	.clear-icon {
		color: var(--spectrum-global-color-red-400);
		z-index: 1;
	}

	.clear-icon:hover {
		color: var(--spectrum-global-color-red-700);
		cursor: pointer;
	}

	:global(.super-cell > i.field-icon) {
		align-self: center;
		margin-left: 0.75rem;
		color: var(--spectrum-global-color-gray-600);
	}
	:global(.super-cell input.editor) {
		font-style: inherit;
		font-size: inherit;
		min-width: 0;
		max-width: 100%;
		flex: 1 1 auto;
		display: flex;
		align-items: center;
		height: 100%;
		color: inherit;
		border: none;
		outline: none;
		cursor: inherit;
		padding: var(--super-cell-padding);
		border: none;
		background: transparent;
	}
	:global(.super-cell input.editor:focus) {
		background: var(--spectrum-global-color-gray-50);
	}

	:global(.super-cell.inline input.editor) {
		padding: 0.25rem 0.25rem !important;
	}
	:global(.super-cell input.editor.placeholder) {
		font-style: italic !important;
		color: var(--spectrum-global-color-gray-600) !important;
	}
	:global(.super-cell textarea.editor) {
		width: 100%;
		height: 100%;
		background: transparent;
		color: inherit;
		border: none;
		outline: none;
		font-family: inherit;
		font-size: inherit;
		font-weight: inherit;
		padding: 0.75rem 0.75rem;
		resize: vertical;
	}
	:global(.super-cell textarea.editor.placeholder) {
		font-style: italic !important;
		color: var(--spectrum-global-color-gray-600);
	}
</style>
