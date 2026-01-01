import { useDraggable } from "@dnd-kit/core";
import { useMemo, useState } from "react";
import type * as schema from "@/schema/src/schema";
import type { DragDataTab } from "../../lib/dnd/dnd-types";
import { TabCard } from "../TabCard";
import { TabDropZones } from "./TabDropZones";

export interface DraggableTabProps {
	tab: schema.Tab;
	id: string;
	windowId: number;
	windowFocused: boolean;
	isSelected: boolean;
	isPartOfDrag?: boolean;
	isDragging: boolean;
	onSelect: (
		tabId: number,
		options: { ctrlKey: boolean; shiftKey: boolean },
	) => void;
	// activeDropData: DropData | null;
	depth: number;
	hasChildren: boolean;
	isLastChild: boolean;
	indentGuides: boolean[];
	highlightedDepth: number | null;
	/** Ancestor IDs from root to parent */
	ancestorIds: number[];
}

export function DraggableTab({
	tab,
	id,
	windowId,
	windowFocused,
	isSelected,
	isPartOfDrag,
	isDragging,
	onSelect,
	depth,
	hasChildren,
	isLastChild,
	indentGuides,
	highlightedDepth,
	ancestorIds,
}: DraggableTabProps) {
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const dragData: DragDataTab = useMemo(
		() => ({
			type: "tab",
			tabId: tab.browserTabId,
			windowId: windowId,
		}),
		[tab.browserTabId, windowId],
	);

	const {
		attributes,
		listeners,
		setNodeRef,
		isDragging: isThisDragging,
	} = useDraggable({
		id,
		data: dragData,
	});

	const style: React.CSSProperties = {
		opacity: isThisDragging || isPartOfDrag ? 0.3 : 1,
		transition: "none",
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...attributes}
			{...(isEditingTitle ? {} : listeners)}
			className="relative"
			data-tab-id={tab.browserTabId}
			data-selected={isSelected}
		>
			<TabCard
				tab={tab}
				windowFocused={windowFocused}
				isSelected={isSelected}
				onSelect={onSelect}
				onEditingChange={setIsEditingTitle}
				// activeDropData={activeDropData}
				isDragging={isDragging}
				depth={depth}
				hasChildren={hasChildren}
				isLastChild={isLastChild}
				indentGuides={indentGuides}
				highlightedDepth={highlightedDepth}
			/>
			<TabDropZones
				windowId={windowId}
				tabId={tab.browserTabId}
				isDragging={isDragging}
				depth={depth}
				ancestorIds={ancestorIds}
			/>
		</div>
	);
} // ============================================================================
// Sortable Tab Component
// ============================================================================
