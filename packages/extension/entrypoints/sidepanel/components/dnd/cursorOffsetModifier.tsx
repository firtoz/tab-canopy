import type { Modifier } from "@dnd-kit/core";

// Modifier to position drag overlay to the right of the cursor
// Uses the initial pointer offset within the dragged element to calculate proper positioning
export const cursorOffsetModifier: Modifier = ({
	transform,
	activatorEvent,
	draggingNodeRect,
}) => {
	if (!activatorEvent || !draggingNodeRect) {
		return transform;
	}

	// Get the pointer position within the dragged element
	const pointerEvent = activatorEvent as PointerEvent;
	const elementRect = draggingNodeRect;

	// Calculate how far into the element the cursor was when drag started
	const cursorOffsetInElement = pointerEvent.clientX - elementRect.left;

	// Offset so the overlay starts to the right of cursor
	// Add cursorOffsetInElement to move the left edge of overlay to cursor position
	// Then add a small gap (16px) so it's clearly to the right
	return {
		...transform,
		x: transform.x + cursorOffsetInElement + 16,
		y: transform.y,
	};
};
