package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"unicode"
)

// toolResult is the body of a tools/call result.
//
// MCP separates two kinds of failure on purpose. A JSON-RPC error (bad method,
// unknown tool) means the *protocol* was misused. A result with isError=true
// means the tool ran but could not do what was asked; the text is written for
// the model, so it can read it and try again with better arguments.
type toolResult struct {
	Content           []textContent `json:"content"`
	StructuredContent any           `json:"structuredContent,omitempty"`
	IsError           bool          `json:"isError,omitempty"`
}

type textContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

func text(s string) []textContent { return []textContent{{Type: "text", Text: s}} }

// userError is a failure the model can recover from.
type userError string

func (e userError) Error() string { return string(e) }

type tool struct {
	Name        string         `json:"name"`
	Title       string         `json:"title"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
	Annotations map[string]any `json:"annotations"`
	call        func(ctx context.Context, args json.RawMessage) (toolResult, error)
}

// Every tool is read-only and touches only this server's own data.
var readOnly = map[string]any{
	"readOnlyHint":    true,
	"destructiveHint": false,
	"idempotentHint":  true,
	"openWorldHint":   false,
}

func (s *Server) buildTools() []tool {
	return []tool{
		{
			Name:  "list_rounds",
			Title: "List interview rounds",
			Description: "List the rounds (topic groups) of the Whetstone frontend interview question bank, each with its id, title, " +
				"description and number of questions. Use a round id to narrow search_questions.",
			InputSchema: object(nil, nil),
			Annotations: readOnly,
			call:        s.listRounds,
		},
		{
			Name:  "search_questions",
			Title: "Search interview questions",
			Description: "Search Whetstone's senior, lead and principal frontend interview questions by keywords (matches titles, tags and text). " +
				"Returns metadata only (id, title, round, level, tags, minutes), never answers. Pass an id to get_question to read one.",
			InputSchema: object(map[string]any{
				"query": map[string]any{"type": "string", "minLength": 1, "maxLength": 100, "description": "Keywords, e.g. \"react suspense\" or \"csrf cookies\". Every word must match."},
				"round": map[string]any{"type": "string", "description": "Optional round id from list_rounds to search within."},
				"level": map[string]any{"type": "string", "enum": []string{"senior", "lead", "principal"}, "description": "Optional seniority filter."},
				"limit": map[string]any{"type": "integer", "minimum": 1, "maximum": 20, "default": 10, "description": "Maximum results."},
			}, []string{"query"}),
			Annotations: readOnly,
			call:        s.searchQuestions,
		},
		{
			Name:  "get_question",
			Title: "Get an interview question",
			Description: "Get one interview question by id. By default returns only the question prompt (scenario, requirements, test cases) " +
				"and hides the model answer, so you can quiz the user first: show them the prompt, let them answer, then call this again with " +
				"reveal_answer=true to compare. Answers can be long; pass framework to keep only React, Angular or Vue code.",
			InputSchema: object(map[string]any{
				"id":            map[string]any{"type": "string", "description": "Question id from search_questions."},
				"reveal_answer": map[string]any{"type": "boolean", "default": false, "description": "Include the full model answer. Only set this after the user has attempted the question."},
				"framework":     map[string]any{"type": "string", "enum": []string{"react", "angular", "vue"}, "description": "With reveal_answer: keep code for this framework only (shared text is always kept)."},
			}, []string{"id"}),
			Annotations: readOnly,
			call:        s.getQuestion,
		},
	}
}

// object builds a JSON Schema for a tool's arguments.
func object(props map[string]any, required []string) map[string]any {
	if props == nil {
		props = map[string]any{}
	}
	schema := map[string]any{"type": "object", "properties": props, "additionalProperties": false}
	if len(required) > 0 {
		schema["required"] = required
	}
	return schema
}

// decodeArgs parses tool arguments strictly: unknown keys are an error the model can read and fix.
func decodeArgs(raw json.RawMessage, into any) error {
	if len(bytes.TrimSpace(raw)) == 0 {
		raw = json.RawMessage("{}")
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(into); err != nil {
		return userError("Invalid arguments: " + err.Error())
	}
	return nil
}

func jsonResult(summary string, structured any) (toolResult, error) {
	pretty, err := json.MarshalIndent(structured, "", "  ")
	if err != nil {
		return toolResult{}, err
	}
	if summary != "" {
		summary += "\n\n"
	}
	return toolResult{Content: text(summary + string(pretty)), StructuredContent: structured}, nil
}

/* ---------------------------------------------------------------- list_rounds */

func (s *Server) listRounds(ctx context.Context, args json.RawMessage) (toolResult, error) {
	var in struct{}
	if err := decodeArgs(args, &in); err != nil {
		return toolResult{}, err
	}
	rounds, err := s.catalog.Outline(ctx)
	if err != nil {
		return toolResult{}, err
	}
	type roundOut struct {
		ID            string `json:"id"`
		Title         string `json:"title"`
		Description   string `json:"description"`
		QuestionCount int    `json:"questionCount"`
	}
	out := make([]roundOut, 0, len(rounds))
	for _, r := range rounds {
		out = append(out, roundOut{r.ID, r.Title, r.Description, len(r.Questions)})
	}
	return jsonResult("", map[string]any{"rounds": out})
}

/* ---------------------------------------------------------------- search_questions */

func (s *Server) searchQuestions(ctx context.Context, args json.RawMessage) (toolResult, error) {
	var in struct {
		Query string `json:"query"`
		Round string `json:"round"`
		Level string `json:"level"`
		Limit int    `json:"limit"`
	}
	if err := decodeArgs(args, &in); err != nil {
		return toolResult{}, err
	}
	tokens := tokenize(in.Query)
	switch {
	case len(tokens) == 0:
		return toolResult{}, userError("query must contain at least one keyword.")
	case len(in.Query) > 100:
		return toolResult{}, userError("query must be at most 100 characters.")
	case in.Level != "" && in.Level != "senior" && in.Level != "lead" && in.Level != "principal":
		return toolResult{}, userError(`level must be "senior", "lead" or "principal".`)
	case in.Limit < 0 || in.Limit > 20:
		return toolResult{}, userError("limit must be between 1 and 20.")
	}
	if in.Limit == 0 {
		in.Limit = 10
	}
	rounds, err := s.catalog.Outline(ctx)
	if err != nil {
		return toolResult{}, err
	}
	if in.Round != "" && !hasRound(rounds, in.Round) {
		return toolResult{}, userError(fmt.Sprintf("Unknown round %q. Call list_rounds to see valid ids.", in.Round))
	}

	type hit struct {
		round string
		q     QuestionInfo
		score int
		order int
	}
	var hits []hit
	order := 0
	for _, r := range rounds {
		for _, q := range r.Questions {
			order++
			if (in.Round != "" && r.ID != in.Round) || (in.Level != "" && q.Level != in.Level) {
				continue
			}
			total, matched := 0, true
			for _, token := range tokens {
				score := scoreToken(r.Title, q, token)
				if score == 0 {
					matched = false
					break
				}
				total += score
			}
			if matched {
				hits = append(hits, hit{r.ID, q, total, order})
			}
		}
	}
	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].score != hits[j].score {
			return hits[i].score > hits[j].score
		}
		return hits[i].order < hits[j].order
	})
	if len(hits) > in.Limit {
		hits = hits[:in.Limit]
	}

	type questionOut struct {
		ID      string   `json:"id"`
		Title   string   `json:"title"`
		Round   string   `json:"round"`
		Level   string   `json:"level"`
		Tags    []string `json:"tags"`
		Minutes int      `json:"minutes"`
	}
	out := make([]questionOut, 0, len(hits))
	for _, h := range hits {
		tags := h.q.Tags
		if tags == nil {
			tags = []string{}
		}
		out = append(out, questionOut{h.q.ID, h.q.Title, h.round, h.q.Level, tags, h.q.Minutes})
	}
	summary := fmt.Sprintf("%d question(s) match %q.", len(out), strings.TrimSpace(in.Query))
	if len(out) == 0 {
		summary += " Try fewer or broader keywords."
	}
	return jsonResult(summary, map[string]any{"questions": out})
}

func hasRound(rounds []Round, id string) bool {
	for _, r := range rounds {
		if r.ID == id {
			return true
		}
	}
	return false
}

// tokenize and scoreToken mirror the weights of the in-app search (src/lib/search.ts):
// title beats tags, tags beat body text, and every keyword must match somewhere.
func tokenize(query string) []string {
	return strings.FieldsFunc(strings.ToLower(query), func(r rune) bool { return unicode.IsSpace(r) || r == ',' })
}

func scoreToken(roundTitle string, q QuestionInfo, token string) int {
	score := 0
	title := " " + strings.ToLower(strings.ReplaceAll(q.Title, "`", ""))
	switch {
	case strings.Contains(title, " "+token):
		score += 12
	case strings.Contains(title, token):
		score += 8
	}
	prefix, contains := false, false
	for _, tag := range q.Tags {
		tag = strings.ToLower(tag)
		if strings.HasPrefix(tag, token) {
			prefix = true
		} else if strings.Contains(tag, token) {
			contains = true
		}
	}
	if prefix {
		score += 6
	} else if contains {
		score += 3
	}
	if strings.Contains(strings.ToLower(roundTitle)+" "+q.SearchText, token) {
		score++
	}
	return score
}

