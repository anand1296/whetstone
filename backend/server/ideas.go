package server

import (
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/anand1296/whetstone/backend/catalog"
	"github.com/anand1296/whetstone/backend/store"
)

// Topic ideas: any signed-in person can suggest a new category ("Kubernetes
// for SREs") with a few optional starter questions. An admin accepts it, which
// creates a draft topic and draft questions, or declines it with a note.
// Progress is derived from the content itself: the idea reads "being written"
// until its draft questions are published, then "live".

const (
	ideasPerDay      = 5
	maxPendingIdeas  = 10
	maxIdeaFacets    = 6
	maxIdeaQuestions = 5
	maxIdeaDetails   = 1000
)

type ideaInput struct {
	Title     string   `json:"title"`
	Facets    []string `json:"facets"`
	Details   string   `json:"details"`
	Questions []string `json:"questions"`
	Credit    bool     `json:"credit"`
}

func (in *ideaInput) check() catalog.Problems {
	var p catalog.Problems
	add := func(field, format string, args ...any) {
		p = append(p, catalog.FieldError{Field: field, Message: fmt.Sprintf(format, args...)})
	}
	in.Title = strings.TrimSpace(in.Title)
	in.Details = strings.TrimSpace(in.Details)
	in.Facets = catalog.NormalizeFacets(in.Facets)
	if n := utf8.RuneCountInString(in.Title); n < 3 || n > 80 || strings.ContainsAny(in.Title, "\n\r") {
		add("title", "give the topic a short name, 3 to 80 characters")
	}
	if len(in.Facets) > maxIdeaFacets {
		add("facets", "pick at most %d chips", maxIdeaFacets)
	}
	for _, t := range in.Facets {
		if !catalog.ValidFacet(t) {
			add("facets", "unknown chip %q", t)
			break
		}
	}
	if utf8.RuneCountInString(in.Details) > maxIdeaDetails {
		add("details", "must be at most %d characters", maxIdeaDetails)
	}
	questions := make([]string, 0, len(in.Questions))
	for _, q := range in.Questions {
		if q = strings.TrimSpace(q); q != "" {
			questions = append(questions, q)
		}
	}
	in.Questions = questions
	if len(questions) > maxIdeaQuestions {
		add("questions", "add at most %d starter questions", maxIdeaQuestions)
	}
	for _, q := range questions {
		if n := utf8.RuneCountInString(q); n < 10 || n > catalog.MaxTitle || strings.ContainsAny(q, "\n\r") {
			add("questions", "each question should be one line, 10 to %d characters", catalog.MaxTitle)
			break
		}
	}
	return p
}

func (s *Server) createIdea(w http.ResponseWriter, r *http.Request, user store.User) {
	if !s.contributeOn(r) {
		writeError(w, http.StatusForbidden, "disabled", "Suggestions are switched off for this site.")
		return
	}
	var in ideaInput
	if !decode(w, r, &in) {
		return
	}
	if problems := in.check(); len(problems) > 0 {
		writeProblems(w, problems)
		return
	}
	recent, err := s.store.CountRecentIdeas(r.Context(), user.ID, s.now().Add(-24*time.Hour))
	if err != nil {
		s.storeError(w, r, err)
		return
	}
	pending, err := s.store.CountPendingIdeas(r.Context(), user.ID)
	if err != nil {
		s.storeError(w, r, err)
		return
	}
	if recent >= ideasPerDay || pending >= maxPendingIdeas {
		writeError(w, http.StatusTooManyRequests, "rate_limited", fmt.Sprintf("You can suggest %d facets a day and have %d waiting at a time. Thank you for the enthusiasm!", ideasPerDay, maxPendingIdeas))
		return
	}
	idea, err := s.store.CreateIdea(r.Context(), store.Idea{UserID: user.ID, Title: in.Title, Facets: in.Facets, Details: in.Details, Credit: in.Credit}, in.Questions)
	if err != nil {
		s.storeError(w, r, err)
		return
	}
	s.notifyOwnerOfIdea(r, idea)
	writeJSON(w, http.StatusCreated, idea)
}

func (s *Server) myIdeas(w http.ResponseWriter, r *http.Request, user store.User) {
	ideas, err := s.store.UserIdeas(r.Context(), user.ID)
	if err != nil {
		s.storeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, ideas)
}

