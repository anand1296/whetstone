---
id: forward-deployed-engineering
title: Forward Deployed Engineering (FDE)
description: Interview prep for forward deployed engineer roles at AI and data companies: the loop, decomposition cases, customer discovery, applied-AI system design, practical coding, production ownership and behavioral rounds.
facets: fde
---

## What a forward deployed engineer does, and how the interview loop is usually shaped
<!--
id: fde-role-and-loop
level: senior
tags: fde, forward deployed engineer, interview loop, decomposition, customer-facing, role
minutes: 12
-->

> [!PROMPT]
> You are interviewing for a forward deployed engineer (FDE) role at an AI or data platform company. Explain what the job is, how it differs from a software engineer, solutions engineer or consultant, and what each interview round is testing.
>
> **Cover**
> - The day-to-day shape of the role and why companies hire for it.
> - The typical rounds and what a strong answer looks like in each.
> - Why people with a strong frontend or full-stack background can be good at it.

> [!TLDR]
> An FDE is an engineer embedded with a customer to turn a vague business problem into a working, production-grade solution on the company's platform, then feed what they learn back into the product. Loops usually combine a recruiter screen, a practical coding round, a **decomposition** round (an ambiguous customer case where scoping matters more than the answer), a customer-discovery or role-play round, an applied-AI or systems design round and behavioral rounds on ownership and pushing back. The common thread is judgment under ambiguity plus the ability to ship, so prepare to show both technical depth and customer-facing communication.

### The role in one paragraph

Forward deployed engineering (a model popularized by Palantir and now common at AI labs and AI-application companies) puts engineers on or near the customer's problem. You discover the real need, integrate messy data and systems, build and deploy a solution, make it reliable, and report patterns to the product team. Compared with a software engineer you spend more time with customers and less on one long-lived codebase; compared with a solutions engineer you write and ship production code; compared with a consultant you leave behind a working system and influence the product roadmap.

### The loop (varies by company)

| Round | What is tested | What good looks like |
| --- | --- | --- |
| Recruiter screen | Motivation, communication, comfort with customer-facing work | A concrete story of why embedded work appeals to you |
| Practical coding | Writing working code on messy, realistic problems | Clean incremental solution, tests, clear explanation of trade-offs |
| Decomposition | Turning a vague problem into a plan | Clarifying questions, assumptions, metrics, phased plan, named risks |
| Customer discovery / role-play | Listening, probing, handling pushback | Questions before solutions; separating the stated ask from the real need |
| Applied-AI / systems design | Designing a data and model pipeline end to end | Retrieval, evals, cost, latency, failure handling, security |
| Behavioral and ownership | Judgment, accountability, resilience | Specific stories with your decisions and results |

Treat the table as a pattern, not a guarantee: companies differ in order, weight and names, and candidate reports online are second-hand.

### Why frontend and full-stack engineers fit

Customers see the UI, so building a dashboard or workflow that a non-technical user trusts is a large part of the job. Frontend engineers are used to translating fuzzy requirements into interfaces, debugging in production and thinking about users. The gaps to close are usually data and integration skills (SQL, APIs, ETL), applied AI (retrieval, evals) and structured scoping.

### Follow-ups to expect

- *"Why FDE rather than product engineering?"* Tie it to impact on real problems and variety, and acknowledge the trade-offs (travel or on-site time, context switching, less deep ownership of one codebase).
- *"How do you decide what to build for one customer versus the product?"* Use the rule in the later question on product feedback.

## The decomposition round: scope an ambiguous customer problem step by step
<!--
id: fde-decomposition-round
level: senior
tags: fde, decomposition, scoping, case study, clarifying questions, metrics, palantir
minutes: 30
-->

> [!PROMPT]
> The interviewer plays a customer and says: "Our logistics company is losing money on deliveries. Can you help?" You have 45 minutes and no data in front of you. How do you handle it?
>
> **Cover**
> - The questions you ask first and why.
> - How you structure the problem, choose metrics and decide what data you need.
> - How you phase a solution and name the risks.

