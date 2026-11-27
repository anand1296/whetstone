---
id: leadership-behavioral
title: Leadership & Behavioral
description: The round that decides senior vs staff: a story bank, migrations, disagreement, mentoring, tech debt, technical strategy, failures and influence without authority.
facets: frontend, leadership
---

## Build your story bank: STAR(L) structure and the eight stories every senior engineer needs
<!--
id: story-bank-star
level: senior
tags: behavioral, star, storytelling, interview preparation
minutes: 15
-->

> [!PROMPT]
> You have a final-round loop in two weeks and your stories are vague. Build a story bank that can answer most behavioral questions.
>
> **Do this**
> - List 6 to 8 real stories (a failure, a conflict, a migration, mentoring, an ambiguous project, influencing without authority...).
> - Write each in STAR+L in about two minutes: the situation in two sentences, your specific actions, a result with numbers, and what you learned.
> - Practice mapping each story to several different questions.

> [!TLDR]
> Prepare 6–8 real stories, each told in **STAR + L** (Situation, Task, Action, Result, Learning) in about two minutes, with numbers and your personal decisions front and center ("I", not "we"). Map each story to several common questions so a small bank covers most prompts. The bar rises with level: senior stories show ownership of a hard technical outcome; lead/staff stories show multiplying others and cross-team influence; principal stories show setting direction for an organization.

### The eight stories

| Story | Covers questions like |
| --- | --- |
| A large technical project you drove end to end | "Most impactful work", "complex project", "ownership" |
| A migration or modernization | "Legacy code", "long-term thinking", "risk management" |
| A performance or reliability win with numbers | "Data-driven decision", "impact" |
| A disagreement you handled well | "Conflict", "pushback", "influence" |
| A failure or incident you owned | "Mistake", "failure", "what you learned" |
| Mentoring/growing someone | "Leadership", "raising the bar" |
| A trade-off under deadline pressure | "Prioritization", "ambiguity", "scope cuts" |
| Cross-team alignment | "Influence without authority", "stakeholders" |

### STAR(L) template

- **Situation (15s)**: context and stakes. "Our Cypress suite took ~60 minutes per PR and failed intermittently; merges were backing up."
- **Task (10s)**: your responsibility. "I took ownership of bringing CI under 25 minutes without losing coverage."
- **Action (60–75s)**: 3–4 specific decisions **you** made, why, and alternatives you rejected.
- **Result (15s)**: numbers and second-order effects. "~20 minutes, flake re-runs down sharply, PR throughput up."
- **Learning (10s)**: what you'd do differently or now do by default.

### Delivery tips

- Lead with the headline result if the interviewer seems impatient, then tell the story.
- Quantify: time, money, latency, error rates, team size, number of screens/services.
- Name the hard part: a constraint, a skeptic, a technical risk.
- Prepare follow-ups: "What would you do differently?", "How did you measure?", "What did others think?"
- Be honest about the team's contribution while making your own role clear.

### References

