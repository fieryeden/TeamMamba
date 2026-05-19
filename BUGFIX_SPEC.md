# TeamMamba Bug Fix Spec — 2026-05-19

All fixes go in `/home/rick/.openclaw/workspace/projects/teammamba`.

## Bug 1: Kanban drag-and-drop doesn't work

**Problem:** The Kanban view has `DragDropContext` and `handleDragEnd` wired, but the `handleDragEnd` inside `KanbanView` (line ~2886) only updates local `laneOrder` state and calls `onUpdateValue` for cross-lane moves. However, `onUpdateValue` expects a column value ID and value — it works for changing the status index, but the **reorder within the same lane** is purely local state and never persisted. Also, the table view's `handleDragEnd` (line ~1852) calls `onReorderItems` but this is not passed to KanbanView.

**Fix:**
- In the `KanbanView` component props (line ~2816), add `onReorderItems` prop with the same signature as the table view uses.
- In `KanbanView.handleDragEnd`, when `sourceLane === destinationLane` (same lane reorder), call `onReorderItems` with the correct parameters to persist position changes.
- In the parent `BoardClient` where KanbanView is rendered (line ~1522), pass `onReorderItems={handleReorderTableItems}`.
- For cross-lane moves (changing status), the existing `onUpdateValue` works, but also call `onReorderItems` to persist the position within the new lane.

## Bug 2: Color assignment doesn't change actual color on items

**Problem:** The item detail panel has a color picker (line ~2540-2546) that renders an `<input type="color">`, but it uses `defaultValue` (not `onChange`). The color value is only rendered as a left border on the item row (line ~2093: `borderLeft: 3px solid ${item.color}`), which is very subtle. When a user picks a color, nothing happens because there's no `onChange` handler.

**Fix:**
- Change the `<input type="color">` from `defaultValue` to `value={color}` and add an `onChange` handler that calls `onUpdateItemFields(item.id, { color: event.target.value })`.
- Make item color more visible: apply the color as a background tint on the item row (e.g., `backgroundColor: item.color ? item.color + '15' : undefined`) in addition to the border-left.
- Make sure `onUpdateItemFields` is properly wired. Currently it's defined around line ~780 as `handleUpdateItemFields` which patches via `fetch /api/items/[id]`. Verify it's passed to the item detail section.

## Bug 3: Share button doesn't do anything (perceptibly)

**Problem:** `handleShareBoard` (line ~1192) calls `/api/guest-access` POST, then does `navigator.clipboard.writeText(shareUrl)` + `window.alert()`. The `window.alert` works but is ugly and may be blocked by browsers. The clipboard write can also fail silently.

**Fix:**
- Replace `window.alert` with a toast notification. If there's no toast system, create a simple one using a state-driven notification component.
- Add a visible share dialog/modal that shows the share URL, a copy button, and an option to set expiry.
- Add a fallback if clipboard API fails: show the URL in a text input the user can manually copy.
- Also add visual feedback on the Share button when share is enabled (e.g., a small badge or different icon).

## Bug 4: Add Filter causes client-side exception

**Problem:** The "Add filter" button calls `addFilterRow` (line ~1216) which adds a default filter. The filter popover renders filter rows with column selectors and value inputs. The crash is likely because `getFilterOperators` or `getDefaultFilter` encounters a column type that doesn't have operators defined, or a column value access fails during filter evaluation.

**Fix:**
- In `getFilterOperators` (line ~228), add a default case that returns `textOperators` for any unrecognized column type instead of returning undefined/empty.
- In `matchesFilter` (line ~577), add null/undefined guards for `filter.value`, `column`, and column values before accessing properties.
- In the filter row rendering, guard against undefined column references (a filter might reference a column that was deleted).
- Wrap the filter application logic in try/catch so a single bad filter doesn't crash the whole board.

## Bug 5: Need ability to assign color to Workspace, Group, and Item

