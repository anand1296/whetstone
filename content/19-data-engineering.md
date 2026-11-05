---
id: data-engineering
title: Data Engineering
description: Batch and streaming pipelines, dimensional modeling, reliable and idempotent jobs, lakehouse table formats, SQL analytics patterns and data quality, at a senior bar.
facets: data
---

## Batch versus streaming: choose an architecture for a pipeline and know the trade-offs
<!--
id: de-batch-vs-streaming
level: senior
tags: data engineering, batch, streaming, lambda, kappa, latency, kafka, architecture
minutes: 20
-->

> [!PROMPT]
> A product team wants near-real-time dashboards and also accurate daily finance reports from the same event data. Design the pipeline. When would you choose batch, streaming or both?
>
> **Cover**
> - Latency, cost, correctness and operational complexity.
> - Event time versus processing time, late data and windows.
> - Lambda versus Kappa style architectures.

> [!TLDR]
> Choose by the freshness the decision needs, not by fashion. Batch is simpler, cheaper and easy to reprocess; streaming gives low latency but adds state, ordering, late-data and operational complexity. Many systems need both: a streaming path for fast approximate or incremental views and a batch path (or replay of the same log) for authoritative numbers. Use event time with watermarks to handle late events, make processing idempotent, and prefer a single code path over a log you can replay (Kappa-style) when your tooling allows, because two codebases drift.

### Decision table

| Need | Lean toward |
| --- | --- |
| Daily or hourly reports, cost-sensitive | Batch |
| Seconds-level alerts, live dashboards | Streaming |
| Both fresh and exact | Streaming for speed, batch/replay for truth |
| Heavy backfills and reprocessing | Batch engine or replayable log |

### The hard parts of streaming

- **Event time versus processing time.** Windows should usually follow when the event happened; devices send late.
- **Watermarks and lateness.** Decide how long to wait; late events either update results, go to a side output, or are dropped by policy.
- **State.** Aggregations need fault-tolerant state and checkpoints.
- **Delivery semantics.** At-least-once with idempotent sinks is the practical default; true exactly-once end to end needs transactional sinks or deduplication keys.
- **Backpressure and ordering.** Partition by key; ordering only holds within a partition.

### Lambda and Kappa

Lambda runs a batch layer and a speed layer and merges them; the cost is two implementations of the same logic. Kappa treats the log as the source of truth and reprocesses by replaying through one streaming job. Modern engines that handle both batch and streaming reduce the gap; the practical aim is one definition of the business logic.

### Example design

Events go to a durable log (Kafka or similar), a streaming job computes rolling aggregates into a serving store for dashboards, and the same events land in object storage as immutable files; a scheduled batch job builds the finance tables from those files with full recomputation. Reconcile the two daily and alert on differences.

### Pitfalls

Using streaming where hourly batch would do; windowing on processing time; non-idempotent sinks that double count after a retry; forgetting how to backfill after a bug.

## Dimensional modeling: star schemas, slowly changing dimensions and when to denormalize
<!--
id: de-dimensional-modeling-scd
level: senior
tags: data engineering, data modeling, star schema, scd, fact table, dimension, warehouse
minutes: 20
-->

> [!PROMPT]
> Model sales data for analysts: orders, customers, products, stores. Customer attributes (like segment or region) change over time and reports must show history correctly. How do you design the warehouse tables?
>
> **Cover**
> - Facts, dimensions and grain.
> - Slowly changing dimension strategies.
> - Trade-offs against normalized and wide denormalized tables.

> [!TLDR]
> Start by declaring the **grain** of the fact table (for example, one row per order line), keep numeric measures and foreign keys in the fact and descriptive attributes in dimensions (a star schema). Use surrogate keys so dimensions can change. For attributes whose history matters, use a Type 2 slowly changing dimension: a new row per change with validity dates and a current flag, and join facts to the version valid at event time. Use Type 1 (overwrite) where history does not matter. Denormalize for query speed and simplicity, but keep the grain explicit and avoid mixing grains in one table.