> [!TLDR]
> A decomposition round grades your structure, not a "right answer". Spend the first third asking questions (who is the user, what decision is being made, what does a loss mean, what data exists, what has been tried), restate the problem in your own words, define a success metric, break the problem into independent drivers (for deliveries: cost per delivery, failed or late deliveries, route efficiency, pricing, returns), pick the highest-value slice to start with, and propose a thin first version with an evaluation plan. Say out loud what could be wrong with your plan and what data would change your mind. Do not treat it as a classic system design question, and do not jump to a solution.

### A structure that works

1. **Clarify the goal.** "What decision will this change? Who acts on it? What is the cost of a wrong answer?"
2. **Pin down the metric.** "Losing money" could mean margin per order, failed-delivery cost, driver idle time, fuel, penalties. Propose one primary metric and a few guardrails.
3. **Break it into drivers** (a simple tree). For delivery losses: revenue per order, cost per delivery (fuel, labor, vehicle), failure rate (address issues, absent recipient, damage), time windows, returns, and fraud or leakage.
4. **Ask what data exists.** Orders, routes, GPS traces, driver logs, costs, customer complaints. Where does it live, how fresh, how clean, who owns it?
5. **Form hypotheses and rank them** by expected impact and ease of checking. Start with a cheap analysis that could kill or confirm the top hypothesis.
6. **Propose phases.** Week 1: data access and a baseline dashboard. Weeks 2-3: root-cause analysis and one targeted fix. Later: automation or a model if the data supports it.
7. **Name risks and unknowns.** Data quality, stakeholder alignment, a customer team that changes definitions, privacy constraints.

### Example opening questions

- "How do you currently measure profit per delivery, and who looks at that number?"
- "Is the loss concentrated (certain regions, customers, times) or spread out?"
- "What has been tried already, and what happened?"
- "Who on your team can give me data access and two hours a week?"

### What interviewers reportedly look for

Candidates describe this as the most ambiguous round, and one reported tip is to avoid framing it as a system design problem while still understanding systems. Signals that read well:

- You restate the problem and confirm it.
- You separate symptoms from causes and avoid solving the first thing you hear.
- You choose a thin, testable first step over a grand platform.
- You talk about users and adoption, not only data and models.

### Pitfalls

Starting to draw boxes and arrows immediately; accepting "improve it" without a metric; proposing machine learning before checking simple explanations; forgetting the customer's constraints (time, people, data access); ending without next steps.

### Variations to practice

Improve city traffic and define a KPI; reconcile two employee systems with conflicting IDs; show a nurse one view across several hospital systems; diagnose why a dashboard "is wrong"; flag likely-wrong billing codes before claims go out. In each, run the same loop: goal, metric, drivers, data, hypotheses, phases, risks.

## Customer discovery and role-play: run a first call without pitching
<!--
id: fde-customer-discovery
level: senior
tags: fde, customer discovery, role play, stakeholder, communication, pushback
minutes: 20
-->

> [!PROMPT]
> You have 45 minutes with a VP at a fintech who wants an "AI copilot" for an internal process. You know nothing about their workflow. Run the discovery call, and then handle this: "We want feature X," when X will not solve their stated problem.
>
> **Cover**
> - The questions you ask and in what order.
> - How you handle a customer demanding the wrong feature.
> - How you end the call.

> [!TLDR]
> Discovery is about learning the problem, the users, the data and the success criteria before proposing anything. Open with their goals and the current process, walk through a real recent example, quantify the pain (volume, time, error cost), identify the actual users and decision makers, probe data access and compliance constraints, and agree on what success looks like and by when. When a customer asks for the wrong feature, do not argue or comply blindly: ask what outcome the feature is meant to achieve, test the request against that outcome, and offer an option that serves it, with evidence. End with a written summary, owners and the next concrete step.

### Call structure

1. **Frame (2 min):** purpose, time, what you will do with the information.
2. **Goals and context (10 min):** "What is this for? What happens if you do nothing?"
3. **Walk a real example (15 min):** "Show me the last time this happened. What did each person do? Where did it get stuck?"
4. **Quantify (5 min):** volume per week, minutes per case, error rates, cost of a miss.
5. **Constraints (5 min):** data location and quality, security and compliance, systems that must integrate, who must approve.
6. **Success and plan (5 min):** how they will judge success and what a small first pilot could look like.
7. **Recap (3 min):** repeat what you heard, the next steps and owners.

