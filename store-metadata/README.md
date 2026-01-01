# Store Metadata

This directory contains version-controlled metadata for browser extension stores.

## Structure

```
store-metadata/
├── chrome/
│   ├── description.md       # Chrome Web Store description
│   ├── whats-new.md        # "What's new" section for updates
│   └── screenshots/        # Store screenshots
└── firefox/
    ├── description.md       # Firefox Add-ons description
    ├── release-notes.md    # Release notes for AMO
    └── screenshots/        # Store screenshots
```

## Workflow

### Chrome Web Store (Manual)

1. **Update metadata files** when making changes
2. **Automated workflow uploads** the extension ZIP as draft
3. **Manually copy** description from `chrome/description.md`
4. **Manually update** "What's new" from `chrome/whats-new.md`
5. **Manually upload** screenshots if changed
6. **Submit for review**

### Firefox Add-ons (Future: Automated)

Firefox Add-ons API supports programmatic metadata updates. When we implement Firefox support, we can automate:
- Description updates
- Screenshot uploads
- Release notes

## Benefits

✅ **Version control** - Track all metadata changes in git
✅ **Source of truth** - Single place for all store information
✅ **Consistency** - Ensure Chrome and Firefox descriptions stay in sync
✅ **Collaboration** - Easy for contributors to suggest improvements
✅ **History** - See how descriptions evolved over time

## Guidelines

- Keep descriptions **user-focused** (not technical)
- Highlight **benefits** over features
- Link to **GitHub releases** for detailed changelogs
- Update **"What's new"** with each release
- Keep screenshots **up-to-date** with latest UI

## Character Limits

### Chrome Web Store
- Short description: 132 characters
- Detailed description: Unlimited (but keep concise)

### Firefox Add-ons
- Summary: 250 characters
- Description: Unlimited (but keep concise)
