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

## Decomposition worked example: "You have city traffic data. Build me a system to improve traffic."
<!--
id: fde-decomposition-city-traffic
level: senior
tags: fde, decomposition, databricks, palantir, kpi, stakeholders, data pipeline, ml, case study
minutes: 30
-->

> [!PROMPT]
> The interviewer says: "You have a city's traffic data. Build me a system to improve traffic." That is all you get. Walk through how you would handle the 45 minutes.
>
> **Cover**
> - What you ask before you design anything.
> - The order you design the layers in.
> - How you keep it from becoming an ML project that never ships.

> [!TLDR]
> Candidates who report this prompt (it appears in Databricks and Palantir loops according to prep-site write-ups) describe the same winning pattern: ask about the stakeholder, the end user, the data you actually have and one success KPI before drawing anything; then design from the user inward, starting with the application layer (what decision does someone make, in which screen), then the data and ETL layer that feeds it, and only then a model or weighted heuristic if the use case needs one. Propose a thin first slice you can show in a week, name the risks, and say what you would measure. "Improve traffic" is not a goal until it becomes something like "reduce median commute time on the top five corridors during peak hours".

### 1. Ask first (about 10 minutes)

- **Who is the customer and who uses it?** A traffic-operations center, city planners, commuters, or emergency services each want different things.
- **What decision should improve?** Signal timing, incident response, road works scheduling, public information.
- **What does "better" mean, and how is it measured today?** Pick one primary KPI (median travel time on named corridors, intersection delay, incident clearance time) and one or two guardrails (safety, emissions, fairness across neighborhoods).
- **What data exists?** Sensors, GPS probes, signal logs, incident reports; frequency, history, quality, who owns it, access and privacy limits.
- **Constraints:** budget, timeline, what the city can actually change, legal limits on tracking individuals.

Restate it: "So the goal is to cut peak-hour delay on these corridors by giving operators earlier warning and a recommendation for signal changes. Is that right?"

### 2. Design from the user inward

1. **Application layer.** The first screen an operator would use: a live corridor map with congestion, incidents, and a recommended action. Define the main user flows and the API they need.
2. **Data and ETL.** Ingest sensor and GPS feeds, validate and clean (missing sensors, duplicates, time zones), store raw and curated tables, and define a handful of entities (road segment, sensor, incident). Batch first, streaming only where the decision needs it.
3. **Intelligence.** Start with simple, explainable baselines (historical averages by time and weather, thresholds) before a forecasting model. Add ML only if the baseline misses the KPI, and show how you would evaluate it offline and then in a pilot.

```text
Sensors / GPS / incidents  ->  ingest + validate  ->  curated tables  ->  baseline + model
                                                              |                    |
                                              operator dashboard <---- recommendations
```

### 3. A thin first slice

"In one week: one corridor, last 12 months of data, a dashboard showing delay by hour, and a ranked list of the worst intersections. In a month: a forecast and signal-timing suggestions for that corridor, reviewed by an engineer before anything changes." Then measure against the KPI with a before-and-after or a comparison corridor.

### 4. Risks to name

Data gaps and bias (sensors only on major roads), privacy of location data, operators not trusting black-box advice, changes that shift congestion elsewhere, and measuring causality honestly (seasonality, roadworks).

### Pitfalls

Starting with a model; designing without a user; promising a number before seeing the data; ignoring privacy; treating it as a textbook system-design question with load numbers and databases rather than a scoping conversation.