### Fact and dimension

```sql
fact_order_line(order_line_id, order_date_key, customer_key, product_key, store_key,
                quantity, net_amount, discount_amount)
dim_customer(customer_key, customer_id, name, segment, region,
             valid_from, valid_to, is_current)
```

- Measures are additive (sums), semi-additive (balances, not across time) or non-additive (ratios; store numerator and denominator).
- Conformed dimensions (the same `dim_date` or `dim_customer` across facts) make cross-process analysis possible.

### Slowly changing dimensions

| Type | Behavior | Use when |
| --- | --- | --- |
| 1 | Overwrite | Corrections, history not needed |
| 2 | New row with `valid_from`/`valid_to` | Reports must reflect the attribute as it was |
| 3 | Add a "previous value" column | Only the last change matters |

For Type 2, load by comparing incoming rows with the current dimension row, closing the old row (`valid_to`, `is_current = false`) and inserting a new one. Join facts on the surrogate key assigned at load time, or on business key plus event date inside the validity window.

### Normalized, star or one big table?

- Normalized (3NF) suits transactional systems and integration layers.
- Star schemas suit analytics: fewer joins, clear semantics, good for BI tools.
- A wide denormalized table is fastest for a fixed dashboard but hard to evolve and easy to double count if grains mix.

### Pitfalls

Unstated grain; fact tables mixing order and order-line facts; natural keys as joins when attributes change; counting distinct customers across Type 2 rows without using the business key; late-arriving facts or dimensions with no handling policy (use an "unknown" member and backfill).

## Reliable pipelines: idempotency, backfills, retries and exactly-once claims
<!--
id: de-idempotent-pipelines-backfills
level: lead
tags: data engineering, idempotency, backfill, airflow, orchestration, retries, exactly once, reliability
minutes: 20
-->

> [!PROMPT]
> A daily job fails halfway and is retried, then you discover a bug and need to reprocess 90 days. How do you build pipelines so retries, reruns and backfills are safe?
>
> **Cover**
> - Idempotent writes and deterministic partitions.
> - Orchestration, dependencies and backfill strategy.
> - What "exactly-once" really means.

> [!TLDR]
> Design every task so that running it twice for the same input produces the same output. Make jobs deterministic and parameterized by a logical date, write by replacing a partition or using a merge/upsert on a stable key (never blind appends), stage output and publish atomically, and keep raw inputs immutable so you can recompute. With that, retries are safe and backfills are just parallel runs over past dates. "Exactly-once" is usually at-least-once delivery plus idempotent writes or deduplication; be precise about where each guarantee ends.

### Idempotency patterns

- **Partition overwrite:** `INSERT OVERWRITE` the day's partition so a rerun replaces rather than duplicates.
- **Merge/upsert:** `MERGE` on a primary key with a deterministic source; keep a load timestamp separate from the business timestamp.
- **Write-then-swap:** write to a staging location, validate, then atomically publish (rename, table version commit).
- **Deduplicate on read** using event ids when the source can resend.

### Deterministic by construction

Pass the logical run date as an argument instead of calling "now"; avoid depending on mutable external state without snapshotting it; pin code and schema versions so a rerun matches the original unless you intend a fix.

### Backfills

1. Fix the bug and test on one day, comparing before and after.
2. Rerun in the correct dependency order (upstream tables first), in parallel with a concurrency cap.
3. Protect consumers: publish into a new version or shadow table, validate, then switch.
4. Communicate the correction window and affected reports.

### Retries and failure handling

Retry transient errors with backoff; fail fast on data errors with clear alerts; separate "late" from "failed" in SLAs; add sensors or data-availability checks instead of fixed sleeps.

### Exactly-once in practice

Message systems usually give at-least-once. You achieve effectively exactly-once results by making the sink idempotent (keys, upserts, transactions) or by transactional commits spanning offsets and writes where supported. Say which components participate.

### Pitfalls

Appending without keys; using wall-clock time inside tasks; backfilling over production tables with no validation; unbounded parallel backfills that overload the source system.

