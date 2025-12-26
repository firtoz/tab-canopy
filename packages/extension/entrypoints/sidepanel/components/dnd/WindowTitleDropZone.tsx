import { useDroppable } from "@dnd-kit/core";
import type { DropDataGap } from "../../lib/dnd/dnd-types";

export function WindowTitleDropZone({
	windowId,
	slot,
	isDragging,
}: {
	windowId: number;
	slot: number;
	isDragging: boolean;
}) {
	const dropData: DropDataGap = useMemo(
		() => ({ type: "gap", windowId, slot }),
		[windowId, slot],
	);
	const { setNodeRef, isOver } = useDroppable({
		id: `window-title-${windowId}-${slot}`,
		data: dropData,
	});

	if (!isDragging) {
		return null;
	}

	return (
		<div
			ref={setNodeRef}
			className={`absolute inset-0 z-20 ${isOver ? "bg-yellow-500/50" : "bg-transparent"}`}
		/>
	);
}