### Probing better than "what do you want?"

- Ask for stories, not opinions: "Tell me about the last time an analyst got this wrong."
- Use the five whys on the stated solution: "Why do you need a copilot here? What would it do differently on Monday?"
- Ask who is *not* in the room (the people who will use or be affected by it).

### When the customer demands the wrong feature

```
Customer: "Just add a chatbot to our portal."
You:      "Understood. What outcome should the chatbot produce? Fewer tickets? Faster answers?"
Customer: "Support gets the same 20 policy questions all day."
You:      "Then the measure is deflected tickets. Can we try the policy answers
           inside the existing help page first, with citations, and compare ticket
           volume over two weeks? If that works we can decide on a chatbot."
```

Principles: acknowledge, ask about the outcome, propose the smallest test, agree how you will measure it, and keep the relationship intact. If the request is harmful or infeasible, say so plainly with reasons and alternatives.

### Skeptic role-play

If asked to convince a doubtful stakeholder that your product helps: do not recite features. Find their specific concern, address it with a concrete demonstration on *their* data or process, be honest about limits, and propose a low-risk pilot with a clear success test.

### Pitfalls

Pitching in the first ten minutes; asking only leading questions; accepting vague success metrics; promising what you cannot deliver; leaving without next steps or owners.

## Applied-AI system design: a retrieval layer for a customer's private knowledge base
<!--
id: fde-applied-ai-design-rag
level: lead
tags: fde, applied ai, rag, retrieval, chunking, evals, security, system design, latency, cost
minutes: 40
-->

> [!PROMPT]
> A customer wants employees to ask questions over 200,000 internal documents (wikis, PDFs, tickets) with permissions that must be respected. Design the retrieval layer and the answer pipeline. Cover quality, evaluation, cost, latency and security.
>
> **Cover**
> - Ingestion, chunking and indexing choices.
> - Retrieval, reranking, generation and citations.
> - How you evaluate it before customers see failures, and what you do about a 10x traffic spike.

> [!TLDR]
> Build it as ingestion, indexing, retrieval, generation and evaluation, each with clear failure modes. Ingest with document parsing, deduplication and metadata (source, owner, permissions, updated date); chunk by structure (headings, sections) with modest overlap; index both embeddings and keywords (hybrid search); retrieve more candidates than you need, rerank, and filter by the *user's* permissions at query time; generate with citations and an "I don't know" path. Evaluate retrieval and answers separately against a labeled set drawn from real questions, monitor in production, and control cost and latency with caching, smaller models for easy steps and queueing under load.

### Pipeline

1. **Ingest.** Connectors, parsers for PDFs and tables, OCR where needed, deduplication, incremental updates and deletes (deleted documents must disappear).
2. **Chunk and enrich.** Respect document structure; store source, section, timestamps and access control lists with every chunk.
3. **Index.** Vector index plus keyword (BM25) index; choose by recall on your eval set, not by fashion.
4. **Retrieve.** Hybrid retrieval, query rewriting if needed, rerank the top candidates, then apply **permission filtering** (preferably inside the search, never after generation).
5. **Generate.** Prompt with the chosen passages, require citations, instruct to say when sources do not contain the answer.
6. **Return.** Answer, sources, confidence or "no answer", and feedback buttons.

### Evaluation (before customers find the failures)

- Build a question set from real employee questions with the expected source documents and reference answers.
- Measure **retrieval** (was the right passage in the top k?) separately from **answer quality** (faithful to sources, complete, no unsupported claims).
- Add negative cases: unanswerable questions, outdated documents, conflicting documents, permission traps.
- Run the suite on every change of chunking, model or prompt; keep a regression set of past failures.
- In production, sample real queries for review and track thumbs-down rates, empty retrievals and citation click-through.

### Security and privacy

Access control at retrieval time, tenant isolation, no training on customer data unless contracted, audit logs, redaction of sensitive fields, and a plan for prompt injection from documents (treat retrieved text as untrusted).

