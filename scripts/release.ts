#!/usr/bin/env bun
/**
 * Release script that publishes to browser extension stores
 * and creates a GitHub release with the extension zips
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import { publishChrome } from "./publish-chrome";
import { publishFirefox } from "./publish-firefox";

const rootDir = join(import.meta.dir, "..");
const extensionDir = join(rootDir, "packages/extension");

/**
 * Read the current version from the extension's package.json
 */
function getVersion(): string {
	const packageJson = JSON.parse(
		readFileSync(join(extensionDir, "package.json"), "utf-8"),
	);
	return packageJson.version;
}

/**
 * Extract the latest changelog entry for the current version
 */
function getLatestChangelog(version: string): string {
	const changelog = readFileSync(join(extensionDir, "CHANGELOG.md"), "utf-8");

	// Find the section for this version
	const versionHeader = `## ${version}`;
	const startIndex = changelog.indexOf(versionHeader);

	if (startIndex === -1) {
		console.warn(`⚠️  No changelog entry found for version ${version}`);
		return `Release v${version}`;
	}

	// Find the next version header (## X.Y.Z) or end of file
	const contentStart = startIndex + versionHeader.length;
	const nextVersionMatch = changelog
		.slice(contentStart)
		.search(/\n## \d+\.\d+\.\d+/);

	const endIndex =
		nextVersionMatch === -1
			? changelog.length
			: contentStart + nextVersionMatch;

	// Extract and clean up the changelog content
	const content = changelog.slice(contentStart, endIndex).trim();

	return content || `Release v${version}`;
}

/**
 * Get all extension zip files from the output directory
 * Excludes the sources zip which is only for Mozilla review
 */
function getZipFiles(): string[] {
	const outputDir = join(extensionDir, ".output");

	try {
		const files = readdirSync(outputDir);
		return files
			.filter((f) => f.endsWith(".zip") && !f.includes("sources"))
			.map((f) => join(outputDir, f));
	} catch {
		console.warn("⚠️  No .output directory found");
		return [];
	}
}

/**
 * Create a GitHub release with the extension zips
 */
async function createGitHubRelease(
	version: string,
	changelog: string,
	zipFiles: string[],
): Promise<boolean> {
	const tag = `v${version}`;

	console.log(`\n📦 Creating GitHub release ${tag}...`);

	// Check if release already exists (more reliable than checking local tags)
	const releaseCheck = await $`gh release view ${tag}`
		.cwd(rootDir)
		.nothrow()
		.quiet();

	if (releaseCheck.exitCode === 0) {
		console.log(`⚠️  Release ${tag} already exists, skipping GitHub release`);
		return false;
	}

	// Create the release with gh CLI
	const releaseArgs = [
		"gh",
		"release",
		"create",
		tag,
		"--title",
		`TabCanopy ${tag}`,
		"--notes",
		changelog,
		...zipFiles,
	];

	const releaseProc = await $`${releaseArgs}`.cwd(rootDir).nothrow();

	if (releaseProc.exitCode !== 0) {
		console.error("❌ Failed to create GitHub release");
		console.error(releaseProc.stderr.toString());
		return false;
	}

	console.log(`✅ GitHub release ${tag} created successfully`);
	return true;
}

// Main release flow
let chromeSuccess = false;
let firefoxSuccess = false;
let githubReleaseSuccess = false;
const enableFirefoxPublishing =
	process.env.ENABLE_FIREFOX_PUBLISHING === "true";

try {
	// Step 0: Check if this version is already released
	const version = getVersion();
	const tag = `v${version}`;

	console.log(`\n🔍 Checking if version ${version} is already released...`);
	const releaseCheck = await $`gh release view ${tag}`
		.cwd(rootDir)
		.nothrow()
		.quiet();

	if (releaseCheck.exitCode === 0) {
		console.log(`✅ Version ${version} is already released`);
		console.log(
			`   GitHub release: https://github.com/firtoz/tab-canopy/releases/tag/${tag}`,
		);
		console.log(`\n💡 No new version to publish - skipping upload`);
		console.log(
			`   To publish a new version, add a changeset and merge the Version Packages PR`,
		);
		process.exit(0);
	}

	console.log(
		`📦 Version ${version} not yet released - proceeding with publish`,
	);

	// Step 0: Build & zip Firefox extension for GitHub release (even if publishing is skipped)
	console.log("\n📦 Building Firefox extension for GitHub release...");
	try {
		// Build first with extension ID, then zip
		const firefoxExtensionId = process.env.FIREFOX_EXTENSION_ID;
		if (firefoxExtensionId) {
			console.log(`   Using Firefox extension ID: ${firefoxExtensionId}`);
			// Use Bun.spawn to ensure env var is passed to build
			// Turbo will automatically invalidate cache when FIREFOX_EXTENSION_ID changes
			const buildProc = Bun.spawn(["bun", "run", "build:firefox"], {
				cwd: rootDir,
				env: {
					...process.env,
					FIREFOX_EXTENSION_ID: firefoxExtensionId,
				},
				stdout: "inherit",
				stderr: "inherit",
			});
			await buildProc.exited;
		} else {
			console.log(
				"   No FIREFOX_EXTENSION_ID set - building without fixed ID (will be auto-generated on first submission)",
			);
			await $`bun run build:firefox`.cwd(rootDir);
		}
		await $`bun run zip:firefox`.cwd(rootDir);
		console.log("✓ Firefox extension built and zipped");
	} catch (error) {
		console.warn(
			"⚠️  Firefox build failed (GitHub release will only include Chrome):",
			error instanceof Error ? error.message : String(error),
		);
	}

	// Step 1: Publish to Chrome Web Store
	console.log("\n🚀 Publishing to Chrome Web Store...");
	try {
		await publishChrome();
		chromeSuccess = true;
	} catch (error) {
		console.error(
			"\n❌ Chrome publishing failed:",
			error instanceof Error ? error.message : String(error),
		);
	}

	// Step 2: Publish to Firefox Add-ons
	if (enableFirefoxPublishing) {
		console.log("\n🦊 Publishing to Firefox Add-ons...");
		try {
			await publishFirefox();
			firefoxSuccess = true;
		} catch (error) {
			console.error(
				"\n⚠️  Firefox publishing failed:",
				error instanceof Error ? error.message : String(error),
			);
			console.log(
				"   Continuing with release (Firefox publishing is optional)",
			);
			firefoxSuccess = false;
		}
	} else {
		console.log(
			"\n🦊 Firefox Add-ons publishing: Disabled (ENABLE_FIREFOX_PUBLISHING=false)",
		);
		console.log("   Firefox zip will still be included in GitHub release");
		console.log(
			"   Set ENABLE_FIREFOX_PUBLISHING=true after Mozilla approves first submission",
		);
		firefoxSuccess = true; // Don't block release
	}

	// Step 3: Create GitHub release (only if Chrome succeeded)
	if (chromeSuccess) {
		console.log("\n🏷️  Creating GitHub release...");
		try {
			const changelog = getLatestChangelog(version);
			const zipFiles = getZipFiles();

			if (zipFiles.length === 0) {
				console.warn("⚠️  No zip files found, skipping GitHub release");
			} else {
				console.log(`Found ${zipFiles.length} zip file(s):`);
				for (const zip of zipFiles) {
					console.log(`  - ${zip.split("/").pop()}`);
				}

				githubReleaseSuccess = await createGitHubRelease(
					version,
					changelog,
					zipFiles,
				);
			}
		} catch (error) {
			console.error(
				"\n⚠️  GitHub release failed:",
				error instanceof Error ? error.message : String(error),
			);
			// Don't fail the release if only GitHub release fails
		}
	}
} finally {
	if (chromeSuccess) {
		console.log("\n✅ Release complete!");
		console.log("💡 Chrome: Uploaded as draft to Chrome Web Store");
		if (enableFirefoxPublishing && firefoxSuccess) {
			console.log("💡 Firefox: Uploaded to Mozilla Add-ons for review");
		} else if (enableFirefoxPublishing) {
			console.log("⚠️  Firefox: Publishing enabled but failed");
		} else {
			console.log("💡 Firefox: Publishing disabled");
			console.log(
				"   → Firefox zip included in GitHub release for manual testing",
			);
		}
		console.log("📝 Manually publish from the respective developer dashboards");

		if (githubReleaseSuccess) {
			console.log("🏷️  GitHub release created with extension zips");
		}
	} else {
		console.error("\n❌ Release failed - Chrome publishing is required!");
		process.exit(1);
	}
}
