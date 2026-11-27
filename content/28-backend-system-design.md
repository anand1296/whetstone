---
id: backend-system-design
title: High-Level Design: Backend Systems
description: Backend system design walkthroughs that start from requirements and the data model, then go through concurrency, scaling and consistency: Splitwise (expense sharing and debt settlement) first.
facets: backend, system-design
---

## Design Splitwise (high-level): schema, concurrent expenses, settling with minimum transactions, scale and consistency
<!--
id: hld-splitwise
level: lead
tags: system design, splitwise, schema, concurrency, idempotency, ledger, sharding, consistency, transactions
minutes: 45
-->

> [!PROMPT]
> Design Splitwise for a Staff-level interview. Users create groups and add expenses; the system shows balances and settles group debts with the minimum number of transactions. Cover the schema, what happens when two users add expenses to the same group at the same moment, scaling to large groups, and keeping the data globally consistent.

> [!HINT]
> - Start from the money invariants: what must always be true, no matter what fails?
> - Which operations conflict, and which can simply be inserts that never conflict?
> - What is the natural unit of consistency (and of sharding)?

> [!TLDR]
> Treat money as integers in minor units and expenses as an append-only ledger: each expense is one row plus one row per participant's share, written together in one database transaction with the matching balance changes. Keep a materialized net balance per user per group (n rows per group, not n squared pairs) updated with atomic increments (`net = net + delta`), never read-modify-write, so two people adding expenses at the same moment cannot lose an update; use an idempotency key per request so retries are safe, and a version number for edits. The group is the unit of consistency, so shard by group id: every expense, split and balance of a group lives on one shard and uses ordinary local transactions, with no distributed transaction. Cross-group views (total owed to me) are derived asynchronously and are eventually consistent. Settling with the fewest payments is computed on demand or in a background job from the net balances, cached by group version, using greedy for large groups and the exact method only for small ones. Protect the invariants with constraints and a reconciliation job.

### Requirements and assumptions

- **Functional:** create groups, add and edit expenses (equal, exact, percentage or share-based splits), see who owes whom, record a settlement payment, see group and personal activity, simplify debts, notifications.
- **Non-functional:** money must never be lost or created, a retry must not duplicate an expense, concurrent edits must not corrupt balances, reads are far more frequent than writes, groups mostly have 2 to 20 people but a few have hundreds.
- **Out of scope unless asked:** moving real money (payment rails), multi-currency within one expense (store one currency per group, with a rate captured at the time if needed).
- **Rough scale (assumptions, say them out loud):** tens of millions of users, a few expenses per group per day, peak writes in the hundreds to low thousands per second, reads ten times that. This fits a sharded relational database comfortably; it is not a case for exotic infrastructure.

### Invariants (the design starts here)

1. For every expense: the sum of the shares equals the amount.
2. For every group: the sum of all net balances is zero.
3. An expense is applied at most once, however many times the client retries.
4. Balances are always derivable from the ledger (so they can be rebuilt and audited).

### API

```text
POST /groups                                  create a group
POST /groups/{g}/expenses                     body: payer, amount_minor, split, Idempotency-Key header
PUT  /groups/{g}/expenses/{e}                 body: changes, If-Match: <version>
DELETE /groups/{g}/expenses/{e}               soft delete (adds a reversing effect)
GET  /groups/{g}/balances                     net balance per member (+ version)
GET  /groups/{g}/settle-suggestions           simplified payments for this version
POST /groups/{g}/settlements                  record "A paid B", Idempotency-Key header
GET  /groups/{g}/expenses?cursor=...          paginated activity
GET  /users/me/summary                        total owed to me and by me across groups
```

### Data model

Run in SQLite while writing this answer; use `BIGINT` identity keys and `timestamptz` columns in Postgres.

