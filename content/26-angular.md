---
id: angular
title: Angular Interview Questions
description: The questions Angular interviews keep returning to: custom directives, dependency injection scopes, OnPush change detection, signals, RxJS flattening operators, the async pipe and build budgets.
facets: frontend, angular
---

## What custom directive have you created? A walkthrough of attribute directives, host bindings and listeners
<!--
id: angular-custom-directive
level: junior
tags: angular, directives, host bindings, hostlistener, standalone, dom
minutes: 12
-->

> [!PROMPT]
> What custom directive have you created? Build one that highlights an element on hover with a configurable colour, and one that trims an input on blur. When would you write a directive instead of a component?

> [!HINT]
> - A directive adds behaviour to an existing element; a component adds a template.
> - How does it read its host element, and how do you bind to host properties and events?
> - Why prefer `host` bindings over touching the DOM directly?

> [!TLDR]
> A directive is a class that attaches behaviour to an element without owning a template: attribute directives change how an element looks or behaves (highlight, trim, autofocus, click-outside, permissions), and structural directives change the DOM structure (the built-in `@if` and `@for` replaced `*ngIf` and `*ngFor` in templates, though you can still write `*` directives). A good answer names a real one you built, shows the selector, an input, and host bindings and listeners, and explains why it was a directive: the behaviour is reusable across many different elements, which a component cannot do because an element can have only one component. Keep DOM access inside the directive and prefer `host` bindings so Angular handles rendering and server rendering stays safe.

### An attribute directive with an input and host bindings

```ts
import { Directive, input } from '@angular/core';

@Directive({
  selector: '[appHighlight]',
  standalone: true,
  host: {
    '[style.backgroundColor]': 'active ? color() : null',
    '(mouseenter)': 'active = true',
    '(mouseleave)': 'active = false',
  },
})
export class HighlightDirective {
  color = input('yellow', { alias: 'appHighlight' });   // <p appHighlight="pink">
  active = false;
}
```

```html
<p appHighlight="pink">Hover me</p>
<p appHighlight>Default colour</p>
```

### A directive that reads and changes its host

```ts
import { Directive, ElementRef, HostListener, inject } from '@angular/core';

@Directive({ selector: 'input[appTrim]', standalone: true })
export class TrimDirective {
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef);

  @HostListener('blur')
  onBlur() {
    this.el.nativeElement.value = this.el.nativeElement.value.trim();
  }
}
```

With reactive forms, trim through the form control (`updateOn: 'blur'` and a validator or a `ControlValueAccessor` wrapper), or the control and the screen will disagree; this snippet only changes what the user sees.

### Other directives worth naming

- **Click outside** (closes a menu): listens to `document:click` and emits an output when the target is outside the host.
- **Auto focus, debounce click, permission** (`*appHasRole="'admin'"`, a structural directive that adds or removes a view).
- **Directive composition:** `hostDirectives` on a component or directive adds other directives to it and exposes selected inputs and outputs.

### Directive or component?

| Need | Use |
|---|---|
| Behaviour on any element (focus, hover, tooltip, validation) | Attribute directive |
| Add or remove DOM based on a condition | Structural directive, or `@if` in the template |
| New UI with its own template and styles | Component |
| Logic with no DOM | A service or a pipe |

### What I verified

I ran the two directives above in a test using Angular 19's `TestBed` (the hover directive with the `@Input` decorator form, because JIT tests do not run the signal-input compiler step): hover set the colour and leaving cleared it, and blur trimmed the value.

### Follow-ups

- **"Why not `nativeElement.style` in the directive?"** Host bindings go through the renderer and are friendlier to server rendering and testing.
- **"Can two directives be on the same element?"** Yes, but only one component.
- **"How do you test it?"** Create a small host component using the directive, dispatch events and assert on the element.

### References

