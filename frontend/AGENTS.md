# Frontend

NextJS Kanban board, built as a static export and served by the FastAPI backend at `/`.
Reaching `/` requires signing in, and the board is loaded from and saved to the API, so edits persist.

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
    AuthGate.tsx           Decides between the login screen and the board. Owns the session state.
    LoginScreen.tsx        Username and password form. One error message for either wrong field.
    KanbanBoard.tsx        Client component. Owns all board state and every mutation handler.
    ChatSidebar.tsx        Collapsible AI panel. Owns the conversation and posts to /api/chat.
    KanbanColumn.tsx       One column: droppable target, rename input, card list, NewCardForm.
    KanbanCard.tsx         One sortable card with a Remove button.
    KanbanCardPreview.tsx  Non-interactive card used inside the DragOverlay.
    NewCardForm.tsx        Collapsed "Add a card" button that expands to a title/details form.
  lib/
    api.ts          The only place that talks to the backend. Base URL, credentials, error handling.
    useBoard.ts     Loads the board, and owns saving: optimistic update, debounce, revert.
    kanban.ts       Types, moveCard reducer, createId. No seed data: the backend owns that.
  test/
    setup.ts        Imports @testing-library/jest-dom.
    vitest.d.ts     Globals typing.
tests/
  kanban.spec.ts    Playwright e2e against the served build.
  chat.spec.ts      The sidebar, with /api/chat mocked so the run is deterministic.
```

Unit tests sit next to what they cover: `api.test.ts`, `ApiStatus.test.tsx`, `KanbanColumn.test.tsx`,
`NewCardForm.test.tsx`, `KanbanBoard.test.tsx`, `ChatSidebar.test.tsx`, `kanban.test.ts`.

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

## Auth gate

`page.tsx` renders `AuthGate`, which calls `getMe()` on mount:

- pending: a "Loading" splash, so the board never flashes before the check finishes
- rejected (401): `LoginScreen`
- resolved: `KanbanBoard`, given `username` and `onSignOut`

The 401 from `/api/auth/me` is expected on a first visit and shows up in the browser console. That is the
gate working, not a failure.

This is client side because the site is a static export with no server in front of it. It keeps an
unauthenticated visitor from seeing board data, since the data itself will come from guarded API routes
in Part 7. It is not a security boundary on its own: the backend `require_user` dependency is.

## Saving

`useBoard` owns the board. `KanbanBoard` computes the next board and calls `commit(next)`; the hook shows it
immediately and writes the whole board with `PUT /api/board`.

- **Optimistic.** The screen never waits for the server.
- **Reverting.** A failed write puts back the last board the server confirmed and shows a non-blocking
  message in the header (`data-testid="board-error"`). The next successful write clears it.
- **Debounced renames.** `commit(next, RENAME_DEBOUNCE_MS)` is used for column titles, so typing is one write
  rather than one per keystroke. Every write sends the whole board, so a later edit simply supersedes a
  pending one, and an immediate edit cancels a pending debounce rather than racing it.
- **Flushed on `pagehide`.** Without this, renaming a column and reloading straight away loses the rename,
  because the page goes before the debounce fires. The flush uses `keepalive` so the request survives the
  page going away. This is a real case, not a hypothetical: the e2e suite caught it.

`KanbanBoard` renders three states: `board-loading`, `board-load-error` (with a Retry), and the board.

`replace(board)` is the other way in. It adopts a board without writing it back, because `POST /api/chat`
has already saved the AI's board, and it drops any debounced write: that write was computed from the older
board, so letting it land would undo the change that just arrived.

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

## Chat sidebar

`ChatSidebar` owns the conversation; the backend is stateless for chat, so the whole history is sent with
every message. It sits beside the board rather than over it, so the board stays visible and usable while a
request is in flight. Collapsed, it is a narrow rail and the board keeps its full width (271px columns at
1600px, unchanged from Part 9); open, it takes 380px and columns go to 215px.

- The history posted is exactly what is on screen, mapped down to `{role, content}`. `changedBoard` is a
  display-only flag and is stripped before sending.
- A reply with `board_updated` is handed to `useBoard`'s `replace`, so the board changes with no reload and
  no second write. The turn gets a yellow border and a "Board updated" tag.
- A failed send takes the unsent message back out of the thread and puts it in the box, so retrying is one
  click rather than retyping.

The model is told to reply in plain text. Without that it returns markdown, and the sidebar shows the text
as typed, so `**Release notes**` reached the screen with the asterisks in it.

## Test hooks

- Columns: `data-testid="column-<columnId>"`
- Cards: `data-testid="card-<cardId>"`
- Rename input: `aria-label="Column title"`
- Delete button: `aria-label="Delete <card title>"`

- Chat: `data-testid` of `chat-toggle` (open and close), `chat-panel`, `chat-message` (with `data-role`),
  `chat-pending`, `chat-error`, `chat-board-updated`. Input is `aria-label="Message the assistant"`.
- API status chip: `data-testid="api-status"` with `data-state` of `checking`, `ok`, or `error`
- Board states: `data-testid` of `board-loading`, `board-load-error`, `board-error` (a failed save)
- Signed in user: `data-testid="signed-in-user"`; session check splash: `data-testid="auth-checking"`
- Login error: `data-testid="login-error"`. Select it by test id, not `getByRole("alert")`: NextJS renders
  its own `role="alert"` route announcer, so the role matches two elements in a real browser.

Keep these stable; both the unit and e2e suites select on them.

E2E runs with `workers: 1` and its own `data/e2e.db`, wiped at the start of each run. There is one account
and one board, so parallel tests would overwrite each other. That is a property of the MVP, not a workaround.
Playwright locators are `getByLabel`, not Testing Library's `getByLabelText`.

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

## Known gaps

- Saving is last write wins for the whole board. One user with one board, so this is not a live problem.
- The conversation lives in React state only, so a reload starts a fresh thread. The board persists; the
  chat does not.
