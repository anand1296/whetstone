---
id: lld-problems
title: Low-Level Design: Classic Problems
description: Sixteen classic machine-coding problems, from parking lot and BookMyShow to chess, Splitwise, ATM and ride booking, each with the entities, the patterns that fit and the traps.
facets: backend, frontend, lld
---

## Design a parking lot: vehicles, spots, tickets and pluggable pricing
<!--
id: lld-parking-lot
level: senior
tags: lld, parking lot, inheritance, polymorphism, strategy pattern, fundamentals
minutes: 45
-->

> [!PROMPT]
> Design a multi-floor parking lot with different vehicle types and spot sizes. Vehicles enter, get a ticket and a spot, and pay on exit. Pricing rules will change.
>
> **Requirements**
> - Park and unpark; find the nearest suitable free spot.
> - Motorcycles, cars and trucks fit different spot sizes.
> - Hourly pricing now; flat day rate or weekend pricing later.

> [!TLDR]
> Model `Vehicle` (a type, with inheritance or a size enum), `ParkingSpot` with a size and state, `ParkingFloor`, `Ticket` and a `ParkingLot` facade. Use polymorphism for vehicle and spot compatibility, a Strategy for spot allocation (nearest, lowest floor) and a Strategy for pricing so rules change without editing `Ticket` or `ParkingLot`. The traps are two threads taking the same spot, tickets that are not idempotent on exit, and hard-coding pricing in `if` chains.

### Entities

- `Vehicle` (plate, type), `ParkingSpot` (id, size, floor, occupied), `Ticket` (id, vehicle, spot, entryTime), `ParkingFloor` (spots by size), `ParkingLot` (floors, strategies).
- Compatibility: a spot accepts a vehicle if `spot.size >= vehicle.requiredSize`. Decide whether a car may take a truck spot and state your choice.

### Where the patterns go

- **Strategy: allocation.** `SpotSelector.pick(floors, vehicle)` with `NearestToEntrance` or `FillFloorFirst`.
- **Strategy: pricing.** `PricingStrategy.fee(ticket, exitTime)`: hourly, flat, weekend multiplier.
- **Factory (optional):** `VehicleFactory.create(type, plate)` if types come from input.

### Core flow

```ts
park(vehicle: Vehicle): Ticket {
  const spot = this.selector.pick(this.floors, vehicle);   // must claim atomically
  if (!spot) throw new LotFullError();
  return this.tickets.issue(vehicle, spot, this.clock.now());
}
unpark(ticketId: string): Receipt {
  const t = this.tickets.close(ticketId);                  // idempotent: second call fails clearly
  t.spot.release();
  return new Receipt(t, this.pricing.fee(t, this.clock.now()));
}
```

### Concurrency and edge cases

- Claiming a spot is check-then-act: lock per spot or use compare-and-set on its state.
- Inject a `Clock` so pricing is testable.
- Lost ticket, full lot, wrong vehicle type, exiting twice.

### Extension demo

"Add EV charging spots": a new `SpotType` and a selector rule, no change to `ParkingLot`.

## Design movie ticket booking (BookMyShow): seat holds, concurrency and the booking state machine
<!--
id: lld-bookmyshow
level: lead
tags: lld, bookmyshow, ticket booking, concurrency, state pattern, locking, seat hold
minutes: 50
-->

> [!PROMPT]
> Design a movie ticket booking system. Users browse shows, pick seats, pay and receive tickets. Many users compete for the same seats.
>
> **Requirements**
> - Show seat map for a show; select several seats.
> - No double booking, even under heavy concurrency.
> - Seats are held during payment and released if payment fails or times out.

> [!TLDR]
> The heart of this problem is correctness under contention. Model `Movie`, `Theater`, `Screen`, `Show`, `ShowSeat` (per-show seat state) and `Booking`. Drive the seat and booking through a state machine (AVAILABLE, HELD, BOOKED; booking PENDING, CONFIRMED, CANCELLED, EXPIRED) using the State pattern. Make "hold these seats" atomic with a lock per show (or per seat in a consistent order) or a conditional update, give holds an expiry, and make confirmation idempotent. Seat state belongs to the `Show`, not the physical seat.

### Entities

`Show` (movie, screen, time) owns many `ShowSeat`s; `Booking` references the user, show and seats. Separating `Seat` (physical) from `ShowSeat` (status for one show) is the common good insight.

### The hold flow

```ts
holdSeats(showId: string, seatIds: string[], userId: string): Booking {
  const show = this.shows.get(showId);
  return show.withLock(() => {                       // or per-seat locks sorted by id
    const seats = seatIds.map(id => show.seat(id));
    if (!seats.every(s => s.isAvailable())) throw new SeatUnavailableError();
    seats.forEach(s => s.hold(userId, this.clock.now() + HOLD_MS));
    return this.bookings.createPending(userId, show, seats);
  });
}
```

All-or-nothing: either every requested seat is held or none.

### State, expiry and payment

- `confirm(bookingId, paymentRef)`: only from PENDING and only if the holds are still valid; idempotent on `paymentRef`.
- Expiry: a scheduled sweeper (or lazy check when reading seats) releases expired holds.
- Payment callbacks can arrive late or twice; the state machine rejects illegal transitions.

### Traps

- Check-then-hold without a lock (two users both see AVAILABLE).
- Locking seats in arbitrary order causes deadlocks; sort ids first.
- Holding the lock during payment: never hold locks across network calls.

### Extension demo

"Add dynamic pricing by seat category": a `PricingStrategy` used when creating the booking.

## Design a library management system: encapsulation, one-to-many relations and search strategies
<!--
id: lld-library-management
level: senior
tags: lld, library management, encapsulation, relations, search strategy, fundamentals
minutes: 40
-->

