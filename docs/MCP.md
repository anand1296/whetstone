# Whetstone MCP server (phase 1 of the AI roadmap)

Whetstone can expose its question bank to AI clients through the **Model Context Protocol (MCP)**. A client such as Claude can then search the bank and quiz you: it shows you a question, waits for your answer, and only then reads the model answer to compare. This page explains the protocol well enough to rebuild it, then how to turn it on and try it.

## What MCP is, in five lines

- MCP is **JSON-RPC 2.0** with agreed method names. A client sends `{"jsonrpc":"2.0","id":1,"method":"…","params":{…}}` and gets `{"jsonrpc":"2.0","id":1,"result":{…}}` or an `error`.
- A message **without an `id` is a notification** (nothing is answered). Over HTTP we reply `202 Accepted`.
- The server declares **capabilities** (here: `tools`). **Tools** are functions the *model* may decide to call; each has a name, a description the model reads, and a JSON Schema for its arguments.
- **Streamable HTTP** is the transport: the client POSTs each message to one URL (`/api/mcp`), and the server may answer with plain JSON (what we do) or open a stream (what we don't need).
- **Two kinds of failure.** A JSON-RPC error means the protocol was misused (unknown method or tool). A normal result with `"isError": true` means the tool ran but could not do the job; its text is written for the model so it can retry.

## The handshake and a tool call

```text
client → POST /api/mcp  {"jsonrpc":"2.0","id":1,"method":"initialize",
                         "params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"demo","version":"1"}}}
server → 200            {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-11-25",
                         "capabilities":{"tools":{"listChanged":false}},"serverInfo":{…},"instructions":"…"}}
client → POST           {"jsonrpc":"2.0","method":"notifications/initialized"}      → 202, no body
client → POST           {"jsonrpc":"2.0","id":2,"method":"tools/list"}               → the three tools
client → POST           {"jsonrpc":"2.0","id":3,"method":"tools/call",
                         "params":{"name":"search_questions","arguments":{"query":"react suspense"}}}
server → 200            {"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"…"}],
                         "structuredContent":{…}}}
```

Version negotiation: the client proposes a revision; if the server knows it, it echoes it, otherwise it answers with its newest and the client decides whether it can live with that. This server speaks 2025-03-26, 2025-06-18 and 2025-11-25.

## The tools

| Tool | Arguments | Returns |
| --- | --- | --- |
| `list_rounds` | none | Round ids, titles, descriptions and question counts |
| `search_questions` | `query` (required), `round`, `level`, `limit` (1-20) | Matching question metadata only (id, title, round, level, tags, minutes). Never answers |
| `get_question` | `id` (required), `reveal_answer` (default false), `framework` (`react`, `angular`, `vue`) | The question prompt (scenario, requirements, test cases). With `reveal_answer=true`, the full Markdown answer; `framework` drops the other frameworks' code to save tokens |

All tools carry `readOnlyHint: true` and touch only published content. Drafts and unpublished rounds are never served.

Design choices worth being able to explain:

- **The answer is a separate step** so the model can act as an interviewer instead of dumping the solution. The `instructions` string sent at `initialize` and the tool descriptions both say so; the *server* also enforces it by not returning the answer unless asked.
- **Token cost.** The full kanban answer is about 24,000 characters; filtering to Vue cuts it to about 14,000. Hiding the answer by default makes the common call about 1,200 characters.
- **Descriptions are the interface.** The model never sees the Go code, only the name, description and schema, so they are written as instructions.

## Turning it on

1. In Vercel (or `.env` locally) set `MCP_ENABLED=true`. Without it the endpoint answers `404`.
2. The site's content must be **public** (Admin → Features & settings → content access). While content is members-only the endpoint answers `403`, because an MCP client cannot carry your browser session.
3. Redeploy. The endpoint is `https://<your-app>/api/mcp`.

## Trying it

**With curl** (no client needed):

```bash
URL=https://<your-app>/api/mcp
curl -s "$URL" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_questions","arguments":{"query":"kanban"}}}'
```

**With the MCP Inspector** (a browser UI that lists tools and lets you call them):

```bash
npx @modelcontextprotocol/inspector
# Transport: Streamable HTTP, URL: https://<your-app>/api/mcp
```

**With Claude**: add a custom connector (Settings → Connectors → Add custom connector) with the same URL, then ask "quiz me on React Suspense; don't show the answer until I've tried". Which clients accept a remote server without OAuth depends on the client and plan; if yours insists on authentication, use the Inspector for now (authenticated MCP is a later phase).

## Security notes

- **Public, anonymous, read-only.** No user data is reachable. Rate limit: 120 requests a minute per IP.
- **Origin check.** A request with an `Origin` header from another site is refused (this blocks DNS-rebinding and cross-site calls from browsers). Desktop and server-side clients send no `Origin` and pass.
- **No cookies.** The endpoint ignores sessions entirely, which is why it is exempt from the cookie-CSRF header rule.
- **Prompt injection.** Question text becomes model input. It is written by admins and approved contributors, so it is trusted-ish, not trusted. Phase 1 has no write tools, so the worst a hostile question could do is mislead a quiz. Revisit this before adding any tool with side effects.

## Not implemented (on purpose)

- Server-to-client streaming (`GET`, SSE), sessions and resumability: not needed for stateless request/response tools.
- Resources, prompts, sampling and elicitation. Prompts (a `quiz_me` template) are the natural next step.
- The 2026-07-28 revision, which removes `initialize` in favour of per-request `_meta` and `server/discover`. The handler is already stateless, so supporting it is a small change once clients use it.

## Where the code is

| File | What it does |
| --- | --- |
| `backend/mcp/protocol.go` | JSON-RPC types, error codes, version negotiation |
| `backend/mcp/server.go` | HTTP handling (POST only, 202 for notifications, size limit) and method dispatch |
| `backend/mcp/tools.go` | The three tools, argument validation, search scoring, prompt extraction, framework filtering |
| `backend/mcp/catalog.go` | The small interface the tools need from the app |
| `backend/server/mcp.go` | The gate (enabled, public, Origin, rate limit) and the adapter from the store |
| `backend/mcp/server_test.go`, `backend/server/mcp_test.go` | Protocol tests (no database) and gate tests (with Postgres) |
