---
id: nodejs-backend
title: Node.js Backend
description: Node.js for backend interviews: the event loop and its phases, streams and backpressure, scaling and graceful shutdown, building a production API and diagnosing memory and CPU problems.
facets: backend, nodejs
---

## The Node.js event loop: phases, `process.nextTick`, `setImmediate` and what blocks it
<!--
id: node-event-loop-phases
level: junior
tags: nodejs, event loop, nexttick, setimmediate, microtasks, libuv, blocking
minutes: 12
-->

> [!PROMPT]
> Explain how the Node.js event loop works. In what order does this print, and what happens to your server if a request handler runs a 2-second synchronous loop?
>
> ```js
> setTimeout(() => console.log('timeout'), 0);
> setImmediate(() => console.log('immediate'));
> process.nextTick(() => console.log('nextTick'));
> Promise.resolve().then(() => console.log('promise'));
> console.log('sync');
> ```

> [!TLDR]
> Node runs your JavaScript on one thread; libuv's event loop dispatches callbacks in phases (timers, pending callbacks, poll for I/O, check for `setImmediate`, close callbacks) while the operating system and a small thread pool do the actual I/O. Between callbacks, Node drains the `process.nextTick` queue and then promise microtasks. The snippet prints `sync`, `nextTick`, `promise`, then `timeout` and `immediate` (their relative order from the main module is not guaranteed; inside an I/O callback `immediate` always comes first). A 2-second synchronous loop blocks the single thread, so every other request waits: keep handlers non-blocking and move CPU-heavy work to worker threads or another service.

### Order

1. Synchronous code: `sync`.
2. `process.nextTick` queue: `nextTick`.
3. Promise microtasks: `promise`.
4. Event loop phases: `timeout` (timers phase, once the 0 to 1 ms threshold passes) and `immediate` (check phase).

Overusing `nextTick` recursively can starve I/O because that queue is drained fully before the loop continues.

### What blocks

```js
app.get('/report', (req, res) => {
  const end = Date.now() + 2000;
  while (Date.now() < end) {}            // blocks every other request for 2 seconds
  res.send('done');
});
```

Other blockers: huge `JSON.parse`/`JSON.stringify`, synchronous `fs` calls (`readFileSync`) after startup, regexes with catastrophic backtracking, and heavy crypto or compression on the main thread.

### Fixes

- Use async APIs (`fs.promises`, streams).
- Offload CPU work: `worker_threads`, a job queue with separate workers, or a native module that runs off-thread.
- Measure event loop lag (`perf_hooks.monitorEventLoopDelay`) and alert on it.

### Follow-up

"Is Node single-threaded?" Your JavaScript is; the runtime also uses a libuv thread pool (default 4 threads) for file system, DNS lookups, some crypto and compression, plus OS-level async networking.

## Streams and backpressure in Node: process large data without loading it into memory
<!--
id: node-streams-backpressure
level: senior
tags: nodejs, streams, backpressure, pipeline, memory, files, http
minutes: 16
-->

> [!PROMPT]
> An endpoint reads a 2 GB CSV from disk, transforms each row and streams the result to the client, but memory climbs and slow clients cause the process to be killed. Explain streams and backpressure and rewrite the endpoint correctly.

> [!TLDR]
> Streams process data in chunks instead of buffering a whole file. Backpressure is the signal that a consumer cannot keep up: `write()` returns `false` when the internal buffer is full and the producer should pause until `'drain'`. Piping handles this for you, but manual `on('data')` loops that ignore the return value of `write` buffer unbounded data in memory. Use `stream.pipeline` (or `stream/promises.pipeline`) to connect sources, transforms and destinations: it propagates backpressure, forwards errors and destroys all streams on failure or client disconnect, avoiding leaks.

### The correct endpoint

```js
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

app.get('/export', async (req, res) => {
  const upper = new Transform({
    transform(chunk, _enc, cb) { cb(null, chunk.toString().toUpperCase()); },
  });
  res.setHeader('content-type', 'text/csv');
  try {
    await pipeline(createReadStream('big.csv'), upper, res);   // backpressure and cleanup handled
  } catch (err) {
    if (!res.headersSent) res.status(500).end('export failed');
  }
});
```

Real CSV parsing needs a streaming parser that handles rows split across chunks (do not assume a chunk ends on a line boundary).

### Backpressure by hand

```js
for await (const chunk of source) {
  if (!dest.write(chunk)) await once(dest, 'drain');   // pause until the buffer empties
}
```

