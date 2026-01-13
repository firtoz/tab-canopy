# TabCanopy Roadmap

This document outlines planned features and improvements for TabCanopy.

## Priority

- [ ] **Quick Access Bookmarks** (Arc-style)
  - [ ] Bookmark bar section at the top of sidepanel (only shown if bookmarks exist)
  - [ ] Store bookmarks in browser's native bookmarks under a TabCanopy folder (syncs via browser sync)
  - [ ] If bookmarked URL is open, show it as "active" style
  - [ ] Clicking an active bookmark should focus that tab instead of opening new
  - [ ] Currently focused bookmarked tab should have distinct "selected" styling

## Known Issues

- [ ] Dragging a tab or tree to create a new window sometimes causes them to disappear temporarily
  - E2E test added: "Complex tree - drag subtree into sibling then to new window" passes consistently
  - Test verifies: drag b into c, then drag b subtree to new window - all descendants move correctly
  - Issue may still occur in manual usage - needs further investigation if reproducible
- [ ] Window renaming does not persist
- [ ] **Firefox**: Adding new empty tabs causes ordering issues and tabs cannot be closed
  - When creating new empty tabs in Firefox, the extension shows ordering-related errors
  - Additionally, newly created empty tabs cannot be closed through the extension

## Core Features

- [ ] **Keyboard Navigation**
  - [ ] Arrow keys for tree traversal
  - [ ] Common keyboard shortcuts (close, new tab, etc.)
  - [ ] Quick search/command palette (Cmd/Ctrl+K)

- [ ] **Session Management**
  - [ ] Save and restore tab hierarchies using native Chrome Session API
  - [ ] Multiple named sessions
  - [ ] Auto-restore on browser restart

- [ ] **Closed Tab History**
  - [ ] Close tabs but keep them in the tree view (dimmed/grayed out)
  - [ ] Reopen closed tabs in their original position
  - [ ] Auto-archive old closed tabs

- [ ] **Drag & Drop Improvements**
  - [ ] Drag entire windows around
  - [ ] Show full tree preview when dragging tabs with children
  - [ ] Better visual feedback during drag operations

- [ ] **Custom Quick Actions**
  - [ ] Configurable shortcut buttons at the bottom
  - [ ] Built-in shortcuts (e.g., "Open docs.new")
  - [ ] User-defined shortcuts for frequently used URLs

## UI/UX Improvements

- [ ] **Visual Design**
  - [ ] Better color scheme and effects
  - [ ] Smooth animations and transitions
  - [ ] Dark/light/auto theme support
  - [ ] Theme customization

- [ ] **Tab Previews**
  - [ ] Thumbnail/preview on hover
  - [ ] Show page metadata (title, URL, last accessed)

## Production Build

- [ ] **Hide Debug Tools**
  - [ ] Remove reset button (still present - refresh icon button)
  - [ ] Remove tab debug info toggle (still present - "i" info button that shows tab IDs and search scores)

## Nice to Have

- [ ] **Spaces/Workspaces**
  - [ ] Separate workspaces for different contexts
  - [ ] Quick switching between spaces
  - [ ] Color-coded spaces

- [ ] **Tab Organization**
  - [ ] Bulk operations (multi-select)
  - [ ] Duplicate tab detection
  - [ ] Tab search and filtering
  - [ ] Auto-archive inactive tabs

- [ ] **Performance**
  - [ ] Virtualized rendering for large tab lists
  - [ ] Memory optimization for inactive tabs
