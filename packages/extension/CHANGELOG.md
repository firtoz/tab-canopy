# @tabcanopy/extension

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
