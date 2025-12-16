import { describe, expect, test } from "bun:test";
import { eventQueue, queuedHandler } from "./event-queue";

describe("BrowserEventQueue", () => {
	test("processes events sequentially", async () => {
		const results: number[] = [];
		const delays = [50, 10, 30]; // Different processing times

		// Queue three events with different delays
		const promises: Promise<void>[] = [];
		for (let i = 0; i < delays.length; i++) {
			const idx = i;
			promises.push(
				new Promise((resolve) => {
					eventQueue.enqueue(`test-${idx}`, async () => {
						await new Promise((r) => setTimeout(r, delays[idx]));
						results.push(idx);
						resolve();
					});
				}),
			);
		}

		await Promise.all(promises);

		// Events should complete in order they were queued (0, 1, 2)
		// NOT in order of processing time (1, 2, 0)
		expect(results).toEqual([0, 1, 2]);
	});

	test("queuedHandler wraps async functions", async () => {
		const results: string[] = [];

		const handler = queuedHandler("test-handler", async (msg: string) => {
			await new Promise((r) => setTimeout(r, 10));
			results.push(msg);
		});

		// Call handler multiple times - should all be queued
		handler("first");
		handler("second");
		handler("third");

		// Wait for all to complete
		await new Promise((r) => setTimeout(r, 100));

		expect(results).toEqual(["first", "second", "third"]);
	});

	test("continues processing after error in handler", async () => {
		const results: string[] = [];

		const promise1 = new Promise<void>((resolve) => {
			eventQueue.enqueue("test-error-1", async () => {
				results.push("before-error");
				resolve();
			});
		});

		const promise2 = new Promise<void>((resolve) => {
			eventQueue.enqueue("test-error-2", async () => {
				throw new Error("Test error");
			});
			// Resolve after a small delay since the error handler won't resolve
			setTimeout(resolve, 50);
		});

		const promise3 = new Promise<void>((resolve) => {
			eventQueue.enqueue("test-error-3", async () => {
				results.push("after-error");
				resolve();
			});
		});

		await Promise.all([promise1, promise2, promise3]);

		// Should continue after error
		expect(results).toContain("before-error");
		expect(results).toContain("after-error");
	});
});
