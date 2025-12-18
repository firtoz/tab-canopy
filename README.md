<div align="center">
  <img src="packages/extension/assets/icons/base-icon.png" alt="Tab Canopy Logo" width="128"/>
  <h1>Tab Canopy</h1>
  <p>A modern browser extension for hierarchical tab management with a tree-based interface.</p>
</div>

## Features

- **Tree-based Tab Organization**: Organize tabs in a hierarchical tree structure with parent-child relationships
- **Drag & Drop Interface**: Intuitive drag-and-drop reordering and nesting of tabs
- **Side Panel UI**: Clean, accessible side panel interface built with React
- **Persistent Storage**: IndexedDB-backed storage with Drizzle ORM for reliable data persistence
- **Real-time Sync**: Automatic synchronization between browser tab events and UI state
- **Developer Tools**: Built-in dev tools panel for debugging and state inspection
- **Multi-browser Support**: Compatible with Chrome and Firefox

## Tech Stack

- **Framework**: [WXT](https://wxt.dev/) - Modern WebExtension framework
- **UI**: React 19 + TailwindCSS 4
- **State Management**: Jotai
- **Database**: IndexedDB with Drizzle ORM
- **Drag & Drop**: @dnd-kit
- **Build System**: Turborepo + Bun
- **Testing**: Playwright (E2E) + Bun Test (Unit)
- **Code Quality**: Biome

## Prerequisites

- [Bun](https://bun.sh/) 1.3.3 or higher
- Node.js (for Playwright)

## Getting Started

### Installation

```bash
# Install dependencies
bun install
```

### Development

```bash
# Start development server (Chrome)
bun dev

# Start development server (Firefox)
bun dev:firefox
```

This will:
1. Build the extension in development mode with hot reload
2. Output to `.output/chrome-mv3-dev` or `.output/firefox-mv3-dev`
3. Watch for file changes and rebuild automatically

### Loading the Extension

#### Chrome
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `.output/chrome-mv3-dev` directory (or `chrome-mv3` for production builds)

#### Firefox
1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select any file in `.output/firefox-mv3-dev` directory (or `firefox-mv3` for production builds)

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

## Project Structure

```
tabcanopy/
├── packages/
│   └── extension/           # Browser extension package
│       ├── entrypoints/
│       │   ├── background/  # Service worker (MV3)
│       │   ├── sidepanel/   # Side panel React app
│       │   └── content.ts   # Content script
│       ├── schema/          # Drizzle ORM schema & migrations
│       └── src/             # Shared utilities
├── e2e/                     # Playwright E2E tests
└── package.json             # Monorepo root
```

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
bun compile
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

## Contributing

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
