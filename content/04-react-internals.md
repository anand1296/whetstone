---
id: react-internals
title: React Rendering & Internals
description: How React turns state into pixels, reconciliation and diffing, when components re-render, Fiber and concurrent rendering, SSR and hydration, effects as synchronization, concurrent rendering, React 19, Server Components and the compiler.
---

## What exactly happens between `setState` and pixels on screen?
<!--
id: react-render-commit-pipeline
level: senior
tags: react, reconciliation, fiber, render phase, commit phase, batching
minutes: 15
-->

> [!PROMPT]
> A product manager asks: "When I call `setState`, how long until the user sees the change, and what does React do in between?" You are asked to explain it with a concrete component whose child uses `useLayoutEffect` and `useEffect`.
>
> **Cover**
> - Trigger, render, reconcile, commit, and where the browser paints.
> - When each effect type runs, and what batching and lanes change in React 18/19.
> - Why render must be pure, and what Strict Mode's double render is checking.

> [!TLDR]
> `setState` enqueues an update on the component's fiber and schedules work at a priority (lane). React then **renders**: calls your components to get new element trees and **reconciles** them against the current fiber tree (same type + same key → update, otherwise replace). Render is pure and interruptible in concurrent mode. Then it **commits** synchronously: applies DOM mutations, attaches refs, runs layout effects, and lets the browser paint; passive effects (`useEffect`) run after paint. Updates in the same event are **batched** into one render.

### The pipeline

```text
setState(x)
  └─ enqueue update on fiber, mark lanes up to the root, schedule root
render phase (pure, can be paused/restarted/discarded)
  ├─ beginWork: call components, diff children (reconciliation)
  └─ completeWork: create/prepare DOM nodes off-screen, collect effects
commit phase (synchronous, never interrupted)
  ├─ before mutation: getSnapshotBeforeUpdate
  ├─ mutation: insert/update/remove DOM nodes, ref detach
  ├─ layout: ref attach, useLayoutEffect, componentDidMount/Update
  └─ (browser paints)
passive effects: useEffect cleanups then setups (after paint, usually)
```

### Reconciliation rules that explain real bugs

- **Different element type at the same position** (`<div>` → `<section>`, or `<A>` → `<B>`) unmounts the whole subtree, losing state.
- **Same type, same position** reuses the instance and its state.
- **Keys** give identity in lists. Index keys break when items are reordered/inserted: state "moves" to the wrong row.
- **Changing a `key` on purpose** resets a component (e.g. `<ProfileForm key={userId} />` to discard draft state when switching users).

```tsx
// Bug: defining a component inside another gives it a NEW type each render → remount every render.
function Parent() {
  const Row = ({ label }: { label: string }) => <input defaultValue={label} />; // new function each render
  return <Row label="name" />; // input loses focus/state on every parent render
}
```

### Batching

Since React 18, all updates inside the same tick are batched automatically: event handlers, promises, timeouts, native listeners. `flushSync` opts out when you must read the DOM right after an update (rare, e.g. scroll to a newly added item).

### Fiber and lanes, briefly

Each component instance has a fiber node with pointers (child, sibling, return) so React can walk the tree iteratively and **pause** between units of work. Lanes are a bitmask of priorities: discrete input (click, keypress) is high priority, transitions are lower, so a transition render can be interrupted by typing and restarted with fresh state.

### Why render must be pure

Because a render may be called twice (StrictMode in dev), interrupted, or thrown away (a higher-priority update arrived), side effects in render (subscriptions, mutations, network calls) can run multiple times or for UI that never commits. Put them in event handlers or effects.

### Follow-ups

- **"Is the virtual DOM why React is fast?"** No; it's a convenient programming model. Diffing has a cost. React is fast enough because work is bounded (keys, memoization, avoiding unnecessary renders) and scheduled (concurrent rendering).
- **"`useLayoutEffect` vs `useEffect`?"** Layout effects run after DOM mutation but before paint, blocking it; use them to measure and synchronously adjust layout (tooltips, scroll). Everything else goes in `useEffect`.
- **"What does `useInsertionEffect` do?"** Runs before layout effects, for CSS-in-JS libraries to inject styles before anything reads layout.

### References