```sql
CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT NOT NULL);

CREATE TABLE groups(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  version INTEGER NOT NULL DEFAULT 0            -- bumped on every change; cache key and ETag
);

CREATE TABLE memberships(
  group_id INTEGER NOT NULL REFERENCES groups(id),
  user_id  INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY(group_id, user_id)
);

CREATE TABLE expenses(
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES groups(id),
  payer_id INTEGER NOT NULL REFERENCES users(id),
  amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),   -- integer paise or cents, never a float
  description TEXT,
  idempotency_key TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,                      -- optimistic concurrency for edits
  deleted INTEGER NOT NULL DEFAULT 0,
  UNIQUE(group_id, idempotency_key)                        -- a retried request cannot insert twice
);

CREATE TABLE expense_splits(
  expense_id INTEGER NOT NULL REFERENCES expenses(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  share_minor INTEGER NOT NULL CHECK(share_minor >= 0),
  PRIMARY KEY(expense_id, user_id)
);

CREATE TABLE balances(                                     -- materialized net per user per group
  group_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  net_minor INTEGER NOT NULL DEFAULT 0,                    -- positive: is owed; negative: owes
  PRIMARY KEY(group_id, user_id)
);

CREATE TABLE settlements(
  id INTEGER PRIMARY KEY, group_id INTEGER NOT NULL,
  from_user INTEGER NOT NULL, to_user INTEGER NOT NULL,
  amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
  idempotency_key TEXT NOT NULL, UNIQUE(group_id, idempotency_key)
);
```

Decisions behind it:

- **Net balance per user, not a pairwise table.** A group of `n` people has at most `n` balance rows, but up to `n * (n - 1) / 2` pairs. The pairwise "A owes B 40" view is derived by the settlement algorithm when needed, which also reduces the number of payments.
- **Append-only ledger.** Edits and deletes do not mutate history silently: an edit writes the new values and adjusts balances by the difference (new minus old) in the same transaction; a delete reverses the effect. The ledger plus the version column give an audit trail.
- **Uneven splits.** Distribute the remainder minor units deterministically (the first `amount % n` participants get one extra), so shares always sum to the amount.
- **Unique constraints do the heavy lifting:** the idempotency key, and the primary keys on splits and balances.

### The write path: one transaction

```sql
BEGIN;
  INSERT INTO expenses(group_id, payer_id, amount_minor, idempotency_key, created_by)
    VALUES (:g, :payer, :amount, :key, :actor);       -- unique violation => already applied, return the original result
  INSERT INTO expense_splits VALUES (:e, :u1, :s1), (:e, :u2, :s2), (:e, :u3, :s3);
  UPDATE balances SET net_minor = net_minor + :amount WHERE group_id = :g AND user_id = :payer;
  UPDATE balances SET net_minor = net_minor - :s1     WHERE group_id = :g AND user_id = :u1;
  UPDATE balances SET net_minor = net_minor - :s2     WHERE group_id = :g AND user_id = :u2;
  UPDATE balances SET net_minor = net_minor - :s3     WHERE group_id = :g AND user_id = :u3;
  UPDATE groups   SET version = version + 1 WHERE id = :g;
COMMIT;
```

All or nothing: either the expense, its splits and the balance changes exist, or none of them. Apply the balance updates in a fixed order (by user id) so two concurrent transactions touching the same rows take locks in the same order and cannot deadlock.

### Two users add expenses at the same moment

The answer has three layers.

1. **The expenses never conflict.** Each is a new row with its own splits. Two inserts into one group do not block each other.
2. **The balances are shared rows, so use atomic increments, not read-modify-write.** I reproduced the bug on purpose: two connections each read a balance of 0, one wrote 0 + 100 and the other 0 + 200, and the final value was **200 instead of 300**, because the second write overwrote the first. With `net_minor = net_minor + :delta` the database applies each change to the latest committed value under a row lock.
3. **Retries are safe** because of the idempotency key: I replayed an existing key and got no second expense.

I then ran 50 threads adding expenses to one group at once, each paid by one of three people: all 50 committed, the group version was exactly 50, the balances summed to zero, and the materialized balances matched a recomputation from the ledger (sum of payments minus sum of shares per user).

Isolation levels: read committed is enough for the atomic increments above. Use a stricter level, or an explicit lock on the group row (`SELECT ... FOR UPDATE`), for operations that read balances and then act on them, such as recording a settlement computed from a suggestion.

**Edits are the real conflict.** Two people editing the same expense start from the same version:

```sql
UPDATE expenses SET description = :d, version = version + 1 WHERE id = :e AND version = :seen;
-- 1 row updated: success.  0 rows: someone else changed it; reload and ask the user to retry or merge.
```

I checked this: the first editor updated one row, the second updated zero rows and got a conflict. The API maps it to `If-Match` and `412 Precondition Failed` (or `409`).