### Cost, latency and a traffic spike

- Cache embeddings and frequent answers; batch ingestion; use a cheaper model for rewriting and classification.
- Stream answers to cut perceived latency; set timeouts and fallbacks.
- For a sudden 10x load: queue and rate-limit per tenant, autoscale the stateless layers, degrade gracefully (shorter context, smaller model), and protect the vector store with replicas and caching.

### Pitfalls

Evaluating only by demo; ignoring permissions; chunking blindly by token count; no path for "not found"; no re-indexing plan when documents change.

## Practical coding round: a credit ledger with different expiration rules, built in stages
<!--
id: fde-coding-credit-ledger
level: senior
tags: fde, coding, practical coding, ledger, expiration, tests, incremental, typescript
minutes: 45
-->

> [!PROMPT]
> Build a credit system for a usage-based product. Customers receive credits that can have different expiration rules, and usage consumes credits. Start simple, then the interviewer adds requirements. This is a paraphrase of a style of problem candidates report from AI-company FDE loops.
>
> **Stage 1**
> - `grant(customer, amount, at)`, `use(customer, amount, at)` returning success or failure, and `balance(customer, at)`.
>
> **Stage 2**
> - Credits expire after a configurable number of days; expired credits cannot be used.
>
> **Stage 3**
> - Different grants have different rules (expires at a date, never expires, expires N days after first use). Consume the credits expiring soonest first.

> [!TLDR]
> Model each grant as an object with remaining amount and expiry, and keep a ledger per customer. To spend, drop expired grants relative to the timestamp, sort by earliest expiry (non-expiring last), and take from grants in order until the amount is covered, failing atomically if the balance is insufficient. Pass the time in rather than reading the clock so tests are deterministic. Work in stages: make Stage 1 correct with tests, then extend with an expiry policy interface so new rules do not require rewriting the consumer. Explain complexity and edge cases (zero amounts, same-time grants, partial consumption, idempotency, concurrency).

### Stage 1 and 2 core

```ts
type Grant = { id: number; remaining: number; expiresAt: number | null };

class CreditLedger {
  private grants = new Map<string, Grant[]>();
  private nextId = 1;

  grant(customer: string, amount: number, at: number, ttlMs: number | null = null) {
    if (amount <= 0) throw new Error('amount must be positive');
    const list = this.grants.get(customer) ?? [];
    list.push({ id: this.nextId++, remaining: amount, expiresAt: ttlMs === null ? null : at + ttlMs });
    this.grants.set(customer, list);
  }

  private live(customer: string, at: number): Grant[] {
    return (this.grants.get(customer) ?? [])
      .filter(g => g.remaining > 0 && (g.expiresAt === null || g.expiresAt > at))
      .sort((a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity));
  }

  balance(customer: string, at: number) {
    return this.live(customer, at).reduce((sum, g) => sum + g.remaining, 0);
  }

  use(customer: string, amount: number, at: number): boolean {
    if (amount <= 0) throw new Error('amount must be positive');
    const live = this.live(customer, at);
    if (live.reduce((s, g) => s + g.remaining, 0) < amount) return false;   // atomic: check first
    let need = amount;
    for (const g of live) {
      const take = Math.min(g.remaining, need);
      g.remaining -= take;
      need -= take;
      if (need === 0) break;
    }
    return true;
  }
}
```

### Stage 3: policies

Introduce `ExpiryPolicy` (`FixedDate`, `Never`, `DaysAfterFirstUse`). For "N days after first use", store `firstUsedAt` on the grant and compute `expiresAt` the first time it is consumed; the earliest-expiry ordering treats unused such grants as expiring at `+infinity` until activated, so say what behavior you chose and why.

### Talking points

- **Complexity:** sorting each call is `O(g log g)` for `g` live grants; keep grants in a priority queue or sorted per customer if volume is large.
- **Correctness:** consume atomically (check the total before mutating), never go negative, compare timestamps with a consistent boundary (`expiresAt > at`).
- **Testing:** inject time, test the boundary instant, partial consumption across grants and expired-but-unused credits.
- **Production concerns:** idempotency keys for `use`, an append-only ledger for audit and refunds, per-customer locking, and time zones (use UTC).

