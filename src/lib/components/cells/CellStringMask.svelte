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

	const MASK_OPTIONS = {
		lazy: false,
		placeholderChar: '0'
	};

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
	let localValue = $state('');
	let originalValue = $state();
	let inputMask = $state();
	let editor = $state(null);
	let anchor = $state(null);
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
	let valueMode = $derived(config.valueMode ?? 'unmasked');

	function resolveHasMask(maskPattern) {
		if (!maskPattern) return false;
		if (Array.isArray(maskPattern)) return maskPattern.length > 0;
		if (typeof maskPattern === 'string') return maskPattern.length > 0;
		return true;
	}

	function resolveMaskPreview(maskPattern) {
		if (!maskPattern) return '';
		if (Array.isArray(maskPattern)) {
			const first = maskPattern[0];
			return typeof first === 'string' ? first : (first?.mask ?? '');
		}
		if (typeof maskPattern === 'string') return maskPattern;
		return maskPattern.mask ?? '';
	}

	function normalizeMaskEntry(entry) {
		if (typeof entry === 'string') return { mask: entry, ...MASK_OPTIONS };
		const { expose, ...rest } = entry;
		return expose === undefined
			? { ...MASK_OPTIONS, ...rest }
			: { ...MASK_OPTIONS, ...rest, expose };
	}

	function buildInputMaskOptions(maskPattern) {
		if (!maskPattern) return null;

		if (Array.isArray(maskPattern)) {
			return { mask: maskPattern.map(normalizeMaskEntry) };
		}

		if (typeof maskPattern === 'string') {
			return { mask: maskPattern, ...MASK_OPTIONS };
		}

		return { ...MASK_OPTIONS, ...maskPattern };
	}

	function createMaskInstance(maskPattern) {
		if (!maskPattern) return null;

		const options = buildInputMaskOptions(maskPattern);
		if (!options) return null;

		try {
			return createMask(options);
		} catch (createError) {
			if (typeof maskPattern !== 'string') {
				console.error('Failed to create mask:', maskPattern, createError?.message);
				return null;
			}

			try {
				return new MaskedPattern({
					mask: maskPattern,
					...MASK_OPTIONS
				});
			} catch (patternError) {
				try {
					return new MaskedRegExp({
						mask: new RegExp(maskPattern),
						lazy: false
					});
				} catch (regexError) {
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

	function readMaskValue(maskRef = inputMask) {
		if (!maskRef) return '';
		return valueMode === 'formatted' ? maskRef.value : maskRef.unmaskedValue;
	}

	function isDynamicMask(maskPattern = mask) {
		return Array.isArray(maskPattern);
	}

	function appendEmptyMaskPlaceholder(maskRef = inputMask) {
		if (!maskRef?.masked) return;
		const masked = maskRef.masked;
		if (masked.exposeMask) {
			masked.currentMask = masked.exposeMask;
		}
		masked._appendPlaceholder();
		maskRef.updateControl();
	}

	function syncMaskValue(nextValue = localValue) {
		if (!inputMask) return;
		const next = nextValue ?? '';

		if (!next && isDynamicMask()) {
			appendEmptyMaskPlaceholder();
			return;
		}

		if (valueMode === 'formatted') {
			inputMask.value = next;
			return;
		}
		inputMask.unmaskedValue = next;
	}

	function applyMask(rawValue) {
		if (!hasMask) return rawValue ?? '';
		if (valueMode === 'formatted') return rawValue ?? '';
		const tempMask = createMaskInstance(mask);
		if (!tempMask) return rawValue ?? '';
		tempMask.unmaskedValue = rawValue || '';
		return tempMask.value;
	}

	function updateIsComplete() {
		if (!hasMask || !localValue) {
			isComplete = false;
			return;
		}

		const tempMask = createMaskInstance(mask);
		if (!tempMask) {
			isComplete = false;
			return;
		}
		if (valueMode === 'formatted') {
			tempMask.value = localValue;
		} else {
			tempMask.unmaskedValue = localValue;
		}
		isComplete = tempMask.isComplete;
	}

	let hasMask = $derived(resolveHasMask(mask));
	let imaskActive = $derived($csm === 'editing' && hasMask);
	let placeholder = $derived(hasMask ? '' : config.placeholder || resolveMaskPreview(mask) || '');
	let formattedValue = $derived(applyMask(value));
	let viewDisplayValue = $derived(
		value != null && value !== ''
			? formattedValue
			: resolveMaskPreview(mask) || formattedValue || ''
	);
	let inputValue = $derived(
		imaskActive ? undefined : $csm === 'editing' ? (localValue ?? '') : (viewDisplayValue ?? '')
	);
	let error = $derived(
		optionError || errors.length > 0 || !!(localValue && hasMask && !isComplete)
	);
	let isDirty = $derived((originalValue ?? '') !== (localValue ?? ''));
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
				localValue = value ?? '';
				updateIsComplete();
				syncMaskValue(value ?? '');
				errors = [];
				return initialState;
			}
		},
		view: {
			_enter() {
				localValue = value ?? '';
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
				localValue = value ?? '';
			}
		},
		copyable: {
			_enter() {
				localValue = value ?? '';
			},
			click() {
				copyTextToClipboard(
					formattedValue || String(value ?? ''),
					(copied) => (justCopied = copied)
				);
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
				localValue = value ?? '';
			}
		},
		editing: {
			_enter() {
				originalValue = value ?? '';
				localValue = value ?? '';
				isComplete = false;
				updateIsComplete();
				dispatch('enteredit');
				queueMicrotask(() => {
					syncMaskValue(localValue);
					editor?.focus();
				});
			},
			_exit() {
				originalValue = undefined;
				dispatch('exitedit');
			},
			focus() {},
			clear() {
				localValue = '';
				isComplete = false;
				updateIsComplete();
				syncMaskValue('');
				dispatch('clear', null);
			},
			focusout(e) {
				if (anchor?.contains(e?.relatedTarget)) return;
				dispatch('focusout');
				this.submit();
			},
			submit() {
				if (isDirty) {
					dispatch('change', localValue ?? '');
				}
				return initialState;
			},
			cancel() {
				localValue = originalValue ?? '';
				updateIsComplete();
				dispatch('cancel');
				syncMaskValue(localValue);
				return initialState;
			},
			keydown(e) {
				if (!e) return;

				if (e.key === 'Enter') {
					e.preventDefault();
					this.submit();
				}
				if (e.key === 'Escape') {
					e.preventDefault();
					this.cancel();
				}
			},
			input(e) {
				if (hasMask) return;
				localValue = e.currentTarget.value;
				if (debounceDelay) {
					clearTimeout(timer);
					timer = setTimeout(() => {
						dispatch('change', localValue);
					}, debounceDelay);
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

			if (!resolveHasMask(activeMask)) {
				plainInputHandler = () => {
					localValue = node.value;
				};
				node.addEventListener('input', plainInputHandler);
				node.value = localValue || '';
				return;
			}

			const options = buildInputMaskOptions(activeMask);
			if (!options) return;

			try {
				if (!(localValue ?? '')) {
					node.value = '';
				}
				inputMask = new InputMask(node, options);
				syncMaskValue(localValue ?? '');

				inputMask.on('accept', () => {
					if ($csm !== 'editing') return;
					localValue = readMaskValue(inputMask);
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
		if ($csm === 'editing') return;

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
	bind:anchor
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
			{...inputValue === undefined ? {} : { value: inputValue }}
			{placeholder}
			style:text-align={config.align}
			on:input={csm.input}
			on:keydown={csm.keydown}
			use:initIMask={imaskActive ? mask : null}
		/>
	{/key}
</BaseCell>
