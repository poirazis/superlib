<script>
	import { createEventDispatcher } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';
	import { copyTextToClipboard } from './cellClipboard';
	import PickerPopover from './PickerPopover.svelte';

	const dispatch = createEventDispatcher();

	let {
		id,
		value,
		size = 'M',
		spectrumTheme = '',
		offset = undefined,
		cellOptions = {}
	} = $props();

	let anchor = $state(null);
	let picker = $state(null);
	let open = $state(false);
	let customValue = $state('');
	let originalValue = $state();

	let config = $derived(cellOptions ?? {});
	let readonly = $derived(config.readonly);
	let disabled = $derived(config.disabled);
	let optionError = $derived(config.error);
	let optionIcon = $derived(config.icon);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let showDirty = $derived(config.showDirty);
	let copyable = $derived(config.copyable);
	let copyIcon = $derived(config.copyIcon ?? 'always');
	let allowCustom = $derived(config.allowCustom !== false);

	let justCopied = $state(false);
	let circle = $derived(config.swatch === 'circle');
	let customColors = $derived(config.customColors || []);
	let showTheme = $derived(config.themeColors !== false);
	let showStatic = $derived(config.staticColors !== false);
	let inEdit = $derived($cellState === 'editing');
	let tableCell = $derived(config.role === 'cell' || config.role === 'tableCell');
	let error = $derived(optionError);
	let icon = $derived(error ? 'ph ph-warning' : optionIcon);
	let isDirty = $derived(inEdit && value !== originalValue);

	let baseRole = $derived(
		config.role === 'inlineInput' || config.role === 'inline'
			? 'inline'
			: config.role === 'tableCell' || config.role === 'cell'
				? 'cell'
				: 'form'
	);

	let categories = $derived(generateCategories(showTheme, showStatic));
	let customCategory = $derived(generateCustomCategory(customColors));
	let checkColor = $derived(getCheckColor(value));

	function generateCategories(showThemeColors, showStaticColors) {
		return [
			...(showThemeColors
				? [
						{
							label: 'Theme colors',
							colors: [
								'red-100',
								'orange-100',
								'yellow-100',
								'green-100',
								'seafoam-100',
								'blue-100',
								'indigo-100',
								'magenta-100',
								'red-400',
								'orange-400',
								'yellow-400',
								'green-400',
								'seafoam-400',
								'blue-400',
								'indigo-400',
								'magenta-400',
								'red-500',
								'orange-500',
								'yellow-500',
								'green-500',
								'seafoam-500',
								'blue-500',
								'indigo-500',
								'magenta-500',
								'red-600',
								'orange-600',
								'yellow-600',
								'green-600',
								'seafoam-600',
								'blue-600',
								'indigo-600',
								'magenta-600',
								'red-700',
								'orange-700',
								'yellow-700',
								'green-700',
								'seafoam-700',
								'blue-700',
								'indigo-700',
								'magenta-700',
								'gray-50',
								'gray-75',
								'gray-100',
								'gray-200',
								'gray-300',
								'gray-400',
								'gray-500',
								'gray-600',
								'gray-700',
								'gray-800',
								'gray-900'
							]
						}
					]
				: []),
			...(showStaticColors
				? [
						{
							label: 'Static colors',
							colors: [
								'static-red-400',
								'static-orange-400',
								'static-yellow-400',
								'static-green-400',
								'static-seafoam-400',
								'static-blue-400',
								'static-indigo-400',
								'static-magenta-400',
								'static-red-800',
								'static-orange-800',
								'static-yellow-800',
								'static-green-800',
								'static-seafoam-800',
								'static-blue-800',
								'static-indigo-800',
								'static-magenta-800',
								'static-red-1200',
								'static-orange-1200',
								'static-yellow-1200',
								'static-green-1200',
								'static-seafoam-1200',
								'static-blue-1200',
								'static-indigo-1200',
								'static-magenta-1200',
								'static-white',
								'static-black'
							]
						}
					]
				: [])
		];
	}

	function generateCustomCategory(colors) {
		return {
			label: 'Palette',
			colors: colors.map((entry) => entry.value),
			customLabels: colors.reduce((acc, entry) => {
				acc[entry.value] = entry.label;
				return acc;
			}, {})
		};
	}

	const getCustomValue = (currentValue) => {
		if (!currentValue) return currentValue;
		const isThemeOrStatic = categories?.some((category) =>
			category.colors.some(
				(colorName) => `var(--spectrum-global-color-${colorName})` === currentValue
			)
		);
		return isThemeOrStatic ? null : currentValue;
	};

	const prettyPrint = (colorName, category) => {
		if (category.customLabels && category.customLabels[colorName]) {
			return category.customLabels[colorName];
		}
		return colorName.split('-').join(' ');
	};

	const getCheckColor = (currentValue) => {
		if (!currentValue) return 'var(--spectrum-global-color-static-gray-900)';
		if (currentValue.includes('-gray-')) {
			return /^.*(gray-(50|75|100|200|300|400|500))\)$/.test(currentValue)
				? 'var(--spectrum-global-color-gray-900)'
				: 'var(--spectrum-global-color-gray-50)';
		}
		if (currentValue.includes('-100')) {
			return 'var(--spectrum-global-color-gray-900)';
		}
		if (currentValue.includes('static-black')) {
			return 'var(--spectrum-global-color-static-gray-50)';
		}
		return 'var(--spectrum-global-color-static-gray-900)';
	};

	const onChange = (newValue) => {
		const selectedValue = newValue === value ? null : newValue;
		dispatch('change', selectedValue);
		open = false;
		if (tableCell) {
			cellState.submit();
		}
	};

	const handleKeydown = (event, colorName, isCustom) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onChange(isCustom ? colorName : `var(--spectrum-global-color-${colorName})`);
		}
	};

	export const cellState = fsm('view', {
		'*': {
			goTo(state) {
				return state;
			}
		},
		view: {
			_enter() {
				open = false;
			},
			focus() {
				if (!readonly && !disabled) return 'editing';
			},
			copy() {
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
			copy() {
				copyTextToClipboard(String(value ?? ''), (copied) => (justCopied = copied));
			}
		},
		disabled: {
			_enter() {
				open = false;
			}
		},
		editing: {
			_enter() {
				originalValue = value;
				customValue = getCustomValue(value) ?? '';
				open = true;
				dispatch('enteredit');
			},
			_exit() {
				open = false;
				dispatch('exitedit');
			},
			copy() {
				open = !open;
			},
			handleKeyboard(e) {
				if (e.keyCode == 32) {
					e.stopPropagation();
					e.preventDefault();
					open = !open;
				}
			},
			focusout(e) {
				if (picker?.contains(e.relatedTarget)) return;
				open = false;
				return readonly ? 'readonly' : tableCell ? 'view' : 'editing';
			},
			submit() {
				open = false;
				return readonly ? 'readonly' : tableCell ? 'view' : 'editing';
			},
			cancel() {
				open = false;
				return readonly ? 'readonly' : tableCell ? 'view' : 'editing';
			}
		}
	});

	$effect(() => {
		if (!inEdit) {
			customValue = getCustomValue(value) ?? '';
		}
	});

	$effect(() => {
		if (disabled) {
			cellState.goTo('disabled');
		} else if (readonly && copyable && value) {
			cellState.goTo('copyable');
		} else if (readonly) {
			cellState.goTo('readonly');
		} else if (tableCell) {
			if (!inEdit) cellState.goTo('view');
		} else {
			cellState.goTo('editing');
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
	{justCopied}
	{copyIcon}
	{color}
	{background}
	popupOpen={open}
	tabindex={disabled || (readonly && !copyable) ? -1 : 0}
	onfocusout={cellState.focusout}
>
	{#if icon}
		<i class={icon + ' field-icon'} class:with-error={error}></i>
	{/if}

	<div class="color-display">
		<div
			class="preview-swatch size--{size || 'M'}"
			class:circle
			class:readonly={readonly || disabled}
		>
			<div
				class="preview-fill {spectrumTheme || ''}"
				class:circle
				style={value ? `background: ${value};` : ''}
				class:placeholder={!value}
			></div>
		</div>
	</div>
</BaseCell>

<PickerPopover
	anchor={anchor}
	visible={inEdit}
	align="left"
	{open}
	{offset}
	maxHeight={500}
	useAnchorWidth={false}
	onClose={cellState.focusout}
>
	<div bind:this={picker} class="container">
		{#each categories as category}
			<div class="category">
				<div class="heading">{category.label}</div>
				<div class="colors">
					{#each category.colors as colorName}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							on:click={() => onChange(`var(--spectrum-global-color-${colorName})`)}
							on:keydown={(event) => handleKeydown(event, colorName, false)}
							class="color-swatch"
							title={prettyPrint(colorName, category)}
							role="button"
							tabindex="0"
						>
							<div
								class="color-fill {spectrumTheme || ''}"
								style="background: var(--spectrum-global-color-{colorName});"
							>
								{#if value === `var(--spectrum-global-color-${colorName})`}
									<i class="ri-check-line" style="color: {checkColor};"></i>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/each}
		{#if customCategory.colors.length > 0}
			<div class="category">
				<div class="heading">
					<i class="ri-palette-line heading-icon"></i>
					{customCategory.label}
				</div>
				<div class="colors">
					{#each customCategory.colors as colorName}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							on:click={() => onChange(colorName)}
							on:keydown={(event) => handleKeydown(event, colorName, true)}
							class="color-swatch"
							title={prettyPrint(colorName, customCategory)}
							role="button"
							tabindex="0"
						>
							<div
								class="color-fill {spectrumTheme || ''}"
								style="background: {colorName};"
							>
								{#if value === colorName}
									<i class="ri-check-line" style="color: {checkColor};"></i>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
		{#if allowCustom}
			<div class="category category--custom">
				<div class="heading">Custom</div>
				<div class="custom">
					<input
						type="text"
						class="custom-input"
						bind:value={customValue}
						on:change={() => {
							if (customValue) onChange(customValue);
						}}
						placeholder="Enter custom color"
					/>
					<!-- svelte-ignore a11y_consider_explicit_label -->
					<button class="clear-value" on:click={() => onChange(null)}>
						<i class="ri-close-line"></i>
					</button>
				</div>
			</div>
		{/if}
	</div>
</PickerPopover>

<style>
	.color-display {
		display: flex;
		align-items: center;
		flex: 1 1 auto;
		min-width: 0;
		height: 100%;
		padding: 0.25rem 0.75rem;
		box-sizing: border-box;
	}

	.container {
		position: relative;
		padding: 0.5rem 0.75rem 0.75rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 16px;
		background-color: var(--spectrum-global-color-gray-50);
	}

	.preview-swatch {
		position: relative;
		box-sizing: border-box;
		border-radius: 4px;
		overflow: hidden;
		border: 1px solid var(--spectrum-global-color-gray-300);
		background: var(--spectrum-global-color-gray-50);
		padding: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.preview-swatch.circle {
		border-radius: 50%;
	}

	.preview-swatch:not(.readonly):hover {
		cursor: pointer;
	}

	.preview-fill {
		width: 100%;
		height: 100%;
		display: grid;
		place-items: center;
		border-radius: inherit;
		padding: 4px;
	}

	.preview-fill.circle {
		border-radius: 50%;
	}

	.preview-fill.placeholder {
		--spectrum-swatch-checkerboard-light: var(--spectrum-global-color-gray-300);

		background-color: var(--spectrum-global-color-gray-50);
		background-image:
			linear-gradient(45deg, var(--spectrum-swatch-checkerboard-light) 25%, transparent 25%),
			linear-gradient(-45deg, var(--spectrum-swatch-checkerboard-light) 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, var(--spectrum-swatch-checkerboard-light) 75%),
			linear-gradient(-45deg, transparent 75%, var(--spectrum-swatch-checkerboard-light) 75%);
		background-size: 20px 20px;
		background-position:
			0 0,
			0 10px,
			10px -10px,
			-10px 0px;
	}

	.size--XS {
		width: 16px;
		height: 16px;
	}

	.size--S {
		width: 24px;
		height: 24px;
	}

	.size--M {
		width: 32px;
		height: 32px;
	}

	.size--L {
		width: 48px;
		height: 48px;
	}

	.colors {
		display: grid;
		grid-template-columns: repeat(8, 1fr);
		gap: 4px;
	}

	.color-swatch {
		height: 16px;
		width: 16px;
		border-radius: 50%;
		position: relative;
	}

	.color-swatch:hover {
		cursor: pointer;
		box-shadow: 0 0 2px 2px var(--spectrum-global-color-gray-300);
	}

	.color-fill {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		display: grid;
		place-items: center;
	}

	.ri-check-line {
		font-size: 12px;
		font-weight: bold;
	}

	.ri-palette-line {
		font-size: 12px;
		margin-right: 4px;
	}

	.heading-icon {
		vertical-align: middle;
	}

	.heading {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.14px;
		text-transform: uppercase;
		grid-column: 1 / 5;
		margin-bottom: 8px;
		display: flex;
		align-items: center;
	}

	.custom {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 4px;
		justify-content: space-between;
	}

	.category--custom .heading {
		margin-bottom: 4px;
	}

	.custom-input {
		flex: 1;
		padding: 2px 4px;
		border: none;
		border-bottom: 1px solid var(--spectrum-global-color-gray-200);
		border-radius: 2px;
		font-size: 12px;
		height: 20px;
		width: 80px;
		background-color: inherit;
		color: var(--spectrum-global-color-gray-700);
		font-style: italic;
	}

	.custom-input:focus {
		outline: none;
		border-color: var(--spectrum-global-color-blue-500);
	}

	.clear-value {
		background: none;
		border: none;
		color: var(--spectrum-global-color-gray-900);
		cursor: pointer;
		font-size: 13px;
		padding: 0;
		margin: 0;
	}
</style>