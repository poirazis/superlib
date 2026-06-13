<script>
	import { createEventDispatcher } from 'svelte';
	import fsm from 'svelte-fsm';
	import { InputMask, Masked, MaskedPattern, MaskedRegExp, createMask } from 'imask';
	import BaseCell from './BaseCell.svelte';
	import { copyAndTransition, deferJustCopied } from './cellClipboard';

	if (MaskedPattern && Masked.overloads) {
		if (!Masked.overloads.find((o) => o.mask === MaskedPattern)) {
			Masked.overloads.unshift({ mask: MaskedPattern });
		}
	}

	const dispatch = createEventDispatcher();

	let {
		id,
		value,
		mask = '',
		cellOptions = {
			role: 'form',
			initialState: 'view',
			debounce: false,
			placeholder: ''
		},
		autofocus = false
	} = $props();

	let timer = $state();
	let localValue = $state(null);
	let originalValue = $state();
	let lastEdit = $state();
	let isComplete = $state(false);
	let inputMask = $state();
	let inputElement = $state();
	let errors = $state([]);

	let config = $derived(cellOptions ?? {});
	let initialState = $derived(config.initialState || 'view');
	let readonly = $derived(config.readonly);
	let disabled = $derived(config.disabled);
	let optionError = $derived(config.error);
	let optionIcon = $derived(config.icon);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let showDirty = $derived(config.showDirty);
	let debounceDelay = $derived(config.debounce);
	let copyable = $derived(config.copyable);
	let copyIcon = $derived(config.copyIcon ?? 'always');

	function createMaskInstance(maskPattern) {
		if (!maskPattern) return null;
		try {
			return new MaskedPattern({
				mask: maskPattern,
				lazy: false,
				placeholderChar: '_'
			});
		} catch (patternError) {
			try {
				return new MaskedRegExp({
					mask: new RegExp(maskPattern),
					lazy: false
				});
			} catch (regexError) {
				try {
					return createMask({
						mask: maskPattern,
						lazy: false
					});
				} catch (createError) {
					console.error('Failed to create mask:', maskPattern, {
						patternError: patternError?.message,
						regexError: regexError?.message,
						createError: createError?.message
					});
					return null;
				}
			}
		}
	}

	function applyMask(rawValue) {
		if (!mask || !rawValue) return rawValue;
		const tempMask = createMaskInstance(mask);
		if (!tempMask) return rawValue;
		tempMask.unmaskedValue = rawValue;
		return tempMask.value;
	}

	function updateIsComplete() {
		if (!mask || !localValue) {
			isComplete = false;
			return;
		}

		const tempMask = createMaskInstance(mask);
		if (!tempMask) {
			isComplete = false;
			return;
		}
		tempMask.resolve(localValue);
		isComplete = tempMask.isComplete;
	}

	let placeholder = $derived(mask || config.placeholder || field || '');
	let error = $derived(optionError || errors.length > 0 || !!(localValue && mask && !isComplete));
	let icon = $derived(error ? 'ph ph-warning' : optionIcon);
	let isDirty = $derived(originalValue !== localValue);
	let inEdit = $derived($csm === 'editing');
	let displayValue = $derived(inEdit ? localValue : applyMask(value));
	let clearable = $derived(
		config.clearIcon !== false &&
			config.role !== 'inline' &&
			inEdit &&
			localValue != null &&
			localValue !== ''
	);

	export const csm = fsm('view', {
		'*': {
			goTo(state) {
				return state;
			},
			reset() {
				localValue = value;
				updateIsComplete();
				if (inputMask) {
					inputMask.unmaskedValue = localValue || '';
				}
				if (!mask && inputElement) {
					inputElement.value = localValue || '';
				}
				errors = [];
				return initialState;
			}
		},
		view: {
			_enter() {
				localValue = value;
				updateIsComplete();
			},
			focus() {
				if (!readonly && !disabled) {
					return 'editing';
				}
			}
		},
		readonly: {
			_enter() {
				localValue = value;
			}
		},
		copyable: {
			_enter() {
				localValue = value;
			},
			click() {
				copyAndTransition(() => csm, displayValue || String(value ?? ''));
			},
			keydown(e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.click();
				}
			}
		},
		justCopied: deferJustCopied(() => csm),
		disabled: {
			_enter() {
				localValue = value;
			}
		},
		editing: {
			_enter() {
				originalValue = value;
				localValue = value;
				updateIsComplete();
				dispatch('enteredit');
				setTimeout(() => {
					inputElement?.focus();
				}, 50);
				if (inputMask) {
					inputMask.unmaskedValue = localValue || '';
				}
				if (!mask && inputElement) {
					inputElement.value = localValue || '';
				}
			},
			_exit() {
				originalValue = undefined;
				dispatch('exitedit');
				dispatch('focusout');
			},
			clear() {
				localValue = null;
				updateIsComplete();
				if (inputElement) {
					inputElement.value = '';
				}
				if (inputMask) {
					inputMask.unmaskedValue = '';
				}
			},
			focusout() {
				this.submit();
			},
			submit() {
				if (isDirty) {
					if (mask && localValue && !isComplete) {
						localValue = originalValue;
						updateIsComplete();
						return initialState;
					}
					dispatch('change', localValue);
				}
				return initialState;
			},
			cancel() {
				localValue = originalValue;
				updateIsComplete();
				dispatch('cancel');
				if (inputMask) {
					inputMask.unmaskedValue = localValue || '';
				}
				if (!mask && inputElement) {
					inputElement.value = localValue || '';
				}
				return initialState;
			},
			keydown(e) {
				if (!e) return;

				const allowedKeysWhenComplete = [
					'Backspace',
					'Delete',
					'Enter',
					'Escape',
					'ArrowLeft',
					'ArrowRight',
					'ArrowUp',
					'ArrowDown',
					'Home',
					'End'
				];
				if (isComplete && !allowedKeysWhenComplete.includes(e.key) && e.key.length === 1) {
					e.preventDefault();
					return;
				}

				if (e.key === 'Enter') this.submit();
				if (e.key === 'Escape') this.cancel();

				if (e.key.length === 1 && mask) {
					const tempMask = createMaskInstance(mask);
					if (tempMask) {
						const placeholderChar =
							tempMask.blocks?.[0]?.placeholder || (tempMask.mask?.includes('0') ? '0' : null);
						if (placeholderChar === '0' && !/\d/.test(e.key)) {
							e.preventDefault();
						}
					}
				}
			}
		}
	});

	export const cellApi = {
		focus: () => csm.focus(),
		reset: () => csm.reset(),
		isDirty: () => isDirty,
		getValue: () => localValue,
		setError: (err) => {
			errors = [...errors, err];
		},
		clearError: () => {
			errors = [];
		},
		setValue: (val) => {
			value = val;
		}
	};

	function initIMask(node, maskPattern) {
		if (!maskPattern) {
			const handleInput = () => {
				localValue = node.value;
				lastEdit = new Date();
			};

			node.addEventListener('input', handleInput);
			node.value = localValue || '';

			return {
				destroy() {
					node.removeEventListener('input', handleInput);
				}
			};
		}

		try {
			const maskInstance = createMaskInstance(maskPattern);
			if (!maskInstance) {
				throw new Error('Failed to create mask instance');
			}

			inputMask = new InputMask(node, { mask: maskPattern });
			inputMask.unmaskedValue = localValue || '';

			inputMask.on('accept', () => {
				localValue = inputMask.unmaskedValue;
				updateIsComplete();
				lastEdit = new Date();
				if (debounceDelay) {
					clearTimeout(timer);
					timer = setTimeout(() => {
						dispatch('change', localValue);
					}, debounceDelay);
				}
			});

			inputMask.on('complete', () => {
				isComplete = true;
			});
		} catch (e) {
			console.error('Error initializing IMask:', e);
			const handleInput = () => {
				localValue = node.value;
				lastEdit = new Date();
			};
			node.addEventListener('input', handleInput);
			node.value = localValue || '';
			return {
				destroy() {
					node.removeEventListener('input', handleInput);
				}
			};
		}

		return {
			destroy() {
				if (inputMask) inputMask.destroy();
			}
		};
	}

	$effect(() => {
		if (autofocus) {
			setTimeout(() => {
				csm.focus();
			}, 50);
		}

		return () => {
			if (timer) {
				clearTimeout(timer);
			}
			if (inputMask) {
				inputMask.destroy();
			}
		};
	});

	$effect(() => {
		if (disabled) {
			csm.goTo('disabled');
		} else if (readonly && copyable && value) {
			csm.goTo('copyable');
		} else if (readonly) {
			csm.goTo('readonly');
		} else if (!inEdit) {
			csm.goTo('view');
		}
	});
</script>

<!-- svelte-ignore event_directive_deprecated -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<BaseCell
	{id}
	role={config.role}
	{csm}
	{icon}
	isDirty={isDirty && showDirty}
	{clearable}
	{error}
	{copyIcon}
	{color}
	{background}
>
	{#key mask}
		<input
			bind:this={inputElement}
			class="editor"
			{placeholder}
			disabled={$csm != 'editing'}
			value={displayValue}
			style:color={!isComplete ? 'var(--spectrum-global-color-gray-700)' : color}
			style:text-align={config.align}
			on:focusout={csm.focusout}
			on:keydown={csm.keydown}
			use:initIMask={mask}
		/>
	{/key}
</BaseCell>
