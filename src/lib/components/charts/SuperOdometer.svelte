<script>
  import { tweened, spring } from "svelte/motion";
  import { backInOut } from "svelte/easing";
  import { arc as d3arc } from "d3-shape";
  import { scaleLinear } from "d3-scale";

  let {
    arcSize = 120,
    valueSize = "M",
    min = 0,
    max = 1000,
    value = 350,
    precision = 0,
    animationType = "spring",
    trackColor = undefined,
    valueColor = undefined,
    needleColor = undefined,
    centerColor = undefined,
    tickLabelColor = undefined,
    backdropColor = "var(--spectrum-global-color-gray-50)",
    prefix = "",
    suffix = "",
    showTicks = false,
    showTickLabels = false,
    majorTicks = 10,
    minorTicks = 0,
  } = $props();

  const gaugeTypeMap = {
    90: {
      startAngle: -90,
      endAngle: 0,
      innerRadius: 254,
      outerRadius: 256,
      innerArcRadius: 128,
      cornerRadius: 10,
      canvas: { width: 256, height: 256 },
      pivot: { x: 256, y: 256 },
      valuePos: { x: 200, y: 240 },
    },
    120: {
      startAngle: -60,
      endAngle: 60,
      innerRadius: 126,
      outerRadius: 128,
      innerArcRadius: 48,
      cornerRadius: 10,
      canvas: { width: 256, height: 256 },
      pivot: { x: 128, y: 128 },
      valuePos: { x: 128, y: 108 },
    },
    180: {
      startAngle: -90,
      endAngle: 90,
      innerRadius: 126,
      outerRadius: 128,
      innerArcRadius: 48,
      cornerRadius: 10,
      canvas: { width: 256, height: 256 },
      pivot: { x: 128, y: 128 },
      valuePos: { x: 128, y: 120 },
    },
    240: {
      startAngle: -120,
      endAngle: 120,
      innerRadius: 126,
      outerRadius: 128,
      innerArcRadius: 48,
      cornerRadius: 10,
      canvas: { width: 256, height: 256 },
      pivot: { x: 128, y: 128 },
      valuePos: { x: 128, y: 120 },
    },
    270: {
      startAngle: -180,
      endAngle: 90,
      innerRadius: 126,
      outerRadius: 128,
      innerArcRadius: 48,
      cornerRadius: 10,
      canvas: { width: 256, height: 256 },
      pivot: { x: 128, y: 128 },
      valuePos: { x: 128, y: 120 },
    },
    360: {
      startAngle: 0,
      endAngle: 360,
      innerRadius: 126,
      outerRadius: 128,
      innerArcRadius: 48,
      cornerRadius: 0,
      canvas: { width: 256, height: 256 },
      pivot: { x: 128, y: 128 },
      valuePos: { x: 128, y: 128 },
    },
  };

  const springValue = spring(0, { stiffness: 0.1 });
  const tweenedValue = tweened(0, { easing: backInOut, duration: 750 });

  $effect(() => {
    springValue.set(value);
    tweenedValue.set(value);
  });

  let gaugeConfig = $derived(gaugeTypeMap[Number(arcSize)] ?? gaugeTypeMap[120]);
  let startAngle = $derived(gaugeConfig.startAngle);
  let endAngle = $derived(gaugeConfig.endAngle);
  let outerRadius = $derived(gaugeConfig.outerRadius);
  let innerRadius = $derived(gaugeConfig.innerRadius);
  let pivot = $derived(gaugeConfig.pivot);
  let canvas = $derived(gaugeConfig.canvas);
  let innerArcRadius = $derived(gaugeConfig.innerArcRadius);
  let valuePos = $derived(gaugeConfig.valuePos);
  let animatedValue = $derived(
    animationType === "tweened" ? $tweenedValue : $springValue,
  );
  let scale = $derived(
    scaleLinear().domain([min, max]).range([startAngle, endAngle]),
  );
  let valueAngle = $derived(scale(animatedValue));
  let _textBaseline = $derived(Number(arcSize) === 360 ? "middle" : "bottom");
  let trackArc = $derived(
    d3arc()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius)
      .startAngle((startAngle * Math.PI) / 180)
      .endAngle((endAngle * Math.PI) / 180)
      .cornerRadius(0),
  );
  let innerArc = $derived(
    d3arc()
      .innerRadius(0)
      .outerRadius(innerArcRadius)
      .startAngle((startAngle * Math.PI) / 180)
      .endAngle((endAngle * Math.PI) / 180)
      .cornerRadius(2),
  );
  let middleArc = $derived(
    d3arc()
      .innerRadius(innerArcRadius)
      .outerRadius(innerRadius)
      .startAngle((startAngle * Math.PI) / 180)
      .endAngle((endAngle * Math.PI) / 180)
      .cornerRadius(0),
  );

  let _majorTicks = $state([]);
  let _minorTicks = $state([]);

  $effect(() => {
    if (majorTicks <= 0 || minorTicks < 0 || min === max) {
      _majorTicks = [];
      _minorTicks = [];
      return;
    }

    const _precision = precision || 0;
    const majorStep = (max - min) / majorTicks;
    const minorStep = minorTicks > 0 ? majorStep / minorTicks : 0;
    let pos = Number(min) || 0;
    let minorPos = pos;
    const majors = [];
    const minors = [];

    while (pos <= max) {
      majors.push({
        angle: scale(Number(pos)),
        label: pos.toFixed(_precision),
      });
      if (minorTicks > 0) {
        while (minorPos <= pos + majorStep && minorPos <= max) {
          minors.push({ angle: scale(minorPos), label: "" });
          minorPos += minorStep;
        }
      }
      pos += majorStep;
    }

    if (Number(arcSize) === 360) {
      if (majors.length) majors.shift();
      if (minors.length) minors.shift();
    }

    _majorTicks = majors;
    _minorTicks = minors;
  });
