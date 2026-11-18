---
id: frontend-system-design
title: Frontend System Design
description: A framework for the 45-minute design round, then full walkthroughs: news feed, e-commerce product page, real-time dashboard, spreadsheet, collaborative editor, offline-first app and search.
facets: frontend, system-design
---

## A framework for frontend system design interviews, and how to spend the 45 minutes
<!--
id: system-design-framework
level: senior
tags: system design, interview framework, radio, requirements, architecture
minutes: 12
-->

> [!PROMPT]
> You are given a vague prompt, "design Google Photos", and 45 minutes. Describe the framework you follow so that the interview doesn't turn into a random walk, and how you would split the time.
>
> **Cover**
> - Stages (such as RADIO): requirements, architecture, data model, interface/API, optimizations, with time per stage.
> - The clarifying questions and non-functional requirements you always ask.
> - How you present trade-offs, and signals interviewers look for at senior versus staff level.

> [!TLDR]
> Drive the conversation through five stages (often called RADIO): **R**equirements (functional, non-functional, scope), **A**rchitecture (components, rendering strategy, data flow), **D**ata model (entities, client state vs server state, normalization), **I**nterface (API contracts, component APIs, events), and **O**ptimizations (performance, accessibility, reliability, security, observability, i18n). Spend the most time where the problem is hard, state trade-offs out loud, and keep a running diagram.

### Time plan (45 minutes)

| Minutes | Stage | Output |
| --- | --- | --- |
| 0–6 | Requirements | Bullet list: core features, out of scope, users/devices, scale, NFRs (latency, offline, a11y, SEO) |
| 6–15 | Architecture | Box diagram: client modules, server/BFF, real-time channel, caches, CDN |
| 15–22 | Data model | Entities, normalized store shape, what's server vs client vs URL state |
| 22–30 | Interface | API endpoints/events with payloads, pagination, error shapes; key component APIs |
| 30–42 | Deep dives | The 2–3 hardest parts (real-time consistency, virtualization, offline sync…) |
| 42–45 | Wrap-up | Trade-offs, what you'd do with more time, how you'd measure success |

### Questions that make you look senior

- "What devices and network conditions? Is SEO important? Logged-in only?"
- "What's the read/write ratio and the update frequency?" (drives caching and real-time choices)
- "How fresh must data be? Can two users edit the same thing?" (consistency model)
- "What are the success metrics?" (LCP for landing, INP for editors, conversion, task completion)

### Checklist for the optimization stage

- **Performance**: rendering strategy (SSR/SSG/CSR/RSC), code splitting, caching layers, virtualization, image strategy, prefetching.
- **Reliability**: retries with backoff, partial failure UI, offline behavior, idempotency, optimistic updates and rollback.
- **Accessibility**: keyboard model, focus management, live regions, semantics of custom widgets.
- **Security**: XSS (user content), CSRF/auth model, permissions in UI vs server.
- **Observability**: RUM, error tracking, product analytics, feature flags.
- **i18n**: RTL, pluralization, date/number formatting, text expansion.

### Mistakes interviewers see

- Jumping into component code without requirements.
- Designing the backend in detail (unless asked) instead of client architecture.
- Listing technologies without explaining why ("Redux, GraphQL, Kafka").
- Ignoring failure modes and accessibility.

### References