- [Angular: Attribute directives](https://angular.dev/guide/directives/attribute-directives)
- [Angular: Directive composition API](https://angular.dev/guide/directives/directive-composition-api)

Appears in a shared list of Angular interview prompts (second-hand; source unverified).

## Providing a service at the root versus on a component: instances, lifetime and what two components on screen get
<!--
id: angular-di-root-vs-component-providers
level: senior
tags: angular, dependency injection, providers, injectors, services, scope
minutes: 15
-->

> [!PROMPT]
> What is the difference between providing a service at the root and providing it on a component? What happens when two instances of that component are on screen?

> [!HINT]
> - How many instances of the service exist in each case, and when are they destroyed?
> - Where does Angular look for a provider, starting from which injector?
> - What about services provided in lazy-loaded routes?

> [!TLDR]
> `providedIn: 'root'` registers one application-wide singleton, created on first injection and tree-shakable if never used. Listing the service in a component's `providers` creates a new instance for each component instance, available to that component and its children, and destroyed with it. With two instances of the component on screen, they share the root service but each gets its own component-level service with its own state. Angular resolves a dependency by walking up the element injector tree (the component and its parents, then host elements) and then the environment injectors (route, then root), so the nearest provider wins. Use root for shared state and APIs, component providers for per-instance state such as a form, a table or a wizard.

### In code

```ts
@Injectable({ providedIn: 'root' })
export class AuthService { /* one for the whole app */ }

@Injectable()                                   // no providedIn: provided where you list it
export class TableState { page = 0; }

@Component({
  selector: 'app-item',
  standalone: true,
  providers: [TableState],                      // one TableState per app-item
  template: `{{ state.page }}`,
})
export class ItemComponent {
  auth = inject(AuthService);                   // shared
  state = inject(TableState);                   // private to this instance (and its children)
}
```

```html
<app-item /> <app-item />
```

Result, which I verified with `TestBed`: both items received the **same** `AuthService` and **different** `TableState` objects; changing `page` on one left the other at `0`.

### How resolution works

1. The **element injector** tree: the component's own `providers`, then `viewProviders`, then each parent element up to the root component.
2. The **environment injector** tree: a route's `providers` (for lazy-loaded routes), then the root injector.
3. If nothing provides it: `NullInjectorError`.

`viewProviders` are visible to the component's template but not to projected content.

### Choosing

| Scope | Use for | Lifetime |
|---|---|---|
| Root | Auth, HTTP wrappers, config, global caches | Whole app |
| Route (`providers` in route config) | State for one feature area, a lazy-loaded feature | While the route's injector lives (lazy ones are kept after first load) |
| Component | Per-instance state (table, form, dialog) | The component instance |

### Gotchas

- **Accidental duplication:** providing a service in a lazy route (or a component) and expecting a singleton gives a second copy with separate state.
- **Provider on a component also reaches its children** (content and view), which is useful for a parent and children sharing a store.
- **`providedIn: 'root'` is tree-shakable;** listing a service in a module or component `providers` array always includes it.
- **Cleanup:** a component-level service can implement `ngOnDestroy`, and it runs when the component is destroyed, which a root service never does.
- **Testing:** `TestBed.overrideProvider` or `providers` in the test module replaces either kind.

### References

- [Angular: Dependency injection](https://angular.dev/guide/di)
- [Angular: Hierarchical injectors](https://angular.dev/guide/di/hierarchical-dependency-injection)

Appears in a shared list of Angular interview prompts (second-hand; source unverified). The instance behaviour was checked in an Angular 19 test.

## What triggers an `OnPush` component to update, and can its view change when no input reference changes?
<!--
id: angular-onpush-triggers
level: senior
tags: angular, change detection, onpush, signals, async pipe, markforcheck
minutes: 15
-->

> [!PROMPT]
> What triggers an `OnPush` component to update? Can its view change even when none of its input references change?

> [!HINT]
> - List everything that marks an `OnPush` view dirty.
> - What happens if a parent mutates the object it passed in?
> - What is the difference between `markForCheck` and `detectChanges`?

> [!TLDR]
> An `OnPush` component is checked only when it is marked dirty: an input reference changes, an event listener in its own template (or a child's) fires, an `async` pipe in its template receives a value, a signal read in its template changes, or code calls `markForCheck()` (or `detectChanges()` directly). So yes, its view can change when no input reference changed: through its own events, signals, the `async` pipe, or an explicit mark. Mutating an input object in place does not mark it dirty, so the view stays stale until something else triggers a check, at which point it re-renders with the mutated data. Prefer immutable updates and signals.

### Each trigger, shown

```ts
@Component({
  selector: 'app-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span id="name">{{ user.name }}</span>
    <span id="clicks">{{ clicks }}</span>
    <span id="signal">{{ count() }}</span>
    <button (click)="clicks = clicks + 1">+</button>
  `,
})
export class PanelComponent {
  @Input() user!: { name: string };
  clicks = 0;
  count = signal(0);
  cdr = inject(ChangeDetectorRef);
}
```

I ran this in an Angular 19 test with a parent that owns `user`:

| Action | View updates? |
|---|---|
| `parent.user.name = 'x'` (mutate, same reference) | **No** |
| `parent.user = { name: 'x' }` (new reference) | Yes |
| Click the button inside the component | Yes (a template event marks the view dirty) |
| `panel.clicks = 10` from outside code | No |
| ...then `panel.cdr.markForCheck()` | Yes |
| `panel.count.set(7)` (signal read in the template) | Yes |

And the subtle part: after the in-place mutation did not show, a later button click re-rendered the component and the mutated name **appeared**. The check re-evaluates every binding; mutation is invisible only until the next check.

### The list to memorise

1. An `@Input` reference changes (strict `===`).
2. A DOM event handled by the component's template, or by a child (the event bubbles up marking ancestors).
3. The `async` pipe emits (it calls `markForCheck`).
4. A signal read in the template changes.
5. `markForCheck()` (mark ancestors dirty, check on the next cycle) or `detectChanges()` (check this view now).
6. Zone.js alone does **not** do it: a `setTimeout` or HTTP callback runs a change detection pass, but an `OnPush` view that is not dirty is skipped.

### Practical rules

- Update arrays and objects immutably (`[...items, next]`, `{ ...user, name }`).
- Hold state in signals or observables bound with `async`; both work without `markForCheck`.
- Use `markForCheck` for state that changes outside Angular's knowledge (a third-party callback).
- Make `OnPush` the default for new components; it makes change detection predictable and cheap.

### Follow-ups

- **"Does `OnPush` stop the parent from checking?"** No, it limits checks of this component's subtree.
- **"What does zoneless change detection change?"** Notifications come from signals, events, the async pipe and `markForCheck`, instead of zone.js patching everything; `OnPush`-style discipline becomes the model.
- **"Why did my list not update?"** Almost always an in-place mutation of an input.

### References

- [Angular: Skipping component subtrees](https://angular.dev/best-practices/skipping-subtrees)
- [Angular: Change detection](https://angular.dev/guide/change-detection)

Appears in a shared list of Angular interview prompts (second-hand; source unverified). The table was produced by running the component in an Angular 19 test.

## `signal`, `computed` and `effect`: what each is for, how they differ, and the mistakes with effects
<!--
id: angular-signal-computed-effect
level: senior
tags: angular, signals, computed, effect, reactivity, state
minutes: 15
-->

> [!PROMPT]
> What is the difference between `signal`, `computed` and `effect`? Give an example of each and say when you would not use an effect.

> [!HINT]
> - Which one holds writable state, which derives, which performs side effects?
> - Is `computed` lazy? Does it cache?
> - What should you do instead of setting a signal inside an effect?

> [!TLDR]
> A `signal` holds a value you can read by calling it and change with `set` or `update`. A `computed` derives a read-only value from other signals: it is lazy (runs only when read), memoised (cached until a dependency changes), and tracks its dependencies automatically. An `effect` runs a side effect (logging, saving to storage, calling a non-Angular API, drawing on a canvas) whenever the signals it reads change, scheduled and batched by Angular, and it is not for producing state: derive state with `computed`, and reserve `effect` for leaving the reactive world. Using an effect to copy one signal into another is the most common mistake.

### The three, in one example

```ts
import { signal, computed, effect } from '@angular/core';

const count = signal(1);                              // writable state
const double = computed(() => count() * 2);           // derived, read-only, cached

effect(() => {                                        // side effect, re-runs when count changes
  localStorage.setItem('count', String(count()));
});

count.set(2);
count.update((n) => n + 1);
double();            // 6
const view = count.asReadonly();   // expose without letting others write
```

### Behaviour I verified in an Angular 19 test

- `computed` did **not** run until first read, ran once for two reads, and ran again only after its dependency changed.
- An effect ran after `flushEffects()` and saw only the **latest** value when the signal was set twice in a row (`[2, 4]`): effects are batched.
- An effect that set another signal worked in this version (older versions needed `allowSignalWrites: true`), but it is still a smell.

### When not to use an effect

```ts
// Bad: derived state through an effect (extra render pass, easy to loop)
effect(() => this.total.set(this.price() * this.qty()));

// Good
protected readonly total = computed(() => this.price() * this.qty());
```

- **Reacting to a user event:** do it in the event handler.
- **Loading data when an input changes:** use `resource`/`rxResource`, or `toSignal` with `switchMap`, not an effect that calls `subscribe`.
- **Form sync:** use `linkedSignal` (derived but writable) for state that resets when another signal changes.

### Related tools

- **`linkedSignal`:** a writable signal whose value resets from a source signal (selected item resets when the list changes).
- **`toSignal` and `toObservable`:** bridge RxJS and signals.
- **`untracked`:** read a signal in an effect without making it a dependency.
- **Equality:** signals skip notifying when a new value is `===` the old one, so set a new object to signal a change.

### Signals versus RxJS

Signals model **state over time that always has a value** and are synchronous and glitch-free; RxJS models **streams of events** with timing (debounce, retry, cancel). Use signals for UI state and derived values, and RxJS for async flows, converting at the edges.

### References

- [Angular: Signals](https://angular.dev/guide/signals)
- [Angular: Effects](https://angular.dev/guide/signals#effects)

Appears in a shared list of Angular interview prompts (second-hand; source unverified). The behaviours above were checked in an Angular 19 test.

## `switchMap`, `concatMap` and `exhaustMap`: choosing the flattening operator for a search box and a Save button
<!--
id: rxjs-switchmap-concatmap-exhaustmap
level: senior
tags: rxjs, angular, switchmap, concatmap, exhaustmap, mergemap, race conditions
minutes: 15
-->

> [!PROMPT]
> When would you choose `switchMap`, `concatMap` or `exhaustMap`? Pick one for a search box and one for a Save button, and explain your choices.

> [!HINT]
> - What should happen to a request that is still running when a new event arrives?
> - Does order matter for the results? Does losing an event matter?
> - What would `mergeMap` do?

> [!TLDR]
> All four map each event to an inner observable (usually an HTTP call) and differ in what they do with overlap. `switchMap` cancels the previous inner request and keeps only the latest: right for a search box, where older results are useless (it also unsubscribes, which aborts the HTTP request). `exhaustMap` ignores new events while one is running: right for a Save or Submit button, where a double click must not send two requests. `concatMap` queues events and runs them one after another in order: right when every event matters and order matters, such as a series of edits. `mergeMap` runs them all in parallel with no ordering guarantee, fine for independent work.

### What each does with three quick events

```ts
// events a, b, c arrive 5 ms apart; each inner request takes 30 ms
switchMap  → ['c']             // a and b cancelled
concatMap  → ['a', 'b', 'c']   // one at a time, in order
exhaustMap → ['a']             // b and c ignored while a runs
mergeMap   → ['a', 'b', 'c']   // all at once, completing in any order
```

I ran this with RxJS 7 and the results matched.

### The search box

```ts
protected readonly term = new FormControl('', { nonNullable: true });

protected readonly results = toSignal(
  this.term.valueChanges.pipe(
    debounceTime(300),
    map((t) => t.trim()),
    distinctUntilChanged(),
    switchMap((t) =>
      t.length < 2
        ? of([])
        : this.http.get<Result[]>('/api/search', { params: { q: t } }).pipe(
            catchError(() => of([])),         // an error must not kill the outer stream
          ),
    ),
  ),
  { initialValue: [] },
);
```

`switchMap` guarantees the displayed results belong to the latest term, and `catchError` sits **inside** the inner observable so one failure does not complete the typeahead.

### The Save button

```ts
private readonly save$ = new Subject<void>();
protected readonly saving = signal(false);

constructor() {
  this.save$
    .pipe(
      exhaustMap(() => {
        this.saving.set(true);
        return this.http.post('/api/draft', this.form.getRawValue()).pipe(
          finalize(() => this.saving.set(false)),
        );
      }),
      takeUntilDestroyed(),
    )
    .subscribe();
}
```

`exhaustMap` drops clicks while a save is running. Use `concatMap` instead when losing a save would lose data (an autosave queue), and avoid `switchMap` for a save, because cancelling an HTTP POST on the client does not undo it on the server.

### Rule of thumb

| Situation | Operator |
|---|---|
| Typeahead, filters, route-param loads, tab switches | `switchMap` |
| Submit, pay, login, create | `exhaustMap` |
| Ordered writes (a queue of edits) | `concatMap` |
| Independent parallel work (load each row's details) | `mergeMap` with a concurrency limit |

### Pitfalls

- `switchMap` on a **write** can leave the server in an unknown state.
- `catchError` on the outer stream ends it; keep it inside.
- `mergeMap` on typeahead produces out-of-order results.
- Remember `takeUntilDestroyed()` (or the `async` pipe) so subscriptions end with the component.

### References

- [RxJS: switchMap](https://rxjs.dev/api/operators/switchMap)
- [RxJS: exhaustMap](https://rxjs.dev/api/operators/exhaustMap)
- [RxJS: concatMap](https://rxjs.dev/api/operators/concatMap)

Appears in a shared list of Angular interview prompts (second-hand; source unverified). The overlap behaviour was run with RxJS 7; the component snippets were not run as a whole.

## What the `async` pipe does for you, and how many requests binding the same HTTP observable twice makes
<!--
id: angular-async-pipe-double-subscription
level: senior
tags: angular, async pipe, rxjs, http, cold observables, sharereplay
minutes: 12
-->

> [!PROMPT]
> What does Angular's `async` pipe handle for you? If you bind the same HTTP Observable twice with `async`, how many requests might you see?

> [!HINT]
> - What does the pipe do on creation, on a new value and on destroy?
> - Is an HTTP observable hot or cold?
> - Three ways to make it one request.

> [!TLDR]
> The `async` pipe subscribes to an observable or promise, returns its latest value to the template, marks the view for check when a value arrives (so it works with `OnPush`), and unsubscribes when the component is destroyed or the bound observable changes, so no manual `subscribe` or `unsubscribe`. An `HttpClient` observable is cold: every subscription sends its own request, so two `| async` on the same observable send two requests. Fix it by subscribing once (`@if (data$ | async; as data)` or `@let data = data$ | async`), or sharing the stream with `shareReplay({ bufferSize: 1, refCount: true })`, or converting to a signal with `toSignal`.

### What it does

- Subscribes when the view is created and passes the latest emitted value (`null` before the first one).
- Calls `markForCheck`, so `OnPush` views update.
- Unsubscribes on destroy, and switches subscription if you bind a different observable.
- Works for promises too.

### Two bindings, two requests

```ts
@Component({
  standalone: true,
  imports: [AsyncPipe],
  template: `{{ (user$ | async)?.name }} {{ (user$ | async)?.email }}`,   // two subscriptions
})
export class Bad {
  user$ = inject(HttpClient).get<User>('/api/user');    // cold: one request per subscriber
}
```

I tested the same shape with an observable that counts subscriptions (standing in for `HttpClient`): the two-binding version subscribed **twice**.

### Three fixes, each tested the same way (one subscription)

```ts
// 1. Subscribe once and name the result
template: `@if (user$ | async; as user) { {{ user.name }} {{ user.email }} }`
// or: @let user = user$ | async;

// 2. Share the stream
user$ = this.http.get<User>('/api/user').pipe(shareReplay({ bufferSize: 1, refCount: true }));

// 3. Convert to a signal
user = toSignal(this.http.get<User>('/api/user'));   // template: {{ user()?.name }}
```

`shareReplay` with `refCount: true` unsubscribes from the source when the last subscriber leaves; without it, an unused cache can live forever and a later subscriber gets stale data.

### Also useful to say

- A subscription created inside `async` ends with the view; one created with `.subscribe()` in a component needs `takeUntilDestroyed()`.
- Error handling: an error in the observable is thrown into the template unless you `catchError` first.
- `null` first: use `?.` or `@if`, and show a loading state while the value is `null`.
- Call a method that returns a **new** observable (`getUser$() | async`) and the pipe re-subscribes on every check; keep the observable in a stable field.

### References

- [Angular: AsyncPipe](https://angular.dev/api/common/AsyncPipe)
- [RxJS: shareReplay](https://rxjs.dev/api/operators/shareReplay)

Appears in a shared list of Angular interview prompts (second-hand; source unverified). The subscription counts were measured in an Angular 19 test.

## How do you set Angular build budgets, and what should they be?
<!--
id: angular-build-budgets
level: senior
tags: angular, build, budgets, bundle size, performance, ci
minutes: 10
-->

> [!PROMPT]
> How do you set Angular build budgets? What would you put in them and what happens when one is exceeded?

> [!HINT]
> - Where is the configuration, and what are the two thresholds?
> - Which budget types exist and which one do you care about most?
> - How do you pick numbers?

> [!TLDR]
> Budgets live in `angular.json` (or `project.json`) under the build target's configuration, as a list of `{ type, maximumWarning, maximumError }` entries. When the production build exceeds a warning threshold it prints a warning; past the error threshold the build fails, which is what makes it useful in CI. The most important type is `initial` (the JavaScript and CSS a first page load downloads); others include `anyComponentStyle`, `anyScript`, `bundle` (a named chunk), `allScript` and `all`. Set the numbers from your current measured size plus small headroom, tighten them over time, and treat a failing budget as a review conversation, not something to raise silently.

### Configuration

```json
{
  "projects": {
    "app": {
      "architect": {
        "build": {
          "configurations": {
            "production": {
              "budgets": [
                { "type": "initial", "maximumWarning": "500kB", "maximumError": "1MB" },
                { "type": "anyComponentStyle", "maximumWarning": "2kB", "maximumError": "4kB" },
                { "type": "bundle", "name": "admin", "maximumWarning": "150kB", "maximumError": "250kB" }
              ]
            }
          }
        }
      }
    }
  }
}
```

New Angular projects ship with the first two (500 kB warning and 1 MB error for `initial`, 2 kB and 4 kB for component styles). I did not run an Angular CLI build for this question; the file shape is from the Angular documentation.

### Types

| Type | Measures |
|---|---|
| `initial` | The bundles needed for first load (main, polyfills, initial chunks), the one that tracks real page weight |
| `bundle` | One named bundle (a lazy chunk) |
| `anyComponentStyle` | Any single component stylesheet; catches accidentally giant CSS |
| `anyScript`, `any` | Every individual script, every individual file |
| `allScript`, `all` | The total of scripts, the total of everything |

### Picking numbers

1. Build and read the output (`ng build` prints the sizes) or run `source-map-explorer` on the maps.
2. Set `maximumWarning` slightly above today's size, `maximumError` a bit above that.
3. Budget the lazy chunks that matter (an admin area, a chart library) separately so one cannot grow unnoticed.
4. Lower the numbers after each optimisation so you keep the gain.
5. Remember budgets are measured **before** compression by default; compare with what users download over the network.

### Around the budget

- Run the production build in CI so an error fails the pull request.
- Back it with analysis: find what grew (a new dependency, a barrel import, a locale, an icon set) and use lazy routes, `@defer` blocks, and tree-shakable imports.
- Pair with runtime measurement (Core Web Vitals in production); a budget guards size, not speed.

### References

- [Angular: Budgets](https://angular.dev/tools/cli/build)
- [Angular: Deferrable views](https://angular.dev/guide/templates/defer)

Appears in a shared list of Angular interview prompts (second-hand; source unverified).
