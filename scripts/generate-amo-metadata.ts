#!/usr/bin/env bun
/**
 * Generates amo-metadata.json for Firefox Add-ons submission
 * Uses the same descriptions as Chrome Web Store for consistency
 *
 * Run: bun run scripts/generate-amo-metadata.ts
 * Output: store-metadata/firefox/amo-metadata.json
 */

import { join } from "node:path";

const rootDir = join(import.meta.dir, "..");

async function readFile(path: string): Promise<string> {
	const file = Bun.file(join(rootDir, path));
	return (await file.text()).trim();
}

export async function generateAmoMetadata(): Promise<object> {
	// Read from Chrome store metadata (single source of truth)
	const shortDescription = await readFile(
		"store-metadata/chrome/short-description.txt",
	);
	const detailedDescription = await readFile(
		"store-metadata/chrome/detailed-description.txt",
	);

	// Read package.json for extension name
	const packageJson = JSON.parse(
		await readFile("packages/extension/package.json"),
	);

	// Get extension name from wxt.config.ts manifest or default
	const extensionName = "Tab Canopy";

	return {
		$comment:
			"Auto-generated from store-metadata/chrome/. See https://mozilla.github.io/addons-server/topics/api/addons.html#create",
		categories: {
			firefox: ["tabs"],
		},
		name: {
			"en-US": extensionName,
		},
		summary: {
			"en-US": shortDescription,
		},
		description: {
			"en-US": detailedDescription,
		},
		homepage: {
			"en-US": "https://github.com/firtoz/tab-canopy",
		},
		developer_comments: {
			"en-US":
				"Alpha release - actively developed with regular updates based on user feedback. Report issues at https://github.com/firtoz/tab-canopy/issues",
		},
		is_experimental: true,
		version: {
			license: packageJson.license || "MIT",
		},
	};
}

export async function writeAmoMetadata(): Promise<string> {
	const metadata = await generateAmoMetadata();
	const outputPath = join(rootDir, "store-metadata/firefox/amo-metadata.json");

	await Bun.write(outputPath, `${JSON.stringify(metadata, null, 2)}\n`);

	return outputPath;
}

// Run if executed directly
if (import.meta.main) {
	const outputPath = await writeAmoMetadata();
	console.log(`✅ Generated ${outputPath}`);
}