</script>

<div
  class="svg-box"
  style:--backdropColor={backdropColor}
  style:--needleColor={needleColor || "var(--spectrum-global-color-blue-400)"}
  style:--valueColor={valueColor || "var(--spectrum-global-color-gray-800)"}
  style:--trackColor={trackColor || "var(--spectrum-global-color-gray-400)"}
  style:--centerColor={centerColor || "var(--spectrum-global-color-gray-100)"}
  style:--tickLabelColor={tickLabelColor ||
    "var(--spectrum-global-color-gray-600)"}
>
  <svg
    class="svg-box-content"
    viewBox="-2 -2 {canvas.width + 4} {canvas.height + 4}"
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d={trackArc()}
      class="track"
      transform="translate({pivot.x}, {pivot.y})"
    />
    <path
      d={middleArc()}
      class="middleArc"
      transform="translate({pivot.x}, {pivot.y})"
    />

    <polygon
      class="needle"
      points="{pivot.x}, 6 {pivot.x + 2},{pivot.y -
        innerArcRadius -
        2} {pivot.x - 2},{pivot.y - innerArcRadius - 2}"
      transform="rotate({valueAngle} {pivot.x}, {pivot.y})"
    />
    <path
      d={innerArc()}
      class="innerArc"
      transform="translate({pivot.x}, {pivot.y})"
    />

    {#if showTicks && _majorTicks.length > 0}
      {#each _minorTicks as tick}
        <line
          class="minor-tick"
          x1={pivot.x}
          y1={2}
          x2={pivot.x}
          y2={10}
          transform="rotate({Number(tick.angle)} {pivot.x} {pivot.y})"
        />
      {/each}

      {#each _majorTicks as tick}
        <line
          class="tick"
          x1={pivot.x}
          y1={0}
          x2={pivot.x}
          y2={16}
          transform="rotate({Number(tick.angle)} {pivot.x} {pivot.y})"
        />
        {#if showTickLabels}
          <text
            class="tick-label"
            x={pivot.x}
            y={26}
            text-anchor="middle"
            transform="rotate({tick.angle} {pivot.x} {pivot.y})"
          >
            {tick.label}
          </text>
        {/if}
      {/each}
    {/if}

    <text
      class="value"
      class:smaller={valueSize == "M"}
      class:very-small={valueSize == "S"}
      dominant-baseline={_textBaseline}
      transform="translate({valuePos.x} {valuePos.y})"
    >
      {prefix + animatedValue.toFixed(precision) + suffix}
    </text>
  </svg>
</div>

<style>
  .svg-box {
    height: 100%;
    aspect-ratio: 1;
    position: relative;
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
  .needle {
    fill: var(--needleColor);
  }

  .track {
    fill: var(--trackColor);
  }
  .middleArc {
    fill: var(--backdropColor, var(--spectrum-global-color-gray-50));
  }
  .innerArc {
    stroke: var(--spectrum-global-color-gray-300);
    stroke-width: 1px;
    fill: var(--centerColor);
  }

  .tick {
    stroke: var(--trackColor);
    stroke-width: 2px;
    fill: none;
  }

  .minor-tick {
    stroke: var(--trackColor);
    stroke-width: 1px;
    fill: none;
  }

  .tick-label {
    fill: var(--tickLabelColor);
    font-weight: 400;
    font-size: 0.6rem;
    text-anchor: middle;
  }

  .value {
    text-anchor: middle;
    fill: var(--valueColor);
    font-size: 1rem;
    letter-spacing: 1.2px;
    font-family: monospace;

    &.smaller {
      font-size: 0.85rem;
    }

    &.very-small {
      font-size: 0.65rem;
    }
  }
</style>