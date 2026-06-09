<script>
	import { createEventDispatcher } from 'svelte';
	import fsm from 'svelte-fsm';
	import BaseCell from './BaseCell.svelte';

	const dispatch = createEventDispatcher();

	let {
		id,
		value,
		cellOptions = {
			role: 'form',
			initialState: 'editing',
			debounce: false,
			min: 0,
			max: 100,
			step: 1
		},
		autofocus = false
	} = $props();

	let timer = $state();
	let localValue = $derived(value);
	let errors = $state([]);
	let trackElement = $state();
	let dragging = $state(false);

	let config = $derived(cellOptions ?? {});
	let initialState = $derived(config.initialState || 'editing');
	let min = $derived(config.min ?? 0);
	let max = $derived(config.max ?? 100);
	let step = $derived(config.step ?? 1);
	let lowerBound = $derived(Math.min(min, max));
	let upperBound = $derived(Math.max(min, max));
	let range = $derived(upperBound - lowerBound || 1);

	let readonly = $derived(config.readonly);
	let optionError = $derived(config.error);
	let optionIcon = $derived(config.icon);
	let color = $derived(config.color);
	let background = $derived(config.background);
	let showDirty = $derived(config.showDirty);
	let debounceDelay = $derived(config.debounce);
	let copyable = $derived(config.copyable);
	let copyIcon = $derived(config.copyIcon ?? 'always');
	let disabled = $derived(config.disabled);
	let valueSuffix = $derived(config.valueSuffix ?? '');
	let tickCount = $derived(Math.max(2, config.tickCount ?? 7));

	let error = $derived(optionError || errors.length > 0);
	let icon = $derived(error ? 'ph ph-warning' : optionIcon);
	let isDirty = $derived(value !== localValue);
	let interactive = $derived(!$cellState || $cellState === 'editing');

	let justCopied = $state(false);

	let fillPercent = $derived.by(() => {
		const current = clampValue(localValue ?? lowerBound);
		return ((current - lowerBound) / range) * 100;
	});

	let displayText = $derived.by(() => {
		const current = localValue ?? lowerBound;
		if (current == null) return '';
		return Number.isInteger(current) ? String(current) : String(Number(current.toFixed(2)));
	});

	let formattedValue = $derived.by(() => {
		if (!displayText) return '';
		return valueSuffix ? `${displayText}${valueSuffix}` : displayText;
	});

	let tickPositions = $derived.by(() => {
		const count = tickCount;
		return Array.from({ length: count }, (_, index) => (index / (count - 1)) * 100);
	});

	const clampValue = (raw) => {
		if (raw == null || Number.isNaN(raw)) {
			return lowerBound;
		}
		return Math.min(upperBound, Math.max(lowerBound, raw));
	};

	const snapValue = (raw) => {
		const clamped = clampValue(raw);
		if (!step) return clamped;
		const stepped = lowerBound + Math.round((clamped - lowerBound) / step) * step;
		return clampValue(Number(stepped.toFixed(10)));
	};

	const parseValue = (raw) => {
		if (raw == null || raw === '') return lowerBound;
		return snapValue(parseFloat(raw));
	};

	const emitChange = (nextValue) => {
		if (debounceDelay) {
			clearTimeout(timer);
			timer = setTimeout(() => {
				dispatch('change', nextValue);
			}, debounceDelay);
			return;
		}

		dispatch('change', nextValue);
	};

	const setLocalValue = (nextValue, emit = true) => {
		const snapped = snapValue(nextValue);
		localValue = snapped;
		if (emit) {
			emitChange(snapped);
		}
	};

	const valueFromClientX = (clientX) => {
		if (!trackElement) return localValue ?? lowerBound;
		const rect = trackElement.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		return snapValue(lowerBound + ratio * range);
	};

	const handleTrackPointerDown = (event) => {
		if (!interactive || disabled || readonly) return;
		dragging = true;
		event.currentTarget.setPointerCapture(event.pointerId);
		setLocalValue(valueFromClientX(event.clientX));
	};

	const handleTrackPointerMove = (event) => {
		if (!dragging) return;
		setLocalValue(valueFromClientX(event.clientX));
	};

	const handleTrackPointerUp = (event) => {
		if (!dragging) return;
		dragging = false;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	};

	const handleKeydown = (event) => {
		if (!interactive || disabled || readonly) return;

		let delta = 0;
		if (event.key === 'ArrowRight' || event.key === 'ArrowUp') delta = step;
		if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') delta = -step;
		if (event.key === 'Home') {
			event.preventDefault();
			setLocalValue(lowerBound);
			return;
		}
		if (event.key === 'End') {
			event.preventDefault();
			setLocalValue(upperBound);
			return;
		}

		if (!delta) return;
		event.preventDefault();
		setLocalValue((localValue ?? lowerBound) + delta);
	};

	export const cellState = fsm('editing', {
		'*': {
			goTo(state) {
				return state;
			},
			reset(newValue) {
				if (newValue == localValue) return;
				localValue = value;
				errors = [];
				return initialState;
			}
		},
		view: {
			_enter() {
				localValue = value;
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
			click() {
				navigator.clipboard
					.writeText(displayText)
					.then(() => {
						justCopied = true;
						setTimeout(() => {
							justCopied = false;
						}, 400);
					})
					.catch((err) => {
						console.error('Failed to copy to clipboard:', err);
					});
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
				dispatch('enteredit');
				localValue = parseValue(value);
			},
			_exit() {
				dispatch('exitedit');
			},
			focus() {},
			focusout() {
				dispatch('focusout');
				if (isDirty) {
					dispatch('change', localValue);
				}
				return readonly ? 'readonly' : 'view';
			},
			cancel() {
				localValue = value;
				dispatch('cancel');
				return readonly ? 'readonly' : 'view';
			}
		}
	});

	export const cellApi = {
		focus: () => trackElement?.focus(),
		reset: () => cellState.reset(),
		isDirty: () => isDirty,
		getValue: () => localValue,
		setError: (err) => {
			errors = [...errors, err];
		},
		clearError: () => {
			errors = [];
		},
		setValue: (val) => {
			localValue = parseValue(val);
		}
	};

	$effect(() => {
		if (autofocus) {
			setTimeout(() => {
				trackElement?.focus();
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
			cellState.goTo('disabled');
		} else if (readonly && copyable && value != null) {
			cellState.goTo('copyable');
		} else if (readonly) {
			cellState.goTo('readonly');
		} else {
			cellState.goTo('view');
		}
	});
</script>

<!-- svelte-ignore event_directive_deprecated -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<BaseCell
	{id}
	role={config.role === 'inline' ? 'inline' : 'form'}
	state={cellState}
	grabber
	{icon}
	isDirty={isDirty && showDirty}
	clearable={false}
	{error}
	{justCopied}
	{copyIcon}
	{color}
	{background}
>
	{#if icon}
		<i class={icon + ' field-icon'} class:with-error={error}></i>
	{/if}

	<div class="slider-editor">
		<div
			class="slider-grabber-shell"
			class:dragging
			class:disabled={disabled || readonly || !interactive}
		>
			<div
				bind:this={trackElement}
				class="slider-grabber-track"
				role="slider"
				aria-valuemin={lowerBound}
				aria-valuemax={upperBound}
				aria-valuenow={clampValue(localValue ?? lowerBound)}
				aria-disabled={disabled || readonly}
				tabindex={interactive && !disabled && !readonly ? 0 : -1}
				on:pointerdown={handleTrackPointerDown}
				on:pointermove={handleTrackPointerMove}
				on:pointerup={handleTrackPointerUp}
				on:pointercancel={handleTrackPointerUp}
				on:keydown={handleKeydown}
				on:blur={cellState.focusout}
			>
				<div class="slider-fill-bg" style:width="{fillPercent}%"></div>
				<div class="slider-ticks" aria-hidden="true">
					{#each tickPositions as tick, index (index)}
						<span class="slider-tick" style:left="{tick}%"></span>
					{/each}
				</div>
				<div class="slider-grabber" style:left="{fillPercent}%"></div>
			</div>

			<span class="slider-grabber-value">{formattedValue}</span>
		</div>
	</div>
</BaseCell>

<style>
	.slider-editor {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1 1 auto;
		min-width: 0;
	}

	.slider-grabber-shell {
		display: flex;
		align-items: stretch;
		flex: 1 1 auto;
		min-width: 0;
		height: 100%;
		background: #1a1a1a;
		overflow: hidden;
	}

	.slider-grabber-shell.disabled {
		opacity: 0.65;
		cursor: not-allowed;
	}

	.slider-fill-bg {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		background: var(--spectrum-global-color-gray-75);
		transition: width 120ms cubic-bezier(0.22, 1, 0.36, 1);
		pointer-events: none;
		z-index: 0;
	}

	.slider-grabber-shell.dragging .slider-fill-bg {
		transition: none;
	}

	.slider-grabber-track {
		position: relative;
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		align-items: center;
		touch-action: none;
		cursor: pointer;
	}

	.slider-grabber-track:focus {
		outline: none;
	}

	.slider-grabber-shell.disabled .slider-grabber-track {
		cursor: not-allowed;
	}

	.slider-ticks {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 1;
	}

	.slider-tick {
		position: absolute;
		top: 50%;
		width: 1px;
		height: 0.55rem;
		background: var(--spectrum-global-color-gray-300);
		transform: translate(-50%, -50%);
		opacity: 0.9;
	}

	.slider-grabber {
		position: absolute;
		top: 0.2rem;
		bottom: 0.2rem;
		width: 2px;
		border-radius: 1px;
		background: var(--spectrum-global-color-gray-500);
		box-shadow: 0 0 0 1px rgb(0 0 0 / 0.35);
		transform: translateX(-50%);
		transition:
			left 120ms cubic-bezier(0.22, 1, 0.36, 1),
			box-shadow 120ms ease;
		z-index: 2;
	}

	.slider-grabber-shell.dragging .slider-grabber {
		transition: none;
	}

	.slider-grabber-shell:not(.disabled) .slider-grabber-track:hover .slider-grabber,
	.slider-grabber-shell.dragging .slider-grabber,
	.slider-grabber-shell:not(.disabled) .slider-grabber-track:focus-visible .slider-grabber {
		box-shadow:
			0 0 0 1px var(--spectrum-global-color-static-blue-500),
			0 0 0 3px rgb(from var(--spectrum-global-color-static-blue-400) r g b / 0.25);
	}

	.slider-grabber-value {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		padding: 0 0.65rem;
		font-size: 12px;
		font-weight: 500;
		color: #f0f0f0;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		user-select: none;
	}

</style>
