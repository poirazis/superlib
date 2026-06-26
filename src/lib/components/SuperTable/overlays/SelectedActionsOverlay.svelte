<script>
	import { slide } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import SuperButton from '../../buttons/SuperButton.svelte';
	import { configuredButtonKey } from '../../../utils/buttonConditions.ts';

	let {
		tableAPI,
		stbState,
		stbSettings,
		footerHeight = 0,
		highlighted,
		footer,
		selectedActions,
		stbSelected,
		entityPlural = 'Rows',
		entitySingular = 'Row'
	} = $props();

	let hidden = $state(false);

	$effect(() => {
		if (stbSelected.size == 0) hidden = false;
	});

	let visibleActions = $derived(tableAPI.resolveSelectionButtons(selectedActions));

	let checkboxes = $derived(!stbSettings.appearance?.hideSelectionColumn);

	let left = $derived(
		1 +
			(checkboxes +
				(stbSettings.features?.canDelete ? 1 : 0) +
				(stbSettings.appearance?.numberingColumn ? 1 : 0)) *
				2 +
			'rem'
	);
</script>

{#if stbSelected.size && $stbState != 'Inserting' && !hidden}
	<div
		class="selected-row-actions-overlay"
		style:bottom={footerHeight + 20}
		style:left
		class:highlighted
		class:footer
		transition:slide={{ delay: 25, duration: 230, easing: quintOut, axis: 'y' }}
	>
		<SuperButton
			icon="ri-close-line"
			quiet={true}
			size="S"
			type="secondary"
			onClick={() => (hidden = true)}
		/>
		<span class="text">
			{stbSelected.size == 1
				? stbSelected.size + ' ' + (entitySingular || 'Row') + ' '
				: stbSelected.size + ' ' + (entityPlural || 'Rows') + ' '} Selected
		</span>
		{#each visibleActions as button, index (configuredButtonKey(button, index))}
			<SuperButton {...button} quiet={true} onClick={() => button.onClick?.()} />
		{/each}
	</div>
{/if}