- [React: Render and commit](https://react.dev/learn/render-and-commit)
- [React: Preserving and resetting state](https://react.dev/learn/preserving-and-resetting-state)
- [React 18: Automatic batching](https://react.dev/blog/2022/03/29/react-v18#new-feature-automatic-batching)

## Reconciliation and React's diffing algorithm: the two heuristics, keys, and the list algorithm
<!--
id: react-reconciliation-diffing
level: senior
tags: react, reconciliation, diffing, keys, virtual dom, lists
minutes: 18
-->

> [!PROMPT]
> Explain what reconciliation is in React and how its diffing algorithm works. Then explain why a list of inputs "swaps the typed text" when items are inserted at the top, and fix it.
>
> **Cover**
> - Why a general tree diff is too slow, and the two heuristics React uses instead.
> - What happens for same type, different type, and a changed `key`.
> - How keyed children are matched and moved, and what makes a good key.
>
> **Test cases**
> - A list rendered with `key={index}` has an input per row. Typing in row 2 and then prepending an item leaves the typed text on the wrong row. Using a stable id fixes it.
> - Changing `<div>` to `<section>` at the same position resets the state of everything below it.
> - `<Profile key={userId} />` discards the old user's draft state when `userId` changes.

> [!TLDR]
> **Reconciliation** is how React compares the element tree your components just returned with the tree it already has, and decides the smallest set of changes to commit. A generic tree diff is O(n³), so React uses two heuristics to make it O(n): **elements of different types produce different trees** (unmount the old subtree, mount the new one), and **keys tell React which children are the same across renders**. Same type at the same position means "update in place and keep state"; a different type or a different key means "start over".

### What is being compared

Calling a component returns **elements**: plain objects describing UI (`{ type, key, props }`). React compares that new element tree with the fiber tree from the last render. "Virtual DOM" is the informal name for this; the output of the diff is a list of effects (insert, update, delete, move) that the commit phase applies to the real DOM. No DOM is touched during the diff.

### The rules, level by level

1. **Compare the types at the same position.**
   - Different type (`<div>` to `<section>`, or `<A />` to `<B />`): destroy the old subtree (state is lost, effects clean up) and build a new one.
   - Same DOM type: keep the node and update only the changed attributes and styles, then recurse into the children.
   - Same component type: keep the instance and its state, pass the new props, call it again, then diff what it returns.
2. **Compare children by key, or by position if there is no key.**
3. **Bail out when the element is the same object.** If a parent re-renders but passes the exact same element reference as `children`, React skips diffing that subtree, which is why moving state down or lifting content up (the `children` trick) avoids re-renders.

### The list algorithm, simplified

For an array of children React does roughly this:

1. Walk old and new children **from the start** while keys match, updating in place. Stop at the first mismatch.
2. If the new list is exhausted, delete the remaining old children. If the old list is exhausted, insert the remaining new ones.
3. Otherwise put the remaining old children in a **map by key** and walk the rest of the new list: reuse the matching old fiber if there is one, or create a new one. Track `lastPlacedIndex`, the highest old index placed so far. A reused child whose old index is **lower** than `lastPlacedIndex` must move; otherwise it stays where it is.
4. Delete old children that were never matched.

```text
old: A B C D        new: D A B C      lastPlaced = 0
D (old 3) 3 >= 0 stays, lastPlaced = 3
A (old 0) 0 <  3 moves
B (old 1) 1 <  3 moves
C (old 2) 2 <  3 moves          -> three moves to bring D to the front

old: A B C D        new: B C D A
B (1) stays, C (2) stays, D (3) stays, A (0) < 3 moves   -> one move
```

So moving an item toward the end is cheap and moving one toward the front causes many moves. It is still correct either way; this is a reason not to worry unless lists are huge, in which case virtualize.

### Keys

```tsx
// Bug: index keys. After prepending, row 0's key now belongs to a different item,
// so React reuses row 0's DOM node and state (the typed text) for the wrong item.
{items.map((item, index) => (
  <li key={index}>
    <input defaultValue={item.name} />
  </li>
))}

// Fix: a stable, unique id from the data.
{items.map((item) => (
  <li key={item.id}>
    <input defaultValue={item.name} />
  </li>
))}
```

A good key is **unique among siblings, stable across renders, and tied to the data's identity**. `Math.random()` or a new id on every render makes React remount every row each time. Index keys are acceptable only for static lists that never reorder, insert or delete.

Keys are also a deliberate tool, not just a list concern:

```tsx
// Changing the key resets the component and all its state: no effect needed to "clear the form".
<ProfileForm key={userId} userId={userId} />
```

### Bugs this explains

```tsx
function Parent() {
  // A new function (so a new component type) on every render: React sees "different type",
  // unmounts and remounts <Row /> every time, so the input loses focus and state.
  const Row = ({ label }: { label: string }) => <input defaultValue={label} />;
  return <Row label="name" />;
}
```

- Wrapping or unwrapping a component in a conditional wrapper changes the element type at that position and remounts the child.
- Conditional rendering shifts positions: `{cond && <A />}` followed by `<B />` keeps `B` at a stable slot because `false` still occupies a position; reordering with `cond ? <A/> : <B/>` changes types.

:::angular
### Equivalent in Angular

`@for` requires `track`, which is the key: `@for (item of items(); track item.id)`. Angular matches by tracked identity and **moves** existing DOM nodes instead of recreating them, so component state and focus survive reordering. `track $index` has the same problems as index keys, and the compiler warns when you forget `track`.
:::

:::vue
### Equivalent in Vue

`v-for` needs `:key`. Vue 3's keyed diff trims matching prefixes and suffixes, then finds the **longest increasing subsequence** of old positions to decide which nodes can stay put and moves only the rest. Same rule for keys: stable and unique, never the index for lists that change.
:::

### Follow-ups

- **Does React diff the real DOM?** No. It diffs elements against fibers; the DOM is touched only in the commit phase, and only for what changed.
- **Does a re-render mean a DOM update?** No. A component can render many times while the diff produces zero DOM changes.
- **Why must keys be unique only among siblings?** Identity is resolved within one parent's children list.
- **Is the virtual DOM always faster than direct DOM updates?** No. It buys a declarative model at the cost of the diff; frameworks with fine-grained reactivity (signals) skip the diff entirely.

> [!WARNING]
> Common mistakes: using `key={index}` on reorderable lists; generating keys during render; putting the key on an inner element instead of the element returned from `map`; defining components inside components; and believing "re-render" and "DOM update" are the same thing.

### References

- [React docs: Preserving and resetting state](https://react.dev/learn/preserving-and-resetting-state)
- [React docs: Rendering lists (keys)](https://react.dev/learn/rendering-lists)
- [React legacy docs: Reconciliation](https://legacy.reactjs.org/docs/reconciliation.html)


## When does a component re-render, and which optimizations actually help?
<!--
id: react-rerenders-optimizations
level: senior
tags: react, rerenders, memo, context, performance, usememo
minutes: 15
-->

> [!PROMPT]
> A table of 2,000 rows re-renders on every keystroke in a search box above it, and the page feels slow. You are asked to explain what triggers renders and fix it without sprinkling `useMemo` everywhere.
>
> **Cover**
> - Exactly what causes a component to re-render (state, parent, context) and what doesn't.
> - Optimizations that work in order: move state down, split components, pass children, `memo` with stable props, virtualization.
> - How you prove the fix with the React Profiler, and where the React Compiler changes the advice.

> [!TLDR]
> A component re-renders when its state changes, its parent re-renders (props don't matter unless it's memoized), or a context it reads changes. Re-rendering isn't a bug; **expensive or excessive** re-rendering is. The best fixes are structural: move state down (colocation), lift content up (`children` as props), split contexts by update frequency, and subscribe to slices of external stores. `React.memo`/`useMemo`/`useCallback` are targeted tools after profiling, and the React Compiler automates most of them.

:::react
### The three triggers

```tsx
function Parent() {
  const [count, setCount] = useState(0);
  return (
    <>
      <button onClick={() => setCount((c) => c + 1)}>{count}</button>
      <ExpensiveTree /> {/* re-renders on every click, even with no props */}
    </>
  );
}
```

### Structural fixes (no memo needed)

**1. Move state down** into the component that uses it:

```tsx
function Parent() {
  return (
    <>
      <Counter />       {/* owns its own state now */}
      <ExpensiveTree /> {/* no longer re-renders */}
    </>
  );
}
```

**2. Lift content up**: pass the expensive part as `children`. Elements created by the grandparent don't change when the wrapper's state changes.

```tsx
function ScrollTracker({ children }: { children: React.ReactNode }) {
  const [y, setY] = useState(0);
  useWindowEvent('scroll', () => setY(window.scrollY));
  return <div data-scrolled={y > 0}>{children}</div>; // children keep the same element identity
}

<ScrollTracker>
  <ExpensiveTree />
</ScrollTracker>;
```

**3. Split context** so fast-changing values don't re-render everything:

```tsx
// One context with { user, theme, cursorPosition } re-renders all consumers on mouse move.
// Split by volatility, and pass stable dispatchers separately.
const ThemeContext = createContext<Theme>('light');
const CursorContext = createContext<{ x: number; y: number }>({ x: 0, y: 0 });
```

**4. Subscribe to slices** with selectors (Redux `useSelector`, Zustand `useStore(s => s.x)`, `useSyncExternalStore`): only components whose selected value changed re-render.

### Targeted memoization

```tsx
const Row = memo(function Row({ item, onSelect }: { item: Item; onSelect: (id: string) => void }) {
  return <li onClick={() => onSelect(item.id)}>{item.label}</li>;
});

function List({ items }: { items: Item[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const onSelect = useCallback((id: string) => setSelected(id), []); // stable → memo works
  const visible = useMemo(() => items.filter((i) => !i.archived), [items]);
  return <ul>{visible.map((item) => <Row key={item.id} item={item} onSelect={onSelect} />)}</ul>;
}
```

`memo` only helps if **every** prop is referentially stable. One inline object (`style={{}}`) or arrow function silently defeats it.

### Measure first

Use the React DevTools Profiler ("Highlight updates", flamegraph, "Why did this render?") and the browser Performance panel. Optimize the components that are both **frequently** rendered and **slow** to render. A 0.1ms component re-rendering is fine.

> [!WARNING]
> `useMemo` everywhere isn't free: it costs memory, comparison work and readability, and it doesn't stop child re-renders unless the child is memoized. With the React Compiler enabled, manual memoization is mostly redundant.

### Follow-ups

- **"Why does my context consumer re-render even though the value didn't change?"** The provider's `value={{ user, setUser }}` is a new object every render. Memoize the value or split state and dispatch into separate contexts.
- **"Does a component re-render if `setState` is called with the same value?"** React bails out (`Object.is`) and usually skips rendering children; it may render the component itself once before bailing.
:::

:::angular
### What triggers work in Angular

Angular's question is "which views get checked?", not "which components re-render". Two modes matter:

- **Default change detection** checks every component from the root down after any event or async task that zone.js sees. A keystroke in a search box re-checks the whole tree, including the 2,000-row table, even if nothing in it changed.
- **`OnPush`** checks a component only when an `input()` reference changes, an event fires inside it, a signal read in its template changes, or something calls `markForCheck` (the `async` pipe does). Zoneless change detection plus signals refreshes only the views that read the signal that changed.

```ts
@Component({
  selector: 'app-search-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ResultsTable],
  template: `
    <input [value]="query()" (input)="query.set($any($event.target).value)" />
    <app-results-table [rows]="rows()" />
  `,
})
export class SearchPage {
  protected readonly query = signal('');
  protected readonly rows = signal<Row[]>([]); // the table input does not change while typing
}
```

### Structural fixes (no memoization needed)

**1. Make `OnPush` the default** for every component (a lint rule, or the schematic default). With it, the table is not re-checked while the parent's other state changes, because its `rows` input keeps the same reference.

**2. Move state down.** Put the query in a small `<app-search-box>` that owns the signal and emits a debounced `(queryChange)`; the page and the table never see keystrokes.

**3. Derive with `computed`**, which caches until its signal dependencies change, instead of recomputing in a template method (a method call in a template runs on every check):

```ts
protected readonly visible = computed(() => this.rows().filter((row) => !row.archived));
```

**4. Give lists identity.** `@for (row of visible(); track row.id)` lets Angular move and patch DOM nodes instead of recreating them; `track $index` on a reorderable list defeats this.

**5. Split state by volatility.** A service exposing one big `signal<AppState>` makes every reader depend on all of it. Expose slices as `computed` selectors (`readonly cursor = computed(() => this.state().cursor)`); readers of unrelated slices are not notified, and signals compare by reference so an unchanged slice does not propagate.

**6. Defer and virtualize.** `@defer (on viewport)` for below-the-fold heavy trees, and `cdk-virtual-scroll-viewport` for long lists.

### Targeted tools

- `OnPush` plus immutable updates is the equivalent of `memo` with stable props: mutating an object in place does not change its reference, so an `OnPush` child will not update. Replace the object (`rows.update((r) => [...r, next])`).
- Pure pipes are memoized per input reference, a good home for cheap formatting in templates.
- `ChangeDetectorRef.detach()` and `runOutsideAngular` are last resorts for high-frequency work such as drag handlers or animation frames.

### Measure first

Use **Angular DevTools**' profiler to record change-detection cycles and see which components were checked and for how long, plus the browser Performance panel. Fix components that are both checked often and slow to check.

> [!WARNING]
> Sprinkling `markForCheck()` or switching components back to `Default` to "make the UI update" hides a real bug, usually a mutated input. Fix the data flow instead.

### Follow-ups

- **"My `OnPush` component did not update."** An input was mutated rather than replaced, or state changed outside Angular's knowledge (a callback from a third-party library); put the state in a signal.
- **"Do signals replace `OnPush`?"** They complement it. With signals read in the template and zoneless change detection, only the affected views refresh, and `OnPush` is the model that makes the default behavior cheap.
- **"Why does a method call in the template run constantly?"** The template re-evaluates on every check of that view; use `computed`, a pure pipe or a plain property.
:::

:::vue
### What triggers work in Vue

Vue renders at component granularity but tracks dependencies precisely. A component re-renders when a reactive value it **read during its last render** changes, or when its **props** change (compared shallowly; an unchanged parent re-render does not re-render a child whose props are equal). So the usual Vue slowdowns are different from React's:

- A prop that is a **new object or array on every render** (`:style="{...}"`, `:items="items.filter(...)"` inline) makes the child's props change each time.
- **Deep reactivity on large data**: a `ref` holding a 10,000-item array wraps each item in a proxy and tracks every property read.
- A **coarse dependency**: one component reads a big shared `reactive` object, so any field change re-renders it.

```vue
<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';

const query = ref('');
const rows = shallowRef<Row[]>([]); // replace the array to update; no deep proxies on thousands of rows
const visible = computed(() => rows.value.filter((row) => !row.archived && row.name.includes(query.value)));
</script>

<template>
  <input v-model="query" />
  <ResultsTable :rows="visible" />
</template>
```

### Structural fixes (no memoization needed)

**1. Move state down.** Keep the query in a `SearchBox` component that emits a debounced `update:modelValue`; the page and the table do not re-render per keystroke.

**2. Derive with `computed`.** It caches until its dependencies change and is the replacement for most `useMemo` calls. Never compute derived data in a method called from the template.

**3. Use `shallowRef` and `shallowReactive`** (or `markRaw` for class instances and chart objects) for large, replace-not-mutate data.

**4. Keep props stable.** Hoist constant objects out of the template, or compute them once.

**5. Split state by volatility.** In a Pinia store, use getters and select only what a component needs; with `storeToRefs`, a component that reads `cursor` is not re-rendered when `theme` changes.

**6. Virtualize** long lists, and give `v-for` stable `:key` values.

### Targeted tools

```vue
<!-- Re-render a row only when its selection state or timestamp changes -->
<tr v-for="row in visible" :key="row.id" v-memo="[row.id === selectedId, row.updatedAt]">
  <td>{{ row.name }}</td>
</tr>
```

`v-memo` is the per-subtree memoization escape hatch (like `memo` with a custom comparison); `v-once` renders once and never again. Both are for hot paths after measuring, not defaults.

### Measure first

Use Vue DevTools: the performance and timeline panels, and "highlight updates". To find out *why* a component re-rendered, add the development hooks:

```ts
onRenderTriggered((event) => console.log('re-rendered because', event.key, event.type));
```

> [!WARNING]
> Wrapping everything in `shallowRef` or `v-memo` "just in case" trades correctness for speed: in-place mutations of a `shallowRef` value do not update the UI. Reach for these only for data you replace wholesale, and only after profiling.

### Follow-ups

- **"Why does a child re-render when the parent's unrelated state changes?"** Usually a prop that is a fresh object or function each time, or the child reading a slot whose content changed; stabilize the prop.
- **"`ref` or `reactive`?"** Prefer `ref` (works for primitives, can be replaced wholesale, survives destructuring); avoid destructuring a `reactive` object, which loses reactivity.
- **"Does Vue have something like the React Compiler?"** No; fine-grained tracking plus `computed` removes most of the need for manual memoization, and Vapor mode (an opt-in compilation strategy) aims to remove the virtual DOM cost as well.
:::

### References

- [React: memo](https://react.dev/reference/react/memo)
- [Dan Abramov: Before you memo()](https://overreacted.io/before-you-memo/)
- [React: Scaling up with reducer and context](https://react.dev/learn/scaling-up-with-reducer-and-context)

## Effects are synchronization, not lifecycle: when don't you need `useEffect`?
<!--
id: effects-synchronization
level: senior
tags: useeffect, derived state, events, react
minutes: 15
-->

> [!PROMPT]
> Review this component: it fetches data in `useEffect`, mirrors props into state with another effect, resets a form when an id changes using an effect, and subscribes to a store manually. Which of these effects shouldn't exist?
>
> **Cover**
> - The mental model: effects synchronize with external systems; events and derived data don't need them.
> - For each smell, the replacement (compute during render, `key` to reset state, event handlers, `useSyncExternalStore`, a data library).
> - The remaining legitimate effect and how to write its cleanup correctly, including Strict Mode double-invocation.

> [!TLDR]
> `useEffect` exists to **synchronize with something outside React** (DOM APIs, subscriptions, network, timers, third-party widgets). If the code reacts to a **user action**, it belongs in the event handler. If it **computes** a value from props/state, compute it during render (memoize if expensive). If it **resets** state when a prop changes, use a `key` or adjust state during render. Most bugs in effect-heavy code (extra renders, loops, races) disappear when unnecessary effects are removed.

:::react
### Anti-pattern → fix table

| You wrote | Instead |
| --- | --- |
| `useEffect(() => setFullName(first + ' ' + last), [first, last])` | `const fullName = first + ' ' + last` |
| `useEffect(() => setVisible(filter(items)), [items])` | `const visible = useMemo(() => filter(items), [items])` |
| `useEffect(() => { if (submitted) post(form) }, [submitted])` | Call `post(form)` in the submit handler |
| `useEffect(() => setSelection(null), [items])` | `key` the component, or store `selectedId` and derive selection |
| `useEffect(() => onChange(value), [value])` (notify parent) | Call `onChange` in the handler that changed `value` |
| Chains of effects setting state that trigger effects | One event handler that computes the next state |

### Adjusting state when a prop changes (without an effect)

```tsx
function ItemList({ items }: { items: Item[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Derive instead of syncing: if the selected item disappeared, treat it as no selection.
  const selected = items.find((item) => item.id === selectedId) ?? null;
  // ...
}
```

When you truly need to reset state on a prop change, compare with the previous value during render:

```tsx
const [prevItems, setPrevItems] = useState(items);
if (items !== prevItems) {
  setPrevItems(items);
  setSelectedId(null); // React re-renders immediately, before children see stale state
}
```

### Legitimate effects

```tsx
// Subscribing to a browser API, with cleanup.
useEffect(() => {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const update = () => setReduced(media.matches);
  update();
  media.addEventListener('change', update);
  return () => media.removeEventListener('change', update);
}, []);
```

For this exact case, `useSyncExternalStore` is even better: no extra render, no tearing.

### Fetching in effects

Fetching in `useEffect` works but you must handle races, caching, deduping and cancellation yourself. Prefer a data library (TanStack Query, SWR, RTK Query), a framework loader, or React 19's `use` with a cached promise.

### StrictMode double effects

In development, React mounts → unmounts → mounts each component to verify effects clean up correctly. If an effect breaks under that (double requests that matter, duplicated subscriptions), the effect is missing a cleanup or isn't idempotent.

### Follow-ups

- **"How do you read the latest props in an effect without re-running it?"** `useEffectEvent` (stable in recent React) for event-like logic inside effects; a ref updated in a layout effect as the older pattern.
- **"Why does the linter insist on all dependencies?"** Missing deps mean the effect closes over stale values. If adding a dependency causes loops, the effect is doing too much; restructure instead of disabling the rule.
:::

:::angular
### Anti-pattern → fix table (Angular)

The same rule applies to `effect()`: it exists to **synchronize with something outside the signal graph** (the DOM, `localStorage`, a third-party widget, analytics). Derived values and user-driven changes do not belong in it.

| You wrote | Instead |
| --- | --- |
| `effect(() => this.fullName.set(this.first() + ' ' + this.last()))` | `fullName = computed(() => this.first() + ' ' + this.last())` |
| `effect(() => this.visible.set(filter(this.items())))` | `visible = computed(() => filter(this.items()))` |
| `effect(() => { if (this.submitted()) this.post(this.form()) })` | Call `post` in the submit handler |
| `effect(() => this.selection.set(null))` when `items` changes | `selection = linkedSignal({ source: this.items, computation: () => null })` |
| `effect(() => this.valueChange.emit(this.value()))` (notify parent) | Emit in the handler that changed the value, or use `model()` |
| An `effect` that fetches and writes to a signal | `resource()` / `rxResource()` (cancels, tracks loading and error) |
| Chains of effects writing signals that trigger effects | One handler (or one `computed`) that produces the next state |

### Resetting state when an input changes (without an effect)

`linkedSignal` is a writable signal that recomputes from a source, which is exactly "state that resets when a prop changes":

```ts
export class ItemList {
  readonly items = input.required<Item[]>();
  // Starts null, goes back to null whenever the list changes, and is still writable by clicks.
  protected readonly selectedId = linkedSignal<Item[], string | null>({
    source: this.items,
    computation: () => null,
  });
  // Or derive instead of syncing: a selection that disappeared becomes "no selection".
  protected readonly selected = computed(() => this.items().find((item) => item.id === this.selectedId()) ?? null);
}
```

### Legitimate effects

```ts
export class MotionPrefs {
  readonly reduced = signal(false);

  constructor() {
    effect((onCleanup) => {
      // Subscribing to a browser API, with cleanup. (`toSignal` on a fromEvent stream also works.)
      const media = window.matchMedia('(prefers-reduced-motion: reduce)');
      const update = () => this.reduced.set(media.matches);
      update();
      media.addEventListener('change', update);
      onCleanup(() => media.removeEventListener('change', update));
    });
  }
}
```

Writes to signals inside an effect are allowed, but each is a hint that a `computed`, `linkedSignal` or event handler would be clearer. Use `afterNextRender` / `afterRenderEffect` for DOM measurement and third-party widgets that need the rendered DOM, and wrap reads you do not want tracked in `untracked()`.

### Fetching in effects

Do not hand-roll it. `resource()` / `rxResource()` take a request signal, cancel the previous request when it changes, expose `value()`, `isLoading()`, `error()` and `reload()`, and give you a stable place for caching decisions. For app-wide caching and deduping, TanStack Query's Angular adapter or a service with `shareReplay` fills the same role as in other frameworks.

### Cleanup and double invocation

Angular does not mount-unmount-mount components in development, so there is no Strict Mode check to catch a missing cleanup. The discipline is the same, though: every `effect` that subscribes returns cleanup through `onCleanup`, and anything else registers with `DestroyRef.onDestroy`. `takeUntilDestroyed()` handles RxJS subscriptions.

### Follow-ups

- **"How do you read a signal in an effect without making it a dependency?"** `untracked(() => this.other())`. This is the Angular answer to "latest value without re-running".
- **"Why did my effect run more than once?"** Effects re-run when any signal they read changes, and they run during change detection, not synchronously after a `set`. If the effect does too much, split it or move the work into a `computed`.
:::

:::vue
### Anti-pattern → fix table (Vue)

The same rule applies to `watch` and `watchEffect`: they exist to **perform side effects in response to change** (touch the DOM, storage, network, a third-party widget). Derived values do not belong in them.

| You wrote | Instead |
| --- | --- |
| `watch([first, last], () => (fullName.value = first.value + ' ' + last.value))` | `const fullName = computed(() => first.value + ' ' + last.value)` |
| `watch(items, () => (visible.value = filter(items.value)))` | `const visible = computed(() => filter(items.value))` |
| `watch(submitted, (yes) => yes && post(form))` | Call `post(form)` in the submit handler |
| `watch(() => props.id, () => (draft.value = emptyDraft()))` | Put `:key="id"` on the component so Vue recreates it, or derive the state |
| `watch(value, (v) => emit('change', v))` (notify parent) | Emit in the handler that changed `value`, or use `defineModel` |
| Chains of watchers writing refs that trigger watchers | One handler or one `computed` that produces the next state |

### Resetting state when a prop changes (without a watcher)

```vue
<!-- Parent: a new id means a fresh editor, with fresh state -->
<ProfileEditor :key="userId" :user-id="userId" />
```

```ts
// Or derive instead of syncing: a selection that disappeared becomes "no selection".
const selectedId = ref<string | null>(null);
const selected = computed(() => props.items.find((item) => item.id === selectedId.value) ?? null);
```

### Legitimate effects

```ts
// Subscribing to a browser API, with cleanup.
export function useReducedMotion() {
  const reduced = ref(false);
  watchEffect((onCleanup) => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => (reduced.value = media.matches);
    update();
    media.addEventListener('change', update);
    onCleanup(() => media.removeEventListener('change', update));
  });
  return reduced;
}
```

Choose `watch(source, callback)` when you need the old and new values or want lazy execution, and `watchEffect` when the dependencies are whatever the callback reads. Use `{ flush: 'post' }` (or `watchPostEffect`) when the effect needs the updated DOM, and `onMounted` for one-off setup. Inside a watcher, `onWatcherCleanup(fn)` (Vue 3.5+) registers cleanup from nested helper functions.

### Fetching in watchers

Do not hand-roll it. Use a data library (TanStack Query for Vue, `useFetch` from VueUse, or Nuxt's `useAsyncData`/`useFetch`), which handle cancellation, caching, deduping and races. If you must, a watcher with `onWatcherCleanup(() => controller.abort())` is the minimal safe pattern.

### Cleanup and double invocation

Vue does not mount-unmount-mount in development, so nothing flags a missing cleanup. Effects created synchronously in `setup` are stopped automatically on unmount; effects created later (inside a callback) need manual `stop()` handles. Register listeners with `onWatcherCleanup`, `onUnmounted` or VueUse's `useEventListener`.

### Follow-ups

- **"How do you read the latest value without re-running?"** Read it inside the callback of `watch` (not as a source), or use a plain `ref` that is not tracked by the effect.
- **"Why does my watcher not fire?"** Watching a property of a reactive object needs a getter (`() => state.count`), not the value; and a `watch` on a shallow ref does not see in-place mutations.
:::

### References

- [React: You might not need an effect](https://react.dev/learn/you-might-not-need-an-effect)
- [React: Synchronizing with effects](https://react.dev/learn/synchronizing-with-effects)
- [React: Separating events from effects](https://react.dev/learn/separating-events-from-effects)

## Transitions, `useDeferredValue` and Suspense: what does concurrency mean in React?
<!--
id: react-concurrent-features
level: lead
tags: concurrent rendering, usetransition, usedeferredvalue, suspense
minutes: 18
-->

> [!PROMPT]
> A search page filters 20,000 items on every keystroke and typing lags. Someone says "just wrap it in `startTransition`". Explain what that does, what `useDeferredValue` does differently, and what Suspense adds.
>
> **Cover**
> - Urgent versus transition updates, interruptible rendering and what is discarded.
> - When `useDeferredValue` is the better fit (you don't own the state update).
> - What concurrency does not fix (expensive renders that never yield, effects) and how to verify an improvement.

> [!TLDR]
> Concurrent rendering lets React prepare a new UI **in the background** and interrupt that work for more urgent updates. `startTransition` marks an update as non-urgent, so typing stays responsive while a heavy list re-renders, and already-visible content isn't replaced by a spinner. `useDeferredValue` gives you a lagging copy of a value to render the expensive part with. Suspense declares loading boundaries; inside a transition, React keeps showing the old UI instead of falling back.

### The problem it solves

```tsx
function Search() {
  const [query, setQuery] = useState('');
  return (
    <>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <Results query={query} /> {/* renders 5,000 rows: every keystroke janks */}
    </>
  );
}
```

### Fix 1: `useDeferredValue`

```tsx
function Search() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const isStale = query !== deferredQuery;
  return (
    <>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <div style={{ opacity: isStale ? 0.6 : 1 }}>
        <Results query={deferredQuery} /> {/* must be memoized to benefit */}
      </div>
    </>
  );
}

const Results = memo(function Results({ query }: { query: string }) {
  /* expensive render */
});
```

The input updates with urgent priority; the results re-render with the deferred value in an interruptible background render. If the user keeps typing, stale background work is thrown away.

### Fix 2: `useTransition` when you own the state update

```tsx
function Tabs() {
  const [tab, setTab] = useState<'posts' | 'stats'>('posts');
  const [isPending, startTransition] = useTransition();
  return (
    <>
      <TabButton
        selected={tab === 'stats'}
        onClick={() => startTransition(() => setTab('stats'))}
        pending={isPending}
      />
      <Suspense fallback={<Spinner />}>{tab === 'posts' ? <Posts /> : <Stats />}</Suspense>
    </>
  );
}
```

Without the transition, switching to a tab that suspends replaces the current tab with the spinner. With it, React keeps the old tab visible (with `isPending` for a subtle indicator) until `Stats` is ready.

### What it doesn't do

- It doesn't make slow code faster; it keeps the UI **responsive** while slow rendering happens.
- It doesn't help with long tasks **outside** React rendering (a 300ms JSON parse in a handler still blocks).
- Controlled inputs must not be updated inside a transition (the input would lag).

### Suspense boundaries

Suspense catches components that "suspend" (throw a promise / use `use(promise)` / lazy components / Suspense-enabled data libraries) and shows the nearest fallback. Place boundaries to match **visual regions** that can load independently, not around every component. Nested boundaries reveal content progressively; on the server, they enable streaming HTML.

### Follow-ups

- **"Debounce vs `useDeferredValue`?"** Debounce delays work by a fixed time (good for network calls). Deferred values don't delay; they render as soon as possible but interruptibly (good for CPU-bound rendering). They solve different problems and combine well.
- **"How does React interrupt rendering?"** The work loop checks `shouldYield()` between fibers (≈5ms slices), yielding to the browser via a `MessageChannel` task; on the next slice it continues, or restarts if higher-priority updates arrived.

### References

- [React: useTransition](https://react.dev/reference/react/useTransition)
- [React: useDeferredValue](https://react.dev/reference/react/useDeferredValue)
- [React: Suspense](https://react.dev/reference/react/Suspense)

## React Fiber and concurrent rendering: what changed under the hood and what "Concurrent Mode" became
<!--
id: react-fiber-concurrent
level: lead
tags: react, fiber, concurrent rendering, scheduler, lanes, time slicing
minutes: 20
-->

> [!PROMPT]
> Explain React Fiber and concurrent rendering. Why was the reconciler rewritten, how does React pause and resume rendering, and what does "Concurrent Mode" mean today?
>
> **Cover**
> - What a fiber is and why a linked structure replaced recursion.
> - Work loop, double buffering (current and work-in-progress), lanes and time slicing.
> - What stays synchronous, what is interruptible, and the rules this places on your code.
>
> **Test cases**
> - Typing in a search input stays responsive while a 5,000-row list re-renders from a transition.
> - A component's render function is called twice in development and its side effect in the body runs twice. Say why.
> - A Suspense fallback does not flash when navigating inside `startTransition`.

> [!TLDR]
> Before React 16 the reconciler was a recursive function: once it started it could not stop until the whole tree was processed, blocking the main thread. **Fiber** (React 16) rewrote it around a **fiber**: a JS object per component instance that holds its type, props, state, effects and `child`/`sibling`/`return` pointers. Because the traversal is a loop over linked fibers rather than the call stack, React can stop after any unit of work, yield to the browser, and resume or discard the work. React 18 turned that capability into features (transitions, deferred values, Suspense). **"Concurrent Mode" as a separate mode no longer exists**: using `createRoot` makes concurrent rendering possible, and it only happens when you use a concurrent feature.

### What a fiber is

```text
fiber {
  type, key, props           // what to render
  stateNode                  // DOM node or class instance
  child, sibling, return     // tree as linked pointers
  memoizedState              // hooks list for function components
  lanes, flags               // pending priority and the effects to apply
  alternate                  // the other copy of this fiber (double buffering)
}
```

A fiber is both a **unit of work** and the **data structure** of the tree. Walking it needs no recursion: go to `child`, else `sibling`, else climb via `return`.

### Two trees and a work loop

- **Current tree**: what is on screen. **Work-in-progress tree**: the next version being built from it. Each fiber points to its twin through `alternate`; after commit React swaps the roles ("double buffering").
- **Render phase** (interruptible in concurrent rendering): `beginWork` walks down calling components and diffing children, `completeWork` walks back up building DOM nodes and collecting effects. The concurrent work loop checks `shouldYield()` between fibers. The scheduler gives roughly 5 ms slices, then yields to the browser through a `MessageChannel` task so input and paint can run.
- **Commit phase** (always synchronous): mutate the DOM, run layout effects, then schedule passive effects. It cannot be interrupted, because a half-applied commit would show an inconsistent UI.

### Priorities: lanes

Every update is tagged with a **lane** (a bit in a bitmask) such as sync (discrete events like click), default, transition and idle. When a higher-priority update arrives during a lower-priority render, React can **throw away the work-in-progress tree and start again** on the urgent update, then redo the low-priority one afterwards. This is how `startTransition` keeps typing responsive:

```tsx
const [query, setQuery] = useState('');
const [results, setResults] = useState<string[]>([]);
const [isPending, startTransition] = useTransition();

function onChange(event: React.ChangeEvent<HTMLInputElement>) {
  setQuery(event.target.value);                 // urgent: the input must update now
  startTransition(() => {
    setResults(search(event.target.value));     // can be interrupted by the next keystroke
  });
}
```

### What "Concurrent Mode" meant, and what replaced it

Early previews had an all-or-nothing opt-in called Concurrent Mode that changed the behaviour of the whole app. React 18 dropped the mode: `createRoot` enables the new architecture, and concurrent behaviour appears only for updates you mark as non-urgent (`useTransition`, `startTransition`, `useDeferredValue`) and for Suspense. Updates that are not wrapped (a plain `setState` in an event handler) are still rendered urgently. Concurrency is a capability of the renderer, not a switch you flip.

### Consequences for how you write code

- **Render must be pure.** React may call a component, throw the result away, and call it again; it may also pause in the middle. Side effects in the render body (mutations, subscriptions, network calls) will run at the wrong time or twice. Strict Mode double-invokes render and effects in development to surface this.
- **Effects need cleanup.** Strict Mode mounts, unmounts and re-mounts to check it, and real features (Offscreen/Activity, transitions) can do the same.
- **External stores can tear.** If a store changes in the middle of a time-sliced render, different components could read different values in the same render. `useSyncExternalStore` forces a consistent, synchronous snapshot.
- **`useMemo`/`memo` are performance hints**, not semantic guarantees; React may discard cached values.

### Suspense without flashing

Inside `startTransition`, if the new UI suspends, React keeps showing the **old** UI (with `isPending` true) instead of replacing it with a fallback, and commits only when the new UI is ready. Without a transition, a suspended boundary that is already visible falls back to its fallback.

### Follow-ups

- **Is concurrent rendering multithreading?** No. It is cooperative scheduling on one thread: render work is sliced and prioritized, JS still runs on the main thread.
- **Why not make commit interruptible?** DOM changes and refs must appear atomically; a partial commit would show torn UI.
- **Why does the render function run twice in dev?** To expose impure renders and missing cleanups, not because it is slow; production runs it once.
- **Does it make my app faster?** It makes it more responsive by prioritizing urgent work. Total work can even increase because of discarded renders.
- **What about starvation?** React raises the priority of lanes that have been waiting too long so a transition cannot be postponed forever.

> [!WARNING]
> Common mistakes: expecting `startTransition` to make a slow render faster (it only makes it interruptible); wrapping controlled input updates in a transition (the input then lags); mutating variables or refs during render; and thinking "Fiber" is a user-facing API rather than the engine.

### References

- [React 18: Concurrent rendering and the new root API](https://react.dev/blog/2022/03/29/react-v18)
- [React docs: `useTransition`](https://react.dev/reference/react/useTransition)
- [Acdlite: React Fiber Architecture](https://github.com/acdlite/react-fiber-architecture)


## React 19: Actions, `useActionState`, `useOptimistic`, `use` and form handling
<!--
id: react-19-actions
level: senior
tags: react 19, actions, useactionstate, useoptimistic, use, forms
minutes: 15
-->

> [!PROMPT]
> You are building a "rename project" form that should feel instant: show the new name immediately, disable the button while saving, roll back on error and show the server's validation message. Do it with React 19 features instead of manual `isLoading` state.
>
> **Cover**
> - Actions, `useActionState`, `useFormStatus` and `useOptimistic`: what each owns.
> - Behavior on error and on overlapping submissions.
> - Where `use()` fits for reading promises, and what still needs a library (caching, retries).

> [!TLDR]
> React 19 makes async state transitions first-class. An **Action** is an async function run in a transition; React tracks its pending state, errors and ordering. `useActionState` wraps an action and gives you `[state, dispatch, isPending]`. `<form action={fn}>` submits through an action (and works with Server Functions for progressive enhancement). `useOptimistic` shows a temporary value while the action runs and reverts automatically. `use(promise)` reads a promise inside render with Suspense. `ref` is now a normal prop.

### A form with `useActionState`

```tsx
type SaveState = { status: 'idle' } | { status: 'error'; message: string } | { status: 'saved'; at: number };

async function saveProfile(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const name = String(formData.get('name') ?? '').trim();
  if (name.length < 2) return { status: 'error', message: 'Name must be at least 2 characters.' };
  const response = await fetch('/api/profile', { method: 'PUT', body: JSON.stringify({ name }) });
  if (!response.ok) return { status: 'error', message: 'Could not save. Try again.' };
  return { status: 'saved', at: Date.now() };
}

function ProfileForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, isPending] = useActionState(saveProfile, { status: 'idle' });
  return (
    <form action={formAction}>
      <label htmlFor="name">Name</label>
      <input id="name" name="name" defaultValue={defaultName} aria-describedby="name-msg" />
      <SubmitButton />
      <p id="name-msg" role="status">
        {state.status === 'error' ? state.message : state.status === 'saved' ? 'Saved.' : ''}
      </p>
      {isPending ? <span className="sr-only">Saving…</span> : null}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus(); // reads the parent <form>'s status, no prop drilling
  return <button disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>;
}
```

Note: by default React **resets uncontrolled form fields** after a successful action submission, which is great for "add comment" forms and surprising for edit forms (use `defaultValue` from returned state, or controlled inputs).

### Optimistic updates

```tsx
function Likes({ postId, likes }: { postId: string; likes: number }) {
  const [optimisticLikes, addOptimistic] = useOptimistic(likes, (current, delta: number) => current + delta);
  async function like() {
    addOptimistic(1);              // shown immediately
    await api.like(postId);        // when the action finishes, React re-renders from real `likes`
  }
  return (
    <form action={like}>
      <button>♥ {optimisticLikes}</button>
    </form>
  );
}
```

If the request fails, the optimistic value disappears when the transition ends; you still need to show an error (an error boundary catches thrown action errors, or return error state).

### `use`

```tsx
function Comments({ commentsPromise }: { commentsPromise: Promise<Comment[]> }) {
  const comments = use(commentsPromise); // suspends until resolved; can be called conditionally
  return <ul>{comments.map((c) => <li key={c.id}>{c.text}</li>)}</ul>;
}
```

The promise must be **stable** (created outside render, cached, or passed from a Server Component); creating it inside the component re-creates it every render and suspends forever.

### Other changes worth knowing

- `ref` as a prop for function components; ref callbacks can return a cleanup.
- `<Context>` can be rendered directly as a provider.
- Document metadata (`<title>`, `<meta>`, `<link>`) can be rendered anywhere and hoisted to `<head>`.
- Resource preloading APIs: `preload`, `preinit`, `preconnect`.
- Better hydration error messages, and support for third-party scripts/extensions that mutate the DOM.

### Follow-ups

- **"How do Actions differ from just calling an async function in onClick?"** Actions run in transitions: React tracks pending state, keeps UI responsive, sequences multiple submissions, integrates with Suspense/error boundaries and with server functions. A plain async handler gives you none of that unless you build it.
- **"Would you still use react-hook-form?"** For complex client-side validation, field arrays and dirty tracking, yes; it can submit through an action. For simple forms, `useActionState` + native validation is enough.

### References

- [React 19 release post](https://react.dev/blog/2024/12/05/react-19)
- [React: useActionState](https://react.dev/reference/react/useActionState)
- [React: useOptimistic](https://react.dev/reference/react/useOptimistic)
- [React: use](https://react.dev/reference/react/use)

## Server-side rendering vs client-side rendering in React: hydration, streaming and when each wins
<!--
id: react-ssr-vs-csr-hydration
level: senior
tags: ssr, csr, hydration, streaming, react, core web vitals, seo
minutes: 18
-->

> [!PROMPT]
> How does server-side rendering differ from client-side rendering in React? Walk through what the browser receives and does in each case, explain hydration and why mismatches happen, and say what streaming SSR improves.
>
> **Cover**
> - The request timeline and Core Web Vitals impact of CSR vs SSR.
> - What `hydrateRoot` does and the usual hydration errors.
> - Streaming SSR and selective hydration, costs of SSR, and how to choose.
>
> **Test cases**
> - Viewing the page source of a CSR app shows an empty root; an SSR app shows the real content.
> - A component that renders `new Date().toLocaleString()` produces a hydration mismatch warning; fix it.
> - A slow comment section does not delay the article if it sits in its own Suspense boundary.

> [!TLDR]
> **CSR**: the server sends a nearly empty HTML shell; the browser downloads and runs the JS bundle, fetches data, and React builds the DOM, so users see content late but navigation afterwards is fast and hosting is just static files. **SSR**: the server runs React to produce real HTML for each request, so users see content (and crawlers read it) before the JS arrives; the page then needs **hydration**, where React attaches event handlers to the existing HTML and checks it matches. SSR improves first paint and SEO at the cost of server work, higher TTFB, a page that looks ready before it is interactive, and the requirement that server and client render **identically**. Streaming SSR with Suspense sends HTML in chunks and hydrates parts independently.

### Timelines

```text
CSR:  request -> tiny HTML -> download JS -> run JS -> fetch data -> render -> content visible
SSR:  request -> server fetches data + renders HTML -> content visible -> download JS -> hydrate -> interactive
```

| | CSR | SSR |
| --- | --- | --- |
| First contentful paint / LCP | Late: waits for JS and data | Early: HTML already contains content |
| TTFB | Fast (static file) | Slower (server work per request, mitigated by caching and streaming) |
| Interactivity | When JS has run | After hydration; there is a window where the page is visible but not interactive |
| SEO and link previews | Depends on the crawler running JS | HTML is ready for any crawler |
| Hosting | Any static host or CDN | A server or edge runtime (or static generation for pages that don't change) |
| Data fetching | After JS loads (waterfall risk) | On the server, close to the data |
| Best for | Apps behind login, dashboards, editors | Public, content-heavy or SEO-critical pages |

### Hydration

```tsx
// server (Node): produces HTML, streaming as parts become ready
import { renderToPipeableStream } from 'react-dom/server';
const { pipe } = renderToPipeableStream(<App />, {
  bootstrapScripts: ['/client.js'],
  onShellReady() { response.setHeader('content-type', 'text/html'); pipe(response); },
});

// client: reuse the server HTML instead of rebuilding it
import { hydrateRoot } from 'react-dom/client';
hydrateRoot(document.getElementById('root')!, <App />);
```

`hydrateRoot` walks the existing DOM, attaches event handlers and creates the component tree. It does **not** repair differences: if the first client render does not produce the same output as the server HTML, React warns and, depending on the case, patches it or discards the server HTML for that boundary and renders on the client (slower, and visible as a flash).

### Typical mismatches and fixes

Sources of mismatch: `Date.now()`, `Math.random()`, locale and time-zone formatting, `window`/`localStorage` reads during render, browser extensions that modify the DOM, invalid HTML nesting (`<div>` inside `<p>`), and different data on server and client.

```tsx
function LocalTime({ iso }: { iso: string }) {
  // First render uses a value that is identical on server and client...
  const [text, setText] = useState(() => new Date(iso).toISOString());
  // ...then the browser-specific value is applied after hydration.
  useEffect(() => setText(new Date(iso).toLocaleString()), [iso]);
  return <time dateTime={iso}>{text}</time>;
}
```

Other tools: `useId` for ids that match on both sides, `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)` for browser-only stores, and `suppressHydrationWarning` for a single unavoidable text difference (it only works one level deep).

### Streaming SSR and selective hydration

Since React 18, `renderToPipeableStream` (Node) and `renderToReadableStream` (edge runtimes) stream HTML:

- The **shell** (everything outside Suspense boundaries) is sent first. Suspended parts send their fallback, then stream the real HTML when ready.
- **Selective hydration**: each Suspense boundary hydrates independently, so a slow or heavy section does not block the rest. If the user interacts with a boundary that has not hydrated yet, React prioritizes it and replays the event.
- The older `renderToString` is synchronous, blocks on the whole tree and does not support Suspense for data; prefer the streaming APIs.

```tsx
<Layout>
  <Article id={id} />                      {/* in the shell: shown immediately */}
  <Suspense fallback={<CommentsSkeleton />}>
    <Comments articleId={id} />            {/* streams in later, hydrates independently */}
  </Suspense>
</Layout>
```

### Costs of SSR to say out loud

- Server CPU and latency per request; cache HTML at the CDN for anonymous traffic and use streaming for personalized parts.
- The "uncanny valley": visible but not yet interactive, which hurts INP for early clicks. Smaller bundles, selective hydration and Server Components reduce it.
- Complexity: two runtimes (no `window` on the server), mismatch bugs, and data that must be serialized into the page.
- Duplicate work: components render once on the server and again on the client during hydration; **React Server Components** avoid sending some component code to the client at all.

### How to choose

Public, SEO-sensitive, content-first pages: SSR or static generation. Personalized pages needing fast first paint: SSR with streaming. Authenticated apps and tools: CSR is simpler and often fine, with code splitting. Most products mix per route, and use a framework (Next.js, React Router in framework mode, Remix) rather than a hand-rolled server.

### Follow-ups

- **SSR vs SSG?** SSG renders at build time (or on first request with ISR), so the HTML can be served from a CDN; SSR renders per request.
- **Is hydration the only way to make SSR interactive?** In React, yes for client components; Server Components and islands architectures hydrate less or nothing.
- **Does SSR fix a slow API?** No; it moves the wait to the server. Cache data, stream, or reduce the blocking work before the shell.
- **What changed in React 19 for hydration?** Better error messages that show a diff of the mismatch, and third-party scripts or extensions that inject elements into `<head>` and `<body>` no longer cause mismatches.

> [!WARNING]
> Common mistakes: reading `window` or `localStorage` during render; non-deterministic values in render; assuming SSR makes the app faster in all cases; hydrating a huge page in one piece; and using `renderToString` for new work.

### References

- [React docs: `hydrateRoot`](https://react.dev/reference/react-dom/client/hydrateRoot)
- [React docs: `renderToPipeableStream`](https://react.dev/reference/react-dom/server/renderToPipeableStream)
- [web.dev: Rendering on the Web](https://web.dev/articles/rendering-on-the-web)


## React Server Components: the mental model, the boundaries and the costs
<!--
id: react-server-components
level: lead
tags: rsc, server components, next.js, streaming, use client
minutes: 20
-->

> [!PROMPT]
> Your team is deciding whether to adopt React Server Components for a dashboard with mostly read-only data and a few interactive widgets. Explain the model so the team can decide.
>
> **Cover**
> - What runs where, the `"use client"` boundary and what can cross it (serializable props only).
> - Benefits (bundle size, data access near the source) and costs (mental model, caching, waterfalls, testing, hosting).
> - A boundary design for the dashboard, and the mistakes you've seen (client component at the root, passing functions).

> [!TLDR]
> Server Components run **only on the server** (at build or request time). They can read data directly (DB, internal services), and their code never ships to the browser; they send a serialized UI description (the RSC payload). Client Components (`'use client'`) are ordinary React components that hydrate and handle interactivity. The boundary is a module boundary: props crossing it must be serializable. Benefits: less JS, no client waterfalls for data, secrets stay on the server. Costs: a new mental model, framework coupling, caching complexity and a network round trip for server-driven updates.

### The model

```text
Request → server renders Server Components (async, can await data)
        → output: RSC payload (tree with placeholders for Client Components + their props)
        → streamed to the browser alongside HTML (SSR of the same tree)
Browser → renders HTML immediately, loads JS only for Client Components, hydrates them
Navigation → fetches a new RSC payload, React merges it, client state is preserved
```

### Composition rules

```tsx
// app/products/[id]/page.tsx (Server Component by default)
import { AddToCart } from './add-to-cart'; // client component

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await db.product.findUnique({ where: { id } }); // direct data access, no API hop
  if (!product) notFound();
  return (
    <article>
      <h1>{product.name}</h1>
      <Price amount={product.price} />                 {/* server-only, zero JS */}
      <AddToCart productId={product.id} />             {/* ships JS, hydrates */}
      <Suspense fallback={<ReviewsSkeleton />}>
        <Reviews productId={product.id} />             {/* streams in when ready */}
      </Suspense>
    </article>
  );
}
```

```tsx
// add-to-cart.tsx
'use client';
export function AddToCart({ productId }: { productId: string }) {
  const [pending, startTransition] = useTransition();
  return <button disabled={pending} onClick={() => startTransition(() => addToCart(productId))}>Add</button>;
}
```

- Server Components can render Client Components and pass **serializable props** (no functions, except Server Functions).
- Client Components **cannot import** Server Components, but can receive them as `children`/props from a Server parent. That's how you keep big server-rendered trees inside a client layout.
- `'use client'` marks an **entry point**: everything that module imports becomes client code. Put the directive as low in the tree as possible.

### What you gain

- **Bundle size**: markdown renderers, date libraries, syntax highlighters used only for rendering stay on the server.
- **Data fetching close to the source**, in parallel, without client → API → DB waterfalls.
- **Security**: tokens and queries never reach the client (still validate everything in Server Functions; they're public endpoints).

### What it costs

- Two kinds of components and a boundary to reason about; mistakes leak server code or bloat the client.
- **Caching semantics** (framework-specific: per-request memoization, data cache, full route cache) are a common source of "why is this stale?" bugs.
- Interactions that need server data require a round trip (Server Function or refetch), which is slower than a local state update.
- Tight coupling to a framework/bundler (Next.js App Router, React Router/Waku/Parcel integrations).

> [!PRINCIPAL]
> Adopt RSC where content dominates and interactivity is islands (e-commerce, docs, marketing, dashboards with read-heavy views). For highly interactive apps (editors, design tools, complex consoles), the win is smaller; a SPA with good code splitting and a solid data layer may be simpler. Decide per product surface, and measure: JS bytes, LCP, INP, and server cost.

### Follow-ups

- **"Server Components vs SSR?"** SSR renders client components to HTML for the first paint, then hydrates *all* of them. RSC changes which components exist on the client at all. They complement each other.
- **"Can a Server Component use state or effects?"** No: no hooks that depend on client lifecycle, no browser APIs, no event handlers.
- **"How do mutations work?"** Server Functions (`'use server'`) called from forms/actions; then revalidate the affected data/route so the server tree re-renders.

### References

- [React: Server Components](https://react.dev/reference/rsc/server-components)
- [React: 'use client'](https://react.dev/reference/rsc/use-client)
- [Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)

## `useSyncExternalStore`, tearing, and how state libraries integrate with concurrent React
<!--
id: external-stores-tearing
level: lead
tags: usesyncexternalstore, tearing, zustand, redux, concurrent rendering
minutes: 12
-->

> [!PROMPT]
> A homegrown store works fine in React 17 but shows inconsistent numbers in two parts of the screen under React 18 transitions. Explain the bug and how `useSyncExternalStore` fixes it.
>
> **Cover**
> - What tearing is and why interruptible rendering makes it possible.
> - The `subscribe` and `getSnapshot` contract (stable snapshots, no new object per call) and the infinite-loop trap.
> - How Redux, Zustand or Jotai integrate, and when you'd skip an external store entirely.

> [!TLDR]
> **Tearing** is when one render shows inconsistent values from an external store because the store changed mid-render (possible once rendering is interruptible). `useSyncExternalStore(subscribe, getSnapshot)` fixes it: React reads a snapshot, and if it changed during a concurrent render, re-renders synchronously so the whole UI shows one version. Rules: `subscribe` must be stable, `getSnapshot` must return the **same reference** when nothing changed, and selectors must not create new objects each call.

### Minimal store + hook

```ts
type Listener = () => void;

export function createStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    getState: () => state,
    setState(update: (prev: T) => T) {
      const next = update(state);
      if (Object.is(next, state)) return;
      state = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T, S>(store: ReturnType<typeof createStore<T>>, selector: (state: T) => S): S {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()), // server snapshot for SSR
  );
}
```

> [!NOTE]
> This app (the one you're reading this in) uses exactly this pattern for progress, preferences and routing. Its source is in `src/state/createStore.ts` and `useStore.ts`.

### The infinite-loop trap

```ts
const todos = useStore(store, (s) => s.todos.filter((t) => !t.done)); // new array every call → loops
```

`getSnapshot` returning a new reference each time tells React the store changed every time it checks. Fix by selecting a stable slice and deriving with `useMemo`, or by memoizing the selector on its input (what `reselect` and Zustand's `useShallow` help with).

### Why not `useState` + `useEffect` subscription?

The old pattern subscribes after paint (missing updates in between), causes an extra render, and can tear under concurrent rendering. `useSyncExternalStore` is what Redux, Zustand, Jotai and React Query use internally now.

### Trade-off

Updates from external stores are always **synchronous** (they de-opt transitions): you can't make a store update non-blocking with `startTransition`. If you need that, keep the state in React (`useState`/`useReducer`) or in a library designed around transitions.

### References

- [React: useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)
- [React 18 working group: what is tearing?](https://github.com/reactwg/react-18/discussions/69)

## What does the React Compiler change about `useMemo`, `useCallback` and how you write components?
<!--
id: react-compiler-memoization
level: lead
tags: react compiler, memoization, usememo, usecallback, rules of react
minutes: 10
-->

> [!PROMPT]
> Your codebase has hundreds of `useMemo` and `useCallback` calls, some wrong. The team is considering turning on the React Compiler. What changes, and what do you do on day one?
>
> **Cover**
> - What the compiler memoizes, and what it refuses to compile (rules of React violations).
> - How you adopt it incrementally (directives, ESLint plugin, measuring) and what you stop writing.
> - Where manual memoization remains justified, and how to confirm the compiler actually helped.

> [!TLDR]
> The React Compiler is a build-time plugin that analyzes components and hooks and inserts fine-grained memoization automatically: values, callbacks and JSX are cached per their actual dependencies. It makes most manual `useMemo`/`useCallback`/`memo` unnecessary, but only for code that follows the **Rules of React** (pure render, no mutation of props/state, hooks rules). Code it can't prove safe is skipped, so adoption starts with fixing lint violations.

### What it does

```tsx
// You write:
function TodoList({ todos, filter }: { todos: Todo[]; filter: Filter }) {
  const visible = todos.filter((t) => matches(t, filter));
  const onToggle = (id: string) => toggle(id);
  return <List items={visible} onToggle={onToggle} />;
}
// The compiler emits roughly: cache `visible` keyed on [todos, filter], cache `onToggle`,
// and cache the <List> element itself so List doesn't re-render when nothing it uses changed.
```

It memoizes at a finer granularity than you would by hand (including JSX elements), and it doesn't forget a dependency.

### What still matters

- **Purity**: mutating objects during render, reading refs during render, or side effects in render make the compiler bail out (or worse, produce wrong UI if the code was already buggy).
- **Effects** remain your responsibility: the compiler doesn't remove unnecessary effects or fix dependency logic.
- **Architecture** (state colocation, splitting contexts, virtualization) still dominates performance.
- **Escape hatches**: `'use no memo'` directive to opt a component out while debugging.

### Adoption plan for a large codebase

1. Enable `eslint-plugin-react-hooks` compiler-related rules everywhere; fix violations.
2. Turn the compiler on for one directory/package (`sources` filter or annotation mode).
3. Compare React DevTools profiles and E2E tests; watch for behavior changes in code that relied on re-rendering.
4. Expand gradually; delete manual memoization only when the compiler covers that code.

### Follow-ups

- **"Should I remove all `useMemo` calls?"** Not blindly. They're harmless with the compiler; remove them opportunistically. Keep memoization that exists for **semantic** reasons (stable identity for an effect dependency or an external API), and document it.
- **"Does it replace `React.memo`?"** Effectively, for compiled components: children receive stable props and cached elements, so they skip re-rendering.

### References

- [React: React Compiler](https://react.dev/learn/react-compiler)
- [React: Rules of React](https://react.dev/reference/rules)

## Stale closures in hooks: how do you diagnose and fix them?
<!--
id: stale-closures-hooks
level: senior
tags: closures, hooks, useref, functional updates, useeffectevent
minutes: 12
-->

> [!PROMPT]
> A counter shows the right number but a `setInterval` callback inside `useEffect` always logs `0`, and a "Save" button sometimes saves the previous form values. Diagnose both and give the fixes.
>
> **Cover**
> - Why every render closes over its own props and state.
> - Fixes: functional updates, correct dependency arrays, refs for the latest value, effect events (`useEffectEvent`), or restructuring.
> - How to spot these bugs in review, and what the exhaustive-deps lint rule can and cannot tell you.

> [!TLDR]
> Every render creates new functions that close over **that render's** props and state. A callback created in an earlier render and called later (by a timer, subscription, or memoized handler) sees old values. Fix it by putting the value in the dependency list (re-creating the callback), using **functional updates** (`setCount(c => c + 1)`) so you don't need the value at all, reading from a **ref** that always holds the latest value, or using `useEffectEvent` for effect logic that must see fresh values without re-subscribing.

### The bug

```tsx
function Timer() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setCount(count + 1), 1000); // `count` is always 0 here
    return () => clearInterval(id);
  }, []); // lint warning ignored
  return <p>{count}</p>; // shows 1 forever
}
```

### Fixes, from best to most situational

```tsx
// 1. Functional update: the callback doesn't need `count` at all.
useEffect(() => {
  const id = setInterval(() => setCount((c) => c + 1), 1000);
  return () => clearInterval(id);
}, []);

// 2. Include the dependency: correct but re-creates the interval every tick.
useEffect(() => {
  const id = setInterval(() => setCount(count + 1), 1000);
  return () => clearInterval(id);
}, [count]);

// 3. Effect event: read latest props/state inside an effect without making them dependencies.
function ChatRoom({ roomId, theme }: { roomId: string; theme: Theme }) {
  const onConnected = useEffectEvent(() => showToast('Connected', theme)); // always latest theme
  useEffect(() => {
    const connection = connect(roomId);
    connection.on('connected', onConnected);
    return () => connection.disconnect();
  }, [roomId]); // reconnect only when the room changes, not when the theme does
}

// 4. Latest-value ref (pre-useEffectEvent pattern).
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
```

### How to spot them

- A value "freezes" at its initial value inside a timer, socket handler or `addEventListener` callback.
- `useCallback(fn, [])` that reads state.
- An `// eslint-disable-next-line react-hooks/exhaustive-deps` comment nearby. Treat that comment as a bug report.

### Follow-ups

- **"Why not just use refs for everything?"** Refs don't trigger renders and bypass React's data flow; overusing them recreates the mutable-state bugs hooks were designed to avoid. Use them for values read in callbacks, not for values rendered.
- **"Is this a React problem?"** It's a JavaScript closure property. Class components had the inverse problem: `this.props` was always latest, even when you wanted the values from the render where the event happened.

### References

- [React: useEffectEvent](https://react.dev/reference/react/useEffectEvent)
- [React: Removing effect dependencies](https://react.dev/learn/removing-effect-dependencies)
- [Dan Abramov: Making setInterval declarative with React hooks](https://overreacted.io/making-setinterval-declarative-with-react-hooks/)
