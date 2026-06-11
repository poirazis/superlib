# @poirazis/superlib

A Svelte 5 component library for building rich data-entry UIs, field plugins, and admin interfaces. It includes table/form cell editors, layout primitives, and reusable UI building blocks.

## Requirements

- Svelte 5
- Bun, npm, pnpm, or yarn

## Installation

```sh
npm install @poirazis/superlib
```

## Usage

Import components from the package entry point:

```svelte
<script>
	import { Button, SuperTabs, CellString, SuperField } from '@poirazis/superlib';
</script>

<SuperField label="Name" field="name">
	<CellString value="Jane" cellOptions={{ role: 'formInput' }} />
</SuperField>

<Button text="Save" type="primary" />
```

## Exports

### UI

| Component | Description |
| --- | --- |
| `Button` | Action button with icons, confirm mode, timer/loop actions |
| `Switch` | Toggle switch |
| `Checkbox` | Checkbox input |

### Layout & structure

| Component | Description |
| --- | --- |
| `SuperField` | Labelled form field wrapper with help text and error display |
| `SuperList` | Draggable, selectable list with row actions |
| `SuperTabs` | Tabbed container |
| `SuperLightbox` | Full-screen attachment/image viewer |

### Cell editors

Cell components are designed for inline editing in tables and forms. They use a shared `cellOptions` prop for role, readonly/disabled state, styling, and behaviour.

| Component | Description |
| --- | --- |
| `TextCell` | Simple text display cell |
| `CellString` | String input with formatting and debounce |
| `CellStringMask` | Masked string input (IMask) |
| `CellNumber` | Number input with formatting |
| `CellSlider` | Numeric slider |
| `CellBoolean` | Boolean toggle |
| `CellDatetime` | Date/time picker |
| `CellDateRange` | Date range picker |
| `CellOptions` | Single/multi select options |
| `CellOptionsAdvanced` | Advanced options picker |
| `CellTags` | Tag input |
| `CellLink` | Link field |
| `CellLinkPickerSelect` | Link picker (select) |
| `CellLinkPickerTree` | Link picker (tree) |
| `CellSQLLink` | SQL-backed link field |
| `CellSQLLinkPicker` | SQL link picker |
| `CellAttachment` | Attachment upload (compact) |
| `CellAttachmentExpanded` | Attachment upload (expanded/gallery) |
| `CellAttachmentSlider` | Attachment carousel |
| `CellColor` | Color picker |
| `CellIcon` | Icon picker |
| `CellJSON` | JSON editor |

### Cell context

Many cell components expect a Svelte context key named `sdk` (for example `processStringSync`, `API.uploadAttachment`). Provide it from a parent wrapper when using cells outside their original host environment:

```svelte
<script>
	import { setContext } from 'svelte';
	import { CellString } from '@poirazis/superlib';

	setContext('sdk', {
		processStringSync: (template, ctx) => String(ctx.value ?? ''),
		API: {
			uploadAttachment: async () => []
		}
	});
</script>
```

## Development

Clone the repo and install dependencies:

```sh
bun install
```

| Script | Description |
| --- | --- |
| `bun run dev` | Start the local showcase app |
| `bun run build` | Build the showcase app and library package |
| `bun run watch` | Rebuild the library on file changes |
| `bun run lint` | Run Prettier checks |
| `bun run format` | Format the codebase |
| `bun run check` | Full svelte-check (includes untyped components) |
| `bun run check:ts` | Type-check only components that use TypeScript |

Source lives in `src/lib`. The showcase app in `src/routes` is for local preview only and is not published.

## Publishing

Releases are automated via GitHub Actions on push to `main`. To publish a new version to npm:

1. Bump the version in `package.json`
2. Commit and push to `main`

The release workflow runs lint, scoped type-check (`check:ts`), builds the package, and publishes when the version in the tip commit differs from its parent. You can also trigger a manual release from the Actions tab.

```sh
# example
npm version patch
git push origin main
```

## Project structure

```
src/lib/
├── components/
│   ├── cells/          # Table/form cell editors
│   ├── form/           # Form layout components
│   ├── SuperList/      # Draggable list
│   ├── SuperTabs/      # Tabs
│   ├── SuperTree/      # Tree view
│   ├── SuperLightbox/  # Lightbox viewer
│   ├── SuperPopover/   # Popover positioning
│   └── UI/elements/    # Basic UI controls
├── actions/            # Svelte actions (click outside, dropdown positioning)
└── index.ts            # Public exports
```