> [!PROMPT]
> Design a library system where members borrow and return book copies, can reserve a book that is out, and search the catalog by title, author or subject. Late returns incur fines.
>
> **Requirements**
> - Members have a borrowing limit; copies have a due date.
> - Search by several criteria, extensible to new ones.
> - Fines computed on return.

> [!TLDR]
> Separate `Book` (catalog metadata) from `BookCopy` (a physical item that is borrowed), and model the one-to-many relations explicitly: a book has many copies, a member has many loans, a loan links one member to one copy. Encapsulate rules inside the entities (a member knows whether they can borrow more) and keep workflows in a `LibraryService`. Use a Strategy or composable `Specification` for search and for fines. The traps are borrowing the same copy twice and putting all logic into one giant `Library` class.

### Entities and relations

- `Book (isbn, title, authors, subjects)` 1..* `BookCopy (barcode, status)`.
- `Member (id, loans, limit)` 0..* `Loan (copy, member, borrowedAt, dueAt, returnedAt)`.
- `Reservation (member, book, createdAt)` queue per book.

### Behavior placement

- `Member.canBorrow()` checks limit and outstanding fines (the entity guards its invariants).
- `LibraryService.checkout(memberId, barcode)` orchestrates: validate, mark copy `LOANED`, create `Loan`.
- On return, if the book has a reservation, notify the next member (Observer).

### Search

```ts
interface SearchCriteria { matches(book: Book): boolean }
class ByTitle implements SearchCriteria { constructor(private q: string) {} matches(b: Book) { return b.title.toLowerCase().includes(this.q.toLowerCase()); } }
const and = (...cs: SearchCriteria[]): SearchCriteria => ({ matches: b => cs.every(c => c.matches(b)) });
```

New criteria are new classes; combining them needs no catalog changes.

### Fines

`FinePolicy.calculate(loan, returnedAt)`: per-day, capped, different per member type. Inject it.

### Traps

Two checkouts of the same copy at once (atomic status change); modeling only `Book` so you cannot track which copy is out; storing computed fines instead of deriving them.

## Design a hotel management system: rooms, availability, factories and billing
<!--
id: lld-hotel-management
level: senior
tags: lld, hotel management, factory pattern, room allocation, billing, date ranges
minutes: 45
-->

> [!PROMPT]
> Design a hotel booking system with different room types. Guests search availability for a date range, book a room, check in and out, and receive a bill with room charges and extras.
>
> **Requirements**
> - Room types (single, double, suite) with different rates.
> - No overlapping bookings for the same room.
> - Bill generation with room nights, taxes and added services.

> [!TLDR]
> Model `Hotel`, `Room` (with a `RoomType`), `Booking` (room, guest, date range, status) and `Bill` made of line items. Use a Factory to create rooms or services from type, a Strategy for room allocation (cheapest fit, upgrade rules) and for pricing (seasonal rates, taxes). The core algorithm is date-range overlap: a room is free for `[from, to)` if no active booking intersects it. Guard booking creation against concurrent overlaps, and keep the bill as immutable line items so it can be audited.

### Entities

`Room (number, type, floor)`, `RoomType (name, baseRate, capacity)`, `Booking (id, guest, room, from, to, status)`, `Guest`, `Bill (lineItems)`, `Service (laundry, food)` as chargeable add-ons.

### Availability

Half-open intervals avoid the "same-day checkout and check-in" off-by-one:

```ts
const overlaps = (a: Range, b: Range) => a.from < b.to && b.from < a.to;
isFree(room, range) { return !room.bookings.some(b => b.active && overlaps(b.range, range)); }
```

### Patterns

- **Factory:** `RoomFactory.create(type, number)` and `ServiceFactory`.
- **Strategy:** `PricingStrategy` (season, weekend, loyalty) and `RoomAllocationStrategy`.
- **State:** booking `RESERVED -> CHECKED_IN -> CHECKED_OUT`, plus `CANCELLED`.

### Billing

Compute nights times nightly rate under the pricing strategy, add services as separate line items, apply tax last. Never mutate past line items; add a correction item instead.

### Traps

Two guests booking the same room for overlapping dates; time zones and check-in cutoffs; floating-point money (use integers of minor units); no cancellation policy hook.

## Design Snake and Ladder: game loop, entity modeling and testable randomness
<!--
id: lld-snake-and-ladder
level: senior
tags: lld, snake and ladder, game loop, entity modeling, singleton, dice, extensibility
minutes: 35
-->

> [!PROMPT]
> Design a Snake and Ladder game for two or more players on a configurable board. Players take turns rolling dice, move, and may slide down snakes or climb ladders. The first to reach the last cell wins.
>
> **Requirements**
> - Configurable board size, snakes and ladders, number of dice.
> - Deterministic tests despite randomness.
> - Rules like "must roll exact number to finish" may be added.

> [!TLDR]
> Keep the entities small: `Game` (turn loop), `Board` (size and a map of jump cells), `Player`, `Dice`, and `Jump` (snake or ladder as start to end). Inject the dice so tests can use a fixed sequence, make the rules (exact finish, extra turn on six) pluggable through a small rules interface, and treat snakes and ladders as the same abstraction. The game loop is simple; the quality signal is configurability and testability, not cleverness. Avoid a global Singleton for the board.

### Entities and flow

```ts
class Board { constructor(readonly size: number, private jumps: Map<number, number>) {}
  resolve(pos: number) { return this.jumps.get(pos) ?? pos; } }   // snake and ladder are the same thing

class Game {
  constructor(private board: Board, private players: Player[], private dice: Dice, private rules: Rules) {}
  play(): Player {
    while (true) for (const p of this.players) {
      const next = this.rules.apply(p.position, this.dice.roll(), this.board);
      p.position = this.board.resolve(next);
      if (p.position === this.board.size) return p;
    }
  }
}
```

