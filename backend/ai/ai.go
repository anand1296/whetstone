// Package ai is a small client for the Anthropic Messages API, used only by admin tools
// (drafting answers for questions). It is optional: with no API key the server simply
// does not offer those tools. The key is read from the environment and never logged.
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	DefaultModel   = "claude-sonnet-5-5"
	DefaultBaseURL = "https://api.anthropic.com"
	apiVersion     = "2023-06-01"
)

// Client calls the Messages API. The zero value is not usable; use New.
type Client struct {
	key, model, base string
	http             *http.Client
}

// New returns nil when key is empty (the feature is off).
func New(key, model, baseURL string) *Client {
	key = strings.TrimSpace(key)
	if key == "" {
		return nil
	}
	if model == "" {
		model = DefaultModel
	}
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	return &Client{key: key, model: model, base: strings.TrimRight(baseURL, "/"), http: &http.Client{Timeout: 55 * time.Second}}
}

// Model is the model id requests are sent to.
func (c *Client) Model() string { return c.model }

// Result is one completion.
type Result struct {
	Text         string
	InputTokens  int
	OutputTokens int
}

// Error carries a message that is safe to show an admin (it never contains the key).
type Error struct {
	Status  int
	Message string
}

func (e *Error) Error() string { return e.Message }

// Message is one turn of the conversation.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Complete sends a conversation and returns the model's text.
func (c *Client) Complete(ctx context.Context, system string, messages []Message, maxTokens int) (Result, error) {
	payload, err := json.Marshal(map[string]any{
		"model":      c.model,
		"max_tokens": maxTokens,
		"system":     system,
		"messages":   messages,
	})
	if err != nil {
		return Result{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.base+"/v1/messages", bytes.NewReader(payload))
	if err != nil {
		return Result{}, err
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-api-key", c.key)
	req.Header.Set("anthropic-version", apiVersion)
	res, err := c.http.Do(req)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return Result{}, &Error{Status: http.StatusGatewayTimeout, Message: "The AI provider took too long to answer. Try again."}
		}
		return Result{}, &Error{Status: http.StatusBadGateway, Message: "Could not reach the AI provider."}
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if res.StatusCode != http.StatusOK {
		return Result{}, &Error{Status: http.StatusBadGateway, Message: providerMessage(res.StatusCode, raw)}
	}
	var out struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		Usage struct {
			Input  int `json:"input_tokens"`
			Output int `json:"output_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return Result{}, &Error{Status: http.StatusBadGateway, Message: "The AI provider sent a reply that could not be read."}
	}
	var text strings.Builder
	for _, block := range out.Content {
		if block.Type == "text" {
			text.WriteString(block.Text)
		}
	}
	if strings.TrimSpace(text.String()) == "" {
		return Result{}, &Error{Status: http.StatusBadGateway, Message: "The AI provider returned an empty answer."}
	}
	return Result{Text: text.String(), InputTokens: out.Usage.Input, OutputTokens: out.Usage.Output}, nil
}

// providerMessage maps a provider failure to a short, key-free explanation.
func providerMessage(status int, raw []byte) string {
	var body struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	_ = json.Unmarshal(raw, &body)
	switch status {
	case http.StatusUnauthorized, http.StatusForbidden:
		return "The AI provider rejected the API key. Check the key in the deployment settings."
	case http.StatusTooManyRequests:
		return "The AI provider is rate limiting requests. Try again in a minute."
	case http.StatusNotFound:
		return "The AI provider does not know that model. Check AI_MODEL in the deployment settings."
	}
	msg := strings.TrimSpace(body.Error.Message)
	if msg == "" {
		return fmt.Sprintf("The AI provider returned an error (HTTP %d).", status)
	}
	if len(msg) > 200 {
		msg = msg[:200]
	}
	return "The AI provider returned an error: " + msg
}
