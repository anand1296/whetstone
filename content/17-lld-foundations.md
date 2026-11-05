---
id: lld-foundations
title: Low-Level Design: Foundations
description: The method behind every low-level design (machine coding) round: class diagrams and relationships, contract-first interfaces, design patterns, SOLID and extensibility, and thread safety.
facets: backend, frontend
---

## A repeatable method for any low-level design round: the five things interviewers look for
<!--
id: lld-interview-framework
level: senior
tags: lld, low level design, machine coding, framework, class diagram, solid, extensibility
minutes: 15
-->

> [!PROMPT]
> You get 45 to 60 minutes to design and code "a parking lot" (or a chess game, a notification service, any LLD problem). What is your step-by-step approach, and what is the interviewer scoring?
>
> **Cover**
> - How you clarify scope and turn nouns and verbs into classes and methods.
> - The five focus areas to hit on every problem.
> - How to spend the time and what to cut.

> [!TLDR]
> Every LLD problem is graded on the same five things: a clear class model (relationships drawn precisely), a contract-first public interface, the right design patterns used for a reason, correct behavior under concurrency, and SOLID code that new features can extend without editing existing classes. Spend the first 10 minutes on requirements and the model, code the core flow end to end next, then show extensibility by adding one requested feature without touching existing classes.

### The five focus areas

1. **Class diagram.** Entities, their relationships and who owns what (association, aggregation, composition; see the relationships question in this topic).
2. **Schema and interface design.** Define the public API and data shapes before the internals: small interfaces, clear inputs and outputs, errors as part of the contract.
3. **Design patterns.** Name a pattern only when it solves a concrete problem in this design (Strategy for interchangeable pricing, State for lifecycle, Observer for notifications), and say what it buys you.
4. **Concurrency and thread safety.** What is shared and mutable, where races or deadlocks could occur, and which lock, atomic or queue protects it.
5. **SOLID and extensibility.** Closed for modification, open for extension: a new vehicle type, payment method or rule is a new class, not an edited `if` chain.

### How to spend the time

| Minutes | Do |
| --- | --- |
| 0-8 | Ask questions, list functional requirements, state what is out of scope |
| 8-15 | Entities, relationships, interfaces; sketch the class diagram |
| 15-40 | Code the core flow with in-memory storage, running a happy-path demo |
| 40-50 | Concurrency and edge cases; a test or driver `main` |
| 50-60 | Extension: "now add X"; show it touches no existing class |

### Habits that read as senior

- Say your assumptions out loud and keep scope small; a complete small design beats a half-finished large one.
- Prefer composition and interfaces over deep inheritance trees.
- Keep entities (data and invariants) separate from services (workflows) and strategies (policies).
- Write the driver code first in your head: if the calling code is awkward, the API is wrong.
- Do not over-pattern. If there are two cases and no sign of a third, a plain `if` is fine; say what would make you refactor.

### Interview follow-ups

- *"What would you change for scale?"* Persistence behind a repository interface, idempotent operations, partitioning by key. Keep this brief unless asked, since LLD is not HLD.
- *"How would you test it?"* Inject collaborators (clock, id generator, strategies) so behavior is deterministic.

## Class diagrams: association, aggregation, composition, inheritance and dependency
<!--
id: lld-class-diagrams-relationships
level: senior
tags: lld, uml, class diagram, association, aggregation, composition, inheritance
minutes: 12
-->

> [!PROMPT]
> Sketch the class diagram for a library system and explain, for each relationship, whether it is association, aggregation, composition, inheritance or dependency, and how that shows up in code.
>
> **Cover**
> - What each relationship means about lifetime and ownership.
> - How to choose between inheritance and composition.
> - How to read multiplicity (1, 0..1, 1..*).

> [!TLDR]
> Relationships encode lifetime and ownership. Association means "knows about"; aggregation is a weak whole-part (the part can outlive the whole); composition is a strong whole-part (the part cannot exist without the whole and is destroyed with it); inheritance is "is a" and should be rare; dependency is a temporary "uses". In code, composition usually means the whole creates and owns the part, while aggregation and association receive references from outside. State multiplicity on every line, and prefer composition over inheritance unless a true subtype relationship exists.

### The relationships, by example

| Relationship | Meaning | Library example | Typical code shape |
| --- | --- | --- | --- |
| Association | A knows B, independent lifetimes | `Member` borrows `Book` via `Loan` | Field holding a reference or id |
| Aggregation | Whole has parts; parts outlive it | `Library` has `Book`s (books can move branches) | Parts passed in, stored in a collection |
| Composition | Whole owns parts; parts die with it | `Book` has `BookCopy` records; `Order` has `OrderLine`s | Whole constructs and hides the parts |
| Inheritance | B is a kind of A | `EBook` is a `Book` | `extends`, only if substitutable |
| Dependency | A uses B briefly | `LoanService` uses `FineCalculator` | Parameter or local variable |

