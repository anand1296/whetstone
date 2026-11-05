package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/lib/pq"

	"github.com/anand1296/whetstone/backend/catalog"
)

// Topic idea statuses (what the reviewer decided).
const (
	IdeaPending   = "pending"
	IdeaAccepted  = "accepted"
	IdeaDeclined  = "declined"
	IdeaWithdrawn = "withdrawn"
)

// Stages are what the person sees. They are derived, never stored: an accepted idea
// moves from "writing" to "live" by itself when its draft questions are published.
const (
	StageReview    = "review"
	StageWriting   = "writing"
	StageLive      = "live"
	StageDeclined  = "declined"
	StageWithdrawn = "withdrawn"
)

// IdeaQuestion is a starter question that came with an idea.
type IdeaQuestion struct {
	ID         int64   `json:"id"`
	Title      string  `json:"title"`
	QuestionID *string `json:"questionId"`
	Level      string  `json:"level,omitempty"`
	// State: queued (not created yet), writing (draft exists), live (published).
	State string `json:"state"`
}

// Idea is a suggested topic (topic) with optional starter questions.
type Idea struct {
	ID             int64          `json:"id"`
	UserID         int64          `json:"-"`
	SubmitterLogin string         `json:"submitter"`
	SubmitterName  string         `json:"submitterName"`
	Title          string         `json:"title"`
	Facets         []string       `json:"facets"`
	Details        string         `json:"details"`
	Credit         bool           `json:"credit"`
	Status         string         `json:"status"`
	Stage          string         `json:"stage"`
	ReviewNote     string         `json:"reviewNote"`
	Reviewer       *string        `json:"reviewer"`
	SectionID      *string        `json:"sectionId"`
	SectionTitle   string         `json:"sectionTitle"`
	Questions      []IdeaQuestion `json:"questions"`
	CreatedAt      time.Time      `json:"createdAt"`
	ReviewedAt     *time.Time     `json:"reviewedAt"`

	sectionLive bool
}

const ideaColumns = `i.id, i.user_id, u.login, u.name, i.title, i.facets, i.details, i.credit, i.status, i.review_note, r.login,
	i.section_id, COALESCE(sec.title, ''),
	COALESCE(sec.published AND EXISTS (SELECT 1 FROM questions pq WHERE pq.section_id = sec.id AND pq.published), false),
	i.created_at, i.reviewed_at`

const ideaFrom = ` FROM topic_ideas i JOIN users u ON u.id = i.user_id LEFT JOIN users r ON r.id = i.reviewer_id LEFT JOIN sections sec ON sec.id = i.section_id`

func scanIdea(row scanner) (Idea, error) {
	var i Idea
	var reviewer, sectionID sql.NullString
	var reviewed sql.NullTime
	err := row.Scan(&i.ID, &i.UserID, &i.SubmitterLogin, &i.SubmitterName, &i.Title, pq.Array(&i.Facets), &i.Details, &i.Credit, &i.Status,
		&i.ReviewNote, &reviewer, &sectionID, &i.SectionTitle, &i.sectionLive, &i.CreatedAt, &reviewed)
	if errors.Is(err, sql.ErrNoRows) {
		return i, ErrNotFound
	}
	if reviewer.Valid {
		i.Reviewer = &reviewer.String
	}
	if sectionID.Valid {
		i.SectionID = &sectionID.String
	}
	if reviewed.Valid {
		i.ReviewedAt = &reviewed.Time
	}
	i.Questions = []IdeaQuestion{}
	if i.Facets == nil {
		i.Facets = []string{}
	}
	return i, err
}

// stage derives the person-facing stage from the status and the state of the content.
func (i *Idea) deriveStage() {
	switch i.Status {
	case IdeaPending:
		i.Stage = StageReview
	case IdeaDeclined:
		i.Stage = StageDeclined
	case IdeaWithdrawn:
		i.Stage = StageWithdrawn
	default:
		// Live when every kept starter question is published (or, with none, when the topic is).
		live := i.sectionLive
		if len(i.Questions) > 0 {
			live = true
			for _, q := range i.Questions {
				live = live && q.State == "live"
			}
		}
		if live {
			i.Stage = StageLive
		} else {
			i.Stage = StageWriting
		}
	}
}

