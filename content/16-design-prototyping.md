---
id: design-prototyping
title: Design and AI Prototyping
description: How product design is shifting from static Figma mockups toward AI-generated, code-based HTML prototypes, and what that changes for designers, engineers, design systems and handoff.
facets: design, frontend
---

## From Figma mockups to AI-generated HTML prototypes: what is changing and why
<!--
id: figma-to-html-prototypes
level: lead
tags: design, prototyping, figma, ai, html, workflow, handoff
minutes: 15
-->

> [!PROMPT]
> Your design lead says the team should stop producing high-fidelity Figma mockups for every idea and start generating working HTML prototypes with AI tools instead. Is that a good idea, and how would you roll it out?
>
> **Cover**
> - What a code prototype gives you that a static mockup cannot, and what it costs.
> - Where Figma (or another design tool) is still the better instrument.
> - How you would pilot it, measure it, and keep the team aligned.

> [!TLDR]
> The industry trend is real but it is a shift in where exploration happens, not the end of design tools. A prompt-generated HTML prototype is cheap, real (it scrolls, animates, handles states and data) and testable with users in a browser, so teams use it to explore and validate ideas earlier. Figma-style tools remain strong for precise visual craft, systematic component work and cross-team alignment. Pilot it on a bounded problem, agree on what a prototype is *for* (learning, not production code), and measure time to a testable idea and quality of feedback rather than slide-ready polish.

### What has actually changed

Generative tools (design-oriented products from the major AI vendors, UI generators, and coding assistants pointed at a design brief) can now produce a working page from a prompt, a sketch or a screenshot in minutes. Design tools have responded in kind: several now ship their own prompt-to-prototype or "design to code" features. Treat the specifics as moving fast; the durable idea is that the **prototype medium is moving from pictures of an interface to the interface itself**.

### What a code prototype buys you

- **Real behavior.** Responsive layout, focus order, keyboard use, loading, empty and error states, real-feeling data. A mockup can only gesture at these, and they are where many design problems hide.
- **Testability.** You send a URL to users, not a click-through of linked frames.
- **Speed of iteration.** Changing a prompt or editing the output is often quicker than re-laying-out frames, especially for variations ("show me five layouts for this table").
- **Shared artifact.** Engineers, PMs and designers react to the same running thing, so "what do you mean by that interaction?" conversations shrink.

### What it costs

- **Fidelity drift.** Output often looks plausible but ignores your spacing scale, type ramp or tokens, and it can be inconsistent between screens.
- **Accessibility and quality are not free.** Generated markup frequently has div-soup, missing labels, weak contrast or broken keyboard behavior. Prototype code is not production code.
- **The "it looks done" trap.** A convincing prototype invites stakeholders to treat it as a commitment, or engineers to ship it.
- **Thinking skipped.** Prompting can replace the slow, useful work of defining the problem, flows and edge cases.

### Where a design tool is still the better choice

Pixel-level visual craft and branding, exploring many static directions side by side on a canvas, building and documenting a component library, annotation and review across a large org, and illustration or asset work. Many teams end up using both: explore in code, converge and systematize in the design tool (or the reverse).

### A sensible rollout

1. Pick a bounded problem (one flow, one new feature) and a pilot group.
2. Define the prototype's purpose and its lifespan: *to learn, then throw away* unless promoted deliberately.
3. Constrain the tools with your design system (tokens, component library, rules) so output is closer to on-brand.
4. Measure: time from idea to something users can try, number of design questions answered per week, rework at handoff, and quality of user feedback.
5. Review after a few weeks and decide what to keep, rather than declaring a winner up front.

### Interview follow-ups

- *"Won't designers become redundant?"* The skill shifts toward problem framing, interaction and systems thinking, taste and critique of generated options; the typing of pixels matters less. Present it as a change in the work, not a prediction about headcount.
- *"Why not just ship the prototype?"* Because it usually lacks accessibility, performance, security, tests and tokens, and nobody has reviewed its architecture.

## Design systems and tokens in an AI-prototyping workflow: keeping generated UI on-brand
<!--
id: design-systems-ai-prototyping
level: lead
tags: design systems, tokens, ai, prototyping, consistency, components
minutes: 14
-->

> [!PROMPT]
> Teams are generating prototypes with AI and the results look different every time. How do you make generated UI follow your design system, and what does that change about how you maintain the system?
>
> **Cover**
> - Giving the model the system: tokens, component APIs, usage rules and examples.
> - Checking output automatically, not by eye.
> - What the design system team does differently.

> [!TLDR]
> Generated UI is only as consistent as the context it is given. Make the system machine-readable: design tokens as a single source of truth (CSS variables or JSON), a component library with typed props, short usage rules, and a handful of canonical examples the tool can imitate. Then verify mechanically with lint rules that ban raw colors and spacing, visual regression and accessibility checks on the output. The design system team shifts from drawing components toward maintaining tokens, docs and guardrails that humans and models both consume.

### Give the model something real to follow

