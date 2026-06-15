<script>
	let {
		value = '',
		icon,
		align = 'left',
		disabled = false,
		copyable = false,
		copyIcon = 'always',
		copyLabel = 'Copy to clipboard',
		copiedLabel = 'Copied !',
		wrap = false,
		justCopied = $bindable(false),
		monospace = false,
		oncopy
	} = $props();

	let copyTimeout = $state();

	let stringValue = $derived(String(value ?? '').trim());
	let effectiveIcon = $derived(icon ? `ph ph-${icon}` : null);
	let actionIcon = $derived(justCopied ? 'ph ph-check' : 'ph ph-copy');

	function copyToClipboard() {
		if (disabled || !stringValue || justCopied || !copyable) return;

		const selectedText = window.getSelection()?.toString() || '';

		if (!oncopy) {
			navigator.clipboard
				.writeText(selectedText || stringValue)
				.then(() => {
					justCopied = true;
					clearTimeout(copyTimeout);
					copyTimeout = setTimeout(() => {
						justCopied = false;
					}, 400);
				})
				.catch((err) => {
					console.error('Failed to copy to clipboard:', err);
				});
		} else {
			oncopy({ value: stringValue });
		}
	}

	function handleKeydown(e) {
		if (disabled || !copyable) return;
		if ((e.key === 'Enter' || e.key === ' ') && !justCopied) {
			e.preventDefault();
			copyToClipboard();
		}
	}

	$effect(() => {
		return () => {
			clearTimeout(copyTimeout);
		};
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore event_directive_deprecated -->
<span
	class="textbox value"
	class:copyable
	class:copied={justCopied}
	class:disabled
	class:icon-on-hover={copyIcon === 'onhover' && align !== 'right'}
	class:wrap
	class:monospace
	role="button"
	tabindex={disabled ? -1 : 0}
	title={copyable ? (justCopied ? copiedLabel : copyLabel) : undefined}
	on:click={copyToClipboard}
	on:keydown={handleKeydown}
>
	{#if effectiveIcon}
		<i class={effectiveIcon + ' textbox-icon'} aria-hidden="true"></i>
	{/if}

	<span class="textbox-text" class:wrap style="text-align: {align}">
		{stringValue}
	</span>

	{#if copyable}
		<i class={actionIcon} class:copied={justCopied} class:copy-icon aria-hidden="true"></i>
	{/if}
</span>

<style>
	.textbox.value {
		flex: 1 0 100%;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background-color: transparent;
		min-width: 0;
		overflow: hidden;
	}

	.textbox.value:focus {
		outline: none;
	}

	.textbox-icon {
		margin-left: -0.25rem;
		color: var(--spectrum-global-color-gray-600);
	}

	.textbox.value.monospace {
		font-family: var(--spectrum-global-font-family-monospace);
	}

	.textbox.value.copyable {
		min-width: 0;
		justify-content: space-between;
	}

	.copy-icon {
		font-size: 15px;
		transition: color 0.15s ease;
	}

	.copy-icon.copied {
		color: var(--spectrum-global-color-green-700) !important;
	}

	.textbox.value.copyable .copy-icon {
		opacity: 0.45;
		transition: opacity 0.15s ease;
		flex-shrink: 0;
		color: var(--spectrum-global-color-gray-600);
		display: flex;
		align-items: center;
		margin-left: 0.5rem;
	}

	.textbox.value.copyable.icon-on-hover .copy-icon {
		opacity: 0;
	}

	.textbox.value.copyable:hover:not(.disabled) .copy-icon,
	.textbox.value.copyable:focus:not(.disabled) .copy-icon {
		opacity: 0.85;
	}

	.textbox.value.copyable:hover:not(.disabled) .copy-icon:hover {
		opacity: 1;
	}

	.textbox-text {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.textbox-text.wrap {
		white-space: normal;
		overflow: visible;
		text-overflow: unset;
		word-break: break-word;
	}
</style>