Reported in prep-site and candidate write-ups such as the [Aced FDE interview guide](https://www.aced.io/blog/forward-deployed-engineer-interview-the-definitive-2026-guide-fde) and a [Databricks FDE candidate experience](https://www.aced.io/experiences/databricks-forward-deployed-engineer-interview-51f23a). Wording and attribution are second-hand.

## Applied coding round: turn messy files into clean data with an LLM call, and survive bad output
<!--
id: fde-coding-llm-pipeline
level: senior
tags: fde, coding, python, llm, structured output, validation, retries, csv, data cleaning
minutes: 35
-->

> [!PROMPT]
> You are given a folder of messy CSV exports (inconsistent quoting, missing columns) and free-text notes. Build a small pipeline that parses them, asks an LLM API to extract structured fields from each note, and writes clean output. The model sometimes returns malformed or wrong JSON. How do you build it, and what would you say about reliability?
>
> **Cover**
> - Parsing and normalizing the input.
> - Calling the model and validating the output.
> - Retries, idempotency and cost control.
> - How you would evaluate extraction quality.

> [!TLDR]
> Reported FDE coding rounds at applied-AI startups look like this: a live Python task where you parse messy files, call an LLM, and handle malformed output, judged on whether it runs and how you handle edge cases. Separate the pipeline into stages with clear contracts: tolerant parsing, a prompt that asks for a strict schema, validation of every response (schema, types, allowed values), a bounded retry with feedback on failure, a place to put records that still fail, and an idempotent write so a rerun does not duplicate work. Then talk about evaluation: a labeled sample, field-level accuracy, and a human review queue for low-confidence records.

### Sketch

```python
import csv, json, time
from dataclasses import dataclass

@dataclass
class Extracted:
    customer: str
    amount_cents: int
    category: str            # must be one of ALLOWED

ALLOWED = {"refund", "billing", "bug", "other"}

def parse_rows(path):
    with open(path, newline="", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, start=2):
            yield i, {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}

def validate(raw: str) -> Extracted:
    data = json.loads(raw)                                  # may raise ValueError
    cat = data["category"]
    if cat not in ALLOWED:
        raise ValueError(f"bad category {cat!r}")
    return Extracted(str(data["customer"]), int(data["amount_cents"]), cat)

def extract(note: str, call_llm, attempts=3) -> Extracted | None:
    prompt = f"Return JSON with customer, amount_cents, category in {sorted(ALLOWED)}.\nNote: {note}"
    last_error = ""
    for n in range(attempts):
        raw = call_llm(prompt + (f"\nYour previous answer was invalid: {last_error}" if last_error else ""))
        try:
            return validate(raw)
        except (ValueError, KeyError, TypeError) as e:
            last_error = str(e)
            time.sleep(0.5 * 2 ** n)                        # backoff; see the API question
    return None                                             # route to a review file, do not guess
```

### What to say out loud

- **Parsing:** never trust the file: handle encodings, BOMs, extra whitespace, missing columns, and keep the source row number so errors are traceable.
- **Structured output:** use the provider's JSON or tool-calling mode where available, and still validate; models can return plausible but wrong values.
- **Failures:** keep a separate `rejected.jsonl` with the row, the raw response and the error. Never silently drop or invent data.
- **Idempotency:** key results by a stable id (file and row, or a content hash) so reruns skip finished records.
- **Cost and speed:** batch or run with bounded concurrency, cache by content hash, truncate long notes sensibly, and log token usage.
- **Privacy:** check whether the data may leave the customer's environment before calling a hosted model.

### Evaluation

Label 50 to 100 records by hand, measure field-level accuracy and the rejection rate, sample outputs weekly, and route low-confidence records to a human. Report numbers, not impressions.

### Pitfalls

Parsing with `split(",")`; assuming the model returns valid JSON; retrying forever; writing partial results with no way to resume; no way to tell the customer how accurate it is.

Described in an article on [how applied-AI companies hire forward deployed engineers](https://www.techinterview.org/post/3233477242/how-distyl-ai-hires-forward-deployed-engineers/); details vary by company.

## Coding round: fetch every page of a flaky API, with retries, backoff, rate limits and a limiter of your own
<!--
id: fde-coding-flaky-api-backoff-rate-limiter
level: senior
tags: fde, coding, rest api, pagination, retries, exponential backoff, jitter, rate limiter, idempotency
minutes: 35
-->

> [!PROMPT]
> Fetch all records from a paginated REST API that sometimes returns 429 or 5xx. Then implement a rate limiter that supports a per-user limit and a global limit. Explain your choices.
>
> **Cover**
> - Pagination styles and how you know you are done.
> - Which errors to retry and how to back off.
> - Token bucket versus sliding window.
> - Testing it without a real server.

> [!TLDR]
> Pagination and retries appear again and again in reported FDE coding rounds (a paginated fetch for Palantir, backoff with jitter and a per-user plus global rate limiter in prep guides that attribute the limiter to Anthropic). Page until the server says there is no next page (a cursor, a `next` link, or a page count), never by guessing sizes. Retry only transient failures (429, 502, 503, 504, timeouts, connection resets), honor `Retry-After`, back off exponentially with random jitter and a cap, and stop after a bounded number of attempts. For the limiter, a token bucket per key gives smooth limits with bursts; check the per-user bucket and the global bucket together and only consume tokens when both allow the request.

### Fetch all pages with retries

```python
import random, time
import requests

RETRYABLE = {429, 500, 502, 503, 504}

def get_with_retry(session, url, params=None, attempts=5):
    for n in range(attempts):
        try:
            r = session.get(url, params=params, timeout=10)
        except (requests.ConnectionError, requests.Timeout):
            r = None
        if r is not None and r.status_code not in RETRYABLE:
            r.raise_for_status()                       # 4xx like 404 or 401 are not retried
            return r.json()
        if n == attempts - 1:
            raise RuntimeError(f"giving up on {url}")
        retry_after = r.headers.get("Retry-After") if r is not None else None
        delay = float(retry_after) if retry_after and retry_after.isdigit() else min(30, 0.5 * 2 ** n)
        time.sleep(delay * random.uniform(0.5, 1.0))   # jitter spreads retries out

def fetch_all(session, base):
    url, params = f"{base}/items", {"limit": 100}
    while True:
        page = get_with_retry(session, url, params)
        yield from page["items"]
        cursor = page.get("next_cursor")
        if not cursor:
            return
        params = {"limit": 100, "cursor": cursor}
```

Discuss: cursor versus offset pagination (offsets can skip or repeat rows when data changes), de-duplicating by id, saving the cursor so a crash can resume, and making writes idempotent if retries could repeat them (use an idempotency key).

### A token-bucket limiter, per user and global

```python
import time

class Bucket:
    def __init__(self, rate, capacity, now=time.monotonic):
        self.rate, self.capacity, self.now = rate, capacity, now
        self.tokens, self.updated = capacity, now()

    def _refill(self):
        t = self.now()
        self.tokens = min(self.capacity, self.tokens + (t - self.updated) * self.rate)
        self.updated = t

    def can_take(self):
        self._refill()
        return self.tokens >= 1

    def take(self):
        self.tokens -= 1

class Limiter:
    def __init__(self, per_user_rate, per_user_burst, global_rate, global_burst):
        self.users, self.cfg = {}, (per_user_rate, per_user_burst)
        self.global_bucket = Bucket(global_rate, global_burst)

    def allow(self, user):
        bucket = self.users.setdefault(user, Bucket(*self.cfg))
        if bucket.can_take() and self.global_bucket.can_take():
            bucket.take(); self.global_bucket.take()   # consume only when both allow
            return True
        return False
```

- **Why token bucket:** allows short bursts but enforces an average rate; a fixed window allows double bursts at window edges; a sliding window is more exact but costs more memory.
- **Concurrency:** add a lock (or use atomic operations in Redis) in a real service; run it in a shared store when there are several servers.
- **Testing:** inject the clock (as above) and a fake session so tests are instant and deterministic. Test the 429 path, `Retry-After`, the final failure, and exhaustion of each bucket.
- **Cleanup:** evict idle user buckets so memory does not grow forever.

### Pitfalls

Retrying non-idempotent writes blindly; retry loops with no limit or no jitter (every client retries at the same moment); treating every 4xx as retryable; consuming the per-user token even when the global limit rejects.

Reported in prep guides such as the [Aced FDE guide](https://www.aced.io/blog/forward-deployed-engineer-interview-the-definitive-2026-guide-fde); company attribution is second-hand.

## The SQL screen: more than one transaction, return rates and a per-user summary
<!--
id: fde-sql-screen-group-having
level: junior
tags: fde, sql, group by, having, window functions, screen, databricks, aggregation
minutes: 15
-->

> [!PROMPT]
> Given `users(id, name)` and `transactions(id, user_id, amount, status, created_at)`, write queries to (1) find users with more than one transaction, (2) give a per-user summary with count, total and latest transaction date, and (3) find customers whose refund rate exceeded 30% last quarter. Explain how you would check your answers.

> [!TLDR]
> FDE technical screens often include a short SQL question (reported for Databricks and in prep guides). The core tools are `GROUP BY` with aggregates, `HAVING` to filter groups (versus `WHERE` to filter rows), joins that keep the rows you intend (`LEFT JOIN` when users with no transactions matter), and conditional aggregation for rates. State assumptions about duplicates, nulls and time zones, test on a tiny hand-made table, and say what index would help at scale.

### 1. Users with more than one transaction

```sql
SELECT u.id, u.name, COUNT(*) AS transactions
FROM users u
JOIN transactions t ON t.user_id = u.id
GROUP BY u.id, u.name
HAVING COUNT(*) > 1;
```

`WHERE` filters rows before grouping; `HAVING` filters groups after aggregation.

### 2. Per-user summary, including users with none

```sql
SELECT u.id,
       u.name,
       COUNT(t.id)                        AS transactions,
       COALESCE(SUM(t.amount), 0)         AS total_amount,
       MAX(t.created_at)                  AS last_transaction_at
FROM users u
LEFT JOIN transactions t ON t.user_id = u.id
GROUP BY u.id, u.name
ORDER BY total_amount DESC;
```

`COUNT(t.id)` counts only matching rows, so users with no transactions get 0; `COUNT(*)` would report 1 for them.

### 3. Rate over a period with conditional aggregation

```sql
SELECT user_id,
       COUNT(*)                                                    AS total,
       COUNT(*) FILTER (WHERE status = 'refunded')                 AS refunded,
       COUNT(*) FILTER (WHERE status = 'refunded')::float / COUNT(*) AS refund_rate
FROM transactions
WHERE created_at >= date_trunc('quarter', now()) - interval '3 months'
  AND created_at <  date_trunc('quarter', now())
GROUP BY user_id
HAVING COUNT(*) FILTER (WHERE status = 'refunded')::float / COUNT(*) > 0.30;
```

`FILTER` is PostgreSQL syntax; the portable form is `SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END)`. Use a half-open date range (`>=` start, `<` end) so you never double count a boundary.

### A follow-up they may add: latest transaction per user

```sql
SELECT *
FROM (
  SELECT t.*, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
  FROM transactions t
) x
WHERE rn = 1;
```

### How to check

Make a five-row example by hand with a user who has none, one, and several transactions, plus a tie and a null amount, and verify each query. For large tables, an index on `(user_id, created_at)` supports the grouping and the latest-row lookup.

### Pitfalls

Using `WHERE COUNT(*) > 1`; an inner join that drops users with no rows; dividing integers (integer division gives 0); forgetting about nulls and duplicate rows.

## Regulated customer design: a private, VPC-deployed RAG system for healthcare with 50 million documents
<!--
id: fde-private-regulated-deployment
level: lead
tags: fde, system design, rag, hipaa, vpc, security, compliance, phi, audit, deployment
minutes: 35
-->

> [!PROMPT]
> A hospital network wants an assistant that answers clinicians' questions over 50 million internal documents. Patient data must not leave their cloud account, and they must comply with HIPAA. Design it, and say how you would handle the security team that has not approved production access yet.
>
> **Cover**
> - Where the model and the data live.
> - Access control, logging and data minimization.
> - Scale and quality for 50 million documents.
> - How you get approval and ship incrementally.

> [!TLDR]
> In a regulated deployment the architecture is decided by the data boundary first and quality second. Keep protected health information inside the customer's private network: run retrieval, storage and (where the contract and vendor agreements allow) model inference within their VPC or through a private endpoint under a signed business associate agreement (BAA), with encryption in transit and at rest and no vendor training on their data. Enforce the document-level permissions of the source systems at retrieval time, log every query and answer for audit, minimize what is placed in prompts, and keep a human in the loop for clinical decisions. Scale with an incremental ingestion pipeline, hybrid search and an evaluation set built with clinicians. Win the security review by bringing a threat model, a data-flow diagram and a pilot scope that starts with de-identified or low-risk content.

### The boundary decisions

| Question | Typical answer |
| --- | --- |
| Where does data live? | Customer's cloud account or on-premises; vector index and document store inside their VPC |
| Where does the model run? | A privately hosted or private-endpoint model under a BAA; no training or retention by the vendor; confirm region and logging terms |
| Who can see what? | Source-system permissions mirrored into the index; query-time filter on the user's identity and role |
| What leaves the network? | Nothing containing PHI unless contractually covered; metrics are anonymized |

Note that "HIPAA compliant" is not a property of a model; it is a combination of contracts, controls and operations. Involve the customer's compliance team early and avoid making legal claims yourself.

### Architecture

1. **Ingestion:** connectors for each source (EHR exports, PDFs, notes), incremental sync, de-duplication, document-type-aware parsing, and metadata for owner, department, patient scope and ACL.
2. **Index:** hybrid retrieval (keyword plus embeddings) over chunks with metadata; shard by tenant or department; 50 million documents means tens to hundreds of millions of chunks, so plan storage, approximate nearest-neighbor indexes and re-indexing windows.
3. **Query path:** authenticate the clinician, apply ACL filters in the retrieval query, rerank, build a prompt with citations, generate, and return sources the user can open. Refuse or say "not found" when evidence is weak.
4. **Controls:** audit log of who asked what and which documents were returned, retention limits, encryption keys managed by the customer, rate limits, and redaction of identifiers where they are not needed.
5. **Safety:** clear labeling that it is a retrieval aid, not clinical advice; no write actions in the first version.

### Quality and scale

- Build an evaluation set with clinicians: real questions, expected source documents, and "should not answer" cases. Track retrieval recall, citation accuracy and refusal quality.
- Handle stale or conflicting documents with dates and source authority in metadata.
- Measure latency and cost per query, cache common queries only within permission boundaries.

### The security review

Bring a data-flow diagram, a threat model (prompt injection through documents, permission leaks, data exfiltration, logging of PHI), a list of vendors and sub-processors, and a rollout plan. Ask what they need to approve production, propose a pilot with a small group and a limited corpus, and offer a read-only first version. Escalate blockers early and put decisions in writing.

### Pitfalls

Building the best retrieval and discovering the model endpoint is not allowed; indexing everything without carrying permissions; logging prompts that contain PHI to a third-party service; promising compliance guarantees; skipping evaluation because "clinicians will tell us".

A reported prompt in prep guides such as the [Aced FDE guide](https://www.aced.io/blog/forward-deployed-engineer-interview-the-definitive-2026-guide-fde); wording and attribution are second-hand.

## Evaluate and debug an AI agent: a 99% delivery target, and "our key metric just dropped"
<!--
id: fde-agent-evaluation-metric-drop
level: lead
tags: fde, ai agents, evaluation, metrics, observability, regression, debugging, guardrails, human in the loop
minutes: 30
-->

> [!PROMPT]
> You deploy an AI agent that reroutes shipments using ERP data, weather APIs and input from 500 warehouse managers. The customer wants a 99% on-time delivery rate. (1) How do you evaluate it before it acts on real shipments? (2) A month after launch a key metric drops. How do you diagnose it and decide what to fix first?
>
> **Cover**
> - What you measure at each level.
> - How you test before and after launch.
> - How you debug a regression.

> [!TLDR]
> Evaluate an agent on three levels: the final outcome (on-time delivery, cost, human overrides), the trajectory (did it pick the right tools, in a sensible order, with valid arguments) and each component (retrieval, extraction, the individual model calls). Before launch, replay historical situations offline, run in shadow mode next to the humans, then let it act with a human approving each change, widening autonomy as the numbers justify it. After launch, a metric drop is diagnosed by checking what changed (inputs, data, model or prompt versions, a tool or API, traffic mix), slicing by segment, reading sampled traces, and fixing the highest-impact, easiest-to-prove cause first. A 99% target is an outcome that depends on far more than the agent, so agree what share the agent can influence and set guardrails and a fallback.

### 1. Evaluate before it touches real shipments

- **Define success precisely:** on-time rate is the customer's goal, but the agent can only affect rerouting decisions. Track decision quality too: percentage of reroutes that beat the original plan, cost per reroute, and how often a manager overrides it.
- **Offline replay:** take past disruptions (weather events, delays) and have the agent propose actions; compare with what happened and with what experts would have done. Keep a fixed, versioned test set and add every production failure to it.
- **Trajectory checks:** valid tool calls, no loops, correct handling of missing data, correct escalation when uncertain.
- **Shadow mode:** run on live data but only record recommendations; measure agreement with humans and what would have changed.
- **Staged autonomy:** suggest, then act with approval, then act autonomously on low-risk categories, with limits (value, region, reversibility) and a kill switch.
- **Safety cases:** conflicting manager instructions, stale data, API outages, adversarial or malformed input.

### 2. "The metric dropped": a diagnosis routine

1. **Confirm it is real:** check the metric definition, data pipeline and time zone; compare with a control group or the pre-change baseline.
2. **List what changed:** model or prompt version, tool or API changes, data schema, new warehouses or seasonality, traffic mix, a customer process change. Roll back or disable the most recent change if the harm is serious.
3. **Slice:** by region, shipment type, warehouse, time, input source and agent version. A drop concentrated in one slice points to a specific cause.
4. **Read traces:** sample failing cases end to end. Look for wrong retrieval, a tool timeout, a misread field, a prompt that no longer fits new data.
5. **Form hypotheses and test them** against the saved evaluation set; reproduce the failure before changing anything.
6. **Prioritize** by impact times confidence divided by effort; ship the smallest safe fix, add the case to the regression set, and tell the customer what happened and what you changed.

### Observability to have from day one

Structured traces for every run (inputs, tool calls, outputs, versions), dashboards for outcome and process metrics, alerts on error and override rates, and a feedback path where managers can flag bad decisions.

### Pitfalls

Judging by demos or by the final metric alone; one overall accuracy number that hides a failing region; changing prompt and model together so you cannot tell what helped; letting the agent act with no limits; promising 99% without agreeing what the agent controls.

Prompts reported in prep guides such as the [Aced FDE guide](https://www.aced.io/blog/forward-deployed-engineer-interview-the-definitive-2026-guide-fde); attribution is second-hand.

## Diagnose a slow LLM-powered feature: from 1.5 seconds to under 100 milliseconds
<!--
id: fde-llm-latency-diagnosis
level: senior
tags: fde, latency, llm, search, caching, streaming, profiling, performance, inference
minutes: 25
-->

> [!PROMPT]
> A customer's LLM-powered search takes about 1.5 seconds per query and they want it under 100 ms. How do you find where the time goes, and what are your options? Is 100 ms always achievable with a language model in the loop?
>
> **Cover**
> - How you measure before changing anything.
> - Typical contributors to latency in an LLM pipeline.
> - Options, with their quality and cost trade-offs.

> [!TLDR]
> Break the 1.5 seconds into stages with tracing before you optimize: network, authentication, query understanding, embedding the query, vector or keyword search, reranking, the model call (time to first token plus generation time) and post-processing. Usually the generation step dominates, followed by sequential calls that could be parallel. Fix in this order: remove work (skip the model for easy queries, cache results), run independent steps in parallel, shrink what the model must do (shorter prompts, smaller or faster model, a limited output), stream results so the user sees something early, and move computation off the request path (precompute embeddings and popular answers). A full generated answer in under 100 ms is rarely realistic; a fast retrieval result in 100 ms with a streamed or deferred generated summary often is, and that conversation with the customer is part of the job.

### Measure first

Add timing per stage (distributed tracing or simple timers) and look at percentiles (p50, p95, p99), not averages. Separate cold from warm paths and measure from the user's network, not just the server.

### Where the time usually goes

| Stage | Typical issues | Options |
| --- | --- | --- |
| Query embedding and retrieval | Slow model call per query, unindexed search, large `top_k` | Cache embeddings, ANN index tuning, smaller `top_k`, keyword shortcut for exact matches |
| Reranking | Second model over many candidates | Rerank fewer, use a lighter reranker, skip for confident results |
| LLM call | Long prompt, big model, long output, no streaming | Shorter context, smaller or distilled model, cap output length, stream tokens, prompt caching where supported |
| Sequential calls | Steps run one after another | Parallelize independent calls, speculative execution |
| Infrastructure | Cold starts, far-away regions, no connection reuse | Keep warm, deploy near users, reuse connections, batch where possible |

### Options by effect

1. **Cache:** exact and semantic caches for frequent queries (respecting permissions).
2. **Skip the model:** classify queries; answer navigational or exact-match queries from the index.
3. **Return results first:** show ranked results immediately and stream a generated summary afterwards.
4. **Make the model cheaper:** smaller model, quantization, shorter outputs, fine-tuning for a narrow task.
5. **Precompute:** embed documents ahead, precompute answers for the top queries.

### Be honest about the target

Network round trips alone may use a large part of 100 ms, and generation speed is bounded by tokens per second. Ask what the 100 ms is for: perceived responsiveness (stream, show results first) or a hard backend budget. Offer a plan with expected savings per step and the quality impact of each, and measure after every change.

### Pitfalls

Optimizing the model before measuring; reporting only averages; caching without permission checks; cutting context so much that quality drops without an evaluation to notice.

Reported in prep guides such as the [Aced FDE guide](https://www.aced.io/blog/forward-deployed-engineer-interview-the-definitive-2026-guide-fde), which attributes the latency family of questions to OpenAI loops; attribution is second-hand.

## Client simulation: a three-week slip, a feature that breaks data rules, and "why can't it be 100% accurate?"
<!--
id: fde-client-simulation-hard-conversations
level: senior
tags: fde, client simulation, communication, bad news, expectation setting, governance, stakeholder management, role-play
minutes: 25
-->

> [!PROMPT]
> The interviewer plays the customer. Handle each of these in turn:
> 1. Your deployment slipped three weeks and their CTO is on the call.
> 2. A VP asks for a feature that would break their own data-governance policy.
> 3. A non-technical VP asks why the AI system cannot be guaranteed 100% accurate.
> 4. Their security team will not grant production credentials.
>
> What do you say, and what is each scenario testing?

> [!TLDR]
> These role-plays test whether you stay calm, take ownership, speak plainly and keep the customer's goals in view without caving or arguing. A reliable shape for all four: acknowledge the situation without defensiveness, state the facts and your recommendation, offer options with trade-offs, agree the next step and date, and follow up in writing. For bad news, lead with the headline, the cause, the impact and the plan. When asked for something you should not do, say no to the request and yes to the goal, offering a compliant alternative. When explaining limits, use a concrete analogy and the business consequence rather than jargon.

### 1. A three-week slip, CTO on the call

- Lead with the headline and ownership: "We will deliver three weeks later than we planned. I want to tell you why, what it means for you, and how we recover."
- Cause (brief and factual, no blame), impact on their business, and options: reduced scope now and the rest later, extra resources, or the new date.
- Say what you will change so it does not recur, and give a date for the next update. Do not hide behind jargon or surprise them with it in a meeting.

### 2. A request that breaks data governance

- Understand the goal first: "What are you trying to achieve with this?"
- Be clear about the line: "I can't build it that way because it would move personal data outside the approved boundary, and that creates risk for you."
- Offer alternatives that meet the goal: aggregated or de-identified data, an approved integration, a request through their compliance team. Offer to join that conversation.

### 3. "Why can't it be 100% accurate?"

"The system predicts likely answers from patterns and the documents we give it, so it can be wrong, like a very fast new hire who occasionally misreads a form. We reduce errors with source citations, checks, and a review step for high-risk cases, and we measure the error rate so you can decide how much to rely on it. For decisions where a mistake is expensive, a person approves the result." Then give a number from your evaluation if you have one.

### 4. Security will not grant production credentials

- Treat security as an ally, not a blocker: ask what they need to see to approve it.
- Offer least-privilege, read-only, time-limited access, a scoped service account, or a sandbox with synthetic data to continue meanwhile.
- Share a short architecture and data-flow document, ask for the review timeline, and keep the sponsor informed so the delay is visible, not blamed on you.

### What the interviewer watches

Listening before answering, ownership without groveling, clarity without condescension, saying "I don't know yet, I will find out by Thursday", and not over-promising to end an uncomfortable moment.

### Pitfalls

Blaming other teams; hiding a delay until it is unavoidable; saying yes to a risky request to please a VP; explaining model internals when the customer asked about risk.

Scenarios reported in prep guides such as the [Aced FDE guide](https://www.aced.io/blog/forward-deployed-engineer-interview-the-definitive-2026-guide-fde); wording is second-hand.
