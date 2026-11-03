package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const questionBody = "> [!PROMPT]\n> Build a debounced search box.\n>\n> **Test cases**\n> - Typing fast sends one request.\n\n" +
	"> [!TLDR]\n> Use a timer and cancel it.\n\n" +
	"### Shared\n\nShared text.\n\n" +
	":::react\n### React\n\nreact only\n\n```tsx\n:::angular\nnot a container\n```\n:::\n\n" +
	":::angular\n### Angular\n\nangular only\n:::\n\n" +
	":::vue\n### Vue\n\nvue only\n:::\n\n### After\n\nthe end\n"

type fakeCatalog struct{ err error }

func (f fakeCatalog) Outline(context.Context) ([]Round, error) {
	if f.err != nil {
		return nil, f.err
	}
	return []Round{
		{ID: "react", Title: "React Internals", Description: "How React works", Questions: []QuestionInfo{
			{ID: "debounce-search", Title: "Build a debounced search", Level: "senior", Tags: []string{"debounce", "search"}, Minutes: 15, SearchText: "timers cancel abort"},
			{ID: "fiber", Title: "React Fiber explained", Level: "lead", Tags: []string{"react", "fiber"}, Minutes: 20, SearchText: "scheduler lanes"},
		}},
		{ID: "security", Title: "Security", Description: "XSS and friends", Questions: []QuestionInfo{
			{ID: "csrf", Title: "CSRF and SameSite", Level: "principal", Tags: []string{"csrf", "cookies"}, Minutes: 10, SearchText: "tokens react"},
		}},
	}, nil
}

func (f fakeCatalog) Question(_ context.Context, id string) (Question, error) {
	if f.err != nil {
		return Question{}, f.err
	}
	if id != "debounce-search" {
		return Question{}, ErrNotFound
	}
	return Question{
		QuestionInfo: QuestionInfo{ID: id, Title: "Build a debounced search", Level: "senior", Tags: []string{"debounce"}, Minutes: 15},
		RoundID:      "react", RoundTitle: "React Internals", Body: questionBody,
	}, nil
}

// rpc sends one message and decodes the JSON-RPC response (nil for 202 Accepted).
func rpc(t *testing.T, srv http.Handler, body string, headers ...string) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/mcp", strings.NewReader(body))
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	if rec.Body.Len() == 0 {
		return rec.Code, nil
	}
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("response is not JSON: %v\n%s", err, rec.Body.String())
	}
	return rec.Code, out
}

func call(t *testing.T, srv http.Handler, name, args string) map[string]any {
	t.Helper()
	code, out := rpc(t, srv, `{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"`+name+`","arguments":`+args+`}}`)
	if code != 200 {
		t.Fatalf("status %d: %v", code, out)
	}
	return out
}

func resultText(t *testing.T, out map[string]any) (string, bool) {
	t.Helper()
	result, _ := out["result"].(map[string]any)
	if result == nil {
		t.Fatalf("no result: %v", out)
	}
	content, _ := result["content"].([]any)
	if len(content) == 0 {
		t.Fatalf("no content: %v", result)
	}
	first, _ := content[0].(map[string]any)
	isError, _ := result["isError"].(bool)
	return first["text"].(string), isError
}

