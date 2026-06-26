<script>
	import { tweened, spring } from 'svelte/motion';
	import { backInOut } from 'svelte/easing';
	import { arc as d3arc } from 'd3-shape';
	import { scaleLinear } from 'd3-scale';
	import { onMount } from 'svelte';

	let {
		arcSize = 120,
		valueSuffix = '',
		trackSize = 'medium',
		valueSize = 'M',
		min = 0,
		max = 1000,
		value = 350,
		precision = 0,
		showValue = true,
		trackColor = undefined,
		trackFillColor = undefined,
		trackGradientColor = undefined,
		tickLabelColor = undefined,
		valueColor = undefined,
		animationType = 'spring',
		trackBackdropColor = undefined,
		showTicks = false,
		showTickLabels = false,
		majorTicks = 10
	} = $props();

	let _id = Math.random();
	let valueArc;

	const gaugeTypeMap = {
		90: {
			startAngle: -90,
			endAngle: 0,
			innerRadius: 246,
			outerRadius: 256,
			innerArcRadius: 88,
			cornerRadius: 10,
			canvas: { width: 256, height: 256 },
			pivot: { x: 256, y: 256 },
			valuePos: { x: 155, y: 155 }
		},
		120: {
			startAngle: -60,
			endAngle: 60,
			innerRadius: 118,
			outerRadius: 128,
			innerArcRadius: 40,
			cornerRadius: 10,
			canvas: { width: 256, height: 256 },
			pivot: { x: 128, y: 128 },
			valuePos: { x: 128, y: 110 }
		},
		180: {
			startAngle: -90,
			endAngle: 90,
			innerRadius: 118,
			outerRadius: 128,
			innerArcRadius: 40,
			cornerRadius: 10,
			canvas: { width: 256, height: 256 },
			pivot: { x: 128, y: 128 },
			valuePos: { x: 128, y: 118 }
		},
		240: {
			startAngle: -120,
			endAngle: 120,
			innerRadius: 118,
			outerRadius: 128,
			innerArcRadius: 40,
			cornerRadius: 10,
			canvas: { width: 256, height: 256 },
			pivot: { x: 128, y: 128 },
			valuePos: { x: 128, y: 128 }
		},
		270: {
			startAngle: -180,
			endAngle: 90,
			innerRadius: 118,
			outerRadius: 128,
			innerArcRadius: 40,
			cornerRadius: 10,
			canvas: { width: 256, height: 256 },
			pivot: { x: 128, y: 128 },
			valuePos: { x: 128, y: 128 }
		},
		360: {
			startAngle: 0,
			endAngle: 360,
			innerRadius: 118,
			outerRadius: 128,
			innerArcRadius: 40,
			cornerRadius: 10,
			canvas: { width: 256, height: 256 },
			pivot: { x: 128, y: 128 },
			valuePos: { x: 128, y: 128 }
		}
	};

	const trackSizeMap = {
		tiny: 4,
		small: 12,
		medium: 18,
		large: 24,
		huge: 48
	};

	const springValue = spring(0, { stiffness: 0.1 });
	const tweenedValue = tweened(0, { easing: backInOut, duration: 750 });

	$effect(() => {
		springValue.set(value);
		tweenedValue.set(value);
	});

	let gaugeConfig = $derived(gaugeTypeMap[arcSize] ?? gaugeTypeMap[120]);
	let _width = $derived(trackSizeMap[trackSize] ?? 18);
	let startAngle = $derived(gaugeConfig.startAngle);
	let endAngle = $derived(gaugeConfig.endAngle);
	let innerRadius = $derived(gaugeConfig.outerRadius - _width);
	let outerRadius = $derived(gaugeConfig.outerRadius);
	let cornerRadius = $derived(gaugeConfig.cornerRadius);
	let pivot = $derived(gaugeConfig.pivot);
	let canvas = $derived(gaugeConfig.canvas);
	let valuePos = $derived(gaugeConfig.valuePos);
	let animatedValue = $derived(animationType === 'tweened' ? $tweenedValue : $springValue);
	let scale = $derived(scaleLinear().domain([min, max]).range([startAngle, endAngle]));
	let valueAngle = $derived(scale(animatedValue));
	let effectiveTrackFill = $derived(trackFillColor ? trackFillColor : 'var(--primaryColor)');
	let _textBaseline = $derived(arcSize == 180 || arcSize == 120 ? 'bottom' : 'middle');
	let arc = $derived(
		d3arc()
			.innerRadius(innerRadius)
			.outerRadius(outerRadius)
			.startAngle((startAngle * Math.PI) / 180)
			.endAngle((valueAngle * Math.PI) / 180)
			.cornerRadius(cornerRadius)
	);
	let trackArc = $derived(
		d3arc()
			.innerRadius(innerRadius)
			.outerRadius(outerRadius)
			.startAngle((startAngle * Math.PI) / 180)
			.endAngle((endAngle * Math.PI) / 180)
			.cornerRadius(cornerRadius)
	);

	let _majorTicks = $state([]);

	$effect(() => {
		const ticks = [];
		const step = (max - min) / majorTicks;
		let pos = Number(min) || 0;
		while (pos <= max) {
			ticks.push({
				angle: scale(Number(pos)),
				label: pos.toFixed(precision)
			});
			pos += step;
		}
		if (arcSize == 360 && ticks.length) ticks.shift();
		_majorTicks = ticks;
	});

	function setSelfGradient() {
		if (!valueArc) return;
		valueArc.style.fill = `url("#${_id}")`;
	}

	onMount(() => setSelfGradient());