## Lakehouse and table formats: Parquet, partitioning, small files and Iceberg or Delta
<!--
id: de-lakehouse-table-formats
level: lead
tags: data engineering, lakehouse, parquet, iceberg, delta, partitioning, small files, columnar
minutes: 20
-->

> [!PROMPT]
> Your data lake on object storage has thousands of small Parquet files, slow queries and no way to update records safely. How do you fix it, and why would you adopt a table format such as Iceberg or Delta Lake?
>
> **Cover**
> - Why columnar files and partitioning speed queries.
> - The small-files problem and compaction.
> - What table formats add: transactions, schema evolution, time travel.

> [!TLDR]
> Columnar formats like Parquet store values by column with statistics, so queries read only the needed columns and skip row groups; partitioning by a commonly filtered, low-cardinality column (usually date) lets engines skip whole directories. Too many tiny files or too many partitions hurt performance, so compact to files of a few hundred megabytes. Open table formats (Iceberg, Delta, Hudi) add a metadata layer over files that provides atomic commits, safe updates and deletes, schema evolution, time travel and better pruning, which is what turns a lake into a lakehouse.

### Why columnar and partitioned

- Column pruning and predicate pushdown reduce I/O; compression works better on similar values.
- Partition by what queries filter on (event date). Avoid high-cardinality keys (user id) as partitions.
- Cluster or sort within files (z-ordering, sort order) for secondary filters.

### The small-files problem

Streaming and frequent micro-batches create many small files, each with open and metadata overhead. Fix with periodic compaction jobs, larger write batches, and table-format maintenance commands (rewrite data files, optimize, expire snapshots).

### What a table format adds

| Capability | Why it matters |
| --- | --- |
| ACID commits via metadata/snapshots | Readers never see half-written data |
| Row-level update, delete, merge | CDC and GDPR deletes on object storage |
| Schema evolution | Add or rename columns without rewriting everything |
| Time travel and rollback | Debug and recover from bad loads |
| Hidden partitioning and stats | Faster pruning, less user error |

### Practical choices

Pick the format your engines support best (check compatibility with your query and streaming engines), keep a catalog (Hive metastore, Glue, a REST catalog) as the single source of table definitions, set retention for snapshots, and monitor file counts and sizes.

### Pitfalls

Over-partitioning (millions of tiny partitions); never expiring snapshots so storage grows; updating Parquet files in place; ignoring the cost of frequent rewrites for heavy-update tables.

## SQL analytics round: window functions, deduplication, sessionization and incremental logic
<!--
id: de-sql-window-functions
level: senior
tags: data engineering, sql, window functions, deduplication, sessionization, cte, query optimization
minutes: 30
-->

> [!PROMPT]
> Given an `events(user_id, event_time, event_type)` table and a `transactions(user_id, txn_time, amount)` table, write SQL to: (1) find users with more than one transaction with a per-user summary, (2) keep only the latest row per user from a table with duplicates, (3) compute 7-day rolling revenue per day, and (4) group events into sessions with a 30-minute inactivity gap.
>
> **Cover**
> - Correctness first, then performance.
> - When to use window functions versus self-joins.
> - How you would validate the results.

> [!TLDR]
> Reach for aggregates for "users with more than N", `ROW_NUMBER()` over a partition to deduplicate, a window frame for rolling metrics, and `LAG()` plus a cumulative sum to sessionize. State assumptions (time zones, ties, nulls), filter early, avoid accidental duplication from joins, and validate with counts and spot checks. Mention how you would make the query incremental and what indexes or partitions help.

### 1. Users with more than one transaction

```sql
SELECT user_id,
       COUNT(*)                AS txn_count,
       SUM(amount)             AS total_amount,
       MIN(txn_time)           AS first_txn,
       MAX(txn_time)           AS last_txn
FROM transactions
GROUP BY user_id
HAVING COUNT(*) > 1;
```

### 2. Latest row per user (deduplicate)