- [GreatFrontEnd: Front end system design guide](https://www.greatfrontend.com/front-end-system-design-playbook)
- [web.dev: Rendering on the web](https://web.dev/articles/rendering-on-the-web)

## Design a news feed (Twitter/LinkedIn-style): rendering, pagination, real-time inserts and media
<!--
id: design-news-feed
level: lead
tags: system design, news feed, pagination, real-time, virtualization, optimistic ui
minutes: 30
-->

> [!PROMPT]
> Design the frontend of a news feed like Twitter or LinkedIn: infinite scrolling, new-post indicators, likes, comments, images and video, for web and mobile.
>
> **Cover**
> - Rendering (SSR for first page), pagination, a normalized client cache and optimistic updates.
> - Real-time inserts without scroll jumps, virtualization, media loading and autoplay.
> - Performance, accessibility, error handling and metrics; what you'd build first.

> [!TLDR]
> Server-render the first page of the feed for fast LCP, then hydrate and continue with cursor-based infinite loading. Keep posts in a normalized client cache (post, author, media entities) so likes/edits update everywhere. Deliver new posts through SSE/WebSocket or polling as a "N new posts" pill instead of inserting above the reader. Virtualize with variable heights, lazy-load media with reserved aspect ratios, make reactions optimistic with rollback, and measure scroll performance and engagement.

### Requirements

- Functional: view feed, infinite scroll, create post (text + images), like/comment, see new posts, open post detail.
- Non-functional: fast first paint on mobile, smooth scrolling (INP, no jank), works on flaky networks, accessible, scale to millions of users (backend), feed personalized (ranking server-side).

### Architecture

```text
┌──────────────── Browser ────────────────┐       ┌──────── Edge/Server ────────┐
│ FeedPage                                 │       │ SSR/streaming (first page)  │
│  ├─ Composer (optimistic create)         │◀─────▶│ BFF / GraphQL               │
│  ├─ NewPostsPill  ◀── SSE "new_posts"    │       │  /feed?cursor=…             │
│  ├─ VirtualFeed (variable heights)       │       │  /posts (create)            │
│  │    └─ PostCard (memoized)             │       │  /posts/:id/like            │
│  └─ Query cache (normalized entities)    │       │ Media CDN (resized/AVIF)    │
└──────────────────────────────────────────┘       └─────────────────────────────┘
```

### Data model (client)

```ts
interface Post {
  id: string;
  authorId: string;
  createdAt: string;
  text: string;
  media: { id: string; url: string; width: number; height: number; alt: string }[];
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
}

interface FeedPage {
  postIds: string[];
  nextCursor: string | null;
}

// Normalized cache
interface FeedState {
  posts: Record<string, Post>;
  users: Record<string, { id: string; name: string; avatarUrl: string }>;
  feed: { pages: FeedPage[]; pendingNewIds: string[] };
}
```

### API

```http
GET /api/feed?cursor=eyJ0IjoxNz…&limit=20
→ 200 { "posts": [...], "users": [...], "nextCursor": "…" }

POST /api/posts  (Idempotency-Key: <uuid>)
→ 201 { "post": {...} }

POST /api/posts/:id/like     DELETE /api/posts/:id/like
→ 200 { "likeCount": 42, "likedByMe": true }

GET /api/feed/stream  (text/event-stream)
event: new_posts
data: { "count": 3, "newestCursor": "…" }
```

### Deep dives

**New posts without layout jumps.** Never insert above the viewport while the user reads. Accumulate in `pendingNewIds`, show a pill ("3 new posts"); on click, prepend and scroll to top. If the user is already at the top, insert with an animation.

**Virtualization with variable heights.** Posts vary (text length, images). Use estimated heights, measure on render, and anchor scroll when heights change above the viewport. Reserve image space with `aspect-ratio` from known dimensions so measurement is stable.

**Optimistic like with races.**

```ts
function toggleLike(post: Post) {
  const previous = { likeCount: post.likeCount, likedByMe: post.likedByMe };
  updatePost(post.id, { likedByMe: !post.likedByMe, likeCount: post.likeCount + (post.likedByMe ? -1 : 1) });
  const request = post.likedByMe ? api.unlike(post.id) : api.like(post.id);
  request
    .then((server) => updatePost(post.id, server)) // reconcile with the server's truth
    .catch(() => {
      updatePost(post.id, previous);
      toast('Could not update like');
    });
}
```

Rapid double taps can interleave; serialize per post (queue the latest intent) or send the desired state (`PUT /like { liked: true }`) instead of toggles, which is idempotent.

**Media.** CDN-resized images by viewport (`srcset`), AVIF/WebP, lazy below the fold, blur-up placeholders, video posters with `preload="none"`. Upload images directly to storage via presigned URLs, show progress, and post only after upload completes.

### Performance and accessibility

- SSR first page; stream; hydrate selectively.
- Prefetch next page at ~2 screens from the end.
- `role="feed"` with `article` items, `aria-setsize`/`aria-posinset`, keyboard shortcuts (j/k) optional, focus management when new posts are revealed.
- Memory cap: drop far-away pages or virtualize aggressively for long sessions.

### Observability

Track feed load time (server and client), scroll jank (long animation frames), engagement events, error rates on like/post, and SSE connection health.

### References

- [WAI-ARIA APG: Feed pattern](https://www.w3.org/WAI/ARIA/apg/patterns/feed/)
- [TanStack Query: Optimistic updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)

## Design an e-commerce product page: SSR/streaming, caching, SEO, personalization and Core Web Vitals
<!--
id: design-ecommerce-pdp
level: lead
tags: system design, e-commerce, ssr, streaming, caching, seo, core web vitals
minutes: 25
-->

> [!PROMPT]
> Design a product detail page for a high-traffic store: SEO-critical, personalized pricing and stock, heavy images, and a strict LCP target.
>
> **Cover**
> - Splitting the page by cacheability: static content, per-user data and real-time stock.
> - Rendering strategy (SSG/ISR/streaming), image pipeline, caching and CDN design.
> - SEO (structured data), personalization without layout shift, A/B testing, and Core Web Vitals budgets.

> [!TLDR]
> Split the page by **cacheability**: product content (title, images, description, specs) is the same for everyone and can be statically generated or cached at the edge with revalidation; price, stock and promotions change often and are fetched fresh or streamed; personalization (recommendations, "you viewed", cart) is per user and loaded client-side or streamed after the shell. Optimize LCP around the hero image, keep the add-to-cart island small and fast, emit structured data for SEO, and make the page resilient: recommendations failing must never break buying.

### Requirements

- Functional: gallery, variants (size/color), price and availability, add to cart, reviews, recommendations, breadcrumbs, shareable variant URLs.
- Non-functional: LCP < 2.5s on mid-range mobile, SEO-indexable, high traffic spikes (sales), A/B testing, multi-region, accessible, localized prices.

### Rendering plan

| Region | Freshness | Strategy |
| --- | --- | --- |
| Product content, images | Hours | SSG/ISR or edge cache with tag-based revalidation |
| Price, stock | Seconds–minutes | Server fetch at request time, streamed; or client fetch with skeleton |
| Add to cart | Interactive | Small client island |
| Reviews | Minutes | Streamed behind Suspense; paginated |
| Recommendations, recently viewed | Per user | Client-side or streamed late; lazy below the fold |

```text
Request → CDN (cached HTML shell + product content, keyed by product+locale)
        → stream price/stock (fast service), then reviews, then recs
        → hydrate only interactive islands (variant picker, add to cart, gallery)
```

### Variant state in the URL

`/p/trail-shoe-123?color=blue&size=42`: shareable, back-button friendly, SEO-canonical (`<link rel="canonical">` to the base product), and drives server rendering of the right image and price.

### SEO

- Server-rendered HTML with real content.
- `Product` structured data (JSON-LD: name, image, offers.price, availability, aggregateRating).
- Clean URLs, canonical tags, `hreflang` for locales, fast and stable pages (CWV is a ranking signal).

### Performance specifics

- Hero image: correct `sizes`, AVIF/WebP, `fetchpriority="high"`, not lazy; preload if it's a CSS background.
- Gallery: load other images lazily; keep thumbnails small.
- Third-party scripts (reviews widget, chat, analytics, A/B testing) deferred; A/B variants decided at the edge to avoid flicker scripts that block render.
- Font subsetting and fallback metrics for no CLS.

### Resilience

Each region has its own error boundary and fallback. If inventory is down, show "Check availability in cart" rather than a broken page; if recommendations fail, render nothing. Cart writes are idempotent with retry.

### Caching and invalidation

Tag cache entries by product id; when the catalog changes a product, purge by tag. Prices with short TTL or no cache; never cache personalized fragments in shared caches (`Cache-Control: private`).

### References

- [web.dev: Rendering on the web](https://web.dev/articles/rendering-on-the-web)
- [Google Search Central: Product structured data](https://developers.google.com/search/docs/appearance/structured-data/product)
- [Next.js: Incremental Static Regeneration](https://nextjs.org/docs/app/guides/incremental-static-regeneration)

## Design a real-time analytics dashboard (Datadog/Grafana-like): data flow, charts and backpressure
<!--
id: design-realtime-dashboard
level: lead
tags: system design, dashboards, real-time, websockets, charts, performance
minutes: 30
-->

> [!PROMPT]
> Design a real-time analytics dashboard (like Datadog): dozens of widgets, each with a time range, auto-refresh and live updates, used on large screens for hours.
>
> **Cover**
> - Data flow: a query layer with deduping, polling versus WebSocket/SSE, and backpressure when data arrives faster than you can render.
> - Chart rendering (SVG versus canvas), downsampling, and memory over long sessions.
> - Time range sync, error and stale-data states, and accessibility of charts.

> [!TLDR]
> A dashboard is a grid of independent widgets, each with a query, a time range and a refresh policy. Centralize data fetching in a query layer that dedupes identical queries, batches requests, and pauses when the tab is hidden. Stream live updates over WebSocket/SSE, but **buffer and coalesce** them: apply at most once per animation frame (or per second), downsample to the pixel width of the chart, and render large series with canvas/WebGL. Isolate widget failures, keep the time range in the URL, and handle clock and timezone correctly.

### Requirements

- Widgets: time series, top-N tables, single stats, heatmaps; 10–40 per dashboard.
- Time ranges (last 15m, custom), auto-refresh, live tail mode, cross-widget hover sync, drill-down.
- Scale: some series have thousands of points per widget; updates every second in live mode.
- NFRs: smooth interaction (no frozen UI while data arrives), works for hours (no leaks), shareable state.

### Architecture

```text
URL state (dashboardId, from, to, vars) ──▶ DashboardStore
                                               │
Widget[] ──(query spec)──▶ QueryScheduler ──▶ /api/query (batched)   live: WebSocket
                              │  dedupe identical specs                 │
                              │  pause when hidden                      ▼
                              │  concurrency limit              StreamBuffer (per series)
                              ▼                                     │ coalesce per frame
                         Result cache (by spec hash + range)        ▼
                              │                                Downsampler (LTTB/min-max per pixel)
                              ▼                                     │
                         Chart renderer (canvas/WebGL, uPlot/ECharts) ◀┘
```

### Key decisions

**Time range as the source of truth.** `?from=now-1h&to=now&tz=UTC` in the URL; "now"-relative ranges are resolved at query time. Every widget shares it (with optional per-widget overrides).

**Backpressure.** If the server pushes faster than you can render, don't render every message:

```ts
class FrameCoalescer<T> {
  #pending: T[] = [];
  #scheduled = false;
  readonly #flush: (batch: T[]) => void;

  constructor(flush: (batch: T[]) => void) {
    this.#flush = flush;
  }

  push(item: T) {
    this.#pending.push(item);
    if (this.#scheduled) return;
    this.#scheduled = true;
    requestAnimationFrame(() => {
      this.#scheduled = false;
      const batch = this.#pending;
      this.#pending = [];
      this.#flush(batch); // one state update per frame, not per message
    });
  }
}
```

When hidden, rAF stops: buffer with a cap (drop oldest or switch to "refetch range on return").

**Downsampling.** A 600px-wide chart can't show 50,000 points. Downsample server-side (preferred) or in a worker with min/max per pixel bucket (preserves spikes) or LTTB.

**Rendering.** SVG is fine for hundreds of points; canvas for tens of thousands; WebGL beyond. Keep chart instances mounted and update data in place instead of re-creating them on each tick.

**Isolation.** Each widget has its own error/loading state, timeout and retry; one slow query doesn't block the others. Cap concurrent queries per dashboard.

**Long sessions.** Ring buffers per series (bounded memory), unsubscribe on unmount, pause polling when hidden (`visibilitychange`), resume with a range refetch.

### Interaction details

- Crosshair sync across charts via a lightweight shared store (not React context re-rendering every widget on mouse move; use a subscription per chart).
- Brushing a chart updates the URL time range; back button returns.
- Accessible: data tables as alternatives to charts, keyboard-reachable tooltips/legends, sufficient color contrast and non-color encodings.

### References

- [uPlot (fast time-series charts)](https://github.com/leeoniya/uPlot)
- [Downsampling with LTTB (Sveinn Steinarsson)](https://skemman.is/bitstream/1946/15343/3/SS_MSthesis.pdf)
- [MDN: WebSockets API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)

## Design a spreadsheet (Google Sheets lite): grid virtualization, formulas and collaboration
<!--
id: design-spreadsheet
level: principal
tags: system design, spreadsheet, virtualization, dependency graph, collaboration, canvas
minutes: 35
-->

> [!PROMPT]
> Design a lightweight spreadsheet (Google Sheets lite) in the browser supporting 1 million rows, formulas with dependencies, copy/paste and shared editing.
>
> **Cover**
> - Data model (sparse cells), a virtualized 2D grid, DOM versus canvas rendering.
> - The formula engine: parsing, a dependency graph, recalculation order, cycle detection.
> - Collaboration and conflict handling, undo/redo, and performance targets.

> [!TLDR]
> Model the sheet as a **sparse** map of cells (`"B7" → { raw, value, format }`), render with a 2D-virtualized grid (DOM for modest sizes, canvas for very large sheets plus an overlay for editing and accessibility), and evaluate formulas with a parser → AST → **dependency graph**; on edit, recompute only dependents in topological order and detect cycles. Keep the UI responsive by running recalculation in a Web Worker for large sheets. Collaboration uses operations on cells (or a CRDT) with server ordering, presence cursors, and per-user undo.

### Requirements

- Grid up to 100k rows × 1k columns (mostly empty), select, edit, copy/paste, fill handle, resize rows/columns, freeze panes.
- Formulas: `=SUM(A1:A10)`, references, ranges, cross-sheet refs; errors (`#REF!`, `#DIV/0!`, `#CYCLE!`).
- Multiple users editing simultaneously; undo/redo per user.

### Data model

```ts
type CellId = string; // "A1"; or numeric row/col keys for speed

interface Cell {
  raw: string;                      // what the user typed: "42", "hello", "=A1*2"
  value: number | string | boolean | CellError | null;
  formula?: FormulaAst;
  format?: { numberFormat?: string; bold?: boolean; align?: 'left' | 'right' | 'center' };
}

interface Sheet {
  cells: Map<CellId, Cell>;          // sparse
  rowHeights: Map<number, number>;   // only overrides
  colWidths: Map<number, number>;
  dependents: Map<CellId, Set<CellId>>; // B1 → {C1, D4}: who depends on me
  precedents: Map<CellId, Set<CellId>>; // C1 → {B1}
}
```

### Recalculation

```ts
function recalc(sheet: Sheet, changed: CellId): void {
  const order = topologicalDependents(sheet, changed); // DFS over dependents; throws on cycle
  for (const id of order) {
    const cell = sheet.cells.get(id);
    if (cell?.formula) cell.value = evaluate(cell.formula, (ref) => sheet.cells.get(ref)?.value ?? null);
  }
}
```

- Parse once on edit; store the AST and its references; update `precedents/dependents` edges.
- Topological order prevents double computation; a visited-in-progress set detects cycles (mark those cells `#CYCLE!`).
- Range references (`A1:A10000`) should be stored as ranges, not 10,000 edges; index ranges with an interval structure.
- Volatile functions (`NOW()`, `RAND()`) recompute on every change/tick.
- For big sheets, run parse/recalc in a worker and send back changed values in batches.

### Rendering

- Two-axis virtualization: compute visible row/col ranges from prefix sums of sizes (most rows default height, so store overrides only).
- Canvas rendering (like Google Sheets) handles huge grids smoothly; overlay a positioned `<textarea>` for editing, and maintain an accessible representation (focused cell announced via live region/`aria-activedescendant` in a `role="grid"` DOM shadow for the visible window).
- Frozen rows/columns as separate panes sharing scroll positions.

### Collaboration

- Operations: `setCell(id, raw)`, `insertRows(at, n)`, `deleteCols(...)`. Structural operations shift references: formulas referencing moved cells must be rewritten (OT-style transformation of references).
- Server assigns a total order; clients apply local ops optimistically and rebase on server order.
- Presence: each user's selection broadcast via WebSocket, rendered as colored borders.
- Undo: per-user stack of inverse operations, transformed against later remote ops.

### Clipboard

Copy as TSV + HTML table for interoperability with Excel; paste parses TSV/HTML; large pastes become one batched operation (and one undo step).

### References

- [WAI-ARIA APG: Grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/)
- [Topological sorting](https://en.wikipedia.org/wiki/Topological_sorting)

## Design a collaborative document editor: OT vs CRDT, presence, offline and undo
<!--
id: design-collaborative-editor
level: principal
tags: system design, collaboration, crdt, operational transformation, yjs, presence, offline
minutes: 30
-->

> [!PROMPT]
> Design the frontend of a collaborative document editor (like Google Docs) with live cursors, offline editing and per-user undo.
>
> **Cover**
> - The editor model (ProseMirror/Lexical/Tiptap versus `contenteditable`) and document schema.
> - Concurrency: OT versus CRDT trade-offs, presence, and syncing over WebSocket with reconnection.
> - Offline edits, history/undo semantics in a collaborative context, and what you'd measure.

> [!TLDR]
> Use a structured editor model (ProseMirror/Lexical/Tiptap), not `contenteditable` HTML. For concurrency, choose **OT** (central server transforms operations; Google Docs) or a **CRDT** (operations commute, merge anywhere, great for offline and peer-to-peer; Yjs/Automerge). For most teams today, Yjs + a sync server + IndexedDB persistence is the pragmatic choice. Presence (cursors, selections) travels on an ephemeral channel. Undo must be **per user** and only revert your own operations. Plan for document size growth (GC/snapshots), permissions, comments anchored to positions, and versions.

### Requirements

- Rich text (headings, lists, links, images), real-time co-editing with <200ms perceived latency, presence cursors, comments, version history, offline edits that merge on reconnect, permissions (view/comment/edit).

### OT vs CRDT

| | OT | CRDT (e.g. Yjs) |
| --- | --- | --- |
| Needs central server ordering | Yes | No (server is just a relay/persistence) |
| Offline/long divergence | Harder | Natural |
| Metadata overhead | Low | Higher (tombstones, ids), mitigated by GC/encoding |
| Implementation complexity | Transform functions per op pair | Use a library; custom types are hard |
| Examples | Google Docs, ShareDB | Figma-like systems, Linear sync ideas, Yjs/Automerge apps |

### Architecture with Yjs

```text
Editor (ProseMirror) ⇄ y-prosemirror binding ⇄ Y.Doc (CRDT state)
                                            ├─ y-indexeddb   (local persistence, offline)
                                            ├─ provider (WebSocket) ⇄ Sync server ⇄ Storage (snapshots + updates)
                                            └─ awareness      (presence: cursor, name, color; ephemeral)
```

```ts
const doc = new Y.Doc();
const persistence = new IndexeddbPersistence(`doc:${docId}`, doc);      // instant load, offline
const provider = new WebsocketProvider(SYNC_URL, docId, doc, { params: { token } });
provider.awareness.setLocalStateField('user', { name: me.name, color: me.color });

const undo = new Y.UndoManager(doc.getXmlFragment('content'), {
  trackedOrigins: new Set([ySyncPluginKey]), // only my local edits are undoable
  captureTimeout: 500,                         // coalesce typing
});
```

### Deep dives

- **Permissions**: the sync server authenticates the WebSocket and enforces read-only by rejecting updates from viewers. Never trust the client.
- **Comments**: anchor to relative positions (`Y.RelativePosition`) so they survive concurrent edits; store comment threads separately.
- **Versions**: periodic snapshots (encoded state) with author/time; restoring creates new operations (doesn't rewrite history).
- **Large docs**: lazy-load sub-documents, compact update logs into snapshots server-side, GC deleted content when safe.
- **Presence at scale**: throttle cursor updates (~20/s), hide idle users, cap rendered cursors.
- **Conflicts users can see**: concurrent formatting/deletes are merged deterministically but may surprise; show who changed what (attribution) and rely on undo.

### Failure modes

Reconnect with backoff and resync state vectors (only missing updates are exchanged); show "Offline, changes saved locally"; warn before closing if local updates aren't persisted anywhere.

### References

- [Yjs documentation](https://docs.yjs.dev/)
- [Ink & Switch: Local-first software](https://www.inkandswitch.com/local-first/)
- [crdt.tech](https://crdt.tech/)
- [Figma: How multiplayer works](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)

## Design an offline-first app: local database, sync queue, conflicts and service worker
<!--
id: design-offline-first
level: lead
tags: system design, offline-first, sync, indexeddb, conflicts, service worker, pwa
minutes: 25
-->

> [!PROMPT]
> Design an offline-first field-service app: technicians fill forms and attach photos with no connectivity, then sync when back online, possibly editing the same record as the office.
>
> **Cover**
> - Local database as the source of truth, a write queue and background sync.
> - Conflict detection and resolution policies, idempotent sync, and partial failures.
> - Service worker and storage limits, data migration, and how you show sync state to users.

> [!TLDR]
> Treat the **local database** (IndexedDB, or SQLite in OPFS) as the app's source of truth for the UI; the network becomes a sync channel. Writes go to the local DB and an **outbox** of operations with idempotency keys; a sync engine pushes the outbox when online and pulls server changes since a cursor. Resolve conflicts with a policy chosen per entity (last-writer-wins per field, server wins, merge, or ask the user). A service worker caches the app shell so it launches offline. Communicate sync state clearly.

### Requirements (example: field-inspection app)

- Create/edit inspections with photos while offline for hours; sync later.
- Multiple devices per user; occasionally two people edit the same record.
- Must never lose data; must show what's pending.

### Architecture

```text
UI ⇄ Local DB (IndexedDB/SQLite-OPFS) ── live queries (re-render on change)
        ▲            │
        │            ▼
   Pull changes   Outbox (ops: {opId, entity, id, patch, baseVersion})
        ▲            │  push when online, in order, with retries + backoff
        └──── Sync engine ⇄ /sync API (push ops, pull since cursor)
Service worker: precache app shell + assets; background sync where supported
```

### Operation format

```ts
interface Op {
  opId: string;            // UUID: idempotency key, server dedupes retries
  entity: 'inspection' | 'photo';
  id: string;              // client-generated UUID so offline-created records have stable ids
  kind: 'create' | 'update' | 'delete';
  patch?: Record<string, unknown>;
  baseVersion: number | null; // version the client edited from (for conflict detection)
  at: number;
}
```

### Conflict strategies

| Data | Strategy |
| --- | --- |
| Independent fields (title, notes) | Field-level last-writer-wins (by server receive order or hybrid logical clock) |
| Counters/sets | Merge (CRDT-like: grow-only sets, PN-counters) |
| Critical values (approval status) | Server wins; client shows the conflict |
| Rich text | CRDT (Yjs) |
| Rare true conflicts | Keep both versions, ask the user |

### Sync engine essentials

- Push the outbox **in order** per entity; a failed op blocks later ops for the same entity, not everything.
- Retries with backoff on network/5xx; on 4xx validation errors, move the op to a "needs attention" list and show it.
- Pull with a server cursor (change log), apply in a transaction, then re-apply local pending ops on top (rebase).
- Photos: store blobs in IndexedDB/OPFS, upload in chunks, reference by id; handle quota (`navigator.storage.estimate()`, `persist()`).
- Leader election across tabs (Web Locks) so only one tab syncs.

### UX

Clear states: "All changes synced", "3 changes waiting to sync", "Offline: changes are saved on this device". Never block editing on the network. Show conflicts inline with a resolution choice.

### References

- [Ink & Switch: Local-first software](https://www.inkandswitch.com/local-first/)
- [web.dev: Offline cookbook](https://web.dev/articles/offline-cookbook)
- [MDN: Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)

## Design search with autocomplete at scale (frontend side): caching, ranking display and latency
<!--
id: design-search-autocomplete
level: senior
tags: system design, search, autocomplete, caching, latency, accessibility
minutes: 20
-->

> [!PROMPT]
> Design the frontend of search with autocomplete for a large e-commerce site: suggestions appear as you type, with recent searches, categories and products, on slow mobile networks.
>
> **Cover**
> - Request strategy: debouncing, cancellation, caching by prefix, prefetching, and failure fallbacks.
> - Ranking and display, highlighting, keyboard and screen reader behavior.
> - Analytics, latency budgets and how you'd test relevance and performance.

> [!TLDR]
> The frontend's job is to make suggestions feel instant and correct: debounce lightly (or not at all with fast backends), cancel stale requests, cache by normalized prefix (in memory with LRU, optionally IndexedDB for popular prefixes), prefetch likely next prefixes, render results without layout shift, and implement the combobox pattern accessibly. Keep the search state in the URL for results pages, log queries and clicks for ranking, and degrade gracefully when the suggestion service is slow.

### Requirements

- Suggestions after 1–2 characters, < 100ms perceived latency, keyboard navigation, recent searches, categories (products, people, help articles), highlight matches, mobile friendly.

### Client architecture

```text
Input ── normalize(q) ──▶ SuggestCache (LRU by prefix) ──hit──▶ render
                │                     │ miss
                │                     ▼
                │              Request manager: debounce 0–150ms, abort previous, dedupe in-flight
                │                     ▼
                │              /suggest?q=…&locale=…  (CDN-cacheable for anonymous users)
                ▼
          Recent searches (localStorage, max 10, user can clear)
```

### Latency techniques

- **Prefix reuse**: if results for "reac" are complete (server says `exhaustive: true`), filter them locally for "react" instead of a new request.
- **CDN caching** for anonymous prefix queries with short TTL; personalize by merging client-side.
- **Connection warmup**: `preconnect` to the search origin on page load or input focus.
- **Keep previous results** visible while loading the next; avoid spinner flicker (show only after ~200ms).

### Rendering

- Group by category with headings (`role="group"` within the listbox), highlight matched spans safely (no `innerHTML` from the server).
- Fixed row heights to avoid layout shift while results change.
- Screen reader: announce count after results settle (polite live region), `aria-activedescendant` for the highlighted option.

### Analytics and ranking feedback

Log (sampled, privacy-aware) query, position clicked, time to click, and abandonment. The client should send which suggestion version was shown so ranking experiments are measurable.

### Failure modes

Timeout suggestions (e.g. 800ms) and fall back to recent searches; never block the user from pressing Enter for a full search.

### References

- [WAI-ARIA APG: Combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
- [Nielsen Norman Group: Site search suggestions](https://www.nngroup.com/articles/site-search-suggestions/)

## Component-level design for a small UI: structure, state, data flow and API for a comments section
<!--
id: design-comments-section-basics
level: junior
tags: system design, component design, state, api, comments, optimistic ui, fundamentals
minutes: 20
-->

> [!PROMPT]
> Design a comments section under a blog post: list comments, add a comment, delete your own. Describe the component tree, state, API calls and what happens while loading, on failure and with many comments.

> [!TLDR]
> Break the UI into `CommentSection` (owns data fetching and the list state), `CommentList`, `CommentItem` and `CommentForm`. Fetch comments with a paginated endpoint (`GET /posts/:id/comments?cursor=`), keep server data in a query cache, and handle loading, empty, error and retry states explicitly. Post with `POST` and update the list optimistically (rolling back on failure), disable the submit button while sending, and show server-side validation errors. Delete with an authorization check on the server. Paginate or load more instead of rendering thousands of items, and sanitize or escape comment text.

### Component and data flow

```
CommentSection (fetch, mutations)
 ├─ CommentForm (local input state, submit)
 └─ CommentList
     └─ CommentItem (author, time, delete button if own)
```

### API

| Call | Notes |
| --- | --- |
| `GET /posts/:id/comments?cursor=&limit=20` | Cursor pagination, newest first |
| `POST /posts/:id/comments` | Body `{ text }`; returns created comment |
| `DELETE /comments/:id` | Server checks ownership |

### States to design

- **Loading:** skeleton rows. **Empty:** "Be the first to comment". **Error:** message with a retry button.
- **Submitting:** disabled button; keep text if it fails.
- **Optimistic add:** insert a pending item with a temporary id, replace it on success, remove it and restore the text on failure.
- **Many comments:** "Load more" or infinite scroll; consider virtualization beyond a few hundred rows.

### Security and quality

Escape text (React does by default; sanitize if you allow Markdown); rate limit posting; show relative times with a tooltip for the exact time; accessible form labels and focus management after posting.

### Follow-ups

"How would you add replies?" (a `parentId`, nested rendering with a depth limit) and "real-time updates?" (polling, SSE or WebSocket with de-duplication by id).

## Design a notification and toast system: queueing, stacking, accessibility and cross-tab behavior
<!--
id: design-notification-toast-system
level: senior
tags: system design, notifications, toast, queue, accessibility, live region, cross tab
minutes: 30
-->

> [!PROMPT]
> Design an app-wide notification system with transient toasts, persistent banners and an in-app notification center. Any part of the app can trigger a notification; the system handles priority, stacking, dismissal, timers and accessibility.
>
> **Requirements**
> - Imperative API: `notify({ type, message, action })`.
> - Max three visible; others queue; priorities can jump the queue.
> - Pauses timers on hover or focus; screen-reader friendly.

> [!TLDR]
> Create a small store outside React (a queue with `subscribe`, `notify`, `dismiss`) and a single `<Notifications />` host rendered once near the root, so any module can trigger a notification without props or context drilling. Each item has an id, type, priority, duration and optional action; the host renders at most N visible items, queues the rest, and sorts by priority and time. Use a polite live region for normal toasts and an assertive one for errors, pause auto-dismiss on hover and focus, never auto-dismiss messages with required actions, respect reduced motion, and deduplicate repeats by key. For the center, persist read state and sync across tabs with `BroadcastChannel`.

### API and store

```ts
type Notice = { id: string; type: 'info' | 'success' | 'error'; message: string;
                priority?: number; duration?: number | null; action?: { label: string; run(): void } };

const store = createStore<Notice[]>([]);
export const notify = (n: Omit<Notice, 'id'> & { key?: string }) => { /* dedupe by key, push, schedule */ };
export const dismiss = (id: string) => { /* remove and promote next from queue */ };
```

### Behavior details

- **Queue and stacking:** visible = first N after sorting by priority then arrival; promoting from the queue on dismissal.
- **Timers:** per-toast timers that pause on `pointerenter` or `focusin`, resume with the remaining time.
- **Deduplication:** a `key` collapses repeated errors ("Network error" x3) into one with a counter.
- **Persistence:** banners (for example "offline") stay until the condition clears; toasts auto-dismiss in 4-8 seconds unless they contain an action.

### Accessibility

- A single live region container (`aria-live="polite"`, `role="status"`), and `role="alert"` for errors.
- Do not move focus to toasts; provide a keyboard shortcut or an always-available notification center to review missed messages.
- Sufficient time: users must be able to pause or extend; avoid timers shorter than a few seconds for text.

### Cross-tab and scale

`BroadcastChannel` to sync read or dismissed state; avoid duplicate toasts for the same server event by including an event id; for push notifications, use a service worker and a separate permission flow.

### Pitfalls

Rendering toasts inside a transformed parent (stacking context bugs; use a portal), storing JSX in the store (store data, render in the host), and unbounded queues during error storms.

## Design the frontend of a video streaming site (YouTube-style): feed, player, streaming and caching
<!--
id: design-video-streaming-frontend
level: lead
tags: system design, video, streaming, hls, dash, adaptive bitrate, performance, caching, infinite scroll
minutes: 28
-->

> [!PROMPT]
> Design the web frontend for a YouTube-style video platform: a home feed, a watch page with the player, recommendations and comments, and search. It must start playback quickly on slow networks and scale to millions of viewers.
>
> **Cover**
> - Requirements and the key rendering decisions.
> - How video is delivered and played.
> - The feed, watch page and comments.
> - Performance, caching and resilience.

> [!TLDR]
> Split the problem into the page shell, the data, and the media. Render the shell and above-the-fold content on the server (or edge) for fast first paint and SEO, hydrate the player and comments lazily, and virtualize long feeds. Video is not one file: the backend packages it as short segments in several bitrates (HLS or MPEG-DASH), and the player uses adaptive bitrate (ABR) to switch quality with network conditions, fetching segments from a CDN. Start fast with a low-bitrate first segment, a poster image, and preloading only metadata; protect the main thread, handle errors and resume, and measure startup time, rebuffering ratio and INP.

### Requirements to clarify

- Functional: browse a personalized feed, search, watch, like, comment, resume where you left off.
- Non-functional: fast startup (time to first frame), few stalls, works on slow mobile networks, accessible (captions, keyboard controls), SEO for watch pages.

### Page architecture

- **Home feed:** server-rendered first screen of cards (thumbnail, title, channel, duration), then infinite scroll with cursor pagination. Virtualize rows, size thumbnails with `srcset` and reserved aspect ratio to avoid layout shift, and lazy-load below the fold.
- **Watch page:** SSR the title, metadata and structured data for SEO. The player is the LCP candidate on this page, so give it priority; load comments, recommendations and secondary widgets after the player is ready or when scrolled into view.
- **Navigation:** prefetch the watch data on hover or intent; keep the player alive across route changes for a mini-player or picture-in-picture.

### Video delivery and playback

- The backend transcodes into multiple resolutions and bitrates and cuts each into a few seconds of segments, described by a manifest (HLS `.m3u8` or DASH `.mpd`).
- The player (Media Source Extensions via a library such as hls.js or Shaka Player, or native HLS on Safari) downloads the manifest, then segments from a CDN edge.
- **Adaptive bitrate:** it measures throughput and buffer level and chooses the quality per segment; start low for a quick first frame, then step up.
- **Startup tuning:** poster image shown immediately, `preload="metadata"`, small first segments, connection warm-up with `preconnect` to the CDN, no autoplay on cellular unless allowed.
- **Controls and accessibility:** captions (WebVTT), keyboard shortcuts, `aria` labels, reduced-motion respect.

```tsx
// Sketch: load the player code only when it is needed
const Player = lazy(() => import('./Player'));

function Watch({ video }: { video: Video }) {
  return (
    <>
      <img src={video.poster} width={1280} height={720} alt="" />   {/* instant visual while the player loads */}
      <Suspense fallback={null}><Player manifestUrl={video.manifestUrl} /></Suspense>
    </>
  );
}
```

### Comments and recommendations

Paginate comments by cursor, load replies on demand, optimistic UI for posting with rollback, and sanitize rendered text. Recommendations are a separate request so a slow service never blocks playback.

### Caching and resilience

- CDN caches segments and static assets (long `Cache-Control` with content-hashed names); API responses use short caches or `stale-while-revalidate` for feeds.
- Save playback position periodically (debounced) and resume from it.
- On network errors the player retries with backoff and can drop quality; show a clear error with a retry.
- Use a service worker only for app shell and images, not for video segments.

### Metrics to watch

Time to first frame, rebuffer ratio, average bitrate, playback failure rate, LCP and INP on the watch page. Report them from the client (RUM) and alert on regressions.

### Pitfalls

Treating video as a single large file; autoplaying several previews at once on the feed; shipping the whole player and comments in the first bundle; layout shifts from thumbnails without reserved size.

## Design a real-time notification system for a web app: delivery, badges and reliability
<!--
id: design-realtime-notifications
level: senior
tags: system design, notifications, websocket, sse, polling, real-time, service worker, web push, reliability
minutes: 22
-->

> [!PROMPT]
> Design the frontend (and the contract with the backend) for real-time notifications in a web app: a bell icon with an unread count, a dropdown list, live updates while the tab is open, and push notifications when it is closed.
>
> **Cover**
> - How updates get to the client: WebSocket, Server-Sent Events, polling.
> - Data model, unread counts and read state.
> - Multi-tab, offline and reconnect behavior.
> - Web push, accessibility and performance.

> [!TLDR]
> Separate the notification list (fetched with an ordinary paginated API) from the live channel that tells you something changed. For the live channel, use Server-Sent Events or a WebSocket with automatic reconnect and a "resume from last event id" mechanism; fall back to long or short polling when needed. Keep a small client store with notifications keyed by id (deduplicated), an unread count, and optimistic "mark as read". Share one connection across tabs with a BroadcastChannel or SharedWorker, announce new items accessibly, and use the Push API with a service worker for the closed-tab case. Design for at-least-once delivery, so every message carries an id and handling is idempotent.

### Choosing the transport

| Option | Good for | Trade-offs |
| --- | --- | --- |
| Short polling | Simple, low scale | Wasteful, delayed |
| Long polling | Fallback behind strict proxies | Held connections, more server cost |
| Server-Sent Events | One-way server to client updates; auto-reconnect and `Last-Event-ID` built in | Text only, one direction, per-origin connection limits on HTTP/1.1 |
| WebSocket | Two-way, low latency | You own reconnect, heartbeat and backoff logic; load balancer and sticky-session considerations |

For notifications, SSE is often enough; choose WebSocket when the same channel carries chat or collaboration.

### Client design

```ts
type Notification = { id: string; type: string; text: string; createdAt: string; read: boolean };

// Source of truth on the client
const byId = new Map<string, Notification>();
let unread = 0;

function receive(n: Notification) {
  if (byId.has(n.id)) return;      // dedupe: delivery is at-least-once
  byId.set(n.id, n);
  if (!n.read) unread++;
}
```

- **Initial load:** fetch the latest page and the unread count from the API; subscribe to the live channel afterwards, then reconcile anything missed using the last seen id.
- **Unread count:** the server is the source of truth (it can be large); the client adjusts locally and corrects on refresh.
- **Mark as read:** optimistic update, send in the background, retry on failure; "mark all read" as a single call.
- **Pagination:** cursor-based for older items.
- **Reconnect:** exponential backoff with jitter; on reconnect, request events after the last id so nothing is lost.

### Multi-tab and background behavior

- Keep one live connection per browser, not per tab: elect a leader tab (Web Locks API) or use a SharedWorker, and broadcast to other tabs with `BroadcastChannel`.
- Pause or slow polling when the tab is hidden (`visibilitychange`); refresh on focus.
- **Closed tab:** Web Push (service worker plus Push API and VAPID keys) with the user's permission; ask in context, not on first load. Deep-link the click to the relevant page.

### UX and accessibility

- Bell button with an accessible name including the count (`aria-label="Notifications, 3 unread"`).
- Announce new items politely (`aria-live="polite"` region) without stealing focus; never auto-open the dropdown.
- Group or collapse bursts ("5 people liked your post") and let users mute types.

### Reliability and security

- At-least-once delivery with idempotent handling by id; the server stores notifications so they survive disconnects.
- Authenticate the live channel (cookies or short-lived tokens) and authorize per user; sanitize text before rendering.
- Rate-limit and batch on the server to avoid floods.

### Pitfalls

Opening a connection per tab; no resume after reconnect (silent gaps); trusting the local unread count forever; asking for push permission immediately on page load.

## Design the frontend of a chat application (WhatsApp Web or Slack-style): optimistic sending, ordering, reconnection, unread counts and long histories
<!--
id: design-chat-application
level: senior
tags: system design, chat, websocket, optimistic ui, message ordering, reconnection, offline, accessibility
minutes: 30
-->

> [!PROMPT]
> Design the frontend of a web chat application: a conversation list, a message pane and a composer, with delivery and read state, typing indicators and image sharing, on networks that drop.
>
> **Cover**
> - Transport, reconnection and not losing or duplicating messages.
> - Optimistic sending, ordering and the client data model.
> - Long histories: pagination, scroll behavior and virtualization.
> - Unread counts, receipts, typing and presence, multiple tabs.
> - Accessibility, security, offline behavior and what you would build first.

> [!TLDR]
> Treat the connection as unreliable and the server as the authority on order. Keep normalized conversations and messages in a client store, and deliver events over a WebSocket (with a polling or SSE fallback) that reconnects with exponential backoff and jitter and resumes from the last sequence number it saw, so nothing is lost. Sending is optimistic: show the message at once with a client-generated id and a sending status, reconcile it with the server's echo by that id (the server dedupes on it, so retries are safe), and offer retry on failure. Order messages by the server's per-conversation sequence number, detect gaps, and fetch the missing range. Load history upward in pages, keep the scroll position stable, stick to the bottom only when the user is already there, and virtualize long lists. Track unread with a last-read sequence number, send read receipts when messages are actually visible, throttle ephemeral events such as typing, use one connection per browser rather than per tab, sanitize every message, and announce new messages politely to screen readers.

### Requirements

- **Functional:** one-to-one and group conversations, send and receive text and images, history, unread counts, delivery and read receipts, typing indicator, presence, search later.
- **Non-functional:** messages appear within a second on a good network; no lost, duplicated or misordered messages on a bad one; smooth scrolling in a conversation with thousands of messages; works after a reload and briefly offline; accessible; safe against injected content.

### Architecture

```text
┌────────────────────────── Browser ───────────────────────────┐        ┌──────────── Server ────────────┐
│ ConversationList  (unread badges, last message preview)      │        │ Gateway: auth, fan-out         │
│ MessagePane       (virtualized, scroll anchoring)            │◀──────▶│ Message service: assigns seq,  │
│ Composer          (outbox, attachments, typing events)       │  WS    │   dedupes on clientId          │
│ Connection manager (WebSocket, backoff, heartbeat, resume)   │  +     │ History API (REST, paginated)  │
│ Store             (conversations, messages, lastSeq, outbox) │  REST  │ Media: signed upload + CDN     │
│ IndexedDB         (recent messages, outbox)                  │        │ Push (web push when closed)    │
└──────────────────────────────────────────────────────────────┘        └────────────────────────────────┘
```

### Client data model

```ts
interface Message {
  clientId: string;                 // generated on the device: the idempotency key
  id?: string;                      // assigned by the server
  seq?: number;                     // per-conversation order, assigned by the server
  conversationId: string;
  senderId: string;
  text: string;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  createdAt: number;
}

interface Conversation {
  id: string;
  lastSeq: number;                  // highest contiguous seq we have
  lastReadSeq: number;              // what this user has read (synced across devices)
  unread: number;
}
```

Store messages by conversation and look them up by `clientId` and `id`. Pending messages have no `seq` and sort after confirmed ones.

### Events and API

- **Client to server over the socket:** `send { conversationId, clientId, text }`, `typing { conversationId }`, `read { conversationId, upToSeq }`.
- **Server to client:** `message { id, seq, clientId, ... }` (this is also the echo of our own send), `receipt`, `typing`, `presence`.
- **REST:** `GET /conversations/:id/messages?before=seq&limit=50` for older history, and `?after=seq` to fill gaps after a reconnect.

### Optimistic send, ordering and gaps

```js
const byOrder = (a, b) => (a.seq ?? Infinity) - (b.seq ?? Infinity) || a.createdAt - b.createdAt;

function contiguousSeq(messages) {
  const seqs = messages.filter((m) => m.seq != null).map((m) => m.seq).sort((a, b) => a - b);
  let last = 0;
  for (const s of seqs) {
    if (s === last + 1) last = s;
    else if (s > last + 1) break;
  }
  return last;
}

function withDerived(messages) {
  const sorted = [...messages].sort(byOrder);
  const lastSeq = contiguousSeq(sorted);
  const maxSeq = Math.max(0, ...sorted.map((m) => m.seq ?? 0));
  return { messages: sorted, lastSeq, hasGap: maxSeq > lastSeq };
}

export function chatReducer(state, action) {
  switch (action.type) {
    case 'send': // optimistic: show it now, identified by a client-generated id
      return withDerived([...state.messages, { clientId: action.clientId, text: action.text, status: 'sending', createdAt: action.at }]);
    case 'failed':
      return { ...state, messages: state.messages.map((m) => (m.clientId === action.clientId && m.status === 'sending' ? { ...m, status: 'failed' } : m)) };
    case 'retry':
      return { ...state, messages: state.messages.map((m) => (m.clientId === action.clientId && m.status === 'failed' ? { ...m, status: 'sending' } : m)) };
    case 'receive': // also the server echo of our own message, and resync batches
    case 'resync': {
      const incoming = action.type === 'receive' ? [action.message] : action.messages;
      let messages = state.messages;
      for (const msg of incoming) {
        const i = messages.findIndex((m) => (msg.clientId && m.clientId === msg.clientId) || (m.id && m.id === msg.id));
        messages = i === -1
          ? [...messages, { ...msg, status: 'sent' }]
          : messages.map((m, j) => (j === i ? { ...m, ...msg, status: 'sent' } : m)); // reconcile, never duplicate
      }
      return withDerived(messages);
    }
    default:
      return state;
  }
}
```

When `hasGap` becomes true, request `?after=lastSeq` and dispatch `resync`. The same path handles reconnects, a missed event and a duplicate delivery. Tested cases: the echo replaces the pending message instead of adding a second one, out-of-order arrival sorts by `seq`, a missing `seq` is detected and filled, and a failed message can be retried.

### Deep dives

**Reconnection and resume**
- Reconnect with exponential backoff and jitter (for example, wait a random time up to `min(30 s, 1 s * 2^attempt)`), reset the counter after a stable connection, and reconnect immediately on the browser's `online` event or when the tab becomes visible.
- Send heartbeats (ping and pong) so a half-open connection is detected within seconds; a socket can look open while the network is gone.
- On reconnect, send the last `seq` per active conversation, or fetch `?after=lastSeq` for each, and refresh the conversation list for conversations that changed.
- Fall back to SSE or long polling where WebSockets are blocked.

**Idempotent sending**
- The client generates `clientId` before sending. If no echo arrives (timeout, dropped socket), the outcome is unknown, so retrying with the same `clientId` is safe because the server returns the existing message.
- Keep unsent messages in an outbox (in IndexedDB) so they survive a reload, and replay them in order after reconnecting. Show `failed` with a retry after a bounded time.

**Scroll behavior**
- Load older messages with an `IntersectionObserver` sentinel at the top and keep the visible message in place: after prepending, adjust `scrollTop` by the change in `scrollHeight`, or rely on `overflow-anchor` where supported.
- Stick to the bottom for new messages only if the user was already at the bottom; otherwise show a "N new messages" pill.
- Reserve image dimensions (width and height from the server) to avoid layout shift, and use a blurred placeholder.
- Virtualize with variable heights for very long histories, and make "jump to first unread" work with an unmounted list (scroll by `seq`, not by DOM node).

**Unread counts and receipts**
- Store `lastReadSeq` per conversation on the server; `unread` is `lastSeq - lastReadSeq` for the active user. Send a `read` event (debounced) only when the latest message is visible, the tab is visible and the window is focused.
- Update the badge in the tab title, and keep other tabs in sync with a `BroadcastChannel`.

**Typing and presence**
- Typing events are ephemeral: send at most one every few seconds while the user types, and expire the indicator on the receiver after about 5 seconds without a refresh. Never persist them.
- Presence is coarse (online or last seen) and skipped for very large groups.

**Multiple tabs**
- Opening a socket per tab multiplies load and creates duplicate notifications. Elect a leader tab (Web Locks API or `BroadcastChannel`) to hold the socket and relay events, or use a `SharedWorker` where supported.

**Media**
- Upload directly to storage with a signed URL, with progress and cancel; send the message with the file reference after upload succeeds. Show a local preview immediately.

**Offline**
- Cache recent conversations in IndexedDB for instant open, show a connection banner, queue sends, and sync on reconnect.

### Accessibility

- The message list uses `role="log"` with `aria-live="polite"` and `aria-relevant="additions"`; do not announce history loads or the user's own messages twice.
- A labelled composer, a visible focus ring, keyboard shortcuts for sending and for moving between conversations, timestamps in `<time>` elements, and status text (not only icons) for sent, delivered, read and failed.
- Respect reduced motion for scroll animations, and do not rely on color alone for unread state.

### Security

- Render message bodies as text or run them through a sanitizer; never insert raw HTML. Escape mentions and links, add `rel="noopener noreferrer"` to links, and keep a strict Content Security Policy.
- Fetch link previews on the server (with SSRF protections), never from the browser with the user's cookies.
- End-to-end encryption changes the design (keys, search, multi-device history) and is a separate discussion.

### Performance

- Batch incoming events and render once per animation frame during bursts.
- Memoize message rows, and keep typing and presence state out of the message list so a typing event does not re-render hundreds of messages.
- Subscribe to full detail only for the open conversation, and keep lightweight counters for the others.
- Code-split the emoji picker and the attachment preview.

### Failure modes to name

Duplicate messages after a retry without an idempotency key, silent gaps after a reconnect with no resume, a scroll jump when older messages load, a badge that disagrees across tabs, an unbounded outbox, and a socket per tab.

### Follow-ups

- **Group chats with thousands of members:** do not broadcast typing and presence; paginate member lists; fan-out is the server's problem.
- **Reactions and edits:** optimistic with an idempotent operation id, applied by `seq`.
- **Search:** server-side, with results that jump to a message by `seq`.
- **Threads:** a separate conversation keyed by parent message.
- **What would you build first?** Text messaging with optimistic send, reconnect and resume, then history and unread, then media.

### References

- [MDN: WebSockets API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
- [MDN: Broadcast Channel API](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API)
- [MDN: ARIA log role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/log_role)
- [MDN: Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)

Listed ("Chat Application") among example frontend system design problems in a candidate's interview-loop outline shared online (second-hand; source unverified). The design and reducer tests are my own.

## Design the frontend of a calendar (Google Calendar-style): views, overlapping events, drag to create, time zones and recurring events
<!--
id: design-calendar
level: senior
tags: system design, calendar, time zones, recurring events, drag and drop, layout algorithm, accessibility
minutes: 30
-->

> [!PROMPT]
> Design the frontend of a calendar application with month, week and day views. Users create and edit events by dragging on the grid, see overlapping events side by side, have events in different time zones, and use recurring events.
>
> **Cover**
> - The data model, including time zones, all-day events and recurrence.
> - Rendering: grid math, overlapping event layout, multi-day events, performance.
> - Fetching and caching by visible range, and real-time updates.
> - Interaction: drag to create, move and resize, with keyboard and screen reader support.
> - Edge cases (daylight saving, editing one event in a series) and what you would build first.

> [!TLDR]
> Model an event as either a timed instant (stored in UTC with the time zone it was created in) or an all-day date with no time zone, and a recurring event as a rule (start, time zone, recurrence rule, exceptions) that you expand only for the visible range, never forever. Render the week and day views as a time grid where each event is positioned by minutes since midnight, and lay out overlapping events with a column-packing algorithm that groups connected events into clusters and gives every event in a cluster the same width. Fetch by visible range plus a buffer, cache by range, invalidate on changes, and push updates over SSE or a WebSocket. Drag, resize and create with pointer events that snap to 15 minutes, update optimistically, and send changes with a version check; provide a keyboard path and an agenda view for accessibility. Do all date arithmetic in a time-zone-aware way, because the hard bugs are daylight saving changes and editing one occurrence of a series.

### Requirements

- **Functional:** month, week, day and agenda views; create, edit and delete events; drag to move and resize; recurring events; multiple calendars with colors and visibility toggles; invitations and reminders (out of scope for depth).
- **Non-functional:** smooth dragging, fast navigation between ranges, correct times in any time zone, works with hundreds of events in a month, accessible, and correct around daylight saving changes.

### Architecture

```text
┌──────────────────────────── Browser ─────────────────────────────┐        ┌────── Server ───────┐
│ Toolbar (range, view, time zone)    Sidebar (calendars, mini month) │        │ Events API (range) │
│ MonthView / TimeGridView / AgendaView                              │◀──────▶│ Recurrence expand  │
│   └─ EventLayout (overlap columns)  └─ DragLayer (pointer events)  │  REST  │ Sync / push (SSE)  │
│ Range cache (calendarId + start + end)  Optimistic edits           │        │ Free/busy, invites │
└────────────────────────────────────────────────────────────────────┘        └────────────────────┘
```

### Data model

```ts
type TimedEvent = {
  id: string;
  title: string;
  start: string;            // ISO instant in UTC: '2026-11-18T06:30:00Z'
  end: string;
  timeZone: string;         // the zone it was created in: 'Asia/Kolkata'
  version: number;          // for conflict detection on edit
  recurrence?: { rule: string; exceptions?: string[] }; // 'FREQ=WEEKLY;BYDAY=MO,WE', excluded or changed dates
};

type AllDayEvent = { id: string; title: string; startDate: string; endDate: string }; // '2026-11-18', no time zone
```

- **Instants versus dates:** a meeting at a moment in time is an instant; a birthday or holiday is a date. Do not store "all day" as 00:00 to 23:59 in some zone, because it moves when the viewer's zone changes.
- **Recurring events:** keep the rule and the start time in the event's own zone. A "9:00 every Monday" event stays at 9:00 local time across a daylight saving change, so the UTC instant changes; storing a fixed UTC offset would be wrong half the year.
- **Expansion:** generate occurrences only for the requested range (on the server or in a library), and treat edits to one occurrence as exceptions.

### Time zones with the platform

```js
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
fmt.format(new Date('2026-11-18T06:30:00Z')); // '12:00 PM' for a viewer in India

// Month grid: always 6 rows of 7 days, built with UTC date arithmetic so daylight saving cannot shift a day
function monthGrid(year, month, weekStartsOn = 0) { // month is 0-11
  const first = Date.UTC(year, month, 1);
  const offset = (new Date(first).getUTCDay() - weekStartsOn + 7) % 7;
  const start = first - offset * 86_400_000;
  return Array.from({ length: 42 }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
}
```

Format and compare in the viewer's chosen zone, take the first day of the week from the user's locale, and let the user pick a display zone. Use a maintained library (Temporal when available, or date-fns-tz, Luxon, Day.js with plugins) for recurrence and zone conversion instead of hand-rolling it.

### Laying out overlapping events

Position by time: `top = startMinutes * pxPerMinute`, `height = (endMinutes - startMinutes) * pxPerMinute` (with a minimum height so short events stay clickable). Then place events side by side:

```js
export function layoutDay(events, minDuration = 15) {
  const items = events
    .map((e) => ({ id: e.id, start: e.start, end: Math.max(e.end, e.start + minDuration) })) // minutes from midnight
    .sort((a, b) => a.start - b.start || b.end - a.end); // earlier first; for equal starts, longer first
  const layout = new Map(); // id -> { column, columns }
  let cluster = [];
  let columnEnds = []; // end time of the last event placed in each column of the current cluster
  let clusterEnd = -Infinity;
  const flush = () => {
    const columns = columnEnds.length;
    for (const { id, column } of cluster) layout.set(id, { column, columns });
    cluster = [];
    columnEnds = [];
    clusterEnd = -Infinity;
  };
  for (const e of items) {
    if (e.start >= clusterEnd) flush(); // nothing overlaps from before: start a new cluster
    let column = columnEnds.findIndex((end) => end <= e.start); // first column that is free again
    if (column === -1) column = columnEnds.length;
    columnEnds[column] = e.end;
    cluster.push({ id: e.id, column });
    clusterEnd = Math.max(clusterEnd, e.end);
  }
  flush();
  return layout;
}
// width = 100 / columns %, left = column * width %
```

A cluster is a group of events connected by overlaps, so events that merely touch (one ends at 10:00 and the next starts at 10:00) get full width. Tested cases: two overlapping events plus one that overlaps only the second share two columns, a three-way overlap needs three columns, equal start times put the longer event first, and zero-length events get a minimum duration. Sorting is `O(n log n)` and the pass is linear. Good extensions: expand an event to the right across empty columns, and compute layout per day, memoized.

### Month view and multi-day events

Render weeks as rows. A multi-day event is split into one segment per week row (a bar spanning the days it covers in that row), stacked into lanes by the same column-packing idea. A day cell with more events than fit shows "+N more" that opens a popover or day view.

### Fetching and caching

- Fetch by visible range plus a buffer (the previous and next range), keyed by `calendarId + start + end`, and prefetch the adjacent range so navigation is instant.
- Invalidate affected ranges after a mutation, and update the cache optimistically.
- Push changes from other devices or invitees over SSE or a WebSocket and invalidate the affected range; use incremental sync tokens if the API supports them.
- Show cached data immediately while refreshing.

### Interaction: create, move and resize

- Use pointer events with pointer capture on the grid. Convert the pointer's `y` to minutes, snap to 15 minutes, and show a ghost event while dragging.
- Move and resize with `transform` during the drag to avoid layout thrash, and commit on release.
- Save with the event's `version` (an `If-Match` header or a version field); on a conflict, reload the event and tell the user.
- Cancel with Escape, support touch (long press to start a drag, to avoid fighting with scrolling), and handle events that cross midnight.
- **Editing a recurring event:** ask "this event", "this and following" or "all events". "This event" creates an exception; "this and following" ends the old series just before and starts a new one; "all" edits the rule.

### Accessibility

- Provide a keyboard path: arrow keys move between days and events, Enter opens an event, and keys (or a form) move or resize an event; drag alone is not accessible.
- Give each event an accessible name with the title, time and calendar ("Design review, 10:00 to 11:00, Calendar: Work"). Use a grid or table structure for the month view with day labels.
- Offer an agenda (list) view as a fully accessible alternative; announce view and date changes; do not rely on color alone; support reduced motion.

### Performance

- Render only the visible range, memoize each day's layout, and avoid re-rendering the whole grid on every pointer move.
- Update the "now" line with one timer per minute, and pause it when the tab is hidden.
- For hundreds of events per month, the month view needs lanes and "+N more", not one DOM node per event per cell.

### Edge cases to name

Daylight saving days (23 or 25 hours), events that span midnight or several days, all-day events across zones, a recurring series with an exception moved to another day, an event edited on two devices at once, a leap day, and users whose week starts on Saturday, Sunday or Monday.

### Follow-ups

- **"Find a time that works for everyone."** A free/busy API and an interval-intersection algorithm; the UI shows overlaid availability.
- **"Offline?"** Cache the recent range and queue edits (see the offline-first question).
- **"Scale to a team calendar with 50 people?"** Fetch and render columns per person with virtualization, and batch the free/busy requests.
- **"What would you build first?"** The week view with range fetching and overlap layout, then create and drag, then the month view, then recurrence.

### References

- [MDN: Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
- [MDN: Pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)
- [RFC 5545: iCalendar recurrence rules](https://www.rfc-editor.org/rfc/rfc5545)

Listed ("Calendar") among example frontend system design problems in a candidate's interview-loop outline shared online (second-hand; source unverified). The design, layout algorithm and tests are my own. For the object-oriented version of a scheduler, see the meeting scheduler question.

## Design an e-commerce app (Amazon-lite) beyond the product page: listing and search, cart, checkout and payments
<!--
id: design-ecommerce-cart-checkout
level: senior
tags: system design, e-commerce, cart, checkout, payments, idempotency, search, seo, accessibility
minutes: 30
-->

> [!PROMPT]
> Design the frontend of an e-commerce application: category and search results, the product page, a cart and a checkout with online payment. Focus on what is hard about the cart and checkout, not only on rendering product grids.
>
> **Cover**
> - Listing and search: URL state, filters, pagination, SEO and performance.
> - Cart ownership, optimistic updates, price and stock changes, guests and login.
> - Checkout as a flow: forms, validation, payment, double-submit protection, async payment outcomes.
> - Security, accessibility, resilience and what you would build first.
>
> The product page itself is covered by the product page design question.

> [!TLDR]
> Split the app by how each part behaves. Catalog pages (listing, search results, product pages) are public and cacheable, so render them on the server or the edge for SEO and fast loading, keep filters, sort and page in the URL, and keep personalization out of the cached HTML. The cart and checkout are private, stateful and money-related, so the server owns the cart, prices, taxes and stock; the client shows an optimistic view, sends quantity changes debounced, and always re-validates before payment. Treat checkout as a state machine with steps in the URL and saved form data, collect payment through the provider's hosted fields so card numbers never touch your code, and make order placement safe to retry with an idempotency key plus a double-click guard. Payment results can arrive later, so the confirmation page reads the order from the server instead of trusting client state. Cover accessibility of forms, cross-tab cart sync, and failure handling (sold out, price changed, expired session).

### Requirements

- **Functional:** browse categories, search with filters and sorting, view products, add to cart, edit the cart, check out as a guest or a user, pay, see order confirmation and order history.
- **Non-functional:** fast listing pages on mobile (LCP), indexable by search engines, correct money amounts, no double charges, resilient to price and stock changes, accessible forms, safe handling of payment data.

### Architecture

```text
┌──────────────────────── Browser ─────────────────────────┐       ┌────────── Edge / Server ──────────┐
│ Listing + Search (URL = filters, sort, page)             │       │ CDN / SSR / ISR for catalog pages │
│ Product page (see PDP design)                            │◀─────▶│ Catalog + search API (cacheable)  │
│ Cart (mini cart, cart page)  optimistic quantity edits   │       │ Cart API (private, versioned)     │
│ Checkout state machine: address > shipping > pay > review│       │ Checkout / orders (idempotent)    │
│ Payment hosted fields (iframe from the provider)         │       │ Payment provider + webhooks       │
└──────────────────────────────────────────────────────────┘       └───────────────────────────────────┘
```

### Listing and search

- **Filters in the URL:** `/shoes?brand=nike&size=10&sort=price_asc&page=2` makes pages shareable, restores state on back, and gives search engines stable pages. Keep a canonical URL, and avoid indexing endless filter combinations (`noindex` or canonical to the base category).
- **Rendering:** server-render or statically regenerate category pages for first paint and SEO; hydrate the filters. Cache catalog responses at the CDN; cart, price-for-this-user and stock calls are separate and uncached.
- **Facets and counts** come from the server with each result set. Debounce typing in the search box and use the autocomplete design (see the search autocomplete question).
- **Pagination or "load more":** for commerce, URL-addressable pages or a "load more" that updates the URL usually beat unbounded infinite scroll (footers stay reachable, state is restorable).
- **Performance:** responsive images with explicit dimensions, the first row of images prioritized for LCP, skeletons that match the final layout, and prefetching a product page on hover or touch intent.
- **States:** a zero-results page with suggestions, an error state with retry, and stock labels that do not rely on color alone.

### Cart design

```ts
type Money = { amount: number; currency: string };   // amount in minor units (cents), never floating point

interface Cart {
  id: string;
  version: number;                                    // increments on every change; detects a stale client
  lines: { lineId: string; sku: string; quantity: number; unitPrice: Money; available: boolean }[];
  totals: { subtotal: Money; discount: Money; shipping: Money; tax: Money; total: Money };
}
```

- **The server owns the cart and the numbers.** The client never computes authoritative totals, taxes or discounts; it displays what the server returns and may show an estimate while an update is in flight.
- **Guests and login:** a guest gets a cart id in a cookie; on login merge it into the user's cart (decide and show how conflicts are resolved, for example by summing quantities up to the stock limit).
- **Optimistic updates:** add to cart and quantity changes update the UI immediately, debounce quantity edits per line, send the new quantity (not "+1"), and roll back with a message if the server rejects it. Use the cart `version` so a stale response does not overwrite a newer state.
- **Revalidation:** when the cart opens and again at checkout, the server returns price changes, items now unavailable, and reduced stock. Show these explicitly ("The price of X changed from $20 to $22") instead of silently changing the total.
- **Sync across tabs:** a `BroadcastChannel` or the `storage` event updates the cart badge in other tabs.
- **Accessibility:** quantity steppers with labels, an `aria-live="polite"` region announcing "Added to cart", and focus handling when a line is removed.

### Checkout as a state machine

```text
cart > address > shipping > payment > review > placing > (confirmed | requires_action | failed)
```

- Keep each step at its own URL so refresh and back work, persist entered data (session storage or the server) so a reload does not lose the form, and allow guest checkout.
- **Forms:** correct input types and `autocomplete` attributes, address validation and autocomplete, inline errors tied to fields, and an error summary that moves focus to the first problem.
- **Payment:** use the provider's hosted fields or redirect (an iframe from the payment provider) so card numbers never enter your DOM; this keeps most PCI scope off your code. Support wallets through the Payment Request API where available. Load payment scripts from the provider directly with a strict Content Security Policy.
- **Strong authentication (3-D Secure):** the provider may require an extra step, so the state includes `requires_action` (a modal or redirect) and a return path that resumes the flow.
- **Stock and price at placement:** the server re-checks and may reserve stock for a short time; handle "sold out while you paid" with a clear recovery path.

### Safe order placement

```js
export function createSubmitter(placeOrder) {
  let attempt = null; // { cartKey, idempotencyKey }
  let inflight = null;
  return (cart) => {
    if (inflight) return inflight; // a double click gets the same promise, not a second request
    const cartKey = JSON.stringify(cart);
    if (!attempt || attempt.cartKey !== cartKey) attempt = { cartKey, idempotencyKey: crypto.randomUUID() };
    const key = attempt.idempotencyKey;
    inflight = placeOrder(cart, key)
      .then((order) => { attempt = null; return order; }) // success: the next order gets a new key
      .finally(() => { inflight = null; }); // failure keeps the key, so a retry is the same order
    return inflight;
  };
}

const submit = createSubmitter((cart, key) =>
  fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ cartId: cart.id, cartVersion: cart.version }),
  }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))),
);
```

Behaviors that were tested: two clicks send one request, a failed attempt retried with an unchanged cart reuses the same key (the server returns the original order instead of charging twice), a successful order rotates the key, and a changed cart gets a new key. Also disable the button while the request is in flight, and never charge from a "retry" that has a different key.

### Async payment outcomes and the confirmation page

Payment confirmation can arrive later (a bank redirect, a webhook). The confirmation page loads the order by id from the server and shows its real status (`paid`, `pending`, `failed`), polling or listening briefly for `pending`. Do not rely on client state or the URL alone to decide that the payment succeeded, and make the page safe to reload and to open from an email.

### Security

- Protect state-changing requests with `SameSite` cookies plus a CSRF token, validate everything on the server, and never trust a price or total sent by the client.
- Isolate third-party scripts (tag managers, chat widgets, A/B tools) from the checkout, or load none there; they are a common source of slowdowns and skimming attacks.
- Sanitize user-generated content such as reviews and questions.

### Resilience and observability

- Show clear messages for out of stock, price changed, session expired, address invalid and payment declined, each with a next step.
- Track funnel events (view item, add to cart, begin checkout, add payment info, purchase) with deduplication, plus errors by step and the drop-off at each one.
- Keep a fallback path: if the payment widget fails to load, say so and offer retry instead of a blank page.

### Follow-ups

- **"Flash sale traffic?"** Cache catalog at the edge, queue or rate-limit checkout, show inventory honestly, and keep the cart and order APIs separate from catalog.
- **"Saved payment methods and one-click buy?"** Tokens from the provider; require re-authentication for sensitive actions.
- **"Multiple currencies and taxes?"** Money in minor units with a currency; formatting with `Intl.NumberFormat`; tax calculated on the server.
- **"Recommendations?"** Fetched separately and lazily, so they never block the cart or LCP.
- **"What would you build first?"** Cacheable catalog pages with URL filters, then the server-owned cart with optimistic edits, then a minimal one-page checkout with hosted payment and idempotent placement.

### References

- [web.dev: Payment and address forms best practices](https://web.dev/articles/payment-and-address-form-best-practices)
- [MDN: Payment Request API](https://developer.mozilla.org/en-US/docs/Web/API/Payment_Request_API)
- [MDN: Idempotent (glossary)](https://developer.mozilla.org/en-US/docs/Glossary/Idempotent)
- [web.dev: Optimize Largest Contentful Paint](https://web.dev/articles/optimize-lcp)

Listed ("E-commerce application") among example frontend system design problems in a candidate's interview-loop outline shared online (second-hand; source unverified). The design and the order-placement tests are my own. For the object-oriented version, see the e-commerce platform question.