### Pitfalls

Reading `Date.now()` inside the class; floating-point amounts (use integer units); mutating before validating so a failed use leaves partial deductions; skipping tests until the end.

## Integration problem: reconcile two systems of record with conflicting IDs
<!--
id: fde-data-integration-reconciliation
level: lead
tags: fde, data integration, reconciliation, entity resolution, idempotency, sync, messy data
minutes: 30
-->

> [!PROMPT]
> A customer has two employee-record systems (HR and payroll) with different IDs and partially conflicting data. They want one reliable view and a way to keep it in sync. Describe your approach and write the core matching logic.
>
> **Cover**
> - How you decide what is the source of truth for each field.
> - Matching records across systems and handling ambiguity.
> - Keeping the systems in sync safely over time.

> [!TLDR]
> Start from the business rules (which system owns which field, what a wrong merge costs), then profile the data. Build a cross-reference table mapping each system's ID to a canonical ID. Match in tiers: exact on stable identifiers (national ID or email), then normalized fuzzy matching on name and date of birth with a confidence score; auto-merge only high-confidence pairs and send the rest to human review. Sync with idempotent, incremental updates (change data capture or timestamps), field-level ownership and conflict rules, an audit trail, and monitoring for drift. Keep merges reversible.

### Steps

1. **Understand ownership.** HR owns title and manager; payroll owns salary and bank details. Write it down per field with the customer.
2. **Profile.** Null rates, duplicates within a system, formats (name casing, accents, date formats), and how IDs were created.
3. **Canonical ID and cross-reference.** `employee_xref(canonical_id, system, system_id)`; never overwrite source IDs.
4. **Match in tiers.**
   - Tier 1: exact match on a trusted key.
   - Tier 2: normalized composite (lowercase, strip accents and punctuation, date of birth) with scoring.
   - Tier 3: human review queue for scores in a gray band.
5. **Resolve conflicts** with deterministic rules: ownership first, then most recently updated, otherwise flag.
6. **Sync.** Incremental pulls by `updated_at` or change feed, idempotent upserts keyed by canonical ID, retry with backoff, dead-letter for failures, and a nightly full reconciliation report.

### Matching sketch

```ts
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z ]/g, '').trim();

function score(a: Person, b: Person): number {
  if (a.email && a.email === b.email) return 1;
  let s = 0;
  if (norm(a.name) === norm(b.name)) s += 0.5;
  if (a.dob && a.dob === b.dob) s += 0.4;
  if (a.department && a.department === b.department) s += 0.1;
  return s;
}
// auto-merge when score >= 0.9; queue for review when 0.6 <= score < 0.9
```

### Risks to say out loud

- A false merge is worse than a missed match; set thresholds conservatively and keep merges reversible.
- Privacy and compliance for personal data, with access limited and changes audited.
- The customer's team will keep editing both systems during the project; plan for ongoing drift rather than a one-time cleanup.

### Pitfalls

Using names as keys; silently overwriting values; no audit or undo; skipping a review path; designing a clever matching model before measuring how many records an exact key already resolves.

## Owning a production incident at a customer: the "2 AM failure" story, and a live debugging plan
<!--
id: fde-production-incident-ownership
level: lead
tags: fde, incident, ownership, behavioral, debugging, communication, postmortem
minutes: 20
-->

> [!PROMPT]
> Your pipeline at a customer fails at 2 AM and their operations team is blocked. Walk through what you do, who you tell, and how you would tell the story in a behavioral interview.
>
> **Cover**
> - Triage, mitigation, communication and root cause in that order.
> - What "ownership" means when part of the problem is in the customer's systems.
> - A story structure that shows judgment, not heroics.

> [!TLDR]
> Stabilize first, diagnose second, prevent third. Acknowledge quickly, assess impact and who is affected, apply the safest mitigation (rollback, switch to a fallback, pause a job), then communicate on a schedule with plain language: what is impacted, what you know, what you are doing, when the next update is. After recovery find the root cause, write a blameless postmortem and ship preventions (alerts, tests, runbooks). In an interview, tell it as a story with your decisions: situation, your role, what you did and why, the outcome and what changed afterwards.

