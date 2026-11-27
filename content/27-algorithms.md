---
id: algorithms
title: Data Structures and Algorithms
description: Interview algorithm problems explained from the reasoning up, each with a brute-force version, an optimized one and the code that was run: optimal strategy for a two-player game, and settling group debts with the fewest transactions.
facets: frontend, backend, dsa
---

## Optimal Strategy for a Game: maximum total the first player can secure when both play optimally
<!--
id: algo-optimal-strategy-game
level: senior
tags: dsa, dynamic programming, interval dp, minimax, game theory, recursion, memoization
minutes: 30
-->

> [!PROMPT]
> Two players take turns picking a value from either end of an array, and the picked value is added to that player's total. Both play optimally. Return the maximum total the first player can secure. For `[8, 15, 3, 7]` the answer is `22`.

> [!HINT]
> - Think in terms of a subarray `a[i..j]` and "the player whose turn it is".
> - Whatever the current player does not take, the opponent plays optimally on. How does that connect the two totals?
> - Which pairs `(i, j)` are repeated if you just recurse?

> [!TLDR]
> Define `best(i, j)` as the most the player to move can collect from the subarray `a[i..j]`. That player picks the left or the right end, after which the opponent moves on the smaller subarray and, being optimal, takes `best` of it; what is left over of the subarray's sum comes back to us. So `best(i, j) = max(a[i] + sum(i+1, j) - best(i+1, j), a[j] + sum(i, j-1) - best(i, j-1))`. Plain recursion is exponential, but there are only n squared distinct `(i, j)` pairs, so memoization or a bottom-up table gives O(n squared) time. A simpler equivalent tracks the score difference: `d(i, j) = max(a[i] - d(i+1, j), a[j] - d(i, j-1))`, and the first player's total is `(sum + d(0, n-1)) / 2`. Greedy (always take the larger end) is wrong.

### The reasoning the interviewer wanted

"Maximize your own total, assuming the opponent does the same." That sentence is the recurrence. After you take an end, you do not control the next move: the opponent plays the best they can on what remains, which minimizes what you get from it. Because the two totals always add up to the subarray's sum, "the opponent gets `best(rest)`" is the same as "I get `sum(rest) - best(rest)`". Taking left or right gives two candidates, and you keep the larger.

### Step 1: brute force

```ts
function bruteForce(a: number[], i = 0, j = a.length - 1): number {
  if (i > j) return 0;
  const total = a.slice(i, j + 1).reduce((x, y) => x + y, 0);
  const takeLeft = a[i] + (total - a[i] - bruteForce(a, i + 1, j));   // opponent gets the best of the rest
  const takeRight = a[j] + (total - a[j] - bruteForce(a, i, j - 1));
  return Math.max(takeLeft, takeRight);
}
```

Each call makes two more, so the time is O(2^n). The same `(i, j)` subarrays are solved again and again, which is the signal for dynamic programming.

### Step 2: memoize

```ts
function memo(a: number[]): number {
  const n = a.length;
  const cache = new Map<number, number>();
  const prefix = [0];
  for (const x of a) prefix.push(prefix.at(-1)! + x);
  const sum = (i: number, j: number) => prefix[j + 1] - prefix[i];     // O(1) range sum

  const best = (i: number, j: number): number => {
    if (i > j) return 0;
    const key = i * n + j;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const result = Math.max(
      a[i] + sum(i + 1, j) - best(i + 1, j),
      a[j] + sum(i, j - 1) - best(i, j - 1),
    );
    cache.set(key, result);
    return result;
  };
  return best(0, n - 1);
}
```

O(n squared) time and space. A prefix-sum array makes each range sum O(1).

### Step 3: bottom-up on the score difference

