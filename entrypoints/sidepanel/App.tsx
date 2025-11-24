import { atom, type PrimitiveAtom, useAtom, useStore } from "jotai";
import { Settings } from "lucide-react";
import { useCallback, useEffect } from "react";
import { WindowGroup } from "./components/WindowGroup";
import type { TabAtomValue } from "./store/TabAtomValue";
import type { WindowData } from "./store/WindowData";
import { windowListAtom } from "./store/windowListAtom";

const tabAtomMap = new Map<number, PrimitiveAtom<TabAtomValue>>();
const windowAtomMap = new Map<number, PrimitiveAtom<WindowData>>();

function App() {
	const [windowList, setWindowList] = useAtom(windowListAtom);

	const store = useStore();

	useEffect(() => {
		const getTabs = async () => {
			const allTabs = await browser.tabs.query({});

			const windowTabsMap = new Map<number, Browser.tabs.Tab[]>();
			const windowActiveTabMap = new Map<number, number>();

			// First pass: group tabs by window
			for (const tab of allTabs) {
				const tabId = tab.id;
				if (!tabId || tab.windowId === undefined) {
					continue;
				}

				let windowTabs = windowTabsMap.get(tab.windowId);
				if (!windowTabs) {
					windowTabs = [];
					windowTabsMap.set(tab.windowId, windowTabs);
				}
				windowTabs.push(tab);

				// Track active tabs per window
				if (tab.active) {
					windowActiveTabMap.set(tab.windowId, tabId);
				}
			}

			// Second pass: create window atoms and tab atoms together
			const windowAtomList: PrimitiveAtom<WindowData>[] = [];
			for (const [windowId, tabs] of windowTabsMap) {
				// Create a placeholder window atom first
				const windowAtom = atom<WindowData>({
					windowId,
					tabAtoms: [],
					activeTabId: windowActiveTabMap.get(windowId),
				});
				windowAtomMap.set(windowId, windowAtom);

				// Create tab atoms with windowAtom reference
				const tabAtoms: PrimitiveAtom<TabAtomValue>[] = [];
				for (const tab of tabs) {
					const tabId = tab.id;
					if (!tabId) continue;

					const tabAtom = atom<TabAtomValue>({ tab, windowAtom });
					tabAtomMap.set(tabId, tabAtom);
					tabAtoms.push(tabAtom);
				}

				// Update window atom with the tab atoms
				store.set(windowAtom, {
					windowId,
					tabAtoms,
					activeTabId: windowActiveTabMap.get(windowId),
				});

				windowAtomList.push(windowAtom);
			}

			console.log("Window atom list:", windowAtomList);
			setWindowList(windowAtomList);
		};

		const handleTabUpdated = (
			tabId: number,
			_changeInfo: globalThis.Browser.tabs.OnUpdatedInfo,
			tab: globalThis.Browser.tabs.Tab,
		) => {
			const tabAtom = tabAtomMap.get(tabId);
			if (!tabAtom) {
				return;
			}
			const currentValue = store.get(tabAtom);
			store.set(tabAtom, { ...currentValue, tab });
		};

		const handleTabCreated = (tab: globalThis.Browser.tabs.Tab) => {
			const tabId = tab.id;
			if (!tabId) {
				return;
			}
			const windowAtom = windowAtomMap.get(tab.windowId);
			if (!windowAtom) {
				return;
			}
			const tabAtom = atom<TabAtomValue>({ tab, windowAtom });
			tabAtomMap.set(tabId, tabAtom);
			store.set(windowAtom, (v) => {
				return {
					...v,
					tabAtoms: [...v.tabAtoms, tabAtom],
				};
			});
		};

		const handleTabRemoved = (
			tabId: number,
			_removeInfo: globalThis.Browser.tabs.OnRemovedInfo,
		) => {
			console.log("tab with id", tabId, "removed");
			const tabAtom = tabAtomMap.get(tabId);
			if (!tabAtom) {
				return;
			}
			const tab = store.get(tabAtom).tab;
			if (!tab) {
				return;
			}
			const windowId = tab.windowId;

			if (windowId) {
				const windowAtom = windowAtomMap.get(windowId);
				if (!windowAtom) {
					return;
				}
				store.set(windowAtom, (v) => {
					return {
						...v,
						tabAtoms: v.tabAtoms.filter((t) => store.get(t).tab.id !== tabId),
					};
				});
			}
		};

		const handleTabMoved = (
			tabId: number,
			moveInfo: globalThis.Browser.tabs.OnMovedInfo,
		) => {
			const { fromIndex, toIndex } = moveInfo;

			const tabAtom = tabAtomMap.get(tabId);
			if (!tabAtom) {
				return;
			}
			const tab = store.get(tabAtom).tab;

			console.log(
				"tab with id",
				tabId,
				"moved from index",
				fromIndex,
				"to index",
				toIndex,
			);

			const windowAtom = windowAtomMap.get(moveInfo.windowId);
			if (!windowAtom) {
				return;
			}

			const window = store.get(windowAtom);
			const tabAtomAtToIndex = window.tabAtoms[toIndex];
			if (!tabAtomAtToIndex) {
				return;
			}

			const tabAtTo = store.get(tabAtomAtToIndex);
			if (tabAtTo) {
				store.set(tabAtomAtToIndex, {
					...tabAtTo,
					tab: { ...tabAtTo.tab, index: fromIndex },
				});
			}

			// swap the tab atoms in the window data array
			const tabAtomAtFromIndex = window.tabAtoms[fromIndex];
			if (tabAtomAtFromIndex) {
				store.set(windowAtom, (v) => ({
					...v,
					tabAtoms: v.tabAtoms.map((t, index) =>
						index === fromIndex
							? tabAtomAtToIndex
							: index === toIndex
								? tabAtomAtFromIndex
								: t,
					),
				}));
			}

			const currentTabValue = store.get(tabAtom);
			store.set(tabAtom, {
				...currentTabValue,
				tab: { ...tab, windowId: moveInfo.windowId, index: toIndex },
			});
		};

		const handleTabActivated = (
			activeInfo: globalThis.Browser.tabs.OnActivatedInfo,
		) => {
			const { tabId, windowId } = activeInfo;
			if (!tabId) {
				return;
			}

			const windowAtom = windowAtomMap.get(windowId);
			if (!windowAtom) {
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

		const onWindowClosed = (windowId: number) => {
			const windowAtom = windowAtomMap.get(windowId);
			if (!windowAtom) {
				return;
			}

			windowAtomMap.delete(windowId);
			setWindowList((prev) => prev.filter((w) => w !== windowAtom));
		};

		browser.tabs.onUpdated.addListener(handleTabUpdated);
		browser.tabs.onCreated.addListener(handleTabCreated);
		browser.tabs.onRemoved.addListener(handleTabRemoved);
		browser.tabs.onMoved.addListener(handleTabMoved);
		browser.tabs.onActivated.addListener(handleTabActivated);

		browser.windows.onRemoved.addListener(onWindowClosed);

		getTabs();

		return () => {
			browser.tabs.onUpdated.removeListener(handleTabUpdated);
			browser.tabs.onCreated.removeListener(handleTabCreated);
			browser.tabs.onRemoved.removeListener(handleTabRemoved);
			browser.tabs.onMoved.removeListener(handleTabMoved);
			browser.tabs.onActivated.removeListener(handleTabActivated);

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
					<WindowGroup key={`${windowAtom}`} windowAtom={windowAtom} />
				))}
			</div>
		</div>
	);
}

export default App;
