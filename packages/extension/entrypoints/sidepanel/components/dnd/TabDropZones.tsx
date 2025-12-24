import { useDroppable } from "@dnd-kit/core";
import { useMemo } from "react";
import type { DropDataChild } from "../../lib/dnd/dnd-types";
import { TREE_W } from "../WindowGroup";
import { AncestorDropZone } from "./AncestorDropZone";

// Tabs Outliner style drop zones: multiple vertical strips on left + child zone on right
export function TabDropZones({
	windowId,
	tabId,
	isDragging,
	depth,
	ancestorIds,
}: {
	windowId: number;
	tabId: number;
	isDragging: boolean;
	depth: number;
	/** Ancestor IDs from root to parent, e.g. [grandparentId, parentId] */
	ancestorIds: number[];
}) {
	const childDropData: DropDataChild = { type: "child", windowId, tabId };
	const { setNodeRef: setChildRef, isOver: isOverChild } = useDroppable({
		id: `child-${windowId}-${tabId}`,
		data: childDropData,
	});

	// Content area starts after all tree guides + branch + expand icon
	const contentLeft = (depth + 1) * TREE_W;

	// Build the list of drop zones with their ancestor IDs
	// Zone 0 = window level (new window) - special, we skip it as we have NewWindowDropZone
	// Zone 1 = root level → ancestorId: null
	// Zone 2+ = ancestorIds[zoneIndex - 2]
	const dropZones = useMemo(() => {
		const zones: Array<{ zoneIndex: number; ancestorId: number | null }> = [];
		// Zone 0 is window level - skip it, handled by NewWindowDropZone at bottom
		// Zone 1 onwards: root and ancestors
		for (let i = 1; i <= depth; i++) {
			// Zone 1 → null (root), Zone 2 → ancestorIds[0], Zone 3 → ancestorIds[1], etc.
			const ancestorId = i === 1 ? null : ancestorIds[i - 2];
			zones.push({ zoneIndex: i, ancestorId });
		}
		return zones;
	}, [depth, ancestorIds]);

	if (!isDragging) return null;

	return (
		<>
			{/* Sibling drop zones for each ancestor level */}
			{dropZones.map(({ zoneIndex, ancestorId }) => (
				<AncestorDropZone
					key={`sibling-${windowId}-${tabId}-${zoneIndex}`}
					windowId={windowId}
					tabId={tabId}
					ancestorId={ancestorId}
					zoneIndex={zoneIndex}
					isDragging={isDragging}
				/>
			))}
			{/* Child drop zone - content area to the right */}
			<div
				ref={setChildRef}
				style={{ left: `${contentLeft}px` }}
				className={`absolute top-0 bottom-0 right-0 z-20 ${isOverChild ? "bg-blue-500/30" : "bg-transparent"}`}
			/>
		</>
	);
}
