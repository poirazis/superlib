<script>
	import { createEventDispatcher } from 'svelte';
	import fsm from 'svelte-fsm';
	import { InputMask, Masked, MaskedPattern, MaskedRegExp, createMask } from 'imask';
	import BaseCell from './BaseCell.svelte';
	import { copyTextToClipboard } from './cellClipboard';

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
	let inputMask = $state();
	let editor = $state();
	let errors = $state([]);
	let isComplete = $state(false);
	let justCopied = $state(false);
	let tabindex = $state(0);

	let config = $derived(cellOptions ?? {});
	let initialState = $derived(config.initialState || 'view');
	let readonly = $derived(config.readonly);
	let disabled = $derived(config.disabled);
	let optionError = $derived(config.error);
	let icon = $derived(config.icon);
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

	function syncEditorValue() {
		if (inputMask) {
			inputMask.unmaskedValue = localValue || '';
			return;
		}
		if (editor) {
			editor.value = localValue || '';
		}
	}

	let placeholder = $derived(config.placeholder || mask || '');
	let formattedValue = $derived(applyMask(value));
	let error = $derived(optionError || errors.length > 0 || !!(localValue && mask && !isComplete));
	let isDirty = $derived(originalValue !== localValue);
	let clearable = $derived(
		config.clearIcon !== false &&
			config.role != 'tableCell' &&
			$csm === 'editing' &&
			localValue != null &&
			localValue !== ''
	);

	export const csm = fsm('view', {
		'*': {
			goTo(state) {
				return state;
			},
			reset(newValue) {
				if (newValue == localValue) return;
				localValue = value;
				updateIsComplete();
				syncEditorValue();
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
				copyTextToClipboard(formattedValue || String(value ?? ''), (copied) => (justCopied = copied));
			},
			keydown(e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.click();
				}
			}
		},
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
					editor?.focus();
				}, 50);
				syncEditorValue();
			},
			_exit() {
				originalValue = undefined;
				dispatch('exitedit');
			},
			focus() {},
			clear() {
				localValue = null;
				updateIsComplete();
				syncEditorValue();
				dispatch('clear', null);
			},
			focusout() {
				dispatch('focusout');
				this.submit();
			},
			submit() {
				if (isDirty) {
					if (mask && localValue && !isComplete) {
						localValue = originalValue;
						updateIsComplete();
						syncEditorValue();
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
				syncEditorValue();
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

				if (e.key === 'Enter') {
					e.preventDefault();
					this.submit();
				}
				if (e.key === 'Escape') {
					e.preventDefault();
					this.cancel();
				}

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
		reset: () => csm.reset(value),
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
		let plainInputHandler;

		function teardown() {
			if (inputMask) {
				inputMask.destroy();
				inputMask = undefined;
			}
			if (plainInputHandler) {
				node.removeEventListener('input', plainInputHandler);
				plainInputHandler = undefined;
			}
		}

		function setup(activeMask) {
			teardown();

			if (activeMask == null) {
				return;
			}

			if (!activeMask) {
				plainInputHandler = () => {
					localValue = node.value;
				};
				node.addEventListener('input', plainInputHandler);
				node.value = localValue || '';
				return;
			}

			try {
				const maskInstance = createMaskInstance(activeMask);
				if (!maskInstance) {
					throw new Error('Failed to create mask instance');
				}

				inputMask = new InputMask(node, { mask: activeMask });
				inputMask.unmaskedValue = localValue || '';

				inputMask.on('accept', () => {
					localValue = inputMask.unmaskedValue;
					updateIsComplete();
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
				plainInputHandler = () => {
					localValue = node.value;
				};
				node.addEventListener('input', plainInputHandler);
				node.value = localValue || '';
			}
		}

		setup(maskPattern);

		return {
			update(activeMask) {
				setup(activeMask);
			},
			destroy() {
				teardown();
			}
		};
	}

	$effect(() => {
		csm.reset(value);
	});

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
		};
	});

	$effect(() => {
		if (disabled) {
			csm.goTo('disabled');
		} else if (readonly && copyable && value) {
			csm.goTo('copyable');
		} else if (readonly) {
			csm.goTo('readonly');
		} else {
			csm.goTo('view');
		}

		tabindex = readonly || disabled ? -1 : 0;
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
	{justCopied}
	{copyIcon}
	{color}
	{background}
>
	{#key mask}
		<input
			bind:this={editor}
			class="editor"
			{tabindex}
			class:placeholder={!localValue}
			disabled={$csm != 'editing'}
			value={$csm === 'editing' ? (localValue ?? '') : (formattedValue ?? '')}
			{placeholder}
			style:text-align={config.align}
			on:focusout={csm.focusout}
			on:keydown={csm.keydown}
			use:initIMask={$csm === 'editing' ? mask : null}
		/>
	{/key}
</BaseCell>
