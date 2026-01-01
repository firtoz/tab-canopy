# TabCanopy Roadmap

This document outlines planned features and improvements for TabCanopy.

## Core Features

- [ ] **Keyboard Navigation**
  - [ ] Arrow keys for tree traversal
  - [ ] Common keyboard shortcuts (close, new tab, etc.)
  - [ ] Quick search/command palette (Cmd/Ctrl+K)
  - [ ] Ctrl+F for searching/filtering tabs

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
  - [ ] Remove reset button
  - [ ] Hide dev tools panel
  - [ ] Remove tab debug info overlay

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

## Known Issues

- [ ] Closing a non-collapsed tab sometimes causes children to disappear when they shouldn't
- [ ] Dragging a tab or tree to create a new window sometimes causes them to disappear temporarily (they eventually return to original window)
- [ ] Window renaming does not persist
