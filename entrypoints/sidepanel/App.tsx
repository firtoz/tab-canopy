import { atom, type PrimitiveAtom, useAtom, useStore } from "jotai";
import { Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { WindowGroup } from "./components/WindowGroup";
import type { TabAtomValue } from "./store/TabAtomValue";
import type { WindowData } from "./store/WindowData";
import { windowListAtom } from "./store/windowListAtom";

const tabAtomMap = new Map<number, PrimitiveAtom<TabAtomValue>>();
const windowAtomMap = new Map<number, PrimitiveAtom<WindowData>>();

function App() {
	const [windowList, setWindowList] = useAtom(windowListAtom);
	const [currentWindowId, setCurrentWindowId] = useState<number | undefined>();

	const store = useStore();

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

			// Update the window atom with the new tab list
			store.set(windowAtom, {
				...window,
				tabAtoms: newTabAtoms,
			});

			// Update indices for all tabs at or after the insertion point
			for (let i = tab.index; i < newTabAtoms.length; i++) {
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

			const tab = store.get(tabAtom).tab;
			if (!tab || tab.index === undefined) {
				return;
			}

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

			// Update the window atom
			store.set(windowAtom, (w) => ({
				...w,
				tabAtoms: newTabAtoms,
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

			// Update the tab atom with new window reference and updated tab data
			store.set(tabAtom, (t) => ({
				tab: {
					...t.tab,
					windowId: newWindowId,
					index: newPosition,
				},
				windowAtom,
			}));

			const window = store.get(windowAtom);
			const newTabAtoms = [...window.tabAtoms];

			// Insert at the new position
			newTabAtoms.splice(newPosition, 0, tabAtom);

			// Update the window atom
			store.set(windowAtom, {
				...window,
				tabAtoms: newTabAtoms,
			});

			// Update indices for all tabs at or after the insertion point
			for (let i = newPosition; i < newTabAtoms.length; i++) {
				const tabAtomAtIndex = newTabAtoms[i];
				if (tabAtomAtIndex) {
					store.set(tabAtomAtIndex, (t) => ({
						...t,
						tab: { ...t.tab, index: i },
					}));
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
			// Firefox blocks opening about: URLs from extensions
			// Open MDN docs for sidebar settings instead
			browser.tabs.create({
				url: "https://support.mozilla.org/en-US/kb/customize-firefox-sidebars",
			});
		} else {
			browser.tabs.create({ url: "chrome://settings/?search=side+panel" });
		}
	}, []);

	return (
		<div className="p-4 max-w-full min-h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white/90">
			<div className="flex items-center justify-between mb-4">
				<h1 className="text-2xl font-semibold m-0">Tab Canopy</h1>
				<button
					type="button"
					className="flex items-center justify-center p-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-md text-black/60 dark:text-white/70 cursor-pointer transition-all hover:bg-black/10 dark:hover:bg-white/10 hover:text-black/90 dark:hover:text-white/90 hover:border-black/20 dark:hover:border-white/20 active:scale-95"
					onClick={handleOpenSettings}
					title="Change side panel position"
				>
					<Settings size={18} />
				</button>
			</div>
			<div className="flex flex-col gap-6">
				{windowList.map((windowAtom) => (
					<WindowGroup
						key={`${windowAtom}`}
						windowAtom={windowAtom}
						isCurrentWindow={
							currentWindowId !== undefined &&
							store.get(windowAtom).windowId === currentWindowId
						}
					/>
				))}
			</div>
		</div>
	);
}

export default App;