### The incident playbook

1. **Acknowledge and size it.** Who is impacted, since when, how badly, is data wrong or just late?
2. **Mitigate.** Prefer reversible actions: roll back the last deploy, fail over, disable the failing integration, replay later. Avoid risky fixes at 2 AM unless the impact demands it.
3. **Communicate.** One owner, one channel, regular updates. Example: "Impact: nightly claims export is not running; 3 of 40 sites affected. Cause: unknown, investigating a schema change. Next update: 03:00."
4. **Diagnose.** Recent changes, logs, metrics, differences between failing and healthy cases. Change one thing at a time.
5. **Recover and verify.** Backfill missed work, confirm with the customer that data is correct.
6. **Learn.** Blameless postmortem: timeline, contributing factors, what detected it, what would have detected it sooner, and owners for each action.

### Ownership when the cause is partly the customer's

Own the outcome, not just your code: help them see the cause with evidence, propose a workaround, and agree on a fix for the root problem. Avoid blame and avoid hiding the issue.

### A story structure (STAR with decisions)

- **Situation:** one sentence of context and stakes.
- **Task:** what you were responsible for.
- **Actions:** the two or three decisions that mattered, and the alternatives you rejected.
- **Result:** numbers if possible (recovery time, data affected).
- **Reflection:** what you changed (monitoring, runbook, contract terms) so it would not recur.

### What interviewers listen for

Calm prioritization, honest communication including what you did not know, respect for the customer's time, and learning that lasted. Avoid a "hero" story where you worked alone all night and never improved the system.

## Behavioral questions for FDE roles: pushing back on customers, being wrong and building the product from field signals
<!--
id: fde-behavioral-pushback-product-feedback
level: lead
tags: fde, behavioral, pushback, product feedback, scope, trade-offs, ai usage
minutes: 20
-->

> [!PROMPT]
> Prepare answers to the behavioral prompts commonly reported in FDE loops: "Tell me about a time you pushed back on a customer," "Tell me about a time you were wrong," "How do you use AI in your own work?" and "How do you decide what to build for one customer versus the product?"
>
> **Cover**
> - A structure for each answer and the signal it carries.
> - A rule for custom work versus product work.
> - Pitfalls that make answers sound generic.

> [!TLDR]
> Each prompt tests judgment. For pushback, show that you protected the customer's real outcome and the relationship: you gathered evidence, offered an alternative and agreed on a test. For "you were wrong", own it quickly, state the cost, and describe what you changed. For AI usage, give concrete workflows with your verification habits. For custom versus product, build bespoke only when it is urgent and small, generalize when several customers hit the same need, and feed the pattern to the product team with evidence. Use specific stories with numbers and avoid vague claims.

### Pushing back on a customer

Pick a case where the customer asked for X but needed Y.

- **Context:** what they requested and why it would not work.
- **Your move:** you asked about the outcome, showed evidence (a prototype, data, a past failure) and proposed a smaller test.
- **Result:** the decision, the metric, and the relationship afterwards.

Signal: you are not an order taker or an obstacle.

### Being wrong

State what you believed, what evidence changed your mind, how quickly you told people, the impact, and what you did to prevent a repeat. Avoid fake weaknesses ("I work too hard").

### How you use AI regularly

Be specific: tools for drafting code and tests, exploring unfamiliar APIs, summarizing customer calls, generating analysis queries. Then show judgment: you verify outputs against tests and data, you do not paste customer secrets into tools, and you know where it is unreliable.

### Custom versus product

Use a simple rule:

| Situation | Action |
| --- | --- |
| One customer, urgent, small, no platform impact | Build it bespoke, time-boxed, document it |
| Two or three customers ask for the same thing | Generalize into a reusable module or template |
| Many customers, strategic | Write a product proposal with evidence and volume, and partner with product |
| Customer asks for something that harms the platform or others | Decline and offer an alternative |

Keep a log of recurring requests with customers, impact and workarounds; that log is your leverage with the product team.

### Pitfalls

Stories with no stakes or numbers; blaming the customer; claiming "we" instead of "I" for decisions; never mentioning what you learned; describing AI use without any verification.