// attachQuestions loads the starter questions for a set of ideas in one query.
func (s *Store) attachQuestions(ctx context.Context, ideas []Idea) error {
	if len(ideas) == 0 {
		return nil
	}
	ids := make([]int64, len(ideas))
	at := map[int64]int{}
	for n, i := range ideas {
		ids[n] = i.ID
		at[i.ID] = n
	}
	rows, err := s.db.QueryContext(ctx, `SELECT iq.idea_id, iq.id, iq.title, iq.question_id, q.id IS NOT NULL, COALESCE(q.published, false), COALESCE(q.level, '')
		FROM topic_idea_questions iq LEFT JOIN questions q ON q.id = iq.question_id
		WHERE iq.idea_id = ANY($1) ORDER BY iq.idea_id, iq.position, iq.id`, pq.Array(ids))
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var ideaID int64
		var q IdeaQuestion
		var qid sql.NullString
		var exists, published bool
		if err := rows.Scan(&ideaID, &q.ID, &q.Title, &qid, &exists, &published, &q.Level); err != nil {
			return err
		}
		switch {
		case !qid.Valid:
			q.State = "queued"
		case !exists:
			q.State = "removed"
		case published:
			q.State = "live"
			q.QuestionID = &qid.String
		default:
			q.State = "writing"
			q.QuestionID = &qid.String
		}
		if qid.Valid && !exists {
			q.QuestionID = nil
		}
		n := at[ideaID]
		ideas[n].Questions = append(ideas[n].Questions, q)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for n := range ideas {
		// "removed" questions were created and later deleted: they no longer count either way.
		kept := ideas[n].Questions[:0]
		for _, q := range ideas[n].Questions {
			if q.State != "removed" {
				kept = append(kept, q)
			}
		}
		ideas[n].Questions = kept
		ideas[n].deriveStage()
	}
	return nil
}

func (s *Store) listIdeas(ctx context.Context, where string, args ...any) ([]Idea, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+ideaColumns+ideaFrom+` WHERE `+where+` ORDER BY i.created_at DESC LIMIT 200`, args...)
	if err != nil {
		return nil, err
	}
	out := []Idea{}
	for rows.Next() {
		idea, err := scanIdea(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, idea)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, s.attachQuestions(ctx, out)
}

// GetIdea loads one idea with its starter questions.
func (s *Store) GetIdea(ctx context.Context, id int64) (Idea, error) {
	idea, err := scanIdea(s.db.QueryRowContext(ctx, `SELECT `+ideaColumns+ideaFrom+` WHERE i.id = $1`, id))
	if err != nil {
		return idea, err
	}
	list := []Idea{idea}
	if err := s.attachQuestions(ctx, list); err != nil {
		return idea, err
	}
	return list[0], nil
}

// UserIdeas lists one person's ideas, newest first.
func (s *Store) UserIdeas(ctx context.Context, userID int64) ([]Idea, error) {
	return s.listIdeas(ctx, `i.user_id = $1`, userID)
}

// IdeasByStatus lists ideas for review. "" = all; "open" = pending plus accepted-but-not-live.
func (s *Store) IdeasByStatus(ctx context.Context, status string) ([]Idea, error) {
	switch status {
	case "":
		return s.listIdeas(ctx, `TRUE`)
	case "open":
		all, err := s.listIdeas(ctx, `i.status = 'accepted'`)
		if err != nil {
			return nil, err
		}
		out := []Idea{}
		for _, i := range all {
			if i.Stage == StageWriting {
				out = append(out, i)
			}
		}
		return out, nil
	}
	return s.listIdeas(ctx, `i.status = $1`, status)
}

// CountPendingIdeas is the review queue length; with userID > 0, that user's pending count.
func (s *Store) CountPendingIdeas(ctx context.Context, userID int64) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM topic_ideas WHERE status = 'pending' AND ($1 = 0 OR user_id = $1)`, userID).Scan(&n)
	return n, err
}

// CountRecentIdeas counts a user's ideas since a time.
func (s *Store) CountRecentIdeas(ctx context.Context, userID int64, since time.Time) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM topic_ideas WHERE user_id = $1 AND created_at >= $2`, userID, since).Scan(&n)
	return n, err
}