### Design notes

- `Dice` is an interface (`RandomDice`, `FixedDice([...])` for tests).
- `Rules` handle overshoot, bonus turns, and consecutive-six penalties without editing `Game`.
- Validate the board: no jump that starts at the last cell, no cycles that trap a player forever.

### Singleton?

Interviewers often hint at it for `Board` or `Dice`. Say why you prefer injection: it keeps tests isolated, and a Singleton adds nothing here.

### Extension demo

"Add a second dice and extra turn on double six": new `Dice` composition and a `Rules` implementation.

## Design chess: rules engine, state validation and move history with the Command pattern
<!--
id: lld-chess
level: lead
tags: lld, chess, rules engine, command pattern, state validation, polymorphism, undo
minutes: 55
-->

> [!PROMPT]
> Design a two-player chess game. Players alternate moves; illegal moves are rejected; the game detects check, checkmate and stalemate; moves can be undone and listed.
>
> **Requirements**
> - Each piece type moves differently.
> - Moves must not leave your own king in check.
> - Move history for undo and replay.

> [!TLDR]
> Model `Board` (8x8 of cells), `Piece` as an abstract type with one subclass or strategy per piece, `Move`, `Player` and `Game`. Put movement geometry in each piece (`candidateMoves`) and legality in a rules layer (turn order, blocking, own-king safety, special moves like castling and en passant). Represent each move as a Command object that can `apply` and `undo`, which gives history, undo and replay. Check and checkmate are derived by simulating moves, not stored flags. Keep rendering and input out of the domain model.

### Layers

1. **Piece movement:** `Rook.candidates(board, from)` returns geometrically possible targets; sliding pieces stop at blockers.
2. **Rules engine:** filters candidates to legal moves: it is your turn, you capture only opposing pieces, and after the move your king is not attacked.
3. **Game state:** whose turn, castling rights, en-passant target, halfmove clock.

### Move as a Command

```ts
class MoveCommand {
  constructor(private from: Pos, private to: Pos, private captured?: Piece, private promoted?: Piece) {}
  apply(board: Board) { /* move piece, remember captured */ }
  undo(board: Board)  { /* restore piece and captured */ }
}
```

The game keeps a stack of commands; undo pops and reverts.

### Detecting end states

- **Check:** is the current player's king in the set of opponent attack squares?
- **Checkmate:** in check and no legal move exists. **Stalemate:** not in check and no legal move.
- Compute by trying each legal candidate on a copy or with apply/undo.

### Traps

Putting all piece logic in one giant switch; forgetting that legality depends on the whole board; special moves (castling through check, en passant, promotion) bolted on without a place in the design.

### Extension demo

"Add a variant piece or a clock": a new piece class or a `TimeControl` observer, without modifying existing pieces.

## Design Tic Tac Toe: extensible board, turn-based state machine and an AI bot strategy
<!--
id: lld-tic-tac-toe
level: senior
tags: lld, tic tac toe, state machine, strategy pattern, extensible board, ai bot
minutes: 35
-->

> [!PROMPT]
> Design Tic Tac Toe for two players that supports an N by N board and K in a row to win, and later a computer opponent.
>
> **Requirements**
> - Turn-based play with win and draw detection.
> - Board size and win length configurable.
> - Human or bot for either side.

> [!TLDR]
> Keep `Game` as a small state machine (IN_PROGRESS, WON, DRAW) with turn handling, `Board` as the grid with placement validation, and `Player` as an interface that returns a move so humans and bots are interchangeable (Strategy). Detect a win in O(1) per move with row, column and diagonal counters instead of rescanning the board. The signal is configurability (N and K), clean separation of input from rules, and an AI that plugs in as another `MoveStrategy` (random, then minimax) without changing `Game`.

### Structure

- `Board(n)` with `place(cell, symbol)` that rejects occupied or out-of-range cells.
- `Game` owns the board, players and state; `play(move)` validates turn and updates state.
- `Player.nextMove(board): Move` is implemented by `HumanPlayer` (reads input) and `BotPlayer(strategy)`.

### O(1) win detection

For a standard N-in-a-row game keep counters per player for each row, column and both diagonals; after each move, increment and check whether any equals N. For K in a row on a larger board, check the four directions outward from the last move, counting contiguous symbols.

### Bot strategy

```ts
interface MoveStrategy { choose(board: Board, me: Symbol): Move }
class RandomStrategy implements MoveStrategy { /* pick a random empty cell */ }
class MinimaxStrategy implements MoveStrategy { /* depth-limited search with alpha-beta */ }
```

### Traps

Mixing console I/O into `Game`; hard-coding 3 in loops; rescanning the full board every move; allowing moves after the game ended (state check first).

### Extension demo

"Add a third player or undo": a rotating turn order and a move history, still no changes to the board class.

## Design Blackjack and Poker: deck utility, hand evaluation and factories
<!--
id: lld-blackjack-poker
level: senior
tags: lld, blackjack, poker, deck, hand evaluation, factory pattern, strategy
minutes: 45
-->

> [!PROMPT]
> Design a card game framework that supports Blackjack first and Poker later. Include a deck, players, hands and the rules that decide the winner.
>
> **Requirements**
> - Shuffle and deal from one or more decks.
> - Evaluate hands according to the game's rules.
> - Reuse the card and deck model across games.

