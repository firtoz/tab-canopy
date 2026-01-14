#!/usr/bin/env bun

/**
 * Firefox Add-ons API utility script
 * Used to inspect and manage addons on your AMO account
 *
 * API Documentation:
 *   https://mozilla.github.io/addons-server/topics/api/addons.html
 *   https://mozilla.github.io/addons-server/topics/api/auth.html
 *
 * Usage:
 *   bun run scripts/firefox-api.ts list        # List your addons
 *   bun run scripts/firefox-api.ts info <id>   # Get addon details
 *   bun run scripts/firefox-api.ts delete <id> # Delete an addon (PERMANENT, requires confirmation)
 */

import * as readline from "node:readline";
import jwt from "jsonwebtoken";

const API_BASE = "https://addons.mozilla.org/api/v5";

function getCredentials() {
	const apiKey = process.env.FIREFOX_API_KEY;
	const apiSecret = process.env.FIREFOX_API_SECRET;

	if (!apiKey || !apiSecret) {
		console.error("❌ Missing FIREFOX_API_KEY or FIREFOX_API_SECRET");
		console.error("   Set them in .env or export them");
		process.exit(1);
	}

	return { apiKey, apiSecret };
}

function generateJWT(apiKey: string, apiSecret: string): string {
	const payload = {
		iss: apiKey,
		jti: Date.now().toString(),
		iat: Math.floor(Date.now() / 1000),
		exp: Math.floor(Date.now() / 1000) + 300,
	};
	return jwt.sign(payload, apiSecret, { algorithm: "HS256" });
}

async function apiRequest(
	endpoint: string,
	options: RequestInit = {},
): Promise<unknown> {
	const { apiKey, apiSecret } = getCredentials();
	const token = generateJWT(apiKey, apiSecret);

	const response = await fetch(`${API_BASE}${endpoint}`, {
		...options,
		headers: {
			Authorization: `JWT ${token}`,
			"Content-Type": "application/json",
			...options.headers,
		},
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`API error ${response.status}: ${text}`);
	}

	return response.json();
}

async function listAddons() {
	console.log("📦 Fetching your addons...\n");

	try {
		// First get the user profile to get our numeric user ID
		const profile = (await apiRequest("/accounts/profile/")) as {
			id: number;
			name: string;
			num_addons_listed: number;
		};

		console.log(`Account: ${profile.name} (ID: ${profile.id})`);
		console.log(`Public addons listed: ${profile.num_addons_listed}\n`);

		// Search requires numeric user ID, not "me"
		const data = (await apiRequest(`/addons/search/?author=${profile.id}`)) as {
			count: number;
			results: Array<{
				id: number;
				guid: string;
				slug: string;
				name: { "en-US"?: string };
				status: string;
				current_version?: { version: string };
				url: string;
			}>;
		};

		if (data.count === 0) {
			console.log("No public addons found on your account.");
			console.log(
				"Note: Incomplete/unlisted addons won't appear here. Use 'info <guid>' to check specific addons.",
			);
			return;
		}

		console.log(`Found ${data.count} public addon(s):\n`);
		console.log(
			"Note: Incomplete addons won't appear. Use 'info <guid>' to check specific addons.\n",
		);

		for (const addon of data.results) {
			console.log(`📌 ${addon.name?.["en-US"] || addon.slug}`);
			console.log(`   ID: ${addon.id}`);
			console.log(`   GUID: ${addon.guid}`);
			console.log(`   Slug: ${addon.slug}`);
			console.log(`   Status: ${addon.status}`);
			console.log(
				`   Version: ${addon.current_version?.version || "no version"}`,
			);
			console.log(`   URL: ${addon.url}`);
			console.log();
		}
	} catch (error) {
		console.error("❌ Failed to list addons:", error);
	}
}

