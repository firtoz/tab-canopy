import { log } from "./constants";

type EventHandler = () => Promise<void>;

interface QueuedEvent {
	name: string;
	handler: EventHandler;
}

/**
 * Event queue that processes browser events sequentially.
 * This prevents race conditions when multiple events fire in quick succession.
 */
class BrowserEventQueue {
	private queue: QueuedEvent[] = [];
	private isProcessing = false;

	/**
	 * Add an event to the queue and start processing if not already running.
	 */
	enqueue(name: string, handler: EventHandler): void {
		this.queue.push({ name, handler });
		log(`[EventQueue] Enqueued: ${name} (queue size: ${this.queue.length})`);
		this.processNext();
	}

	/**
	 * Process the next event in the queue.
	 */
	private async processNext(): Promise<void> {
		// If already processing or queue is empty, do nothing
		if (this.isProcessing || this.queue.length === 0) {
			return;
		}

		this.isProcessing = true;
		const event = this.queue.shift()!;

		log(
			`[EventQueue] Processing: ${event.name} (remaining: ${this.queue.length})`,
		);

		try {
			await event.handler();
			log(`[EventQueue] Completed: ${event.name}`);
		} catch (error) {
			console.error(`[EventQueue] Error processing ${event.name}:`, error);
		} finally {
			this.isProcessing = false;
			// Process next event if any
			this.processNext();
		}
	}

	/**
	 * Get current queue size (for debugging).
	 */
	get size(): number {
		return this.queue.length;
	}
}

// Singleton instance
export const eventQueue = new BrowserEventQueue();

/**
 * Helper to wrap an async event handler to use the queue.
 * Returns a function that enqueues the handler when called.
 */
export function queuedHandler<T extends unknown[]>(
	eventName: string,
	handler: (...args: T) => Promise<void>,
): (...args: T) => void {
	return (...args: T) => {
		eventQueue.enqueue(eventName, () => handler(...args));
	};
}