### Showing it in code

```ts
class Order {                       // composition: Order creates and owns lines
  private lines: OrderLine[] = [];
  addLine(sku: string, qty: number, price: number) {
    this.lines.push(new OrderLine(sku, qty, price));
  }
}

class Library {                     // aggregation: books exist outside the library
  constructor(private books: Map<string, Book>) {}
}
```

### Inheritance or composition?

Use inheritance only when every subtype can stand in for the parent without surprises (Liskov). If you find yourself overriding methods to throw, or the hierarchy is about behavior variants rather than kinds, switch to an interface plus injected strategy. "Bike, Car, Truck" as vehicle types is fine; "Premium user, Trial user" is usually a policy object.

### Conventions worth stating

- Mark multiplicity: a `Member` has 0..* `Loan`s; a `Loan` has exactly one `BookCopy`.
- Distinguish a **book** (title metadata) from a **book copy** (physical item). Modeling that split early is a classic sign of care.
- Keep arrows and diamonds minimal: if the whiteboard is noisy, draw only what drives the code.

## Design patterns in LLD rounds: which pattern fits which problem, and when not to use one
<!--
id: lld-design-patterns-cheatsheet
level: senior
tags: lld, design patterns, strategy, state, observer, factory, decorator, command, singleton
minutes: 15
-->

> [!PROMPT]
> The interviewer asks, "Which design patterns would you use here, and why?" Give a practical map from common LLD problems to patterns, and explain when a pattern is the wrong choice.
>
> **Cover**
> - Creational, structural and behavioral patterns you actually use.
> - The signals in requirements that suggest each one.
> - Over-engineering and how to avoid it.

> [!TLDR]
> Pick a pattern from the shape of the requirement, not from a list. Interchangeable algorithms (pricing, splitting, matching, move selection) suggest Strategy; an object whose behavior changes with its lifecycle (ATM, vending machine, booking) suggests State; one-to-many notification suggests Observer; creating the right subtype from input suggests Factory; layering optional behavior (retries, logging, formatting) suggests Decorator; undo and history suggest Command; a pipeline of handlers suggests Chain of Responsibility. Use a pattern only if it removes a concrete `if/else` or coupling problem, and say what would justify it before you reach for it.

### Signals to patterns

| Signal in the requirements | Pattern | Why |
| --- | --- | --- |
| "Several ways to compute X, may add more" | **Strategy** | Swap algorithm behind an interface (pricing, splitting, matching) |
| "Behaves differently depending on its status" | **State** | Each state class owns its legal transitions (ATM, vending, ticket) |
| "When X happens, tell many others" | **Observer** | Decouple publisher from subscribers (chat, RSVP, ride updates) |
| "Create the right kind from a type or input" | **Factory** | One place decides the concrete class (rooms, cards, messages) |
| "Add features around a core, combinable" | **Decorator** | Wrap and compose (notification retry plus logging) |
| "Undo, redo, replay, history" | **Command** | Moves become objects (chess history) |
| "Request passes through checks until handled" | **Chain of Responsibility** | Ordered handlers (ATM cash denominations, validation) |
| "Exactly one shared instance" | **Singleton** | Use sparingly; prefer injecting one instance |
| "Adapt an external API to our interface" | **Adapter** | Payment gateways behind one `PaymentProvider` |

### A small example: Strategy removing an `if` chain

```ts
interface PricingStrategy { price(hours: number): number }
class HourlyPricing implements PricingStrategy { price(h: number) { return h * 20; } }
class FlatDayPricing implements PricingStrategy { price(h: number) { return h > 6 ? 100 : h * 20; } }

class Ticket {
  constructor(private pricing: PricingStrategy) {}
  fee(hours: number) { return this.pricing.price(hours); }
}
```

Adding weekend pricing is a new class, not an edit to `Ticket`.

### When a pattern is wrong

- Two cases, no evidence of a third: a plain conditional is clearer.
- Singleton for convenience: it hides dependencies and makes tests share state.
- Deep Decorator or Observer chains that nobody can trace; keep the number of moving parts proportional to the requirements.

### Say it like this

"I'll model pricing as a Strategy because the requirement says rules will change; if it were a single fixed rule I would keep it inline." That sentence shows judgment, not memorization.

## SOLID and code extensibility in practice: adding a feature without editing existing classes
<!--
id: lld-solid-extensibility
level: senior
tags: lld, solid, open closed, dependency inversion, extensibility, refactoring
minutes: 14
-->

> [!PROMPT]
> You designed a notification service with email only. The interviewer says, "Now add SMS and push, then per-user preferences." Walk through how SOLID makes this a small change, and show where your first design would have broken.
>
> **Cover**
> - Each SOLID principle applied to a concrete class.
> - How you would show extensibility in the last ten minutes.
> - Common ways SOLID is misapplied.