> [!TLDR]
> Separate reusable cards from game-specific rules. `Card` (rank, suit) and `Deck` (shuffle, draw) are generic; `Hand` is a collection; a `HandEvaluator` Strategy computes value and ranking per game (Blackjack with soft aces, Poker with category ranking). A `GameFactory` creates the right game, and an abstract `Game` template handles the common round flow (deal, player turns, resolve). Inject the random source so shuffles are testable. The traps are baking Blackjack rules into `Card` or `Hand` and mishandling aces.

### Reusable core

- `Card` is an immutable value object. `Deck` builds 52 cards (or N decks), `shuffle(rng)` uses Fisher-Yates, `draw()` throws or reshuffles when empty (state your policy).
- `Hand` holds cards; it does not know the game.

### Per-game rules

```ts
interface HandEvaluator<R> { evaluate(hand: Hand): R; compare(a: R, b: R): number }
```

- **Blackjack:** best total at most 21, counting an ace as 11 if that does not bust. Dealer strategy (hit until 17) is another Strategy.
- **Poker:** classify into categories (pair, straight, flush...), then compare ranks and kickers. Model each category check as a small rule in an ordered list.

### Structure

- `abstract class CardGame { play() { this.deal(); this.playerTurns(); return this.resolve(); } }` (Template Method).
- `GameFactory.create('blackjack' | 'poker', players)`.
- Observer for UI or logs (card dealt, player busts).

### Traps

Ace handling (soft versus hard totals), ties and split pots in poker, exposing the deck order (information leak), and shuffling with a non-uniform algorithm.

### Extension demo

"Add Texas Hold'em betting rounds": a new game subclass reusing `Deck`, `Hand` and the poker evaluator.

## Design a chat application (WhatsApp or Slack): thread safety, Observer and message factories
<!--
id: lld-chat-application
level: lead
tags: lld, chat, whatsapp, slack, thread safety, observer pattern, factory, message ordering
minutes: 50
-->

> [!PROMPT]
> Design the low-level model of a chat application with one-to-one chats and group channels. Users send text and media messages, see delivery status, and are notified of new messages.
>
> **Requirements**
> - Messages in a conversation appear in a consistent order for everyone.
> - Multiple users send concurrently.
> - New message types (image, file, poll) will be added.

> [!TLDR]
> Model `User`, `Conversation` (one-to-one or group, with participants), `Message` (abstract, with `TextMessage`, `ImageMessage` and so on built by a `MessageFactory`) and a `ChatService`. Use Observer so a conversation notifies each participant's delivery channel, and make appending messages thread-safe: either a lock per conversation or a single-writer queue per conversation that assigns a monotonically increasing sequence number, which also gives a consistent order. Track per-recipient status (SENT, DELIVERED, READ) separately from the message body.

### Entities

`Conversation (id, participants, messages)`, `Message (id, sender, seq, timestamp, content)`, `Receipt (messageId, userId, status)`.

### Ordering and concurrency

- Ordering by client timestamps is unreliable; assign `seq` on the server inside the conversation's critical section.
- One lock or queue per conversation keeps unrelated chats parallel.

```ts
send(convId: string, sender: UserId, content: Content): Message {
  const conv = this.conversations.get(convId);
  return conv.withLock(() => {
    const msg = this.factory.create(content, sender, conv.nextSeq());
    conv.append(msg);
    conv.participants.forEach(p => this.bus.publish(p, msg));   // Observer, outside heavy work
    return msg;
  });
}
```

### Patterns

- **Observer:** participants (or their connections) subscribe to a conversation.
- **Factory:** create message subtypes from a content descriptor.
- **Strategy (optional):** retention or delivery policies.

### Traps

A global lock on all chats; read receipts stored on the message instead of per recipient in groups; sending notifications while holding the lock; unbounded in-memory history without pagination.

### Extension demo

"Add polls": a `PollMessage` class plus a factory branch, no change to `Conversation`.

## Design a notification service: extensible channels, Strategy and Decorator
<!--
id: lld-notification-service
level: senior
tags: lld, notification service, strategy pattern, decorator pattern, channels, retry, templates
minutes: 40
-->

> [!PROMPT]
> Design a notification service that sends messages to users over email, SMS and push. Users have channel preferences, delivery can fail and need retries, and new channels will be added.
>
> **Requirements**
> - Send one notification over one or many channels based on preferences.
> - Retry with backoff; log every attempt.
> - Add a channel without changing existing code.

> [!TLDR]
> Define a `Channel` interface and one class per channel; `NotificationService` selects channels from user preferences and sends. Add cross-cutting behavior with Decorators (`RetryingChannel`, `LoggingChannel`, `RateLimitedChannel`) wrapped around any channel, so the sending classes stay small. Use templates (`Template.render(data)`) to separate content from delivery. Failures are part of the contract: return a result, do not let one failing channel stop the others. The design is judged on how cheaply a new channel or behavior is added.

### Core types

```ts
interface Channel { send(to: Recipient, msg: RenderedMessage): Promise<SendResult> }

class RetryingChannel implements Channel {                // Decorator
  constructor(private inner: Channel, private attempts = 3) {}
  async send(to: Recipient, msg: RenderedMessage) {
    let last!: SendResult;
    for (let i = 0; i < this.attempts; i++) {
      last = await this.inner.send(to, msg);
      if (last.ok) return last;
      await sleep(2 ** i * 100);
    }
    return last;
  }
}
```

### Service

- `notify(userId, templateId, data)`: load preferences, render once per channel, send in parallel, collect results.
- Preferences are per user and per notification category (marketing vs security).
- Mandatory messages (password reset) ignore marketing opt-outs.

### Reliability

