# Agent instructions — superlib

Shared Svelte 5 component library (`@poirazis/superlib`). Consumed by Budibase plugins in the parent workspace; see [`../AGENTS.md`](../AGENTS.md) for plugin migration, build, and publishing rules.

## Svelte version

**Pinned to `5.55.10`.** Match `peerDependencies` / plugin `overrides`. Do not bump without an explicit user request.

## Runes

- **Use:** `$props`, `$state`, `$derived`, `$effect`, `$bindable`
- **Do not use:** `export let`, `$:` reactive statements
- Runes mode is enabled in `svelte.config.js` (`compilerOptions.runes: true`)

Remaining legacy APIs that are still acceptable:

- `createEventDispatcher` (migrate to callback props only when touching that component for other reasons)
- `svelte/store` in form/table context (migrate incrementally)
- `<svelte:component>` in dynamic cell rendering (replace when that file is otherwise being updated)
- `onMount` / `onDestroy` where lifecycle is clearer than `$effect`

## Event directives — keep `on:`

**Do not convert `on:` directives to attribute event syntax** (`onclick=`, `oninput=`, `onchange=`, etc.) in superlib.

This is required for Budibase: the host runtime supports `t.event()` but not `t.delegated()`, so attribute-style delegatable events crash at runtime. Superlib ships inside plugin bundles that run in that host.

| Syntax | Use in superlib? |
|--------|------------------|
| `on:click={fn}`, `on:change={fn}`, `on:input={fn}`, … | **Yes — default** |
| `onclick={fn}` etc. for delegatable events | **No** |

Non-delegatable events (`wheel`, `mouseleave`, `mouseenter`, `scroll`) may use attribute syntax only in a **separate** `.svelte` file. Do not mix `on:` and `onfoo=` in the same file.

Add `<!-- svelte-ignore event_directive_deprecated -->` when the compiler warns on elements that must keep `on:`.

When assessing “runes migration” progress, **do not** count `on:` usage as incomplete work.

## Build

```bash
npm run prepack   # svelte-package → dist/
```

Plugins link the local package: `cd superlib && bun link`, then `bun link @poirazis/superlib` in each plugin. Do not `npm publish` or `git push` without user permission.