// Package mcp is a small, dependency-free Model Context Protocol server.
//
// MCP is JSON-RPC 2.0 with a few agreed methods. This package implements the
// slice Whetstone needs, over the "Streamable HTTP" transport in its simplest
// legal form: one POST per message, answered with one JSON response.
//
//	initialize     version + capability handshake
//	ping           liveness
//	tools/list     what can the model call?
//	tools/call     call one tool
//	prompts/list   reusable starting points (quiz_me)
//	prompts/get    expand one into messages for the model
//
// Everything else answers "method not found". There is no session state, no
// server-to-client streaming and no server-initiated requests, which keeps the
// server stateless and therefore easy to run on a serverless platform.
package mcp

import "encoding/json"

// Protocol revisions this server can speak, newest first. The client proposes
// one in "initialize"; if we know it we echo it back, otherwise we answer with
// our newest and let the client decide whether it can live with that.
var supportedVersions = []string{"2025-11-25", "2025-06-18", "2025-03-26"}

// Standard JSON-RPC 2.0 error codes.
const (
	codeParseError     = -32700
	codeInvalidRequest = -32600
	codeMethodNotFound = -32601
	codeInvalidParams  = -32602
	codeInternalError  = -32603
)

// request is any message from the client. A message without an "id" is a
// notification and must not be answered with a JSON-RPC response.
type request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
	// Result and Error are only present on responses to requests the server
	// sent. We never send any, but must accept (and ignore) such messages.
	Result json.RawMessage `json:"result,omitempty"`
	Error  json.RawMessage `json:"error,omitempty"`
}

func (r request) isNotification() bool { return len(r.ID) == 0 && r.Method != "" }
func (r request) isResponse() bool     { return r.Method == "" && (len(r.Result) > 0 || len(r.Error) > 0) }

type response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func ok(id json.RawMessage, result any) response {
	return response{JSONRPC: "2.0", ID: id, Result: result}
}

func fail(id json.RawMessage, code int, message string) response {
	if len(id) == 0 {
		id = json.RawMessage("null") // errors for unparseable messages carry a null id
	}
	return response{JSONRPC: "2.0", ID: id, Error: &rpcError{Code: code, Message: message}}
}

// negotiate picks the protocol version for a session.
func negotiate(requested string) string {
	for _, v := range supportedVersions {
		if v == requested {
			return v
		}
	}
	return supportedVersions[0]
}

func versionSupported(v string) bool {
	for _, s := range supportedVersions {
		if s == v {
			return true
		}
	}
	return false
}
