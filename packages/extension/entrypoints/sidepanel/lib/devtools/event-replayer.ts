/**
 * Event Replayer - Replays recorded events and validates assertions
 */

import type { Tab, Window } from "@/schema/src/schema";
import type {
	RecordedEvent,
	ReplayAssertion,
	ReplayStep,
	ReplayTestCase,
} from "./event-types";

export interface AssertionResult {
	assertion: ReplayAssertion;
	passed: boolean;
	message: string;
	actual?: unknown;
	expected?: unknown;
}

export interface StepResult {
	eventIndex: number;
	event: RecordedEvent;
	assertions: AssertionResult[];
	allPassed: boolean;
}

export interface ReplayResult {
	testCase: ReplayTestCase;
	steps: StepResult[];
	allPassed: boolean;
	summary: {
		totalAssertions: number;
		passedAssertions: number;
		failedAssertions: number;
	};
}

export interface ReplayContext {
	/** Get current tabs from the database/state */
	getTabs: () => Tab[];
	/** Get current windows from the database/state */
	getWindows: () => Window[];
}

/**
 * Validate a single assertion against the current state
 */
export function validateAssertion(
	assertion: ReplayAssertion,
	context: ReplayContext,
): AssertionResult {
	const tabs = context.getTabs();
	const _windows = context.getWindows();

	switch (assertion.type) {
		case "tabExists": {
			const tab = tabs.find((t) => t.browserTabId === assertion.tabId);
			const exists = tab !== undefined;
			const passed = exists === assertion.shouldExist;

			return {
				assertion,
				passed,
				message: passed
					? assertion.shouldExist
						? `Tab ${assertion.tabId} exists as expected`
						: `Tab ${assertion.tabId} does not exist as expected`
					: assertion.shouldExist
						? `Tab ${assertion.tabId} should exist but doesn't`
						: `Tab ${assertion.tabId} should not exist but does`,
				actual: exists,
				expected: assertion.shouldExist,
			};
		}

		case "tabState": {
			const tab = tabs.find((t) => t.browserTabId === assertion.tabId);
			if (!tab) {
				return {
					assertion,
					passed: false,
					message: `Tab ${assertion.tabId} not found`,
					actual: undefined,
					expected: assertion.expected,
				};
			}

			const failures: string[] = [];
			const expected = assertion.expected;

			if (
				expected.browserWindowId !== undefined &&
				tab.browserWindowId !== expected.browserWindowId
			) {
				failures.push(
					`windowId: expected ${expected.browserWindowId}, got ${tab.browserWindowId}`,
				);
			}
			if (
				expected.tabIndex !== undefined &&
				tab.tabIndex !== expected.tabIndex
			) {
				failures.push(
					`tabIndex: expected ${expected.tabIndex}, got ${tab.tabIndex}`,
				);
			}
			if (
				expected.parentTabId !== undefined &&
				tab.parentTabId !== expected.parentTabId
			) {
				failures.push(
					`parentTabId: expected ${expected.parentTabId}, got ${tab.parentTabId}`,
				);
			}
			if (
				expected.treeOrder !== undefined &&
				tab.treeOrder !== expected.treeOrder
			) {
				failures.push(
					`treeOrder: expected ${expected.treeOrder}, got ${tab.treeOrder}`,
				);
			}
			if (
				expected.isCollapsed !== undefined &&
				tab.isCollapsed !== expected.isCollapsed
			) {
				failures.push(
					`isCollapsed: expected ${expected.isCollapsed}, got ${tab.isCollapsed}`,
				);
			}

			const passed = failures.length === 0;
			return {
				assertion,
				passed,
				message: passed
					? `Tab ${assertion.tabId} state matches expected`
					: `Tab ${assertion.tabId} state mismatch: ${failures.join(", ")}`,
				actual: {
					browserWindowId: tab.browserWindowId,
					tabIndex: tab.tabIndex,
					parentTabId: tab.parentTabId,
					treeOrder: tab.treeOrder,
					isCollapsed: tab.isCollapsed,
				},
				expected: assertion.expected,
			};
		}

		case "tabOrder": {
			const windowTabs = tabs
				.filter((t) => t.browserWindowId === assertion.windowId)
				.sort((a, b) => a.tabIndex - b.tabIndex);

			const actualOrder = windowTabs.map((t) => t.browserTabId);
			const passed =
				actualOrder.length === assertion.expectedOrder.length &&
				actualOrder.every((id, i) => id === assertion.expectedOrder[i]);

			return {
				assertion,
				passed,
				message: passed
					? `Tab order in window ${assertion.windowId} matches expected`
					: `Tab order mismatch in window ${assertion.windowId}`,
				actual: actualOrder,
				expected: assertion.expectedOrder,
			};
		}

		case "treeStructure": {
			const windowTabs = tabs.filter(
				(t) => t.browserWindowId === assertion.windowId,
			);

			const failures: string[] = [];
			for (const [tabIdStr, expectedParent] of Object.entries(
				assertion.expectedParents,
			)) {
				const tabId = Number.parseInt(tabIdStr, 10);
				const tab = windowTabs.find((t) => t.browserTabId === tabId);

				if (!tab) {
					failures.push(`Tab ${tabId} not found`);
					continue;
				}

				if (tab.parentTabId !== expectedParent) {
					failures.push(
						`Tab ${tabId}: expected parent ${expectedParent}, got ${tab.parentTabId}`,
					);
				}
			}

			const passed = failures.length === 0;
			const actualParents: Record<number, number | null> = {};
			for (const tab of windowTabs) {
				actualParents[tab.browserTabId] = tab.parentTabId;
			}

			return {
				assertion,
				passed,
				message: passed
					? `Tree structure in window ${assertion.windowId} matches expected`
					: `Tree structure mismatch: ${failures.join("; ")}`,
				actual: actualParents,
				expected: assertion.expectedParents,
			};
		}

		default: {
			return {
				assertion,
				passed: false,
				message: `Unknown assertion type: ${(assertion as ReplayAssertion).type}`,
			};
		}
	}
}