### Settling with the minimum number of transactions

- Input: the net balances of the group (`n` rows, sum zero).
- **Greedy:** repeatedly match the largest debtor and the largest creditor. At most `n - 1` payments, O(n log n). Good enough for large groups.
- **Exact:** the true minimum is `n` minus the maximum number of disjoint zero-sum subgroups, which is NP-hard; use backtracking or a bitmask DP for small groups (up to about 12 to 20 people). See the minimum transactions question in Data Structures and Algorithms for the code and a case where greedy needs 4 payments and the optimum is 3.
- **Where it runs:** on demand for small groups; for big ones, in a background job that stores the suggestion keyed by `(group, version)`. If the version changed, the suggestion is stale and is recomputed or flagged.
- **Recording a settlement** is a ledger entry like an expense: `from` gains `amount`, `to` loses `amount`, version increments. Never "apply" a suggestion blindly: validate that the version is still the one the user saw.

### Scaling to large groups

- **Reads dominate:** cache `GET /balances` per group and version (the version is the cache key, so invalidation is free); serve activity from read replicas with cursor pagination.
- **Wide writes:** an expense split among 300 people updates 301 balance rows in one transaction. That is still a single-shard transaction, but it is wider and holds more locks. Mitigations: keep transactions short, cap participants per expense, and if one group becomes a hot spot, switch its balances to an append-only `ledger_entries(group, user, delta)` table with a periodic compaction into a snapshot, so a write is only inserts and a read is snapshot plus recent entries.
- **Large settlement computation:** run it off the request path with a size cap on the exact algorithm; fall back to greedy.
- **Notifications and activity feeds:** write an outbox row in the same transaction and let a worker publish it, so a crash never loses or duplicates an event.

### Global consistency and sharding

- **The group is the consistency boundary.** Shard by `group_id`: expenses, splits, balances, settlements and memberships of a group live on one shard, so every write is a local ACID transaction and there is no two-phase commit.
- **Users are in many groups,** so "total I owe across all groups" spans shards. Compute it from events (the outbox) into a per-user summary table: it is **eventually consistent**, which is acceptable for a dashboard, and the group page (the source of truth) is always exact. Say that explicitly in the UI and the interview.
- **Multi-region:** give each group a home region that handles its writes, with replicas elsewhere for reads. Return the group version in write responses and let clients ask replicas for "at least version v" to get read-your-own-writes. Offline clients generate the expense id and idempotency key locally and replay them on reconnect.
- **Money safety checks:** database constraints (`CHECK` amounts, unique keys, foreign keys), application validation that the splits sum to the amount, and a nightly reconciliation job that recomputes balances from the ledger and alerts on any difference or non-zero group sum.
- **Disaster recovery:** the ledger is the source of truth, so balances and summaries can be rebuilt from it.

### Failure modes to mention

| Failure | Handling |
|---|---|
| Client retries after a timeout | Idempotency key; the second call returns the first result |
| Crash after the transaction commits, before the notification | Outbox row was committed with it; the worker sends later |
| Two edits to one expense | Version check; the loser reloads |
| Member removed with a non-zero balance | Block removal, or require settling; never delete history |
| Rounding | Integer minor units and a deterministic remainder rule |
| Currency changes | One currency per group; store the rate at expense time if conversion is needed |

### Follow-ups

- **"Why not store pairwise debts?"** They grow quadratically, and every edit touches many rows; net balances are linear and a pairwise view can be derived.
- **"Why not eventual consistency for balances too?"** Money views need to be right inside a group, and a single shard gives that cheaply.
- **"How do you add recurring expenses?"** A scheduler that creates expenses with a deterministic idempotency key per occurrence.
- **"How would you test it?"** Concurrency tests like the 50-thread run, property tests that balances sum to zero, and replay tests that rebuild balances from the ledger.

### References

- [Stripe: Designing robust APIs with idempotency](https://stripe.com/blog/idempotency)
- [PostgreSQL: Transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [microservices.io: Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)

Appears in an interview write-up shared online (second-hand; source unverified). The design is my own; the schema, the 50-thread concurrent writes, the lost-update demonstration, the idempotency replay and the optimistic edit check were run in SQLite (Postgres differs in types and in how it locks, not in the approach).