> [!TLDR]
> Extensibility means a new requirement adds code instead of editing code. Single responsibility keeps one reason to change per class; open/closed lets you add behavior through new implementations of an interface; Liskov means substitutes must honor the contract; interface segregation keeps interfaces small and focused; dependency inversion makes high-level workflows depend on abstractions that you inject. In an LLD round, demonstrate it live: add the new channel or rule by writing one new class and one line of wiring, with no change to the existing service.

### The principles applied

- **Single responsibility.** `NotificationService` decides who gets what; `EmailSender` knows how to send email; templates format content. A change in SMTP details does not touch the service.
- **Open/closed.** `NotificationService` depends on `Channel[]`. SMS is `class SmsChannel implements Channel` plus registration.
- **Liskov substitution.** Every `Channel` must honor the contract (return a result, do not throw for ordinary failures, respect timeouts). A `PushChannel` that throws "not supported" for some inputs breaks callers.
- **Interface segregation.** Do not force every sender to implement `sendBulk` and `schedule`; split `Sender`, `BulkSender`, `Schedulable`.
- **Dependency inversion.** The service receives channels, a clock and an id generator through its constructor, so tests and new features need no edits inside it.

### The extension demo

```ts
interface Channel { readonly name: string; send(user: User, msg: Message): Promise<void> }

class NotificationService {
  constructor(private channels: Map<string, Channel>, private prefs: PreferenceStore) {}
  async notify(user: User, msg: Message) {
    for (const name of this.prefs.channelsFor(user)) {
      await this.channels.get(name)?.send(user, msg);
    }
  }
}

// New requirement: register one more class, nothing else changes.
channels.set('sms', new SmsChannel(smsClient));
```

### Where the first design usually breaks

A `switch (type)` inside `notify` that must be edited for every channel; static helper calls to a concrete `EmailClient`; a service that also formats templates and stores preferences. Naming those smells and fixing them is itself a strong interview moment.

### Misusing SOLID

- Interfaces for everything, including classes that will never have a second implementation.
- Splitting classes so finely that one behavior spans eight files.
- Treating extensibility as free: every abstraction costs reading time, so add them where change is likely (ask the interviewer what will change).

## Concurrency and thread safety in LLD: race conditions, deadlocks and locking choices
<!--
id: lld-concurrency-thread-safety
level: lead
tags: lld, concurrency, thread safety, locks, deadlock, race condition, optimistic locking, atomic
minutes: 16
-->

> [!PROMPT]
> Two users try to book the last seat at the same moment, or two threads append to the same chat room. How do you find the concurrency risks in an LLD solution and make it safe, without locking everything?
>
> **Cover**
> - How to spot shared mutable state and check-then-act races.
> - Lock granularity, deadlock avoidance and optimistic versus pessimistic strategies.
> - What changes in a single-threaded runtime like JavaScript.

> [!TLDR]
> Concurrency bugs live where shared mutable state is read, decided on, then written (check-then-act). Make the operation atomic: lock the smallest unit that guards the invariant (the seat, not the theater), use atomic or compare-and-set operations for single values, or use optimistic versioning when conflicts are rare. Avoid deadlocks with a consistent lock order or a single lock, keep critical sections short with no I/O inside, and release in `finally`. In single-threaded runtimes like JavaScript the same races still occur across `await` points, so treat any gap between a check and a write as a race.

### Find the race

Ask for every operation: what shared state does it read, what decision does it make, and what does it write? The classic bug:

```ts
if (seat.status === 'AVAILABLE') {      // check
  seat.status = 'HELD';                  // act: another request can slip in between
}
```

Fix by making the pair atomic.

### Tools and when to use them

| Tool | Use for | Trade-off |
| --- | --- | --- |
| Mutex / `synchronized` per resource | Booking a seat, updating an account | Simple; contention if too coarse |
| Atomic / compare-and-set | Counters, flags, a single reference | No blocking; only single values |
| Optimistic locking (version column) | Low conflict, DB-backed state | Retries on conflict |
| Concurrent collections | Shared maps and queues | Individual ops safe, compound ops are not |
| Single-threaded queue / actor per entity | Chat room, game session | Serializes without locks; one hot entity can bottleneck |
| Seat hold with expiry (lease) | Multi-step flows such as payment | Needs a timeout and cleanup |

### Deadlocks

They need circular waiting. Avoid them by:

1. Acquiring multiple locks in a global order (for example, sorted by account id when transferring money).
2. Using a single lock for the whole transaction when contention is low.
3. Using timeouts or `tryLock` and retrying.

### Practical rules