```sql
SELECT *
FROM (
  SELECT t.*,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY updated_at DESC, id DESC) AS rn
  FROM users_raw t
) x
WHERE rn = 1;
```

Add a deterministic tie-breaker so reruns return the same row.

### 3. Rolling 7-day revenue

```sql
WITH daily AS (
  SELECT CAST(txn_time AS DATE) AS day, SUM(amount) AS revenue
  FROM transactions GROUP BY 1
)
SELECT day,
       SUM(revenue) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS rev_7d
FROM daily;
```

Missing days break a `ROWS` frame; join to a calendar table or use a `RANGE` frame on dates if your engine supports it.

### 4. Sessionization (30-minute gap)

```sql
WITH flagged AS (
  SELECT user_id, event_time,
         CASE WHEN event_time - LAG(event_time) OVER (PARTITION BY user_id ORDER BY event_time)
                   > INTERVAL '30 minutes'
                OR LAG(event_time) OVER (PARTITION BY user_id ORDER BY event_time) IS NULL
              THEN 1 ELSE 0 END AS new_session
  FROM events
)
SELECT user_id, event_time,
       SUM(new_session) OVER (PARTITION BY user_id ORDER BY event_time) AS session_id
FROM flagged;
```

### Checks and performance

- Compare row counts and totals against a simple alternative; test with tricky data (ties, nulls, one-row users).
- Join order and duplicates: aggregate before joining to avoid multiplying rows.
- Partition and sort by commonly filtered columns; avoid functions on filtered columns that block pruning.
- For incremental runs, process only new partitions plus a lookback window and merge results.

## Data quality, contracts and lineage: how you keep trust in the numbers
<!--
id: de-data-quality-contracts-lineage
level: lead
tags: data engineering, data quality, data contracts, lineage, observability, testing, ownership
minutes: 18
-->

> [!PROMPT]
> An executive dashboard shows revenue dropping 30% overnight. It turns out an upstream team renamed a field. How do you detect, prevent and respond to this kind of problem?
>
> **Cover**
> - Tests and monitors at each layer.
> - Data contracts and ownership.
> - Lineage and incident response.

> [!TLDR]
> Treat data as a product with owners, contracts and tests. Prevent breakage with schema contracts between producers and consumers (versioned, validated in CI), check data on arrival (schema, nulls, ranges, uniqueness, freshness, volume) and after transformation (reconciliation, referential integrity), and monitor distributions for drift. Use lineage to find affected assets fast, alert the owner with context, communicate impact to consumers and write a postmortem. Quality checks should block or quarantine bad data where the damage is high, and only warn where it is low.

### Layers of defense

| Layer | Checks |
| --- | --- |
| Contract at the source | Schema, types, required fields, semantics, versioning; producers' CI validates changes |
| On ingestion | Schema match, null and range checks, duplicates, freshness, row counts versus expected |
| After transformation | Reconciliation to source totals, unique keys, referential integrity, business rules |
| Consumption | Dashboard tests, anomaly detection on key metrics |

### Data contracts

A contract states the schema, meaning of fields, allowed values, freshness, ownership and change policy (deprecation windows, versioning). Producers validate against it before releasing; breaking changes require a new version and notice to consumers.

### Responding to the incident

1. Confirm and scope: which tables, dashboards and decisions are affected, using lineage.
2. Stop the bleeding: pause downstream refreshes or display a banner.
3. Fix and backfill with validation (see the idempotent pipelines question).
4. Communicate plainly to stakeholders with the corrected numbers.
5. Add the check that would have caught it and a contract test for the upstream change.

### Practical guidance

- Not every failure should block: block on critical financial tables, warn on exploratory ones.
- Alert on actionable signals with an owner, to avoid alert fatigue.
- Keep data tests in version control alongside transformations.
- Track metrics: freshness SLA hit rate, incident count, time to detect.

### Pitfalls

Relying on dashboards to discover problems; checks with no owner; strict tests that everyone learns to ignore; transforming data without keeping raw inputs for recovery.
