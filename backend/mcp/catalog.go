package mcp

import (
	"context"
	"errors"
)

// ErrNotFound is returned by a Catalog when a question does not exist or is not published.
var ErrNotFound = errors.New("not found")

// QuestionInfo is a question without its answer.
type QuestionInfo struct {
	ID         string
	Title      string
	Level      string
	Tags       []string
	Minutes    int
	SearchText string // lower-cased text used for matching; never shown to the model
}

// Round is a group of questions.
type Round struct {
	ID          string
	Title       string
	Description string
	Questions   []QuestionInfo
}

// Question is one published question with its Markdown source.
type Question struct {
	QuestionInfo
	RoundID    string
	RoundTitle string
	Body       string
}

// Catalog is everything the tools need from the application. Keeping it small
// and free of HTTP and SQL means the protocol code is testable without a database.
type Catalog interface {
	// Outline returns the published rounds and their published questions.
	Outline(ctx context.Context) ([]Round, error)
	// Question returns one published question, or ErrNotFound.
	Question(ctx context.Context, id string) (Question, error)
}
