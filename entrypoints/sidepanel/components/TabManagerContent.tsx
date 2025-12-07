import {
	type CollisionDetection,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	type Modifier,
	PointerSensor,
	pointerWithin,
	rectIntersection,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useDrizzleIndexedDB } from "@firtoz/drizzle-indexeddb";
import { useLiveQuery } from "@tanstack/react-db";
import { RefreshCw, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type * as schema from "@/schema/src/schema";
import { useResetDatabase } from "../App";
import { cn } from "../lib/cn";
import {
	buildTabTree,
	calculateTreeMove,
	flattenTree,
	type TreeDropPosition,
} from "../lib/tree";
import { TabItemOverlay } from "./TabItemOverlay";
import { WindowGroup } from "./WindowGroupNew";

const DB_NAME = "tabcanopy.db";

// Modifier to position drag overlay to the right of the cursor
// Uses the initial pointer offset within the dragged element to calculate proper positioning
const cursorOffsetModifier: Modifier = ({
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

// Custom collision detection that prioritizes drop zones and uses pointer position
const dropZoneCollision: CollisionDetection = (args) => {
	// First, try pointerWithin to find droppables containing the pointer
	const pointerCollisions = pointerWithin(args);

	// Filter to only drop zones
	const dropZoneCollisions = pointerCollisions.filter((collision) =>
		(collision.id as string).startsWith("drop-"),
	);

	if (dropZoneCollisions.length > 0) {
		return dropZoneCollisions;
	}

	// Fallback to rectIntersection if pointer isn't within any drop zone
	const rectCollisions = rectIntersection(args);
	return rectCollisions.filter((collision) =>
		(collision.id as string).startsWith("drop-"),
	);
};

// ============================================================================
// Inner App Component (uses collections)
// ============================================================================
export const TabManagerContent = () => {
	const { useCollection } = useDrizzleIndexedDB<typeof schema>();
	const windowCollection = useCollection("windowTable");
	const tabCollection = useCollection("tabTable");
	const resetDatabase = useResetDatabase();
	const [isResetting, setIsResetting] = useState(false);

	// Reactive queries for windows and tabs
	const { data: windows, isLoading: windowsLoading } = useLiveQuery((q) =>
		q.from({ window: windowCollection }),
	);

	const { data: tabs, isLoading: tabsLoading } = useLiveQuery((q) =>
		q.from({ tab: tabCollection }),
	);

	const [currentWindowId, setCurrentWindowId] = useState<number | undefined>();
	const [selectedTabIds, setSelectedTabIds] = useState<Set<number>>(new Set());
	const [lastSelectedTabId, setLastSelectedTabId] = useState<
		number | undefined
	>();
	const [activeId, setActiveId] = useState<string | null>(null);
	const [activeDropZone, setActiveDropZone] = useState<string | null>(null);

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 5 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	// Get current window ID
	useEffect(() => {
		browser.windows.getCurrent().then((win) => {
			setCurrentWindowId(win.id);
		});
	}, []);

	// Group tabs by window
	const windowsWithTabs = useMemo(() => {
		if (!windows || !tabs) return [];

		return windows.map((win) => ({
			window: win,
			tabs: tabs
				.filter((tab) => tab.browserWindowId === win.browserWindowId)
				.sort((a, b) => a.tabIndex - b.tabIndex),
		}));
	}, [windows, tabs]);

	// Get all tab items for drag operations
	const getAllItems = useCallback(() => {
		if (!tabs) return [];
		return tabs.map((tab) => ({
			id: `tab-${tab.browserWindowId}-${tab.browserTabId}`,
			tabId: tab.browserTabId,
			windowId: tab.browserWindowId,
			tab,
		}));
	}, [tabs]);

	const handleOpenSettings = useCallback(() => {
		const isFirefox = navigator.userAgent.includes("Firefox");
		if (isFirefox) {
			browser.tabs.create({
				url: "https://support.mozilla.org/en-US/kb/customize-firefox-sidebars",
			});
		} else {
			browser.tabs.create({ url: "chrome://settings/?search=side+panel" });
		}
	}, []);

	const handleResetDatabase = useCallback(async () => {
		if (isResetting) return;
		setIsResetting(true);
		try {
			await resetDatabase();
		} finally {
			setIsResetting(false);
		}
	}, [isResetting, resetDatabase]);

	const handleDragStart = useCallback(
		(event: DragStartEvent) => {
			setActiveId(event.active.id as string);
			setActiveDropZone(null);

			const parts = (event.active.id as string).split("-");
			const draggedTabId = Number.parseInt(parts[parts.length - 1], 10);
			if (!selectedTabIds.has(draggedTabId)) {
				setSelectedTabIds(new Set([draggedTabId]));
			}
		},
		[selectedTabIds],
	);

	const handleDragOver = useCallback((event: DragOverEvent) => {
		const overIdStr = event.over?.id as string | undefined;
		console.log("[DragOver] over:", overIdStr);
		if (overIdStr?.startsWith("drop-")) {
			setActiveDropZone(overIdStr);
		} else {
			setActiveDropZone(null);
		}
	}, []);

	const handleDragCancel = useCallback(() => {
		setActiveId(null);
		setActiveDropZone(null);
	}, []);

	// Parse tree-aware drop zone
	// Format: "drop-{windowId}-{tabId}-{top|bottom}-{sibling|child}" or "drop-{windowId}-gap-{slot}"
	const parseTreeDropZone = useCallback(
		(
			dropZoneId: string,
		): {
			windowId: number;
			targetTabId?: number;
			position: "top" | "bottom";
			dropType: "sibling" | "child" | "gap";
			slot?: number;
		} | null => {
			const parts = dropZoneId.split("-");
			if (parts[0] !== "drop") return null;

			const windowId = Number.parseInt(parts[1], 10);
			if (parts[2] === "gap") {
				return {
					windowId,
					position: "top",
					dropType: "gap",
					slot: Number.parseInt(parts[3], 10),
				};
			}

			const targetTabId = Number.parseInt(parts[2], 10);
			const position = parts[3] as "top" | "bottom";
			const dropType = parts[4] as "sibling" | "child";

			return { windowId, targetTabId, position, dropType };
		},
		[],
	);

	// Handle toggle collapse for a tab
	const handleToggleCollapse = useCallback(
		async (browserTabId: number) => {
			if (!tabs) return;

			const tab = tabs.find((t) => t.browserTabId === browserTabId);
			if (!tab) return;

			// Update the tab's collapsed state in the database
			// The collection key is the tab's id field, not browserTabId
			tabCollection.update(tab.id, (draft) => {
				draft.isCollapsed = !tab.isCollapsed;
			});
		},
		[tabs, tabCollection],
	);

	const handleDragEnd = useCallback(
		async (event: DragEndEvent) => {
			const dropZone = activeDropZone;
			console.log("[DragEnd] dropZone:", dropZone);
			setActiveId(null);
			setActiveDropZone(null);

			if (!dropZone || !tabs) {
				console.log("[DragEnd] early return - no dropZone or tabs");
				return;
			}

			const parsed = parseTreeDropZone(dropZone);
			console.log("[DragEnd] parsed:", parsed);
			if (!parsed) {
				console.log("[DragEnd] early return - parse failed");
				return;
			}

			const {
				windowId: targetWindowId,
				targetTabId,
				position,
				dropType,
				slot,
			} = parsed;
			const allItems = getAllItems();
			const activeItem = allItems.find((item) => item.id === event.active.id);
			if (!activeItem) return;

			const activeTabId = activeItem.tabId;
			const draggedTabIds =
				activeTabId && selectedTabIds.has(activeTabId)
					? Array.from(selectedTabIds)
					: activeTabId
						? [activeTabId]
						: [];

			if (draggedTabIds.length === 0) return;

			// For tree operations, we need to update tree structure in the database
			// Get all tabs in the target window
			const windowTabs = tabs.filter(
				(t) => t.browserWindowId === targetWindowId,
			);

			// Check if this is a cross-window move
			const firstDraggedTab = tabs.find(
				(t) => t.browserTabId === draggedTabIds[0],
			);
			if (!firstDraggedTab) return;

			const isCrossWindowMove =
				firstDraggedTab.browserWindowId !== targetWindowId;

			console.log("[DragEnd] cross-window move:", isCrossWindowMove);

			// For cross-window moves, we need to include the dragged tabs in the target window's tab list
			// for proper tree calculation
			let tabsForTreeCalc = windowTabs;
			if (isCrossWindowMove) {
				// Add dragged tabs to the target window's tab list (with updated windowId)
				const draggedTabs = tabs.filter((t) =>
					draggedTabIds.includes(t.browserTabId),
				);
				tabsForTreeCalc = [
					...windowTabs,
					...draggedTabs.map((t) => ({
						...t,
						browserWindowId: targetWindowId,
					})),
				];
			}

			// Determine the tree drop position
			let treeDropPosition: TreeDropPosition;

			if (dropType === "gap") {
				treeDropPosition = { type: "root", index: slot ?? 0 };
			} else if (dropType === "child" && targetTabId !== undefined) {
				// Drop as child of target
				if (position === "bottom") {
					// Dropping at bottom-child means becoming a child of the target tab
					treeDropPosition = { type: "child", parentTabId: targetTabId };
				} else {
					// Dropping at top-child means insert before target as sibling (special case)
					treeDropPosition = { type: "before", targetTabId };
				}
			} else if (targetTabId !== undefined) {
				// Sibling drop
				if (position === "top") {
					treeDropPosition = { type: "before", targetTabId };
				} else {
					treeDropPosition = { type: "after", targetTabId };
				}
			} else {
				return;
			}

			// Calculate the new parent and treeOrder
			const { parentTabId: newParentId, treeOrder: newTreeOrder } =
				calculateTreeMove(tabsForTreeCalc, draggedTabIds[0], treeDropPosition);

			// Find target tab for debugging
			const targetTab = targetTabId
				? tabs.find((t) => t.browserTabId === targetTabId)
				: null;

			console.log("[DragEnd] tree move result:", {
				treeDropPosition,
				newParentId,
				newTreeOrder,
				draggedTabIds,
				isCrossWindowMove,
				targetTabTitle: targetTab?.title?.slice(0, 20),
				targetTabTreeOrder: targetTab?.treeOrder,
			});

			// Update tree structure in the database for each dragged tab
			// First, create the updated tabs with new tree positions
			const updatedTabs: Array<{
				tab: (typeof tabs)[0];
				newParentId: number | null;
				newTreeOrder: string;
				newWindowId: number;
			}> = [];

			for (let i = 0; i < draggedTabIds.length; i++) {
				const browserTabId = draggedTabIds[i];
				const tab = tabs.find((t) => t.browserTabId === browserTabId);
				if (!tab) continue;

				// For multiple selections, keep their relative order
				const orderSuffix = i > 0 ? String.fromCharCode(97 + i) : ""; // a, b, c...
				const tabNewTreeOrder = newTreeOrder + orderSuffix;

				console.log("[DragEnd] updating tab:", {
					tabId: tab.id,
					browserTabId,
					newParentId,
					newTreeOrder: tabNewTreeOrder,
					newWindowId: targetWindowId,
					isCrossWindowMove,
				});

				// The collection key is the tab's id field, not browserTabId
				tabCollection.update(tab.id, (draft) => {
					draft.parentTabId = newParentId;
					draft.treeOrder = tabNewTreeOrder;
					// For cross-window moves, also update the window ID
					if (isCrossWindowMove) {
						draft.browserWindowId = targetWindowId;
					}
				});

				updatedTabs.push({
					tab,
					newParentId,
					newTreeOrder: tabNewTreeOrder,
					newWindowId: targetWindowId,
				});
			}

			// Now sync browser tab positions to match the new tree structure
			// Build the new tree with updated positions (including cross-window moved tabs)
			let updatedWindowTabs = windowTabs.map((t) => {
				const updated = updatedTabs.find(
					(u) => u.tab.browserTabId === t.browserTabId,
				);
				if (updated) {
					return {
						...t,
						parentTabId: updated.newParentId,
						treeOrder: updated.newTreeOrder,
					};
				}
				return t;
			});

			// For cross-window moves, add the moved tabs to the target window's list
			if (isCrossWindowMove) {
				const movedTabs = updatedTabs.map((u) => ({
					...u.tab,
					browserWindowId: targetWindowId,
					parentTabId: u.newParentId,
					treeOrder: u.newTreeOrder,
				}));
				updatedWindowTabs = [...updatedWindowTabs, ...movedTabs];
			}

			// Debug: log the tabs before building tree
			console.log(
				"[DragEnd] updatedWindowTabs:",
				updatedWindowTabs.map((t) => ({
					browserTabId: t.browserTabId,
					title: t.title?.slice(0, 20),
					parentTabId: t.parentTabId,
					treeOrder: t.treeOrder,
				})),
			);

			// Flatten to get expected browser order
			const newTree = buildTabTree(updatedWindowTabs);
			const flatOrder = flattenTree(newTree);

			// Debug: log the flat order
			console.log(
				"[DragEnd] flatOrder:",
				flatOrder.map((t, i) => ({
					index: i,
					browserTabId: t.tab.browserTabId,
					title: t.tab.title?.slice(0, 20),
					treeOrder: t.tab.treeOrder,
				})),
			);

			// Move each dragged tab to its expected position
			for (const { tab } of updatedTabs) {
				const expectedIndex = flatOrder.findIndex(
					(t) => t.tab.browserTabId === tab.browserTabId,
				);
				console.log(
					"[DragEnd] moving browser tab:",
					tab.browserTabId,
					"title:",
					tab.title?.slice(0, 20),
					"to window:",
					targetWindowId,
					"index:",
					expectedIndex,
					"(tab's new treeOrder:",
					updatedTabs.find((u) => u.tab.browserTabId === tab.browserTabId)
						?.newTreeOrder,
					")",
				);
				if (expectedIndex !== -1) {
					// For cross-window moves, we need to specify the windowId
					browser.tabs.move(tab.browserTabId, {
						windowId: targetWindowId,
						index: expectedIndex,
					});
				}
			}
		},
		[
			getAllItems,
			selectedTabIds,
			activeDropZone,
			parseTreeDropZone,
			tabs,
			tabCollection,
		],
	);

	// Find active item for drag overlay
	const allItems = getAllItems();
	const activeItem = activeId
		? allItems.find((item) => item.id === activeId)
		: null;

	const selectedItems =
		activeItem && selectedTabIds.has(activeItem.tabId)
			? allItems.filter((item) => selectedTabIds.has(item.tabId))
			: activeItem
				? [activeItem]
				: [];

	if (windowsLoading || tabsLoading) {
		return <div className="p-4 text-center text-zinc-500">Loading tabs...</div>;
	}

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={dropZoneCollision}
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDragEnd={handleDragEnd}
			onDragCancel={handleDragCancel}
		>
			<div
				className={cn(
					"p-4 max-w-full min-h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white/90",
				)}
			>
				<div className="flex items-center justify-between mb-4">
					<h1 className="text-2xl font-semibold m-0">
						{import.meta.env.EXT_NAME ?? "Tab Canopy"}
					</h1>
					<div className="flex items-center gap-2">
						<button
							type="button"
							className={cn(
								"flex items-center justify-center p-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-md text-black/60 dark:text-white/70 transition-all hover:bg-black/10 dark:hover:bg-white/10 hover:text-black/90 dark:hover:text-white/90 hover:border-black/20 dark:hover:border-white/20 active:scale-95",
								{ "cursor-pointer": !activeId && !isResetting },
								{ "opacity-50": isResetting },
							)}
							onClick={handleResetDatabase}
							disabled={isResetting}
							title="Reset tree structure (flatten all tabs)"
						>
							<RefreshCw
								size={18}
								className={cn({ "animate-spin": isResetting })}
							/>
						</button>
						<button
							type="button"
							className={cn(
								"flex items-center justify-center p-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-md text-black/60 dark:text-white/70 transition-all hover:bg-black/10 dark:hover:bg-white/10 hover:text-black/90 dark:hover:text-white/90 hover:border-black/20 dark:hover:border-white/20 active:scale-95",
								{ "cursor-pointer": !activeId },
							)}
							onClick={handleOpenSettings}
							title="Change side panel position"
						>
							<Settings size={18} />
						</button>
					</div>
				</div>
				<div className="flex flex-col gap-6">
					{windowsWithTabs.map(({ window: win, tabs: windowTabs }) => (
						<WindowGroup
							key={win.id}
							window={win}
							tabs={windowTabs}
							isCurrentWindow={
								currentWindowId !== undefined &&
								win.browserWindowId === currentWindowId
							}
							activeDropZone={activeDropZone}
							selectedTabIds={selectedTabIds}
							setSelectedTabIds={setSelectedTabIds}
							lastSelectedTabId={lastSelectedTabId}
							setLastSelectedTabId={setLastSelectedTabId}
							onToggleCollapse={handleToggleCollapse}
						/>
					))}
				</div>
			</div>
			<DragOverlay dropAnimation={null} modifiers={[cursorOffsetModifier]}>
				{activeId && selectedItems.length > 0 && (
					<div className="flex flex-col gap-2 cursor-grabbing">
						{selectedItems.map((item) => (
							<TabItemOverlay key={item.id} tab={item.tab} />
						))}
					</div>
				)}
			</DragOverlay>
		</DndContext>
	);
};
