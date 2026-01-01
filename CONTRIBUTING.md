# Contributing to Tab Canopy

Thank you for your interest in contributing to Tab Canopy! This is an experimental/alpha project, and we welcome all kinds of contributions.

## 🎯 What We Need Help With

Tab Canopy started as an experiment with IndexedDB syncing patterns and has rough edges. We need help with:

- **Security Review** - See [SECURITY.md](SECURITY.md), especially around extension messaging
- **Feature Implementation** - Check [TODO.md](TODO.md) for planned features
- **Bug Fixes** - Report or fix issues you encounter
- **Testing** - Try it on different browsers and workflows
- **Documentation** - Improve docs, add examples, write guides
- **UX Improvements** - The UI/UX needs work!

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh/) 1.3.3 or higher
- Node.js (for Playwright E2E tests)
- Basic familiarity with:
  - Browser extension development (Manifest V3)
  - React and TypeScript
  - IndexedDB (helpful but not required)

### Development Setup

1. **Fork and clone the repository:**

```bash
git clone https://github.com/YOUR_USERNAME/tab-canopy.git
cd tab-canopy
```

2. **Install dependencies:**

```bash
bun install
```

3. **Start development server:**

```bash
# Chrome with hot reload
bun dev

# Firefox with hot reload
bun dev:firefox
```

4. **Load the extension in your browser:**

**Chrome:**
- Open `chrome://extensions/`
- Enable "Developer mode"
- Click "Load unpacked"
- Select `.output/chrome-mv3-dev` directory

**Firefox:**
- Open `about:debugging#/runtime/this-firefox`
- Click "Load Temporary Add-on"
- Select any file in `.output/firefox-mv3-dev` directory

5. **Make your changes** - The extension will hot reload automatically!

### Building for Production

```bash
# Build for Chrome
bun build

# Build for Firefox
bun build:firefox

# Create distribution zip
bun zip
bun zip:firefox
```

## 🧪 Testing

### Unit Tests

```bash
# Run all unit tests
bun test:unit

# Watch mode
bun test:unit --watch
```

### E2E Tests

```bash
# Run E2E tests (builds extension first)
bun test:e2e

# With Playwright UI
bun test:e2e:ui

# With browser visible (headed mode)
bun test:e2e:headed

# E2E in dev mode (faster iteration)
bun test:e2e:dev
bun test:e2e:dev:ui
```

### Linting and Formatting

```bash
# Lint and auto-fix
bun lint

# Format code
bun format

# Type check
bun typecheck

# Run all checks (before submitting PR)
bun test && bun lint && bun typecheck
```

## 📝 Code Style

- We use [Biome](https://biomejs.dev/) for linting and formatting
- Run `bun lint` before committing - it will auto-fix most issues
- TypeScript strict mode is enabled - please maintain type safety
- Follow existing code patterns in the repository

## 🔀 Pull Request Process

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/bug-description
   ```

2. **Make your changes** with clear, focused commits:
   ```bash
   git commit -m "feat: add keyboard shortcuts for tab navigation"
   git commit -m "fix: prevent duplicate tabs in tree view"
   ```

3. **Test your changes:**
   ```bash
   bun test
   bun lint
   bun typecheck
   ```

4. **Push to your fork:**
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Open a Pull Request** on GitHub
   - Describe what you changed and why
   - Reference any related issues
   - Include screenshots/videos for UI changes
   - Note any breaking changes or migration steps

6. **Respond to feedback** - We'll review and may request changes

## 🐛 Reporting Bugs

**Before submitting a bug:**
- Check existing issues to avoid duplicates
- Try the latest version from `main` branch
- Check browser console for errors

**When submitting a bug report, include:**
- Tab Canopy version (or commit hash)
- Browser and version (Chrome 120, Firefox 115, etc.)
- Steps to reproduce
- Expected vs actual behavior
- Screenshots/videos if applicable
- Browser console errors (if any)

**Create an issue:** https://github.com/firtoz/tab-canopy/issues

## 💡 Feature Requests

We welcome feature requests! Before submitting:
- Check [TODO.md](TODO.md) to see if it's already planned
- Search existing issues
- Consider if it fits the project's scope (hierarchical tab management)

**Create an issue:** https://github.com/firtoz/tab-canopy/issues

## 🏗️ Architecture Overview

Understanding the architecture helps with contributing:

### Background Service Worker
- **Location:** `packages/extension/entrypoints/background/`
- **Purpose:** Single source of truth for tab/window state
- **Key files:**
  - `index.ts` - Entry point, initializes IDB proxy server
  - `tab-handlers.ts` - Handles browser tab events
  - `window-handlers.ts` - Handles browser window events
  - `tree-sync.ts` - Synchronizes tree structure with browser state

### Side Panel UI
- **Location:** `packages/extension/entrypoints/sidepanel/`
- **Purpose:** React app for displaying and manipulating tab tree
- **Key files:**
  - `App.tsx` - Main app component
  - `components/TabManagerContent.tsx` - Main tree view
  - `components/WindowGroup.tsx` - Window grouping
  - `components/dnd/` - Drag-and-drop components

### Database
- **Location:** `packages/extension/schema/`
- **Purpose:** IndexedDB schema with Drizzle ORM
- **Key concepts:**
  - `tabs` table with `parentTabId` for tree structure
  - `treeOrder` uses fractional indexing for efficient reordering
  - IDB proxy for multi-client access (background ↔ UI)

### Synchronization Pattern
This is the core experiment! The pattern is:
1. Background worker listens to browser events
2. Updates IndexedDB (single source of truth)
3. IDB proxy broadcasts changes to all clients (side panel, etc.)
4. UI reacts to database changes
5. UI can declare "move intents" to prevent race conditions during drag operations

## 🔍 Debugging Tips

### Viewing Logs

**Background Service Worker:**
- Right-click extension icon → "Manage Extension"
- Click "Inspect views: service worker"
- Console logs appear here

**Side Panel:**
- Open side panel
- Right-click anywhere → "Inspect"
- Console logs appear here

### Built-in Dev Tools

Tab Canopy includes dev tools (alpha quality):
1. Open side panel
2. Click the dev tools toggle
3. View recorded events and replay them
4. Inspect current database state

### Database Inspection

You can inspect IndexedDB directly:
1. Open browser DevTools
2. Go to Application → Storage → IndexedDB
3. Find "tab-canopy-db"

## 📚 Useful Resources

- [WXT Framework Docs](https://wxt.dev/) - Our extension framework
- [Chrome Extensions Docs](https://developer.chrome.com/docs/extensions/)
- [Firefox Extensions Docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [dnd-kit Docs](https://docs.dndkit.com/) - Drag and drop library

## ❓ Questions?

- Open a [GitHub Discussion](https://github.com/firtoz/tab-canopy/discussions) for general questions
- Open an [Issue](https://github.com/firtoz/tab-canopy/issues) for bugs/features
- Reach out to [@firtoz](https://github.com/firtoz) on:
  - LinkedIn: https://www.linkedin.com/in/firtoz/
  - X/Twitter: https://x.com/firtoz

## 🚀 Publishing

For maintainers: Tab Canopy uses GitHub Actions for automated publishing. See [docs/PUBLISHING.md](../docs/PUBLISHING.md) for setup instructions.

Contributors don't need to worry about publishing - just submit your PRs!

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Tab Canopy! 🌳
