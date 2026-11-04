package catalog

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/anand1296/whetstone/content"
)

// MaxTopics bounds how many topics one round may carry.
const MaxTopics = 12

// Topic is one filter chip. The taxonomy lives in content/topics.json so the
// static build, the browser and this package read the same list.
type Topic struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// TopicGroup is a labelled row of chips.
type TopicGroup struct {
	ID     string  `json:"id"`
	Label  string  `json:"label"`
	Topics []Topic `json:"topics"`
}

var (
	taxonomy   []TopicGroup
	topicIndex = map[string]bool{}
)

func init() {
	raw, err := content.Files.ReadFile("topics.json")
	if err != nil {
		panic(fmt.Sprintf("catalog: topics.json: %v", err))
	}
	var doc struct {
		Groups []TopicGroup `json:"groups"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		panic(fmt.Sprintf("catalog: topics.json: %v", err))
	}
	taxonomy = doc.Groups
	for _, g := range taxonomy {
		for _, t := range g.Topics {
			topicIndex[t.ID] = true
		}
	}
}

// Taxonomy returns the topic groups in display order.
func Taxonomy() []TopicGroup { return taxonomy }

// ValidTopic reports whether id is in the taxonomy.
func ValidTopic(id string) bool { return topicIndex[id] }

// ParseTopics splits a comma separated list, lower-cases it and drops duplicates.
func ParseTopics(list string) []string {
	return NormalizeTopics(strings.Split(list, ","))
}

// NormalizeTopics trims, lower-cases and de-duplicates topic ids, keeping order.
func NormalizeTopics(in []string) []string {
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
