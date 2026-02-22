import { useDroppable } from "@dnd-kit/core";
import type { DropDataSibling } from "../../lib/dnd/dnd-types";
import { TREE_W } from "../WindowGroup";

// Individual ancestor-level drop zone (vertical strip at specific indent level)
export function AncestorDropZone({
	windowId,
	tabId,
	ancestorId,
	zoneIndex,
	isDragging,
}: {
	windowId: number;
	tabId: number;
	/** The ancestor ID to become a sibling of, or null for root sibling */
	ancestorId: number | null;
	/** Visual index for positioning (0 = window level, 1 = root, etc.) */
	zoneIndex: number;
	isDragging: boolean;
}) {
	const dropData: DropDataSibling = {
		type: "sibling",
		windowId,
		tabId,
		ancestorId,
		insertBefore: true, // Strip left of tab = insert before this tab
	};

	const { setNodeRef, isOver } = useDroppable({
		id: `sibling-${windowId}-${tabId}-${zoneIndex}`,
		data: dropData,
	});

	if (!isDragging) return null;

	const left = zoneIndex * TREE_W;

	return (
		<div
			ref={setNodeRef}
			style={{
				left: `${left}px`,
				width: `${TREE_W}px`,
			}}
			className={`absolute top-0 bottom-0 z-20 ${isOver ? "bg-emerald-500/30" : "bg-transparent"}`}
		/>
	);
}