Let `d(i, j)` be the best *difference* (mine minus the opponent's) the player to move can force on `a[i..j]`. Taking the left end gives `a[i]` and then the opponent faces `d(i+1, j)`, so my difference is `a[i] - d(i+1, j)`.

```ts
function optimalStrategy(a: number[]): { first: number; diff: number } {
  const n = a.length;
  if (n === 0) return { first: 0, diff: 0 };
  let dp = a.slice();                                // intervals of length 1: d(i, i) = a[i]
  for (let len = 2; len <= n; len++) {
    const next = new Array<number>(n - len + 1);
    for (let i = 0; i + len - 1 < n; i++) {
      const j = i + len - 1;
      next[i] = Math.max(a[i] - dp[i + 1], a[j] - dp[i]);   // dp[i+1] is d(i+1, j), dp[i] is d(i, j-1)
    }
    dp = next;                                       // only the previous length is needed: O(n) space
  }
  const diff = dp[0];
  const total = a.reduce((x, y) => x + y, 0);
  return { first: (total + diff) / 2, diff };        // first + second = total, first - second = diff
}

optimalStrategy([8, 15, 3, 7]);          // { first: 22, diff: 11 }
optimalStrategy([20, 30, 2, 2, 2, 10]);  // { first: 42, diff: 18 }
```

Time O(n squared), space O(n) with the rolling array. If the sum can be odd, `(total + diff) / 2` is still an integer because `total` and `diff` have the same parity.

### What I ran

- The three versions agreed with each other on 300 random arrays of up to 10 numbers.
- `[8, 15, 3, 7]`: the first player gets `22` and the second `11`.
- **Greedy fails:** always taking the larger end gives the first player only `15` on that same array (take 8, the opponent takes 15 and later 3), against the optimal `22`.
- For every random array of **even** length I tried, the optimal difference was never negative.

### Reconstructing the moves

Keep the full table (`d[i][j]`) and replay: at each turn compare `a[i] - d[i+1][j]` with `a[j] - d[i][j-1]` and take the larger side.

```ts
let i = 0, j = n - 1, turn = 0;
while (i <= j) {
  const left = i === j ? a[i] : a[i] - d[i + 1][j];
  const right = i === j ? a[j] : a[j] - d[i][j - 1];
  if (left >= right) { scores[turn] += a[i]; i++; } else { scores[turn] += a[j]; j--; }
  turn ^= 1;
}
```

For `[8, 15, 3, 7]` this plays: first takes 7, second takes 8 (or 3), and so on, ending with 22 and 11.

### Follow-ups interviewers ask

- **"Why is the first player never worse off with an even number of items?"** Colour positions alternately odd and even. The first player can choose to take all the odd-position items or all the even-position items by always taking the end of the right parity (the opponent is forced onto the other parity), so the better of the two sums is at least half of the total.
- **"What if players may take 1 to k items from the left end only?"** Different recurrence (suffix based): `dp[i]` is the best difference from suffix `i`, trying each take size.
- **"Is this minimax?"** Yes: one player maximizes and the other minimizes the first player's result. Writing it as a difference lets both players use `max`, because the opponent's maximum is our minimum (negamax). Alpha-beta pruning is unnecessary because the state space is only O(n squared).
- **"Can you reduce the space?"** Yes, to O(n), as in the code above, if you do not need to rebuild the moves.

### References

- [GeeksforGeeks: Optimal Strategy for a Game](https://www.geeksforgeeks.org/dsa/optimal-strategy-for-a-game-dp-31/)
- [LeetCode 486: Predict the Winner](https://leetcode.com/problems/predict-the-winner/)
- [Wikipedia: Negamax](https://en.wikipedia.org/wiki/Negamax)

Appears in an interview write-up shared online (second-hand; source unverified). The explanation and code are my own and were run in Node, checked against a brute-force version on random inputs.

## Settle group debts with the minimum number of transactions: net balances, the greedy shortcut and the exact answer
<!--
id: algo-min-transactions-settle-debts
level: senior
tags: dsa, backtracking, bitmask dp, graph, np-hard, splitwise, greedy, subset sum
minutes: 35
-->

> [!PROMPT]
> A group has many expenses, each paid by one person and shared among several. Settle everything with the minimum number of payments between people. How would you do it, and can you prove it is minimal?

> [!HINT]
> - Only each person's net balance matters, not who owed whom originally.
> - A group of k people whose balances sum to zero can always be settled with k - 1 payments. What does that suggest about the best answer?
> - Is "largest debtor pays largest creditor" optimal?

> [!TLDR]
> First reduce the debts to one number per person: net balance = what they paid minus what they owe, so balances sum to zero. Settling everyone against everyone in one pass needs at most n - 1 payments (greedy: largest debtor pays largest creditor), which is the standard practical answer. The minimum, though, is `n - g`, where `g` is the largest number of disjoint subgroups whose balances each sum to zero, because a zero-sum subgroup of size k can settle internally with k - 1 payments. Finding that partition is NP-hard in general (it contains subset sum), so the exact methods are exponential: backtracking that settles one person at a time, or a bitmask DP over subsets in O(2^n * n). That is fine for the 10 to 20 people in a typical group, and for bigger ones use the greedy answer, optionally after cancelling exact opposite pairs. The expected answer is: compute net balances, show the greedy bound, then explain why the optimum needs the zero-sum partition.

### Step 1: reduce to net balances

```ts
function balances(expenses: { payer: number; shares: Map<number, number> }[], n: number): number[] {
  const bal = new Array<number>(n).fill(0);
  for (const e of expenses) {
    for (const [user, share] of e.shares) {
      bal[e.payer] += share;      // the payer fronted every share
      bal[user] -= share;         // each person owes their own share
    }
  }
  return bal;                      // positive: is owed money; negative: owes money; the sum is 0
}
```

Use integers (the smallest currency unit), never floats. Balances of zero drop out of the problem.

### Step 2: the greedy answer (at most n - 1 payments)

```ts
type Tx = { from: number; to: number; amount: number };

function greedySettle(bal: number[]): Tx[] {
  const creditors = bal.map((b, i) => ({ i, b })).filter((p) => p.b > 0).sort((x, y) => y.b - x.b);
  const debtors = bal.map((b, i) => ({ i, b: -b })).filter((p) => p.b > 0).sort((x, y) => y.b - x.b);
  const out: Tx[] = [];
  let c = 0, d = 0;
  while (c < creditors.length && d < debtors.length) {
    const amount = Math.min(creditors[c].b, debtors[d].b);
    out.push({ from: debtors[d].i, to: creditors[c].i, amount });
    creditors[c].b -= amount;
    debtors[d].b -= amount;
    if (creditors[c].b === 0) c++;     // each payment finishes at least one person,
    if (debtors[d].b === 0) d++;       // and the last one finishes two: at most n - 1 payments
  }
  return out;
}
```

Every payment clears at least one person, and the final one clears two, so with `n` people who have non-zero balances you make at most `n - 1` payments. It is simple and fast (O(n log n)), and it often finds the best answer, but not always.

### Why greedy is not always minimal

Take balances `[100, -40, -60, 70, -70]`. The groups `{100, -40, -60}` and `{70, -70}` each sum to zero, so the optimum is `2 + 1 = 3` payments. Greedy pairs 100 with the largest debtor first (70), mixes the groups together, and needs **4**. I ran it: greedy gave 4, the exact solver 3.

The rule that explains it: a set of `k` people with a zero total can settle among themselves in `k - 1` payments, so if you can split the `n` people into `g` such sets, you need `n - g` payments, and `g` is as large as possible at the optimum. No smaller count is possible, because any settlement graph links people into connected pieces, and each piece must itself sum to zero.

### Step 3: exact, by backtracking

Settle the first unsettled person against someone of the opposite sign, pass their whole balance on to that person, and recurse. Try each choice and keep the best.

```ts
function settleMin(balance: number[]): Tx[] {
  const people = balance.map((b, i) => ({ i, b })).filter((p) => p.b !== 0);
  const b = people.map((p) => p.b);
  let best: Tx[] | null = null;
  const path: Tx[] = [];

  const go = (s: number): void => {
    while (s < b.length && b[s] === 0) s++;
    if (best && path.length >= best.length) return;            // prune: cannot beat the best found so far
    if (s === b.length) { best = [...path]; return; }
    const tried = new Set<number>();
    for (let k = s + 1; k < b.length; k++) {
      if (b[k] * b[s] >= 0 || tried.has(b[k])) continue;       // opposite signs only; skip duplicate balances
      tried.add(b[k]);
      const amount = Math.abs(b[s]);                           // s settles its whole balance with k
      const debtor = b[s] < 0 ? s : k;
      const creditor = b[s] < 0 ? k : s;
      path.push({ from: people[debtor].i, to: people[creditor].i, amount });
      const saved = [b[s], b[k]];
      b[k] += b[s];
      b[s] = 0;
      go(s + 1);
      [b[s], b[k]] = saved;
      path.pop();
    }
  };

  go(0);
  return best ?? [];
}
```

The payment amount is the whole balance of the person being settled, so an intermediate person may receive more than they are owed and pass the rest on in a later payment; the **count** is the minimum and the balances all end at zero (I applied the payments and checked). If you want each payment capped at what the debtor owes, post-process, or use the greedy form inside each zero-sum group once you have found the groups.

I ran this against a bitmask DP on 300 random groups of 2 to 9 people: the counts matched, and every result brought all balances to zero. With 11 people it took about 50 ms. With 18 people it did not finish within a couple of minutes, so backtracking is for small groups.

### Step 4: exact, by bitmask DP over subsets

For `n` non-zero balances, let `sum[mask]` be the total of the people in `mask`, and `dp[mask]` the maximum number of disjoint zero-sum groups inside `mask`. Adding one more person either completes a zero-sum group or not.

```ts
function minTransactions(bal: number[]): number {
  const v = bal.filter((b) => b !== 0);
  const n = v.length;
  if (n === 0) return 0;
  const full = (1 << n) - 1;
  const sum = new Array<number>(1 << n).fill(0);
  for (let m = 1; m <= full; m++) {
    const low = m & -m;                                    // lowest set bit
    sum[m] = sum[m ^ low] + v[31 - Math.clz32(low)];       // add that person's balance
  }
  const dp = new Array<number>(1 << n).fill(0);
  for (let m = 1; m <= full; m++) {
    let best = 0;
    for (let i = 0; i < n; i++) if (m & (1 << i)) best = Math.max(best, dp[m ^ (1 << i)]);
    dp[m] = best + (sum[m] === 0 ? 1 : 0);                 // if the whole mask sums to zero, it closes a group
  }
  return n - dp[full];
}
```

Time O(2^n * n), memory O(2^n), practical up to roughly 20 people. It returns the **count**; to get actual payments, find the groups (follow the DP choices) and settle each group greedily with `k - 1` payments.

### What an interviewer wants to hear

1. Reduce to net balances (and why the original who-owes-whom does not matter).
2. Give the greedy solution with the `n - 1` bound, and its complexity.
3. Admit it is not always minimal, with a small counterexample.
4. Explain the zero-sum subgroup characterization, and that the exact problem is NP-hard (it embeds subset sum / partition), so you use backtracking or bitmask DP for small `n`.
5. Mention practical shortcuts: cancel equal and opposite balances first, ignore tiny residuals under one unit, and settle per currency.

### Product reality

Real expense apps rarely compute the true minimum: people care that the numbers are correct and few, not that the count is provably smallest. Most use a greedy simplification and let the user accept or ignore it. See the Splitwise design questions for where this runs in the system (asynchronously, cached per group version).

### References

- [LeetCode 465: Optimal Account Balancing](https://leetcode.com/problems/optimal-account-balancing/)
- [Wikipedia: Subset sum problem](https://en.wikipedia.org/wiki/Subset_sum_problem)

Appears in an interview write-up shared online (second-hand; source unverified). The explanation and code are my own; the greedy, backtracking and bitmask versions were run and cross-checked on random inputs.
