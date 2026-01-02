#!/usr/bin/env bun
/**
 * Publish to Chrome Web Store
 * Uploads the extension as a draft for manual review
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";

const rootDir = join(import.meta.dir, "..");

type ChromeWebStoreUploadResponse =
	| {
			kind: string;
			id: string;
			uploadState: "SUCCESS";
	  }
	| {
			kind: string;
			id: string;
			uploadState: "FAILURE";
			itemError: Array<{
				error_code: string;
				error_detail: string;
			}>;
	  }
	| {
			kind: string;
			id: string;
			uploadState: "IN_PROGRESS";
	  };

export async function publishChrome(): Promise<void> {
	console.log("📦 Building extension for Chrome...");

	// Build and zip the extension
	const buildProc = await $`bun run zip`.cwd(rootDir).nothrow();

	if (buildProc.exitCode !== 0) {
		throw new Error("Failed to build extension");
	}

	console.log("\n🚀 Uploading to Chrome Web Store...");

	// Find the zip file
	const outputDir = join(rootDir, "packages/extension/.output");
	const files = readdirSync(outputDir);
	const zipFile = files
		.filter((f) => f.endsWith("-chrome.zip"))
		.sort()
		.pop();

	if (!zipFile) {
		throw new Error("No Chrome zip file found");
	}

	const zipPath = join(outputDir, zipFile);
	console.log(`Found: ${zipFile}`);

	// Get access token
	const tokenProc =
		await $`gcloud auth print-access-token --scopes=https://www.googleapis.com/auth/chromewebstore`
			.cwd(rootDir)
			.nothrow()
			.text();

	if (!tokenProc) {
		throw new Error("Failed to get access token");
	}

	const accessToken = tokenProc.trim();
	const extensionId =
		process.env.CHROME_EXTENSION_ID || "kghaoebcnfieahcepdmalkjhdnfnlodg";

	// Upload to Chrome Web Store
	const uploadProc = await $`curl -X PUT \
  -H "Authorization: Bearer ${accessToken}" \
  -H "x-goog-api-version: 2" \
  -T ${zipPath} \
  https://www.googleapis.com/upload/chromewebstore/v1.1/items/${extensionId}`
		.cwd(rootDir)
		.nothrow()
		.text();

	if (!uploadProc) {
		throw new Error("Failed to upload to Chrome Web Store");
	}

	// Parse and check the response
	let response: ChromeWebStoreUploadResponse;
	try {
		response = JSON.parse(uploadProc);
	} catch (_error) {
		console.error("\n❌ Failed to parse upload response:", uploadProc);
		throw new Error("Invalid response from Chrome Web Store API");
	}

	// Check for upload failure
	if (response.uploadState === "FAILURE") {
		const errorDetails = response.itemError
			?.map((err) => `${err.error_code}: ${err.error_detail}`)
			.join(", ");
		throw new Error(
			`Chrome Web Store upload failed: ${errorDetails || "Unknown error"}`,
		);
	}

	if (response.uploadState !== "SUCCESS") {
		throw new Error(
			`Unexpected upload state: ${response.uploadState || "unknown"}`,
		);
	}

	const publisherId =
		process.env.CHROME_PUBLISHER_ID || "e6106a65-8eb0-4c7a-9503-1849572ce246";

	console.log("\n✅ Extension uploaded to Chrome Web Store as draft");
	console.log(
		`\n📋 Manually publish from: https://chrome.google.com/webstore/devconsole/${publisherId}/${extensionId}/edit`,
	);
}

// Run if executed directly
if (import.meta.main) {
	try {
		await publishChrome();
	} catch (error) {
		console.error("❌", error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