- Idempotency key per notification so retries do not double send.
- Queue between the API and the senders so slow providers do not block callers.
- Dead-letter after exhausting retries.

### Traps

A `switch` on channel type in the service; retry logic copy-pasted into every channel; mixing template rendering with sending; sequential sends that let one slow provider delay the rest.

### Extension demo

"Add WhatsApp and a daily digest": `WhatsAppChannel` plus a `DigestingChannel` decorator.

## Design Splitwise: split strategies, balances and a transaction ledger
<!--
id: lld-splitwise
level: senior
tags: lld, splitwise, expense sharing, strategy pattern, ledger, balances, money
minutes: 45
-->

> [!PROMPT]
> Design an expense sharing app. Users add expenses paid by one person and split among others equally, by exact amounts or by percentage. The app shows who owes whom and supports settling up.
>
> **Requirements**
> - Equal, exact and percent splits; validate they add up.
> - Per-user and per-group balances.
> - Optionally simplify debts.

> [!TLDR]
> Model `User`, `Group`, `Expense` (payer, amount, splits) and keep money as integers in minor units. Use a Strategy for splitting (`EqualSplit`, `ExactSplit`, `PercentSplit`) that returns a list of `(user, share)` and validates the total. Do not mutate balances ad hoc: record each expense as immutable ledger entries and derive balances from them (or maintain a balance map updated atomically). Handle rounding explicitly, for example give the leftover cent to the first participants. Debt simplification is a bonus: net each user's balance and match debtors with creditors.

### Entities and splitting

```ts
interface SplitStrategy { split(total: number, participants: Participant[]): Share[] }
class EqualSplit implements SplitStrategy {
  split(total: number, ps: Participant[]) {
    const base = Math.floor(total / ps.length);
    let extra = total - base * ps.length;                 // distribute leftover minor units
    return ps.map(p => ({ user: p.user, amount: base + (extra-- > 0 ? 1 : 0) }));
  }
}
```

Exact and percent strategies reject input that does not sum to the total (or 100%).

### Balances

- Each expense yields: payer is owed `total`, and each participant owes `share`. Net per pair gives "A owes B 40".
- Keep a ledger (append-only) and compute balances on read, or maintain a map under a lock, whichever the interviewer prefers; mention both.

### Simplifying debts

Compute each user's net (paid minus owed), then repeatedly match the largest debtor with the largest creditor. The result has at most `n-1` payments.

### Traps

Floating-point money; splits that do not sum; payer included or excluded inconsistently; mutating history on edit instead of adding a correcting entry; concurrent expense updates racing on balances.

### Extension demo

"Add split by shares (2 parts to one, 1 to another)": a new strategy, nothing else changes.

## Design a meeting scheduler (Google Calendar): interval conflicts, room allocation and RSVP observers
<!--
id: lld-meeting-scheduler
level: senior
tags: lld, meeting scheduler, calendar, intervals, interval tree, observer pattern, rsvp
minutes: 45
-->

> [!PROMPT]
> Design a meeting scheduler. Users create meetings with attendees and a time slot, the system books a conference room, detects conflicts, and attendees can accept or decline.
>
> **Requirements**
> - Find a free room for a time interval; no double booking.
> - Check attendees' availability and suggest free slots.
> - Notify attendees of invites and RSVP changes.

> [!TLDR]
> Model `User`, `Room`, `Meeting` (interval, organizer, attendees, room) and a per-room and per-user `Calendar` that stores non-overlapping intervals. Conflict checks are interval overlap queries: use half-open ranges, a sorted structure and binary search, or an interval tree if volume demands. Booking must be atomic per room (lock or conditional insert). Use Observer to send invites and RSVP updates, and a Strategy for room selection (smallest fitting room, closest floor). Recurring meetings are best modeled as a rule that expands lazily, with exceptions.

### Overlap and storage

Two intervals `[s1, e1)` and `[s2, e2)` overlap iff `s1 < e2 && s2 < e1`. Keep each calendar's bookings sorted by start; to test a new interval, binary search for the neighbors and compare only those two. An interval tree gives `O(log n)` stabbing queries for heavier workloads.

### Booking flow

```ts
schedule(req: MeetingRequest): Meeting {
  const room = this.roomPicker.pick(this.rooms, req.interval, req.attendeeCount);
  return room.calendar.withLock(() => {
    if (!room.calendar.isFree(req.interval)) throw new ConflictError();
    const m = new Meeting(req, room);
    room.calendar.add(m);
    req.attendees.forEach(a => a.calendar.add(m));       // tentative until RSVP
    this.events.publish(new InviteSent(m));
    return m;
  });
}
```

### Patterns

- **Observer:** invite, update, cancel and RSVP events to attendees.
- **Strategy:** room picking, free-slot suggestions (earliest, fewest conflicts).

### Free slot suggestion

Merge all attendees' busy intervals, then take gaps at least as long as the meeting inside working hours.

### Traps

Closed intervals causing back-to-back meetings to "conflict"; time zones; locking several calendars in inconsistent order; storing recurring instances forever instead of a rule.

### Extension demo

"Add recurring weekly meetings": a `RecurrenceRule` that generates occurrences, reusing the same conflict check.

## Design an ATM: State pattern, cash dispensing and Chain of Responsibility
<!--
id: lld-atm
level: senior
tags: lld, atm, state pattern, chain of responsibility, cash dispenser, transactions
minutes: 45
-->

> [!PROMPT]
> Design an ATM that authenticates a card and PIN, lets the user check balance, withdraw and deposit, and dispenses cash in available denominations.
>
> **Requirements**
> - Valid sequence of operations only (no withdraw before PIN).
> - Dispense using available note denominations; handle insufficient cash.
> - Failed attempts lock the card.

