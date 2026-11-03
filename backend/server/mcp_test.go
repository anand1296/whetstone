package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/anand1296/whetstone/backend/catalog"
)

// mcpPost sends one raw JSON-RPC message the way an AI client would: no cookies and
// no X-Requested-With header (which the browser CSRF guard demands for other POSTs).
func mcpPost(t *testing.T, e *env, body string, headers ...string) (int, string) {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, e.srv.URL+"/api/mcp", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	out, _ := io.ReadAll(res.Body)
	return res.StatusCode, string(out)
}

func enableMCP(c *Config) { c.MCPEnabled = true }

func TestMCPIsOffByDefault(t *testing.T) {
	e := newEnv(t) // public content, MCP not enabled
	if code, _ := mcpPost(t, e, `{"jsonrpc":"2.0","id":1,"method":"ping"}`); code != http.StatusNotFound {
		t.Fatalf("a disabled endpoint should look absent, got %d", code)
	}
}

func TestMCPRefusesMembersOnlySites(t *testing.T) {
	e := newPrivateEnv(t, enableMCP)
	code, body := mcpPost(t, e, `{"jsonrpc":"2.0","id":1,"method":"ping"}`)
	if code != http.StatusForbidden || !strings.Contains(body, "members_only") {
		t.Fatalf("got %d %s", code, body)
	}
}

func TestMCPServesPublicContent(t *testing.T) {
	e := newEnv(t, enableMCP)

	code, body := mcpPost(t, e, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}`)
	if code != 200 || !strings.Contains(body, `"protocolVersion":"2025-06-18"`) {
		t.Fatalf("initialize: %d %s", code, body)
	}
	if code, _ := mcpPost(t, e, `{"jsonrpc":"2.0","method":"notifications/initialized"}`); code != http.StatusAccepted {
		t.Fatalf("notification: %d", code)
	}

	code, body = mcpPost(t, e, `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_rounds","arguments":{}}}`)
	if code != 200 || !strings.Contains(body, "basics") || !strings.Contains(body, "advanced") {
		t.Fatalf("list_rounds: %d %s", code, body)
	}

	code, body = mcpPost(t, e, `{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_questions","arguments":{"query":"second?"}}}`)
	if code != 200 || !strings.Contains(body, "second-question") || strings.Contains(body, "first-question") {
		t.Fatalf("search: %d %s", code, body)
	}

	// The prompt-less fixture question has no [!PROMPT]; the answer must still stay hidden.
	code, body = mcpPost(t, e, `{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_question","arguments":{"id":"first-question"}}}`)
	if code != 200 || strings.Contains(body, "important thing clearly") {
		t.Fatalf("answer leaked or failed: %d %s", code, body)
	}
	code, body = mcpPost(t, e, `{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_question","arguments":{"id":"first-question","reveal_answer":true}}}`)
	if code != 200 || !strings.Contains(body, "important thing clearly") {
		t.Fatalf("reveal: %d %s", code, body)
	}
}

func TestMCPNeverServesDrafts(t *testing.T) {
	e := newEnv(t, enableMCP)
	ctx := context.Background()
	draft := catalog.Question{ID: "secret-draft", SectionID: "basics", Title: "Unreleased?", Level: "senior", Tags: []string{"draft"}, Minutes: 5, Body: goodBody, Published: false}
	if err := e.store.CreateQuestion(ctx, 0, draft, catalog.Compiled{HTML: "<p>x</p>", Summary: "s", SearchText: "unreleased"}); err != nil {
		t.Fatal(err)
	}
	for _, call := range []string{
		`{"name":"get_question","arguments":{"id":"secret-draft","reveal_answer":true}}`,
		`{"name":"search_questions","arguments":{"query":"unreleased"}}`,
	} {
		_, body := mcpPost(t, e, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":`+call+`}`)
		var res struct {
			Result struct {
				Content []struct{ Text string } `json:"content"`
			} `json:"result"`
		}
		if err := json.Unmarshal([]byte(body), &res); err != nil {
			t.Fatal(err)
		}
		text := res.Result.Content[0].Text
		if strings.Contains(text, "secret-draft") && !strings.Contains(text, "No question with id") {
			t.Fatalf("a draft was exposed: %s", text)
		}
	}
}

func TestMCPRejectsCrossOriginBrowsers(t *testing.T) {
	e := newEnv(t, enableMCP)
	code, _ := mcpPost(t, e, `{"jsonrpc":"2.0","id":1,"method":"ping"}`, "Origin", "https://evil.example")
	if code != http.StatusForbidden {
		t.Fatalf("cross-origin request should be refused, got %d", code)
	}
	if code, _ := mcpPost(t, e, `{"jsonrpc":"2.0","id":1,"method":"ping"}`, "Origin", e.srv.URL); code != 200 {
		t.Fatalf("same-origin request should pass, got %d", code)
	}
}

func TestMCPIsRateLimited(t *testing.T) {
	e := newEnv(t, enableMCP)
	var last int
	for i := 0; i < 125; i++ {
		last, _ = mcpPost(t, e, `{"jsonrpc":"2.0","id":1,"method":"ping"}`)
	}
	if last != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after the limit, got %d", last)
	}
}
