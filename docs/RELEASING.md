# Releasing Tab Canopy

Tab Canopy uses [Changesets](https://github.com/changesets/changesets) for automated versioning and publishing, similar to [@firtoz/fullstack-toolkit](https://github.com/firtoz/fullstack-toolkit).

## How It Works

### 1. **Make Changes**
Make your code changes as usual and commit them.

### 2. **Create a Changeset**
Describe your changes by running:

```bash
bun changeset
```

This will prompt you to:
- Select which packages changed (`@tabcanopy/extension`)
- Choose the version bump type:
  - **patch**: Bug fixes (0.1.0 → 0.1.1)
  - **minor**: New features (0.1.0 → 0.2.0)
  - **major**: Breaking changes (0.1.0 → 1.0.0)
- Write a summary of the changes (shows in CHANGELOG)

This creates a markdown file in `.changeset/` describing your changes.

### 3. **Push to Main**
```bash
git add .
git commit -m "feat: add new feature"
git push
```

### 4. **Automated Magic** 🤖

GitHub Actions automatically:

#### On Push to Main:
- Runs the Release workflow
- Checks if there are changesets

#### If Changesets Exist:
- Creates/updates a **"Version Packages"** PR with:
  - Version bumps in `package.json`
  - Updated `CHANGELOG.md` with your descriptions
  - Combined changesets into release notes

#### When You Merge the "Version Packages" PR:
- **Automatically publishes** to Chrome Web Store (as draft)
- Uploads the extension with the new version
- Adds job summary with link to manually publish

## Example Workflow

```bash
# 1. Make your changes
git checkout -b feature/new-tab-search
# ... make changes ...
git commit -m "feat: add tab search functionality"

# 2. Create a changeset
bun changeset
# Select: minor
# Write: Add tab search functionality with keyboard shortcuts

# 3. Push to main (or via PR)
git push origin feature/new-tab-search
# Create PR, get reviewed, merge

# 4. GitHub Actions creates "Version Packages" PR
# You see:
#   - @tabcanopy/extension: 0.1.1 → 0.2.0
#   - CHANGELOG.md updated with your description

# 5. Merge the "Version Packages" PR
# GitHub Actions automatically:
#   ✅ Uploads v0.2.0 to Chrome Web Store as draft
#   📝 Provides link to manually publish
```

## Manual Publishing (Last Step)

After the automated upload:

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Click on Tab Canopy
3. Review the changes
4. Click **"Submit for review"**
5. Wait for Google's approval (usually 1-3 days)

## Benefits

### ✅ Automated
- Version bumps handled automatically
- CHANGELOG generated from changesets
- No manual version management

### ✅ Safe
- Extension uploaded as **draft** (not auto-published)
- You review and manually publish
- Perfect for alpha/experimental releases

### ✅ Clear History
- Rich changelogs with GitHub integration
- Links to PRs and commits
- Clear release notes for users

## Commands

```bash
# Create a changeset describing your changes
bun changeset

# View status of pending changesets
bun changeset status

# Manually version (usually done by GitHub Actions)
bun run version

# Manually release (usually done by GitHub Actions)
bun run release
```

## Troubleshooting

### "No changesets present"
You forgot to run `bun changeset` after making changes. Create one before pushing.

### "Version Packages PR not created"
Check the Actions tab for errors. Ensure you have changesets in `.changeset/`.

### "Upload failed"
Check that the service account is still added to Chrome Web Store dashboard and secrets are configured.

## Firefox

Firefox publishing is currently a stub. When ready to implement:

1. Update `scripts/publish-firefox.ts` with Firefox Add-ons API
2. Add Firefox secrets to GitHub
3. The workflow will automatically include Firefox in releases

See [PUBLISHING.md](./PUBLISHING.md) for detailed Firefox setup instructions.