/* ---------------------------------------------------------------- get_question */

func (s *Server) getQuestion(ctx context.Context, args json.RawMessage) (toolResult, error) {
	var in struct {
		ID           string `json:"id"`
		RevealAnswer bool   `json:"reveal_answer"`
		Framework    string `json:"framework"`
	}
	if err := decodeArgs(args, &in); err != nil {
		return toolResult{}, err
	}
	switch {
	case in.ID == "" || len(in.ID) > 100:
		return toolResult{}, userError("id is required (use search_questions to find one).")
	case in.Framework != "" && in.Framework != "react" && in.Framework != "angular" && in.Framework != "vue":
		return toolResult{}, userError(`framework must be "react", "angular" or "vue".`)
	}
	q, err := s.catalog.Question(ctx, in.ID)
	if errors.Is(err, ErrNotFound) {
		return toolResult{}, userError(fmt.Sprintf("No question with id %q. Use search_questions to find valid ids.", in.ID))
	}
	if err != nil {
		return toolResult{}, err
	}

	tags := q.Tags
	if tags == nil {
		tags = []string{}
	}
	meta := map[string]any{
		"id": q.ID, "title": q.Title, "round": q.RoundTitle, "roundId": q.RoundID,
		"level": q.Level, "tags": tags, "minutes": q.Minutes, "answerRevealed": in.RevealAnswer,
	}
	header := fmt.Sprintf("# %s\n\n%s · %s · about %d min\n\n", q.Title, q.RoundTitle, q.Level, q.Minutes)

	if in.RevealAnswer {
		body := strings.TrimSpace(filterFramework(q.Body, in.Framework))
		return toolResult{Content: text(header + body), StructuredContent: meta}, nil
	}
	prompt := extractPrompt(q.Body)
	if prompt == "" {
		prompt = "(This question has no separate prompt. Ask the user the question in the title.)"
	}
	note := "\n\n---\nThe model answer is hidden. Let the user answer first, then call get_question again with reveal_answer=true to compare."
	return toolResult{Content: text(header + prompt + note), StructuredContent: meta}, nil
}

