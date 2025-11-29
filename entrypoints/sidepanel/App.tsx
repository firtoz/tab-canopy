import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { atom, type PrimitiveAtom, useAtom, useStore } from "jotai";
import { Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SortableTab, WindowGroup } from "./components/WindowGroup";
import { cn } from "./lib/cn";
import { calculateSequentialMoves, type ReorderPosition } from "./lib/reorder";
import type { TabAtomValue } from "./store/TabAtomValue";
import type { WindowData } from "./store/WindowData";
import { windowListAtom } from "./store/windowListAtom";

const tabAtomMap = new Map<number, PrimitiveAtom<TabAtomValue>>();
const windowAtomMap = new Map<number, PrimitiveAtom<WindowData>>();

// Atom to track selected tab IDs for multi-select
export const selectedTabIdsAtom = atom<Set<number>>(new Set<number>());

function App() {
	const [windowList, setWindowList] = useAtom(windowListAtom);
	const [currentWindowId, setCurrentWindowId] = useState<number | undefined>();
	const [selectedTabIds, setSelectedTabIds] = useAtom(selectedTabIdsAtom);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [activeDropZone, setActiveDropZone] = useState<string | null>(null);

	const store = useStore();

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 5,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	useEffect(() => {
		const getTabs = async () => {
			// Get the current window (where this side panel is)
			const currentWindow = await browser.windows.getCurrent();
			setCurrentWindowId(currentWindow.id);

			// Get all windows and tabs
			const allWindows = await browser.windows.getAll();
			const allTabs = await browser.tabs.query({});

			// First pass: Create window atoms from windows
			const windowAtomList: PrimitiveAtom<WindowData>[] = [];
			for (const win of allWindows) {
				const windowId = win.id;
				if (windowId === undefined) {
					console.error("Window has no id", win);
					continue;
				}

				const windowAtom = atom<WindowData>({
					windowId,
					tabAtoms: [],
					activeTabId: undefined,
					focused: win.focused ?? false,
				});
				windowAtomMap.set(windowId, windowAtom);
				windowAtomList.push(windowAtom);
			}

			// Second pass: Add tabs to their respective windows
			for (const tab of allTabs) {
				const tabId = tab.id;
				const windowId = tab.windowId;

				if (!tabId) {
					console.error("Tab has no id", tab);
					continue;
				}

				if (windowId === undefined) {
					console.error("Tab has no windowId", tab);
					continue;
				}

				// Get the window atom - it MUST exist
				const windowAtom = windowAtomMap.get(windowId);
				if (!windowAtom) {
					console.error(
						"Window atom not found for window",
						windowId,
						"- tab",
						tabId,
						"cannot be initialized",
					);
					continue;
				}

				// Create tab atom with window reference
				const tabAtom = atom<TabAtomValue>({ tab, windowAtom });
				tabAtomMap.set(tabId, tabAtom);

				// Add tab to window
				const window = store.get(windowAtom);
				store.set(windowAtom, {
					...window,
					tabAtoms: [...window.tabAtoms, tabAtom],
					activeTabId: tab.active ? tabId : window.activeTabId,
				});
			}

			console.log("Window atom list:", windowAtomList);
			setWindowList(windowAtomList);
		};

		const handleTabUpdated = (
			tabId: number,
			changeInfo: globalThis.Browser.tabs.OnUpdatedInfo,
			tab: globalThis.Browser.tabs.Tab,
		) => {
			console.log(
				"[handleTabUpdated] tab with id",
				tabId,
				"updated",
				changeInfo,
			);
			const tabAtom = tabAtomMap.get(tabId);
			if (!tabAtom) {
				return;
			}
			const currentValue = store.get(tabAtom);
			store.set(tabAtom, { ...currentValue, tab });
		};

		const handleTabCreated = (tab: globalThis.Browser.tabs.Tab) => {
			console.log("[handleTabCreated] tab with id", tab.id, "created", tab);

			const tabId = tab.id;
			if (!tabId || tab.index === undefined) {
				return;
			}
			const windowAtom = windowAtomMap.get(tab.windowId);
			if (!windowAtom) {
				console.error(
					"Window atom not found for window",
					tab.windowId,
					"- tab",
					tabId,
					"cannot be created",
				);
				return;
			}

			// Check if tab already exists (shouldn't happen, but defensive)
			let tabAtom = tabAtomMap.get(tabId);
			if (!tabAtom) {
				tabAtom = atom<TabAtomValue>({ tab, windowAtom });
				tabAtomMap.set(tabId, tabAtom);
			} else {
				// Update existing atom
				store.set(tabAtom, { tab, windowAtom });
			}

			const window = store.get(windowAtom);
			const newTabAtoms = [...window.tabAtoms];

			// Check if tab atom is already in the window (shouldn't happen, but defensive)
			const existingIndex = newTabAtoms.indexOf(tabAtom);
			if (existingIndex !== -1) {
				// Already exists, don't add again
				console.warn(
					"Tab atom already exists in window during creation, skipping",
				);
				return;
			}

			// Insert at the correct index
			newTabAtoms.splice(tab.index, 0, tabAtom);

			// Update the window atom with the new tab list and active tab if needed
			store.set(windowAtom, {
				...window,
				tabAtoms: newTabAtoms,
				activeTabId: tab.active ? tabId : window.activeTabId,
			});

			// Update indices for all tabs at or after the insertion point
			// Also update active state if new tab is active
			for (let i = tab.index; i < newTabAtoms.length; i++) {
				const tabAtomAtIndex = newTabAtoms[i];
				if (tabAtomAtIndex) {
					const currentValue = store.get(tabAtomAtIndex);
					const isNewTab = tabAtomAtIndex === tabAtom;
					store.set(tabAtomAtIndex, {
						...currentValue,
						tab: {
							...currentValue.tab,
							index: i,
							// If new tab is active, set other tabs to inactive
							active: isNewTab
								? tab.active
								: tab.active
									? false
									: currentValue.tab.active,
						},
					});
				}
			}

			// Also update tabs before the insertion point if new tab is active
			if (tab.active) {
				for (let i = 0; i < tab.index; i++) {
					const tabAtomAtIndex = newTabAtoms[i];
					if (tabAtomAtIndex) {
						const currentValue = store.get(tabAtomAtIndex);
						if (currentValue.tab.active) {
							store.set(tabAtomAtIndex, {
								...currentValue,
								tab: { ...currentValue.tab, active: false },
							});
						}
					}
				}
			}
		};

		const handleTabRemoved = (
			tabId: number,
			_removeInfo: globalThis.Browser.tabs.OnRemovedInfo,
		) => {
			console.log("[handleTabRemoved] tab with id", tabId, "removed");
			const tabAtom = tabAtomMap.get(tabId);
			if (!tabAtom) {
				return;
			}
			const tab = store.get(tabAtom).tab;
			if (!tab || tab.index === undefined) {
				return;
			}
			const windowId = tab.windowId;
			const removedIndex = tab.index;

			if (windowId) {
				const windowAtom = windowAtomMap.get(windowId);
				if (!windowAtom) {
					console.error(
						"Window atom not found for window",
						windowId,
						"- tab",
						tabId,
						"cannot be removed",
					);
					return;
				}

				const window = store.get(windowAtom);
				const newTabAtoms = window.tabAtoms.filter(
					(t) => store.get(t).tab.id !== tabId,
				);

				// Update the window atom
				store.set(windowAtom, {
					...window,
					tabAtoms: newTabAtoms,
				});

				// Update indices for all tabs after the removed tab
				// They all shift down by 1
				for (let i = removedIndex; i < newTabAtoms.length; i++) {
					const tabAtomAtIndex = newTabAtoms[i];
					if (tabAtomAtIndex) {
						const currentValue = store.get(tabAtomAtIndex);
						store.set(tabAtomAtIndex, {
							...currentValue,
							tab: { ...currentValue.tab, index: i },
						});
					}
				}

				// Clean up the removed tab from the map
				tabAtomMap.delete(tabId);
			}
		};

		const handleTabMoved = (
			tabId: number,
			moveInfo: globalThis.Browser.tabs.OnMovedInfo,
		) => {
			console.log("[handleTabMoved] tab with id", tabId, "moved", moveInfo);
			const { fromIndex, toIndex } = moveInfo;

			const tabAtom = tabAtomMap.get(tabId);
			if (!tabAtom) {
				return;
			}

			const windowAtom = windowAtomMap.get(moveInfo.windowId);
			if (!windowAtom) {
				console.error(
					"Window atom not found for window",
					moveInfo.windowId,
					"- tab",
					tabId,
					"cannot be moved",
				);
				return;
			}

			const window = store.get(windowAtom);

			// Check if already applied optimistically (e.g., from drag-and-drop)
			// If the tab is already at toIndex, skip the move to avoid double-flip
			const tabAtToIndex = window.tabAtoms[toIndex];
			if (tabAtToIndex && store.get(tabAtToIndex).tab.id === tabId) {
				console.log(
					"[handleTabMoved] Tab already at target position, skipping move",
				);
				// Still update indices to ensure consistency
				const minIndex = Math.min(fromIndex, toIndex);
				const maxIndex = Math.max(fromIndex, toIndex);
				for (let i = minIndex; i <= maxIndex; i++) {
					const tabAtomAtIndex = window.tabAtoms[i];
					if (tabAtomAtIndex) {
						const currentValue = store.get(tabAtomAtIndex);
						store.set(tabAtomAtIndex, {
							...currentValue,
							tab: { ...currentValue.tab, index: i },
						});
					}
				}
				return;
			}

			// Apply the move: remove from fromIndex, insert at toIndex
			// This mirrors what Chrome does - it's not a swap, it's a splice operation
			const newTabAtoms = [...window.tabAtoms];
			const [movedTabAtom] = newTabAtoms.splice(fromIndex, 1);
			newTabAtoms.splice(toIndex, 0, movedTabAtom);

			// Update the window atom with the new tab order
			store.set(windowAtom, {
				...window,
				tabAtoms: newTabAtoms,
			});

			// Update indices for all affected tabs
			// All tabs between fromIndex and toIndex (inclusive) need their indices updated
			const minIndex = Math.min(fromIndex, toIndex);
			const maxIndex = Math.max(fromIndex, toIndex);

			for (let i = minIndex; i <= maxIndex; i++) {
				const tabAtomAtIndex = newTabAtoms[i];
				if (tabAtomAtIndex) {
					const currentValue = store.get(tabAtomAtIndex);
					store.set(tabAtomAtIndex, {
						...currentValue,
						tab: { ...currentValue.tab, index: i },
					});
				}
			}
		};

		const handleTabActivated = (
			activeInfo: globalThis.Browser.tabs.OnActivatedInfo,
		) => {
			console.log(
				"[handleTabActivated] tab with id",
				activeInfo.tabId,
				"activated",
				activeInfo,
			);
			const { tabId, windowId } = activeInfo;
			if (!tabId) {
				return;
			}

			const windowAtom = windowAtomMap.get(windowId);
			if (!windowAtom) {
				console.error(
					"Window atom not found for window",
					windowId,
					"- tab",
					tabId,
					"cannot be activated",
				);
				return;
			}

			// Get the previously active tab for this window
			const windowData = store.get(windowAtom);
			const previousTabId = windowData.activeTabId;

			if (previousTabId !== undefined) {
				const previousTabAtom = tabAtomMap.get(previousTabId);
				if (previousTabAtom) {
					console.log("deactivating tab with id", previousTabId);
					const prevValue = store.get(previousTabAtom);
					store.set(previousTabAtom, {
						...prevValue,
						tab: { ...prevValue.tab, active: false },
					});
				}
			}

			// Activate the new tab
			const tabAtom = tabAtomMap.get(tabId);
			if (tabAtom) {
				console.log("activating tab with id", tabId);
				const currentValue = store.get(tabAtom);
				store.set(tabAtom, {
					...currentValue,
					tab: { ...currentValue.tab, active: true },
				});
			}

			// Update the active tab ID in the window atom
			store.set(windowAtom, (v) => ({
				...v,
				activeTabId: tabId,
			}));
		};

		const handleTabDetached = (
			tabId: number,
			detachInfo: globalThis.Browser.tabs.OnDetachedInfo,
		) => {
			console.log(
				"[handleTabDetached] tab with id",
				tabId,
				"detached",
				detachInfo,
			);

			const tabAtom = tabAtomMap.get(tabId);
			if (!tabAtom) {
				return;
			}

			const tabValue = store.get(tabAtom);
			const tab = tabValue.tab;
			if (!tab || tab.index === undefined) {
				return;
			}

			const wasActive = tab.active;
			const oldWindowId = detachInfo.oldWindowId;
			const oldIndex = detachInfo.oldPosition;
			const windowAtom = windowAtomMap.get(oldWindowId);
			if (!windowAtom) {
				console.error(
					"Window atom not found for window",
					oldWindowId,
					"- tab",
					tabId,
					"cannot be detached",
				);
				return;
			}

			const window = store.get(windowAtom);
			const newTabAtoms = window.tabAtoms.filter(
				(t) => store.get(t).tab.id !== tabId,
			);

			// Update the window atom - clear activeTabId if detached tab was active
			store.set(windowAtom, (w) => ({
				...w,
				tabAtoms: newTabAtoms,
				activeTabId: wasActive ? undefined : w.activeTabId,
			}));

			// Update indices for all tabs after the detached tab in the old window
			for (let i = oldIndex; i < newTabAtoms.length; i++) {
				const tabAtomAtIndex = newTabAtoms[i];
				if (tabAtomAtIndex) {
					const currentValue = store.get(tabAtomAtIndex);
					store.set(tabAtomAtIndex, {
						...currentValue,
						tab: { ...currentValue.tab, index: i },
					});
				}
			}

			// Note: The tab atom stays in tabAtomMap for onAttached
		};

		const handleTabAttached = async (
			tabId: number,
			attachInfo: globalThis.Browser.tabs.OnAttachedInfo,
		) => {
			console.log(
				"[handleTabAttached] tab with id",
				tabId,
				"- attachInfo",
				attachInfo,
			);

			const tabAtom = tabAtomMap.get(tabId);
			if (!tabAtom) {
				console.error("Tab atom not found for tab", tabId);
				return;
			}

			const { newWindowId, newPosition } = attachInfo;
			const windowAtom = windowAtomMap.get(newWindowId);

			// Window should exist - if not, it's an error state
			if (!windowAtom) {
				console.error(
					"Window atom not found for window",
					newWindowId,
					"- tab",
					tabId,
					"cannot be attached",
				);
				return;
			}

			// Fetch fresh tab data to get active state
			const freshTab = await browser.tabs.get(tabId);
			const isActive = freshTab.active;

			// Update the tab atom with new window reference and updated tab data
			store.set(tabAtom, (t) => ({
				tab: {
					...t.tab,
					...freshTab,
					windowId: newWindowId,
					index: newPosition,
				},
				windowAtom,
			}));

			const window = store.get(windowAtom);
			const newTabAtoms = [...window.tabAtoms];

			// Insert at the new position
			newTabAtoms.splice(newPosition, 0, tabAtom);

			// Update the window atom with new activeTabId if this tab is active
			store.set(windowAtom, {
				...window,
				tabAtoms: newTabAtoms,
				activeTabId: isActive ? tabId : window.activeTabId,
			});

			// Update indices for all tabs at or after the insertion point
			// Also update active state if attached tab is active
			for (let i = newPosition; i < newTabAtoms.length; i++) {
				const tabAtomAtIndex = newTabAtoms[i];
				if (tabAtomAtIndex) {
					const isAttachedTab = tabAtomAtIndex === tabAtom;
					store.set(tabAtomAtIndex, (t) => ({
						...t,
						tab: {
							...t.tab,
							index: i,
							// If attached tab is active, set other tabs to inactive
							active: isAttachedTab
								? isActive
								: isActive
									? false
									: t.tab.active,
						},
					}));
				}
			}

			// Also update tabs before the insertion point if attached tab is active
			if (isActive) {
				for (let i = 0; i < newPosition; i++) {
					const tabAtomAtIndex = newTabAtoms[i];
					if (tabAtomAtIndex) {
						const currentValue = store.get(tabAtomAtIndex);
						if (currentValue.tab.active) {
							store.set(tabAtomAtIndex, {
								...currentValue,
								tab: { ...currentValue.tab, active: false },
							});
						}
					}
				}
			}
		};

		const handleWindowCreated = (window: globalThis.Browser.windows.Window) => {
			console.log(
				"[handleWindowCreated] window with id",
				window.id,
				"created",
				window,
			);

			const windowId = window.id;
			if (!windowId) {
				return;
			}

			console.log("Window created with id", windowId);

			// Create a new window atom with empty tabs
			const windowAtom = atom<WindowData>({
				windowId,
				tabAtoms: [],
				activeTabId: undefined,
				focused: window.focused ?? false,
			});
			windowAtomMap.set(windowId, windowAtom);
			setWindowList((prev) => [...prev, windowAtom]);

			// Note: tabs will be added via onCreated or onAttached events
		};

		const handleWindowFocusChanged = (windowId: number) => {
			console.log(
				"[handleWindowFocusChanged] window with id",
				windowId,
				"focus changed",
			);

			// windowId -1 means no window is focused
			if (windowId === browser.windows.WINDOW_ID_NONE) {
				// Unfocus all windows
				for (const [, windowAtom] of windowAtomMap) {
					const window = store.get(windowAtom);
					store.set(windowAtom, {
						...window,
						focused: false,
					});
				}
				return;
			}

			// Set all windows to unfocused except the newly focused one
			for (const [winId, windowAtom] of windowAtomMap) {
				const window = store.get(windowAtom);
				store.set(windowAtom, {
					...window,
					focused: winId === windowId,
				});
			}
		};

		const handleWindowRemoved = (windowId: number) => {
			console.log("[handleWindowRemoved] window with id", windowId, "removed");
			const windowAtom = windowAtomMap.get(windowId);
			if (!windowAtom) {
				return;
			}

			// Clean up all tabs in this window from the map
			const window = store.get(windowAtom);
			for (const tabAtom of window.tabAtoms) {
				const tab = store.get(tabAtom).tab;
				if (tab.id) {
					tabAtomMap.delete(tab.id);
				}
			}

			windowAtomMap.delete(windowId);
			setWindowList((prev) => prev.filter((w) => w !== windowAtom));
		};

		browser.tabs.onUpdated.addListener(handleTabUpdated);
		browser.tabs.onCreated.addListener(handleTabCreated);
		browser.tabs.onRemoved.addListener(handleTabRemoved);
		browser.tabs.onMoved.addListener(handleTabMoved);
		browser.tabs.onActivated.addListener(handleTabActivated);
		browser.tabs.onDetached.addListener(handleTabDetached);
		browser.tabs.onAttached.addListener(handleTabAttached);

		browser.windows.onCreated.addListener(handleWindowCreated);
		browser.windows.onRemoved.addListener(handleWindowRemoved);
		browser.windows.onFocusChanged.addListener(handleWindowFocusChanged);

		getTabs();

		return () => {
			browser.tabs.onUpdated.removeListener(handleTabUpdated);
			browser.tabs.onCreated.removeListener(handleTabCreated);
			browser.tabs.onRemoved.removeListener(handleTabRemoved);
			browser.tabs.onMoved.removeListener(handleTabMoved);
			browser.tabs.onActivated.removeListener(handleTabActivated);
			browser.tabs.onDetached.removeListener(handleTabDetached);
			browser.tabs.onAttached.removeListener(handleTabAttached);

			browser.windows.onCreated.removeListener(handleWindowCreated);
			browser.windows.onRemoved.removeListener(handleWindowRemoved);
			browser.windows.onFocusChanged.removeListener(handleWindowFocusChanged);

			tabAtomMap.clear();
			windowAtomMap.clear();
			setWindowList([]);
		};
	}, [setWindowList, store]);

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

	// Get all items across all windows for drag operations
	const getAllItems = useCallback(() => {
		const allItems: {
			id: string;
			tabId: number | undefined;
			atom: PrimitiveAtom<TabAtomValue>;
			windowId: number;
		}[] = [];
		for (const windowAtom of windowList) {
			const windowData = store.get(windowAtom);
			for (const tabAtom of windowData.tabAtoms) {
				const tabData = store.get(tabAtom);
				allItems.push({
					id: `tab-${windowData.windowId}-${tabData.tab.id}`,
					tabId: tabData.tab.id,
					atom: tabAtom,
					windowId: windowData.windowId,
				});
			}
		}
		return allItems;
	}, [windowList, store]);

	const handleDragStart = useCallback(
		(event: DragStartEvent) => {
			const { active } = event;
			setActiveId(active.id as string);
			setActiveDropZone(null);

			// Extract tab ID from the id (format: tab-windowId-tabId)
			const parts = (active.id as string).split("-");
			const draggedTabId = Number.parseInt(parts[parts.length - 1], 10);
			if (!selectedTabIds.has(draggedTabId)) {
				setSelectedTabIds(new Set([draggedTabId]));
			}
		},
		[selectedTabIds, setSelectedTabIds],
	);

	const handleDragOver = useCallback((event: DragOverEvent) => {
		const { over } = event;

		if (!over) {
			setActiveDropZone(null);
			return;
		}

		const overIdStr = over.id as string;
		// Only track drop zones (not tab sortables)
		if (overIdStr.startsWith("drop-")) {
			setActiveDropZone(overIdStr);
		}
	}, []);

	const handleDragCancel = useCallback(() => {
		setActiveId(null);
		setActiveDropZone(null);
	}, []);

	// Parse drop zone ID to get window ID and slot
	// Format: "drop-{windowId}-{tabIndex}-{top|bottom}" or "drop-{windowId}-gap-{slotIndex}"
	const parseDropZone = useCallback(
		(dropZoneId: string): { windowId: number; slot: number } | null => {
			const parts = dropZoneId.split("-");
			if (parts[0] !== "drop") return null;

			const windowId = Number.parseInt(parts[1], 10);

			if (parts[2] === "gap") {
				// Gap drop zone: drop-{windowId}-gap-{slotIndex}
				const slot = Number.parseInt(parts[3], 10);
				return { windowId, slot };
			}
			// Tab drop zone: drop-{windowId}-{tabIndex}-{top|bottom}
			const tabIndex = Number.parseInt(parts[2], 10);
			const position = parts[3];
			// top = before this tab (slot = tabIndex)
			// bottom = after this tab (slot = tabIndex + 1)
			const slot = position === "top" ? tabIndex : tabIndex + 1;
			return { windowId, slot };
		},
		[],
	);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active } = event;
			const dropZone = activeDropZone;

			setActiveId(null);
			setActiveDropZone(null);

			if (!dropZone) return;

			const parsed = parseDropZone(dropZone);
			if (!parsed) return;

			const { windowId: targetWindowId, slot: targetSlot } = parsed;

			const allItems = getAllItems();
			const activeItem = allItems.find((item) => item.id === active.id);
			if (!activeItem) return;

			const activeTabId = activeItem.tabId;
			const draggedTabIds =
				activeTabId && selectedTabIds.has(activeTabId)
					? Array.from(selectedTabIds)
					: activeTabId
						? [activeTabId]
						: [];

			if (draggedTabIds.length === 0) return;

			// Get target window's current tabs
			const windowItems = allItems.filter((i) => i.windowId === targetWindowId);
			const windowTabIds = windowItems
				.map((i) => i.tabId)
				.filter((id): id is number => id !== undefined);

			// Separate selected tabs by source window
			const selectedSet = new Set(draggedTabIds);
			const selectedFromTarget = draggedTabIds.filter((id) =>
				windowTabIds.includes(id),
			);
			const selectedFromOther = draggedTabIds.filter(
				(id) => !windowTabIds.includes(id),
			);

			// Check if ALL selected tabs are in the target window
			if (selectedFromOther.length === 0) {
				// Same window reorder - use the sequential moves logic
				let reorderPosition: ReorderPosition;
				if (targetSlot === 0) {
					reorderPosition = "start";
				} else if (targetSlot >= windowTabIds.length) {
					reorderPosition = "end";
				} else {
					reorderPosition = { before: targetSlot };
				}

				const operations = calculateSequentialMoves(
					windowTabIds,
					draggedTabIds,
					reorderPosition,
				);

				for (const op of operations) {
					browser.tabs.move(op.tabId, { index: op.toIndex });
				}
			} else {
				// Mixed-window move - need careful index tracking
				// Step 1: Calculate adjusted slot (accounting for selected tabs being removed)
				const selectedIndicesBefore = windowTabIds
					.slice(0, targetSlot)
					.filter((id) => selectedSet.has(id)).length;
				const adjustedSlot = targetSlot - selectedIndicesBefore;

				// Step 2: Calculate final same-window array (to figure out same-window moves)
				const nonSelected = windowTabIds.filter((id) => !selectedSet.has(id));
				const sameWindowFinal = [
					...nonSelected.slice(0, adjustedSlot),
					...selectedFromTarget,
					...nonSelected.slice(adjustedSlot),
				];

				// Step 3: Move same-window selected tabs first
				// We need to process in an order that doesn't mess up indices
				// Calculate each tab's current and target index, then use sequential moves
				if (selectedFromTarget.length > 0) {
					// Figure out target indices for same-window selected tabs
					const sameWindowTargetIndices = selectedFromTarget.map((id) =>
						sameWindowFinal.indexOf(id),
					);

					// Use our existing sequential moves logic
					let reorderPosition: ReorderPosition;
					const firstTargetIndex = sameWindowTargetIndices[0];
					if (firstTargetIndex === 0) {
						reorderPosition = "start";
					} else if (firstTargetIndex >= windowTabIds.length) {
						reorderPosition = "end";
					} else {
						reorderPosition = { before: firstTargetIndex };
					}

					const operations = calculateSequentialMoves(
						windowTabIds,
						selectedFromTarget,
						reorderPosition,
					);

					for (const op of operations) {
						browser.tabs.move(op.tabId, { index: op.toIndex });
					}
				}

				// Step 4: Insert cross-window tabs
				// Each cross-window tab goes at: adjustedSlot + (same-window tabs before it in selection) + (its index among cross-window tabs)
				for (let i = 0; i < selectedFromOther.length; i++) {
					const tabId = selectedFromOther[i];
					// Find position in original selection
					const positionInSelection = draggedTabIds.indexOf(tabId);
					// Count same-window tabs that come before this in selection
					const sameWindowBefore = draggedTabIds
						.slice(0, positionInSelection)
						.filter((id) => selectedFromTarget.includes(id)).length;
					// Target index
					const targetIndex = adjustedSlot + sameWindowBefore + i;

					browser.tabs.move(tabId, {
						windowId: targetWindowId,
						index: targetIndex,
					});
				}
			}
		},
		[getAllItems, selectedTabIds, activeDropZone, parseDropZone],
	);

	// Find active item for drag overlay
	const allItems = getAllItems();
	const activeItem = activeId
		? allItems.find((item) => item.id === activeId)
		: null;

	const selectedItems =
		activeItem && selectedTabIds.has(activeItem.tabId ?? -1)
			? allItems.filter((item) => item.tabId && selectedTabIds.has(item.tabId))
			: activeItem
				? [activeItem]
				: [];

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
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
					<h1 className="text-2xl font-semibold m-0">Tab Canopy</h1>
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
				<div className="flex flex-col gap-6">
					{windowList.map((windowAtom) => {
						const windowData = store.get(windowAtom);
						return (
							<WindowGroup
								key={`${windowAtom}`}
								windowAtom={windowAtom}
								isCurrentWindow={
									currentWindowId !== undefined &&
									windowData.windowId === currentWindowId
								}
								activeDropZone={activeDropZone}
							/>
						);
					})}
				</div>
			</div>
			<DragOverlay dropAnimation={null}>
				{activeId && selectedItems.length > 0 && (
					<div className="flex flex-col gap-2 cursor-grabbing">
						{selectedItems.map((item, index) => (
							<SortableTab
								key={item.id}
								id={item.id}
								windowId={item.windowId}
								tabIndex={index}
								tabAtom={item.atom}
								isSelected={true}
								isDragOverlay={true}
								isDragging={false}
								onSelect={() => {}}
								lastSelectedTabId={undefined}
							/>
						))}
					</div>
				)}
			</DragOverlay>
		</DndContext>
	);
}

export default App;
