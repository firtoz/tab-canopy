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
 */
function getZipFiles(): string[] {
	const outputDir = join(extensionDir, ".output");

	try {
		const files = readdirSync(outputDir);
		return files
			.filter((f) => f.endsWith(".zip"))
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

try {
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

	// Step 2: Publish to Firefox Add-ons (stub for now)
	console.log("\n🦊 Publishing to Firefox Add-ons...");
	try {
		await publishFirefox();
		firefoxSuccess = true;
	} catch (error) {
		console.error(
			"\n⚠️  Firefox publishing failed (this is expected - not yet implemented):",
			error instanceof Error ? error.message : String(error),
		);
		// Don't fail the release if only Firefox fails
		firefoxSuccess = true;
	}

	// Step 3: Create GitHub release (only if Chrome succeeded)
	if (chromeSuccess) {
		console.log("\n🏷️  Creating GitHub release...");
		try {
			const version = getVersion();
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
	if (chromeSuccess && firefoxSuccess) {
		console.log("\n✅ Release complete!");
		console.log("💡 Extension uploaded as draft to Chrome Web Store");
		console.log("📝 Manually publish from the developer dashboard");

		if (githubReleaseSuccess) {
			console.log("🏷️  GitHub release created with extension zips");
		}
	} else {
		console.error("\n❌ Release failed!");
		process.exit(1);
	}
}
