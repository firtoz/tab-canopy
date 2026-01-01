# Security Policy

## ⚠️ Alpha Software Notice

Tab Canopy is currently in **alpha** and has not undergone a formal security audit. We welcome security reviews and contributions from the community.

## Data Privacy

**All data stays local.** Tab Canopy stores all tab and window information locally in your browser using IndexedDB. We do **not**:
- Send any data to external servers
- Track your browsing activity
- Collect analytics or telemetry
- Store data in the cloud

All tab metadata (URLs, titles, tree structure) remains entirely on your device.

## Extension Communication

The extension uses Chrome's internal extension messaging protocol for communication between:
- Background service worker
- Side panel UI
- IndexedDB proxy transport layer

### ⚠️ Security Review Needed

**We are uncertain** whether other browser extensions could potentially intercept or read messages sent via the extension messaging protocol. 

**If you have expertise in browser extension security**, please review:
- [`packages/extension/src/idb-transport.ts`](packages/extension/src/idb-transport.ts) - IDB transport layer
- [`packages/extension/entrypoints/background/index.ts`](packages/extension/entrypoints/background/index.ts) - Background service worker
- Message passing between background and UI contexts

Contributions and security improvements are highly welcome!

## Permissions Explained

Tab Canopy requests the following permissions:

### `tabs`
**Why**: Required to read and manage browser tabs (titles, URLs, positions, window associations).

**What it allows**:
- Read tab titles and URLs from all open tabs
- Move, reorder, and close tabs
- Detect when tabs are created, updated, or closed
- Maintain synchronization between browser state and extension state

**What we do with it**: Store tab metadata locally to build the hierarchical tree structure and keep it in sync with your browser.

### `sidePanel`
**Why**: Required to display the Tab Canopy interface in the browser's side panel.

**What it allows**:
- Show the extension UI in the side panel area (Chrome/Edge Manifest V3 feature)
- Respond to side panel open/close events

**What we do with it**: Display the tree-based tab management interface.

## Reporting a Vulnerability

Since this is an **alpha/experimental** project that hasn't undergone security review, we welcome public discussion of security concerns:

1. **For potential vulnerabilities**: Open a [GitHub issue](https://github.com/firtoz/tab-canopy/issues) tagged with "security"
2. **For sensitive issues** (active exploits, etc.): Contact [@firtoz](https://github.com/firtoz) via:
   - LinkedIn: https://www.linkedin.com/in/firtoz/
   - X/Twitter: https://x.com/firtoz

For a small, experimental project like this, public security discussion helps get more eyes on potential issues. Once Tab Canopy is more mature and widely deployed, we'll enable private security advisories.

We'll work with you to understand and address any issues.

## Security Best Practices for Users

- **Review the code**: This is open source - you can (and should) review what it does
- **Install from source**: Build from source if you want to verify the exact code running
- **Monitor permissions**: The extension only needs `tabs` and `sidePanel` permissions
- **Check for updates**: Keep the extension updated with the latest security fixes

## Known Limitations / Areas for Review

- [ ] Inter-extension message sniffing (needs security review)
- [ ] Input sanitization for tab titles/URLs containing scripts
- [ ] Potential XSS vectors in UI rendering
- [ ] IndexedDB access patterns and data isolation

**Contributions welcome** to address any of these areas!