**Problem:** Currently only groups have a `color` field in the DB (used for group header borders). Items have `color` but the UI is broken (see Bug 2). Workspaces have no `color` field.

**Fix:**
- **Items:** Fix Bug 2 above (color picker in item detail).
- **Groups:** Add a color picker to the group header. When clicking the group color dot or group name area, show a small color picker popover. On change, call `PATCH /api/groups/[id]` with `{ color: newColor }`.
- **Workspaces:** Add a `color` column to the Workspace model in Prisma schema. Run migration. Add a color picker in the workspace settings/header. Persist via a new `PATCH /api/workspaces/[id]` endpoint. Show workspace color as an accent on workspace cards and the sidebar.

## Bug 6: Cannot rename Workspace or Group

**Problem:** 
- **Groups:** The group API already supports PATCH with `{ name }` (see `src/app/api/groups/[id]/route.ts`), but there's no UI to trigger a rename. The group header (line ~2060-2070) just displays the name as static text.
- **Workspaces:** There's no `PATCH /api/workspaces/[id]` endpoint at all (the workspace API only has GET and POST).

**Fix:**
- **Groups:** Make the group name in the board view (line ~2070) editable on double-click. Show an inline input that calls `PATCH /api/groups/[id]` with `{ name }` on blur/enter. Add a "Rename" option in a right-click/context menu or a small edit icon.
- **Workspaces:** Add `PATCH /api/workspaces/[id]` endpoint supporting `{ name, description, icon, color }`. Add a rename UI on the workspace page — double-click the workspace name or add an edit icon.

## Bug 7: Accent Color setting doesn't do anything

**Problem:** `handleAccentChange` in settings (line ~167) sets `--accent` to a hex value like `#3b82f6`. But `globals.css` defines `--accent` as HSL channel values (e.g., `210 40% 96%`) for shadcn/ui's HSL-based color system. Writing a hex value breaks all CSS that uses `hsl(var(--accent))`.

**Fix:**
- Convert the hex color to HSL before setting the CSS variable. Write a `hexToHsl` utility (or use a simple conversion function) that takes `#3b82f6` and outputs `217 91% 53%`.
- Set `--accent` to the HSL string (e.g., `document.documentElement.style.setProperty("--accent", "217 91% 53%")`).
- Also compute and set `--accent-foreground` to ensure contrast (white text on dark accent, dark text on light accent).
- Apply the accent color on load: in the `useEffect` that initializes settings, read `tm-accent` from localStorage and apply the HSL conversion immediately.

## Bug 8: Import/transfer from Monday.com is missing

**Problem:** There's CSV/XLSX import, but no Monday.com-specific import. Monday.com has an API and also supports CSV export, so we can support both.

**Fix:**
- Add a "Import from Monday.com" option in the board toolbar (next to Import CSV/XLSX).
- Create a Monday.com import dialog that supports two modes:
  1. **CSV mode:** Upload a Monday.com CSV export (they have a specific format with groups as sections). Parse it — Monday.com CSVs have group headers as rows where only the first column has a value.
  2. **API mode (optional future):** Enter a Monday.com API token + board ID to pull data directly.
- For CSV mode: Create `src/app/api/boards/import-monday/route.ts` that accepts a CSV file, parses Monday.com format, and creates groups + items + column values.
- The Monday.com CSV format typically has: first row = column headers, then group header rows (where only column A has a value, the group name), then item rows under each group.
- Add the import button and dialog in `board-client.tsx` toolbar.

## Implementation Notes

- All existing API routes, Prisma models, and component structure should be preserved.
- Use existing shadcn/ui components (Button, Input, Popover, Dialog, etc.) for UI.
- The project uses `@hello-pangea/dnd` for drag-and-drop.
- Run `npx prisma migrate dev` after any schema changes.
- Run `npx tsc --noEmit` after all changes to verify TypeScript compiles clean.
- Run `npx next build` to verify the production build succeeds.
