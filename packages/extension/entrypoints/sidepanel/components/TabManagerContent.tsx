import {
	type CollisionDetection,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	type Modifier,
	PointerSensor,
	pointerWithin,
	rectIntersection,
	useDndContext,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
// import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useDrizzleIndexedDB } from "@firtoz/drizzle-indexeddb";
import { useLiveQuery } from "@tanstack/react-db";
import { RefreshCw, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type * as schema from "@/schema/src/schema";
import {
	useRegisterStateGetter,
	useResetDatabase,
	useSendMoveIntent,
	useTestActions,
} from "../App";
import { cn } from "../lib/cn";
import { useDevTools } from "../lib/devtools";
import { type DropDataNewWindow, isDropData } from "../lib/dnd-types";
import { exposeBrowserTestActions, exposeCurrentTreeStateForTests } from "../lib/test-helpers";
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import {
	buildTabTree,
	calculateTreeMove,
	flattenTree,
	getDescendantIds,
	isAncestor,
	type TreeDropPosition,
} from "../lib/tree";
import { TabItemOverlay } from "./TabItemOverlay";
import { WindowGroup } from "./WindowGroupNew";

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

	// Filter to only drop zones (those with DropData)
	const dropZoneCollisions = pointerCollisions.filter((collision) => {
		const container = args.droppableContainers.find(
			(c) => c.id === collision.id,
		);
		return container && isDropData(container.data?.current);
	});

	if (dropZoneCollisions.length > 0) {
		return dropZoneCollisions;
	}

	// Fallback to rectIntersection if pointer isn't within any drop zone
	const rectCollisions = rectIntersection(args);
	return rectCollisions.filter((collision) => {
		const container = args.droppableContainers.find(
			(c) => c.id === collision.id,
		);
		return container && isDropData(container.data?.current);
	});
};

// ============================================================================
// New Window Drop Zone (at bottom of main container)
// ============================================================================

function NewWindowDropZone() {
	const { active } = useDndContext();
	const isDragging = active !== null;

	const dropData: DropDataNewWindow = { type: "new-window" };
	const { setNodeRef, isOver } = useDroppable({
		id: "new-window-drop",
		data: dropData,
	});

	if (!isDragging) {
		return null;
	}

	return (
		<div
			ref={setNodeRef}
			className={cn(
				"flex-1 min-h-24 flex items-center justify-center border-2 border-dashed rounded-lg transition-colors",
				isOver
					? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
					: "border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500",
			)}
		>
			<span className="text-sm font-medium">
				Drop here to create new window
			</span>
		</div>
	);
}

// ============================================================================
// Inner App Component (uses collections)
// ============================================================================
export const TabManagerContent = () => {
	const { useCollection } = useDrizzleIndexedDB<typeof schema>();
	const windowCollection = useCollection("windowTable");
	const tabCollection = useCollection("tabTable");
	const resetDatabase = useResetDatabase();
	const sendMoveIntent = useSendMoveIntent();
	const registerStateGetter = useRegisterStateGetter();
	const testActions = useTestActions();
	const { recordUserEvent } = useDevTools();
	const [isResetting, setIsResetting] = useState(false);

	// Reactive queries for windows and tabs
	const { data: windows, isLoading: windowsLoading } = useLiveQuery((q) =>
		q.from({ window: windowCollection }),
	);

	const { data: tabs, isLoading: tabsLoading } = useLiveQuery((q) =>
		q.from({ tab: tabCollection }),
	);

	// Register state getter for DevTools snapshots
	useEffect(() => {
		registerStateGetter(() => ({
			windows: windows ?? [],
			tabs: tabs ?? [],
		}));
	}, [registerStateGetter, windows, tabs]);

	// Expose current tree state to Playwright tests (updates when state changes)
	useEffect(() => {
		if (windows && tabs) {
			exposeCurrentTreeStateForTests(windows, tabs);
		}
	}, [windows, tabs]);

	// Expose browser test actions once on mount
	useEffect(() => {
		exposeBrowserTestActions(testActions);
	}, [testActions]);

	const [currentWindowId, setCurrentWindowId] = useState<number | undefined>();
	const [selectedTabIds, setSelectedTabIds] = useState<Set<number>>(new Set());
	const [lastSelectedTabId, setLastSelectedTabId] = useState<
		number | undefined
	>();
	const [activeId, setActiveId] = useState<string | null>(null);
	// const [activeDropData, setActiveDropData] = useState<DropData | null>(null);

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 5 },
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
			// Don't sort by tabIndex here - let buildTabTree handle the sorting by treeOrder
			// This ensures the tree structure is displayed correctly
			tabs: tabs.filter((tab) => tab.browserWindowId === win.browserWindowId),
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
			// setActiveDropData(null);

			const parts = (event.active.id as string).split("-");
			const draggedTabId = Number.parseInt(parts[parts.length - 1], 10);
			const windowIdPart = Number.parseInt(parts[parts.length - 2], 10);

			if (!selectedTabIds.has(draggedTabId)) {
				setSelectedTabIds(new Set([draggedTabId]));
			}

			// Record user event for DevTools
			const selectedIds = selectedTabIds.has(draggedTabId)
				? Array.from(selectedTabIds)
				: [draggedTabId];

			recordUserEvent({
				type: "user.dragStart",
				data: {
					tabId: draggedTabId,
					windowId: windowIdPart,
					selectedTabIds: selectedIds,
				},
			});
		},
		[selectedTabIds, recordUserEvent],
	);

	const handleDragOver = useCallback((event: DragOverEvent) => {
		const overData = event.over?.data?.current;
		if (isDropData(overData)) {
			const dragData = event.active?.data?.current;
			// if (isDragDataTab(dragData)) {
			console.log("dragData", dragData);
			console.log("overData", overData);
			// }
			// setActiveDropData(overData);
		} else {
			// setActiveDropData(null);
		}
	}, []);

	const handleDragCancel = useCallback(() => {
		setActiveId(null);
		// setActiveDropData(null);
	}, []);

	// Handle toggle collapse for a tab
	const handleToggleCollapse = useCallback(
		async (browserTabId: number) => {
			if (!tabs) return;

			const tab = tabs.find((t) => t.browserTabId === browserTabId);
			if (!tab) return;

			// Record user event for DevTools
			recordUserEvent({
				type: "user.toggleCollapse",
				data: {
					tabId: browserTabId,
					windowId: tab.browserWindowId,
				},
			});

			// Update the tab's collapsed state in the database
			// The collection key is the tab's id field, not browserTabId
			tabCollection.update(tab.id, (draft) => {
				draft.isCollapsed = !tab.isCollapsed;
			});
		},
		[tabs, tabCollection, recordUserEvent],
	);

	// Handle tab close with children
	const handleCloseTab = useCallback(
		async (browserTabId: number) => {
			if (!tabs) return;

			const tab = tabs.find((t) => t.browserTabId === browserTabId);
			if (!tab) return;

			// Record user event for DevTools
			recordUserEvent({
				type: "user.tabClose",
				data: {
					tabId: browserTabId,
					windowId: tab.browserWindowId,
				},
			});

			// Find all children of this tab
			const children = tabs.filter((t) => t.parentTabId === browserTabId);

			if (children.length > 0) {
				if (tab.isCollapsed) {
					// If collapsed, close all children recursively first, then the parent
					const allDescendantIds = getDescendantIds(tabs, browserTabId);
					// Close all descendants
					await browser.tabs.remove(allDescendantIds);
				} else {
					// If expanded, detach children and reconnect to parent's parent
					const newParentId = tab.parentTabId; // null for root, or parent's parent
					const windowTabs = tabs.filter(
						(t) => t.browserWindowId === tab.browserWindowId,
					);

					// Get siblings of the closing tab at its current level
					const siblings = windowTabs
						.filter((t) => t.parentTabId === tab.parentTabId)
						.sort((a, b) => a.treeOrder.localeCompare(b.treeOrder));
					
					const currentIndex = siblings.findIndex(
						(t) => t.browserTabId === browserTabId,
					);

					// Calculate tree order positions for children
					// They should be inserted where the parent was
					const prevSibling = currentIndex > 0 ? siblings[currentIndex - 1] : null;
					const nextSibling = currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;

					// Sort children by their current tree order to maintain relative positions
					const sortedChildren = [...children].sort((a, b) => a.treeOrder.localeCompare(b.treeOrder));
					
					// Generate new tree orders for all children at once
					const newTreeOrders = generateNKeysBetween(
						prevSibling?.treeOrder || null,
						nextSibling?.treeOrder || null,
						sortedChildren.length
					);
					
					const childUpdates = sortedChildren.map((child, index) => ({
						childId: child.id,
						parentTabId: newParentId,
						treeOrder: newTreeOrders[index],
					}));

					// Apply all updates to database
					for (const update of childUpdates) {
						tabCollection.update(update.childId, (draft) => {
							draft.parentTabId = update.parentTabId;
							draft.treeOrder = update.treeOrder;
						});
					}

					// Small delay to let database updates propagate
					await new Promise(resolve => setTimeout(resolve, 50));
				}
			}

			// Finally, close the tab itself
			await browser.tabs.remove(browserTabId);
		},
		[tabs, tabCollection, recordUserEvent],
	);

	// Handle window close
	const handleCloseWindow = useCallback(
		async (browserWindowId: number) => {
			if (!windows) return;

			const win = windows.find((w) => w.browserWindowId === browserWindowId);
			if (!win) return;

			// Record user event for DevTools
			recordUserEvent({
				type: "user.windowClose",
				data: {
					windowId: browserWindowId,
				},
			});

			// Close the window (all tabs will be closed automatically)
			await browser.windows.remove(browserWindowId);
		},
		[windows, recordUserEvent],
	);

	const handleDragEnd = useCallback(
		async (event: DragEndEvent) => {
			console.log("handleDragEnd", event);
			console.log("event.over", event.over);
			const dropData = event.over?.data?.current;

			// Get info for recording before any early returns
			const allItemsForRecord = getAllItems();
			const activeItemForRecord = allItemsForRecord.find(
				(item) => item.id === event.active.id,
			);
			const draggedTabIdForRecord = activeItemForRecord?.tabId;
			const draggedWindowIdForRecord = activeItemForRecord?.windowId;
			const selectedIdsForRecord =
				draggedTabIdForRecord && selectedTabIds.has(draggedTabIdForRecord)
					? Array.from(selectedTabIds)
					: draggedTabIdForRecord
						? [draggedTabIdForRecord]
						: [];

			// Record the drag end event
			if (
				draggedTabIdForRecord !== undefined &&
				draggedWindowIdForRecord !== undefined
			) {
				let dropTarget: Parameters<typeof recordUserEvent>[0] extends {
					data: infer D;
				}
					? D extends { dropTarget: infer T }
						? T
						: never
					: never = null;

				if (isDropData(dropData)) {
					if (dropData.type === "new-window") {
						dropTarget = { type: "new-window" };
					} else if (dropData.type === "sibling") {
						dropTarget = {
							type: "sibling",
							windowId: dropData.windowId,
							tabId: dropData.tabId,
							ancestorId: dropData.ancestorId,
						};
					} else if (dropData.type === "child") {
						dropTarget = {
							type: "child",
							windowId: dropData.windowId,
							tabId: dropData.tabId,
						};
					} else if (dropData.type === "gap") {
						dropTarget = {
							type: "gap",
							windowId: dropData.windowId,
							slot: dropData.slot,
						};
					}
				}

				recordUserEvent({
					type: "user.dragEnd",
					data: {
						tabId: draggedTabIdForRecord,
						windowId: draggedWindowIdForRecord,
						selectedTabIds: selectedIdsForRecord,
						dropTarget,
					},
				});
			}

			if (!isDropData(dropData)) {
				setActiveId(null);
				return;
			}

			console.log("dropData", dropData);

			setActiveId(null);

			if (!dropData || !tabs) {
				console.warn("no dropData or tabs");
				return;
			}

			const allItems = getAllItems();
			const activeItem = allItems.find((item) => item.id === event.active.id);
			if (!activeItem) {
				console.warn("no activeItem");
				return;
			}

			const activeTabId = activeItem.tabId;
			// Get dragged tabs in tree order, not selection order
			const draggedTabIds =
				activeTabId && selectedTabIds.has(activeTabId)
					? allItems
							.filter((item) => selectedTabIds.has(item.tabId))
							.map((item) => item.tabId)
					: activeTabId
						? [activeTabId]
						: [];

			if (draggedTabIds.length === 0) {
				console.warn("no draggedTabIds");
				return;
			}

			// Handle "new-window" drop type - create a new window with dragged tabs
			if (dropData.type === "new-window") {
				try {
					const newWindow = await browser.windows.create({
						tabId: draggedTabIds[0],
					});
					// Move remaining tabs to the new window if multiple selected
					if (draggedTabIds.length > 1 && newWindow?.id !== undefined) {
						for (let i = 1; i < draggedTabIds.length; i++) {
							await browser.tabs.move(draggedTabIds[i], {
								windowId: newWindow.id,
								index: i,
							});
						}
					}
				} catch (e) {
					console.error("Failed to create new window:", e);
				}
				return;
			}

			const targetWindowId = dropData.windowId;

			// Filter out invalid drops based on circular reference checks
			let validDraggedTabIds = draggedTabIds;

			if (dropData.type === "child") {
				// For child drops: can't drop a tab on itself or make it a child of its descendant
				const targetTabId = dropData.tabId;
				validDraggedTabIds = validDraggedTabIds.filter(
					(id) => id !== targetTabId && !isAncestor(tabs, id, targetTabId),
				);
			} else if (dropData.type === "sibling" && dropData.ancestorId !== null) {
				// For sibling drops with an ancestor: can't make a tab a child of its descendant
				// (ancestorId is the new parent, so check for circular reference)
				const newParentId = dropData.ancestorId;
				validDraggedTabIds = validDraggedTabIds.filter(
					(id) => !isAncestor(tabs, id, newParentId),
				);
			}
			// For sibling drops with ancestorId === null (root level), no filtering needed

			if (validDraggedTabIds.length === 0) {
				console.warn("no validDraggedTabIds");
				return;
			}

			// For tree operations, we need to update tree structure in the database
			// Get all tabs in the target window
			const windowTabs = tabs.filter(
				(t) => t.browserWindowId === targetWindowId,
			);

			// Check if this is a cross-window move
			const firstDraggedTab = tabs.find(
				(t) => t.browserTabId === validDraggedTabIds[0],
			);
			if (!firstDraggedTab) return;

			const isCrossWindowMove =
				firstDraggedTab.browserWindowId !== targetWindowId;

			// For cross-window moves, we need to include the dragged tabs in the target window's tab list
			// for proper tree calculation
			let tabsForTreeCalc = windowTabs;
			if (isCrossWindowMove) {
				// Add dragged tabs to the target window's tab list (with updated windowId)
				const draggedTabs = tabs.filter((t) =>
					validDraggedTabIds.includes(t.browserTabId),
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

			if (dropData.type === "gap") {
				treeDropPosition = { type: "root", index: dropData.slot };
			} else if (dropData.type === "child") {
				// Drop as child of target
				treeDropPosition = { type: "child", parentTabId: dropData.tabId };
			} else if (dropData.type === "sibling") {
				console.log("dropData", dropData);
				const ancestorId = dropData.ancestorId;

				// ancestorId is the new parent for the dragged tab
				// null = root level (parentId becomes null)
				// number = become child of that ancestor

				const targetTab = tabsForTreeCalc.find(
					(t) => t.browserTabId === dropData.tabId,
				);
				if (!targetTab) return;

				if (ancestorId === null) {
					// Becoming a root sibling - drop after the target tab's root ancestor
					// Find the root ancestor of targetTab
					let rootAncestor = targetTab;
					while (rootAncestor.parentTabId !== null) {
						const parent = tabsForTreeCalc.find(
							(t) => t.browserTabId === rootAncestor.parentTabId,
						);
						if (!parent) break;
						rootAncestor = parent;
					}
					treeDropPosition = {
						type: "after",
						targetTabId: rootAncestor.browserTabId,
					};
				} else {
					// Becoming a child of ancestorId - find the last child of ancestorId
					// that's an ancestor of (or is) the target tab, and drop after it

					// Build ancestor chain from ancestorId to targetTab
					const ancestorChain: (typeof tabs)[0][] = [];
					let current: (typeof tabs)[0] | undefined = targetTab;
					while (current && current.browserTabId !== ancestorId) {
						ancestorChain.unshift(current);
						if (current.parentTabId === null) break;
						current = tabsForTreeCalc.find(
							(t) => t.browserTabId === current!.parentTabId,
						);
					}

					// The first item in ancestorChain is the direct child of ancestorId
					// that leads to targetTab (or targetTab itself if it's a direct child)
					if (ancestorChain.length > 0) {
						treeDropPosition = {
							type: "after",
							targetTabId: ancestorChain[0].browserTabId,
						};
					} else {
						// targetTab is ancestorId itself, drop after it
						treeDropPosition = { type: "after", targetTabId: dropData.tabId };
					}
				}
			} else {
				return;
			}

			// Calculate the new parent and treeOrder
			const { parentTabId: newParentId, treeOrder: newTreeOrder } =
				calculateTreeMove(
					tabsForTreeCalc,
					validDraggedTabIds[0],
					treeDropPosition,
				);

			// Update tree structure in the database for each dragged tab
			// First, create the updated tabs with new tree positions
			const updatedTabs: Array<{
				tab: (typeof tabs)[0];
				newParentId: number | null;
				newTreeOrder: string;
				newWindowId: number;
			}> = [];

			for (let i = 0; i < validDraggedTabIds.length; i++) {
				const browserTabId = validDraggedTabIds[i];
				const tab = tabs.find((t) => t.browserTabId === browserTabId);
				if (!tab) continue;

				// For multiple selections, keep their relative order
				const orderSuffix = i > 0 ? String.fromCharCode(97 + i) : ""; // a, b, c...
				const tabNewTreeOrder = newTreeOrder + orderSuffix;

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

			// Flatten to get expected browser order
			const newTree = buildTabTree(updatedWindowTabs);
			const flatOrder = flattenTree(newTree);

			// Collect all tabs that need to move: dragged tabs + their descendants
			// This ensures when we move a parent, its children move with it in Chrome
			const tabsToMove = new Set<number>();
			for (const { tab } of updatedTabs) {
				tabsToMove.add(tab.browserTabId);
				// Add all descendants of this tab
				const descendants = getDescendantIds(
					updatedWindowTabs,
					tab.browserTabId,
				);
				for (const descendantId of descendants) {
					tabsToMove.add(descendantId);
				}
			}

			// Move tabs in the order they appear in the flattened tree
			// This ensures correct positioning (parent first, then children)
			const orderedTabsToMove = flatOrder
				.filter((node) => tabsToMove.has(node.tab.browserTabId))
				.map((node) => node.tab.browserTabId);

			// Send move intent to background BEFORE calling browser.tabs.move
			// This prevents the race condition where onMoved handler reads stale DB state
			const moveIntents = orderedTabsToMove.map((browserTabId) => {
				const tabData = updatedWindowTabs.find(
					(t) => t.browserTabId === browserTabId,
				);
				return {
					tabId: browserTabId,
					parentTabId: tabData?.parentTabId ?? null,
					treeOrder: tabData?.treeOrder ?? "a0",
				};
			});
			sendMoveIntent(moveIntents);

			// Move each tab to its expected position sequentially
			// Using sequential moves because browser.tabs.move with multiple tabs is unreliable
			for (const browserTabId of orderedTabsToMove) {
				const expectedIndex = flatOrder.findIndex(
					(t) => t.tab.browserTabId === browserTabId,
				);

				if (expectedIndex !== -1) {
					// For cross-window moves, we need to specify the windowId
					await browser.tabs.move(browserTabId, {
						windowId: targetWindowId,
						index: expectedIndex,
					});
				}
			}
		},
		[
			getAllItems,
			selectedTabIds,
			tabs,
			tabCollection,
			recordUserEvent,
			sendMoveIntent,
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
				data-testid="tab-manager"
				className={cn(
					"p-4 max-w-full min-h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white/90 flex flex-col",
				)}
			>
			<div className="flex items-center justify-between">
				<img
					src={import.meta.env.DEV ? "/icon-dev/128.png" : "/icon/128.png"}
					alt="Tab Canopy"
					className="size-6"
				/>
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
				<div className="flex flex-col">
					{windowsWithTabs.map(({ window: win, tabs: windowTabs }, index) => (
						<WindowGroup
							key={win.id}
							window={win}
							tabs={windowTabs}
							isCurrentWindow={
								currentWindowId !== undefined &&
								win.browserWindowId === currentWindowId
							}
							isLastWindow={index === windowsWithTabs.length - 1}
							selectedTabIds={selectedTabIds}
							setSelectedTabIds={setSelectedTabIds}
							lastSelectedTabId={lastSelectedTabId}
							setLastSelectedTabId={setLastSelectedTabId}
							onToggleCollapse={handleToggleCollapse}
							onCloseTab={handleCloseTab}
							onCloseWindow={handleCloseWindow}
						/>
					))}
				</div>
				{/* Drop zone at bottom to create new window */}
				<NewWindowDropZone />
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
