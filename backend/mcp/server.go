package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"time"
)

const (
	maxRequestBytes = 64 << 10 // tool arguments are tiny; refuse anything larger
	callTimeout     = 10 * time.Second
)

// Server answers MCP requests over HTTP. It holds no per-client state, so any
// instance (or serverless invocation) can answer any request.
type Server struct {
	catalog Catalog
	name    string
	version string
	tools   []tool
	// Log receives unexpected tool failures (optional).
	Log *slog.Logger
}

// New creates a Server. name and version identify it to clients.
func New(catalog Catalog, name, version string) *Server {
	s := &Server{catalog: catalog, name: name, version: version}
	s.tools = s.buildTools()
	return s
}

// ServeHTTP handles one JSON-RPC message per POST.
//
//	request      -> 200 with a JSON-RPC response
//	notification -> 202 with no body
//	GET          -> 405 (this server never opens a server-to-client stream)
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "This MCP endpoint accepts POST only.", http.StatusMethodNotAllowed)
		return
	}
	// After "initialize" a client repeats the negotiated version on every request.
	if v := r.Header.Get("MCP-Protocol-Version"); v != "" && !versionSupported(v) {
		writeRPC(w, http.StatusBadRequest, fail(nil, codeInvalidRequest, "Unsupported MCP-Protocol-Version "+v))
		return
	}

	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxRequestBytes))
	if err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeRPC(w, http.StatusRequestEntityTooLarge, fail(nil, codeInvalidRequest, "Request is too large."))
			return
		}
		writeRPC(w, http.StatusBadRequest, fail(nil, codeParseError, "Could not read the request body."))
		return
	}
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) > 0 && trimmed[0] == '[' {
		writeRPC(w, http.StatusBadRequest, fail(nil, codeInvalidRequest, "JSON-RPC batches are not supported; send one message per request."))
		return
	}
	var req request
	if err := json.Unmarshal(trimmed, &req); err != nil {
		writeRPC(w, http.StatusBadRequest, fail(nil, codeParseError, "Request body is not valid JSON."))
		return
	}
	if req.JSONRPC != "2.0" {
		writeRPC(w, http.StatusBadRequest, fail(req.ID, codeInvalidRequest, `"jsonrpc" must be "2.0".`))
		return
	}

	switch {
	case req.isResponse(), req.isNotification():
		// Nothing to answer: "notifications/initialized", "notifications/cancelled", ...
		w.WriteHeader(http.StatusAccepted)
		return
	case req.Method == "" || string(req.ID) == "null":
		writeRPC(w, http.StatusBadRequest, fail(req.ID, codeInvalidRequest, "Not a valid JSON-RPC request."))
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), callTimeout)
	defer cancel()
	writeRPC(w, http.StatusOK, s.dispatch(ctx, req))
}

func (s *Server) dispatch(ctx context.Context, req request) response {
	switch req.Method {
	case "initialize":
		return s.initialize(req)
	case "ping":
		return ok(req.ID, struct{}{})
	case "tools/list":
		return ok(req.ID, map[string]any{"tools": s.tools})
	case "tools/call":
		return s.callTool(ctx, req)
	default:
		return fail(req.ID, codeMethodNotFound, "Method not found: "+req.Method)
	}
}

func (s *Server) initialize(req request) response {
	var params struct {
		ProtocolVersion string `json:"protocolVersion"`
	}
	if err := json.Unmarshal(req.Params, &params); err != nil || params.ProtocolVersion == "" {
		return fail(req.ID, codeInvalidParams, "initialize requires params.protocolVersion.")
	}
	return ok(req.ID, map[string]any{
		"protocolVersion": negotiate(params.ProtocolVersion),
		// Only tools, and the list never changes while the server runs.
		"capabilities": map[string]any{"tools": map[string]any{"listChanged": false}},
		"serverInfo":   map[string]any{"name": s.name, "title": "Whetstone interview questions", "version": s.version},
		"instructions": "Whetstone is a bank of senior, lead and principal frontend interview questions. To quiz someone: " +
			"find a question with search_questions, show them only the prompt from get_question, let them answer in their own words, " +
			"then call get_question with reveal_answer=true and compare their answer with the model answer. " +
			"Do not reveal an answer before the user has attempted the question.",
	})
}

func (s *Server) callTool(ctx context.Context, req request) response {
	var params struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if err := json.Unmarshal(req.Params, &params); err != nil || params.Name == "" {
		return fail(req.ID, codeInvalidParams, "tools/call requires params.name.")
	}
	for _, t := range s.tools {
		if t.Name != params.Name {
			continue
		}
		result, err := t.call(ctx, params.Arguments)
		var user userError
		switch {
		case errors.As(err, &user):
			return ok(req.ID, toolResult{Content: text(user.Error()), IsError: true})
		case err != nil:
			// Details stay in the server log, never in the model's context.
			if s.Log != nil {
				s.Log.ErrorContext(ctx, "mcp tool failed", "tool", params.Name, "err", err)
			}
			return ok(req.ID, toolResult{Content: text("The server could not complete this request. Try again later."), IsError: true})
		}
		return ok(req.ID, result)
	}
	return fail(req.ID, codeInvalidParams, "Unknown tool: "+params.Name)
}

func writeRPC(w http.ResponseWriter, status int, body response) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