## A map of reported FDE interview questions, by round, and how to use them without memorizing
<!--
id: fde-reported-question-bank
level: senior
tags: fde, interview questions, reported, question bank, palantir, openai, anthropic, databricks, preparation
minutes: 15
-->

> [!PROMPT]
> You want to practice with questions that candidates have reported from real FDE loops. Which are commonly reported, how reliable are those reports, and how should you practice?
>
> **Cover**
> - Representative questions by round.
> - Why company attribution is shaky and what to do about it.
> - A practice plan.

> [!TLDR]
> Candidate-reported questions are useful for learning the *format* of each round, not for memorizing answers. Most circulate on prep sites, forums and candidate write-ups, and attribution is second-hand, approximate and sometimes outdated, so treat every item as "reported", not "confirmed". Representative prompts cluster into decomposition cases, customer discovery, applied-AI system design, practical coding and behavioral stories. Practice by running each as a timed drill with a structure (clarify, define metric, plan, risks), then review against what the round tests.

### Representative reported questions (paraphrased)

**Decomposition and scoping** (commonly reported for Palantir and similar companies)
- Improve traffic in a large city, and define the KPI.
- Sync two employee-record systems with conflicting IDs.
- From a dataset of taxi rides, propose ways to improve drivers' lives.
- Find the root cause of a logistics company's delivery losses from existing data.
- Give a nurse one view across several disconnected hospital systems.
- A customer says the dashboard is wrong; diagnose it.

**Customer discovery and role-play**
- Run a 45-minute discovery call with a fintech VP evaluating an AI copilot.
- Convince a skeptic that your product does something a competitor's cannot.
- Ask discovery questions before proposing automation of an internal process.
- Handle a customer demanding a feature that will not solve their real problem.

**Applied-AI system design**
- Design a retrieval layer for a private knowledge base (chunking, indexing).
- Choose evaluations that catch failures before customers see them.
- Handle a 10x overnight traffic spike within latency and cost targets.
- Build a claims backend that extracts fields from emails and PDFs while controlling token cost.
- An AI agent's key metric dropped; diagnose and prioritize fixes.

**Practical coding**
- Build a credit system where credits expire under different rules.
- Simulate infection spread on a 2D grid, with tests for each stage.
- Implement an LRU cache with constraints added in stages.
- Fetch paginated REST data, handling page size and total pages.
- Write SQL for users with more than one transaction plus a per-user summary.
- Implement file-system permissions with hierarchy and change timestamps.

**Behavioral and ownership**
- Tell me about pushing back on a customer.
- Describe a production failure at 2 AM and what you owned.
- Tell me about a time you were wrong.
- How do you use AI in your own work?

### How reliable are these?

They mostly come from prep sites that collect candidate write-ups. Wording is approximate, company labels are second-hand, rounds change quickly, and some candidates are under confidentiality agreements and share little. Use them to see patterns; check the current process with your recruiter and avoid sharing or seeking confidential interview material.

### A practice plan

1. **Pick one prompt per round** and time-box it (decomposition 30 min, discovery 30, design 40, coding 45).
2. **Use the same skeleton each time:** clarify goal, define the metric, break into drivers, pick a first slice, state risks.
3. **Practice out loud** with a partner who plays an unhelpful, vague customer.
4. **Review:** did you ask before answering, name assumptions, and finish with a plan?
5. **Prepare four stories** (pushback, wrong, incident, impact) with numbers.

## Early-career path into FDE: the skills to build and the projects that signal readiness
<!--
id: fde-early-career-preparation
level: junior
tags: fde, junior, preparation, projects, skills, portfolio, communication, career
minutes: 10
-->

> [!PROMPT]
> You are a junior or early-career engineer interested in forward deployed engineering. What skills matter, what projects would convince an interviewer, and how do you prepare for the loop?

