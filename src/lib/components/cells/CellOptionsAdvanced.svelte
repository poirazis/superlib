<script>
  import fsm from "svelte-fsm";
  import { getContext, createEventDispatcher } from "svelte";
  import CellPickerOptionsList from './CellPickerOptionsList.svelte';
  import CellPickerOptionSimple from './CellPickerOptionSimple.svelte';
  import PickerPopover from './PickerPopover.svelte';
  import SuperList from '../SuperList/SuperList.svelte';
  import CellSkeleton from './CellSkeleton.svelte';
  import Switch from '../UI/elements/Switch.svelte';
  import { useOptionsSource } from './useOptionsSource.svelte';
  import "./CellCommon.css";

  const dispatch = createEventDispatcher();
  const { builderStore } = getContext("sdk");

  let {
    cellOptions,
    value,
    fieldSchema,
    multi = true,
    autofocus = false,
  } = $props();

  let anchor = $state();
  let editor = $state();
  let focusedOptionIdx = $state(-1);
  let timer = $state();
  let picker = $state();
  let inactive = $state(true);

  let localValue = $state([]);

  let originalValue = $state('[]');

  let config = $derived(cellOptions ?? {});

  let controlType = $derived(config.controlType);
  let role = $derived(config.role);
  let readonly = $derived(config.readonly);
  let disabled = $derived(config.disabled);
  let direction = $derived(config.direction);
  let color = $derived(config.color);
  let background = $derived(config.background);

  let inBuilder = $derived($builderStore.inBuilder);

  const source = useOptionsSource({
    getCellOptions: () => cellOptions ?? {},
    getFieldSchema: () => fieldSchema,
    defaultLimit: 1000,
    skipCustomPalette: true,
  });

  const { options, labels, dataSourceStore, colors } = source;
  let optionsSource = $derived(source.optionsSource);
  let optionIcons = $derived(source.optionIcons);

  let fullSelection = $derived(
    source.filteredOptions.length == localValue.length &&
      source.filteredOptions.length > 0,
  );
  let radios = $derived(controlType == "radio");
  let isButtons = $derived(controlType == "buttons");
  let allSelected = $derived(
    source.filteredOptions.length == localValue.length,
  );
  let fetch = $derived(source.fetch);

  export const cellState = fsm("Loading", {
    "*": {
      goTo(state) {
        return state;
      },
      refresh() {
        source.resetOptionStores();
        return "Loading";
      },
      loadOptions() {
        source.loadOptions(optionsSource);
      },
      clearFilters() {
        source.filteredOptions = source.getOptionsSnapshot();
      },
    },
    Loading: {
      _enter() {
        if (cellOptions.optionsSource != "data")
          this.goTo.debounce(10, cellOptions.initialState || "View");
        else {
          source.fetch = source.createFetch($dataSourceStore);
        }
      },
      _exit() {
        this.loadOptions();
      },
      syncFetch(fetchState) {
        if (source.syncFetchLoaded(fetchState?.loaded)) {
          return cellOptions.initialState || "View";
        }
      },
    },
    View: {
      _enter() {},
      focus(e) {
        if (!cellOptions.readonly && !cellOptions.disabled) {
          return "Editing";
        }
      },
    },
    Editing: {
      _enter() {
        originalValue = JSON.stringify(
          Array.isArray(value) ? value : value ? [value] : [],
        );

        dispatch("enteredit");
      },
      _exit() {
        editorState.close();
        dispatch("exitedit");
      },
      handleKeyboard(e) {},
      focusout(e) {
        editorState.close();
        if (anchor?.contains(e.relatedTarget)) return;
        if (!inactive) return;

        this.submit();
        return "View";
      },
      submit() {
        if (isDirty && !cellOptions.debounce) {
          if (multi) dispatch("change", localValue);
          else dispatch("change", localValue[0]);
        }
      },
      cancel() {
        return "View";
      },
    },
  });

  let inEdit = $derived($cellState == "Editing");
  let isDirty = $derived(
    inEdit && originalValue !== JSON.stringify(localValue),
  );
  let loading = $derived($cellState == "Loading");

  const editorState = fsm("Closed", {
    "*": {
      toggleOption(idx) {
        let option = $options[idx];
        let pos = localValue.indexOf(option);

        if (multi && pos > -1) {
          localValue.splice(pos, 1);
          localValue = [...localValue];
        } else if (multi) {
          localValue = [...localValue, option];
        } else {
          if (localValue[0] == option) localValue.length = 0;
          else localValue[0] = option;
        }

        if (cellOptions.debounce || isButtons) {
          clearTimeout(timer);
          timer = setTimeout(() => {
            dispatch("change", multi ? localValue : localValue[0]);
          }, cellOptions.debounce ?? 0);
        }

        if (!multi || source.filteredOptions.length == localValue.length) {
          anchor?.focus();
        }
      },
      toggleAll() {
        if (allSelected) localValue = [];
        else localValue = [...source.filteredOptions];

        if (cellOptions.debounce) {
          clearTimeout(timer);
          timer = setTimeout(() => {
            dispatch("change", multi ? localValue : localValue[0]);
          }, cellOptions.debounce ?? 0);
        }
      },
      handleKeyboard(e) {
        if (e.keyCode == 32) {
          editorState.toggle();
        }

        if (e.key == "Escape") {
          this.cancel();
        }

        if (e.key == "Enter") {
          if (multi) {
            this.toggleOption(focusedOptionIdx, e.preventDefault());
            this.close();
          } else {
            this.toggleOption(focusedOptionIdx);
          }
        }

        if (e.key == "ArrowDown")
          this.highlightNext(e.preventDefault(), e.stopPropagation());
        if (e.key == "ArrowUp")
          this.highlightPrevious(e.preventDefault(), e.stopPropagation());
        if (e.key == "Escape") this.close(e.stopPropagation());
      },
      highlightNext() {
        focusedOptionIdx += 1;
        if (focusedOptionIdx > $options.length - 1) focusedOptionIdx = 0;
      },
      highlightPrevious() {
        focusedOptionIdx -= 1;
        if (focusedOptionIdx < 0) focusedOptionIdx = $options.length - 1;
      },
    },
    Open: {
      _enter() {
        focusedOptionIdx = -1;
        this.refocus.debounce(10);
      },
      _exit() {},
      filterOptions(e) {
        source.filterOptions(e?.target?.value ?? "", "prefix");
      },
      close() {
        return "Closed";
      },
      toggle() {
        return "Closed";
      },
    },
    Closed: {
      toggle() {
        return "Open";
      },
      open() {
        return "Open";
      },
      filterOptions(e) {
        this.open();
        this.filterOptions(e);
      },
      handleKeyboard(e) {
        if (!cellOptions.autocomplete && controlType == "select") {
          if (e.keyCode == 32) {
            e.preventDefault();
            e.stopPropagation();
            this.toggle();
          }

          if (e.key == "Backspace" || e.key == "Delete") {
            e.stopPropagation();
            localValue = [];
            dispatch("change", localValue);
          }
        } else if (controlType != "select") {
          if (e.keyCode == 32 || e.key == "Enter")
            this.toggleOption(focusedOptionIdx, e.preventDefault());
          if (e.key == "ArrowDown")
            this.highlightNext(e.preventDefault(), e.stopPropagation());
          if (e.key == "ArrowUp")
            this.highlightPrevious(e.preventDefault(), e.stopPropagation());
          if (e.key == "Escape") this.close(e.stopPropagation());
        }
      },
    },
  });

  $effect(() => {
    localValue = Array.isArray(value) ? value : value ? [value] : [];
  });

  $effect(() => {
    dataSourceStore.set(cellOptions.datasource);
  });

  $effect(() => {
    if (inBuilder) {
      cellState.refresh();
    }
  });

  $effect(() => {
    cellState.syncFetch(fetch);
  });

  $effect(() => {
    if ($dataSourceStore) {
      cellState.refresh();
    }
  });

  $effect(() => {
    if (autofocus) {
      setTimeout(() => {
        cellState.focus();
        editor?.focus();
      }, 30);
    }

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  });
</script>

