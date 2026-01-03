# @tabcanopy/extension

## 0.1.5

### Patch Changes

- [`b7d32ca`](https://github.com/firtoz/tab-canopy/commit/b7d32cadf0f97dafc1690adbe455403ba319c04c) Thanks [@firtoz](https://github.com/firtoz)! - Fix tab ordering issues with opener-based and position-based child tab creation

  - Add automatic repositioning of tabs created with `openerTabId` to be adjacent to their siblings in the browser
  - Improve tree structure adherence by ensuring child tabs are physically next to their parent and siblings
  - Fix context menu "New Tab" to place new tabs in the correct tree position (respecting native browser position)
  - Add comprehensive E2E tests for tab ordering scenarios:
    - Creating multiple children via `window.open` maintains creation order
    - Tabs with opener created far from parent are moved to be adjacent
    - New children appear after last child even when intermediate children are moved
    - Context menu "New Tab" respects native browser position in tree
    - Browser-native close (Ctrl+W) promotes children to grandparent
    - Complex tree drag to new window: drag subtree into sibling, then to new window
  - Improve `dragTabToNewWindow` test fixture to wait for all descendants to move (not just parent)
  - Fix issue where tabs with opener were shown as children in the tree but positioned far away in the browser tab bar
  - Improve `calculateTreePositionForNewTab` to better account for browser index shifts when determining tree order
  - Fix `handleTabUpdated` to respect UI move intents, preventing treeOrder from being overwritten during tab updates
  - Fix click-to-rename triggering on active tab of non-current window (should focus window instead)
  - Add GitHub releases with extension zip files and changelog information when publishing to stores

## 0.1.4

### Patch Changes

- [`46598bb`](https://github.com/firtoz/tab-canopy/commit/46598bbc7cc76c85d6c0bb214a61e90697407d69) Thanks [@firtoz](https://github.com/firtoz)! - Fix Chrome Web Store upload failure detection and CI job summary

  - Fixed publish-chrome.ts to properly parse API response and check uploadState
  - Script now throws error when uploadState is "FAILURE" instead of incorrectly reporting success
  - Added proper TypeScript types for Chrome Web Store API response
  - Added detailed error messages showing error_code and error_detail from API
  - Fixed GitHub Actions workflow to show job summary when packages are published
  - Prevents silent failures during release process

## 0.1.3

### Patch Changes

- [`a7e78f1`](https://github.com/firtoz/tab-canopy/commit/a7e78f197a9450e69e9b328d72331699ff26d415) Thanks [@firtoz](https://github.com/firtoz)! - Remove DevTools panel and event recording system

  - Removed DevToolsPanel UI component and related toggle button
  - Removed event recording/replay system (DevToolsProvider, useDevTools hook)
  - Removed all recordUserEvent calls throughout the codebase
  - Removed TabTreePreview component (was only used by DevTools)
  - Cleaned up unused state management related to DevTools
  - This functionality has been superseded by comprehensive e2e tests

- [`a7e78f1`](https://github.com/firtoz/tab-canopy/commit/a7e78f197a9450e69e9b328d72331699ff26d415) Thanks [@firtoz](https://github.com/firtoz)! - Fix middle-click to close tabs and windows

  - Fixed middle-click (auxclick) on tabs not closing them - the handler was incorrectly placed in onClick instead of onAuxClick
  - Fixed middle-click on windows to properly use onAuxClick event handler
  - Added middle-click handler to DraggableTab wrapper for reliable event handling

## 0.1.2

### Patch Changes

- [`a171ec6`](https://github.com/firtoz/tab-canopy/commit/a171ec634c7f9ba296da7a540bf6b1d72e1d3c71) Thanks [@firtoz](https://github.com/firtoz)! - Infrastructure improvements for release automation:

  - Set up Changesets for automated versioning and release management
  - Migrated publishing workflow from direct GitHub Actions to Changesets-based flow
  - Refactored publishing scripts to use Bun's native APIs with proper module exports
  - Added comprehensive release documentation in docs/RELEASING.md
  - Updated README with new release workflow information
  - Added GitHub Actions workflow annotations and job summaries for better visibility
  - Fixed .gitignore to exclude Google Cloud credentials files (gha-creds-\*.json)
  - Fixed .gitattributes to properly treat icon PNG files as binary (prevents corruption)
  - Added comprehensive Cursor rules for changeset workflow management
  - Created version-controlled store metadata structure (store-metadata/) for Chrome and Firefox

  These changes improve the development workflow but don't affect the extension functionality.
