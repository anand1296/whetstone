---
id: java-backend
title: Java Backend
description: Java and the JVM for backend interviews: the equals/hashCode contract, memory and garbage collection, concurrency, virtual threads and Spring transactions with JPA.
facets: backend, java
---

## `equals`, `hashCode` and `HashMap`: the contract, immutability and a classic bug
<!--
id: java-equals-hashcode-hashmap
level: junior
tags: java, equals, hashcode, hashmap, immutability, collections, fundamentals
minutes: 10
-->

> [!PROMPT]
> A `Map<Employee, Department>` sometimes cannot find an employee that was just inserted. `Employee` overrides `equals` but not `hashCode`, and has a mutable `name` used in both. Explain what goes wrong, state the contract, and fix the class.

> [!TLDR]
> If two objects are `equals`, they must return the same `hashCode`; hash-based collections use `hashCode` to pick a bucket and only then `equals` to confirm a match. Overriding `equals` without `hashCode` sends equal objects to different buckets, so lookups miss. Using mutable fields in the hash also breaks lookups: change the field after insertion and the key sits in the wrong bucket. Make key classes immutable (or hash only immutable fields such as an id), and implement both methods together, or use a `record`, which generates them from its components.

### The contract

- Reflexive, symmetric, transitive and consistent `equals`; `x.equals(null)` is false.
- Equal objects must have equal hash codes (the reverse is not required: collisions are allowed).
- The hash must not change while the object is a key.

### Fix

```java
public final class Employee {
    private final long id;
    private final String name;

    public Employee(long id, String name) { this.id = id; this.name = name; }

    @Override public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Employee e)) return false;
        return id == e.id && name.equals(e.name);
    }
    @Override public int hashCode() { return java.util.Objects.hash(id, name); }
}

// Or simply:
public record Employee(long id, String name) {}
```

### How `HashMap` uses them

`hashCode` selects a bucket; within it `equals` finds the key. Since Java 8, a bucket with many collisions becomes a balanced tree (keys that are `Comparable` help). Default capacity grows (resizes) when the load factor (0.75) is exceeded.

### Follow-ups

"Why are `String` keys safe?" (immutable, cached hash) and "What is the difference between `==` and `equals` for objects?" (reference identity versus logical equality).

## The JVM memory model and garbage collection: heap, stack, generations, and diagnosing leaks and pauses
<!--
id: java-jvm-memory-gc
level: senior
tags: java, jvm, memory, garbage collection, g1, zgc, heap, leaks, profiling
minutes: 18
-->

> [!PROMPT]
> A Java service shows growing heap usage and occasional multi-second pauses. Explain how JVM memory is organized, how garbage collection works, and how you would find a leak and tune the pauses.
>
> **Cover**
> - Heap, stack, metaspace and direct memory.
> - Generational collection and the main collectors.
> - Tools and a diagnosis workflow.

> [!TLDR]
> Objects live on the heap; each thread has a stack of frames with local variables and references. Most collectors are generational: new objects are allocated in a young generation collected often and cheaply, survivors are promoted to the old generation. G1 is the common default (region based, aims at a pause-time goal), ZGC and Shenandoah target very short pauses for large heaps, and Parallel favors throughput. A leak in a GC language means objects stay reachable (static maps, caches without eviction, listeners, thread locals). Diagnose with GC logs, a heap dump analyzed in a tool like Eclipse MAT, and Java Flight Recorder; fix the reachability problem, then tune heap size and collector only if pauses remain.

### Memory areas

| Area | Holds | Failure |
| --- | --- | --- |
| Heap (young and old) | Objects and arrays | `OutOfMemoryError: Java heap space` |
| Thread stacks | Frames, locals | `StackOverflowError` (deep recursion) |
| Metaspace | Class metadata | OOM from class loader leaks |
| Direct (off-heap) buffers | NIO and Netty buffers | `Direct buffer memory` OOM |

### Diagnosis workflow

1. Enable GC logging (`-Xlog:gc*`) and watch the old generation after full collections: if its floor keeps rising, it is a leak; if it is flat but pauses are long, it is tuning.
2. Take a heap dump (`jcmd <pid> GC.heap_dump`, or `-XX:+HeapDumpOnOutOfMemoryError`) and look for the dominator tree: which structure retains most memory and what path holds it from a GC root.
3. Use Java Flight Recorder for allocation hotspots and pause causes.
4. Fix the root cause: bound caches (Caffeine with size and TTL), remove listeners, clear `ThreadLocal`s in pooled threads, close resources.