/**
 * Run all assertions for a step
 */
export function runStepAssertions(
	step: ReplayStep,
	event: RecordedEvent,
	context: ReplayContext,
): StepResult {
	const results = step.assertions.map((assertion) =>
		validateAssertion(assertion, context),
	);

	return {
		eventIndex: step.eventIndex,
		event,
		assertions: results,
		allPassed: results.every((r) => r.passed),
	};
}

/**
 * Create a simple assertion builder for common cases
 */
export const assertions = {
	tabExists: (tabId: number): ReplayAssertion => ({
		type: "tabExists",
		tabId,
		shouldExist: true,
	}),

	tabNotExists: (tabId: number): ReplayAssertion => ({
		type: "tabExists",
		tabId,
		shouldExist: false,
	}),

	tabInWindow: (tabId: number, windowId: number): ReplayAssertion => ({
		type: "tabState",
		tabId,
		expected: { browserWindowId: windowId },
	}),

	tabAtIndex: (tabId: number, index: number): ReplayAssertion => ({
		type: "tabState",
		tabId,
		expected: { tabIndex: index },
	}),

	tabHasParent: (tabId: number, parentId: number | null): ReplayAssertion => ({
		type: "tabState",
		tabId,
		expected: { parentTabId: parentId },
	}),

	tabOrder: (windowId: number, order: number[]): ReplayAssertion => ({
		type: "tabOrder",
		windowId,
		expectedOrder: order,
	}),

	treeStructure: (
		windowId: number,
		parents: Record<number, number | null>,
	): ReplayAssertion => ({
		type: "treeStructure",
		windowId,
		expectedParents: parents,
	}),
};

/**
 * Parse assertion strings from user input
 * Format: "tabId:123 windowId:456 parentTabId:null"
 */
export function parseAssertionString(input: string): ReplayAssertion | null {
	const parts = input.trim().split(/\s+/);
	if (parts.length === 0) return null;

	const command = parts[0].toLowerCase();

	switch (command) {
		case "exists": {
			const tabId = Number.parseInt(parts[1], 10);
			if (Number.isNaN(tabId)) return null;
			return assertions.tabExists(tabId);
		}
		case "notexists": {
			const tabId = Number.parseInt(parts[1], 10);
			if (Number.isNaN(tabId)) return null;
			return assertions.tabNotExists(tabId);
		}
		case "inwindow": {
			const tabId = Number.parseInt(parts[1], 10);
			const windowId = Number.parseInt(parts[2], 10);
			if (Number.isNaN(tabId) || Number.isNaN(windowId)) return null;
			return assertions.tabInWindow(tabId, windowId);
		}
		case "atindex": {
			const tabId = Number.parseInt(parts[1], 10);
			const index = Number.parseInt(parts[2], 10);
			if (Number.isNaN(tabId) || Number.isNaN(index)) return null;
			return assertions.tabAtIndex(tabId, index);
		}
		case "parent": {
			const tabId = Number.parseInt(parts[1], 10);
			const parentId =
				parts[2] === "null" ? null : Number.parseInt(parts[2], 10);
			if (Number.isNaN(tabId) || (parentId !== null && Number.isNaN(parentId)))
				return null;
			return assertions.tabHasParent(tabId, parentId);
		}
		default:
			return null;
	}
}

/**
 * Format an assertion as a human-readable string
 */
export function formatAssertion(assertion: ReplayAssertion): string {
	switch (assertion.type) {
		case "tabExists":
			return assertion.shouldExist
				? `Tab ${assertion.tabId} exists`
				: `Tab ${assertion.tabId} does not exist`;
		case "tabState": {
			const props = Object.entries(assertion.expected)
				.map(([k, v]) => `${k}=${v}`)
				.join(", ");
			return `Tab ${assertion.tabId}: ${props}`;
		}
		case "tabOrder":
			return `Window ${assertion.windowId} order: [${assertion.expectedOrder.join(", ")}]`;
		case "treeStructure":
			return `Window ${assertion.windowId} tree structure`;
		default:
			return "Unknown assertion";
	}
}