`for await` over a readable respects backpressure automatically on the read side.

### Details

- `highWaterMark` sets the buffer threshold (bytes, or objects in object mode).
- Object mode streams carry JavaScript values; counts, not bytes, are buffered.
- Web streams (`ReadableStream`) are also available; Node provides adapters (`Readable.fromWeb`).
- Use `AbortSignal` with `pipeline` to cancel on client disconnect.

### Pitfalls

`pipe()` without error handling (errors do not propagate and streams may leak); reading the whole file with `readFile` for large inputs; transforms that do async work without calling the callback exactly once.

## Scale a Node service: cluster, worker threads, containers and graceful shutdown
<!--
id: node-scaling-graceful-shutdown
level: senior
tags: nodejs, scaling, cluster, worker threads, graceful shutdown, kubernetes, sigterm, health checks
minutes: 16
-->

> [!PROMPT]
> Your Node API is CPU-bound at 100% of one core on an 8-core machine, and deploys cause a burst of failed requests. How do you use more cores, offload heavy work, and shut down without dropping requests?

> [!TLDR]
> One Node process uses one core for JavaScript. Scale horizontally: run one process per core (the `cluster` module, a process manager, or simply multiple containers or pods behind a load balancer, which is the usual approach). For CPU-heavy tasks use `worker_threads` or a separate queue-fed worker service so request handling stays responsive. For clean deploys implement graceful shutdown: on `SIGTERM`, stop accepting new connections, fail the readiness probe, let in-flight requests finish within a deadline, close database pools and exit. Add liveness and readiness endpoints and keep processes stateless so any instance can serve any request.

### Using more cores

| Option | Use when |
| --- | --- |
| Multiple containers or pods | Default in orchestrated environments; scale by replica count |
| `cluster` or a process manager (PM2) | A single VM or host without an orchestrator |
| `worker_threads` | CPU-bound tasks inside a request (image resize, hashing, parsing) |
| Queue plus worker service | Long jobs; decouples from request latency |

```js
import { Worker } from 'node:worker_threads';
const run = (data) => new Promise((resolve, reject) => {
  const w = new Worker(new URL('./resize.js', import.meta.url), { workerData: data });
  w.once('message', resolve); w.once('error', reject);
});
```

In production use a worker pool (for example `piscina`) rather than starting a worker per request.

### Graceful shutdown

```js
const server = app.listen(3000);
let shuttingDown = false;

app.get('/ready', (_req, res) => res.status(shuttingDown ? 503 : 200).end());

process.on('SIGTERM', () => {
  shuttingDown = true;                          // readiness fails, load balancer stops routing here
  server.close(async () => {                    // stops new connections, waits for in-flight ones
    await db.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 25_000).unref();   // hard deadline before the platform kills us
});
```

### Operational basics

- Keep HTTP keep-alive timeouts coherent with the load balancer's.
- Do not store sessions or caches in process memory if you run several instances; use Redis or a database.
- Handle `unhandledRejection` and `uncaughtException` by logging and exiting so the supervisor restarts a clean process.

### Pitfalls

Killing pods with in-flight requests (no `SIGTERM` handler); too many workers per container competing for the same cores; assuming `cluster` shares memory (it does not).

## Build a production-ready REST API in Node: validation, errors, auth, idempotency and rate limits
<!--
id: node-production-rest-api
level: lead
tags: nodejs, rest api, validation, error handling, authentication, idempotency, rate limiting, observability, fastify, express
minutes: 22
-->

> [!PROMPT]
> You are asked to take a prototype Express API to production. What changes do you make in code and configuration? Cover input validation, error handling, authentication and authorization, idempotency for payments, rate limiting, observability and testing.