- [Amazon: Leadership principles (behavioral interview reference)](https://www.amazon.jobs/content/en/our-workplace/leadership-principles)
- [StaffEng: Guides](https://staffeng.com/guides/)

## "Tell me about a large migration you led"
<!--
id: migration-story
level: lead
tags: behavioral, migration, leadership, legacy, angularjs, react
minutes: 12
-->

> [!PROMPT]
> "Tell me about a large migration you led." The interviewer will probe your decisions, the risks you managed and the results.

> [!HINT]
> - The business case: why now, and what you chose not to do.
> - The strategy: incremental approach, tooling and guardrails, how work was split across teams.
> - A hard moment, how you handled stakeholders, and measurable results (delivery speed, defects, performance).

> [!TLDR]
> Interviewers want to hear: why the migration was worth it (business case, not just "old tech"), how you avoided a feature freeze (incremental strategy), how you made decisions (bridge architecture, prioritization), how you brought people along (patterns, docs, reviews), how you measured progress and quality, and how you finished. A strong answer has a clear arc and numbers.

### A model answer (adapt the specifics to your experience)

> **Situation.** "Parts of our cloud console were still AngularJS and Svelte, past end-of-life for AngularJS, and every feature touching those screens took longer: two UI stacks, two sets of components, and new hires didn't know AngularJS."
>
> **Task.** "I led the frontend side of moving those experiences to React without pausing the roadmap."
>
> **Action.** "First, I set up a bridge: React components could mount inside legacy pages, and our router could send migrated routes to the React app. We shared design tokens so both stacks looked the same. Second, I prioritized by change frequency and traffic, so the screens the team touched most got migrated first, and we paired migrations with planned feature work. Third, I wrote a per-screen definition of done: feature parity, analytics events, accessibility checks, E2E tests ported, performance budget. Fourth, I made progress visible: a dashboard of screens remaining and legacy bundle size. And I introduced a rule of no new code in the legacy stack."
>
> **Result.** "We migrated the planned screens over several quarters while shipping features, removed the legacy runtime from the main bundle, and feature work on those areas became noticeably faster. Defects stayed flat because of the parity checklist."
>
> **Learning.** "I'd budget the last 10% explicitly; the long tail of small screens and shared utilities is where migrations stall."

### Follow-ups to prepare

- "How did you decide what to migrate first?" (value × change frequency, risk, dependencies)
- "What went wrong?" (have one real setback: a shared state bug across stacks, a performance regression, a stalled screen)
- "How did you convince leadership?" (velocity, hiring, security/EOL risk, user-facing quality)
- "Would you do micro-frontends next time?" (depends on team count and independence needs; see the architecture round)

### References

- [Martin Fowler: Strangler Fig Application](https://martinfowler.com/bliki/StranglerFigApplication.html)

## "Tell me about a time you disagreed with a technical decision"
<!--
id: disagreement-story
level: senior
tags: behavioral, conflict, disagreement, communication, influence
minutes: 10
-->

> [!PROMPT]
> "Tell me about a time you disagreed with a technical decision." They are looking for judgment and collaboration, not for a story where you were simply right.

> [!HINT]
> - The decision, the other person's reasoning and the constraints you didn't see at first.
> - How you raised the disagreement (evidence, a prototype, a written proposal) and what you committed to.
> - The outcome, including if you were wrong or if you changed your mind, and what you'd do differently.

> [!TLDR]
> Show that you disagree **with evidence and respect**, separate the decision from the person, seek to understand the other side's constraints, propose a way to decide (data, prototype, time-boxed experiment, clear criteria), and **commit** once a decision is made even if it isn't yours. The best stories end with a better outcome or with you being visibly gracious about being wrong.

### Structure

1. **The decision and why it mattered** (stakes: performance, maintainability, timeline).
2. **Your concern** in concrete terms, not taste.
3. **How you engaged**: 1:1 first, asked questions, wrote a short comparison doc with criteria, built a small prototype or benchmark.
4. **The resolution**: agreed criteria, decision owner decided, you committed.
5. **Outcome and learning.**

### Example outline

> "A teammate proposed adding a global Redux slice for all server data in a new feature. I was concerned we'd re-implement caching, invalidation and loading states we already got from React Query, and that stale data bugs would follow. Rather than argue in the PR, I asked what they needed from Redux: it was cross-component access and devtools visibility. I put together a short comparison and a prototype showing the same screen with React Query and its devtools, plus how we'd share data via query keys. We agreed on criteria (fewer moving parts, consistent with the rest of the app, testability) and went with React Query. Where I was wrong: there was a genuine piece of client-only workflow state, so we kept a small Zustand store for it."

### Pitfalls

- Stories where you were simply right and others were wrong (sounds like low collaboration).
- Escalating before talking directly.
- No commitment after the decision ("I still think...").

### References

- [Amazon: Have backbone; disagree and commit](https://www.amazon.jobs/content/en/our-workplace/leadership-principles)

## How do you mentor engineers and raise the bar of a team?
<!--
id: mentoring-raising-the-bar
level: lead
tags: behavioral, mentoring, leadership, code review, team growth
minutes: 10
-->

> [!PROMPT]
> "How do you mentor engineers and raise the bar of a team?" Give an answer grounded in specific examples, not a philosophy.

> [!HINT]
> - How you tailor mentoring to a person (goals, gaps, stretch assignments) with a concrete story.
> - Mechanisms that raise the bar: code review culture, design reviews, standards, hiring.
> - How you measure growth, handle underperformance and avoid becoming the bottleneck.

> [!TLDR]
> Mentoring is tailored: understand the person's goals and gaps, give them stretch work with a safety net, and give specific, timely feedback. Raising the bar is systemic: code review norms that teach (explain the "why", link to docs), written patterns and RFCs, pairing on hard problems, incident reviews without blame, and making quality visible (tests, performance budgets, accessibility checks in CI). Measure success by what others can do without you.

### Practices to mention

- **Stretch assignments**: give someone the lead on a feature slightly beyond them; meet weekly; let them present it.
- **Code review as teaching**: label comments (`nit:`, `suggestion:`, `blocking:`), explain reasoning, praise good decisions, and turn repeated comments into docs or lint rules.
- **Pairing/mobbing** on unfamiliar areas (performance profiling, a tricky migration).
- **Design reviews/RFCs** for non-trivial changes, so juniors learn to write and defend decisions.
- **Learning in public**: short internal talks, demos of tools (profiling, debugging).
- **Career conversations**: help them articulate their next level and find work that demonstrates it.

### A short example

> "A newer engineer struggled with flaky tests and avoided them. I paired on two failures to show the debugging approach, then had them own a small flake-reduction project with a dashboard. They wrote our guide on writing stable E2E tests and later led the CI optimization work."

### References

- [Lara Hogan: Mentors, coaches and sponsors](https://larahogan.me/blog/what-sponsorship-looks-like/)
- [Google: Code review developer guide](https://google.github.io/eng-practices/review/)

## How do you get tech debt prioritized against feature work?
<!--
id: tech-debt-prioritization
level: lead
tags: behavioral, tech debt, prioritization, stakeholders, roadmap
minutes: 12
-->

> [!PROMPT]
> Product says there's no room for tech debt this quarter. You believe a slow build and brittle tests are costing the team a day a week. How do you get it prioritized?

> [!HINT]
> - Quantifying the cost (delivery speed, incidents, onboarding) and linking it to business goals.
> - Options: a dedicated percentage, bundling with features, incremental refactoring, a one-off project with milestones.
> - How you communicate and negotiate, and what you do when the answer is still no.

> [!TLDR]
> Translate debt into **business impact** (slower delivery, incidents, performance, hiring, security risk), quantify it where possible, and attach it to the roadmap instead of competing with it. Use a mix of mechanisms: fix-as-you-go on code you touch, a standing capacity allocation (e.g. 15–20%), and dedicated projects for large debt with a clear payoff. Track outcomes so the next ask is easier.

### Making the case

| Debt | Impact framing | Metric |
| --- | --- | --- |
| Slow, flaky CI | Engineering hours lost, slower releases | CI duration, re-run rate, PR lead time |
| Legacy framework | Feature lead time, hiring, EOL security | Cycle time on affected areas |
| No tests in billing | Incident risk on revenue | Incidents/regressions per quarter |
| Bundle bloat | Conversion/engagement via Web Vitals | LCP/INP per route, bytes |

### Mechanisms

- **Boy-scout rule** with guardrails (small, safe improvements in the PRs that touch the code).
- **Debt register** with owner, impact, effort and a rough priority, reviewed with product each quarter.
- **Bundling**: "We're building the new invoices flow; migrating that area adds 20% and halves future changes there."
- **Error budgets/SLOs**: if reliability falls below target, prioritization shifts automatically.

### Example

> "Our PR CI took about an hour, so engineers batched changes and context-switched. I measured the cost (re-runs, waiting time across the team) and proposed a focused effort with a target. Leadership agreed because the payback was obvious; we hit ~20 minutes, and I reported the before/after numbers, which made the next infrastructure request easy."

### References

- [Martin Fowler: Technical debt quadrant](https://martinfowler.com/bliki/TechnicalDebtQuadrant.html)
- [Google SRE: Embracing risk (error budgets)](https://sre.google/sre-book/embracing-risk/)

## Write and drive a technical strategy or RFC across teams
<!--
id: technical-strategy-rfc
level: principal
tags: behavioral, rfc, technical strategy, architecture, principal engineer, writing
minutes: 15
-->

> [!PROMPT]
> You are asked to write an RFC proposing a company-wide frontend platform change (for example, a shared design system and framework upgrade) that affects ten teams.

> [!HINT]
> - The structure: problem with evidence, goals and non-goals, options with trade-offs, recommendation, rollout and migration, risks.
> - How you get early feedback, build consensus and handle objections.
> - Decision records, ownership after approval, and how you measure success.

> [!TLDR]
> A good RFC states the problem with evidence, the goals and non-goals, options with honest trade-offs, a recommendation, and a rollout and migration plan with success metrics. Driving it means pre-wiring stakeholders before the review, inviting criticism early, deciding with a clear owner and deadline, and following through with tooling and examples so adoption is easy. Strategy documents go one level up: diagnose the situation, set guiding policies, and define coherent actions over quarters.

### RFC outline

```text
1. Context and problem         (evidence: incidents, metrics, developer survey)
2. Goals / non-goals
3. Proposal                    (architecture, APIs, examples)
4. Alternatives considered     (and why not)
5. Trade-offs and risks        (what gets worse; mitigation)
6. Rollout and migration       (phases, codemods, deprecation timeline, owners)
7. Success metrics             (how we'll know it worked; when we'll check)
8. Open questions
```

### Driving adoption

- **Pre-wire**: share drafts 1:1 with the most affected and most skeptical people; incorporate feedback before the meeting.
- **Decide explicitly**: who decides, by when; record the decision (ADR) with dissent noted.
- **Make the right path easy**: templates, generators, codemods, lint rules, docs with copy-paste examples.
- **Pilot** with one team, publish results, then expand.
- **Follow up** on metrics and revisit if assumptions were wrong.

### Example topics at principal scope

Standardizing data fetching across 12 frontend teams; a rendering-architecture shift (SPA → SSR/RSC) for SEO surfaces; introducing a shared design system with a deprecation plan for three legacy libraries; defining frontend SLOs and on-call.

### References

- [Will Larson: Writing engineering strategy](https://lethain.com/eng-strategies/)
- [Architecture decision records](https://adr.github.io/)

## "Tell me about a failure or production incident you owned"
<!--
id: failure-incident-story
level: senior
tags: behavioral, failure, incidents, postmortem, ownership
minutes: 10
-->

> [!PROMPT]
> "Tell me about a failure or production incident you owned." Interviewers listen for ownership, calm under pressure and what changed afterwards.

> [!HINT]
> - What happened and your role, without blaming others.
> - Detection, mitigation and communication during the incident; the root cause found afterwards.
> - The follow-up changes (tests, monitoring, process) and how you know they worked.

> [!TLDR]
> Pick a real failure with real consequences, own your part without excuses, and spend most of the time on **what you did next**: how you mitigated, how you found the root cause, what systemic fixes you put in place, and what you changed in how you work. Show calm under pressure and a blameless mindset. Avoid fake failures ("I work too hard").

### Structure

1. **What happened** and the impact (users affected, duration).
2. **Your role** in causing or missing it.
3. **Mitigation**: rollback, feature flag off, communication to stakeholders.
4. **Root cause** (the real one, often a process gap, not just a typo).
5. **Systemic fixes**: tests, alerts, guardrails, runbooks.
6. **What changed in you**.

### Example outline

> "I shipped a change to our data-table component that memoized row rendering. It passed tests, but in production a filter combination showed stale rows to some customers for about an hour. I rolled back via our feature flag as soon as the error reports came in, posted in the incident channel, and wrote the postmortem. The root cause was a memo comparison that ignored a nested filter prop, and our tests didn't cover that combination. We added interaction tests for filter combinations, a lint rule against shallow-comparing that prop shape, and per-release error-rate alerts. Since then I add a rollout flag and a specific production check for any change to shared components."

### References

- [Google SRE: Postmortem culture](https://sre.google/sre-book/postmortem-culture/)
- [Atlassian: Blameless postmortems](https://www.atlassian.com/incident-management/postmortem/blameless)

## Influence without authority: aligning several teams on a frontend platform change
<!--
id: influence-without-authority
level: principal
tags: behavioral, influence, stakeholders, cross-team, platform, principal engineer
minutes: 12
-->

> [!PROMPT]
> You want ten teams to adopt a new frontend platform (build tooling, design system and lint rules) and none of them report to you. How do you get alignment and adoption?

> [!HINT]
> - Understanding each team's goals and pain, and positioning the change in their interest.
> - Tactics: pilots with a friendly team, data, champions, migration tooling, a clear support path.
> - Handling resistance and escalation, and measuring adoption honestly.

> [!TLDR]
> You can't order other teams to adopt your change, so make it **in their interest**: understand each team's goals and pain, show how the change helps them (with data and a working prototype), lower the cost of adoption to near zero (migrations, codemods, pairing), find early adopters and make them successful and visible, and use the organization's existing mechanisms (architecture reviews, OKRs, platform roadmaps) to make the decision durable. Give credit away generously.

### A playbook

1. **Listen first**: interview teams about their pain; the problem statement should use their words.
2. **Evidence**: incidents, metrics, survey results that show the cost of the status quo.
3. **Prototype**: a working slice in a real product area beats a slide deck.
4. **Early adopter**: one respected team adopts with your hands-on help; publish the before/after.
5. **Make it cheap**: codemods, templates, documentation, office hours, migration pairing.
6. **Formalize**: RFC/ADR, add to platform roadmap and team OKRs, set a deprecation timeline for the old way.
7. **Measure and report**: adoption percentage, outcomes, and thank the teams publicly.

### Example

> "Five teams each had their own way of fetching data, leading to inconsistent loading/error states and duplicate requests. I interviewed the teams, measured duplicate request rates and bugs linked to stale data, and built a shared data-client package with React Query conventions and generated typed hooks. One team adopted it for a new feature with my help; their bug count on that surface dropped and they presented it at our frontend guild. With that evidence, the RFC passed, we added a codemod for common patterns, and adoption reached most product areas within two quarters."

### References

- [Tanya Reilly: The Staff Engineer's Path (O'Reilly)](https://www.oreilly.com/library/view/the-staff-engineers/9781098118723/)
- [StaffEng: Staff archetypes](https://staffeng.com/guides/staff-archetypes/)

## "Tell me about yourself": a two-minute structure for a strong opening answer
<!--
id: leadership-tell-me-about-yourself
level: junior
tags: behavioral, introduction, storytelling, communication, interview basics
minutes: 6
-->

> [!PROMPT]
> The interview starts with "Tell me about yourself." Give a two-minute answer, and explain why this question matters more than it seems.

> [!TLDR]
> Use a present-past-future structure in about two minutes: who you are now (role, scope, strengths), the one or two experiences that prove it (with results), and why this role is the logical next step. Tailor it to the job description, lead with your most relevant achievement, and avoid reciting your CV or personal history. The question sets the agenda for follow-ups, so seed it with topics you want to discuss (a migration you led, a performance win) and end with a clear link to the role.

### Template

1. **Present (30 s):** "I'm a frontend engineer with six years of experience, currently owning the design system at X, used by 12 teams."
2. **Past (60 s):** two proof points with impact: "I led the AngularJS to React migration (200 screens in 14 months, no rewrite freeze) and cut CI time from 60 to 20 minutes."
3. **Future (30 s):** "I'm looking for a role with larger architectural scope, which is why this platform team is exciting."

### Tips

- Prepare 60-second and 3-minute versions.
- Use numbers and outcomes, not responsibilities.
- Sound natural: bullet points in notes, not a memorized script.
- Match the audience: engineers want technical depth; a hiring manager wants scope and impact.

### Mistakes

Starting from childhood or listing every job; being vague ("I like solving problems"); ending without connecting to the role; negativity about past employers.

## Estimate, negotiate scope and communicate a slipping deadline
<!--
id: leadership-estimates-slipping-deadlines
level: senior
tags: behavioral, estimation, scope, deadlines, communication, stakeholders, risk
minutes: 15
-->

> [!PROMPT]
> A project you own is going to miss its date by three weeks, and the VP is counting on it. How do you estimate in the first place, how do you notice slippage early, and what exactly do you say and do when it happens?

> [!TLDR]
> Estimate with ranges and explicit assumptions, break work into milestones that deliver value early, track risk weekly, and escalate when a milestone slips rather than at the deadline. When a date is at risk, tell stakeholders immediately with facts: current status, the reason, a revised range, and options (cut scope, add help, move the date, accept a risk), with your recommendation and what you need from them. Never hide it or promise heroics. Afterwards, review what the estimate missed so the next one improves.

### Estimating well

- Give a range and confidence ("3-5 weeks, likely 4, assuming the API is ready by week 1").
- Decompose until tasks are days, not weeks; add explicit buffer for integration and review.
- Identify the riskiest assumption and test it first (a spike).
- Re-forecast with actual velocity, not hope.

### The message

> "We will not hit March 3. The payments API changes took longer than planned and testing found two edge cases. Realistic new range: March 17-24. Options: (1) ship without saved cards on March 3 and add them later, (2) move the date, (3) add one engineer, which I expect to save about a week at some ramp-up cost. I recommend option 1. I need a decision by Friday."

### Principles

1. **Early and specific beats late and perfect.**
2. **Offer options with trade-offs**, not just bad news.
3. **Protect quality:** do not silently cut testing or accessibility.
4. **Keep a risk log** and review it in standups.
5. **Learn:** note whether the cause was scope growth, dependency delay or estimation error.

### Pitfalls

Single-point estimates, waiting until the last week to speak, blaming other teams, and treating every date as immovable without discussing scope.

## How do you use AI in your day-to-day development workflow, and where do you not?
<!--
id: ai-in-daily-development-workflow
level: senior
tags: ai, workflow, code assistants, productivity, code review, guardrails
minutes: 15
-->

> [!PROMPT]
> How do you leverage AI in your day-to-day development workflow? Give concrete examples, and say where you do not use it and how you check its output.

> [!HINT]
> - Name specific tasks, not "it makes me faster".
> - What do you hand over, and what do you keep?
> - What is your safety net: tests, review, a checklist?

> [!TLDR]
> A strong answer is specific and honest about limits. Use AI where the cost of being wrong is low and checking is cheap: exploring unfamiliar code, drafting boilerplate and tests, explaining errors, refactors with a clear before and after, writing docs and commit messages, and first-pass code review. Keep for yourself the decisions that need context and judgment: architecture, trade-offs, security-sensitive code, and anything you could not explain afterwards. Treat output as an untrusted draft written by a fast junior: give it context and constraints, ask for small steps, and verify with tests, types, lint and your own review, never by trusting the text. Mention data hygiene (no secrets or customer data in prompts, the company's policy) and that you remain accountable for everything you merge.

### A structure for the answer

1. **Where it helps me (with examples):** reading a new codebase ("where is X handled?"), scaffolding a component and its tests, converting a callback API to promises, writing a regex or a SQL query and then testing it, explaining a stack trace, summarising a pull request.
2. **How I use it:** small, specific tasks; I give the relevant files, the conventions and the acceptance criteria; I ask for a plan before code on anything non-trivial.
3. **How I verify:** run the tests and type-check, read every line as if a colleague wrote it, try edge cases, check that referenced APIs and packages exist, and look at the diff for unrelated changes.
4. **Where I do not use it:** security-sensitive logic without a careful review, anything I cannot explain, decisions that depend on team or business context, and pasting secrets or customer data.
5. **What it changed:** one honest outcome, for example "tests for legacy code that nobody wrote, and a measurable drop in the time to a first draft", and one limit you hit.

### A guardrail you can describe (and run)

A script on the diff that flags the things AI-written changes most often get wrong:

```ts
function reviewFlags(diffs: { path: string; added: string[]; removed: string[] }[]): string[] {
  const flags: string[] = [];
  for (const d of diffs) {
    const isTest = /(\.test\.|\.spec\.|__tests__)/.test(d.path);
    if (isTest && d.removed.length > d.added.length) flags.push(`${d.path}: tests shrank`);
    if (isTest && d.added.some((l) => /\b(it|test|describe)\.skip\b|\.only\(/.test(l))) flags.push(`${d.path}: skipped or focused test`);
    if (/package(-lock)?\.json$/.test(d.path)) flags.push(`${d.path}: dependency change, check the packages are real and needed`);
    if (d.added.some((l) => /(api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{12,}['"]/i.test(l))) flags.push(`${d.path}: possible secret`);
    if (d.added.some((l) => /@ts-ignore|eslint-disable|as any\b/.test(l))) flags.push(`${d.path}: type or lint escape hatch`);
  }
  return flags;
}
```

I ran it on a sample diff with a deleted-and-skipped test, a new dependency, a hard-coded key and an `as any`: it raised five flags and none on a clean change. It is a prompt for human attention, not a replacement for review.

### Habits worth naming

- **Context first:** a short description of conventions and the surrounding files, not a bare request.
- **Plan, then small steps:** review each step instead of one giant generation.
- **Tests as the contract:** write or review the tests first; let the assistant make them pass.
- **Hallucination checks:** open the docs for any API or option it mentions; run the code.
- **Own the result:** "the model wrote it" is never a defence in review or an incident.
- **Team norms:** disclose significant AI-generated parts in a pull request when your team expects that, and follow the licence and data policy.

### Pitfalls interviewers probe

- **Over-trust:** accepting plausible but wrong code (invented APIs, subtle off-by-one, outdated patterns).
- **Skill atrophy:** keep doing some hard problems yourself.
- **Review load:** AI makes code cheaper to write and not cheaper to review; keep changes small.
- **Sensitive data:** be able to say what you never paste.

### References

- [GitHub: Responsible use of Copilot](https://docs.github.com/en/copilot/responsible-use)
- [Anthropic: Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices)

Appears in an interview write-up shared online (second-hand; source unverified). The guidance is my own; the guardrail script was run on a sample diff.

## What is your role in AI-assisted software development: planning, validation and technical decision-making
<!--
id: ai-assisted-development-role
level: lead
tags: ai, planning, validation, decision making, engineering judgment, tests, ownership
minutes: 15
-->

> [!PROMPT]
> What is your role in AI-assisted software development? Explain how you handle planning, validation and technical decision-making when an AI tool writes much of the code.

> [!HINT]
> - What stays human when generation is cheap?
> - How do you turn requirements into something a tool can implement and you can check?
> - What does "validated" mean beyond "it runs"?

> [!TLDR]
> When generating code gets cheap, the engineer's value shifts to deciding what to build and proving it is right. In planning, I turn the problem into constraints, acceptance criteria and a small-step plan the tool can follow, and make the design decisions (boundaries, data model, trade-offs) myself, recording them. In validation, I define correctness before generation (tests, types, examples, performance and security checks), run everything automatically, and review the diff as a skeptic. In decision-making, I use AI to widen the options and find holes, but I choose, explain and own the trade-off, because I carry the pager. I remain accountable for quality, security and maintainability of everything merged.

### Planning: specify before you generate

- Write the **goal, constraints and non-goals** (framework, browser support, accessibility, performance budget, what must not change).
- List **acceptance criteria as examples** ("`$1,234.50` becomes `123450`; `1.005` is rejected").
- Ask the tool for a **plan or options first**, challenge it, then implement in small, reviewable steps.
- Make the **architecture decisions** yourself: module boundaries, state ownership, API shape, dependencies. Record them (a short ADR) so the next person, and the next prompt, has the reasoning.

### Validation: define "right" first

Tests written from the spec are the contract; the generated code has to satisfy them.

```ts
const toCents = (s: string): number => {
  const m = /^\$?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$/.exec(s.trim());
  if (!m) throw new Error(`invalid price: ${s}`);
  return Number(m[1].replace(/,/g, '')) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0);
};

toCents('$1,234.50'); // 123450
toCents('0.1');       // 10
toCents('1.005');     // throws: three decimals are not a price

// A tempting generated version passes the first three cases and quietly accepts the fourth:
const naive = (s: string) => Math.round(parseFloat(s.replace(/[$,]/g, '')) * 100);
naive('1.005');       // 100 (rounded silently)
```

I ran both: the strict version met all cases, and the naive one returned `100` for `1.005`. A spec case written by a human caught what a plausible implementation missed.

Layers of validation:

1. **Automated:** unit and integration tests, types, lint, accessibility checks, bundle size and performance budgets in CI.
2. **Review:** read the diff for logic, edge cases, unrelated changes, new dependencies, secrets and security (injection, authorisation, unsafe rendering).
3. **Behavioural:** run it, try the failure paths, and check it in the real environment.
4. **Operational:** feature flags, canary release, monitoring and a rollback plan, because passing tests do not prove production behaviour.

### Technical decisions

- Use AI as a **sparring partner**: "list three designs and their failure modes", "what would break at 10x load?".
- Decide using **context the tool lacks:** team skills, deadlines, existing systems, cost, compliance, and what you are willing to operate.
- **Say no** to generated complexity: a smaller design you understand beats a clever one nobody can maintain.
- **Document why,** including the options rejected.

### What stays with me, always

Accountability for correctness and security, the user impact, the on-call burden, mentoring the team on how to use the tools well, and the standard of what gets merged. At lead level, also the **team practices**: shared prompts and conventions, review expectations for generated code, a data policy, and metrics that show whether AI is actually improving delivery and quality.

### Follow-ups

- **"What would make you reject AI-generated code?"** Not understood by the author, no tests, new dependency without a reason, security smell, or it fights the existing architecture.
- **"How do you measure the benefit?"** Cycle time, review time, escaped defects and incident rate, not lines generated.

### References

- [Martin Fowler: Architecture Decision Records](https://martinfowler.com/bliki/ArchitectureDecisionRecord.html)
- [OWASP: Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)

Appears in an interview write-up shared online (second-hand; source unverified). The explanation is my own; both price parsers were run against the example cases.

## How would you use AI to investigate and troubleshoot a production incident?
<!--
id: ai-incident-investigation
level: lead
tags: ai, incidents, troubleshooting, observability, privacy, root cause, runbooks
minutes: 15
-->

> [!PROMPT]
> How would you leverage AI to investigate and troubleshoot a production incident? What would you give it, what would you not, and how do you avoid being misled?

> [!HINT]
> - Where is AI strong in an incident (summarising, correlating, drafting queries) and where weak (knowing your system)?
> - What data must be redacted before it leaves your environment?
> - Who decides what is the root cause, and how do you verify?

> [!TLDR]
> During an incident, AI is a fast assistant for reading and correlating large amounts of text, not an authority on your system. I would give it a compact, redacted brief: the symptom and start time, recent deploys and config changes, the top error groups with counts and release, and a short log excerpt, and ask it for ranked hypotheses, the evidence that would confirm or reject each, and queries or commands to check them. I stay in control: humans run the commands, verify hypotheses against real telemetry, make the mitigation call (roll back first, understand later), and write the conclusion. I never paste secrets or customer data, and I treat its answers as leads to test, because it can be confidently wrong.

### What AI is good at in an incident

- **Summarising** noisy logs, stack traces and error groups into patterns.
- **Correlating** the start time with deploys, flag changes, dependency upgrades and traffic shifts.
- **Drafting** log queries, dashboards queries and `git log` filters, and explaining unfamiliar errors or libraries.
- **Reasoning about browsers:** "this `TypeError` only on Safari after a date library upgrade" is the type of lead it can suggest.
- **Communication:** a status update, a timeline, and a first draft of the post-incident review.

### What I would not do

- Paste tokens, cookies, customer data or full request bodies.
- Let it run commands or change production without a human approving each step.
- Accept a root cause because it sounds right.
- Use it instead of the runbook, the on-call and the rollback.

### Building a safe brief (and testing it)

```ts
function redact(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>')
    .replace(/\b(Bearer|token=|api_key=)\s*[A-Za-z0-9._\-]{8,}/gi, '$1 <redacted>')
    .replace(/\b\d{12,19}\b/g, '<number>');
}

function buildBrief(i: { symptom: string; started: string; deploys: Deploy[]; errors: ErrorGroup[]; logs: string[] }): string {
  const recent = i.deploys.filter((d) => d.at <= i.started).slice(-3);          // only changes before the start
  const top = [...i.errors].sort((a, b) => b.count - a.count).slice(0, 5);
  return [
    `Symptom: ${i.symptom}`,
    `Started: ${i.started}`,
    'Recent deploys before start:', ...recent.map((d) => `- ${d.at} ${d.id}: ${d.summary}`),
    'Top errors:', ...top.map((e) => `- ${e.count}x ${e.message} (release ${e.release})`),
    'Log excerpt (redacted):', ...i.logs.slice(0, 20).map(redact),
  ].join('\n');
}
```

I ran it on a sample incident: the brief contained the deploy just before the start and left out a later one, listed the 900-count error before the 12-count one, and the email address, bearer token and card-like number were all redacted. Redaction by pattern is a safety net, not a guarantee; prefer sending aggregates over raw records, and use an approved, company-sanctioned tool.

### The prompt I would send

```text
Here is a brief about a production incident (redacted). List up to five hypotheses, ranked by likelihood.
For each: the evidence in the brief that supports it, the evidence that would contradict it,
and the cheapest check I can run (a query, a command, a dashboard). Do not assume anything not in the brief.
```

### A workflow

1. **Stabilise first:** declare the incident, assign roles, and roll back or flag off the suspected change; do not wait for a diagnosis.
2. **Collect evidence:** error tracking by release, deploy and flag timeline, key metrics, a reproduction on the affected browser or device.
3. **Ask for hypotheses** from the brief, then **test** them one at a time with real data.
4. **Confirm the cause** with a reproduction or a clear metric change, not with the AI's agreement.
5. **Write the timeline and review** with AI as a drafting aid and humans correcting it; capture follow-ups (alerts, tests, runbook).

### Risks and how to answer them

- **Hallucinated causes:** require evidence and a check for every hypothesis.
- **Data leakage:** redaction, approved tools, aggregates over raw data.
- **Anchoring:** the first plausible answer biases the team; keep at least two competing hypotheses alive.
- **Automation without oversight:** read-only access for any agent, human approval for changes.

### References

- [Google SRE Book: Managing incidents](https://sre.google/sre-book/managing-incidents/)
- [Google SRE Workbook: Incident response](https://sre.google/workbook/incident-response/)

Appears in an interview write-up shared online (second-hand; source unverified). The guidance is my own; the redaction and brief builder were run on a sample incident.

## "Deliver an urgent feature while taking on manageable technical debt": how to tell the story
<!--
id: urgent-feature-manageable-tech-debt
level: lead
tags: behavioral, tech debt, trade-offs, deadlines, prioritization, stakeholder management
minutes: 12
-->

> [!PROMPT]
> Describe a situation where you had to deliver an urgent feature while taking on manageable technical debt. How did you decide what to cut, and what did you do afterwards?

> [!HINT]
> - What made it urgent, and who agreed to the trade-off?
> - What exactly was the debt, and why "manageable"?
> - What proves you paid it back?

> [!TLDR]
> Tell a story where debt was a conscious, bounded decision, not an accident. Show that the urgency was real (a date, a customer, revenue), that you protected what must not be compromised (correctness, security, accessibility, data), and that you chose shortcuts that are contained and reversible. Name the debt explicitly, agree it with the product owner, write it down (a ticket with an owner and a date, a marker in the code), and describe how you paid it back and what you learned. The strongest answers end with evidence: the date was met, nothing broke, and the debt was repaid, with a lesson about how you now plan for it.

### Structure (STAR plus the debt ledger)

1. **Situation and urgency:** the deadline, who needed it and the cost of missing it.
2. **Task:** your role and the constraint ("ship in two weeks instead of six").
3. **Decision:** what you chose to cut or simplify and why that debt was acceptable: low blast radius, behind a flag, well isolated, easy to replace. What you refused to cut.
4. **Action:** how you built it (a thin vertical slice, the simplest data model that does not trap you), how you communicated the trade-off, how you recorded the debt.
5. **Result:** shipped on time, metrics, no incident.
6. **Repayment and learning:** when and how you fixed it, and what you changed in planning.

### Make the debt visible and time-boxed (code you can mention)

```ts
// TODO(debt:WEB-123, expires=2026-11-30) replace with the shared pricing hook
```

```ts
function expiredDebt(source: string, today: string): string[] {
  const out: string[] = [];
  const re = /TODO\(debt:([A-Z]+-\d+),\s*expires=(\d{4}-\d{2}-\d{2})\)/g;
  source.split('\n').forEach((line, i) => {
    re.lastIndex = 0;
    for (let m; (m = re.exec(line)); ) if (m[2] < today) out.push(`line ${i + 1}: ${m[1]} expired ${m[2]}`);
  });
  return out;
}
```

A CI step that runs this fails the build when a marked shortcut is past its date. I ran it on sample source: on 2026-11-26 it reported only the marker that expired in October, and on 2026-12-01 it reported both; a plain `TODO fix later` with no ticket and date was ignored (which is itself a reason to ban untracked TODOs). ISO dates compare correctly as strings.

### Shortcuts that are usually acceptable, and those that are not

| Usually acceptable (contained, reversible) | Not acceptable |
|---|---|
| Duplicating a small component instead of generalising it | Skipping authorisation or input validation |
| Hard-coding a config that will become a setting | Dropping accessibility basics |
| Polling instead of building real-time | Losing or corrupting user data |
| Manual step for an admin task instead of tooling | Untested payment or irreversible operations |
| Fewer tests on low-risk UI, with the core logic still tested | No monitoring or no way to roll back |

### Example outline (illustrative; replace with your own story)

- *Situation:* a partner launch moved up by four weeks, and the checkout needed a new payment option.
- *Decision:* ship the option behind a flag, reuse the existing form instead of the planned redesign, and hard-code the partner configuration; do not skip validation, tests for the payment path or monitoring.
- *Action:* agreed the list of shortcuts with the product manager in writing, opened tickets with owners and dates, and added expiry markers in the code.
- *Result:* launched on the new date with no payment incidents; the configuration moved into settings and the redesign shipped in the next quarter.
- *Learning:* now every estimate has a "debt we are choosing" line, reviewed at the end of the sprint.

### Pitfalls

- A story where debt "just happened" or was never repaid.
- No numbers or dates.
- Blaming product for the deadline; show partnership instead.
- Pretending there was no cost; name what the shortcut cost you.

### References

- [Martin Fowler: Technical Debt Quadrant](https://martinfowler.com/bliki/TechnicalDebtQuadrant.html)
- [Ward Cunningham: The WyCash Portfolio Management System (origin of the debt metaphor)](https://c2.com/doc/oopsla92.html)

Appears in an interview write-up shared online (second-hand; source unverified). The outline is an illustration, not a real account; the expiry checker was run on sample source.

## "Walk me through a critical feature you built and the challenges involved": how to structure it
<!--
id: critical-feature-walkthrough
level: senior
tags: behavioral, ownership, project walkthrough, challenges, impact, metrics, rollout
minutes: 12
-->

> [!PROMPT]
> Walk me through a critical feature you built. What were the challenges, what did you decide, and what was the outcome?

> [!HINT]
> - Why was it critical to the business or users?
> - Which decisions were yours, and what were the alternatives?
> - How did you de-risk the launch, and how did you measure success?

> [!TLDR]
> Choose a feature where you owned real decisions and where the stakes are easy to explain. In about three minutes: the problem and why it mattered (numbers), your role and scope, the two or three hardest challenges (technical and non-technical), the decisions you made and the alternatives you rejected, how you built and released it safely (tests, flag, canary, monitoring), and the measured result, plus what you would do differently. Use "I" for your own decisions and "we" for the team's, and keep depth ready for follow-ups on any decision.

### A structure that works

1. **Context (20 seconds):** the product, the user problem and the stake ("checkout abandonment cost X").
2. **Your role:** owner, tech lead or contributor; the team and timeline.
3. **Challenges (the core):** pick two or three and say why each was hard, for example ambiguous requirements, performance under load, a legacy dependency, a cross-team API, accessibility, a hard deadline.
4. **Decisions:** the options you considered, the trade-off, and why you chose one; one decision you got wrong and corrected is a strength.
5. **Delivery:** how you sliced the work, tested, rolled out and monitored.
6. **Outcome:** metrics (conversion, latency, errors, support tickets), adoption, and what happened afterwards.
7. **Reflection:** what you would change.

### Show the rollout, not just the build

A safe launch is part of the story. A guard that decides whether to continue, wait or roll back a staged release:

```ts
function guard(
  m: { requests: number; errors: number; baselineErrorRate: number },
  opts = { minRequests: 500, maxRatio: 2, floor: 0.005 },
): 'continue' | 'rollback' | 'wait' {
  if (m.requests < opts.minRequests) return 'wait';              // not enough data to judge
  const rate = m.errors / m.requests;
  return rate > Math.max(opts.floor, m.baselineErrorRate * opts.maxRatio) ? 'rollback' : 'continue';
}
```

I ran it: 100 requests returned `wait` even with 50 errors; 12 errors in 1,000 against a 1% baseline returned `continue`; 40 in 1,000 returned `rollback`. Describing a rule like this ("we widened from 5% to 25% only while the error rate stayed under twice the baseline") shows you plan launches like an engineer.

### Questions to expect

- **"What was the hardest bug?"** A specific one with how you found it.
- **"What would you do differently?"** An honest design or process change.
- **"How did you handle disagreement?"** A concrete example with the outcome.
- **"What did you not build, and why?"** Shows scope judgment.
- **"How did you know it worked?"** A before-and-after number, not a feeling.

### Pitfalls

- A tour of the technology stack with no decisions.
- "We" for everything, so the interviewer cannot see your contribution.
- No metric, or a metric you cannot connect to your work.
- Hiding what went wrong; a handled problem is the best part of the story.

### Example skeleton (illustrative; fill with your own details)

```text
Problem:   [who is affected, how it shows up, size of the impact]
Role:      [your scope; team size; timeline]
Challenge 1: [constraint] → [decision, alternatives] → [result]
Challenge 2: [constraint] → [decision, alternatives] → [result]
Release:   [flag, canary, monitoring, rollback rule]
Outcome:   [metric before → after; adoption; follow-up work]
Reflection:[one thing you would change]
```

### References

- [Amazon: Leadership Principles (ownership, deliver results)](https://www.amazon.jobs/en/principles)
- [Google re:Work: Structured interviewing](https://rework.withgoogle.com/guides/hiring-use-structured-interviewing/steps/introduction/)

Appears in an interview write-up shared online (second-hand; source unverified). The structure is my own; the rollout guard was run against sample numbers.

## Describe a critical frontend production issue you found and fixed: detection, diagnosis, fix and prevention
<!--
id: frontend-production-issue-story
level: senior
tags: behavioral, production issue, monitoring, debugging, source maps, rollback, prevention
minutes: 12
-->

> [!PROMPT]
> Describe a critical frontend production issue you identified and resolved. How did you detect it, diagnose it, fix it and stop it happening again?

> [!HINT]
> - How did you find out: a user, an alert, a dashboard?
> - What narrowed it down: release, browser, route, user segment?
> - What changed afterwards so the same class of bug is caught earlier?

> [!TLDR]
> Tell it as a timeline with decisions: detection (how it surfaced and how fast), impact assessment (who, how many, how bad), mitigation first (rollback or flag off), then diagnosis (error tracking by release and browser, source maps, a reproduction), the fix and its verification, and finally prevention (a test, an alert, a lint rule, a process change). Frontend issues are distinctive: they depend on browser, device, network, third-party scripts and cached assets, so show that you segment by release and environment, and that you check the cache and version-skew angle. End with a measured result and one lasting change.

### The frontend-specific diagnosis kit

- **Error tracking tagged with the release id,** so you see "started with r42".
- **Source maps** uploaded privately, so stack traces name real files.
- **Segment by browser, OS, route, locale, feature flag and user cohort;** one browser is a common culprit.
- **Check what changed:** deploys, flag changes, third-party scripts, dependency upgrades, backend API changes, CDN or cache configuration.
- **Reproduce** with the same browser, network throttling, and account state; use session replay if you have it.
- **Look at the network:** failing requests, CORS errors, a cached `index.html` pointing at deleted chunks.

### Grouping errors so one bug is one issue

```ts
function fingerprint(e: { name: string; message: string; stack?: string }): string {
  const frame = (e.stack ?? '').split('\n').find((l) => /\.(js|ts|tsx):\d+/.test(l)) ?? '';
  const normalized = e.message
    .replace(/\b[0-9a-f]{8,}\b/gi, '<id>')     // ids and hashes
    .replace(/\d+/g, '<n>');                    // numbers
  return sha1([e.name, normalized, frame.replace(/:\d+:\d+\)?$/, '')].join('|')).slice(0, 12);
}
```

I ran this: two `TypeError`s differing only in an order number produced the same fingerprint, a different top frame produced a different one, and counting by `release:fingerprint` let the first occurrence per release raise an alert while repeats only incremented a count. Grouping by fingerprint and release is how you see "900 errors, all in r42, all Safari" in seconds.

### Structure of the answer

1. **Detection:** "an alert on the checkout error rate fired three minutes after the release" or "support reported it".
2. **Impact:** share of users, revenue or key flow affected, severity.
3. **Mitigation:** roll back or turn the flag off first; state the time to mitigate.
4. **Diagnosis:** the evidence trail (release, browser, stack trace, reproduction) and the root cause (for example, a date-library upgrade that used a method Safari lacked).
5. **Fix:** the smallest safe change, reviewed, tested and released progressively.
6. **Prevention:** a regression test, a browser-matrix check in CI, a canary with an error-rate guard, a dependency-upgrade checklist, an alert, and a blameless review.
7. **Result:** time to detect, time to mitigate, users affected, what stayed better.

### Example outline (illustrative; replace with your own story)

- *Detection:* the checkout error rate alert fired four minutes after a release.
- *Mitigation:* the new payment form was behind a flag; turned it off, error rate dropped within two minutes.
- *Diagnosis:* grouped errors by release and browser: all in the new release and all in one browser version; source maps pointed to a call to a method not supported there; reproduced it locally on that browser.
- *Fix:* replaced the call with a supported alternative, added a test, released to 5% first.
- *Prevention:* added that browser to the CI matrix, a canary guard on error rate, and a lint rule for the unsupported API.
- *Result:* detected in four minutes, mitigated in six, about 2% of sessions affected for ten minutes.

### Pitfalls

- Hero stories with no process; interviewers want your method.
- Fixing before mitigating.
- Blaming a person or a team; focus on the system.
- No prevention step, or a vague "we were more careful".

### References

- [Sentry: Releases and source maps](https://docs.sentry.io/product/releases/)
- [Google SRE Book: Postmortem culture](https://sre.google/sre-book/postmortem-culture/)

Appears in an interview write-up shared online (second-hand; source unverified). The outline is an illustration, not a real account; the fingerprint logic was run on sample errors.
