---
"@tabcanopy/extension": minor
---

Implement tree-aware fuzzy search with match highlighting and configurable threshold

- Replace simple substring matching with fuzzy search using fuzzysort library
- Search now handles typos and partial matches (e.g., "hewo" will match "hello world")
- Searches both tab title and URL with intelligent scoring
- Visual highlighting: matched characters in tab titles are highlighted in yellow
- Tree-aware filtering: parent tabs remain visible but grayed out when only their children match
- Maintains tree context during search, making it easier to understand tab relationships
- Configurable match quality threshold: adjust via slider in search options (gear icon)
- Threshold setting persists across sessions using localStorage
- Search score display in tab info panel for debugging match quality
- Pressing Ctrl+F when search is already open now focuses and selects the input text
- Improves user experience when searching through many tabs with imperfect recall
