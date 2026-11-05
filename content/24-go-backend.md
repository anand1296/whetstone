---
id: go-backend
title: Go Backend
description: Go for backend interviews: slices and maps, goroutines and channels, context and cancellation, interfaces and errors, and synchronization with the race detector.
facets: backend, go
---

## Slices, arrays and maps in Go: length versus capacity, aliasing and the nil traps
<!--
id: go-slices-maps-basics
level: junior
tags: go, slices, maps, arrays, capacity, append, aliasing, nil, fundamentals
minutes: 12
-->

> [!PROMPT]
> What does this print, and why? Then explain slices versus arrays, `len` versus `cap`, and what happens when you write to a nil map.
>
> ```go
> a := []int{1, 2, 3}
> b := a[:2]
> b = append(b, 99)
> fmt.Println(a, b)
>
> c := make([]int, 0, 2)
> c = append(c, 1, 2, 3)
> ```

> [!TLDR]
> A slice is a small header (pointer, length, capacity) over an underlying array, so slices created from each other can share memory. `b := a[:2]` has capacity 3, so `append(b, 99)` writes into `a`'s array and prints `[1 2 99] [1 2 99]`. When an append exceeds capacity, Go allocates a bigger array and copies, after which the slices no longer share. Arrays have a fixed length that is part of the type and are copied by value. Reading from a nil map is fine, but writing to one panics, so create maps with `make` or a literal. Copy slices explicitly with `copy` or `slices.Clone` when you do not want aliasing.

### The example

```go
a := []int{1, 2, 3}    // len 3, cap 3
b := a[:2]             // len 2, cap 3, same array
b = append(b, 99)      // fits in capacity: overwrites a[2]
fmt.Println(a, b)      // [1 2 99] [1 2 99]

c := make([]int, 0, 2)
c = append(c, 1, 2, 3) // exceeds cap: new array allocated, c now has len 3, cap 4 (growth is an implementation detail)
```

Use the full slice expression to limit capacity and avoid accidental overwrites: `b := a[:2:2]`.

### Rules of thumb

- Always use the return value of `append`.
- A nil slice and an empty slice both have length 0 and work with `append`/`range`; they differ for `== nil` checks and JSON (`null` versus `[]`).
- Preallocate when you know the size: `make([]T, 0, n)`.
- Slicing keeps the whole array alive: copy a small piece out of a large buffer to let the rest be collected.

### Maps

```go
var m map[string]int        // nil
_ = m["x"]                  // OK, zero value
m["x"] = 1                  // panic: assignment to entry in nil map
m = make(map[string]int)    // fix
v, ok := m["x"]             // comma-ok to tell absent from zero
```

Map iteration order is random, and maps are not safe for concurrent writes (use a mutex or `sync.Map`). Keys must be comparable (slices cannot be keys).

### Follow-up

"Arrays versus slices?" `[3]int` and `[4]int` are different types and assignments copy; slices are references to arrays and are what you pass around.

## Goroutines, channels and `select`: patterns, deadlocks and goroutine leaks
<!--
id: go-goroutines-channels-leaks
level: senior
tags: go, goroutines, channels, select, deadlock, goroutine leak, worker pool, concurrency
minutes: 18
-->

> [!PROMPT]
> Implement a worker pool that processes jobs from a channel with N workers and collects results. Then explain how goroutine leaks and deadlocks happen with channels and how you prevent them.
>
> **Cover**
> - Buffered versus unbuffered channels, closing, and `range`.
> - `select` with timeouts and cancellation.
> - A leak example and its fix.

> [!TLDR]
> Goroutines are cheap concurrent functions; channels pass values between them and synchronize. An unbuffered send blocks until a receiver is ready; a buffered channel blocks only when full. The sender closes a channel to signal "no more values" and receivers `range` over it; receiving from a closed channel returns the zero value immediately, and sending on or closing a closed channel panics. Deadlocks happen when every goroutine is blocked, and leaks when a goroutine blocks forever on a channel nobody will use. Prevent both by giving every goroutine a way to exit (a `context` or `done` channel in `select`), closing channels from the single owner of sending, and waiting with a `sync.WaitGroup`.

### Worker pool

```go
func process(jobs []int, workers int) []int {
    in := make(chan int)
    out := make(chan int)

    var wg sync.WaitGroup
    for i := 0; i < workers; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for j := range in {       // exits when in is closed
                out <- j * j
            }
        }()
    }

    go func() {                       // producer owns closing `in`
        for _, j := range jobs { in <- j }
        close(in)
    }()
    go func() { wg.Wait(); close(out) }()   // close out after all workers finish

    var results []int
    for r := range out { results = append(results, r) }
    return results
}
```

### A leak and the fix