> [!TLDR]
> Treat every request as untrusted: validate and parse input at the edge with a schema library (zod, Ajv or Fastify's built-in schemas), centralize error handling so clients get consistent error shapes and secrets and stack traces never leak, authenticate with short-lived tokens or sessions and authorize per resource on the server, make unsafe operations idempotent with an `Idempotency-Key`, rate limit by user and IP, set timeouts everywhere, and add structured logs with request ids, metrics and health checks. Keep handlers thin (parse, call a service, shape the response) so the business logic is testable without HTTP.

### Edge: validation and errors

```ts
const CreateOrder = z.object({ items: z.array(z.object({ sku: z.string(), qty: z.number().int().positive() })).min(1) });

app.post('/orders', async (req, res) => {
  const input = CreateOrder.parse(req.body);                 // throws ZodError -> 400 via the error handler
  const order = await orders.create(req.user.id, input);
  res.status(201).json(order);
});

app.use((err, req, res, _next) => {
  if (err instanceof ZodError) return res.status(400).json({ error: 'invalid_request', details: err.issues });
  req.log.error({ err }, 'unhandled');                        // full detail in logs
  res.status(500).json({ error: 'internal', requestId: req.id });   // minimal detail to clients
});
```

Express 5 forwards rejected promises from async handlers to the error handler; with Express 4 wrap handlers.

### Security

- Authentication: verify tokens (signature, expiry, audience); prefer short-lived access tokens; never trust client-supplied user ids.
- Authorization: check ownership on every resource access (`WHERE id = $1 AND user_id = $2`).
- `helmet` headers, strict CORS allowlists, body size limits, parameterized queries.
- Secrets from the environment or a secret manager.

### Reliability

- **Idempotency:** store the key with the result for `POST /payments`; a retry returns the saved response rather than charging twice.
- **Timeouts and retries:** set timeouts on outbound HTTP and the database; retry only idempotent calls with backoff.
- **Rate limiting:** per user and per IP, with a shared store (Redis) when running multiple instances.
- **Pagination:** cursor-based, with a maximum page size.

### Observability and tests

Structured JSON logs with a request id, metrics (latency histograms, error rate, event loop lag), tracing (OpenTelemetry), readiness and liveness endpoints. Test the service layer directly, plus a few HTTP-level tests (supertest) for validation, auth and error shapes.

### Pitfalls

Returning raw error messages or stack traces; validating only on the client; trusting `req.body` types; one global database connection without a pool or timeouts.

## Diagnose a Node memory leak or CPU spike: heap snapshots, profiling and common causes
<!--
id: node-memory-leaks-profiling
level: senior
tags: nodejs, memory leak, profiling, heap snapshot, cpu profile, v8, performance, debugging
minutes: 16
-->

> [!PROMPT]
> A Node service's memory climbs steadily until the container is OOM-killed every few hours, and another endpoint pegs the CPU. Walk through how you find the cause of each in production without guessing.

> [!TLDR]
> For memory, confirm a leak by watching `process.memoryUsage().heapUsed` (and RSS) after garbage collection over time, then compare heap snapshots taken minutes apart in Chrome DevTools to see which object types grow and what retains them. Typical causes: unbounded caches or maps keyed by user or request, event listeners added per request and never removed, timers and closures holding large objects, and global arrays used as queues. For CPU, record a CPU profile (`--cpu-prof`, `node --inspect`, or a tool like `clinic.js`/`0x`) and read the flame graph for hot functions, which are often JSON work, regexes, synchronous crypto or an accidental O(n²) loop. Fix, then verify with a load test and a flat memory curve.

### Memory workflow

1. **Observe:** export metrics for heap used, RSS and GC time; a sawtooth that returns to a stable baseline is healthy, a rising baseline is a leak.
2. **Capture:** `node --inspect` or `--heapsnapshot-signal=SIGUSR2` (write a snapshot on a signal), taking one snapshot, applying load, then another.
3. **Compare:** in DevTools use the "Comparison" view and sort by size delta; look at retainers to find the owning structure.
4. **Fix:** bound the structure (LRU with a max size and TTL), remove listeners (`emitter.off`, `{ once: true }`, `AbortSignal`), clear timers, avoid capturing big objects in closures.
5. **Prevent:** a soak test in CI or staging and an alert on the heap baseline.

```js
// Common leak: a listener per request on a long-lived emitter
bus.on('update', handler);        // never removed -> handler and everything it closes over stays alive
// Fix
bus.once('update', handler);      // or remove it in a finally block
```

### CPU workflow

- `node --cpu-prof app.js` writes a `.cpuprofile` you can open in DevTools, or use `clinic flame`.
- Look at "self time" for hot functions, then check what feeds them (large payloads, repeated parsing).
- Typical fixes: cache computed results, stream instead of `JSON.stringify` on huge objects, replace a backtracking regex, move work to a worker thread, add pagination.

### Also check

Native memory (buffers outside the V8 heap show up in RSS but not heap used), `--max-old-space-size` set consistently with the container limit, and connection pools or sockets that are never closed.

### Pitfalls

Restarting on a schedule and calling it solved; profiling a debug build or an idle process; taking a single snapshot (you need a comparison).