> [!TLDR]
> The ATM is a state machine: IDLE, CARD_INSERTED, AUTHENTICATED, TRANSACTION and back, with each state a class that allows only its legal actions (State pattern), so illegal sequences are rejected by construction instead of `if` checks. Cash dispensing is a Chain of Responsibility over denominations (2000, 500, 100): each handler gives as many notes as it can and passes the remainder along. Keep the bank behind an interface (`BankService`) so the ATM never owns account logic, and make withdrawals atomic and idempotent with the bank.

### States

```ts
interface AtmState {
  insertCard(atm: Atm, card: Card): void;
  enterPin(atm: Atm, pin: string): void;
  withdraw(atm: Atm, amount: number): void;
  eject(atm: Atm): void;
}
// IdleState.withdraw throws "insert card first"; AuthenticatedState.withdraw performs it.
```

Transitions happen inside the state objects (`atm.setState(new AuthenticatedState())`).

### Dispensing chain

```ts
abstract class NoteHandler {
  constructor(protected next?: NoteHandler, protected value = 0, protected count = 0) {}
  dispense(amount: number, out: Map<number, number>) {
    const n = Math.min(Math.floor(amount / this.value), this.count);
    if (n > 0) { out.set(this.value, n); this.count -= n; }
    this.next?.dispense(amount - n * this.value, out);
  }
}
```

Check the remainder at the end; if it is not zero, roll back the counts and reject. Greedy works for standard denominations, but say that arbitrary denominations may need dynamic programming.

### Transactions and safety

- Debit the account via the bank first, then dispense; if dispensing fails, reverse the debit.
- Daily limits and PIN attempts live in the bank or a policy object.
- Never log PINs or full card numbers.

### Traps

Giant `if (state == ...)` blocks; mutating cash counts before knowing the withdrawal can complete; no timeout returning to IDLE.

### Extension demo

"Add cardless withdrawal with OTP": a new state and an `Authenticator` strategy.

## Design a vending machine: State pattern, inventory and pluggable payments
<!--
id: lld-vending-machine
level: senior
tags: lld, vending machine, state pattern, inventory, payment adapter, change calculation
minutes: 40
-->

> [!PROMPT]
> Design a vending machine that sells items from slots. Users insert money, select a product, receive the item and change, or cancel for a refund.
>
> **Requirements**
> - Track inventory per slot; reject sold-out items.
> - Accept coins, notes and later cards or UPI.
> - Return correct change or refuse the sale if change cannot be made.

> [!TLDR]
> Use the State pattern for the flow (IDLE, HAS_MONEY, DISPENSING, OUT_OF_SERVICE), where each state defines which actions are valid. Keep `Inventory` (slot to product and quantity) separate from the machine, and treat payments as an interface with adapters (`CashPayment`, `CardPayment`, `UpiPayment`) so adding a method does not change the machine. Change-making is a greedy or DP selection over available coins that must be verified before dispensing. Make the dispense step all-or-nothing, with refund on failure.

### Entities

`VendingMachine`, `Inventory`, `Slot (code, product, quantity)`, `Product (name, price)`, `CoinStock`, `PaymentMethod`.

### Flow and states

- IDLE: `insertMoney` moves to HAS_MONEY.
- HAS_MONEY: `select(code)` validates stock and funds; `cancel` refunds.
- DISPENSING: decrement stock, release item, return change, go to IDLE.
- Any hardware fault goes to OUT_OF_SERVICE with refund.

### Change making

```ts
makeChange(amount: number, stock: Map<number, number>): Map<number, number> | null
```

Try the largest denominations first, respecting stock; if the remainder is not zero return `null` and refuse the sale before taking the product (or ask for exact change). Mention that greedy is correct for canonical coin systems.

### Payment adapters

`PaymentMethod.charge(amount): Promise<Result>` for cards and UPI; cash accumulates a balance. The machine depends only on the interface.

### Traps

Decrementing inventory before payment is confirmed; mixing cash handling with product logic; no handling of simultaneous select and cancel; forgetting restock and refill operations (an admin interface).

### Extension demo

"Add discounts and combo offers": a `PricingStrategy` applied at selection time.

## Design a ride booking service (Uber or Ola): driver matching, pricing and trip state
<!--
id: lld-ride-booking
level: lead
tags: lld, uber, ola, ride booking, geospatial matching, strategy pattern, observer, dynamic pricing
minutes: 55
-->

> [!PROMPT]
> Design the core of a ride-hailing service. Riders request a trip, nearby drivers are matched, the trip progresses through its lifecycle, and the fare is computed, possibly with surge pricing.
>
> **Requirements**
> - Match a rider to a suitable nearby available driver.
> - Trip states from requested to completed or cancelled.
> - Pluggable pricing and matching rules.

> [!TLDR]
> Model `Rider`, `Driver` (location, status), `Trip` (state machine: REQUESTED, ACCEPTED, STARTED, COMPLETED, CANCELLED), `Location` and `Vehicle`. Use a Strategy for matching (nearest driver, highest rated, least idle) backed by a spatial index (grid cells or geohash) so you do not scan all drivers, and a Strategy for pricing (base plus distance plus time times a surge multiplier). Use Observer to push status updates to rider and driver. The key correctness issue is assigning a driver to only one trip: claim the driver atomically, with a timeout and re-match if they decline.

### Entities and trip lifecycle

`Trip` owns its state and enforces legal transitions (State pattern). The `TripService` orchestrates; entities keep their own invariants.

### Matching

```ts
interface MatchingStrategy { pick(rider: Rider, candidates: Driver[]): Driver | null }
class NearestDriver implements MatchingStrategy { /* min distance */ }
```

