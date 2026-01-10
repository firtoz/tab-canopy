---
alwaysApply: true
---
# Overview

This project uses Changesets for automated versioning and release management.

## Changeset Workflow

### When to Create/Update Changesets

For **ANY** changes that should result in a version bump and appear in the changelog:

1. **Check for existing changesets first**:
   ```bash
   ls .changeset/*.md | grep -v "README.md"
   ```

2. **If a relevant changeset exists**:
   - Read the existing changeset file
   - Append the new changes to the description
   - Do NOT create a new changeset

3. **If NO relevant changeset exists**:
   - Create a new empty changeset: `bun changeset add --empty`
   - Populate it with the package and description

### Changeset Format

```markdown
---
"@tabcanopy/extension": patch | minor | major
---

Brief summary of changes

- Detailed bullet point 1
- Detailed bullet point 2
- etc.
```

### Version Bump Guidelines

- **patch** (0.1.1 → 0.1.2): Bug fixes, minor tweaks, infrastructure improvements
- **minor** (0.1.1 → 0.2.0): New features, significant enhancements
- **major** (0.1.1 → 1.0.0): Breaking changes, major overhauls

### Packages in this Project

- `@tabcanopy/extension` - The browser extension package (main package)

### When NOT to Create a Changeset

Do NOT create a changeset for:
- Changes that only affect documentation (README updates)
- Changes to tests only
- Typo fixes in comments
- Changes to CI/CD that don't affect the package

## Testing

### E2E Test Requirements

**Most changes should include e2e tests.** When making changes to extension behavior:

1. **Add e2e tests** in `packages/e2e-tests/e2e/tab-tree.spec.ts` (or relevant file)
2. **Build before testing**: E2E tests require a production build
   ```bash
   bun run build
   ```
3. **Run specific tests** to verify your changes:
   ```bash
   cd packages/e2e-tests
   bunx playwright test --grep "your test name"
   ```
4. **Run full test suite** to check for regressions:
   ```bash
   bun run test:e2e
   ```

### When to Add E2E Tests

Add e2e tests for:
- ✅ New tab creation behavior (window.open, ctrl+click, context menu)
- ✅ Tab tree structure changes (parent-child relationships)
- ✅ Tab movement and repositioning
- ✅ Collapse/expand behavior
- ✅ Tab closing behavior (single, with children, collapsed)
- ✅ Cross-window operations
- ✅ Any user-visible behavior changes

Skip e2e tests only for:
- ❌ Internal refactoring with no behavior changes
- ❌ Type-only changes
- ❌ Documentation updates
- ❌ Pure UI styling changes (consider visual regression tests instead)

### Example Workflow

**Scenario**: User makes changes to extension code and infrastructure

1. **Check**: `ls .changeset/*.md` shows `strict-colts-watch.md` exists
2. **Read**: Check if it's relevant to current changes
3. **If relevant**: Update `strict-colts-watch.md` with new info
4. **If not relevant**: Create new changeset with `bun changeset add --empty`

### Release Process

The release is automated via GitHub Actions:
1. Push changes to `main` with a changeset
2. Changesets creates a "Version Packages" PR
3. Merge the PR to trigger the release
4. Extension uploads to Chrome Web Store as draft
5. Manually publish from the dashboard

See `docs/RELEASING.md` for full details.