func (s *Server) withdrawIdea(w http.ResponseWriter, r *http.Request, user store.User) {
	id, ok := pathID(r)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid", "bad idea id")
		return
	}
	if err := s.store.WithdrawIdea(r.Context(), user.ID, id); err != nil {
		s.submissionError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

/* ---------------------------------------------------------------- admin review */

func (s *Server) listIdeas(w http.ResponseWriter, r *http.Request, _ store.User) {
	status := r.URL.Query().Get("status")
	switch status {
	case "all":
		status = ""
	case "":
		status = store.IdeaPending
	}
	ideas, err := s.store.IdeasByStatus(r.Context(), status)
	if err != nil {
		s.storeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, ideas)
}

// draftScaffold is the placeholder body of a starter question until its answer is written.
const draftScaffold = "> [!TLDR]\n> The answer to this question is being written.\n\n_Coming soon._"

// acceptIdea creates the draft topic (or adds to an existing one) and a draft
// question per kept starter question, then closes the idea. The admin writes
// the answers afterwards, in the normal content editor.
func (s *Server) acceptIdea(w http.ResponseWriter, r *http.Request, actor store.User) {
	id, ok := pathID(r)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid", "bad idea id")
		return
	}
	var in struct {
		SectionID  string `json:"sectionId"`
		NewSection *struct {
			ID          string   `json:"id"`
			Title       string   `json:"title"`
			Description string   `json:"description"`
			Facets      []string `json:"facets"`
		} `json:"newSection"`
		Questions []struct {
			IdeaQuestionID int64  `json:"ideaQuestionId"`
			Title          string `json:"title"`
			Level          string `json:"level"`
		} `json:"questions"`
		Note string `json:"note"`
	}
	if !decode(w, r, &in) {
		return
	}
	params := store.AcceptParams{Note: strings.TrimSpace(in.Note), SectionID: strings.TrimSpace(in.SectionID)}
	var problems catalog.Problems
	tags := []string{"community"}
	switch {
	case in.NewSection != nil:
		sec := catalog.Section{ID: in.NewSection.ID, Title: in.NewSection.Title, Description: in.NewSection.Description, Facets: in.NewSection.Facets, Published: false}
		sec.Normalize()
		problems = append(problems, prefixProblems("newSection", sec.Validate())...)
		params.NewSection = &sec
		params.SectionID = ""
		tags = append(append([]string{}, sec.Facets...), "community")
	case params.SectionID == "":
		problems = append(problems, catalog.FieldError{Field: "sectionId", Message: "pick an existing topic or create a new one"})
	}
	if len(in.Questions) > maxIdeaQuestions {
		problems = append(problems, catalog.FieldError{Field: "questions", Message: "too many questions"})
	}
	for _, item := range in.Questions {
		q := catalog.Question{Title: item.Title, Level: item.Level, Tags: tags, Minutes: 10, Body: draftScaffold, Published: false}
		q.Normalize()
		if q.Level == "" {
			q.Level = "senior"
		}
		q.ID = "draft"
		compiled, qp := s.compiler.Check(q)
		q.ID = ""
		problems = append(problems, prefixProblems("questions", qp)...)
		params.Items = append(params.Items, store.AcceptItem{IdeaQuestionID: item.IdeaQuestionID, Question: q, Compiled: compiled})
	}
	if len(problems) > 0 {
		writeProblems(w, problems)
		return
	}
	idea, err := s.store.AcceptIdea(r.Context(), actor.ID, id, params, s.now())
	if err != nil {
		s.submissionError(w, r, err)
		return
	}
	s.notifyIdeaSubmitter(r, idea)
	writeJSON(w, http.StatusOK, idea)
}

func prefixProblems(prefix string, p catalog.Problems) catalog.Problems {
	out := make(catalog.Problems, 0, len(p))
	for _, f := range p {
		out = append(out, catalog.FieldError{Field: prefix + "." + f.Field, Message: f.Message})
	}
	return out
}

func (s *Server) declineIdea(w http.ResponseWriter, r *http.Request, actor store.User) {
	id, ok := pathID(r)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid", "bad idea id")
		return
	}
	var body struct {
		Note string `json:"note"`
	}
	if !decode(w, r, &body) {
		return
	}
	note := strings.TrimSpace(body.Note)
	if utf8.RuneCountInString(note) > 1000 {
		writeError(w, http.StatusUnprocessableEntity, "invalid", "note must be at most 1000 characters")
		return
	}
	idea, err := s.store.DeclineIdea(r.Context(), actor.ID, id, note, s.now())
	if err != nil {
		s.submissionError(w, r, err)
		return
	}
	s.notifyIdeaSubmitter(r, idea)
	writeJSON(w, http.StatusOK, idea)
}

/* ---------------------------------------------------------------- notifications */

func (s *Server) notifyOwnerOfIdea(r *http.Request, idea store.Idea) {
	email, err := s.store.OwnerEmail(r.Context())
	if err != nil || email == "" {
		return
	}
	lines := []string{"“" + idea.Title + "”, with " + plural(len(idea.Questions), "starter question") + ".", "It's waiting in Admin → Topic ideas. Nothing is added until you accept it."}
	s.send(r, email, "New topic idea: "+idea.Title, notice{
		Heading: "@" + idea.SubmitterLogin + " suggested a topic", Lines: lines, URL: s.appURL(r) + "/#admin", Button: "Review it",
	})
}

func (s *Server) notifyIdeaSubmitter(r *http.Request, idea store.Idea) {
	user, err := s.store.GetUser(r.Context(), idea.UserID)
	if err != nil || user.Email == "" {
		return
	}
	var lines []string
	if idea.Status == store.IdeaAccepted {
		lines = []string{"“" + idea.Title + "” was accepted. The answers are being written now, in the same depth as the rest of the bank, and it will go live as soon as they're ready. You can follow its progress on the Contribute page."}
		if idea.ReviewNote != "" {
			lines = append(lines, "Note from the reviewer: "+idea.ReviewNote)
		}
		s.send(r, user.Email, "Your topic was accepted: "+idea.Title, notice{
			Heading: "Your topic idea is being written up", Lines: lines, URL: s.appURL(r) + "/#contribute", Button: "Follow its progress",
		})
		return
	}
	lines = []string{"Thanks for suggesting “" + idea.Title + "”. It won't be added for now."}
	if idea.ReviewNote != "" {
		lines = append(lines, "Note from the reviewer: "+idea.ReviewNote)
	}
	s.send(r, user.Email, "About your topic idea: "+idea.Title, notice{
		Heading: "Your topic idea was reviewed", Lines: lines, URL: s.appURL(r) + "/#contribute", Button: "Open Contribute",
	})
}

func plural(n int, word string) string {
	if n == 1 {
		return "1 " + word
	}
	return fmt.Sprintf("%d %ss", n, word)
}
