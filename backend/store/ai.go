package store

import (
	"context"
	"time"
)

// RecordAIGeneration logs one AI call (for the daily cap and a usage readout).
func (s *Store) RecordAIGeneration(ctx context.Context, userID int64, kind, subject, model string, inTokens, outTokens int) error {
	if len(subject) > 200 {
		subject = subject[:200]
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO ai_generations (user_id, kind, subject, model, input_tokens, output_tokens) VALUES ($1, $2, $3, $4, $5, $6)`,
		userID, kind, subject, model, inTokens, outTokens)
	return err
}

// CountAIGenerationsSince counts AI calls since the given time.
func (s *Store) CountAIGenerationsSince(ctx context.Context, since time.Time) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_generations WHERE created_at >= $1`, since).Scan(&n)
	return n, err
}
