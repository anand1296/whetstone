package server

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/anand1296/whetstone/backend/mcp"
	"github.com/anand1296/whetstone/backend/store"
)

// mcpEndpoint serves the read-only MCP server at /api/mcp.
//
// It is deliberately conservative:
//   - Off unless MCP_ENABLED=true, and then answers 404 so a disabled endpoint looks absent.
//   - Refuses to serve while the site is members-only. MCP clients cannot carry the
//     browser session, so the only safe options are "public content" or "no endpoint".
//   - Rejects browser requests from another origin (DNS-rebinding and cross-site calls).
//     Desktop and server-side MCP clients send no Origin header and pass.
//   - Rate limited per client IP. Anonymous, public content only; no user data is reachable.
func (s *Server) mcpEndpoint(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.MCPEnabled {
		writeError(w, http.StatusNotFound, "not_found", "No such API endpoint.")
		return
	}
	if s.siteSettings(r.Context()).ContentAccess != "public" {
		writeError(w, http.StatusForbidden, "members_only", "The MCP endpoint is available only when the site's content is public.")
		return
	}
	if origin := r.Header.Get("Origin"); origin != "" && origin != s.origin(r) {
		writeError(w, http.StatusForbidden, "origin", "Request origin does not match this site.")
		return
	}
	if !s.limiter.allow("mcp:"+s.clientIP(r), 120, time.Minute) {
		w.Header().Set("Retry-After", "60")
		writeError(w, http.StatusTooManyRequests, "rate_limited", "Too many requests. Wait a minute.")
		return
	}
	s.mcp.ServeHTTP(w, r)
}

// mcpCatalog adapts the store to what the MCP tools need: published content only.
type mcpCatalog struct{ st *store.Store }

func (c mcpCatalog) Outline(ctx context.Context) ([]mcp.Round, error) {
	idx, err := c.st.Index(ctx, false)
	if err != nil {
		return nil, err
	}
	rounds := make([]mcp.Round, 0, len(idx.Sections))
	for _, sec := range idx.Sections {
		round := mcp.Round{ID: sec.ID, Title: sec.Title, Description: sec.Description}
		for _, q := range sec.Questions {
			round.Questions = append(round.Questions, mcp.QuestionInfo{
				ID: q.ID, Title: q.Title, Level: q.Level, Tags: q.Tags, Minutes: q.Minutes,
				SearchText: strings.ToLower(q.SearchText),
			})
		}
		rounds = append(rounds, round)
	}
	return rounds, nil
}

func (c mcpCatalog) Question(ctx context.Context, id string) (mcp.Question, error) {
	rec, err := c.st.GetQuestion(ctx, id)
	if errors.Is(err, store.ErrNotFound) {
		return mcp.Question{}, mcp.ErrNotFound
	}
	if err != nil {
		return mcp.Question{}, err
	}
	sec, err := c.st.GetSection(ctx, rec.SectionID)
	if errors.Is(err, store.ErrNotFound) {
		return mcp.Question{}, mcp.ErrNotFound
	}
	if err != nil {
		return mcp.Question{}, err
	}
	if !rec.Published || !sec.Published {
		return mcp.Question{}, mcp.ErrNotFound // drafts are never served here
	}
	return mcp.Question{
		QuestionInfo: mcp.QuestionInfo{ID: rec.ID, Title: rec.Title, Level: rec.Level, Tags: rec.Tags, Minutes: rec.Minutes},
		RoundID:      sec.ID, RoundTitle: sec.Title, Body: rec.Body,
	}, nil
}