- Candidates come from a spatial index: find drivers in the rider's cell and neighbors, filter by `AVAILABLE` and vehicle type.
- Offer to the best candidate with a timeout; if declined or timed out, offer to the next.
- Claim with compare-and-set on `driver.status` from AVAILABLE to OFFERED, so two riders never get the same driver.

### Pricing

`FareStrategy.fare(distance, duration, surge)`; surge from demand and supply per cell, injected as a `SurgeProvider`. Keep money in minor units, and snapshot the quoted fare on the trip.

### Observers

Trip events (accepted, arrived, started, completed) published to rider and driver apps and to billing.

### Traps

Scanning every driver per request; matching one driver to two riders; computing the fare from live surge at completion instead of the quoted value; modeling cancellation fees without state awareness.

### Extension demo

"Add ride pooling or scheduled rides": a new matching strategy and trip type, existing trip states reused.

## Design an e-commerce platform (Amazon): cart, checkout, payment gateways and order lifecycle
<!--
id: lld-ecommerce-platform
level: lead
tags: lld, e-commerce, amazon, cart, payment gateway, strategy pattern, inventory, order state
minutes: 55
-->

> [!PROMPT]
> Design the low-level model of an online store. Users browse products, manage a cart, check out with a chosen payment method and track the order. Inventory must stay correct under concurrent purchases.
>
> **Requirements**
> - Cart add, update and remove; price and stock validation at checkout.
> - Multiple payment methods and gateways.
> - Orders move through a lifecycle; coupons and offers may apply.

> [!TLDR]
> Model `Product`, `Cart` (line items), `Order` (immutable snapshot of items and prices), `Payment`, `Inventory` and `User`. Checkout is a workflow: validate cart, reserve stock atomically, price with discounts, charge via a `PaymentGateway` (Adapter per provider, Strategy to choose), then confirm or compensate. Treat the order as a state machine (CREATED, PAID, SHIPPED, DELIVERED, CANCELLED, REFUNDED). Reserve inventory with a conditional decrement so two buyers cannot take the last unit, and make payment and order creation idempotent. Pricing rules (coupons, tiered discounts) are Strategies or composable rules.

### Entities

- `Cart` belongs to a user; line items hold product id and quantity, not a price (price is read at checkout).
- `Order` copies price and product details at purchase time so later catalog changes do not rewrite history.
- `Inventory.reserve(sku, qty)` and `release`.

### Checkout workflow

```ts
async checkout(userId: string, method: PaymentMethodId): Promise<Order> {
  const cart = this.carts.get(userId);
  const reservation = this.inventory.reserveAll(cart.items);        // atomic, all or nothing
  try {
    const total = this.pricing.price(cart, this.coupons.for(userId));
    const pay = await this.gateways.for(method).charge(userId, total, idempotencyKey);
    return this.orders.create(cart, total, pay);
  } catch (e) {
    this.inventory.release(reservation);                             // compensate
    throw e;
  }
}
```

### Patterns

- **Adapter and Strategy:** each gateway behind `PaymentGateway`; the method picks the implementation.
- **State:** order lifecycle with valid transitions and side effects (refund on cancel after payment).
- **Strategy or rules list:** discounts and coupons applied in a defined order.
- **Observer:** order events to email, warehouse and analytics.

### Concurrency and consistency

Use a conditional decrement (`stock >= qty`) or per-SKU lock; reservations expire so abandoned carts free stock; never hold locks during the payment call; make the charge idempotent with a key.

### Traps

Reading prices from the live product at display time of an old order; double charging on retry; oversell; stuffing everything into one `Store` class.

### Extension demo

"Add wallet payments and buy-one-get-one": a new gateway adapter and a pricing rule, no change to checkout.

## Design a logging library: levels, appenders, formatters and thread-safe delivery
<!--
id: lld-logger-library
level: junior
tags: lld, logger, observer, strategy, chain of responsibility, singleton, appenders, fundamentals
minutes: 30
-->

> [!PROMPT]
> Design a logging library. Applications log messages at levels (DEBUG, INFO, WARN, ERROR) that are filtered by a minimum level and sent to one or more destinations (console, file). Formatting must be configurable.
>
> **Requirements**
> - Add new destinations without changing the logger.
> - Safe when many threads or tasks log at once.
> - Easy to test.

> [!TLDR]
> Model `LogLevel` (ordered), `LogRecord` (level, message, time, context), a `Logger` that filters by level and fans out to `Appender`s, an `Appender` interface (`ConsoleAppender`, `FileAppender`) each with a `Formatter` (Strategy for output format), and a `LoggerFactory` or registry keyed by name. The fan-out is Observer-like; level filtering can be a Chain of Responsibility if you need per-appender thresholds. Make appenders thread-safe (a lock or a single-writer queue), keep the clock and sink injectable for tests, and avoid a global mutable Singleton: expose a default instance but allow injection.

### Core types

```ts
enum Level { DEBUG, INFO, WARN, ERROR }
interface Formatter { format(r: LogRecord): string }
interface Appender { append(r: LogRecord): void }

class Logger {
  constructor(private level: Level, private appenders: Appender[], private clock: () => number = Date.now) {}
  log(level: Level, message: string, context?: object) {
    if (level < this.level) return;
    const record = { level, message, context, time: this.clock() };
    for (const a of this.appenders) a.append(record);
  }
  info(m: string, c?: object) { this.log(Level.INFO, m, c); }
}

class ConsoleAppender implements Appender {
  constructor(private f: Formatter) {}
  append(r: LogRecord) { console.log(this.f.format(r)); }
}
```

### Design notes

