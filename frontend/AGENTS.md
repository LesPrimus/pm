# Frontend

NextJS Kanban board, built as a static export and served by the FastAPI backend at `/`.
Board state is still in React memory and resets on reload; the only backend call so far is a health check.
There is no auth and no persistence yet.

## Stack

- Next.js 16 (App Router) + React 19, TypeScript strict
- Tailwind CSS v4 (via `@tailwindcss/postcss`, no `tailwind.config`; theme lives in `src/app/globals.css`)
- `@dnd-kit/core` + `@dnd-kit/sortable` for drag and drop
- Vitest + Testing Library (unit) and Playwright (e2e)
- Path alias `@/*` maps to `src/*` (declared in `tsconfig.json` and mirrored in `vitest.config.ts`)

## Static export

`next.config.ts` sets `output: "export"`, so `npm run build` writes a plain HTML/CSS/JS site to `out/`
with no Node runtime. The Docker build copies it to `backend/app/static`, where FastAPI serves it.
`turbopack.root` is pinned to this directory so a stray lockfile above the repo cannot change the inferred
workspace root.

Consequences to keep in mind: no SSR, no NextJS API routes, and no middleware. Anything that looks like a
server-side guard has to be done client-side, which is why the Part 4 login gate is a React state machine
rather than a redirect.

## Layout

```
src/
  app/
    layout.tsx      Root layout. Loads Space Grotesk (--font-display) and Manrope (--font-body)
                    via next/font/google. Metadata title "Kanban Studio".
    page.tsx        Renders <KanbanBoard />. Nothing else.
    globals.css     Tailwind import, brand CSS variables, body defaults, .font-display helper.
  components/
    ApiStatus.tsx          Header chip. Calls getHealth on mount and reports connected or unreachable.
    KanbanBoard.tsx        Client component. Owns all board state and every mutation handler.
    KanbanColumn.tsx       One column: droppable target, rename input, card list, NewCardForm.
    KanbanCard.tsx         One sortable card with a Remove button.
    KanbanCardPreview.tsx  Non-interactive card used inside the DragOverlay.
    NewCardForm.tsx        Collapsed "Add a card" button that expands to a title/details form.
  lib/
    api.ts          The only place that talks to the backend. Base URL, credentials, error handling.
    kanban.ts       Types, seed data, moveCard reducer, createId.
  test/
    setup.ts        Imports @testing-library/jest-dom.
    vitest.d.ts     Globals typing.
tests/
  kanban.spec.ts    Playwright e2e against the served build.
```

Unit tests sit next to what they cover: `api.test.ts`, `ApiStatus.test.tsx`, `KanbanColumn.test.tsx`,
`NewCardForm.test.tsx`, `KanbanBoard.test.tsx`, `kanban.test.ts`.

## Data model (`src/lib/kanban.ts`)

```ts
type Card = { id: string; title: string; details: string };
type Column = { id: string; title: string; cardIds: string[] };
type BoardData = { columns: Column[]; cards: Record<string, Card> };
```

Normalized: columns hold ordered `cardIds`, cards live in a lookup keyed by id.
`initialData` seeds five columns (`col-backlog`, `col-discovery`, `col-progress`, `col-review`, `col-done`)
and eight cards (`card-1` .. `card-8`).

- `moveCard(columns, activeId, overId)` is the pure reorder/transfer function. `overId` may be a card id
  (insert at that index) or a column id (append to the end). Returns the input unchanged when ids do not resolve.
- `createId(prefix)` builds `${prefix}-${random}${timestamp}`. Not stable across renders, so it is only
  called inside event handlers, never during render.

## State and interaction

`KanbanBoard` is the single stateful component. It holds `board: BoardData` and `activeCardId`, and defines
`handleDragStart`, `handleDragEnd` (delegates to `moveCard`), `handleRenameColumn`, `handleAddCard`,
`handleDeleteCard`. Everything below it is presentational and driven by props.

DnD: one `DndContext` with `closestCorners` collision detection and a `PointerSensor` with a 6px activation
distance (so clicking Remove does not start a drag). Each column is a `useDroppable`; each card is a
`useSortable` inside a `SortableContext` with `verticalListSortingStrategy`. A `DragOverlay` renders
`KanbanCardPreview` while dragging.

Column titles are edited in place: the column heading is an `<input>` whose `onChange` calls `onRename`
directly, so renames are immediate and uncommitted (no save button, no validation).

## Styling

Brand colors are CSS variables on `:root` in `globals.css` and referenced as `text-[var(--navy-dark)]` etc:
`--accent-yellow #ecad0a`, `--primary-blue #209dd7`, `--secondary-purple #753991`, `--navy-dark #032147`,
`--gray-text #888888`, plus `--surface`, `--surface-strong`, `--stroke`, `--shadow`.
Light theme only. Rounded cards, soft shadows, two decorative radial-gradient blobs behind the board.

## API client

`src/lib/api.ts` is the single entry point to the backend.

```ts
const baseUrl = () => process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
```

Empty means same origin, which is how the app is deployed. `npm run dev` needs
`NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000` and the backend needs `DEV_CORS_ORIGIN` set to the dev
server origin. Every request sends `credentials: "include"` so the Part 4 session cookie travels.

Read the env var lazily inside a function, not once at module scope: NextJS inlines it at build time either
way, and lazy reads let tests stub it.

## Test hooks

- Columns: `data-testid="column-<columnId>"`
- Cards: `data-testid="card-<cardId>"`
- Rename input: `aria-label="Column title"`
- Delete button: `aria-label="Delete <card title>"`

- API status chip: `data-testid="api-status"` with `data-state` of `checking`, `ok`, or `error`

Keep these stable; both the unit and e2e suites select on them.

When rendering a card outside `KanbanBoard`, give the test's `DndContext` a `PointerSensor` with
`activationConstraint: { distance: 6 }`, as the board does. Without it a pointerdown starts a drag
immediately and swallows clicks on controls inside the card.

## Commands

```bash
npm install
npm run dev          # localhost:3000
npm run build
npm run lint
npm run test:unit    # vitest run
npm run test:e2e     # playwright: builds the export, serves it with FastAPI on 127.0.0.1:8000
npm run test:all
```

## Known gaps (addressed by docs/PLAN.md)

- No auth: the board is visible to anyone who loads the page (Part 4).
- No persistence: reloading discards every edit (Part 7).
- `initialData` is still hardcoded in the bundle; it becomes seed data owned by the backend (Part 6).
- No AI chat sidebar (Part 10).