<!-- svelte-ignore event_directive_deprecated -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  bind:this={anchor}
  class="superCell multirow"
  tabindex={cellOptions?.disabled ? -1 : 0}
  class:inEdit={inEdit && !isButtons}
  class:isDirty={isDirty && cellOptions.showDirty}
  class:disabled
  class:readonly
  class:error
  style:color
  style:background
  class:inline={role == "inlineInput"}
  class:tableCell={role == "tableCell"}
  class:formInput={role == "formInput"}
  class:naked-field={isButtons || role == "inlineInput"}
  on:focusin={cellState.focus}
  on:focusout={cellState.focusout}
  on:keydown={editorState.handleKeyboard}
>
  {#key loading}
    {#if loading}
      <CellSkeleton />
    {:else}
      {#key controlType}
        {#if controlType == "list"}
          <SuperList
            items={localValue}
            itemsColors={$colors}
            itemsLabels={$labels}
            showColors={cellOptions.optionsViewMode != "text"}
            reorderOnly={cellOptions.reorderOnly}
            placeholder={cellOptions.placeholder}
            readonly={cellOptions.readonly || cellOptions.disabled}
            {editorState}
            {cellState}
            {fullSelection}
            bind:inactive
            on:togglePicker={editorState.toggle}
            on:clear={() => {
              localValue = [];
              editorState.close();
              anchor.focus();
            }}
            on:change={(e) => {
              localValue = [...e.detail];
              anchor.focus();
            }}
          />
        {:else if radios == true}
          <div
            class="radios"
            class:inline={role == "inlineInput"}
            class:column={direction == "column"}
            on:mouseleave={() => (focusedOptionIdx = -1)}
          >
            {#each $options as option, idx}
              <div
                class="radio"
                class:selected={localValue?.includes(option)}
                class:focused={focusedOptionIdx === idx}
                on:mousedown={(e) => editorState.toggleOption(idx)}
                on:mouseenter={() => (focusedOptionIdx = idx)}
              >
                <i
                  style:color={$colors[option]}
                  class={radios && localValue.includes(option)
                    ? "ph-fill ph-radio-button"
                    : radios
                      ? "ph ph-circle"
                      : localValue.includes(option)
                        ? "ph-fill ph-check-square"
                        : "ph ph-square"}
                ></i>
                {$labels[option] || option}
              </div>
            {/each}
          </div>
        {:else if isButtons == true}
          <div class="buttons">
            {#each $options as option, idx}
              <div
                class="button"
                class:selected={localValue?.includes(option)}
                style:--option-color={$colors[option]}
                on:click={() => editorState.toggleOption(idx)}
              >
                {$labels[option] || option}
              </div>
            {/each}
          </div>
        {:else if controlType == "switch"}
          <div
            class="switches"
            class:inline={role == "inlineInput"}
            class:column={cellOptions.direction == "column"}
            on:mouseleave={() => (focusedOptionIdx = -1)}
          >
            {#if cellOptions.toggleAll}
              <div
                class="switch toggle-all"
                on:mouseenter={() => (focusedOptionIdx = -1)}
              >
                <div class="text">All</div>
                {#if !(readonly || disabled)}
                  <Switch
                    checked={allSelected}
                    disabled={readonly || disabled}
                    size="small"
                    on:change={() => editorState.toggleAll()}
                  />
                {/if}
              </div>
            {/if}
            {#each $options as option, idx (idx)}
              <div
                class="switch"
                class:selected={localValue.includes(option)}
                class:focused={focusedOptionIdx === idx}
                style:--option-color={$colors[option]}
                on:mouseenter={() => (focusedOptionIdx = idx)}
                on:click|stopPropagation={() => editorState.toggleOption(idx)}
              >
                <i class={optionIcons[option] || "no-icon"}></i>
                <div class="text">
                  {$labels[option] || option}
                </div>
                <Switch
                  checked={localValue.includes(option)}
                  disabled={readonly || disabled}
                  size="small"
                  on:change={() => editorState.toggleOption(idx)}
                />
              </div>
            {/each}
          </div>
        {/if}
      {/key}
    {/if}
  {/key}
</div>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<PickerPopover
  {anchor}
  visible={inEdit && controlType == "list"}
  maxHeight={400}
  open={$editorState == "Open"}
  onClose={cellState.focusout}
>
  <CellPickerOptionsList
    bind:optionsList={picker}
    onMouseLeave={() => (focusedOptionIdx = -1)}
  >
    {#if source.filteredOptions?.length < 1 || source.filteredOptions.length == localValue.length}
      <div class="option">
        <span>
          <i class="ri-close-line"></i>
          No Options Found
        </span>
      </div>
    {:else}
      {#each source.filteredOptions as option, idx (idx)}
        <CellPickerOptionSimple
          focused={focusedOptionIdx === idx}
          selected={localValue?.includes(option)}
          optionColor={$colors[option]}
          onSelect={() => editorState.toggleOption.debounce(150, idx)}
          onFocus={() => (focusedOptionIdx = idx)}
        >
          <span>
            <i class="ri-checkbox-blank-fill"></i>
            {$labels[option] || option}
          </span>
        </CellPickerOptionSimple>
      {/each}
    {/if}
  </CellPickerOptionsList>
</PickerPopover>

<style>
  :global(.options) {
    flex: auto;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    overflow-y: auto;
    color: var(--spectrum-global-color-gray-700);
  }

  :global(.option) {
    min-height: 1.75rem;
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    padding: 0 0.5rem;

    &.selected {
      display: none;
      color: var(--spectrum-global-color-gray-800);
      background-color: var(--spectrum-global-color-gray-75);
    }

    &.focused {
      background-color: var(--spectrum-global-color-gray-200);
      color: var(--spectrum-global-color-gray-800);
      border-radius: 4px;
    }
  }
  :global(.option > span) {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    & > i {
      color: var(--option-color);
      font-size: larger;
    }
  }

  .buttons {
    flex: auto;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    justify-items: flex-start;
  }

  .buttons.vertical {
    flex-direction: column;
    gap: 0.25rem;
  }
  .buttons > .button {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem 0.75rem;
    border: 1px solid var(--spectrum-global-color-gray-400);
    border-radius: 0.5rem;
    background-color: var(--spectrum-global-color-gray-100);
    color: var(--spectrum-global-color-gray-600);
    cursor: pointer;
    user-select: none;
    font-weight: 400;
    transition: all 0.15s ease-in-out;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    max-width: 100%;
    gap: 0.35rem;
    max-height: 1.75rem;
  }

  .button:hover {
    background-color: var(--spectrum-global-color-gray-300);
    border-color: var(--spectrum-global-color-gray-300);
    color: var(--spectrum-global-color-gray-800);
    cursor: pointer;
  }

  .button:active {
    border-color: var(--spectrum-global-color-gray-500);
    color: var(--spectrum-global-color-gray-800);
  }

  .button.selected {
    background-color: var(
      --option-color,
      var(--spectrum-global-color-gray-200)
    );
    border-color: var(--spectrum-global-color-gray-400);
    color: var(--spectrum-global-color-gray-800);
    font-weight: 600;
  }

  .radios {
    flex: auto;
    display: flex;
    flex-wrap: wrap;
    justify-items: flex-start;
    padding: 0.25rem 0.25rem;
  }

  .radios.inline {
    border: 1px solid var(--spectrum-global-color-gray-300);
    border-radius: 4px;
    padding: 0.25rem 0.25rem;
  }

  .radios.column {
    gap: 0rem;
    flex-direction: column;
    min-width: 0;
  }
  .radio {
    height: 1.75rem;
    display: flex;
    gap: 0.55rem;
    align-items: center;
    cursor: pointer;
    padding: 0 0.5rem;
    opacity: 0.75;
    border-radius: 0.25rem;
    &.focused {
      background-color: var(--spectrum-global-color-gray-200) !important;
      color: var(--spectrum-global-color-gray-800);
    }

    &:hover > i {
      color: var(--option-color, var(--spectrum-global-color-gray-700));
      opacity: 1;
    }

    &.selected {
      color: var(--spectrum-global-color-gray-800);
      opacity: 1;
    }
  }

  .switches {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 0.25rem 0.25rem;
    overflow-y: auto;
  }

  .switches.inline {
    padding: 0rem;
  }

  .switches.inline > .switch {
    padding: 0.25rem 0.5rem;
  }

  .switch {
    width: 100%;
    display: flex;
    gap: 0.35rem;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    height: 1.75rem;
    padding: 0.25rem 0.5rem;
    color: var(--spectrum-global-color-gray-700);

    & > i {
      color: var(--spectrum-global-color-gray-600);
      min-width: 13px;
      font-size: 13px;

      &.no-icon {
        display: none;
      }
    }
    & > .text {
      flex: 1 1 auto;
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
    }
    &.focused {
      background-color: var(--spectrum-global-color-gray-200) !important;
      color: var(--spectrum-global-color-gray-800);
      border-radius: 4px;
    }

    &.selected {
      color: var(--spectrum-global-color-gray-800);
      & > i {
        color: var(--option-color, var(--spectrum-global-color-gray-700));
      }

      & > .text {
        opacity: 1;
      }
    }
  }

  .switch.toggle-all .text {
    font-weight: 600;
    color: var(--spectrum-global-color-gray-600);
  }

  .switch > .spectrum-Switch {
    margin-right: unset !important;
    --spectrum-switch-m-handle-border-color: var(
      --spectrum-global-color-gray-500
    ) !important;
  }

  .radio > i {
    font-size: 16px;
  }
</style>