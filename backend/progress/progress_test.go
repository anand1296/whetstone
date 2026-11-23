package progress

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func ptr(f float64) *float64 { return &f }

func TestParseDropsInvalidEntries(t *testing.T) {
	raw := `{"version":1,"questions":{
		"ok":{"done":true,"doneAt":1,"stage":2.7,"dueAt":5,"notes":"n","updatedAt":10},
		"no-clock":{"done":true},
		"bad-type":"yes",
		"neg-stage":{"done":false,"stage":-3,"updatedAt":4,"dueAt":"soon"}
	},"lastVisit":{"sectionId":"js","questionId":"ok","at":11}}`
	doc, err := Parse([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if len(doc.Questions) != 2 {
		t.Fatalf("expected 2 valid entries, got %v", doc.Questions)
	}
	if q := doc.Questions["ok"]; q.Stage != 2 || *q.DueAt != 5 || q.Notes != "n" {
		t.Fatalf("unexpected entry %+v", q)
	}
	if q := doc.Questions["neg-stage"]; q.Stage != 0 || q.DueAt != nil {
		t.Fatalf("unexpected clamp %+v", q)
	}
	if doc.LastVisit == nil || *doc.LastVisit.QuestionID != "ok" {
		t.Fatalf("lastVisit lost: %+v", doc.LastVisit)
	}
	for _, bad := range []string{`[]`, `{"version":2,"questions":{}}`, `{"version":1}`, `nope`} {
		if _, err := Parse([]byte(bad)); err == nil {
			t.Errorf("%s: expected ErrInvalid", bad)
		}
	}
}

func TestParseClipsNotes(t *testing.T) {
	long := strings.Repeat("é", NotesLimit+50)
	raw, _ := json.Marshal(map[string]any{"version": 1, "questions": map[string]any{"q": map[string]any{"done": false, "notes": long, "updatedAt": 1}}})
	doc, err := Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	if n := len([]rune(doc.Questions["q"].Notes)); n != NotesLimit {
		t.Fatalf("notes not clipped: %d", n)
	}
}

func TestMergeIsLastWriterWinsAndConverges(t *testing.T) {
	a := Empty()
	a.Questions["x"] = Question{Done: true, UpdatedAt: 5}
	a.Questions["y"] = Question{Done: false, UpdatedAt: 9}
	a.LastVisit = &LastVisit{SectionID: "s1", At: 3}
	b := Empty()
	b.Questions["x"] = Question{Done: false, UpdatedAt: 7}
	b.Questions["y"] = Question{Done: true, UpdatedAt: 2}
	b.Questions["z"] = Question{Done: true, UpdatedAt: 1}
	b.LastVisit = &LastVisit{SectionID: "s2", At: 4}

	ab, ba := Merge(a, b), Merge(b, a)
	if !reflect.DeepEqual(ab, ba) {
		t.Fatalf("merge must be commutative:\n%+v\n%+v", ab, ba)
	}
	if !reflect.DeepEqual(Merge(ab, b), ab) {
		t.Fatal("merge must be idempotent")
	}
	if ab.Questions["x"].Done || !ab.Questions["z"].Done || ab.Questions["y"].Done || ab.LastVisit.SectionID != "s2" {
		t.Fatalf("wrong winners: %+v", ab)
	}
}

func TestSummarizeCountsOnlyCurrentContent(t *testing.T) {
	doc := Empty()
	doc.Questions["a"] = Question{Done: true, DueAt: ptr(100), UpdatedAt: 50}
	doc.Questions["b"] = Question{Done: true, DueAt: ptr(500), UpdatedAt: 60}
	doc.Questions["deleted"] = Question{Done: true, UpdatedAt: 70}
	outline := []SectionOutline{{ID: "one", QuestionIDs: []string{"a", "b"}}, {ID: "two", QuestionIDs: []string{"c"}}}
	s := Summarize(doc, outline, 200)
	if s.DoneCount != 2 || s.Total != 3 || s.DueCount != 1 || s.ByRound["one"] != 2 || s.ByRound["two"] != 0 || s.LastActiveAt != 70 {
		t.Fatalf("unexpected summary %+v", s)
	}
}

func TestParsePlans(t *testing.T) {
	raw := `{"version":1,"questions":{},"plans":{
		"p1":{"name":"  Frontend   + Design ","facets":["frontend","design","design","","` + strings.Repeat("x", MaxFacetIDLength+1) + `",7],"createdAt":3,"updatedAt":10},
		"gone":{"name":"ignored","facets":["go"],"createdAt":1,"updatedAt":12,"deleted":true},
		"nameless":{"name":"   ","facets":["go"],"updatedAt":1},
		"no-clock":{"name":"x"},
		"bad":"plan",
		"":{"name":"empty id","updatedAt":1}
	}}`
	doc, err := Parse([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if len(doc.Plans) != 2 {
		t.Fatalf("expected the live plan and the tombstone, got %+v", doc.Plans)
	}
	p := doc.Plans["p1"]
	if p.Name != "Frontend + Design" || !reflect.DeepEqual(p.Facets, []string{"frontend", "design"}) || p.CreatedAt != 3 || p.UpdatedAt != 10 {
		t.Fatalf("unexpected plan %+v", p)
	}
	g := doc.Plans["gone"]
	if !g.Deleted || g.Name != "" || len(g.Facets) != 0 || g.UpdatedAt != 12 {
		t.Fatalf("tombstone should drop name and facets: %+v", g)
	}
}

func TestParseWithoutPlansIsFine(t *testing.T) {
	doc, err := Parse([]byte(`{"version":1,"questions":{}}`))
	if err != nil {
		t.Fatal(err)
	}
	if doc.Plans == nil || len(doc.Plans) != 0 {
		t.Fatalf("plans should be an empty map, got %#v", doc.Plans)
	}
	out, _ := json.Marshal(doc)
	if !strings.Contains(string(out), `"plans":{}`) {
		t.Fatalf("plans must serialize as an object: %s", out)
	}
}

func TestPlanLimits(t *testing.T) {
	plans := map[string]any{}
	for i := 0; i < MaxPlans+10; i++ {
		plans["p"+strings.Repeat("a", i%5)+string(rune('a'+i%26))+string(rune('A'+i/26))] = map[string]any{"name": "n", "facets": []any{}, "updatedAt": 1}
	}
	long := strings.Repeat("é", PlanNameLimit+30)
	manyFacets := []any{}
	for i := 0; i < MaxPlanFacets+5; i++ {
		manyFacets = append(manyFacets, "f"+string(rune('a'+i)))
	}
	plans["long"] = map[string]any{"name": long, "facets": manyFacets, "updatedAt": 1}
	raw, _ := json.Marshal(map[string]any{"version": 1, "questions": map[string]any{}, "plans": plans})
	doc, err := Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(doc.Plans) > MaxPlans {
		t.Fatalf("too many plans kept: %d", len(doc.Plans))
	}
	if p, ok := doc.Plans["long"]; ok {
		if n := len([]rune(p.Name)); n != PlanNameLimit {
			t.Fatalf("name not clipped: %d", n)
		}
		if len(p.Facets) != MaxPlanFacets {
			t.Fatalf("facets not capped: %d", len(p.Facets))
		}
	}
}

func TestMergePlansLastWriterWinsAndTombstonesWin(t *testing.T) {
	a := Empty()
	a.Plans["keep"] = Plan{Name: "Old name", Facets: []string{"go"}, CreatedAt: 1, UpdatedAt: 5}
	a.Plans["removed-on-b"] = Plan{Name: "Go", Facets: []string{"go"}, CreatedAt: 1, UpdatedAt: 5}
	b := Empty()
	b.Plans["keep"] = Plan{Name: "New name", Facets: []string{"go", "kubernetes"}, CreatedAt: 1, UpdatedAt: 9}
	b.Plans["removed-on-b"] = Plan{Facets: []string{}, CreatedAt: 1, UpdatedAt: 8, Deleted: true}
	b.Plans["only-b"] = Plan{Name: "B", CreatedAt: 2, UpdatedAt: 2}

	ab, ba := Merge(a, b), Merge(b, a)
	if !reflect.DeepEqual(ab, ba) {
		t.Fatalf("merge must be commutative:\n%+v\n%+v", ab, ba)
	}
	if !reflect.DeepEqual(Merge(ab, b), ab) {
		t.Fatal("merge must be idempotent")
	}
	if ab.Plans["keep"].Name != "New name" || !ab.Plans["removed-on-b"].Deleted || ab.Plans["only-b"].Name != "B" {
		t.Fatalf("unexpected merge %+v", ab.Plans)
	}
	// A stale device that still has the plan cannot resurrect it.
	stale := Empty()
	stale.Plans["removed-on-b"] = Plan{Name: "Go", Facets: []string{"go"}, CreatedAt: 1, UpdatedAt: 6}
	if !Merge(ab, stale).Plans["removed-on-b"].Deleted {
		t.Fatal("a newer tombstone must beat an older live plan")
	}
}
