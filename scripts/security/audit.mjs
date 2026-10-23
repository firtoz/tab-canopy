import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function validateAudit({
	policy,
	lock,
	audit,
	status,
	now = new Date(),
}) {
	if (policy.schemaVersion !== 1 || policy.state !== "ACCEPTED")
		throw new Error("Risk exception has not been accepted.");
	const expiry = Date.parse(policy.expiresAt);
	if (!Number.isFinite(expiry) || now.getTime() >= expiry)
		throw new Error("Security exception expired.");
	const hash = createHash("sha256").update(lock).digest("hex");
	if (hash !== policy.lockSha256)
		throw new Error(
			"Dependency lock changed; security exception needs review.",
		);
	if (!Array.isArray(policy.exceptions))
		throw new Error("Invalid exception policy.");
	const expected = new Map();
	for (const entry of policy.exceptions) {
		if (
			!entry.package ||
			!entry.installed_version ||
			!["high", "moderate", "low"].includes(entry.severity) ||
			!/^https:\/\/github\.com\/advisories\/GHSA-[a-z0-9-]+$/.test(entry.url) ||
			!entry.vulnerable_versions
		) {
			throw new Error("Invalid or critical exception.");
		}
		if (
			!lock.includes(
				JSON.stringify(`${entry.package}@${entry.installed_version}`),
			)
		)
			throw new Error("Exception package version missing from lock.");
		const key = `${entry.package}:${entry.url}`;
		if (expected.has(key)) throw new Error("Duplicate exception.");
		expected.set(key, entry);
	}
	if (
		(status !== 0 && status !== 1) ||
		!audit ||
		Array.isArray(audit) ||
		typeof audit !== "object"
	)
		throw new Error("Dependency audit did not complete successfully.");
	const accepted = new Set();
	for (const [name, findings] of Object.entries(audit)) {
		if (!Array.isArray(findings) || !findings.length)
			throw new Error("Malformed audit response.");
		for (const finding of findings) {
			const key = `${name}:${finding.url}`;
			const entry = expected.get(key);
			if (
				!entry ||
				finding.severity !== entry.severity ||
				finding.vulnerable_versions !== entry.vulnerable_versions
			) {
				throw new Error(`Unaccepted finding: ${name} ${finding.url}`);
			}
			accepted.add(key);
		}
	}
	if ((status === 0) !== (accepted.size === 0))
		throw new Error("Audit exit status and results disagree.");
	if (accepted.size !== expected.size)
		throw new Error(
			"Exception no longer matches audit; remove stale exceptions.",
		);
	return [...accepted].map((key) => expected.get(key));
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	try {
		const policy = JSON.parse(
			readFileSync(
				process.argv[2] ?? "scripts/security/exceptions.json",
				"utf8",
			),
		);
		const lock = readFileSync("bun.lock");
		const run = spawnSync("bun", ["audit", "--json"], {
			encoding: "utf8",
			maxBuffer: 32 * 1024 * 1024,
		});
		if (run.error || run.signal)
			throw new Error("Unable to complete dependency audit.");
		const audit = JSON.parse(run.stdout);
		const accepted = validateAudit({ policy, lock, audit, status: run.status });
		for (const entry of accepted)
			console.log(
				"TEMPORARILY ACCEPTED: " +
					entry.package +
					"@" +
					entry.installed_version +
					" " +
					entry.url +
					" until " +
					policy.expiresAt +
					" — " +
					entry.risk,
			);
		console.log(
			"No unaccepted dependency findings. Temporary exceptions: " +
				accepted.length,
		);
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
