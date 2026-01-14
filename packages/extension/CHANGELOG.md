# @tabcanopy/extension

## 0.2.7

### Patch Changes

- [`2a936a0`](https://github.com/firtoz/tab-canopy/commit/2a936a0756b1ec67742cb8ae6a9a83f8b750e67a) Thanks [@firtoz](https://github.com/firtoz)! - Fix Firefox extension ID passing with proper Turbo cache configuration

  - Configured Turbo to track `FIREFOX_EXTENSION_ID` env var for cache invalidation
  - Changed to use `Bun.spawn()` with explicit environment for reliable env var passing
  - Added detailed logging to debug environment variable state during build
  - Turbo now automatically rebuilds when extension ID changes, uses cache when it matches

## 0.2.6

### Patch Changes

- [`cdbbcee`](https://github.com/firtoz/tab-canopy/commit/cdbbcee4ae19e2c7e920c7a72a4ffb1fe1c5d02b) Thanks [@firtoz](https://github.com/firtoz)! - Add manifest validation to prevent duplicate Firefox addon submissions

  - Added validation check that verifies extension ID is in manifest before submission
  - Script now fails early if extension ID is missing, preventing accidental duplicate addons
  - Changed to use Bun.spawn() with explicit environment for reliable env var passing

## 0.2.5

### Patch Changes

- [`316ff25`](https://github.com/firtoz/tab-canopy/commit/316ff2593e3fc7fa94f3ac93040189e41a9f915c) Thanks [@firtoz](https://github.com/firtoz)! - Fix Firefox extension ID not being passed to build process

  - Firefox extension ID now correctly passed to build process via shell environment variable syntax
  - Added manifest verification step to confirm extension ID is properly set before submission

## 0.2.4

### Patch Changes

- [`59e35c2`](https://github.com/firtoz/tab-canopy/commit/59e35c205b7991710ff33dea9c257191fe914d08) Thanks [@firtoz](https://github.com/firtoz)! - Fix Firefox Add-ons publishing and improve release automation

  - Fixed Firefox Add-ons submission by removing invalid `--id` argument from web-ext sign command
  - Extension ID is now properly set via manifest.json during build process
  - Added auto-generated AMO metadata from Chrome store descriptions (single source of truth)
  - Added required license field (MIT) to AMO metadata
  - Created Firefox API utility script for managing addons (list, info, delete)
  - All store descriptions now stay in sync automatically

## 0.2.3

### Patch Changes

- [`25a4d16`](https://github.com/firtoz/tab-canopy/commit/25a4d168c92879fc40ecc95a84c85576ed8835f0) Thanks [@firtoz](https://github.com/firtoz)! - Fix multiple tabs appearing active in the same window

  - Fixed race condition where multiple tabs could appear as "active" in the same window
  - `handleTabActivated` now explicitly sets active state based on `activeInfo.tabId` rather than relying on browser query results which could be stale
  - All other event handlers now preserve the DB's active state for existing tabs instead of overwriting with potentially incorrect browser state
  - Only `handleTabActivated` should change which tab is active

  Fix infinite IndexedDB connections

  - Fixed issue where infinite database connections were being created due to using adapter creator function instead of the context consumer
  - Refactored `IdbTransportAdapterProvider` to properly manage connection lifecycle

## 0.2.2

### Patch Changes

- [`fe865ad`](https://github.com/firtoz/tab-canopy/commit/fe865addebe88a2a6d103df3ff159f3007f68794) Thanks [@firtoz](https://github.com/firtoz)! - Fix search keyboard shortcut on Mac

  - Add support for Cmd+F (⌘F) to open search on macOS
  - Keyboard shortcut now works with Ctrl+F on Windows/Linux and Cmd+F on Mac

## 0.2.1

### Patch Changes

- [`ac37d30`](https://github.com/firtoz/tab-canopy/commit/ac37d30bcc1247617ac0bd81e33ac26ec509ade9) Thanks [@firtoz](https://github.com/firtoz)! - Improve favicon display reliability and handle internal browser URLs

  - Implement favicon proxy through background script to handle CORS-blocked favicons
  - Add corsproxy.io as CORS proxy fallback service for inaccessible favicons
  - Display puzzle icon for internal browser URLs (chrome://, about:, extension pages)
  - Prevent CORS errors by not attempting to load favicons until proxy response received
  - Cache favicon responses to reduce redundant fetches

## 0.2.0

### Minor Changes

- [`6d96d48`](https://github.com/firtoz/tab-canopy/commit/6d96d48f8f1398152c2b49cfcbb4ac065f4ff8a6) Thanks [@firtoz](https://github.com/firtoz)! - Implement tree-aware fuzzy search with match highlighting and configurable threshold

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

### Patch Changes

- [`6d96d48`](https://github.com/firtoz/tab-canopy/commit/6d96d48f8f1398152c2b49cfcbb4ac065f4ff8a6) Thanks [@firtoz](https://github.com/firtoz)! - Fix tabs created with openerTabId not becoming children of opener

  - **Issue**: When ctrl-clicking a link or creating a tab via window.open(), the new tab has an openerTabId but was not always becoming a child of the opener tab in the tree structure. Position-based logic could incorrectly determine the parent, and the opener-based logic only ran if position-based logic returned null.
  - **Fix**: Prioritize openerTabId over position-based logic in handleTabCreated(). When a tab has an openerTabId, always use it as the parent, regardless of where Chrome placed the tab in the tab bar.
  - The tab creation logic now:
    1. Checks for openerTabId FIRST and uses it as parent if present
    2. Falls back to position-based logic only if no openerTabId
  - **Impact**: Tabs created via ctrl+click, context menu "New Tab", and window.open() now correctly appear as children of the opener tab, maintaining proper tree hierarchy.
  - Add comprehensive e2e test: "ctrl-clicking link creates child tab after existing children"

- [`e0dbd38`](https://github.com/firtoz/tab-canopy/commit/e0dbd384f50dbfcb423bb45ab180c40f1f6c7630) Thanks [@firtoz](https://github.com/firtoz)! - Refactor IDB transport adapter with real connection state management

  - Replace timer-based ready state with actual connection state tracking based on pong events
  - Add automatic retry logic with exponential backoff for connection failures
  - Remove unnecessary BackgroundApiContext and TestActionsContext layers
  - Simplify App.tsx from 249 lines to 60 lines (76% reduction)
  - Add useIdbAdapter() hook for direct access to all adapter methods
  - Improve connection reliability and lifecycle management

  Implement collapse-aware tab closing behavior

  - **Non-collapsed parent tabs**: Children are promoted to become siblings when parent is closed
  - **Collapsed parent tabs**: All descendants are closed recursively when parent is closed
  - Fix critical bug: UI close button now respects collapse state (was always closing all descendants)
  - Update handleTabRemoved() in background to check isCollapsed state
  - Update closeTab() in UI store to check isCollapsed before closing descendants
  - Add defensive orphaned tab handling in buildTabTree() as display layer safety net
  - Add comprehensive test coverage: UI close, browser-native close, deep nesting scenarios

  Fix promoted children positioning in tree

  - **Issue**: When closing a non-collapsed parent, promoted children kept their old treeOrder (relative to siblings under parent), causing them to appear at wrong position (often before parent's previous sibling)
  - **Fix**: Generate new treeOrders for promoted children based on parent's position among its siblings
  - Children now appear exactly "where the parent was" in the tree, between parent's former siblings
  - Preserves relative order among promoted children

## 0.1.6

### Patch Changes

- [`114d7a2`](https://github.com/firtoz/tab-canopy/commit/114d7a263b859a6ef1ca94f582eb5f43b0c06047) Thanks [@firtoz](https://github.com/firtoz)! - Fix tab movement and tree hierarchy issues

  - **Fix flattening when parent moved past children**: When a parent tab is moved past its child in the native browser, the child now correctly becomes a root-level tab (flattened hierarchy)
  - **Fix UI move intent TTL handling**: Creation-time intents now use a shorter 500ms TTL to avoid interfering with subsequent user-initiated moves, while explicit UI moves retain the 5s TTL
  - **Fix tab move simulation**: Corrected how browser tab moves are simulated in `calculateTreePositionFromBrowserMove` to properly model Chrome's remove-then-insert behavior
  - **Fix context menu new tab positioning**: New tabs created via context menu on a parent with existing children now correctly appear first in the tree view (respecting the native browser position)

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
