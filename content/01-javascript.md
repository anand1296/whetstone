---
id: javascript-internals
title: JavaScript Internals
description: The runtime model under every framework: event loop, closures and memory, this, prototypes, modules, and the meta-programming APIs.
facets: frontend, javascript
---

## Walk through the event loop: tasks, microtasks, and where rendering fits
<!--
id: event-loop-rendering-order
level: senior
tags: event loop, microtasks, rendering, requestAnimationFrame, long tasks
minutes: 15
-->

> [!PROMPT]
> A teammate's click handler does three things in a row: it shows a loading spinner, runs a heavy synchronous loop, then hides the spinner. When you click, the page freezes for a moment and the spinner is never visible.
>
> ```js
> button.onclick = () => {
>   spinner.hidden = false;
>   heavyWork(); // about 300ms of synchronous work
>   spinner.hidden = true;
> };
> ```
>
> A second snippet registers a `setTimeout`, a `Promise.then`, a `requestAnimationFrame` callback and a `queueMicrotask` callback in one handler, and nobody on the team can predict the order they log in.

> [!HINT]
> - Why the spinner never shows, even though the code sets it before the loop.
> - The order of those four callbacks, and why.
> - Exactly when the browser is allowed to render, and how you would make the spinner show.

> [!TLDR]
> The browser runs one **task** at a time (a script, a click handler, a timer callback). After each task it drains the **microtask queue** completely (promise reactions, `queueMicrotask`, `MutationObserver`). Then, roughly every frame, it may **render**: run `requestAnimationFrame` callbacks, recalculate style, layout, paint. Rendering can only happen *between* tasks, so a long task or an endless microtask chain blocks paint and input.

### What the interviewer is testing

Not the trivia of print order. They want to know whether you can explain *why* the UI freezes, why a spinner doesn't show, or why `setTimeout(fn, 0)` "fixes" a bug. Lead with the model, then use the puzzle to prove it.

### The model

```text
┌──────────── one turn of the event loop ─────────────┐
│ 1. pick ONE task (oldest from a chosen task queue)   │
│ 2. run it to completion (call stack empties)         │
│ 3. drain ALL microtasks (including ones they queue)  │
│ 4. if it's time for a frame (≈16.7ms @60Hz):         │
│      rAF callbacks → style → layout → paint          │
│      (+ ResizeObserver, IntersectionObserver)        │
│ 5. idle time? requestIdleCallback                    │
└──────────────────────────────────────────────────────┘
```

Key consequences:

- **Microtasks run before rendering.** Ten thousand chained `.then()`s run back-to-back with no paint in between.
- **Tasks yield to rendering.** `setTimeout(fn, 0)` gives the browser a chance to paint before `fn` runs (not guaranteed, but possible).
- **`requestAnimationFrame` runs right before paint**, so it is where you read the frame's final layout and write animated styles.
- There are multiple task queues (user input, timers, network). Browsers may prioritize input, which is why `setTimeout` order relative to clicks is not something to rely on.

### The classic puzzle

```js
console.log('1 sync');
setTimeout(() => console.log('2 timeout'), 0);
Promise.resolve().then(() => console.log('3 microtask'));
queueMicrotask(() => console.log('4 microtask'));
requestAnimationFrame(() => console.log('5 rAF'));
(async () => {
  console.log('6 async fn body (sync part)');
  await null;
  console.log('7 after await (microtask)');
})();
console.log('8 sync');
```

Output: `1, 6, 8, 3, 4, 7, 2, 5` in most runs, but **2 and 5 can swap**. The timer is a task; rAF is part of the rendering step, and whether a frame is due before the timer task gets picked depends on timing. Saying "it depends, and here's why" is the senior answer.

### Why the spinner doesn't show

```ts
function onSubmit() {
  setLoading(true);            // React schedules a render
  const result = heavySyncWork(); // 400ms on the main thread
  setLoading(false);
}
```

No frame can be painted until the handler returns, so the user never sees `loading === true`. Fixes, in order of preference: move the work off the main thread (Web Worker), split it into chunks and **yield** between them, or at minimum defer the heavy part so a frame can paint first.

```ts
// Yield to the browser so input and paint can happen between chunks.
function yieldToMain(): Promise<void> {
  if ('scheduler' in globalThis && 'yield' in scheduler) {
    return scheduler.yield(); // continuation keeps priority over other tasks
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function processInChunks<T>(items: T[], work: (item: T) => void, budgetMs = 8) {
  let deadline = performance.now() + budgetMs;
  for (const item of items) {
    work(item);
    if (performance.now() >= deadline) {
      await yieldToMain();
      deadline = performance.now() + budgetMs;
    }
  }
}
```

> [!WARNING]
> Yielding with `await Promise.resolve()` does **not** yield to the browser. It queues a microtask, and microtasks are drained before rendering. You need a task boundary (`setTimeout`, `MessageChannel`, `scheduler.yield()`).

### Edge cases worth naming

- **Microtask starvation:** a recursive `queueMicrotask` loop freezes the page as hard as `while (true)`.
- **Timers are clamped:** nested timers get a minimum of ~4ms, and background tabs are throttled to 1s or more. Never build clocks on `setTimeout` accuracy.
- **`await` always defers**, even when awaiting a non-promise. Code after `await` runs in a microtask.
- **Node.js differs**: `process.nextTick` runs before promise microtasks, and phases (timers, poll, check) replace the rendering step.

### Follow-ups

- **"How does React fit in?"** React's scheduler uses `MessageChannel` tasks to time-slice concurrent renders and yields every ~5ms, so input can be handled between slices. Synchronous updates (e.g. discrete events like clicks in some paths) flush without yielding.
- **"What's a long task?"** Any task over 50ms. The Long Animation Frames API (LoAF) attributes slow frames to scripts, which is what you use to debug INP.
- **"Where do `IntersectionObserver` callbacks run?"** During the rendering steps, after layout, so they're batched per frame rather than per scroll event.

### References

