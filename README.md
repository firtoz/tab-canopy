<div align="center">
  <img src="packages/extension/assets/icons/base-icon.png" alt="Tab Canopy Logo" width="128"/>
  <h1>Tab Canopy</h1>
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![Chrome Web Store](https://img.shields.io/badge/Chrome-v0.1.1-brightgreen.svg)](https://chrome.google.com/webstore/detail/kghaoebcnfieahcepdmalkjhdnfnlodg)
  [![Firefox](https://img.shields.io/badge/Firefox-planned-orange.svg)](https://github.com/firtoz/tab-canopy)
  [![Release Status](https://github.com/firtoz/tab-canopy/actions/workflows/release.yml/badge.svg)](https://github.com/firtoz/tab-canopy/actions)
  
  <p><strong>⚠️ Alpha / Experimental</strong></p>
  <p>A browser extension for hierarchical tab management with a tree-based interface.</p>
  <p><em>Started as an experiment with IndexedDB syncing for TanStack collections,<br/>grew into a tool I actually use daily. Rough edges expected—contributions welcome!</em></p>
</div>

## Demo

https://github.com/user-attachments/assets/e597bb23-945f-439b-901e-4cfa1fd07842

> See Tab Canopy in action - tree-based organization, drag & drop, and real-time sync.

## Project Status

🚧 **Alpha Quality** - This is an experimental project that started as a playground for IndexedDB syncing patterns with TanStack collections. It evolved into a functional tab manager that I use daily, but there are many rough edges and missing features.

**Help Wanted!** This project needs contributors to:
- Review security (see [SECURITY.md](SECURITY.md) - especially the extension messaging concerns)
- Implement missing features (see [TODO.md](TODO.md))
- Fix bugs and improve UX
- Test on different browsers and setups

If you're interested in browser extension development, React, or database syncing patterns, this is a great project to explore!

## Features

- **Tree-based Tab Organization**: Organize tabs in a hierarchical tree structure with parent-child relationships
- **Smart Search**: Fuzzy search (Ctrl+F) that handles typos and maintains tree context - parent tabs stay visible when children match
- **Drag & Drop Interface**: Intuitive drag-and-drop reordering and nesting of tabs
- **Side Panel UI**: Clean, accessible side panel interface built with React
- **Persistent Storage**: IndexedDB-backed storage with Drizzle ORM for reliable data persistence
- **Real-time Sync**: Automatic synchronization between browser tab events and UI state
- **Developer Tools**: Built-in dev tools panel for debugging and state inspection
- **Multi-browser Support**: Compatible with Chrome and Firefox

See [TODO.md](TODO.md) for the roadmap of planned features and improvements.

## Quick Start

### Using Tab Canopy

Once installed, using Tab Canopy is simple:

1. **Open the side panel** - Click the Tab Canopy icon in your browser toolbar
2. **View your tabs** - All open tabs appear in the side panel organized by window
3. **Navigate** - Click any tab to switch to it
4. **Organize with drag & drop**:
   - Drag a tab up or down to reorder it
   - Drag a tab onto another tab to make it a child (nested)
   - Drag a tab to the left to un-nest it

### Pro Tips

- **Search tabs** - Press `Ctrl+F` to search through all tabs with fuzzy matching (handles typos!)
- **Collapse/expand branches** - Click the arrow icon next to parent tabs
- **Multi-level nesting** - Create deep hierarchies to organize complex research or projects
- **Visual tree lines** - Lines show parent-child relationships at a glance
- **Right-click for options** - Context menu with additional actions for tabs and windows
- **Real-time updates** - Changes sync instantly with your browser tabs

### Example Workflow

Organizing a research project:

```
Research: React Server Components
├── Official RFC
├── Tutorials
│   ├── Building with RSC
│   └── Migration Guide
└── Examples
    ├── Next.js App
    └── Remix Implementation
```

Simply drag tabs to create this structure - Tab Canopy remembers your organization!

## Tech Stack

- **Framework**: [WXT](https://wxt.dev/) - Modern WebExtension framework
- **UI**: React 19 + TailwindCSS 4
- **State Management**: Jotai
- **Database**: IndexedDB with Drizzle ORM
- **Drag & Drop**: @dnd-kit
- **Build System**: Turborepo + Bun
- **Testing**: Playwright (E2E) + Bun Test (Unit)
- **Code Quality**: Biome

## Installation

### ⚠️ Not Yet on Extension Stores

Tab Canopy is currently in **alpha** and is **not available** on the Chrome Web Store or Firefox Add-ons. You need to install it manually from source.

### For End Users

**Requirements:**
- [Bun](https://bun.sh/) 1.3.3 or higher
- Basic comfort with command line

**Steps:**

1. **Clone and build the extension:**
```bash
git clone https://github.com/firtoz/tab-canopy.git
cd tab-canopy
bun install
bun build  # for Chrome
# OR
bun build:firefox  # for Firefox
```

2. **Load into your browser:**

**Chrome:**
1. Open `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `.output/chrome-mv3` directory

**Firefox:**
1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select any file in `.output/firefox-mv3` directory

**Note:** Firefox temporary extensions are removed when the browser closes. You'll need to reload it each time.

### For Developers / Contributors

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup instructions.

## Project Structure

```
tabcanopy/
├── packages/
│   ├── extension/           # Browser extension package
│   │   ├── entrypoints/
│   │   │   ├── background/  # Service worker (MV3)
│   │   │   ├── sidepanel/   # Side panel React app
│   │   │   └── content.ts   # Content script
│   │   ├── schema/          # Drizzle ORM schema & migrations
│   │   └── src/             # Shared utilities
│   └── e2e-tests/           # Playwright E2E tests
└── package.json             # Monorepo root
```

## Development

Want to contribute? See [CONTRIBUTING.md](CONTRIBUTING.md) for full setup instructions.

### Quick Start for Development

```bash
# Install dependencies
bun install

# Start development server with hot reload
bun dev                # Chrome
bun dev:firefox        # Firefox

# Load from .output/chrome-mv3-dev or .output/firefox-mv3-dev
```

### Prerequisites

- [Bun](https://bun.sh/) 1.3.3 or higher
- Node.js (for Playwright)

## Development Scripts

### Testing

```bash
# Run all tests
bun test

# Unit tests only
bun test:unit

# E2E tests (builds extension first)
bun test:e2e
bun test:e2e:ui              # With Playwright UI
bun test:e2e:headed          # With browser visible

# E2E tests in dev mode (uses dev build)
bun test:e2e:dev
bun test:e2e:dev:ui          # With Playwright UI
bun test:e2e:dev:headed      # With browser visible
```

### Code Quality

```bash
# Lint and auto-fix
bun lint

# Lint for CI (no auto-fix)
bun lint:ci

# Format code
bun format

# Type check
bun typecheck
```

### Database

```bash
# Generate migrations (after schema changes)
bun db:generate
```

## Architecture

### Background Service Worker

- Listens to browser tab and window events
- Maintains sync between browser state and IndexedDB
- Implements IDB proxy server for multi-client access
- Handles initial sync on extension load

### Side Panel UI

- React-based interface with real-time updates
- Drag-and-drop tab reordering with tree nesting
- Uses IndexedDB proxy client for database access
- Move intent system prevents race conditions during drag operations

### Database Schema

- `windows`: Browser window metadata
- `tabs`: Tab information with tree structure (`parentTabId`, `treeOrder`)
- Uses fractional indexing for efficient reordering

### Synchronization

- Background service worker is the single source of truth
- UI connects via IDB proxy transport over Chrome messaging
- Broadcast system keeps all clients in sync
- Move intents allow UI to declare pending operations

## Publishing

Tab Canopy uses [Changesets](https://github.com/changesets/changesets) for automated versioning and publishing:

1. **Make changes** → `bun changeset` → **Describe changes**
2. **Push to main** → **GitHub Actions creates "Version Packages" PR**
3. **Merge PR** → **Automatically uploads to Chrome Web Store as draft**
4. **Manually publish** from developer dashboard

See [docs/RELEASING.md](docs/RELEASING.md) for the complete workflow guide.

For initial setup instructions, see [docs/PUBLISHING.md](docs/PUBLISHING.md).

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed instructions.

Quick summary:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting: `bun test && bun lint`
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Development Tips

### Viewing Extension Logs

- **Background logs**: Right-click extension icon → "Manage Extension" → "Inspect views: service worker"
- **Side panel logs**: Open side panel → Right-click → "Inspect"

### Debugging Database

The extension includes built-in dev tools:
- Click the dev tools toggle in the side panel
- View recorded events and replay them
- Inspect current database state

### Hot Reload

WXT provides automatic hot reload during development:
- Content scripts: Automatically reloaded
- Background: Automatically restarted
- UI: React Fast Refresh for instant updates

## Troubleshooting

### Extension not loading
- Check browser console for errors
- Ensure you're loading from the correct output directory
- Try removing and re-adding the extension

### Database issues
- Open dev tools panel and reset database
- Check background service worker console for migration errors

### Build failures
- Clear node_modules and reinstall: `rm -rf node_modules bun.lock && bun install`
- Check Bun version: `bun --version` (should be 1.3.3+)
