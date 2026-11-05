package catalog

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/anand1296/whetstone/content"
)

// MaxFacets bounds how many facets one topic may carry.
const MaxFacets = 12

// Facet is one filter chip. The taxonomy lives in content/facets.json so the
// static build, the browser and this package read the same list.
type Facet struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// FacetGroup is a labelled row of chips.
type FacetGroup struct {
	ID     string  `json:"id"`
	Label  string  `json:"label"`
	Facets []Facet `json:"facets"`
}

var (
	taxonomy   []FacetGroup
	facetIndex = map[string]bool{}
)

func init() {
	raw, err := content.Files.ReadFile("facets.json")
	if err != nil {
		panic(fmt.Sprintf("catalog: facets.json: %v", err))
	}
	var doc struct {
		Groups []FacetGroup `json:"groups"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		panic(fmt.Sprintf("catalog: facets.json: %v", err))
	}
	taxonomy = doc.Groups
	for _, g := range taxonomy {
		for _, t := range g.Facets {
			facetIndex[t.ID] = true
		}
	}
}

// Taxonomy returns the facet groups in display order.
func Taxonomy() []FacetGroup { return taxonomy }

// ValidFacet reports whether id is in the taxonomy.
func ValidFacet(id string) bool { return facetIndex[id] }

// ParseFacets splits a comma separated list, lower-cases it and drops duplicates.
func ParseFacets(list string) []string {
	return NormalizeFacets(strings.Split(list, ","))
}

// NormalizeFacets trims, lower-cases and de-duplicates facet ids, keeping order.
func NormalizeFacets(in []string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, t := range in {
		t = strings.ToLower(strings.TrimSpace(t))
		if t == "" || seen[t] {
			continue
		}
		seen[t] = true
		out = append(out, t)
	}
	return out
}

// Slug turns a title into a kebab-case id candidate (empty if nothing usable remains).
func Slug(title string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(title) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			dash = false
		case b.Len() > 0 && !dash:
			b.WriteByte('-')
			dash = true
		}
	}
	out := strings.TrimRight(b.String(), "-")
	if len(out) > 60 {
		out = strings.TrimRight(out[:60], "-")
	}
	return out
}