```go
// Leak: if the caller times out and stops reading, the goroutine blocks on send forever.
func fetch() <-chan string {
    ch := make(chan string)
    go func() { ch <- slowCall() }()
    return ch
}

// Fix: buffer of 1, or select on ctx.Done().
func fetch(ctx context.Context) <-chan string {
    ch := make(chan string, 1)
    go func() {
        select {
        case ch <- slowCall():
        case <-ctx.Done():
        }
    }()
    return ch
}
```

### `select` patterns

```go
select {
case v := <-ch:       use(v)
case <-time.After(2 * time.Second): return errTimeout
case <-ctx.Done():    return ctx.Err()
}
```

Prefer a `time.Timer` you can stop in hot loops, because `time.After` allocates a timer per call.

### Pitfalls

Capturing the loop variable in older Go versions (fixed per-iteration since Go 1.22, but know the history); starting goroutines with no ownership or shutdown; using channels where a mutex is simpler (shared state protected by a lock is often clearer than channel choreography).

## `context` in Go: cancellation, deadlines, propagation and `errgroup`
<!--
id: go-context-cancellation-errgroup
level: senior
tags: go, context, cancellation, deadline, timeout, errgroup, http, propagation
minutes: 16
-->

> [!PROMPT]
> An HTTP handler calls three downstream services in parallel and a database. When the client disconnects or one call fails, the others keep running and the DB query continues. How do you use `context` and `errgroup` to propagate cancellation and timeouts correctly?

> [!TLDR]
> A `context.Context` carries cancellation, a deadline and request-scoped values across API boundaries and goroutines. Pass it as the first parameter (`ctx context.Context`) to every function that does I/O, derive children with `context.WithTimeout` or `WithCancel` (always `defer cancel()`), and make blocking code observe `ctx.Done()`. In an HTTP handler start from `r.Context()`, which is cancelled when the client disconnects. Use `errgroup.WithContext` to run parallel calls: the first error cancels the shared context so siblings stop, and `Wait` returns that error. Use context values only for request-scoped metadata (trace ids), not for optional parameters.

### Example

```go
func (s *Server) handle(w http.ResponseWriter, r *http.Request) {
    ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
    defer cancel()

    var user User
    var orders []Order
    g, ctx := errgroup.WithContext(ctx)
    g.SetLimit(4)                                   // bound concurrency

    g.Go(func() (err error) { user, err = s.users.Get(ctx, id); return })
    g.Go(func() (err error) { orders, err = s.orders.List(ctx, id); return })

    if err := g.Wait(); err != nil {
        http.Error(w, "upstream failed", http.StatusBadGateway)
        return
    }
    json.NewEncoder(w).Encode(Page{user, orders})
}

func (s *Store) Get(ctx context.Context, id string) (User, error) {
    row := s.db.QueryRowContext(ctx, `SELECT ... WHERE id = $1`, id)   // DB honors cancellation
    ...
}
```

### Rules

- Never store a context in a struct field for later use; pass it per call.
- Always call `cancel` to release resources, even on success (`defer`).
- Distinguish `context.Canceled` and `context.DeadlineExceeded` with `errors.Is`.
- Use `context.WithoutCancel` (Go 1.21) or a fresh context for work that must outlive the request, such as audit writes.
- Goroutines you start must stop when `ctx.Done()` fires.

### Pitfalls

Using `context.Background()` deep in a call chain (cancellation never arrives); forgetting to pass ctx to the database or HTTP client (`http.NewRequestWithContext`); results written from several goroutines into the same variable without separate fields or synchronization.

## Interfaces and errors in Go: implicit interfaces, the nil-interface gotcha, wrapping and `errors.Is/As`
<!--
id: go-interfaces-errors
level: senior
tags: go, interfaces, errors, error wrapping, errors.is, errors.as, nil interface, design
minutes: 16
-->

> [!PROMPT]
> Why does this function return a non-nil error, and how do you design and handle errors in a Go service? Cover implicit interfaces, wrapping with `%w`, sentinel and typed errors, and where interfaces should be defined.
>
> ```go
> type MyErr struct{}
> func (*MyErr) Error() string { return "boom" }
>
> func do() error {
>     var e *MyErr = nil
>     return e
> }
> // do() != nil is true
> ```

> [!TLDR]
> An interface value holds a (type, value) pair and is nil only when both are nil; returning a nil `*MyErr` as `error` yields a non-nil interface with a nil pointer inside, so `err != nil` is true. Return a literal `nil` for success. Interfaces are satisfied implicitly, so define small interfaces where they are consumed ("accept interfaces, return structs"). Wrap errors with context using `fmt.Errorf("load user %d: %w", id, err)`, test with `errors.Is` (sentinel values like `sql.ErrNoRows`) and `errors.As` (typed errors), and handle each error once: either log it or return it, not both.

### The nil interface gotcha

```go
func do() error {
    var e *MyErr
    if somethingWrong { e = &MyErr{} }
    return e              // bug: non-nil interface even when e is nil
}

func do() error {
    if somethingWrong { return &MyErr{} }
    return nil            // correct
}
```

