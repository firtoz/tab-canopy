/**
 * Position specification for reordering
 * - "start" - move to the beginning
 * - "end" - move to the end
 * - { before: n } - move before index n
 * - { after: n } - move after index n
 */
export type ReorderPosition =
	| "start"
	| "end"
	| { before: number }
	| { after: number };

/**
 * Represents a move operation
 */
export interface MoveOperation<T> {
	item: T;
	fromIndex: number;
	toIndex: number;
}

/**
 * Result of a reorder operation
 */
export interface ReorderResult<T> {
	/** The new array after reordering */
	result: T[];
	/** The move operations that were performed */
	moves: MoveOperation<T>[];
	/** The target index where items were inserted */
	targetIndex: number;
}

/**
 * Calculate the target index from a position specification
 */
export function resolvePosition<T>(
	items: T[],
	selection: T[],
	position: ReorderPosition,
): number {
	if (position === "start") {
		return 0;
	}

	if (position === "end") {
		return items.length - selection.length;
	}

	if ("before" in position) {
		return position.before;
	}

	if ("after" in position) {
		return position.after + 1;
	}

	throw new Error(`Invalid position: ${JSON.stringify(position)}`);
}

/**
 * Reorder items by moving a selection to a new position
 *
 * @param items - The full array of items
 * @param selection - The items to move (must be a subset of items, in their current order)
 * @param position - Where to move the selection
 * @returns The reorder result with new array and move operations
 */
export function reorderItems<T>(
	items: T[],
	selection: T[],
	position: ReorderPosition,
): ReorderResult<T> {
	if (selection.length === 0) {
		return {
			result: [...items],
			moves: [],
			targetIndex: 0,
		};
	}

	// Get selection indices in the original array
	const selectionSet = new Set(selection);
	const selectionIndices = items
		.map((item, index) => (selectionSet.has(item) ? index : -1))
		.filter((index) => index !== -1);

	// Remove selected items from the array
	const remaining = items.filter((item) => !selectionSet.has(item));

	// Calculate target index in the remaining array
	let clampedTarget: number;

	if (position === "start") {
		clampedTarget = 0;
	} else if (position === "end") {
		clampedTarget = remaining.length;
	} else {
		// For before/after, calculate position and adjust for removed items
		const targetIndex = resolvePosition(items, selection, position);

		// Adjust target index based on how many selected items were before it
		const selectedBeforeTarget = selectionIndices.filter(
			(i) => i < targetIndex,
		).length;
		const adjustedTarget = targetIndex - selectedBeforeTarget;

		// Clamp to valid range
		clampedTarget = Math.max(0, Math.min(adjustedTarget, remaining.length));
	}

	// Insert selection at target position
	const result = [
		...remaining.slice(0, clampedTarget),
		...selection,
		...remaining.slice(clampedTarget),
	];

	// Calculate move operations
	const moves: MoveOperation<T>[] = selection.map((item, offset) => {
		const fromIndex = items.indexOf(item);
		const toIndex = clampedTarget + offset;
		return { item, fromIndex, toIndex };
	});

	return {
		result,
		moves,
		targetIndex: clampedTarget,
	};
}

/**
 * Reorder tabs by their IDs
 * Convenience wrapper that works with tab ID arrays
 */
export function reorderTabIds(
	allTabIds: number[],
	selectedTabIds: number[],
	position: ReorderPosition,
): ReorderResult<number> {
	// Preserve selection order from the original array
	const orderedSelection = allTabIds.filter((id) =>
		selectedTabIds.includes(id),
	);
	return reorderItems(allTabIds, orderedSelection, position);
}

/**
 * Convert a hover position (index + above/below) to a ReorderPosition
 */
export function hoverToPosition(
	hoverIndex: number,
	hoverPosition: "above" | "below",
): ReorderPosition {
	if (hoverPosition === "above") {
		return { before: hoverIndex };
	}
	return { after: hoverIndex };
}

/**
 * A single browser.tabs.move operation
 */
export interface BrowserMoveOperation {
	tabId: number;
	toIndex: number;
}