### Tuning basics

- Set `-Xmx` below the container memory limit (leave room for metaspace, threads and direct memory); containers and heap sizing need consistent settings.
- Prefer defaults and a pause goal (`-XX:MaxGCPauseMillis` with G1); try ZGC for large heaps with tight latency needs.
- Reduce allocation pressure (avoid needless boxing and short-lived large objects) before tuning flags.

### Pitfalls

Treating `System.gc()` as a fix; huge heaps without measuring; confusing high memory usage with a leak (the heap is allowed to fill before collection).

## Java concurrency fundamentals: `synchronized`, `volatile`, happens-before, executors and `CompletableFuture`
<!--
id: java-concurrency-fundamentals
level: senior
tags: java, concurrency, synchronized, volatile, happens before, executor, completablefuture, locks
minutes: 18
-->

> [!PROMPT]
> Explain what `synchronized` and `volatile` guarantee, what "happens-before" means, and how you would run and combine asynchronous tasks safely. Fix this broken counter and this broken flag:
>
> ```java
> class Counter { int n; void inc() { n++; } }
> class Worker { boolean running = true; void run() { while (running) { /* work */ } } void stop() { running = false; } }
> ```

> [!TLDR]
> Without synchronization, threads may see stale values and interleave read-modify-write operations. `synchronized` gives mutual exclusion and visibility (releasing a lock happens-before the next acquisition of it); `volatile` gives visibility and ordering for a single variable but not atomicity of compound actions like `n++`. The Java Memory Model defines happens-before as the rule that makes one thread's writes visible to another. Use `AtomicInteger`/`LongAdder` for counters, a `volatile boolean` (or `AtomicBoolean`) for stop flags, and executors and `CompletableFuture` rather than raw threads. Prefer immutability and confinement over locks, and keep lock scopes small with a consistent lock order to avoid deadlock.

### The fixes

```java
class Counter {
    private final java.util.concurrent.atomic.AtomicInteger n = new java.util.concurrent.atomic.AtomicInteger();
    void inc() { n.incrementAndGet(); }
}

class Worker {
    private volatile boolean running = true;   // visible to the worker thread
    void run() { while (running) { /* work */ } }
    void stop() { running = false; }
}
```

### Tools

| Need | Tool |
| --- | --- |
| Mutual exclusion | `synchronized`, `ReentrantLock` (tryLock, fair, interruptible) |
| Atomic single variables | `AtomicInteger`, `LongAdder` for hot counters |
| Thread-safe collections | `ConcurrentHashMap`, `CopyOnWriteArrayList`, `BlockingQueue` |
| Run tasks | `ExecutorService` with bounded pools; never unbounded thread creation |
| Compose async work | `CompletableFuture.supplyAsync(..., executor).thenCombine(...)` |

### Composition example

```java
var user = CompletableFuture.supplyAsync(() -> loadUser(id), ioPool);
var orders = CompletableFuture.supplyAsync(() -> loadOrders(id), ioPool);
var page = user.thenCombine(orders, Page::new)
               .orTimeout(2, java.util.concurrent.TimeUnit.SECONDS)
               .exceptionally(e -> Page.fallback());
```

Pass your own executor; the common pool is shared and not meant for blocking I/O.

### Pitfalls

Double-checked locking without `volatile`; holding a lock while calling out to unknown code (deadlock risk); `ConcurrentHashMap` compound operations done as check-then-put (use `computeIfAbsent`/`merge`); swallowing `InterruptedException` instead of restoring the interrupt flag.

## Virtual threads (Java 21): what they change, what they do not, and how they compare with reactive code
<!--
id: java-virtual-threads
level: lead
tags: java, virtual threads, project loom, reactive, blocking io, structured concurrency, pinning
minutes: 16
-->

> [!PROMPT]
> Your team runs a Spring service with a large thread pool and considers moving to virtual threads or to a reactive stack (WebFlux). Explain how virtual threads work, when they help, and the traps to check before migrating.

> [!TLDR]
> Virtual threads (final in Java 21) are lightweight threads scheduled by the JVM onto a small pool of carrier (platform) threads; when a virtual thread blocks on I/O it is unmounted, so you can write simple blocking code and still serve very many concurrent requests. They help I/O-bound services (many waiting calls) and remove most of the reason for reactive code, without its complexity. They do not speed up CPU-bound work, do not remove the need to bound downstream resources (database pools, rate limits), and have caveats: pinning inside `synchronized` blocks during blocking calls (improved in later releases, so check your Java version), `ThreadLocal` overuse (millions of threads), and libraries that assume a small, pooled thread count. Do not pool virtual threads; create one per task.

