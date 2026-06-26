<script>
	import SuperPopover from '../../SuperPopover/SuperPopover.svelte';
	import SuperButton from '../../buttons/SuperButton.svelte';
	import { configuredButtonKey } from '../../../utils/buttonConditions.ts';

	let { rowContextMenuItems, right = true, row, tableAPI, rowState } = $props();

	let isOpen = $derived(rowState.menuAnchor != -1);
	let buttons = $derived(tableAPI.resolveRowButtons(rowContextMenuItems, row));

	function closeMenu() {
		rowState.menuRow = -1;
		rowState.menuAnchor = -1;
	}
</script>

{#if isOpen && buttons?.length}
	<SuperPopover
		open
		anchor={rowState.menuAnchor}
		align={right ? 'right' : 'left'}
		ignoreAnchor={false}
		on:close={closeMenu}
	>
		<div class="action-menu">
			{#each buttons as button, index (configuredButtonKey(button, index))}
				<SuperButton
					{...button}
					quiet={true}
					menuItem
					menuAlign={right ? 'right' : 'left'}
					onClick={() => {
						button.onClick?.();
						closeMenu();
					}}
				/>
			{/each}
		</div>
	</SuperPopover>
{/if}

<style>
	.action-menu {
		min-width: 160px;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		padding: 0.25rem;
	}
</style>