> [!TLDR]
> FDE roles reward engineers who can code well and also understand customers. Build a base in a general-purpose language (Python or TypeScript), SQL, APIs and data wrangling, debugging and Git, then add applied AI basics (calling an LLM API, retrieval, evaluating outputs) and clear communication. Projects that signal readiness solve a messy real problem end to end: integrate two data sources, build a small tool for a real user (a club, a family business, a campus office), deploy it, measure whether it helped and write up what you learned. Practice explaining trade-offs aloud, running a discovery conversation, and breaking a vague problem into steps.

### Skills to build

| Area | Why it matters |
| --- | --- |
| Python or TypeScript, plus SQL | Daily tools for integration and analysis |
| APIs and data formats (REST, JSON, CSV, webhooks) | Customers' systems are messy and varied |
| Debugging and reading unfamiliar code | You work in someone else's environment |
| Applied AI basics | Calling models, retrieval, evals, cost awareness |
| Communication | Writing status updates, asking good questions, explaining trade-offs |

### Projects that stand out

1. **Messy-data integration:** pull from two real sources (a spreadsheet and an API), reconcile records, produce a dashboard; document the edge cases.
2. **A tool for a real user:** talk to them first, write down what they actually needed, ship in small steps, collect feedback.
3. **A small RAG app with evaluation:** a question set, a measured baseline, and one improvement you can show with numbers.
4. **Write-ups:** a one-page case study per project (problem, constraints, decisions, result, what you would change).

### Preparing for the loop

- Practice the decomposition skeleton: clarify, metric, drivers, first slice, risks (see the decomposition question).
- Do timed coding exercises on parsing, pagination, caching and SQL.
- Prepare four stories about ownership, a mistake, a disagreement and impact.
- Research the company's product and think about how a customer would use it.

### Pitfalls

Only tutorials with no real user; hiding what went wrong in a project; treating the role as pure consulting with no engineering depth.

## Scope a customer pilot: success criteria, timeline, risks and the path to production
<!--
id: fde-scope-a-pilot
level: lead
tags: fde, pilot, scoping, success criteria, timeline, risk, stakeholders, production readiness
minutes: 25
-->

> [!PROMPT]
> A customer wants to "try AI" on their support operation and has agreed to a six-week pilot. How do you scope it so it can succeed and lead to a production decision?
>
> **Cover**
> - Choosing the use case and defining success.
> - The plan, owners and data access.
> - Risks, stop conditions and the path to production.

> [!TLDR]
> A pilot should answer one question: is this worth deploying? Pick a narrow, high-volume, measurable use case, agree on success metrics and a baseline before building, name customer owners and data access dates, plan in weekly milestones with a usable version early, define what is out of scope, and set a decision meeting at the end with explicit criteria (continue, adjust or stop). Track risks weekly (data quality, access delays, security review, low adoption) and plan production needs (integration, monitoring, support, cost, compliance) during the pilot instead of after it.

### The scoping checklist

1. **Use case:** one workflow with enough volume to show an effect (for example, categorizing and drafting replies for the top five ticket types).
2. **Success metrics and baseline:** handle time, first-response time, deflection rate, accuracy on a reviewed sample; measure the current numbers first.
3. **Owners and cadence:** an executive sponsor, a day-to-day owner, a subject expert with scheduled hours, weekly demos.
4. **Data and access:** what, from where, by when, with security approvals; a fallback sample if access slips.
5. **Plan:** week 1 baseline and data access; weeks 2-3 first version on real examples; weeks 4-5 iterate with user feedback and evals; week 6 results and decision.
6. **Out of scope:** write it down (new channels, full integration, other teams).

### Risks and stop conditions

| Risk | Mitigation |
| --- | --- |
| Data access delayed | Start with a sample; escalate early |
| Accuracy not good enough | Evaluate on week 2; define a minimum bar and a stop rule |
| Users do not adopt it | Involve them from week 1; put it in their tools |
| Security or compliance blocks | Engage reviewers at kickoff |
| Scope creep | Written scope and a change process |

### From pilot to production

Decide what must change: integration with real systems, monitoring and evaluation, cost per request, support ownership, fallback behavior, training and rollout. Present results with the baseline comparison, qualitative feedback, remaining gaps and a costed production plan.

### Pitfalls

Success defined as "users like it"; skipping the baseline; building a demo that cannot be productionized; letting the pilot drift without a decision date.
