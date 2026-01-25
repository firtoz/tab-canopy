import { useDraggable } from "@dnd-kit/core";
import { useCallback, useMemo, useState } from "react";
import type * as schema from "@/schema/src/schema";
import type { DragDataTab } from "../../lib/dnd/dnd-types";
import { useTabActions } from "../../store/useTabActions";
import { TabCard } from "../TabCard";
import { TabDropZones } from "./TabDropZones";

export interface DraggableTabProps {
	tab: schema.Tab;
	id: string;
	windowId: number;
	windowFocused: boolean;
	isCurrentWindow: boolean;
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
	/** Search state: undefined (no search), 'match' (direct match), 'ancestor' (parent of match) */
	searchState?: "match" | "ancestor";
	/** Fuzzysort result for highlighting matched characters */
	searchHighlight?: Fuzzysort.Result;
}

export function DraggableTab({
	tab,
	id,
	windowId,
	windowFocused,
	isCurrentWindow,
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
	searchState,
	searchHighlight,
}: DraggableTabProps) {
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const { closeTab } = useTabActions();

	// Middle click (auxclick) closes the tab - handler on wrapper to ensure it fires
	const handleAuxClick = useCallback(
		(e: React.MouseEvent) => {
			if (e.button === 1) {
				e.preventDefault();
				e.stopPropagation();
				closeTab(tab.browserTabId);
			}
		},
		[tab.browserTabId, closeTab],
	);

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
			onAuxClick={handleAuxClick}
		>
			<TabCard
				tab={tab}
				windowFocused={windowFocused}
				isCurrentWindow={isCurrentWindow}
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
				searchState={searchState}
				searchHighlight={searchHighlight}
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
