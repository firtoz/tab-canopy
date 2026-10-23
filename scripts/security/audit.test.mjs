import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { validateAudit } from "./audit.mjs";

const lock = '"braces": ["braces@3.0.3", "", {}]';
const finding = {
	url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
	severity: "high",
	vulnerable_versions: "<=3.0.3",
};
const policy = {
	schemaVersion: 1,
	state: "ACCEPTED",
	expiresAt: "2026-10-30T00:00:00Z",
	lockSha256: createHash("sha256").update(lock).digest("hex"),
	exceptions: [{ package: "braces", installed_version: "3.0.3", ...finding }],
};
const input = () => ({
	policy: structuredClone(policy),
	lock,
	audit: { braces: [structuredClone(finding)] },
	status: 1,
	now: new Date("2026-10-23T12:00:00Z"),
});
test("accepts only the specific reviewed finding", () =>
	assert.equal(validateAudit(input()).length, 1));
test("rejects new findings on the same package", () => {
	const x = input();
	x.audit.braces.push({
		...finding,
		url: "https://github.com/advisories/GHSA-new-issue-abcd",
	});
	assert.throws(() => validateAudit(x));
});
test("rejects critical severity changes", () => {
	const x = input();
	x.audit.braces[0].severity = "critical";
	assert.throws(() => validateAudit(x));
});
test("rejects changed affected-version metadata", () => {
	const x = input();
	x.audit.braces[0].vulnerable_versions = "<=3.0.4";
	assert.throws(() => validateAudit(x));
});
test("rejects lock changes", () => {
	const x = input();
	x.lock += " ";
	assert.throws(() => validateAudit(x));
});
test("rejects expiry at the exact boundary", () => {
	const x = input();
	x.now = new Date(x.policy.expiresAt);
	assert.throws(() => validateAudit(x));
});
test("rejects an unaccepted proposal", () => {
	const x = input();
	x.policy.state = "PROPOSAL_ONLY_NOT_APPLIED";
	assert.throws(() => validateAudit(x));
});
test("rejects audit failures", () => {
	const x = input();
	x.status = 2;
	assert.throws(() => validateAudit(x));
});
test("rejects malformed audit data", () => {
	const x = input();
	x.audit = { error: "network failure" };
	assert.throws(() => validateAudit(x));
});
test("rejects exceptions that are no longer needed", () => {
	const x = input();
	x.audit = {};
	x.status = 0;
	assert.throws(() => validateAudit(x));
});
test("rejects duplicate exceptions", () => {
	const x = input();
	x.policy.exceptions.push(x.policy.exceptions[0]);
	assert.throws(() => validateAudit(x));
});
test("rejects inconsistent audit exit status", () => {
	const x = input();
	x.status = 0;
	assert.throws(() => validateAudit(x));
});
