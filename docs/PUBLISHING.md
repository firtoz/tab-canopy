# Automated Publishing Setup

This document explains how to set up automated publishing to Chrome Web Store and Firefox Add-ons using GitHub Actions.

## Overview

The repository includes two GitHub Actions workflows:
- `.github/workflows/publish-chrome.yml` - Publishes to Chrome Web Store
- `.github/workflows/publish-firefox.yml` - Publishes to Firefox Add-ons

Both workflows trigger on pushes to `main` that affect the extension code.

## Prerequisites

Before the workflows can run, you need to:
1. Manually publish the extension to both stores for the first time
2. Obtain API credentials from both platforms
3. Configure GitHub repository secrets

## Setup Instructions

### 1. Chrome Web Store Setup

#### A. Initial Manual Upload

1. Build and zip the extension: `bun run zip` (WXT automatically builds before zipping)
2. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Click "New Item" and upload `.output/chrome-mv3.zip`
4. Fill in all required store listing information
5. Submit for review
6. Once approved, note your **Extension ID** (32-character string)

#### B. Obtain API Credentials

Follow the [official Chrome Web Store API guide](https://developer.chrome.com/docs/webstore/using_webstore_api):

1. **Enable Chrome Web Store API:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project (or select existing)
   - Enable "Chrome Web Store API"

2. **Create OAuth Credentials:**
   - Go to "Credentials" → "Create Credentials" → "OAuth client ID"
   - Application type: "Web application"
   - Add authorized redirect URI: `https://oauth2.googleapis.com/token`
   - Save the **Client ID** and **Client Secret**

3. **Get Refresh Token:**
   - Visit this URL (replace `YOUR_CLIENT_ID` with your actual client ID):
   ```
   https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&client_id=YOUR_CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob
   ```
   - Authorize the application
   - Copy the authorization code
   - Exchange it for a refresh token using curl:
   ```bash
   curl -X POST \
     -d "client_id=YOUR_CLIENT_ID" \
     -d "client_secret=YOUR_CLIENT_SECRET" \
     -d "code=AUTHORIZATION_CODE" \
     -d "grant_type=authorization_code" \
     -d "redirect_uri=urn:ietf:wg:oauth:2.0:oob" \
     https://oauth2.googleapis.com/token
   ```
   - Save the **refresh_token** from the response

#### C. Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions → New repository secret:

- `CHROME_CLIENT_ID` - Your OAuth client ID
- `CHROME_CLIENT_SECRET` - Your OAuth client secret
- `CHROME_REFRESH_TOKEN` - Your refresh token
- `CHROME_EXTENSION_ID` - Your 32-character extension ID

### 2. Firefox Add-ons Setup

#### A. Initial Manual Upload

1. Build the extension: `bun run build:firefox`
2. Go to [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/)
3. Click "Submit a New Add-on"
4. Upload `.output/firefox-mv3.zip`
5. Fill in all required listing information
6. Submit for review
7. Once approved, note your **Extension UUID** (found in the add-on's page URL)

#### B. Obtain API Credentials

1. Go to [API Credentials](https://addons.mozilla.org/en-US/developers/addon/api/key/)
2. Click "Generate new credentials"
3. Enter a name (e.g., "CI/CD Pipeline")
4. Save the **JWT issuer** (API key) and **JWT secret**

#### C. Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions → New repository secret:

- `FIREFOX_API_KEY` - Your JWT issuer
- `FIREFOX_API_SECRET` - Your JWT secret
- `FIREFOX_EXTENSION_UUID` - Your extension UUID (format: `{12345678-1234-1234-1234-123456789012}`)

## Workflow Behavior

### Current Configuration: Upload Only

Both workflows are currently set to **upload drafts** only:
- Chrome: `action: 'upload'` - Uploads but doesn't publish
- Firefox: Default behavior uploads for review

This means:
- ✅ Extension is uploaded automatically
- ⏳ Manual review/approval still required from store dashboards
- 🔐 Safer for alpha/experimental releases

### Optional: Auto-Publish

To enable automatic publishing:

**Chrome** - Edit `.github/workflows/publish-chrome.yml`:
```yaml
action: 'publish'  # Changed from 'upload'
```

**Firefox** - The workflow auto-submits for review; Mozilla will still review before publishing.

⚠️ **Warning:** Auto-publishing means every push to `main` could trigger a public release. Consider using:
- Version tags instead of branch pushes
- Staging branches for testing
- Manual approval steps

## Triggering Releases

Current triggers:
- ✅ Push to `main` branch
- ✅ Only when extension code changes

### Alternative: Tag-based Releases

For more control, edit workflows to trigger on version tags instead:

```yaml
on:
  push:
    tags:
      - 'v*.*.*'
```

Then release by creating tags:
```bash
git tag v1.0.0
git push origin v1.0.0
```

## Testing the Workflows

1. Make a small change to the extension
2. Push to `main`
3. Go to GitHub → Actions tab
4. Watch the workflows execute
5. Check store dashboards to verify uploads

## Troubleshooting

### Chrome Web Store Issues

- **"Invalid client"**: Check your `CHROME_CLIENT_ID` and `CHROME_CLIENT_SECRET`
- **"Invalid grant"**: Your `CHROME_REFRESH_TOKEN` may have expired - regenerate it
- **"Item not found"**: Check your `CHROME_EXTENSION_ID` is correct

### Firefox Add-ons Issues

- **"Authentication failed"**: Verify `FIREFOX_API_KEY` and `FIREFOX_API_SECRET`
- **"Add-on not found"**: Check your `FIREFOX_EXTENSION_UUID` is correct (must include `{}`)

### Build Issues

- **Missing .zip file**: Check that `bun run zip` completes successfully (WXT builds automatically)
- **Workflow not triggering**: Verify your changes affected files in `packages/extension/`

## Security Notes

⚠️ **Never commit API credentials to the repository!**

- Always use GitHub Secrets for sensitive data
- Rotate credentials if they're ever exposed
- Consider using environment-specific secrets for staging vs production

## References

- [Chrome Web Store API Documentation](https://developer.chrome.com/docs/webstore/using_webstore_api)
- [Firefox Add-ons API Documentation](https://addons-server.readthedocs.io/en/latest/topics/api/signing.html)
- [mobilefirstllc/cws-publish Action](https://github.com/marketplace/actions/publish-chrome-extension-to-chrome-web-store)
- [trmcnvn/firefox-addon Action](https://github.com/marketplace/actions/firefox-addon)