var (
	fenceRe = regexp.MustCompile("^ {0,3}(`{3,}|~{3,})")
	openRe  = regexp.MustCompile(`^:::([a-z]+)\s*$`)
	closeRe = regexp.MustCompile(`^:::\s*$`)
)

// extractPrompt returns the "> [!PROMPT]" callout: the scenario, requirements
// and test cases, without the model answer that follows it.
func extractPrompt(body string) string {
	lines := strings.Split(body, "\n")
	start := -1
	for i, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "> [!PROMPT]") {
			start = i
			break
		}
	}
	if start < 0 {
		return ""
	}
	var out []string
	for _, line := range lines[start+1:] {
		line = strings.TrimRight(line, "\r")
		if !strings.HasPrefix(line, ">") {
			break
		}
		out = append(out, strings.TrimPrefix(strings.TrimPrefix(line, ">"), " "))
	}
	return strings.TrimSpace(strings.Join(out, "\n"))
}

// filterFramework drops the ":::react|angular|vue" containers that do not match
// framework and unwraps the one that does. Containers inside code fences are
// code, not structure. An empty framework returns the body unchanged.
func filterFramework(body, framework string) string {
	if framework == "" {
		return body
	}
	var out []string
	fence := ""
	inBlock, skip := false, false
	for _, line := range strings.Split(body, "\n") {
		trimmed := strings.TrimRight(line, "\r")
		if m := fenceRe.FindStringSubmatch(trimmed); m != nil {
			marker := m[1]
			if fence == "" {
				fence = marker
			} else if marker[0] == fence[0] && len(marker) >= len(fence) && strings.TrimSpace(trimmed) == marker {
				fence = ""
			}
			if !skip {
				out = append(out, line)
			}
			continue
		}
		if fence != "" {
			if !skip {
				out = append(out, line)
			}
			continue
		}
		if m := openRe.FindStringSubmatch(trimmed); m != nil {
			inBlock, skip = true, m[1] != framework
			continue
		}
		if inBlock && closeRe.MatchString(trimmed) {
			inBlock, skip = false, false
			continue
		}
		if !skip {
			out = append(out, line)
		}
	}
	return strings.Join(out, "\n")
}