- **Tokens as the contract.** Colors, spacing, type, radii, motion and elevation live in one source (for example a JSON file compiled to CSS custom properties). Prompts say "use only these variables"; the generated HTML references `var(--space-4)`, not `16px`.
- **A real component library.** If the prototype can import your actual `Button`, `Field` and `Table`, you get consistent behavior and accessibility for free. Pointing the tool at a Storybook or a short component index with props and examples works better than a screenshot.
- **Rules and examples.** A concise page of dos and don'ts, plus two or three exemplary screens, steers output more than long prose.

### Verify, don't eyeball

- Lint or CI checks that flag hard-coded colors, off-scale spacing and unknown components.
- Automated accessibility checks (axe-style) on generated pages, plus a manual keyboard pass.
- Visual regression against the component library's stories.

### How the work of the system team changes

Documentation and tokens become *product surfaces for machines*, so naming, structure and completeness matter more. Expect more demand for a "prototype kit" (starter template, tokens, components, rules), and treat repeated model mistakes as bugs in the documentation or guardrails.

### Trade-offs

Tight constraints reduce surprise but also exploration; allow an "off-system" mode for early divergent ideas and bring ideas back into the system before they ship. A system that is mostly in a design tool's files and not in code is the hardest to feed to a model, which is one reason teams invest in code-first tokens.

## Designer-engineer handoff when the prototype is already code
<!--
id: prototype-handoff
level: senior
tags: handoff, design, collaboration, prototyping, code review, workflow
minutes: 12
-->

> [!PROMPT]
> A designer hands you a working AI-generated HTML prototype and says "it's basically done, can you just ship it?" How do you handle the handoff?
>
> **Cover**
> - What to keep, what to rebuild, and how to decide.
> - What a prototype does not tell you.
> - How to make the collaboration smoother next time.

> [!TLDR]
> Treat the prototype as a living specification, not production code. Keep the decisions it proves (flows, layout, copy, interaction, states) and rebuild the implementation on your stack with the real components, accessibility, data layer, performance budget and tests. Walk through it together, write down what it does *not* specify (error paths, permissions, scale, analytics), and agree on a repeatable handoff: a prototype link, a short intent doc, and a list of known gaps.

### What the prototype already gives you

Real flows, responsive behavior, interaction details and copy, plus something stakeholders have already reacted to. That removes a lot of ambiguity compared with static frames, so engineers should ask fewer "what happens when I click this?" questions.

### What it does not tell you

- Real data shapes, pagination, empty and failure states, permissions.
- Accessibility beyond what was accidentally correct, internationalization, RTL, long strings.
- Performance under real payloads, bundle cost, SEO and security considerations.
- How it fits your architecture, routing, state management and design system.

### Decide per piece: keep, adapt or rebuild

Markup and CSS from a prototype are usually a starting point at best. Reuse pure visual ideas and copy; rebuild structure with your components and tokens. Occasionally a small, well-formed piece is fine to adopt after review, with the same bar as any other code.

### Make the next one easier

1. Agree on the **prototype's definition of done**: what has been validated with users, what has not.
2. Share a short intent note (goal, key decisions, open questions) next to the link.
3. Have engineers join early to flag feasibility, so surprises show up before the prototype becomes a promise.
4. Keep a shared prototype kit that already uses your tokens and components.

## Evaluating AI design tools: fidelity, control, lock-in and security
<!--
id: evaluating-ai-design-tools
level: principal
tags: tools, evaluation, ai, design, security, lock-in, governance
minutes: 12
-->

> [!PROMPT]
> You are asked to choose (or approve) an AI prototyping tool for the product organization. What criteria do you use, and what risks do you raise?
>
> **Cover**
> - Output quality, controllability and fit with your stack.
> - Data, IP and security concerns.
> - Cost, lock-in and how you would run a fair evaluation.

> [!TLDR]
> Evaluate on a real task from your backlog, not on demos. Score fidelity to your design system, controllability (can you edit, constrain and iterate predictably), code quality and accessibility of the output, export and portability, collaboration features, and cost at team scale. Raise governance early: what data and designs are sent to which vendor, retention and training terms, access control and audit, and the risk of lock-in to a proprietary format. Pilot with two tools side by side, then decide with data.

### Criteria worth scoring

| Area | Questions to ask |
| --- | --- |
| Fidelity | Does it follow our tokens and components, or invent its own? |
| Control | Can designers steer it precisely, and are results repeatable enough to trust? |
| Output | Is the code readable, accessible and exportable, or opaque and tool-bound? |
| Workflow | Does it fit review, versioning, comments and the design tool we already use? |
| Scale | Pricing per seat or usage, limits, performance on large screens or flows. |

### Risks to raise

- **Data and IP.** Confidential product plans, customer data in screenshots and unreleased designs may leave your boundary. Check retention, training use, regional hosting and contractual terms with legal and security.
- **Lock-in.** Prototypes living only in a vendor's canvas are hard to move; prefer tools that export standard HTML, CSS and tokens.
- **Quality drift and over-trust.** Reviewers may skip scrutiny because output looks polished.
- **Cost surprises.** Usage-based pricing with many iterations adds up.

### A fair evaluation

Choose two or three representative tasks, time-box them, have designers and engineers use each candidate, and compare on the criteria above plus qualitative feedback. Record the decision, the review date and the exit plan, because this category changes quickly and the right answer in six months may differ.