- Lock granularity: per seat, per account, per room. One global lock is correct but slow; say so, then refine.
- No network calls or slow work while holding a lock.
- Make idempotent operations (a retried payment must not double charge).
- Immutability helps: share immutable value objects freely, guard only the mutable aggregates.

### JavaScript and Node

There are no data races on plain variables, but `await` yields control, so check-then-act across an await is a race. Guard with a per-key promise chain or queue, or push the invariant into the database (unique constraint, conditional update).

```ts
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (locks.get(key) ?? Promise.resolve()).then(fn, fn);
  locks.set(key, run.catch(() => {}));
  return run;
}
```

## OOP in four ideas: encapsulation, abstraction, inheritance and polymorphism, with examples
<!--
id: lld-oop-four-pillars
level: junior
tags: lld, oop, encapsulation, abstraction, inheritance, polymorphism, fundamentals
minutes: 10
-->

> [!PROMPT]
> Explain the four pillars of object-oriented programming with a small example for each, and say when each one goes wrong.

> [!TLDR]
> **Encapsulation** hides internal state behind methods so invariants cannot be broken from outside; **abstraction** exposes what an object does through a simple interface and hides how; **inheritance** lets a type reuse and specialize another ("is a"); **polymorphism** lets code work with a base type or interface and have the right implementation run. They work best together: program to interfaces (abstraction and polymorphism), keep data private (encapsulation) and use inheritance sparingly, preferring composition when the relationship is not truly "is a".

### Example in TypeScript

```ts
interface Shape { area(): number }                         // abstraction

class Circle implements Shape {
  constructor(private readonly r: number) {}               // encapsulation: r is private
  area() { return Math.PI * this.r ** 2; }
}
class Rect implements Shape {
  constructor(private readonly w: number, private readonly h: number) {}
  area() { return this.w * this.h; }
}

const total = (shapes: Shape[]) => shapes.reduce((s, x) => s + x.area(), 0);  // polymorphism
```

```ts
class Account {                                            // encapsulation protecting an invariant
  private balance = 0;
  deposit(n: number) { if (n <= 0) throw new Error('invalid'); this.balance += n; }
  get current() { return this.balance; }
}
class SavingsAccount extends Account {}                    // inheritance: a savings account is an account
```

### When each goes wrong

- Encapsulation: public mutable fields everywhere.
- Abstraction: interfaces nobody needs, or leaky ones that expose implementation details.
- Inheritance: deep hierarchies and subclasses that break the parent's contract.
- Polymorphism: `instanceof` checks scattered around instead of letting the object decide.

### Follow-up

"Abstraction versus encapsulation?" Encapsulation protects data and rules inside a unit; abstraction simplifies how others use it.

## Composition over inheritance: refactor a class hierarchy into small pluggable parts
<!--
id: lld-composition-over-inheritance
level: senior
tags: lld, composition, inheritance, strategy, liskov, refactoring, design principles
minutes: 14
-->

> [!PROMPT]
> A codebase has `Bird`, `FlyingBird`, `SwimmingBird`, `FlyingSwimmingBird` and a growing explosion of subclasses. How do you refactor with composition, and when is inheritance still the right tool?

> [!TLDR]
> Inheritance couples a subclass to its parent's implementation and models only one axis of variation; when behaviors vary independently (flying, swimming, sound), a class per combination explodes. Composition models each behavior as a small object (a strategy) that the class holds and delegates to, so you combine behaviors by assembly, swap them at runtime and test them alone. Keep inheritance for genuine "is a" relationships where every subtype honors the parent's contract (Liskov), or use shallow hierarchies with an abstract base and interfaces.

### The refactor

```ts
interface Movement { move(): string }
class Fly implements Movement { move() { return 'flies'; } }
class Swim implements Movement { move() { return 'swims'; } }
class Walk implements Movement { move() { return 'walks'; } }

class Bird {
  constructor(private readonly name: string, private readonly movements: Movement[]) {}
  describe() { return `${this.name} ${this.movements.map(m => m.move()).join(' and ')}`; }
}

const duck = new Bird('Duck', [new Walk(), new Fly(), new Swim()]);
const penguin = new Bird('Penguin', [new Walk(), new Swim()]);   // no FlyingBird tree, no "penguin can't fly" override
```

### Why it is better

- New behavior is a new class, not a new level in a tree.
- No overriding a method to throw "not supported" (a Liskov violation).
- Behaviors are reusable by unrelated classes and easy to mock.

### When inheritance is fine

A stable taxonomy with real substitutability (`Shape` with `Circle`, `Rect`), framework extension points that require a base class, or a template method with a tiny, well-documented hook surface. Prefer an interface plus a default implementation helper over deep class trees.

### Interview phrasing

"I model what varies as a separate object so the class stays closed to modification and composition lets me add behaviors without touching it."