### Interfaces

```go
// Defined by the consumer, as small as needed
type UserStore interface { Get(ctx context.Context, id string) (User, error) }

type Service struct{ users UserStore }   // test with a tiny fake
func NewService(u UserStore) *Service { return &Service{users: u} }
```

Avoid large "mirror" interfaces next to the implementation; they make mocking painful and add no value.

### Error handling

```go
var ErrNotFound = errors.New("not found")

type ValidationError struct{ Field, Reason string }
func (e ValidationError) Error() string { return e.Field + ": " + e.Reason }

func (s *Service) Load(ctx context.Context, id string) (User, error) {
    u, err := s.users.Get(ctx, id)
    if err != nil {
        return User{}, fmt.Errorf("load user %q: %w", id, err)   // add context, keep the chain
    }
    return u, nil
}

// Caller
if errors.Is(err, ErrNotFound) { /* 404 */ }
var ve ValidationError
if errors.As(err, &ve) { /* 400 with ve.Field */ }
```

### Guidelines

- Map errors to HTTP statuses at the edge (handlers), not deep in the stack.
- `errors.Join` (Go 1.20) combines multiple errors.
- Do not use `panic` for ordinary errors; recover only at boundaries (a server middleware) to turn a panic into a 500 and log it.

### Pitfalls

Comparing errors with `==` after wrapping; losing the original error with `%v` instead of `%w`; logging and returning the same error at every layer (duplicate noise).

## Synchronization in Go: data races, `sync.Mutex`, atomics, `sync.Once` and the race detector
<!--
id: go-sync-data-races
level: lead
tags: go, sync, mutex, rwmutex, atomic, data race, race detector, once, singleflight
minutes: 18
-->

> [!PROMPT]
> A Go service has an in-memory cache read by many goroutines and written occasionally. It passes tests but occasionally corrupts data or crashes with "concurrent map writes". How do you find and fix data races, and what are your options for synchronization?
>
> **Cover**
> - Data race versus race condition.
> - Mutex, RWMutex, atomics, `sync.Map`, `sync.Once` and `singleflight`.
> - Using the race detector in CI.

> [!TLDR]
> A data race is two goroutines accessing the same memory concurrently with at least one write and no synchronization; it is undefined behavior and the Go map implementation panics on detected concurrent writes. Find races with `go test -race` (and `go run -race`) in CI. Fix them by protecting shared state with a `sync.Mutex` (or `RWMutex` for read-heavy loads with measurement), using `sync/atomic` for simple counters and flags, confining state to one goroutine and communicating over channels, or making data immutable. `sync.Once` runs initialization once; `singleflight` collapses duplicate concurrent loads (cache stampede). Keep critical sections short and never call unknown code while holding a lock.

### A safe cache

```go
type Cache struct {
    mu sync.RWMutex
    m  map[string]Item
}

func (c *Cache) Get(k string) (Item, bool) {
    c.mu.RLock(); defer c.mu.RUnlock()
    v, ok := c.m[k]
    return v, ok
}

func (c *Cache) Set(k string, v Item) {
    c.mu.Lock(); defer c.mu.Unlock()
    c.m[k] = v
}
```

Avoid copying a struct that contains a mutex (`go vet` warns); use pointer receivers.

### Choosing a tool

| Need | Tool |
| --- | --- |
| Protect a map or compound state | `sync.Mutex` (or `RWMutex` when reads dominate and contention is measured) |
| Counters and flags | `atomic.Int64`, `atomic.Bool` |
| One-time initialization | `sync.Once` / `sync.OnceValue` |
| Collapse duplicate in-flight loads | `golang.org/x/sync/singleflight` |
| Read-mostly map with disjoint keys | `sync.Map` (specialized; a mutex plus map is usually simpler) |
| Hand off ownership | Channels |

### Stampede protection

```go
var group singleflight.Group

func (c *Cache) Load(ctx context.Context, k string) (Item, error) {
    if v, ok := c.Get(k); ok { return v, nil }
    v, err, _ := group.Do(k, func() (any, error) {
        item, err := c.loader(ctx, k)
        if err == nil { c.Set(k, item) }
        return item, err
    })
    if err != nil { return Item{}, err }
    return v.(Item), nil
}
```

### Detecting and preventing races

- Run `go test -race ./...` in CI (it needs enough load in tests to trigger access; write concurrent tests).
- Race detection finds data races, not logic races (check-then-act across two locked sections is still a bug: lock around the whole decision).
- Add `-race` builds in staging soak tests if feasible; it slows execution and increases memory.

### Pitfalls

Locking only writers; holding a mutex across a network call; closing over loop variables in goroutines in old code; using `time.Sleep` to "synchronize"; assuming an `int` increment is atomic.