- **Extensibility:** a `JsonFormatter` or `HttpAppender` is a new class, not a logger edit.
- **Per-appender level:** wrap with `FilteringAppender(level, inner)` (Decorator).
- **Performance:** async appenders with a bounded queue; drop or block policy when full; flush on shutdown.
- **Concurrency:** file appenders serialize writes (lock or a single consumer thread).

### Traps

Formatting strings even when the level is disabled (check the level first or accept a lazy message function); a global singleton that makes tests share state; swallowing appender errors without a fallback.

## Design a rate limiter: fixed window, sliding window, token bucket and a pluggable strategy
<!--
id: lld-rate-limiter
level: senior
tags: lld, rate limiter, token bucket, sliding window, strategy pattern, concurrency, clock
minutes: 40
-->

> [!PROMPT]
> Design an in-process rate limiter class `allow(key)` that limits each user or API key to N requests per time window, with different algorithms available and safe under concurrency.
>
> **Requirements**
> - Per-key limits; configurable rule per route or plan.
> - Support token bucket and sliding window algorithms.
> - Deterministic tests.

> [!TLDR]
> Define a `RateLimiter` interface with `allow(key): Decision` and implement algorithms as strategies: a fixed window counter (simple, but allows bursts at window edges), a sliding window log or counter (accurate, more memory), and a token bucket (allows controlled bursts, refilling at a constant rate). Store per-key state in a map with expiry, make the check-and-update atomic per key (lock per key or atomic operations), inject the clock for tests, and return remaining quota and retry-after for clients. For multiple servers move state to a shared store such as Redis with atomic scripts.

### Token bucket implementation

```ts
class TokenBucket implements RateLimiter {
  private buckets = new Map<string, { tokens: number; last: number }>();
  constructor(private capacity: number, private refillPerSec: number, private now: () => number = Date.now) {}

  allow(key: string) {
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.capacity, last: t };
    b.tokens = Math.min(this.capacity, b.tokens + ((t - b.last) / 1000) * this.refillPerSec);
    b.last = t;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.buckets.set(key, b);
    return { allowed: ok, retryAfterMs: ok ? 0 : Math.ceil(((1 - b.tokens) / this.refillPerSec) * 1000) };
  }
}
```

### Comparing algorithms

| Algorithm | Pros | Cons |
| --- | --- | --- |
| Fixed window | Simplest, cheap | Burst of 2N across a boundary |
| Sliding window log | Exact | Memory per request |
| Sliding window counter | Good approximation, small | Slightly approximate |
| Token bucket | Allows bursts, smooth refill | Needs tuning of capacity and rate |

### Concurrency and scale

- Update state under a per-key lock (or compare-and-set); read-modify-write races let extra requests through.
- Evict idle keys (TTL or periodic sweep) to bound memory.
- Distributed: Redis `INCR` with expiry, or a Lua script for token bucket so the check and update are atomic.

### Traps

Using wall-clock time that can jump backwards (prefer a monotonic clock); not returning `Retry-After`; keys that include unbounded user input.

## Design an elevator system: request scheduling, state machine and extensible dispatch strategies
<!--
id: lld-elevator-system
level: lead
tags: lld, elevator, state machine, scheduling, strategy pattern, observer, concurrency
minutes: 50
-->

> [!PROMPT]
> Design an elevator control system for a building with multiple elevators. Passengers press up or down buttons on floors and destination buttons inside the cab. The system decides which elevator serves which request.
>
> **Requirements**
> - Multiple elevators; each moves up, down or idle with doors opening and closing.
> - Dispatch strategy should be swappable (nearest car, least loaded).
> - Handle overload and out-of-service cars.

> [!TLDR]
> Model `Elevator` (current floor, direction, state, a sorted set of stops), `Request` (floor, direction), `ElevatorController` (receives requests and assigns them) and `Floor` panels. Each elevator is a state machine (IDLE, MOVING_UP, MOVING_DOWN, DOORS_OPEN, OUT_OF_SERVICE). A `DispatchStrategy` decides assignment (nearest car moving the right way, else the closest idle, else least loaded). Each elevator serves stops in its direction before reversing (the SCAN or "elevator algorithm"). Requests and ticks are processed through a single-threaded scheduler per elevator or guarded by locks to avoid races, and observers update displays.

### Core structure

```ts
interface DispatchStrategy { pick(elevators: Elevator[], req: Request): Elevator }

class Elevator {
  state: 'IDLE' | 'UP' | 'DOWN' | 'DOORS_OPEN' | 'OUT_OF_SERVICE' = 'IDLE';
  private stops = new Set<number>();
  constructor(public id: number, public floor = 0) {}
  addStop(f: number) { this.stops.add(f); }
  step() { /* move one floor toward the next stop in the current direction; open doors on arrival */ }
}

class Controller {
  constructor(private elevators: Elevator[], private strategy: DispatchStrategy) {}
  request(r: Request) { this.strategy.pick(this.elevators.filter(e => e.state !== 'OUT_OF_SERVICE'), r).addStop(r.floor); }
}
```

### Scheduling details

- Keep going in the current direction while there are stops ahead; reverse only when none remain.
- Cost for nearest-car: distance, plus a penalty if moving away or if the car is full.
- Inside-cab destinations are stops for that car only.

### Edge cases and extensions

- Overload sensor: skip new pickups until weight drops.
- Fire mode or maintenance: clear stops and go to a target floor.
- Peak traffic patterns (lobby bias in the morning) as another strategy.
- Concurrency: requests arrive anytime; serialize mutations per elevator or use a thread-safe queue.

### Traps

Simulating time with sleeps instead of an injectable tick; one giant `if` on direction and state (use State objects); assigning one request to several cars.