</script>

<div
	class="svg-box"
	style:--trackColor={trackColor}
	style:--trackBackdropColor={trackBackdropColor || 'var(--spectrum-global-color-gray-50)'}
	style:--tickLabelColor={tickLabelColor || 'var(--spectrum-global-color-gray-400)'}
	style:--valueColor={valueColor || 'var(--spectrum-global-color-gray-800)'}
>
	<svg
		class="svg-box-content"
		viewBox="-2 -2 {canvas.width + 4} {canvas.height + 4}"
		version="1.1"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path d={trackArc()} class="track" transform="translate({pivot.x}, {pivot.y})" />
		<path
			d={arc()}
			class="valueArc"
			transform="translate({pivot.x}, {pivot.y})"
			bind:this={valueArc}
		/>

		{#if showTicks && _majorTicks.length > 0}
			{#each _majorTicks as tick}
				<line
					class="tick"
					x1={pivot.x}
					y1={outerRadius - innerRadius}
					x2={pivot.x}
					y2={outerRadius - innerRadius + 12}
					transform="rotate({Number(tick.angle)} {pivot.x} {pivot.y})"
				/>
				{#if showTickLabels}
					<text
						class="tick-label"
						x={pivot.x}
						y={outerRadius - innerRadius + 22}
						transform="rotate({tick.angle} {pivot.x} {pivot.y})"
					>
						{tick.label}
					</text>
				{/if}
			{/each}
		{/if}

		{#if showValue}
			<text
				class="value"
				class:smaller={valueSize == 'M'}
				class:very-small={valueSize == 'S'}
				dominant-baseline={_textBaseline}
				transform="translate({valuePos.x} {valuePos.y})"
			>
				{animatedValue.toFixed(precision) + valueSuffix}
			</text>
		{/if}

		<defs>
			<linearGradient id={_id} x1="0%" y1="0%" x2="100%" y2="0%">
				<stop offset="0%" stop-color={effectiveTrackFill} />
				<stop offset="100%" stop-color={trackGradientColor || effectiveTrackFill} />
			</linearGradient>
		</defs>
	</svg>
</div>

<style>
	.svg-box {
		height: 100%;
		position: relative;
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.svg-box-content {
		width: 100%;
		height: 100%;
		position: relative;
		top: 0;
		left: 0;
	}

	.track {
		stroke: var(--trackColor);
		stroke-width: 1px;
		fill: var(--trackBackdropColor);
	}
	.tick {
		stroke: var(--trackColor);
		stroke-width: 1px;
		fill: none;
	}
	.tick-label {
		fill: var(--tickLabelColor);
		font-weight: 400;
		font-size: 0.65rem;
		text-anchor: middle;
	}

	.value {
		text-anchor: middle;
		fill: var(--valueColor);
		font-size: 1.75rem;
		letter-spacing: 1.2px;
		font-family: monospace;

		&.smaller {
			font-size: 1.25rem;
		}

		&.very-small {
			font-size: 0.85rem;
		}
	}
</style>