/**
 * Calculate sequential move operations for browser.tabs.move
 *
 * Since browser.tabs.move with multiple IDs may not work reliably,
 * this calculates the sequence of single-tab moves needed.
 *
 * After each move, indices shift:
 * - Items after the removed position shift left by 1
 * - Items at or after the insert position shift right by 1
 *
 * @param allTabIds - All tab IDs in current order
 * @param selectedTabIds - Tab IDs to move
 * @param position - Target position
 * @returns Array of move operations to execute sequentially
 */
export function calculateSequentialMoves(
	allTabIds: number[],
	selectedTabIds: number[],
	position: ReorderPosition,
): BrowserMoveOperation[] {
	if (selectedTabIds.length === 0) {
		return [];
	}

	// Get selected items in their original order from the array
	const orderedSelection = allTabIds.filter((id) =>
		selectedTabIds.includes(id),
	);

	// Simulate moves one by one to get the correct browser API indices
	const operations: BrowserMoveOperation[] = [];
	const currentState = [...allTabIds];

	// Calculate the base target index based on position type
	// This is the index where the FIRST item should go
	let baseTarget: number;
	if (position === "start") {
		baseTarget = 0;
	} else if (position === "end") {
		// For "end", first item goes to the last position
		baseTarget = currentState.length - 1;
	} else if ("before" in position) {
		baseTarget = position.before;
	} else {
		baseTarget = position.after + 1;
	}

	for (let i = 0; i < orderedSelection.length; i++) {
		const tabId = orderedSelection[i];
		const currentIndex = currentState.indexOf(tabId);

		let targetIndex: number;

		if (i === 0) {
			// First item goes to the base target
			if (position === "end") {
				// For "end", always go to the last position
				targetIndex = currentState.length - 1;
			} else {
				// For other positions, adjust if we're moving from before target
				if (currentIndex < baseTarget) {
					// Removing the item shifts everything after it left by 1
					// So the target becomes baseTarget - 1
					targetIndex = baseTarget - 1;
				} else {
					targetIndex = baseTarget;
				}
			}
		} else {
			// Subsequent items go right after the previous moved item
			const prevTabId = orderedSelection[i - 1];
			const prevIndex = currentState.indexOf(prevTabId);

			if (position === "end") {
				// For "end", each item goes to the end
				targetIndex = currentState.length - 1;
			} else {
				// Target is right after the previous item
				targetIndex = prevIndex + 1;

				// If current item is before the target, removing it shifts target left
				if (currentIndex < targetIndex) {
					targetIndex = targetIndex - 1;
				}
			}
		}

		// Clamp to valid range
		targetIndex = Math.max(0, Math.min(targetIndex, currentState.length - 1));

		operations.push({ tabId, toIndex: targetIndex });

		// Update state: remove from current position, insert at target
		currentState.splice(currentIndex, 1);
		currentState.splice(targetIndex, 0, tabId);
	}

	return operations;
}

/**
 * Apply a sequence of move operations to an array (for testing)
 */
export function applyMoveOperations<T>(
	items: T[],
	operations: { item: T; toIndex: number }[],
): T[] {
	const result = [...items];

	for (const op of operations) {
		const currentIndex = result.indexOf(op.item);
		if (currentIndex === -1) continue;

		// Remove from current position
		result.splice(currentIndex, 1);
		// Insert at target position
		result.splice(op.toIndex, 0, op.item);
	}

	return result;
}

/**
 * Simulate sequential moves and return final state (for testing)
 */
export function simulateSequentialMoves(
	allTabIds: number[],
	selectedTabIds: number[],
	position: ReorderPosition,
): number[] {
	const operations = calculateSequentialMoves(
		allTabIds,
		selectedTabIds,
		position,
	);

	const result = [...allTabIds];

	for (const op of operations) {
		const currentIndex = result.indexOf(op.tabId);
		if (currentIndex === -1) continue;

		// Remove from current position
		result.splice(currentIndex, 1);
		// Insert at target position
		result.splice(op.toIndex, 0, op.tabId);
	}

	return result;
}