- [Jake Archibald: Tasks, microtasks, queues and schedules](https://jakearchibald.com/2015/tasks-microtasks-queues-and-schedules/)
- [HTML spec: event loops](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops)
- [web.dev: Optimize long tasks](https://web.dev/articles/optimize-long-tasks)
- [MDN: Microtask guide](https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide)

## How do closures cause memory leaks in a long-lived SPA, and how do you find them?
<!--
id: closures-memory-leaks
level: senior
tags: closures, memory, garbage collection, devtools, heap snapshot
minutes: 15
-->

> [!PROMPT]
> Your support dashboard is open all day. After a few hours the tab uses 1.5 GB and scrolling stutters. Heap snapshots show thousands of detached DOM nodes and closures. The app has global event listeners, polling timers and a module-level cache.

> [!HINT]
> - How a closure keeps data alive, with a concrete leaking example.
> - The steps you take in DevTools (heap snapshots, allocation timeline, retainer paths) to find the culprit.
> - The patterns that prevent the leak (cleanup functions, `AbortController`, `WeakMap`, bounded caches).

> [!TLDR]
> A closure keeps its whole scope reachable for as long as the function itself is reachable. Leaks happen when something long-lived (a global listener, a timer, a module-level cache, a subscription) holds a function that captured something large, often a detached DOM tree or an old component's state. Find them with heap snapshots (compare before/after a repeated action, look for "Detached" nodes and growing retainers) and fix them by giving every subscription an owner and a cleanup.

### Mental model

The garbage collector frees objects that are unreachable from roots (globals, the stack, active handles). A function object references its **lexical environment**. So:

```text
window ──listeners──▶ onResize (function) ──scope──▶ { bigTable, rowsCache, chartInstance }
```

As long as `window` holds `onResize`, everything in its scope is alive, even if the component that created it unmounted an hour ago.

> [!NOTE]
> Engines share one context object per scope among all closures created in it. If two inner functions are created in the same scope and only one uses `hugeArray`, the long-lived one may still keep `hugeArray` alive. Keep long-lived callbacks in small scopes.

### The usual suspects in SPAs

| Leak | Why it leaks | Fix |
| --- | --- | --- |
| `addEventListener` on `window`/`document` without removal | Target outlives component | Remove in cleanup, or pass `{ signal }` and abort |
| `setInterval` / recursive `setTimeout` | Timer handle is a root | `clearInterval` in cleanup |
| Subscriptions (stores, sockets, observers) | Emitter holds the callback | Call unsubscribe / `disconnect()` |
| Module-level caches (`Map` keyed by object) | Map holds keys strongly | `WeakMap`, or bounded LRU |
| Detached DOM kept in variables/closures | JS reference keeps the tree | Null out refs, don't cache nodes globally |
| Closures stored on long-lived objects (`window.__debug = () => state`) | Global root | Don't, or gate to dev |
| Unresolved promises chained to big data | Pending reaction keeps scope | Abort and settle requests |

### A cleanup pattern that scales: `AbortController` as an owner

```ts
function useWindowEvent<K extends keyof WindowEventMap>(
  type: K,
  handler: (event: WindowEventMap[K]) => void,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler; // always call the latest without re-subscribing

  useEffect(() => {
    const controller = new AbortController();
    window.addEventListener(type, (event) => handlerRef.current(event), { signal: controller.signal });
    return () => controller.abort(); // one call removes every listener tied to this signal
  }, [type]);
}
```

One signal can own many listeners, fetches and custom subscriptions, so "tear down everything this feature created" becomes a single `abort()`.

### How to find a leak (a workflow you can describe)

1. **Reproduce with a loop.** Pick an action that should be memory-neutral: open and close a modal, navigate A → B → A. Do it 10 times.
2. **Heap snapshot before and after** (DevTools → Memory). Force GC first (the trash-can button).
3. **Compare view**: sort by "# Delta" or "Size Delta". Things growing by exactly 10 are your suspects.
4. **Search "Detached"** to find DOM trees no longer in the document but still referenced.
5. **Read the Retainers panel** bottom-up: it shows the chain from a GC root to the object, e.g. `Window → listeners → closure → context → table`.
6. Confirm the fix with the same loop and a flat memory line in the **Performance monitor** or the allocation timeline.

In production, watch `performance.measureUserAgentSpecificMemory()` (cross-origin isolated pages only) or RUM metrics like JS heap size trends per session length.

> [!WARNING]
> React's StrictMode double-invocation catches missing cleanups early. Turning StrictMode off to "fix" double subscriptions hides exactly these leaks.

### Follow-ups

- **"Does React leak if I forget to clean up?"** React drops its references to unmounted fibers, but it cannot remove a listener *you* attached to `window`. That listener keeps the closure, and the closure keeps the state and DOM refs it captured.
- **"WeakMap vs WeakRef here?"** `WeakMap` for associating data with objects you don't own (no leak through the key). `WeakRef` rarely: caches where you can tolerate the value disappearing at any time.
- **"How would you catch regressions?"** A Playwright/Puppeteer test that repeats a flow and asserts `JSHeapUsedSize` (via CDP `Performance.getMetrics`) stays within a band; tools like `memlab` automate the detached-node analysis.

### References

- [Chrome DevTools: Fix memory problems](https://developer.chrome.com/docs/devtools/memory-problems)
- [MDN: Memory management](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Memory_management)
- [memlab (Meta)](https://facebook.github.io/memlab/)

## Explain `this` binding precisely, including arrow functions and class fields
<!--
id: this-binding-rules
level: senior
tags: this, arrow functions, classes, bind
minutes: 10
-->

> [!PROMPT]
> You are reviewing a pull request where a class method is passed as a callback and `this` is `undefined` at runtime, while a very similar arrow-function class field works. A colleague asks why `setTimeout(obj.method)` loses the object but `obj.method()` doesn't.
>
> **Predict the output**
> - `const f = obj.method; f()` in a module (strict mode).
> - `obj.method.call(other)` and `obj.method.bind(a).call(b)`.
> - A method that contains a nested `function` versus a nested arrow function.
>
> Explain the precedence of the binding rules and when arrow-function class fields are the wrong choice.

> [!TLDR]
> `this` is decided by **how a function is called**, not where it is defined, except for arrow functions, which have no `this` of their own and use the enclosing scope's. The precedence is: `new` > explicit (`call`/`apply`/`bind`) > method call (`obj.fn()`) > default (`undefined` in strict mode/modules, `globalThis` in sloppy scripts). Class field arrow functions capture the instance at construction time.

### The four call-site rules

```js
'use strict';
function who() { return this; }

who();                       // undefined          (default binding)
const obj = { who };
obj.who();                   // obj                (implicit / method call)
who.call({ id: 1 });         // { id: 1 }          (explicit)
const bound = who.bind({ id: 2 });
bound.call({ id: 3 });       // { id: 2 }          (bind wins over call)
new who();                   // fresh object       (new wins over bind's this)
```

### Losing `this`: the bug you will see in reviews

```ts
class Counter {
  count = 0;
  increment() {
    this.count++;
  }
}
const c = new Counter();
button.addEventListener('click', c.increment); // `this` is the button (DOM calls it as a method of the target)
setTimeout(c.increment, 10);                   // `this` is undefined in strict code → TypeError
```

Three fixes and their trade-offs:

```ts
class Counter {
  count = 0;

  // 1. Arrow class field: bound per instance. Easy, but one function per instance,
  //    not on the prototype (can't be overridden via super, slightly more memory).
  incrementField = () => {
    this.count++;
  };

  // 2. Prototype method, bind at the call site when passing it around.
  increment() {
    this.count++;
  }
}

const c = new Counter();
setTimeout(() => c.increment(), 10); // 3. Wrap in an arrow at the call site (most explicit)
```

### Arrow functions

- No own `this`, `arguments`, `super` or `new.target`; all resolved lexically.
- `call`/`bind` cannot change an arrow's `this`.
- Don't use arrows as object methods that need the object: `{ name: 'a', greet: () => this.name }` reads the outer `this`.

### Edge cases

- **Callbacks with a `thisArg`**: `arr.map(fn, thisArg)` sets `this` for non-arrow `fn`.
- **Getters/setters** get the receiver (`obj` in `obj.prop`), which matters with prototype chains and `Proxy`/`Reflect.get(target, key, receiver)`.
- **Modules and classes are strict**, so default binding gives `undefined`, not `window`.
- **DOM `on*` attributes** (`onclick="..."`) bind `this` to the element.

### Follow-ups

- **"Why did React class components need `this.handleClick = this.handleClick.bind(this)`?"** JSX passes the method as a plain function reference, so the call site loses the instance. Function components and hooks removed the problem by not using `this` at all.
- **"Implement `bind`."** Return a function that calls the original with the fixed `this` and pre-filled arguments. Variadic tuple types let TypeScript infer the remaining parameters. A spec-complete polyfill also handles `new` (when `new.target` is set, construct instead of calling), which you can mention rather than write.

```ts
function myBind<T, A extends unknown[], B extends unknown[], R>(
  fn: (this: T, ...args: [...A, ...B]) => R,
  thisArg: T,
  ...bound: A
): (...rest: B) => R {
  return (...rest) => fn.apply(thisArg, [...bound, ...rest]);
}

function greet(this: { name: string }, greeting: string, punctuation: string) {
  return `${greeting}, ${this.name}${punctuation}`;
}
const hello = myBind(greet, { name: 'Ada' }, 'Hello'); // (punctuation: string) => string
hello('!'); // "Hello, Ada!"
```

### References

- [MDN: this](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/this)
- [MDN: Arrow functions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions)

## How do prototypes, classes and private fields actually work under the hood?
<!--
id: prototypes-classes-private
level: senior
tags: prototypes, classes, private fields, inheritance
minutes: 12
-->

> [!PROMPT]
> An interviewer asks you to explain what happens when you write `class B extends A`, call `new B()`, and read a property that exists only on `A.prototype`. Then they ask whether `#secret` is the same as a `_secret` convention, and why a Babel-compiled class can behave differently from the native one.

> [!HINT]
> - The prototype chain created by `extends` and where `super` lookups go.
> - What `new` does step by step.
> - How private fields differ from properties (brand checks, no reflection, not inherited).
> - Observable differences between classes and constructor functions.

> [!TLDR]
> Every object has an internal `[[Prototype]]` link; property lookups walk that chain. `class` is mostly syntax over constructor functions and `prototype` objects, with real differences: classes are strict, must be called with `new`, have `super`/`[[HomeObject]]` semantics, and `#private` fields are stored per-instance in a way that is truly inaccessible from outside (not just by convention) and checked by a "brand" (`#x in obj`).

### The lookup chain

```js
class Animal {
  constructor(name) { this.name = name; }
  speak() { return `${this.name} makes a sound`; }
}
class Dog extends Animal {
  speak() { return `${super.speak()} (woof)`; }
}
const rex = new Dog('Rex');

Object.getPrototypeOf(rex) === Dog.prototype;                // true
Object.getPrototypeOf(Dog.prototype) === Animal.prototype;   // true
Object.getPrototypeOf(Dog) === Animal;                       // true: static inheritance too
rex.hasOwnProperty('name');                                  // true  (own)
rex.hasOwnProperty('speak');                                 // false (on Dog.prototype)
```

`rex.speak()` finds `speak` on `Dog.prototype`, calls it with `this = rex`. `super.speak()` looks up `speak` starting from the **home object's** prototype (`Animal.prototype`), not from `this`, which is why `super` works even when methods are borrowed.

### What `new` does

1. Create an object whose `[[Prototype]]` is `Constructor.prototype`.
2. Run the constructor with `this` bound to it. (In derived classes, `this` doesn't exist until `super()` returns; the base constructor creates it.)
3. Initialize class fields (base fields after base constructor starts, derived fields right after `super()` returns).
4. Return the object, unless the constructor explicitly returns another object.

### Private fields are not properties

```ts
class Account {
  #balance = 0;
  static isAccount(value: unknown): boolean {
    return typeof value === 'object' && value !== null && #balance in value;
  }
  deposit(amount: number) {
    this.#balance += amount;
  }
}
```

- `#balance` isn't on the prototype or visible via `Object.keys`, `JSON.stringify`, `Reflect.ownKeys` or a `Proxy`.
- Accessing `#balance` on an object without it throws a `TypeError` (brand check). `#balance in obj` tests safely.
- A `Proxy` around an instance breaks private access: the method runs with `this = proxy`, which lacks the brand. This is a real gotcha for reactivity libraries.
- TypeScript's `private` keyword is compile-time only; at runtime it's an ordinary property.

### Composition over deep inheritance

In UI code, deep class hierarchies age badly: changing a base class ripples through every subclass. Prefer small objects composed together, or plain functions plus data. Inheritance is fine for one level (e.g. `class ApiError extends Error`).

```ts
class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ApiError';
  }
}
```

> [!WARNING]
> The constructor shorthand `readonly status: number` (a parameter property) is TypeScript-only emit. Projects using `erasableSyntaxOnly` or Node's type stripping forbid it. Assign fields explicitly in those codebases.

### Follow-ups

- **"Why is `instanceof` unreliable across iframes or duplicated packages?"** It checks the prototype chain against one specific `Constructor.prototype`. Two copies of a library mean two different prototypes. Use brand checks, `Symbol.for` tags, or `Array.isArray`-style helpers.
- **"`Object.create(null)` — why?"** A dictionary with no prototype, so keys like `__proto__` or `constructor` can't collide or pollute. `Map` is usually better.
- **"What is prototype pollution?"** Writing to `Object.prototype` through unsafe deep merges (`merge(target, JSON.parse('{"__proto__":{"isAdmin":true}}'))`). Guard merges against `__proto__`, `constructor`, `prototype` keys.

### References

- [MDN: Inheritance and the prototype chain](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Inheritance_and_the_prototype_chain)
- [MDN: Private properties](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Private_properties)

## ESM vs CommonJS: live bindings, cycles, tree shaking and interop
<!--
id: esm-vs-commonjs
level: lead
tags: modules, esm, commonjs, tree shaking, bundlers
minutes: 15
-->

> [!PROMPT]
> Your team is migrating a Node service and a bundled web app from CommonJS to ES modules. After the first PR, a circular import returns `undefined`, a default import from a CJS dependency is wrapped in an object, and tree shaking removes less than before.

> [!HINT]
> - Live bindings versus copied `module.exports`, with a cycle example.
> - Why static `import` enables tree shaking and `require` doesn't.
> - Interop rules (default imports of CJS, `__esModule`, dual packages, `exports` maps) and a safe migration order.

> [!TLDR]
> ES modules are **static** (imports/exports known before execution), **asynchronous to load**, and export **live bindings**. CommonJS is dynamic: `require` runs the module synchronously and returns a snapshot of `module.exports`. Static structure is what makes tree shaking, top-level `await` and reliable cycle handling possible. Interop pain (default vs named exports, dual packages) comes from mapping one model onto the other.

### Side-by-side

| | ESM | CommonJS |
| --- | --- | --- |
| Syntax | `import`/`export` | `require`/`module.exports` |
| Resolution | Static, before running | At runtime, can be conditional |
| Exports | Live bindings (read-only views) | Values copied at `require` time |
| Loading | Async graph (fetch, link, evaluate) | Sync, in order |
| Top-level `await` | Yes | No |
| `this` at top level | `undefined` | `module.exports` |
| Tree shaking | Reliable | Heuristic at best |

### Live bindings in one example

```js
// counter.mjs
export let count = 0;
export function increment() { count++; }

// main.mjs
import { count, increment } from './counter.mjs';
increment();
console.log(count); // 1  (live view of the exporter's variable)
count = 5;          // TypeError: assignment to constant variable (imports are read-only)
```

With CommonJS, `const { count } = require('./counter')` copies `0` and never sees updates.

### Cycles

ESM links the whole graph first, so in a cycle a module can reference an import that exists but **hasn't been initialized yet** (TDZ error for `let`/`const`/`class`; `function` declarations are hoisted and work). CommonJS returns the *partially filled* `module.exports` of the module still executing, often giving you `undefined` fields.

Practical rule for app code: cycles are a design smell. Lint them (`import/no-cycle`, or madge/dependency-cruiser) and break them by extracting shared types/constants into a leaf module.

### Why tree shaking needs ESM

The bundler can see that `import { debounce } from 'lodash-es'` only uses `debounce` without running anything. It fails when:

- the package ships CommonJS (`lodash` vs `lodash-es`),
- modules have **side effects** at import time (polyfills, CSS imports, registering globals) and the package doesn't declare `"sideEffects": false` in `package.json`,
- you import a namespace and use it dynamically (`utils[name]()`),
- barrel files re-export everything and some module in the chain has side effects, forcing the bundler to keep it.

```json
{
  "name": "@acme/ui",
  "type": "module",
  "sideEffects": ["**/*.css"],
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./button": { "types": "./dist/button.d.ts", "import": "./dist/button.js" }
  }
}
```

### Interop gotchas

- `import x from 'cjs-pkg'` gives you `module.exports`; named imports work only if the bundler/Node can statically detect them.
- The `__esModule` flag hack: transpiled ESM-as-CJS marks itself so default imports map to `exports.default`. Mixed toolchains disagree about it, causing `x.default.default`.
- **Dual package hazard:** a package shipping both CJS and ESM can be loaded twice (once per format), giving two copies of singletons (two React contexts, two stores).
- Node ≥ 22 can `require()` synchronous ESM graphs, which removes some friction but not the semantic differences.

> [!PRINCIPAL]
> For an internal design system: ship ESM only, one entry per component via `exports`, mark `sideEffects`, keep CSS imports explicit, and build a size check in CI (`size-limit`) per entry point. That makes "importing one Button pulls in the whole library" a failing test, not a surprise in production.

### Follow-ups

- **"Why are barrel files bad?"** They're not inherently bad, but they force bundlers and test runners to parse and evaluate many modules to find one export, slow down dev servers (more modules per request) and defeat tree shaking when anything has side effects.
- **"How does `import()` change things?"** It's an async split point: the bundler emits a separate chunk, the runtime fetches it on demand. Pair it with preloading on intent.

### References

- [MDN: JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
- [Node.js: Modules: ECMAScript modules](https://nodejs.org/api/esm.html)
- [webpack: Tree shaking](https://webpack.js.org/guides/tree-shaking/)

## Iterators, generators and async iterators: when do they earn their place in UI code?
<!--
id: iterators-generators-async
level: senior
tags: iterators, generators, async iterators, pagination, streams
minutes: 12
-->

> [!PROMPT]
> You are asked to stream a paginated API into a table, process a huge CSV without loading it all, and cancel the work when the user navigates away. A teammate proposes recursion with promises; you think async iterators fit better.

> [!HINT]
> - The iterator and async iterator protocols, and what `for await...of` does with `return()` on early exit.
> - A generator-based pagination helper with cancellation.
> - Where generators and async iterators help in UI code, and where they are overkill (a plain array and `map` is fine).

> [!TLDR]
> An iterator is any object with `next()` returning `{ value, done }`; the iterable protocol (`[Symbol.iterator]`) lets `for...of`, spread and destructuring consume it. Generators are the easiest way to write iterators: they pause at `yield` and resume on demand, so they're **lazy**. Async iterators (`for await`) are the clean model for paginated APIs and streams. Use them when data is naturally sequential and possibly infinite; avoid them for ordinary arrays.

### Lazy pipelines

```ts
function* take<T>(source: Iterable<T>, n: number): Generator<T> {
  if (n <= 0) return;
  let i = 0;
  for (const item of source) {
    yield item;
    if (++i >= n) return; // return() closes the upstream iterator too
  }
}

function* filter<T>(source: Iterable<T>, predicate: (item: T) => boolean): Generator<T> {
  for (const item of source) if (predicate(item)) yield item;
}

function* naturals(): Generator<number> {
  let n = 0;
  while (true) yield n++;
}

const firstEvenSquares = [...take(filter(naturals(), (n) => n % 2 === 0), 3)]; // [0, 2, 4]
```

Modern engines also ship **iterator helpers** (`naturals().filter(...).take(3).toArray()`), which make this idiomatic without custom functions.

### Async iteration over a paginated API

```ts
interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

async function* paginate<T>(
  fetchPage: (cursor: string | null, signal: AbortSignal) => Promise<Page<T>>,
  signal: AbortSignal,
): AsyncGenerator<T> {
  let cursor: string | null = null;
  do {
    const page = await fetchPage(cursor, signal);
    yield* page.items;
    cursor = page.nextCursor;
  } while (cursor !== null && !signal.aborted);
}

// Consumer: export all rows without loading every page into memory at once.
for await (const row of paginate(fetchInvoices, controller.signal)) {
  writer.write(toCsvLine(row));
}
```

`break` inside `for await` calls the generator's `return()`, so cleanup in `finally` blocks runs. That's the property that makes iterators safe for resources.

### Streams are async iterables

```ts
const response = await fetch('/api/export');
if (!response.body) throw new Error('No body');
const decoder = new TextDecoder();
for await (const chunk of response.body) {
  appendText(decoder.decode(chunk, { stream: true }));
}
```

`ReadableStream` is async-iterable in modern browsers and Node; Safari added it later, so check support or use `getReader()` in a loop.

### When they don't earn their place

- A finite array you'll render anyway: use array methods. Generators add indirection and are harder to debug.
- State machines in React components: a reducer is clearer and serializable.
- Hot loops: iterator protocol overhead is real in tight numeric code.

### Follow-ups

- **"What happens if you call `next()` on a generator after it's done?"** You get `{ value: undefined, done: true }` forever.
- **"Generators and Redux-Saga?"** Sagas used generators to describe effects as data (testable without running them). Most teams have moved to RTK Query/React Query and thunks/listeners because the indirection cost outweighed the benefit.

### References

- [MDN: Iterators and generators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Iterators_and_generators)
- [MDN: for await...of](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of)
- [MDN: Iterator helpers](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Iterator)

## WeakMap, WeakRef and FinalizationRegistry: what problems do they solve, and what are the traps?
<!--
id: weakmap-weakref-finalization
level: lead
tags: weakmap, weakref, garbage collection, caching
minutes: 10
-->

> [!PROMPT]
> A component library attaches metadata to DOM nodes and caches expensive results per object. In long sessions the metadata outlives the nodes. Someone suggests `WeakRef` and `FinalizationRegistry` to "clean everything up automatically".

> [!HINT]
> - When `WeakMap` or `WeakSet` is the right tool and why you cannot iterate them.
> - What `WeakRef.deref()` guarantees, and why cleanup callbacks must not be load-bearing.
> - A cache design that uses weak references safely, and the traps (timing differences, tests that cannot observe GC).

> [!TLDR]
> `WeakMap`/`WeakSet` hold keys weakly: attaching data to an object doesn't keep the object alive, and entries vanish with their keys. That's the right tool for metadata on objects you don't own. `WeakRef` lets you hold an object *without* keeping it alive, and `FinalizationRegistry` tells you (eventually, maybe) when it was collected. Those two are for rare caching/interop cases; GC timing is non-deterministic, so never put correctness on them.

### WeakMap: the everyday tool

```ts
// Memoize per object identity without leaking the object.
const layoutCache = new WeakMap<Element, DOMRect>();

function measure(element: Element): DOMRect {
  const cached = layoutCache.get(element);
  if (cached) return cached;
  const rect = element.getBoundingClientRect();
  layoutCache.set(element, rect);
  return rect;
}
```

When the element is removed and unreferenced, the cache entry goes too. With a `Map`, every element ever measured stays in memory forever.

Constraints: keys must be objects (or non-registered symbols), and WeakMaps are **not iterable** and have no `size`, by design: enumeration would expose GC timing.

### WeakRef + FinalizationRegistry: a cache that lets go

```ts
class WeakValueCache<K, V extends object> {
  #refs = new Map<K, WeakRef<V>>();
  #registry = new FinalizationRegistry<K>((key) => {
    const ref = this.#refs.get(key);
    // Only delete if the entry wasn't replaced by a newer, still-alive value.
    if (ref && ref.deref() === undefined) this.#refs.delete(key);
  });

  get(key: K): V | undefined {
    return this.#refs.get(key)?.deref();
  }

  set(key: K, value: V): void {
    this.#refs.set(key, new WeakRef(value));
    this.#registry.register(value, key);
  }
}
```

Use case: decoded images or parsed documents that are expensive to recreate, where you'd like to reuse them if they're still around but must not keep them alive.

### The traps

- **No timing guarantees.** Finalizers may run late, in batches, or never (e.g. on page unload). Don't release external resources (sockets, file handles) with them; use explicit `close()`/`dispose()`.
- **`deref()` can return the object within the same task and `undefined` in the next.** Engines keep targets alive until the end of the current job once deref'd, but code must still handle disappearance.
- **Accidental strong references** (closures, the registry's held value being the target itself) silently defeat the weakness.
- Explicit resource management (`using` / `Symbol.dispose`) is the deterministic alternative for cleanup, and is landing across runtimes and TypeScript.

### Follow-ups

- **"How do frameworks use WeakMap?"** Vue's reactivity keeps a `WeakMap<target, Map<key, Set<effect>>>` dependency map; libraries store per-element state for DOM nodes they don't own.
- **"Why can't I iterate a WeakMap to debug it?"** Because the set of live entries depends on GC, and exposing it would make programs non-deterministic.

### References

- [MDN: WeakMap](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap)
- [MDN: WeakRef](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakRef)
- [MDN: FinalizationRegistry](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/FinalizationRegistry)

## Build a tiny reactive store with `Proxy`. What are the limits?
<!--
id: proxy-reactivity
level: lead
tags: proxy, reflect, reactivity, signals
minutes: 15
-->

> [!PROMPT]
> Implement `reactive(obj)` and `effect(fn)`: an effect re-runs when any reactive property it read changes, and only then. This is the core of Vue 3 style reactivity, built with `Proxy`.
>
> **Requirements**
> - Track dependencies in the `get` trap and trigger in `set`/`deleteProperty`.
> - Nested objects become reactive lazily; effects never loop on their own writes.
>
> **Test cases**
> - `state = reactive({ count: 0 })`, `effect(() => log.push(state.count))`, then `state.count++` → `log` is `[0, 1]`.
> - Writing the same value (`state.count = 1` twice) → the effect runs once, not twice.
> - An effect that reads `state.a` only does not re-run when `state.b` changes.
> - `state.user.name = 'x'` on a nested object re-runs effects that read `state.user.name`.
> - Name the limits: `Map`/`Set`, identity (`proxy !== target`), private fields, array methods.

> [!TLDR]
> A `Proxy` intercepts operations (`get`, `set`, `has`, `deleteProperty`...) on a target. Reactivity systems (Vue 3, MobX, Valtio) use the `get` trap to record which effect read which key, and the `set` trap to re-run those effects. It works well but has sharp edges: identity (`proxy !== target`), private fields, built-ins like `Map` and `Date` with internal slots, and performance on hot paths. Signals are the same idea with explicit getters instead of proxies.

### Implementation

```ts
type Effect = () => void;

const deps = new WeakMap<object, Map<PropertyKey, Set<Effect>>>();
const proxies = new WeakMap<object, object>();
let activeEffect: Effect | null = null;

function track(target: object, key: PropertyKey) {
  if (!activeEffect) return;
  let byKey = deps.get(target);
  if (!byKey) deps.set(target, (byKey = new Map()));
  let effects = byKey.get(key);
  if (!effects) byKey.set(key, (effects = new Set()));
  effects.add(activeEffect);
}

function trigger(target: object, key: PropertyKey) {
  const effects = deps.get(target)?.get(key);
  if (!effects) return;
  for (const effect of [...effects]) effect(); // copy: effects may re-subscribe while running
}

export function reactive<T extends object>(target: T): T {
  const existing = proxies.get(target);
  if (existing) return existing as T; // identity cache; see note below

  const proxy = new Proxy(target, {
    get(obj, key, receiver) {
      track(obj, key);
      const value = Reflect.get(obj, key, receiver);
      return typeof value === 'object' && value !== null ? reactive(value) : value; // lazy deep reactivity
    },
    set(obj, key, value, receiver) {
      const old = Reflect.get(obj, key, receiver);
      const ok = Reflect.set(obj, key, value, receiver);
      if (ok && !Object.is(old, value)) trigger(obj, key);
      return ok;
    },
    deleteProperty(obj, key) {
      const had = Reflect.has(obj, key);
      const ok = Reflect.deleteProperty(obj, key);
      if (ok && had) trigger(obj, key);
      return ok;
    },
  });
  proxies.set(target, proxy);
  return proxy;
}

export function effect(fn: Effect) {
  const run: Effect = () => {
    const previous = activeEffect;
    activeEffect = run;
    try {
      fn();
    } finally {
      activeEffect = previous;
    }
  };
  run();
}

// Usage
const state = reactive({ user: { name: 'Ada' }, todos: [] as string[] });
effect(() => console.log('name is', state.user.name));
state.user.name = 'Grace'; // logs "name is Grace"
```

> [!NOTE]
> The one `as T` above exists because a `WeakMap<object, object>` can't remember per-entry types. Hiding it inside a tiny, well-tested module is the acceptable place for an assertion; it shouldn't leak into callers.

### Why `Reflect`

`Reflect.get(obj, key, receiver)` forwards the **receiver**, so getters defined on the target run with `this = proxy`, and their reads get tracked too. `obj[key]` would run getters against the raw target and miss dependencies.

### Limits to discuss

- **Stale dependencies**: this toy never removes an effect from keys it no longer reads (e.g. after a conditional branch flips). Real systems clear an effect's deps before each run.
- **Arrays**: `push` touches `length` and indices; you need to track `length` and avoid infinite loops when an effect both reads and writes the array.
- **Built-ins with internal slots** (`Map`, `Set`, `Date`, typed arrays) throw when their methods run with `this = proxy`. Libraries wrap their methods ("collection handlers").
- **Private `#fields`** break: methods called on the proxy fail the brand check.
- **Identity**: `reactive(obj) !== obj`. Comparing raw and proxied objects, or passing proxies to third-party code, causes subtle bugs.
- **Batching**: setting three fields runs effects three times. Real systems schedule effects in a microtask and dedupe.
- **Performance**: every property read goes through a trap. Fine for app state; costly for large data tables processed in loops (mark them raw).

### Follow-ups

- **"Proxy reactivity vs signals vs React's model?"** React re-renders components and diffs output (coarse, predictable, no tracking). Proxy/signal systems track fine-grained reads and update exactly the dependents (fast, but "magic" and with identity caveats). Signals make the tracking explicit (`count()`), avoiding proxy edge cases.
- **"How would you integrate this with React?"** Expose `subscribe`/`getSnapshot` and use `useSyncExternalStore`, returning immutable snapshots so React can compare by reference (this is what Valtio's `useSnapshot` does).

### References

- [MDN: Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy)
- [MDN: Reflect](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Reflect)
- [Vue: Reactivity in depth](https://vuejs.org/guide/extras/reactivity-in-depth.html)

## `var`, `let` and `const`: scoping, hoisting and the temporal dead zone
<!--
id: js-var-let-const-scope
level: junior
tags: javascript, fundamentals, scope, hoisting, tdz, let, const, var
minutes: 8
-->

> [!PROMPT]
> Explain the difference between `var`, `let` and `const`. What is hoisting, what is the temporal dead zone, and what does this print?
>
> ```js
> for (var i = 0; i < 3; i++) setTimeout(() => console.log(i));
> for (let j = 0; j < 3; j++) setTimeout(() => console.log(j));
> ```

> [!TLDR]
> `var` is function-scoped and hoisted with the value `undefined`; `let` and `const` are block-scoped and hoisted but unusable until their declaration runs (the temporal dead zone, which throws a `ReferenceError`). `const` forbids reassigning the binding, not mutating the object it points to. The snippet prints `3 3 3` then `0 1 2`, because `var` shares one binding across iterations while `let` creates a fresh binding per iteration. Default to `const`, use `let` when you must reassign, and avoid `var`.

### The rules

| | `var` | `let` | `const` |
| --- | --- | --- | --- |
| Scope | function | block | block |
| Hoisted | yes, initialized to `undefined` | yes, but in the TDZ | yes, but in the TDZ |
| Reassign | yes | yes | no (binding) |
| Redeclare in same scope | yes | no | no |

```js
console.log(a); // undefined (var is hoisted)
var a = 1;
console.log(b); // ReferenceError: the TDZ lasts until the declaration
let b = 2;

const user = { name: 'Ada' };
user.name = 'Grace';   // allowed: the object is mutable
user = {};             // TypeError: the binding is constant
```

### The loop example

With `var`, all three callbacks close over the same `i`, which is `3` by the time they run. With `let`, each iteration gets its own `j`, so the callbacks log `0`, `1`, `2`.

### What to say in an interview

Prefer `const`, then `let`. Mention that function declarations are hoisted completely (you can call them before they appear), but function expressions assigned to `const` are not. Use `Object.freeze` if you need shallow immutability.

## Equality, coercion and `typeof`: `==` versus `===`, `NaN`, `null` and the traps
<!--
id: js-equality-coercion
level: junior
tags: javascript, fundamentals, coercion, equality, nan, typeof, truthy falsy
minutes: 10
-->

> [!PROMPT]
> What is the difference between `==` and `===`? Predict the results of `[] == false`, `null == undefined`, `NaN === NaN`, `typeof null` and `0.1 + 0.2 === 0.3`, and explain how you check for `NaN`, arrays and `null` safely.

> [!TLDR]
> `===` compares without conversion; `==` converts types by a set of rules that surprise people, so use `===` by default (the one common exception is `x == null`, which is true for both `null` and `undefined`). `[] == false` is `true` (both convert to `0`), `null == undefined` is `true`, `NaN` is not equal to itself (use `Number.isNaN`), `typeof null` is `'object'` (a historical bug), and `0.1 + 0.2 !== 0.3` because of binary floating point (compare with a tolerance or use integers). Falsy values are `false`, `0`, `-0`, `0n`, `''`, `null`, `undefined` and `NaN`.

### Answers

```js
[] == false          // true  ([] -> '' -> 0, false -> 0)
null == undefined    // true  (special rule)
null === undefined   // false
NaN === NaN          // false
Number.isNaN(NaN)    // true  (Object.is(NaN, NaN) is also true)
typeof null          // 'object' (historical quirk)
typeof []            // 'object' -> use Array.isArray(x)
0.1 + 0.2 === 0.3    // false (0.30000000000000004)
Math.abs(0.1 + 0.2 - 0.3) < Number.EPSILON // true
```

### Safe checks

- `Array.isArray(x)` for arrays, `x === null` for null, `typeof x === 'function'` for functions.
- `Number.isNaN` (strict) rather than global `isNaN` (which coerces: `isNaN('abc')` is `true`).
- Use `??` for defaults when `0` or `''` are valid values; `||` replaces every falsy value.

### Common trap

`if (items.length)` is fine, but `if (value)` treats `0` and `''` as missing. Be explicit when those are meaningful values (a quantity of 0, an empty search string).

## Closures: what they are, how they work and a real-world example
<!--
id: js-closures-basics
level: junior
tags: javascript, closures, scope, fundamentals, lexical scope
minutes: 10
-->

> [!PROMPT]
> Explain how closures work in JavaScript and give a real-world example. What does this print, and why?
>
> ```js
> for (var i = 0; i < 3; i++) {
>   setTimeout(() => console.log(i), 0);
> }
> for (let j = 0; j < 3; j++) {
>   setTimeout(() => console.log(j), 0);
> }
> ```

> [!TLDR]
> A closure is a function bundled with references to the variables of the scope where it was created (its lexical environment), so it can keep using them after that scope has finished running. The snippet prints `3 3 3` and then `0 1 2`: `var` creates one `i` shared by every callback, which is `3` by the time they run, while `let` creates a fresh binding per loop iteration that each callback closes over. Closures power private state, factories, memoization, debounce and React hooks; the cost is that anything a closure references stays in memory as long as the closure does.

### The mental model

Scope in JavaScript is lexical: a function can see variables from the place it was *written*, not where it is called. When a function is created it keeps a hidden link to that environment. Calling it later still resolves names through that link, even if the outer function has returned.

```js
function counter() {
  let count = 0;                 // lives on because the returned function references it
  return () => ++count;
}
const next = counter();
next(); // 1
next(); // 2   (a second counter() gets its own independent count)
```

### Real-world uses

- **Private state without classes:** `count` above cannot be touched from outside.
- **Function factories:** `const withTax = (rate) => (price) => price * (1 + rate)`.
- **Debounce, throttle and memoize:** the timer id or cache is the closed-over variable.
- **Event handlers and callbacks:** a handler remembers the item it was created for.
- **React hooks:** each render's function closes over that render's props and state, which is why stale closures happen.

### The loop example

With `var`, all three callbacks share the single function-scoped `i`; the loop finishes first, so each logs `3`. With `let`, the specification creates a new binding for each iteration, so the callbacks log `0`, `1`, `2`. Before `let`, the fix was an IIFE: `(function (n) { setTimeout(() => console.log(n)) })(i)`.

### Pitfalls to mention

- **Memory:** a long-lived closure keeps everything it references alive, which is a common leak with listeners and caches (see the memory-leak question).
- **Stale values:** a closure captures the variable, not a snapshot, so later mutations are visible; in React the captured value is the one from the render it was created in.
- **`this` is different:** closures capture variables, but `this` is decided by how a function is called (arrow functions capture it lexically).

## Array to histogram with `reduce`, then growing requirements: counts, grouping, top-k and the `constructor` key trap
<!--
id: js-reduce-histogram-evolving
level: junior
tags: javascript, reduce, arrays, maps, coding, fundamentals
minutes: 15
-->

> [!PROMPT]
> Write `histogram(items)` that turns an array into a count per value, using `reduce` and no explicit loop. The interviewer then keeps changing the requirement, so write code you can extend at every stage.
>
> **Stages**
> 1. Count how often each value appears: `['a', 'b', 'a']` gives `a: 2`, `b: 1`.
> 2. Count by a derived key instead (first letter, day of the week).
> 3. Return only the top `k` entries, with a deterministic order when counts tie.
> 4. Group the items themselves, not just count them.
> 5. Put numbers into buckets of width 10.

> [!HINT]
> **Also be ready for**
> - "What happens if one of the values is the string `'constructor'`?"
> - "When would you not use `reduce`?"

> [!TLDR]
> `reduce` folds an array into one accumulator, so each stage is the same fold with a different accumulator update. Use a `Map` as the accumulator, not a plain object: a plain object breaks on keys such as `'constructor'` (inherited from `Object.prototype`) and turns every key into a string. Always pass an initial value, because `reduce` on an empty array without one throws. Stage 2 adds a key function, stage 3 sorts the entries with an explicit tie-breaker, stage 4 stores arrays instead of numbers (or uses `Map.groupBy`), and stage 5 computes the bucket start by flooring the value divided by the width and multiplying back. Say out loud that a `for...of` loop is just as valid when it reads better.

### Stage 1: count values

```js
const histogram = (items) =>
  items.reduce((counts, item) => counts.set(item, (counts.get(item) ?? 0) + 1), new Map());

histogram(['a', 'b', 'a']); // Map { 'a' => 2, 'b' => 1 }
```

`Map.prototype.set` returns the map, so the callback can return the accumulator in one expression. `?? 0` is safe because a stored count is never `null` or `undefined`.

### The `constructor` trap

The version most people write first uses a plain object:

```js
const naive = (items) =>
  items.reduce((counts, item) => {
    counts[item] = (counts[item] ?? 0) + 1;
    return counts;
  }, {});

naive(['a', 'constructor']);
// counts['constructor'] is Object (inherited), so Object + 1 becomes the string "function Object() { [native code] }1"
```

Inherited properties make `counts[item]` look like it already exists. A key of `'__proto__'` is worse because it targets the prototype itself. Fixes, in order of preference: a `Map`, or `Object.create(null)` as the initial value (no prototype, so no inherited keys), or `Object.hasOwn(counts, item)` before reading. A `Map` also keeps non-string keys (numbers stay numbers) and keeps insertion order.

### Stage 2: count by a derived key

```js
const countBy = (items, keyOf) =>
  items.reduce((counts, item) => {
    const key = keyOf(item);
    return counts.set(key, (counts.get(key) ?? 0) + 1);
  }, new Map());

countBy(['apple', 'avocado', 'banana'], (word) => word[0]); // a => 2, b => 1
```

`histogram(items)` is now `countBy(items, (item) => item)`.

### Stage 3: top `k` with deterministic ties

```js
const topK = (counts, k) =>
  [...counts]
    .sort(([keyA, a], [keyB, b]) => b - a || String(keyA).localeCompare(String(keyB)))
    .slice(0, k);
```

Say what you chose for ties (here: alphabetical) because `sort` alone would leave the order to insertion. Sorting is `O(n log n)`; for a huge input and a small `k`, keep a min-heap of size `k` for `O(n log k)`.

### Stage 4: group the items

```js
const groupBy = (items, keyOf) =>
  items.reduce((groups, item) => {
    const key = keyOf(item);
    (groups.get(key) ?? groups.set(key, []).get(key)).push(item);
    return groups;
  }, new Map());
```

Modern runtimes have this built in: `Map.groupBy(items, keyOf)` and `Object.groupBy(items, keyOf)`. Mention them, and still be able to write the fold, because the point of the exercise is the pattern.

### Stage 5: numeric buckets

```js
const bucketize = (values, width) =>
  values.reduce((buckets, value) => {
    if (!Number.isFinite(value)) return buckets;          // skip NaN and Infinity
    const start = Math.floor(value / width) * width;      // floor, not trunc, so -3 lands in [-10, 0)
    return buckets.set(start, (buckets.get(start) ?? 0) + 1);
  }, new Map());
```

### Pitfalls

- **Missing initial value:** `[].reduce(fn)` throws a `TypeError`, and for a non-empty array the first element silently becomes the accumulator.
- **Copying the accumulator on every step:** `({ ...counts, [key]: n })` or `[...list, item]` inside the callback makes the fold `O(n²)`. Mutate a local accumulator instead; it is private to the fold.
- **Forgetting to return the accumulator:** the next iteration receives `undefined`.
- **Clever over clear:** a three-line `for...of` is fine. Use `reduce` when it shows the shape of the result.

### Follow-ups

- **"Make it work on a stream."** Keep the same `Map` and update it per chunk, since the accumulator is the state.
- **"Case-insensitive?"** Normalize in the key function (`word.toLowerCase()`), not in the fold.
- **"What is the complexity?"** `O(n)` for counting (average `Map` operations are constant time), `O(u log u)` to sort `u` unique values.

### References

- [MDN: Array.prototype.reduce()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce)
- [MDN: Map.groupBy()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/groupBy)

Reported as part of a frontend phone-screen coding exercise in a candidate's LinkedIn write-up; second-hand and unverified, and the stages are paraphrased.

## Prototypal inheritance in practice: how lookups work and whether to add a method to `Array.prototype`
<!--
id: js-extend-builtin-prototypes
level: senior
tags: javascript, prototypes, inheritance, polyfills, built-ins, prototype pollution
minutes: 12
-->

> [!PROMPT]
> Explain how property lookup and assignment work on the prototype chain. Then: a teammate adds `Array.prototype.last = function () { return this[this.length - 1]; }` to your codebase. Is that acceptable? What are the safer options, and how would you write a correct polyfill such as `Array.prototype.myMap`?

> [!HINT]
> - The chain for `[]`, own versus inherited properties, and what assignment does.
> - Concrete risks of changing a built-in prototype.
> - A spec-shaped polyfill (holes, `thisArg`, argument checks, non-enumerable).
> - Alternatives: utility function, subclass, wrapper.

> [!TLDR]
> Reading a property walks the `[[Prototype]]` chain (`[]` to `Array.prototype` to `Object.prototype` to `null`) until it finds the key. Assigning creates (or overwrites) an **own** property on the object itself, shadowing anything inherited, unless an inherited setter or read-only property intervenes. Because every array in the realm shares `Array.prototype`, adding a method there changes all code: it can collide with a future standard method or another library, shows up in `for...in` loops if it is enumerable, does not exist on arrays from another realm (an iframe), and is the same shape of mutation that prototype-pollution attacks abuse. Prefer a plain function (`last(array)`), a subclass with `Symbol.species`, or a wrapper. If you must polyfill a standardized method, guard it with a feature check, define it with `Object.defineProperty` as non-enumerable, and follow the specified semantics.

### Lookup and assignment

```js
const animal = { speak() { return `${this.name} makes a sound`; } };
const dog = Object.create(animal, { name: { value: 'Rex', enumerable: true } });

dog.speak();                      // 'Rex makes a sound', found on animal, `this` is dog
Object.hasOwn(dog, 'speak');      // false, it is inherited
dog.speak = () => 'woof';         // creates an own property that shadows animal.speak
Object.hasOwn(dog, 'speak');      // true, and animal.speak is unchanged
```

For arrays the chain is `[]`, then `Array.prototype`, then `Object.prototype`, then `null`. `this` inside an inherited method is the object you called it on, not the prototype that owns the function.

### Why not mutate a built-in

- **Collisions with the platform:** the standard library keeps growing. Two renames in the language itself (`contains` became `includes`, and `flatten` became `flat`) happened because code on the web already added methods with the first names and would have broken. Your `last` could collide with a future method that behaves differently.
- **Collisions between libraries:** two packages defining the same name, and the last one loaded wins silently.
- **Enumerability:** an assignment creates an enumerable property, so it leaks into `for...in`.

```js
Array.prototype.last = function () { return this[this.length - 1]; };
for (const key in [10, 20]) console.log(key); // '0', '1', 'last'
```

- **Realms:** an array created in an iframe has a different `Array.prototype`, so your method is missing on it.
- **Global blast radius and security:** a change visible to all code is hard to test and review, and tools that freeze or audit built-ins will reject it.

### A correct polyfill

```js
if (!Array.prototype.myMap) {
  Object.defineProperty(Array.prototype, 'myMap', {
    value: function myMap(callback, thisArg) {
      if (this == null) throw new TypeError('Array.prototype.myMap called on null or undefined');
      if (typeof callback !== 'function') throw new TypeError(`${String(callback)} is not a function`);
      const O = Object(this);
      const length = O.length >>> 0;
      const result = new Array(length);
      for (let i = 0; i < length; i++) {
        if (i in O) result[i] = callback.call(thisArg, O[i], i, O); // skip holes, like the real map
      }
      return result;
    },
    writable: true,
    configurable: true,
    enumerable: false, // keeps it out of for...in
  });
}
```

Details to mention: the feature check, non-enumerable, skipping holes (`[1, , 3]` stays sparse), passing `(value, index, array)`, honoring `thisArg`, working on array-likes through `Object(this)`, and that the native `map` also uses `Symbol.species` to create the result.

### Safer alternatives

```js
// 1. A plain function: no shared state, tree-shakeable, easy to test
const last = (array) => array.at(-1);

// 2. A subclass: methods live on your own prototype
class Stack extends Array {
  peek() { return this.at(-1); }
}
const stack = Stack.from([1, 2, 3]);
stack.peek();                        // 3
stack.map((n) => n * 2) instanceof Stack; // true: map uses Symbol.species to build a Stack
```

Subclassing built-ins is fine, but remember that methods like `map` and `filter` return the subclass. Override `static get [Symbol.species]() { return Array; }` if you want plain arrays back. A wrapper object (`new List(items)`) avoids the question entirely.

### Follow-ups

- **"Is `class` different from `prototype` here?"** `class` is syntax over the same chain; `extends Array` sets `Stack.prototype`'s `[[Prototype]]` to `Array.prototype`.
- **"What is prototype pollution?"** An attacker-controlled key such as `__proto__` or `constructor.prototype` in a merge or assignment writes onto `Object.prototype`, and every object then inherits the injected property. Mitigations: `Object.create(null)` or `Map` for dictionaries, key allowlists, and `Object.freeze(Object.prototype)` in hardened environments.
- **"Can you override a method on one instance?"** Yes, by assigning an own property; that shadows the prototype method for that object only.

### References

- [MDN: Inheritance and the prototype chain](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Inheritance_and_the_prototype_chain)
- [MDN: Symbol.species](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/species)
- [MDN: Object.defineProperty()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty)

Reported as a prototypal-inheritance prompt in a frontend phone screen in a candidate's LinkedIn write-up; second-hand and unverified, and the details here are my own.

## Closures in real code: `once`, `memoize`, a tiny store and the stale-closure trap (beyond the counter example)
<!--
id: js-closures-real-world
level: junior
tags: javascript, closures, memoize, once, factory, state, react
minutes: 12
-->

> [!PROMPT]
> Interviewers often say "give me a closure example that is not a counter". Write `once(fn)` and `memoize(fn)`, then a `createStore(initial)` with `get`, `set` and `subscribe` that uses no class and no globals. Name where you have used closures in real code, and one way they cause bugs.
>
> **Requirements**
> - `once` runs `fn` a single time and returns the first result on later calls.
> - `memoize` caches by arguments and must work when the result is `undefined` or falsy.
> - `subscribe` returns an unsubscribe function, and state is not reachable from outside.

> [!TLDR]
> A closure is the mechanism that lets a function keep private state between calls. `once` closes over a `called` flag and the result; `memoize` closes over a `Map` cache (check with `has`, not truthiness, and say that the cache grows without bound); `createStore` closes over `state` and a `Set` of listeners, so nothing outside can touch them, and `subscribe` returns the function that removes the listener. Real uses: event handlers that remember their item, debounce and throttle timers, module-private state, React hooks. The classic bug is a **stale closure**: a callback captured a variable from an earlier render and keeps reading the old value.

### `once`

```js
const once = (fn) => {
  let called = false;
  let result;
  return function (...args) {
    if (!called) {
      called = true;
      result = fn.apply(this, args);
    }
    return result;
  };
};

const init = once(() => connectToDatabase());
init(); init(); // connects one time
```

Note the `called` flag instead of checking `result`, so a function that returns `undefined` still runs only once.

### `memoize`

```js
const memoize = (fn, keyOf = (...args) => JSON.stringify(args)) => {
  const cache = new Map();
  return (...args) => {
    const key = keyOf(...args);
    if (cache.has(key)) return cache.get(key); // has(), because a cached result can be 0, '' or undefined
    const value = fn(...args);
    cache.set(key, value);
    return value;
  };
};
```

Say what is missing in production: the cache never shrinks (add an LRU limit or a `WeakMap` for object keys), `JSON.stringify` cannot key functions or cyclic objects (hence the `keyOf` hook), and impure functions must not be memoized. Promises are cached as promises, so a rejected promise stays cached unless you evict it on failure.

### A tiny store

```js
const createStore = (initial) => {
  let state = initial;
  const listeners = new Set();
  return {
    get: () => state,
    set(next) {
      state = typeof next === 'function' ? next(state) : next;
      listeners.forEach((listener) => listener(state));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

const store = createStore({ count: 0 });
const unsubscribe = store.subscribe((s) => console.log(s.count));
store.set((s) => ({ count: s.count + 1 })); // logs 1
```

This is the core of Redux, Zustand and the browser `EventTarget` pattern: private state behind a small public API.

### Where closures show up in everyday code

- Event handlers created in a loop or `map`: each remembers its own item.
- `debounce` and `throttle`: the timer id is the closed-over variable.
- Function factories and partial application: `const withTax = (rate) => (price) => price * (1 + rate)`.
- The module pattern and private state in ES modules (top-level variables that are not exported).
- React hooks: every render creates new functions that close over that render's props and state.

### The stale-closure trap

```js
// React: the interval callback captured `count` from the first render and always sees 0
useEffect(() => {
  const id = setInterval(() => setCount(count + 1), 1000); // always 0 + 1
  return () => clearInterval(id);
}, []);

// Fix: do not read the captured value; let React pass the current one
useEffect(() => {
  const id = setInterval(() => setCount((c) => c + 1), 1000);
  return () => clearInterval(id);
}, []);
```

Other fixes: list `count` in the dependency array (and re-create the interval), or keep the latest value in a ref. Related memory risk: a long-lived closure keeps everything it references alive, so unsubscribe listeners and clear timers.

### Follow-ups

- **"Closure versus class for private state?"** Closures give true privacy without `#` syntax and are cheap for one instance; classes share methods on the prototype, so they use less memory across many instances.
- **"Why does `const fns = [1, 2, 3].map((id) => () => id)` work but `var` in a `for` loop does not?"** Each `map` callback call has its own `id`; a `var` loop shares one binding.

### References

- [MDN: Closures](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures)
- [React docs: Removing Effect dependencies](https://react.dev/learn/removing-effect-dependencies)

Reported as a "closures with a real use case, not the counter example" prompt in a frontend phone screen in a candidate's LinkedIn write-up; second-hand and unverified, and the examples are my own.

## Promises are asynchronous, so why can a long chain of resolved Promises still freeze the UI?
<!--
id: js-microtask-starvation
level: senior
tags: javascript, event-loop, promises, microtasks, performance, scheduler
minutes: 12
-->

> [!PROMPT]
> A button click starts a job that walks 200,000 items with a chain of `.then` calls (or an `async` loop that awaits an already-resolved value). Every step is "asynchronous", yet the page does not repaint and clicks are ignored until the whole job ends. Explain why, prove it with code, and fix it.
>
> **Requirements**
> - Explain microtasks versus tasks and where rendering happens.
> - Show a reproduction that a timer cannot fire during the chain.
> - Write `processChunked(items, work)` that keeps the page responsive.

> [!TLDR]
> "Asynchronous" only means "later", not "on another thread". A promise reaction runs as a microtask, and the event loop drains the whole microtask queue, including microtasks queued by microtasks, before it takes the next task or renders a frame. A long chain of resolved promises therefore starves timers, input and painting exactly like a synchronous loop. The fix is to cut the work into slices of a few milliseconds and yield to a real task boundary between slices (`setTimeout`, `MessageChannel`, `scheduler.yield()`), or move the work to a Web Worker. `await Promise.resolve()` is not a yield.

### Why it freezes

One turn of the event loop is: run one task, then drain **all** microtasks, then (if due) update rendering, then pick the next task. Promise callbacks and `await` continuations are microtasks. If each microtask queues another one, the queue never becomes empty, so the loop never reaches "render" or "next task". Timers, clicks and paints are all waiting behind it.

```js
// Reproduction (runs in Node and the browser): the timer cannot fire during the chain
const order = [];
setTimeout(() => order.push('timer'), 0);

let p = Promise.resolve(0);
for (let i = 0; i < 200_000; i++) p = p.then((v) => v + 1);

p.then(() => {
  order.push('chain done');
  setTimeout(() => console.log(order), 0); // ['chain done', 'timer']
});
```

The timer was due first, but the chain finished first. A recursive `queueMicrotask` loop behaves the same way.

### The fix: slice the work and yield to a task

```js
const yieldToMacrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

async function processChunked(items, work, budgetMs = 8) {
  let i = 0;
  while (i < items.length) {
    const start = performance.now();
    while (i < items.length && performance.now() - start < budgetMs) work(items[i++]);
    await yieldToMacrotask(); // task boundary: input, timers and rendering get a turn
  }
}

// usage
await processChunked(rows, (row) => index.add(row));
```

Choosing the yield:

- **`scheduler.yield()`**: best where available (Chromium); it resumes with higher priority than other queued tasks. Feature-detect it and fall back to `setTimeout`.
- **`MessageChannel`**: yields without the ~4ms clamp that nested `setTimeout` gets. React's scheduler uses it.
- **`requestIdleCallback`**: only for work that may wait; it can be starved on a busy page.
- **Web Worker**: the right answer when the work is CPU-heavy rather than merely long.

> [!WARNING]
> `await Promise.resolve()` and `await somethingAlreadyResolved` yield only to other microtasks. They never let the browser paint.

### Follow-ups

- **"Does the chunked loop make the job faster?"** No, slightly slower in total. It makes the page responsive, which is what INP measures.
- **"How do you find this in a profile?"** One long task in the Performance panel with the work attributed to promise callbacks; Long Animation Frames shows the script that blocked.
- **"Is `process.nextTick` the same in Node?"** It runs before promise microtasks and can starve the loop even more easily.

### References

- [MDN: Using microtasks in JavaScript with queueMicrotask()](https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide)
- [web.dev: Optimize long tasks](https://web.dev/articles/optimize-long-tasks)
- [Jake Archibald: Tasks, microtasks, queues and schedules](https://jakearchibald.com/2015/tasks-microtasks-queues-and-schedules/)

Appears in a shared list of JavaScript scenario prompts (second-hand; source unverified). The explanation and code are my own and were run in Node.

## You copied an object with the spread operator, yet updating the copy changed the original. Where did the shared reference remain?
<!--
id: js-shallow-copy-shared-reference
level: junior
tags: javascript, objects, references, immutability, spread, structuredClone, react-state
minutes: 10
-->

> [!PROMPT]
> `const next = { ...state }; next.user.name = 'Grace';` and `state.user.name` is now `'Grace'` too. Explain exactly where the shared reference is, list the ways to copy that have the same problem, and show how to update nested state without mutating the original.
>
> **Requirements**
> - Prove the sharing with `===`.
> - Show a path-copy update and a real deep copy, and say when each is right.
> - Name what `structuredClone` and `JSON.parse(JSON.stringify(x))` cannot copy.

> [!TLDR]
> Spread, `Object.assign`, `slice`, `Array.from` and `[...arr]` are shallow: they copy the top-level properties, and each property that holds an object copies the reference, not the object. So `copy.user` and `state.user` point at one object, and a write through either is visible through both. For state updates, copy along the path you change and reuse the rest (`{ ...state, user: { ...state.user, name } }`); for a genuinely independent copy use `structuredClone`, which cannot copy functions and drops prototypes, while a JSON round trip also loses `Date`, `Map`, `undefined` and more.

### Where the reference stays shared

```js
const state = { user: { name: 'Ada', tags: ['a'] }, items: [{ id: 1, done: false }] };

const copy = { ...state };
copy.user.name = 'Grace';

console.log(state.user.name);          // 'Grace'
console.log(copy.user === state.user); // true  (same object)
console.log(copy.items === state.items); // true  (same array, and same item objects)
copy.items.push({ id: 2, done: false });
console.log(state.items.length);       // 2
```

Only the top level was copied. `copy` is a new object, but its properties still hold the original `user` and `items` references. The same is true of `Object.assign({}, x)`, `arr.slice()`, `[...arr]` and `Array.from(arr)`. Spread also copies only **own enumerable** properties, so inherited ones are dropped and getters become plain values.

### Fix 1: copy along the path you change (React state)

```js
const next = { ...state, user: { ...state.user, name: 'Grace' } };
console.log(state.user.name);            // 'Ada'
console.log(next.items === state.items); // true: untouched branches stay shared, which is cheap and correct

// update one array item immutably
const toggled = {
  ...state,
  items: state.items.map((it) => (it.id === 1 ? { ...it, done: true } : it)),
};
```

Sharing untouched branches is the point: React compares by reference, so a changed branch gets a new reference (and re-renders), and an unchanged one keeps its old reference (and can be skipped). Mutating `state.user.name` and then spreading gives React a new top-level object but an unchanged `user`, so `memo` children that receive `user` never update.

### Fix 2: a real deep copy

```js
const deep = structuredClone(state);
deep.user.tags.push('b');
console.log(state.user.tags); // ['a']
```

Limits you should name:

- `structuredClone` throws on functions, and class instances lose their prototype (you get a plain object).
- It handles `Date`, `Map`, `Set`, typed arrays and cycles.
- `JSON.parse(JSON.stringify(x))` turns `Date` into a string, drops `undefined` and functions, turns `Map` and `Set` into `{}`, and throws on cycles.

```js
class P { x = 1 }
structuredClone(new P()) instanceof P; // false
structuredClone({ f() {} });           // DataCloneError
```

> [!WARNING]
> A deep copy on every update is the expensive default. In state management, prefer path copying (or Immer, which does it for you with a draft) and keep deep copies for boundaries such as snapshots and `postMessage`.

### Follow-ups

- **"Does `Object.freeze` help?"** It is shallow too. It stops writes to the top level only, so freeze recursively in tests or use a type system (`readonly`, `as const`) to catch mutation.
- **"How would you write `deepClone` yourself?"** See the deep clone question; handle cycles with a `WeakMap` of already-copied objects.

### References

- [MDN: Spread syntax](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_syntax)
- [MDN: structuredClone()](https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone)
- [React docs: Updating objects in state](https://react.dev/learn/updating-objects-in-state)

Appears in a shared list of JavaScript scenario prompts (second-hand; source unverified). The explanation and code are my own and were run in Node.

## A closure keeps returning an outdated value. Why, and how is that different from closures retaining memory?
<!--
id: js-stale-closure-vs-retention
level: senior
tags: javascript, closures, stale-closure, memory, garbage-collection, react-hooks
minutes: 12
-->

> [!PROMPT]
> Two bugs get called "closure problems": a callback that reads an **old value**, and a callback that keeps **memory alive**. Explain what is actually going on in each, why they are different, and show a runnable demonstration of both with a fix.
>
> **Requirements**
> - Show a stale read and the fix that reads the current value.
> - Show that a closure keeps what it references alive, and that releasing the closure releases it.
> - Say how to tell which problem you have.

> [!TLDR]
> A **stale** closure is a correctness bug: the function captured a value (or an old object) that was current when it was created, and the variable you are watching now lives somewhere else, for example a new binding from a later render. It is fixed by reading through something that is current at call time (a functional update, a ref, or re-creating the function when the value changes). A **retention** closure is a memory bug: the function stays reachable, so everything it references stays alive; it is fixed by dropping the reference (unsubscribe, clear the timer, null the handler). Stale means the wrong data is read; retained means the right data is never freed.

### Stale value: the closure saw a snapshot

```js
// A closure reads the variable's current value only if it closed over the SAME binding
let live = 0;
const readLive = () => live;
live = 5;
readLive(); // 5, not stale

// Stale: it closed over an old object, then the variable was reassigned
let config = { theme: 'light' };
const readTheme = ((c) => () => c.theme)(config);
config = { theme: 'dark' };
readTheme(); // 'light'

// Fix: read through a box that is always the latest
const latest = { current: config };
const read = () => latest.current.theme;
latest.current = { theme: 'blue' };
read(); // 'blue'
```

In React every render creates fresh `const` bindings, and a function created in render N closes over render N's values. An interval or listener created once keeps render 0's `count` forever:

```js
useEffect(() => {
  const id = setInterval(() => setCount(count + 1), 1000); // count is always 0
  return () => clearInterval(id);
}, []);
// Fixes: setCount((c) => c + 1), list count in deps, or keep the latest value in a ref
```

### Retention: the closure keeps its data alive

```js
function makeLeaky() {
  const big = new Array(1e6).fill(0);
  const ref = new WeakRef(big);                // lets us observe collection without keeping big alive
  return { handler: () => big.length, ref };   // the closure uses big, so big stays reachable
}

let leaky = makeLeaky();
global.gc(); // run with: node --expose-gc
console.log(leaky.ref.deref() !== undefined);  // true: still alive

const keep = leaky.ref;
leaky = null;                                  // drop the closure
global.gc();
console.log(keep.deref() !== undefined);       // false after collection (collection timing is not guaranteed)
```

A closure that only uses a small copy (`const small = big.length; return () => small`) lets V8 collect `big`, because engines retain only the variables a closure actually references (but a single `eval` or a shared function scope can keep more). Listeners, timers, subscriptions and module-level caches are what keep such closures reachable.

### How to tell them apart

| Symptom | Likely cause | First check |
| --- | --- | --- |
| A handler uses old props or state | Stale closure | Is the function created once (empty deps, a listener added on mount)? |
| Memory grows after navigating around | Retention | Heap snapshot comparison; look for detached DOM nodes and the retaining closure |

### Follow-ups

- **"Can a fix for one cause the other?"** Yes: putting every value in `deps` fixes staleness but re-subscribes each time; forgetting the cleanup then retains one closure per run.
- **"Is a ref a stale-closure fix or a leak risk?"** The ref box is stable; it only retains the latest value, one at a time.

### References

- [MDN: Closures](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures)
- [MDN: WeakRef](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakRef)
- [React docs: Removing Effect dependencies](https://react.dev/learn/removing-effect-dependencies)

Appears in a shared list of JavaScript scenario prompts (second-hand; source unverified). The explanation and code are my own and were run in Node.

## Arrow functions vs normal functions: `this`, `arguments`, `new`, hoisting and when each is the right tool
<!--
id: js-arrow-vs-normal-functions
level: junior
tags: javascript, functions, arrow functions, this, arguments, constructors
minutes: 10
-->

> [!PROMPT]
> What are the differences between an arrow function and a normal function? Show a case where swapping one for the other changes behaviour.

> [!HINT]
> - Think about what each one does with `this`, `arguments`, `new` and `prototype`.
> - Where does a callback inside a method find its `this`?
> - When is an arrow function the wrong choice?

> [!TLDR]
> An arrow function has no `this`, `arguments`, `super` or `new.target` of its own: it reads them from the scope where it was written, and it cannot be used with `new`, has no `prototype` and cannot be rebound with `call`, `apply` or `bind`. A normal function gets `this` from how it is called, has `arguments`, can be a constructor, and is hoisted when declared. Use arrows for callbacks and anything that should keep the surrounding `this`; use normal functions or method syntax for object methods, constructors and anything that needs its own `this`.

### The differences that matter

| | Normal function | Arrow function |
|---|---|---|
| `this` | Set by the call (`obj.m()`, `call`, `new`, or `undefined` in strict mode) | Taken from the enclosing scope, fixed forever |
| `arguments` | Yes | No (use rest parameters, `(...args) =>`) |
| `new` | Yes, and it has a `prototype` | `TypeError: not a constructor` |
| `call`, `apply`, `bind` | Rebind `this` | Ignored for `this` |
| Hoisting | A declaration is hoisted with its body | Only the variable is hoisted; calling it earlier is a `ReferenceError` |
| Returning an object | `return { ... }` | `() => ({ ... })` (the parentheses keep it from being a block) |

### One snippet that shows most of it

```js
const obj = {
  name: 'obj',
  regular() { return this.name; },
  arrow: () => typeof this,            // `this` here is the module/global scope, not obj
  nested() { return [1].map(() => this.name)[0]; }, // arrow inherits nested()'s this
};

obj.regular();            // 'obj'
obj.arrow();              // 'undefined' in a module (not obj)
obj.nested();             // 'obj'

const detached = obj.regular;
detached();               // TypeError: cannot read 'name' of undefined (strict mode)

new (() => {});           // TypeError: not a constructor
typeof (() => {}).prototype;      // 'undefined'
typeof function () {}.prototype;  // 'object'

(() => typeof this).bind({ a: 1 })(); // bind cannot change an arrow's this
```

### Choosing

- **Arrow:** callbacks (`map`, `filter`, promise chains, event handlers inside a class or method), small pure helpers, anything that should keep the outer `this`.
- **Normal function or method shorthand:** object methods that use `this`, constructors, prototype methods, generators (arrows cannot be generators), and functions that need `arguments`.
- **Class fields:** `onClick = () => this.label` gives each instance a handler that stays bound when passed around (the classic React class-component fix), at the price of one function per instance.

```js
class Btn {
  label = 'ok';
  onClick = () => this.label;   // safe to detach
  method() { return this?.label; } // loses this when detached
}
const { onClick, method } = new Btn();
onClick(); // 'ok'
method();  // undefined
```

### Follow-ups

- **"Does an arrow function make code faster?"** No; choose by semantics.
- **"Why not an arrow for `obj.method`?"** It would capture the outer `this`, not `obj`.
- **"What does the stack trace show?"** Arrows get the name of the variable they are assigned to; a bare inline arrow is anonymous, which makes traces harder to read.

### References

- [MDN: Arrow function expressions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions)
- [MDN: this](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/this)

Appears in a shared list of JavaScript interview prompts (second-hand; source unverified). The explanation and code are my own and were run in Node.

## Destructuring, rest and spread: defaults, renaming, nesting, and the places they surprise you
<!--
id: js-destructuring-rest-spread
level: junior
tags: javascript, destructuring, rest, spread, es6, defaults
minutes: 10
-->

> [!PROMPT]
> Explain object and array destructuring and the rest operator. What do these produce, and why?
>
> ```js
> const user = { id: 7, name: 'Ada', address: { city: 'London' }, role: undefined, password: 'x' };
> const { name, address: { city }, role = 'guest', ...safe } = user;
> const { n = 5 } = { n: null };
> ```

> [!HINT]
> - What does `...safe` contain, and is `address` in it?
> - When does a default value apply: `undefined`, `null`, or both?
> - What is the difference between rest and spread?

> [!TLDR]
> Destructuring unpacks values from objects (by key) or arrays (by position) into variables, with optional renaming (`a: b`), nesting and defaults. Defaults apply only when the value is `undefined`, so `null` is kept. Rest (`...safe`) collects the remaining own enumerable properties or items into a new object or array, and must come last; spread (`...x`) does the opposite and expands one into another. In the snippet, `city` is `London`, `role` is `guest`, `safe` is `{ id, password }` (everything not already extracted), and `n` is `null`.

### What each part does

```js
const user = { id: 7, name: 'Ada', address: { city: 'London' }, role: undefined, password: 'x' };

const { name, address: { city }, role = 'guest', ...safe } = user;
// name = 'Ada', city = 'London' (address itself is NOT a variable), role = 'guest'
// safe = { id: 7, password: 'x' }   (name, address and role were taken out)

const { n = 5 } = { n: null };   // n === null: the default is only for undefined
const { password, ...publicUser } = user;  // the idiomatic "omit one key" (password is now unused)

const [first, , third = 'z', ...others] = ['a', 'b', undefined, 'd', 'e'];
// first = 'a', third = 'z', others = ['d', 'e']  (the empty slot skips an item)

const { x } = null;              // TypeError: cannot destructure null or undefined
```

### Where it earns its keep

- **Function parameters with defaults:** the empty object makes the argument optional.

```js
function request(url, { retries = 3, delay = 100 } = {}) { /* ... */ }
request('/api');                     // retries 3, delay 100
request('/api', { retries: 1 });     // retries 1, delay 100
```

- **Swapping and returning several values:** `[a, b] = [b, a]`, `const [state, setState] = useState()`.
- **Immutable updates:** `{ ...state, user: { ...state.user, name } }`, and `[...items, next]`.
- **Rest parameters:** `(...args)` replaces `arguments` and is a real array.

### Surprises

- **Spread and rest are shallow:** nested objects are shared (see the shallow copy question).
- **Order wins:** in `{ ...a, ...b }` keys from `b` overwrite `a`; `{ ...a, x: 1 }` versus `{ x: 1, ...a }` differ.
- **Only own enumerable properties are copied**, and getters are read once (their value is copied, not the getter).
- **Array spread into a call has a limit:** `Math.max(...hugeArray)` or `push(...hugeArray)` can throw `RangeError` for very large arrays (hundreds of thousands of items); use a loop or `reduce`.
- **Destructuring a parameter** makes the function throw on `undefined` unless there is a `= {}` default.
- **Renaming reads backwards:** `{ a: b }` means "take `a`, call it `b`".

### Follow-ups

- **"What is the difference between rest and spread?"** Rest gathers in a binding position (parameters or the left of `=`); spread expands in an expression position.
- **"Can you destructure with a computed key?"** Yes: `const { [key]: value } = obj`.

### References

- [MDN: Destructuring assignment](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Destructuring_assignment)
- [MDN: Spread syntax](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_syntax)

Appears in a shared list of JavaScript interview prompts (second-hand; source unverified). The explanation and code are my own and were run in Node.

## Higher-order functions: `map`, `filter`, `reduce`, function factories, `compose` and `curry`
<!--
id: js-higher-order-functions
level: junior
tags: javascript, higher-order functions, functional programming, map, reduce, currying
minutes: 12
-->

> [!PROMPT]
> What is a higher-order function? Give built-in and custom examples, and write `pipe`, `once` and `curry`.

> [!HINT]
> - A higher-order function takes a function, returns a function, or both.
> - What is the classic surprise with `['1', '2', '3'].map(parseInt)`?
> - How does `curry` know when it has enough arguments?

> [!TLDR]
> A higher-order function takes functions as arguments, returns a function, or both. Functions are first-class values in JavaScript, so `map`, `filter`, `reduce`, `sort`, event listeners, debounce, `once` and middleware are all higher-order. They let you pass behaviour instead of copying loops, and closures let the returned function remember configuration. Be ready to write `pipe`, `once` and `curry` and to explain why `['1', '2', '3'].map(parseInt)` gives `[1, NaN, NaN]` (`map` passes the index as the second argument, which `parseInt` reads as the radix).

### Built-in and custom

```js
const orders = [{ id: 1, total: 40, paid: true }, { id: 2, total: 15, paid: false }];
const revenue = orders.filter((o) => o.paid).map((o) => o.total).reduce((a, b) => a + b, 0); // 40
```

```js
// returns a function (factory)
const add = (n) => (x) => x + n;

// takes functions, returns one (composition): left to right
const pipe = (...fns) => (x) => fns.reduce((value, fn) => fn(value), x);
pipe(add(1), (x) => x * 2)(3); // 8

// wraps a function and keeps state in a closure
function once(fn) {
  let done = false, value;
  return (...args) => (done ? value : ((done = true), (value = fn(...args))));
}

// adds behaviour without changing the original
function withLogging(fn, log) {
  return function (...args) {
    const result = fn.apply(this, args);
    log(fn.name, args, result);
    return result;
  };
}

// collects arguments until the original's arity is reached
const curry = (fn) =>
  function curried(...args) {
    return args.length >= fn.length ? fn(...args) : (...more) => curried(...args, ...more);
  };
const sum3 = curry((a, b, c) => a + b + c);
sum3(1)(2)(3);   // 6
sum3(1, 2)(3);   // 6
```

Writing `map` yourself shows the contract (callback gets value, index and array, and holes are skipped):

```js
Array.prototype.myMap = function (cb, thisArg) {
  const out = new Array(this.length);
  for (let i = 0; i < this.length; i++) if (i in this) out[i] = cb.call(thisArg, this[i], i, this);
  return out;
};
```

### The `parseInt` trap

```js
['1', '2', '3'].map(parseInt);  // [1, NaN, NaN]: parseInt('2', 1) and parseInt('3', 2)
['1', '2', '3'].map(Number);    // [1, 2, 3]
['1', '2', '3'].map((s) => parseInt(s, 10));
```

### Notes interviewers like

- **`curry` relies on `fn.length`,** which ignores default and rest parameters, so it does not work for variadic functions.
- **`reduce` needs an initial value** unless you are sure the array is not empty.
- **Chaining allocates** an array per step; for a very hot path use one loop or a lazy iterator.
- **Higher-order does not mean functional purity:** callbacks with side effects are fine, but `map` used only for side effects should be `forEach`.

### References

- [MDN: Array.prototype.map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map)
- [MDN: Functions as first-class values](https://developer.mozilla.org/en-US/docs/Glossary/First-class_Function)

Appears in a shared list of JavaScript interview prompts (second-hand; source unverified). The explanation and code are my own and were run in Node.

## Flatten a deeply nested array: recursion, an explicit stack, depth limits and `flat(Infinity)`
<!--
id: js-flatten-nested-array
level: junior
tags: javascript, recursion, arrays, flatten, stack overflow, generators
minutes: 12
-->

> [!PROMPT]
> Flatten a deeply nested array using a recursive function: `[1, [2, [3, [4, [5]]]], [], [[6]], 7]` becomes `[1, 2, 3, 4, 5, 6, 7]`. Then add a `depth` argument. What breaks on very deep input?

> [!HINT]
> - Base case: the item is not an array. Recursive case: flatten the item and add the result.
> - How do you stop at a given depth?
> - How many nested calls can the engine take before it throws?

> [!TLDR]
> Loop over the items; if an item is an array, recurse into it, otherwise append it to the result. Pass the result array down as an accumulator so you do not copy at every level, and pass a `depth` counter that decreases to support partial flattening (this is what `Array.prototype.flat(depth)` does; `flat(Infinity)` flattens fully, and it also removes empty slots). Recursion is limited by stack size, so extremely deep nesting throws `RangeError`; an explicit stack handles any depth. Avoid `out.push(...bigArray)` on large arrays, which can also overflow.

### Recursive, with a depth limit

```js
function flatten(arr, depth = Infinity, out = []) {
  for (const item of arr) {
    if (Array.isArray(item) && depth > 0) flatten(item, depth - 1, out);
    else out.push(item);
  }
  return out;
}

const nested = [1, [2, [3, [4, [5]]]], [], [[6]], 7];
flatten(nested);       // [1, 2, 3, 4, 5, 6, 7]
flatten(nested, 1);    // [1, 2, [3, [4, [5]]], [6], 7]   (same as nested.flat(1))
```

### Reduce version (shorter, but copies more)

```js
const flat = (arr, depth = Infinity) =>
  arr.reduce(
    (acc, x) => (Array.isArray(x) && depth > 0 ? acc.concat(flat(x, depth - 1)) : acc.concat([x])),
    [],
  );
```

`concat` creates a new array on every step, so this is quadratic in the worst case. The accumulator version above is linear.

### Iterative, with an explicit stack (no recursion limit)

```js
function flattenIter(arr) {
  const stack = [...arr].reverse();
  const out = [];
  while (stack.length) {
    const item = stack.pop();
    if (Array.isArray(item)) for (let i = item.length - 1; i >= 0; i--) stack.push(item[i]);
    else out.push(item);
  }
  return out;
}

let deep = [];
for (let i = 0; i < 20000; i++) deep = [deep, 1];
flatten(deep);            // RangeError: Maximum call stack size exceeded
flattenIter(deep).length; // 20000
```

### Lazily, with a generator

```js
function* walk(arr) {
  for (const item of arr) {
    if (Array.isArray(item)) yield* walk(item);
    else yield item;
  }
}
[...walk(nested)];   // [1, 2, 3, 4, 5, 6, 7]
```

### Edge cases to mention

- **Holes:** `[1, , 3].flat()` returns `[1, 3]`; the loop above visits `undefined` for a hole because `for...of` does, so decide what you want.
- **Cycles:** an array that contains itself recurses forever; track visited arrays in a `Set` if input is untrusted.
- **Array-likes and objects:** `Array.isArray` is false for `arguments` and `NodeList`; say so.
- **Do not mutate the input,** and do not rely on `toString().split(',')` (it turns everything into strings).

### References

- [MDN: Array.prototype.flat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flat)

Appears in a shared list of JavaScript interview prompts (second-hand; source unverified). The explanation and code are my own and were run in Node.

## JavaScript module types: IIFE, CommonJS, AMD, UMD and ES modules, and how they interoperate
<!--
id: js-module-types
level: senior
tags: javascript, modules, commonjs, esm, umd, amd, iife, bundlers
minutes: 15
-->

> [!PROMPT]
> What types of JavaScript modules exist, and why do so many exist? When would you meet each one today?

> [!HINT]
> - Which ones were invented before the language had modules?
> - Which are static and which are dynamic, and what does that change for tree shaking?
> - What does a UMD wrapper actually check?

> [!TLDR]
> Before the language had modules, people used IIFEs (a function that creates a private scope and returns an API) and namespaces on `window`. CommonJS (`require`, `module.exports`) is synchronous and became the Node standard; AMD (`define`, RequireJS) loaded asynchronously in browsers; UMD is a wrapper that detects which system is present so one file works under AMD, CommonJS or as a global. ES modules (`import`, `export`) are the language standard: static, asynchronous to load, with live bindings and top-level `await`. Today you write ESM, publish ESM (often plus CommonJS), and meet the others in older libraries, Node packages and script tags.

### The five, in the order they appeared

**1. IIFE and the module pattern:** a closure as a private scope.

```js
const Counter = (function () {
  let n = 0;                       // private
  return { inc: () => ++n };       // public API
})();
Counter.inc(); Counter.inc();      // 2
```

**2. CommonJS (Node, `require`):** synchronous, resolved at run time, values copied.

```js
// lib.cjs
let count = 0;
function inc() { count++; }
module.exports = { count, inc };   // count is copied here

// use
const lib = require('./lib.cjs');
lib.inc();
lib.count;   // 0: a snapshot, not a live view
```

**3. AMD (RequireJS):** `define(['dep'], (dep) => api)`; asynchronous loading for browsers. Rare today.

**4. UMD:** a wrapper that supports several environments at once.

```js
(function (root, factory) {
  if (typeof define === 'function' && define.amd) define([], factory);       // AMD
  else if (typeof module === 'object' && module.exports) module.exports = factory(); // CommonJS
  else root.Greeter = factory();                                             // browser global
})(typeof self !== 'undefined' ? self : this, function () {
  return { hi: (name) => 'hi ' + name };
});
```

**5. ES modules (`import` and `export`):** static, asynchronous, strict mode, live bindings.

```js
// lib.mjs
export let count = 0;
export function inc() { count++; }

// use.mjs
import { count, inc } from './lib.mjs';
inc();
count;                               // 1: a live binding
const m = await import('./lib.mjs'); // dynamic import, a promise
```

### Differences that come up

| | CommonJS | ES modules |
|---|---|---|
| Syntax | `require`, `module.exports` | `import`, `export` |
| Loading | Synchronous | Asynchronous |
| Structure | Dynamic (`require` can be anywhere) | Static (analysable, so tree shaking works) |
| Exports | Copied values | Live bindings |
| `this` at top level | `module.exports` | `undefined` |
| Top-level `await` | No | Yes |

### Interop in practice

- A `<script type="module">` runs ESM in the browser; a plain `<script>` is a global (often UMD).
- Node decides by file extension (`.mjs`, `.cjs`) or `"type"` in `package.json`.
- ESM can import CommonJS (you get the whole `module.exports` as the default export); CommonJS can only `import()` ESM, because loading is asynchronous (recent Node versions also allow `require` of ESM that has no top-level `await`).
- Libraries publish with the `exports` field, offering `import` and `require` conditions; shipping both carries the risk of two copies of the same package (the "dual package hazard").
- Bundlers (Webpack, Rollup, Vite, esbuild) understand all of them and output what you ask for.

### Follow-ups

- **"Why can't tree shaking work on CommonJS?"** Exports are computed at run time, so a bundler cannot know which are unused.
- **"What is the difference between `export default` and named exports for refactoring?"** Named exports keep one name across files and help tools; default exports can be imported under any name.
- **"How do you load a module lazily?"** `import()` (also the basis of code splitting).

### References

- [MDN: JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
- [Node.js: Modules, packages](https://nodejs.org/api/packages.html)

Appears in a shared list of frontend interview prompts (second-hand; source unverified). The explanation and code are my own and were run in Node.
