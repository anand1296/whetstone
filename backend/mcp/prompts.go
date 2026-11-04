package mcp

import (
	"encoding/json"
	"strings"
)

// Prompts are reusable, user-chosen starting points (in most clients a slash
// command). They do not run anything: prompts/get returns messages that the
// client puts in front of the model, which then drives the tools above.
//
// quiz_me is the whole "mock interview" feature: the rules live here, in one
// place, instead of being re-typed by every user in every chat.

type promptArgument struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Required    bool   `json:"required"`
}

type prompt struct {
	Name        string           `json:"name"`
	Title       string           `json:"title"`
	Description string           `json:"description"`
	Arguments   []promptArgument `json:"arguments"`
}

var prompts = []prompt{{
	Name:        "quiz_me",
	Title:       "Quiz me",
	Description: "Run a mock interview: one question at a time, the answer hidden until you have tried, then a comparison with the model answer.",
	Arguments: []promptArgument{
		{Name: "topic", Description: "What to be quizzed on, e.g. \"react rendering\" or \"web performance\". Leave empty for a mixed round.", Required: false},
		{Name: "level", Description: "senior, lead or principal. Leave empty for any.", Required: false},
		{Name: "questions", Description: "How many questions to ask (1-10). Default 3.", Required: false},
	},
}}

type promptMessage struct {
	Role    string `json:"role"`
	Content struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
}

func (s *Server) listPrompts(req request) response {
	return ok(req.ID, map[string]any{"prompts": prompts})
}

func (s *Server) getPrompt(req request) response {
	var params struct {
		Name      string            `json:"name"`
		Arguments map[string]string `json:"arguments"`
	}
	if err := json.Unmarshal(req.Params, &params); err != nil || params.Name == "" {
		return fail(req.ID, codeInvalidParams, "prompts/get requires params.name.")
	}
	if params.Name != "quiz_me" {
		return fail(req.ID, codeInvalidParams, "Unknown prompt: "+params.Name)
	}
	topic := strings.TrimSpace(params.Arguments["topic"])
	level := strings.ToLower(strings.TrimSpace(params.Arguments["level"]))
	count := 3
	if n := strings.TrimSpace(params.Arguments["questions"]); n != "" {
		v := 0
		for _, r := range n {
			if r < '0' || r > '9' {
				v = 0
				break
			}
			v = v*10 + int(r-'0')
			if v > 10 {
				break
			}
		}
		if v >= 1 && v <= 10 {
			count = v
		}
	}
	if level != "" && level != "senior" && level != "lead" && level != "principal" {
		return fail(req.ID, codeInvalidParams, "level must be senior, lead or principal.")
	}
	return ok(req.ID, map[string]any{
		"description": "A mock interview from the Whetstone question bank.",
		"messages":    []promptMessage{userMessage(quizInstructions(topic, level, count))},
	})
}

func userMessage(text string) promptMessage {
	m := promptMessage{Role: "user"}
	m.Content.Type = "text"
	m.Content.Text = text
	return m
}

func quizInstructions(topic, level string, count int) string {
	var b strings.Builder
	b.WriteString("Run a mock interview for me using the Whetstone tools. Play a friendly but rigorous interviewer.\n\n")
	b.WriteString("Setup\n")
	if topic != "" {
		b.WriteString("- Topic: " + topic + ". Use search_questions to find matching questions.\n")
	} else {
		b.WriteString("- No topic was given: use list_rounds, then pick questions from different rounds.\n")
	}
	if level != "" {
		b.WriteString("- Level: " + level + " only.\n")
	}
	b.WriteString("- Ask exactly " + itoa(count) + " question(s), one at a time.\n\n")
	b.WriteString("For each question\n")
	b.WriteString("1. Call get_question WITHOUT reveal_answer. Show me only the title and the interview prompt. Never show the answer, summary or hints yet.\n")
	b.WriteString("2. Stop and wait for my answer. If I say \"skip\" or \"I don't know\", that counts as an attempt.\n")
	b.WriteString("3. Only after I have answered, call get_question again with reveal_answer=true.\n")
	b.WriteString("4. Compare my answer with the model answer: what I got right, what I missed, and the one thing that would most improve it. Be specific and brief.\n")
	b.WriteString("5. Give the question's id so I can open it in the app, then ask the next question.\n\n")
	b.WriteString("At the end, summarise: a rough level for this session, my strongest area, and the two things to study next (with question ids).\n\n")
	b.WriteString("Start now with the first question.")
	return b.String()
}

func itoa(n int) string {
	if n == 10 {
		return "10"
	}
	return string(rune('0' + n))
}