### How they work

A virtual thread has its own stack stored on the heap and is mounted on a carrier thread to run. When it hits a blocking operation that the JDK has been adapted for (sockets, locks in `java.util.concurrent`, sleep), it is unmounted and the carrier runs another virtual thread.

```java
try (var executor = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
    for (var id : ids) executor.submit(() -> callRemote(id));   // one cheap thread per task
}
```

### When to choose what

| Situation | Choice |
| --- | --- |
| Many concurrent blocking I/O calls, existing imperative code | Virtual threads |
| Streaming pipelines with backpressure across async sources | Reactive (still a good fit) |
| CPU-bound parallelism | Fixed pool sized to cores, or parallel streams |

### Migration checklist

1. Check the Java version and the framework's support (Spring Boot has a setting to run request handling on virtual threads).
2. Bound resources explicitly: a semaphore or connection pool limit, because unlimited concurrency can overwhelm the database or an API.
3. Look for pinning (`-Djdk.tracePinnedThreads`) around `synchronized` plus blocking calls; replace with `ReentrantLock` where needed on versions that pin.
4. Review `ThreadLocal` use and large per-thread caches.
5. Load test before and after; compare latency percentiles and CPU, not just throughput.

### Pitfalls

Expecting speedups for CPU-bound code; pooling virtual threads; forgetting that thread-per-request code now makes it easy to open thousands of simultaneous downstream calls.

## Spring Boot essentials: dependency injection, `@Transactional` pitfalls and the JPA N+1 problem
<!--
id: java-spring-transactions-jpa
level: senior
tags: java, spring, spring boot, transactional, jpa, hibernate, n+1, dependency injection, proxies
minutes: 18
-->

> [!PROMPT]
> A Spring service method annotated `@Transactional` calls another `@Transactional(propagation = REQUIRES_NEW)` method in the same class, and a list endpoint issues hundreds of SQL queries. Explain why the annotation seems to be ignored, why the endpoint is slow, and how you fix both.
>
> **Cover**
> - Spring's proxy-based AOP and dependency injection.
> - Propagation, rollback rules and common transaction mistakes.
> - The N+1 query problem and fixes.

> [!TLDR]
> Spring implements `@Transactional` with a proxy around the bean, so a call from one method to another **in the same class** (self-invocation) bypasses the proxy and the annotation is ignored; move the method to another bean or inject the bean (or use programmatic `TransactionTemplate`). By default only unchecked exceptions roll back (`rollbackFor` adds checked ones), and annotations on private or `final` methods may not work. The slow list endpoint is the N+1 problem: one query for the parents plus one per parent for a lazy association. Fix it with fetch joins, `@EntityGraph`, batch fetching, or a projection or DTO query, and verify with SQL logging or a test that counts statements.

### Dependency injection

Prefer constructor injection (immutable, testable) over field injection. Beans are singletons by default, so keep them stateless or thread-safe.

```java
@Service
class OrderService {
    private final OrderRepository orders;
    private final PaymentClient payments;
    OrderService(OrderRepository orders, PaymentClient payments) { this.orders = orders; this.payments = payments; }
}
```

### Transaction pitfalls

- **Self-invocation** bypasses the proxy (as above).
- **Rollback rules:** checked exceptions commit unless you set `rollbackFor`.
- **Scope and I/O:** do not hold a transaction open during slow HTTP calls; it holds a connection and locks.
- **Lazy loading outside the transaction** causes `LazyInitializationException`; return DTOs instead of entities from the service layer, and avoid open-session-in-view as a crutch.
- **Propagation:** `REQUIRES_NEW` suspends the outer transaction and uses another connection (watch pool exhaustion and partial commits).

### N+1 and fixes

```java
// N+1: one query for orders, then one per order for items
List<Order> orders = repo.findAll();
orders.forEach(o -> o.getItems().size());

// Fixes
@Query("select o from Order o join fetch o.items where o.status = :s")
List<Order> findWithItems(@Param("s") Status s);

@EntityGraph(attributePaths = "items")
List<Order> findByStatus(Status s);
```

Beware fetch-joining several collections (cartesian products) and pagination with collection fetch joins (in-memory paging). For read endpoints, a DTO projection selecting only the needed columns is often best.

### Verify

Turn on SQL logging in a test, or use a statement counter (Hibernate statistics, datasource-proxy) and assert the number of queries for an endpoint.