func TestInitializeNegotiatesVersion(t *testing.T) {
	srv := New(fakeCatalog{}, "whetstone", "test")
	for requested, want := range map[string]string{
		"2025-06-18": "2025-06-18", // known: echoed
		"2025-11-25": "2025-11-25",
		"2031-01-01": "2025-11-25", // unknown: our newest, the client decides
	} {
		code, out := rpc(t, srv, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"`+requested+`","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}`)
		result, _ := out["result"].(map[string]any)
		if code != 200 || result["protocolVersion"] != want {
			t.Fatalf("requested %s: status %d result %v", requested, code, out)
		}
		caps, _ := result["capabilities"].(map[string]any)
		if _, ok := caps["tools"]; !ok {
			t.Fatalf("tools capability missing: %v", caps)
		}
		if _, ok := caps["resources"]; ok {
			t.Fatal("must not advertise capabilities it does not implement")
		}
	}
	if _, out := rpc(t, srv, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`); out["error"] == nil {
		t.Fatal("initialize without protocolVersion should be invalid params")
	}
}

func TestNotificationsAreAcceptedWithoutBody(t *testing.T) {
	srv := New(fakeCatalog{}, "whetstone", "test")
	if code, body := rpc(t, srv, `{"jsonrpc":"2.0","method":"notifications/initialized"}`); code != http.StatusAccepted || body != nil {
		t.Fatalf("got %d %v", code, body)
	}
	if code, _ := rpc(t, srv, `{"jsonrpc":"2.0","id":1,"result":{}}`); code != http.StatusAccepted {
		t.Fatalf("a client response should be accepted, got %d", code)
	}
}

func TestPingAndUnknownMethod(t *testing.T) {
	srv := New(fakeCatalog{}, "whetstone", "test")
	if _, out := rpc(t, srv, `{"jsonrpc":"2.0","id":"abc","method":"ping"}`); out["id"] != "abc" || out["result"] == nil {
		t.Fatalf("ping: %v", out)
	}
	_, out := rpc(t, srv, `{"jsonrpc":"2.0","id":2,"method":"resources/list"}`)
	errObj, _ := out["error"].(map[string]any)
	if errObj["code"] != float64(codeMethodNotFound) {
		t.Fatalf("expected method not found, got %v", out)
	}
}

func TestMalformedRequests(t *testing.T) {
	srv := New(fakeCatalog{}, "whetstone", "test")
	for name, tc := range map[string]struct {
		body string
		code int
		rpc  float64
	}{
		"not json":     {`{nope`, 400, codeParseError},
		"batch":        {`[{"jsonrpc":"2.0","id":1,"method":"ping"}]`, 400, codeInvalidRequest},
		"wrong spec":   {`{"jsonrpc":"1.0","id":1,"method":"ping"}`, 400, codeInvalidRequest},
		"null id":      {`{"jsonrpc":"2.0","id":null,"method":"ping"}`, 400, codeInvalidRequest},
		"no method/id": {`{"jsonrpc":"2.0","id":1}`, 400, codeInvalidRequest},
	} {
		code, out := rpc(t, srv, tc.body)
		errObj, _ := out["error"].(map[string]any)
		if code != tc.code || errObj["code"] != tc.rpc {
			t.Errorf("%s: got %d %v", name, code, out)
		}
	}
	if code, _ := rpc(t, srv, `{"jsonrpc":"2.0","id":1,"method":"ping"}`, "MCP-Protocol-Version", "1999-01-01"); code != 400 {
		t.Errorf("unsupported protocol version header should be 400, got %d", code)
	}
	if code, _ := rpc(t, srv, `{"jsonrpc":"2.0","id":1,"method":"ping"}`, "MCP-Protocol-Version", "2025-06-18"); code != 200 {
		t.Errorf("supported protocol version header should pass, got %d", code)
	}
	if code, _ := rpc(t, srv, `{"jsonrpc":"2.0","id":1,"method":"ping","params":{"x":"`+strings.Repeat("a", maxRequestBytes)+`"}}`); code != http.StatusRequestEntityTooLarge {
		t.Errorf("oversized body should be 413, got %d", code)
	}
}

func TestGetIsNotAllowed(t *testing.T) {
	rec := httptest.NewRecorder()
	New(fakeCatalog{}, "whetstone", "test").ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/mcp", nil))
	if rec.Code != http.StatusMethodNotAllowed || rec.Header().Get("Allow") != "POST" {
		t.Fatalf("got %d %q", rec.Code, rec.Header().Get("Allow"))
	}
}

func TestToolsList(t *testing.T) {
	srv := New(fakeCatalog{}, "whetstone", "test")
	_, out := rpc(t, srv, `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`)
	tools, _ := out["result"].(map[string]any)["tools"].([]any)
	var names []string
	for _, raw := range tools {
		tool := raw.(map[string]any)
		names = append(names, tool["name"].(string))
		schema := tool["inputSchema"].(map[string]any)
		if schema["type"] != "object" || tool["description"] == "" {
			t.Errorf("tool %v needs an object schema and a description", tool["name"])
		}
		if tool["annotations"].(map[string]any)["readOnlyHint"] != true {
			t.Errorf("tool %v must be marked read-only", tool["name"])
		}
	}
	if strings.Join(names, ",") != "list_rounds,search_questions,get_question" {
		t.Fatalf("tool order must be deterministic, got %v", names)
	}
}

func TestListRounds(t *testing.T) {
	text, isErr := resultText(t, call(t, New(fakeCatalog{}, "w", "t"), "list_rounds", `{}`))
	if isErr || !strings.Contains(text, `"questionCount": 2`) || !strings.Contains(text, `"id": "security"`) {
		t.Fatalf("%v %s", isErr, text)
	}
}

func TestSearchQuestions(t *testing.T) {
	srv := New(fakeCatalog{}, "w", "t")

	text, isErr := resultText(t, call(t, srv, "search_questions", `{"query":"react"}`))
	// "react" is a tag of fiber (+title), only in body text of csrf: title/tag matches rank first.
	if isErr || strings.Index(text, `"id": "fiber"`) < 0 || strings.Index(text, `"id": "fiber"`) > strings.Index(text, `"id": "csrf"`) {
		t.Fatalf("ranking: %s", text)
	}
	if strings.Contains(text, "TLDR") || strings.Contains(text, "scheduler") {
		t.Fatal("search results must never include answer text")
	}

	text, _ = resultText(t, call(t, srv, "search_questions", `{"query":"react","level":"lead"}`))
	if strings.Contains(text, "csrf") || !strings.Contains(text, "fiber") {
		t.Fatalf("level filter: %s", text)
	}
	text, _ = resultText(t, call(t, srv, "search_questions", `{"query":"react","round":"security"}`))
	if strings.Contains(text, `"id": "fiber"`) || !strings.Contains(text, "csrf") {
		t.Fatalf("round filter: %s", text)
	}
	text, _ = resultText(t, call(t, srv, "search_questions", `{"query":"react","limit":1}`))
	if strings.Count(text, `"id":`) != 1 {
		t.Fatalf("limit: %s", text)
	}
	text, isErr = resultText(t, call(t, srv, "search_questions", `{"query":"zzzz"}`))
	if isErr || !strings.Contains(text, "0 question(s)") {
		t.Fatalf("no match is a normal result: %v %s", isErr, text)
	}
}

func TestToolArgumentErrorsAreResultsTheModelCanRead(t *testing.T) {
	srv := New(fakeCatalog{}, "w", "t")
	for _, tc := range []struct{ tool, args, want string }{
		{"search_questions", `{}`, "at least one keyword"},
		{"search_questions", `{"query":"x","limit":99}`, "between 1 and 20"},
		{"search_questions", `{"query":"x","level":"junior"}`, "level must be"},
		{"search_questions", `{"query":"x","round":"nope"}`, "Unknown round"},
		{"search_questions", `{"query":"x","extra":1}`, "Invalid arguments"},
		{"get_question", `{}`, "id is required"},
		{"get_question", `{"id":"missing"}`, "No question with id"},
		{"get_question", `{"id":"debounce-search","framework":"svelte"}`, "framework must be"},
	} {
		text, isErr := resultText(t, call(t, srv, tc.tool, tc.args))
		if !isErr || !strings.Contains(text, tc.want) {
			t.Errorf("%s %s: isError=%v %q (want %q)", tc.tool, tc.args, isErr, text, tc.want)
		}
	}
	// A tool name that does not exist is a protocol error, not a tool error.
	if out := call(t, srv, "delete_everything", `{}`); out["error"] == nil {
		t.Fatalf("unknown tool should be a JSON-RPC error: %v", out)
	}
}

func TestGetQuestionHidesTheAnswerByDefault(t *testing.T) {
	srv := New(fakeCatalog{}, "w", "t")
	text, isErr := resultText(t, call(t, srv, "get_question", `{"id":"debounce-search"}`))
	if isErr || !strings.Contains(text, "Build a debounced search") || !strings.Contains(text, "Typing fast sends one request.") {
		t.Fatalf("prompt missing: %s", text)
	}
	for _, leak := range []string{"Use a timer", "react only", "angular only", "the end"} {
		if strings.Contains(text, leak) {
			t.Fatalf("answer leaked (%q): %s", leak, text)
		}
	}
	if !strings.Contains(text, "reveal_answer=true") {
		t.Fatal("the hidden-answer note should tell the model how to continue")
	}
}

func TestGetQuestionRevealAndFrameworkFilter(t *testing.T) {
	srv := New(fakeCatalog{}, "w", "t")

	full, _ := resultText(t, call(t, srv, "get_question", `{"id":"debounce-search","reveal_answer":true}`))
	for _, want := range []string{"Use a timer", "react only", "angular only", "vue only", "the end"} {
		if !strings.Contains(full, want) {
			t.Fatalf("missing %q in full answer", want)
		}
	}

	vue, _ := resultText(t, call(t, srv, "get_question", `{"id":"debounce-search","reveal_answer":true,"framework":"vue"}`))
	if !strings.Contains(vue, "vue only") || !strings.Contains(vue, "Shared text.") || !strings.Contains(vue, "the end") {
		t.Fatalf("vue answer lost content: %s", vue)
	}
	if strings.Contains(vue, "react only") || strings.Contains(vue, "angular only") || strings.Contains(vue, ":::") {
		t.Fatalf("other frameworks or container markers left behind: %s", vue)
	}
	if len(vue) >= len(full) {
		t.Fatal("filtering should shrink the answer")
	}

	// A ":::angular" line inside a code fence is code, so it survives when filtering for react.
	react, _ := resultText(t, call(t, srv, "get_question", `{"id":"debounce-search","reveal_answer":true,"framework":"react"}`))
	if !strings.Contains(react, "not a container") || !strings.Contains(react, "react only") {
		t.Fatalf("fenced container text was treated as structure: %s", react)
	}
}

func TestInternalErrorsAreNotLeaked(t *testing.T) {
	srv := New(fakeCatalog{err: errors.New("pq: password authentication failed for user \"secret\"")}, "w", "t")
	text, isErr := resultText(t, call(t, srv, "list_rounds", `{}`))
	if !isErr || strings.Contains(text, "secret") || strings.Contains(text, "pq:") {
		t.Fatalf("internal details must not reach the model: %q", text)
	}
}

func TestExtractPromptWithoutPrompt(t *testing.T) {
	if got := extractPrompt("> [!TLDR]\n> short\n"); got != "" {
		t.Fatalf("got %q", got)
	}
}
