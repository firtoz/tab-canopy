import { useDroppable } from "@dnd-kit/core";
import type { DropDataGap } from "../../lib/dnd/dnd-types";

export function GapDropZone({
	windowId,
	slot,
	isDragging,
}: {
	windowId: number;
	slot: number;
	isDragging: boolean;
}) {
	const dropData: DropDataGap = { type: "gap", windowId, slot };
	const { setNodeRef, isOver } = useDroppable({
		id: `gap-${windowId}-${slot}`,
		data: dropData,
	});

	if (!isDragging) {
		return null;
	}

	return (
		<div
			ref={setNodeRef}
			className={`h-2 -my-1 relative z-20 ${isOver ? "bg-yellow-500/50" : "bg-transparent"}`}
		/>
	);
}