async function getAddonInfo(addonId: string) {
	console.log(`📦 Fetching addon info for: ${addonId}\n`);

	try {
		const data = (await apiRequest(`/addons/addon/${addonId}/`)) as {
			id: number;
			guid: string;
			slug: string;
			name: { "en-US"?: string };
			status: string;
			current_version?: { version: string };
			url: string;
			authors: Array<{ name: string }>;
			categories: Record<string, string[]>;
			created: string;
			last_updated: string;
		};

		console.log(`📌 ${data.name?.["en-US"] || data.slug}`);
		console.log(`   ID: ${data.id}`);
		console.log(`   GUID: ${data.guid}`);
		console.log(`   Slug: ${data.slug}`);
		console.log(`   Status: ${data.status}`);
		console.log(`   Version: ${data.current_version?.version || "no version"}`);
		console.log(`   Created: ${data.created}`);
		console.log(`   Last Updated: ${data.last_updated}`);
		console.log(`   Authors: ${data.authors?.map((a) => a.name).join(", ")}`);
		console.log(`   URL: ${data.url}`);
	} catch (error) {
		console.error("❌ Failed to get addon info:", error);
	}
}

async function deleteAddon(addonId: string) {
	console.log(`🗑️  Preparing to delete addon: ${addonId}\n`);

	try {
		// First get info about the addon
		const data = (await apiRequest(`/addons/addon/${addonId}/`)) as {
			id: number;
			guid: string;
			name: { "en-US"?: string };
			slug: string;
			status: string;
		};

		console.log(`⚠️  About to delete: ${data.name?.["en-US"] || data.slug}`);
		console.log(`   GUID: ${data.guid}`);
		console.log(`   Slug: ${data.slug}`);
		console.log(`   Status: ${data.status}`);
		console.log();
		console.log("⚠️  WARNING: This will PERMANENTLY delete:");
		console.log("   - All versions and files");
		console.log("   - The addon will be soft-blocked in Firefox");
		console.log("   - The GUID can NEVER be reused");
		console.log();

		// Prompt for confirmation
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		const answer = await new Promise<string>((resolve) => {
			rl.question(
				'Type "DELETE" in all caps to confirm: ',
				(answer: string) => {
					rl.close();
					resolve(answer);
				},
			);
		});

		if (answer !== "DELETE") {
			console.log("\n❌ Deletion cancelled");
			return;
		}

		console.log("\n🔐 Getting delete confirmation token...");

		// Step 1: Get the delete confirmation token
		const confirmData = (await apiRequest(
			`/addons/addon/${addonId}/delete_confirm/`,
		)) as {
			delete_confirm: string;
		};

		console.log("✅ Token received (valid for 60 seconds)");
		console.log("\n🗑️  Deleting addon...");

		// Step 2: Delete with the confirmation token
		await apiRequest(
			`/addons/addon/${addonId}/?delete_confirm=${encodeURIComponent(confirmData.delete_confirm)}`,
			{
				method: "DELETE",
			},
		);

		console.log("\n✅ Addon deleted successfully");
		console.log(`   ${data.name?.["en-US"] || data.slug} has been removed`);
		console.log(`   GUID ${data.guid} is now permanently unusable`);
	} catch (error) {
		console.error("\n❌ Failed to delete addon:", error);
	}
}

// Main
const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
	case "list":
		await listAddons();
		break;
	case "info":
		if (!arg) {
			console.error("Usage: bun run scripts/firefox-api.ts info <addon-id>");
			process.exit(1);
		}
		await getAddonInfo(arg);
		break;
	case "delete":
		if (!arg) {
			console.error("Usage: bun run scripts/firefox-api.ts delete <addon-id>");
			process.exit(1);
		}
		await deleteAddon(arg);
		break;
	default:
		console.log("Firefox Add-ons API Utility\n");
		console.log("Usage:");
		console.log(
			"  bun run scripts/firefox-api.ts list        # List your addons",
		);
		console.log(
			"  bun run scripts/firefox-api.ts info <id>   # Get addon details",
		);
		console.log(
			"  bun run scripts/firefox-api.ts delete <id> # Delete addon (PERMANENT)",
		);
		console.log();
		console.log("Addon ID can be: numeric ID, slug, or GUID");
		console.log();
		console.log(
			"⚠️  Warning: Delete is PERMANENT and makes the GUID unusable forever",
		);
}