// CreateIdea stores a pending idea with its starter questions.
func (s *Store) CreateIdea(ctx context.Context, idea Idea, questionTitles []string) (Idea, error) {
	var id int64
	err := s.inTx(ctx, func(tx *sql.Tx) error {
		facets := idea.Facets
		if facets == nil {
			facets = []string{}
		}
		if err := tx.QueryRowContext(ctx, `INSERT INTO topic_ideas (user_id, title, facets, details, credit) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
			idea.UserID, idea.Title, pq.Array(facets), idea.Details, idea.Credit).Scan(&id); err != nil {
			return err
		}
		for n, title := range questionTitles {
			if _, err := tx.ExecContext(ctx, `INSERT INTO topic_idea_questions (idea_id, position, title) VALUES ($1, $2, $3)`, id, n, title); err != nil {
				return err
			}
		}
		return audit(ctx, tx, idea.UserID, "idea.created", idea.Title, map[string]any{"id": id})
	})
	if err != nil {
		return Idea{}, err
	}
	return s.GetIdea(ctx, id)
}

// WithdrawIdea lets the submitter take back a pending idea.
func (s *Store) WithdrawIdea(ctx context.Context, userID, id int64) error {
	res, err := s.db.ExecContext(ctx, `UPDATE topic_ideas SET status = 'withdrawn' WHERE id = $1 AND user_id = $2 AND status = 'pending'`, id, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotPending
	}
	return nil
}

// DeclineIdea closes a pending idea with a note for the submitter.
func (s *Store) DeclineIdea(ctx context.Context, actorID, id int64, note string, now time.Time) (Idea, error) {
	err := s.inTx(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `UPDATE topic_ideas SET status = 'declined', reviewer_id = $2, review_note = $3, reviewed_at = $4
			WHERE id = $1 AND status = 'pending'`, id, actorID, note, now)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return ErrNotPending
		}
		return audit(ctx, tx, actorID, "idea.declined", "", map[string]any{"id": id})
	})
	if err != nil {
		return Idea{}, err
	}
	return s.GetIdea(ctx, id)
}

// AcceptItem is one starter question to create as a draft.
type AcceptItem struct {
	IdeaQuestionID int64
	Question       catalog.Question // ID may be empty: one is derived from the title
	Compiled       catalog.Compiled
}

// AcceptParams describes what accepting an idea creates.
type AcceptParams struct {
	NewSection *catalog.Section // create this topic (as a draft) ...
	SectionID  string           // ... or add the questions to this existing topic
	Items      []AcceptItem
	Note       string
}

func uniqueID(ctx context.Context, tx *sql.Tx, base string) (string, error) {
	if base == "" {
		base = "question"
	}
	id := base
	for n := 2; n < 100; n++ {
		taken, err := idTaken(ctx, tx, id)
		if err != nil {
			return "", err
		}
		if !taken && catalog.ValidID(id) {
			return id, nil
		}
		id = fmt.Sprintf("%s-%d", base, n)
	}
	return "", ErrIDTaken
}

// AcceptIdea creates the draft topic and draft questions and marks the idea
// accepted, in one transaction. The questions stay drafts until an admin
// writes the answers and publishes them; the idea's stage follows on its own.
func (s *Store) AcceptIdea(ctx context.Context, actorID, id int64, p AcceptParams, now time.Time) (Idea, error) {
	err := s.inTx(ctx, func(tx *sql.Tx) error {
		if err := lock(ctx, tx, lockContent); err != nil {
			return err
		}
		var userID int64
		var status string
		var credit bool
		err := tx.QueryRowContext(ctx, `SELECT user_id, status, credit FROM topic_ideas WHERE id = $1 FOR UPDATE`, id).Scan(&userID, &status, &credit)
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if status != IdeaPending {
			return ErrNotPending
		}
		sectionID := p.SectionID
		if p.NewSection != nil {
			sectionID = p.NewSection.ID
			if err := insertSection(ctx, tx, actorID, *p.NewSection); err != nil {
				return err
			}
		} else if err := sectionExists(ctx, tx, sectionID); err != nil {
			return err
		}
		for _, item := range p.Items {
			q := item.Question
			q.SectionID = sectionID
			if q.ID == "" {
				if q.ID, err = uniqueID(ctx, tx, catalog.Slug(q.Title)); err != nil {
					return err
				}
			}
			if err := insertQuestion(ctx, tx, actorID, q, item.Compiled); err != nil {
				return err
			}
			if credit {
				if _, err := tx.ExecContext(ctx, `UPDATE questions SET contributed_by = $2 WHERE id = $1`, q.ID, userID); err != nil {
					return err
				}
			}
			if _, err := tx.ExecContext(ctx, `UPDATE topic_idea_questions SET question_id = $3 WHERE id = $1 AND idea_id = $2`, item.IdeaQuestionID, id, q.ID); err != nil {
				return err
			}
		}
		// Starter questions the reviewer did not keep are dropped, so they can't hold the idea back from "live".
		kept := make([]int64, 0, len(p.Items))
		for _, item := range p.Items {
			kept = append(kept, item.IdeaQuestionID)
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM topic_idea_questions WHERE idea_id = $1 AND NOT (id = ANY($2))`, id, pq.Array(kept)); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE topic_ideas SET status = 'accepted', reviewer_id = $2, review_note = $3, reviewed_at = $4, section_id = $5 WHERE id = $1`,
			id, actorID, p.Note, now, sectionID); err != nil {
			return err
		}
		if err := bumpVersion(ctx, tx); err != nil {
			return err
		}
		return audit(ctx, tx, actorID, "idea.accepted", sectionID, map[string]any{"id": id, "questions": len(p.Items), "newRound": p.NewSection != nil})
	})
	if err != nil {
		return Idea{}, err
	}
	return s.GetIdea(ctx, id)
}
