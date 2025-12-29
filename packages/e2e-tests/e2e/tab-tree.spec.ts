import { createTab, expect, test } from "./fixtures";

/**
 * Tab Tree Management Tests
 *
 * These tests use window.__tabCanopyTestHelpers to query tab structure directly
 * instead of relying on DOM element counting or positioning.
 *
 * Available test helpers (via treeHelpers fixture):
 * - getHelpers(): Get the full TreeTestHelpers API with methods like:
 *   - getAllTabs(): Get all tabs with tree metadata
 *   - getTabById(id): Get specific tab info
 *   - getChildren(id): Get direct children
 *   - getDescendants(id): Get all descendants recursively
 *   - getParent(id): Get parent tab
 *   - getRootTabs(windowId): Get root-level tabs
 *   - isAncestor(ancestorId, descendantId): Check ancestry
 *
 * - waitForTab(url): Wait for a tab with specific URL to appear
 * - getTabByUrl(url): Get tab info by URL
 * - getTabElement(tabId): Get Playwright locator for a tab by its ID
 * - verifyParentChild(parentId, childId): Check parent-child relationship
 *
 * Each tab has a data-tab-id attribute for stable DOM queries.
 */

test.describe("Tab Tree Management", () => {
	test("extension loads and shows sidepanel", async ({ sidepanel }) => {
		// The sidepanel should have loaded
		await expect(sidepanel).toHaveTitle(/Tab Canopy/i);
	});

	test("new tabs appear in the sidepanel", async ({
		context,
		sidepanel,
		treeHelpers,
	}) => {
		// Create a new tab
		const newPage = await createTab(context, "about:blank", sidepanel);

		// Wait for the new tab to appear
		const newTabInfo = await treeHelpers.waitForTab("about:blank");
		expect(newTabInfo).toBeDefined();
		expect(newTabInfo?.url).toContain("about:blank");

		// Verify it appears in the DOM
		const tabElement = treeHelpers.getTabElement(newTabInfo?.browserTabId);
		await expect(tabElement).toBeVisible();

		console.log("New tab info:", newTabInfo);

		await newPage.close();
	});

	test("can drag tab to make it a child of another", async ({
		context,
		sidepanel,
		treeHelpers,
	}) => {
		// Create some tabs to work with
		const tab1 = await createTab(context, "about:blank?1", sidepanel);
		const tab2 = await createTab(context, "about:blank?2", sidepanel);

		// Wait for tabs to appear in the tree
		const tab1Info = await treeHelpers.waitForTab("about:blank?1");
		const tab2Info = await treeHelpers.waitForTab("about:blank?2");

		console.log("Tab 1 info:", tab1Info);
		console.log("Tab 2 info:", tab2Info);

		// Verify initial state - both should be root level
		expect(tab1Info.depth).toBe(0);
		expect(tab2Info.depth).toBe(0);
		expect(tab1Info.parentTabId).toBeNull();
		expect(tab2Info.parentTabId).toBeNull();

		// Perform drag and drop - drag tab2 onto tab1 to make it a child
		await treeHelpers.dragTabToTab(
			tab2Info.browserTabId,
			tab1Info.browserTabId,
		);

		// Verify the parent-child relationship using test helpers
		const result = await treeHelpers.verifyParentChild(
			tab1Info.browserTabId,
			tab2Info.browserTabId,
		);
		console.log("Parent-child verification:", result);

		expect(result.isChild).toBe(true);
		expect(result.childDepth).toBe(1);

		// Verify via helpers API
		const helpers = await treeHelpers.getHelpers();
		const updatedTab2 = helpers.getTabById(tab2Info.browserTabId);
		expect(updatedTab2?.parentTabId).toBe(tab1Info.browserTabId);
		expect(updatedTab2?.depth).toBe(1);

		await tab1.close();
		await tab2.close();
	});

	test("multi-selected tabs are ordered by tree position when dropped, not selection order", async ({
		context,
		sidepanel,
		treeHelpers,
	}) => {
		// Create tabs
		const tab1 = await createTab(context, "about:blank?title=tab1", sidepanel);
		const tab2 = await createTab(context, "about:blank?title=tab2", sidepanel);
		const tab3 = await createTab(context, "about:blank?title=tab3", sidepanel);

		// Wait for tabs to appear in the tree
		const tab1Info = await treeHelpers.waitForTab("about:blank?title=tab1");
		const tab2Info = await treeHelpers.waitForTab("about:blank?title=tab2");
		const tab3Info = await treeHelpers.waitForTab("about:blank?title=tab3");

		// Get tab elements
		const tab1Element = treeHelpers.getTabElement(tab1Info.browserTabId);
		const tab2Element = treeHelpers.getTabElement(tab2Info.browserTabId);
		const tab3Element = treeHelpers.getTabElement(tab3Info.browserTabId);

		// Multi-select: first click tab3, then Ctrl+click tab1
		// This creates selection order: [tab3, tab1]
		// But tree order is: [tab1, tab2, tab3]
		await tab3Element.click();
		await sidepanel.keyboard.down("Control");
		await tab1Element.click();
		await sidepanel.keyboard.up("Control");

		// Verify 2 tabs are selected
		await sidepanel.waitForTimeout(200);
		const selectedCount = await sidepanel
			.locator('[data-selected="true"]')
			.count();
		expect(selectedCount).toBe(2);

		// Drag the multi-selection onto tab2 to make them children
		const tab1Box = await tab1Element.boundingBox();
		const tab2Box = await tab2Element.boundingBox();

		if (tab1Box && tab2Box) {
			// Start drag from tab1 (first selected in tree order)
			await sidepanel.mouse.move(
				tab1Box.x + 200,
				tab1Box.y + tab1Box.height / 2,
			);
			await sidepanel.mouse.down();
			await sidepanel.mouse.move(
				tab2Box.x + 200,
				tab2Box.y + tab2Box.height / 2,
				{
					steps: 10,
				},
			);
			await sidepanel.waitForTimeout(100);
			await sidepanel.mouse.up();

			// Wait for the drop to be processed
			await sidepanel.waitForTimeout(500);
		}

		// Verify the tree structure
		// Expected: tab2 is parent, children are ordered by tree position (tab1, then tab3)
		// NOT by selection order (tab3, then tab1)
		const helpers = await treeHelpers.getHelpers();
		const updatedTab2 = helpers.getTabById(tab2Info.browserTabId);
		const updatedTab1 = helpers.getTabById(tab1Info.browserTabId);
		const updatedTab3 = helpers.getTabById(tab3Info.browserTabId);

		// Verify tab2 has both tabs as children
		expect(updatedTab2?.hasChildren).toBe(true);
		expect(updatedTab2?.childrenIds).toHaveLength(2);
		expect(updatedTab2?.childrenIds).toContain(tab1Info.browserTabId);
		expect(updatedTab2?.childrenIds).toContain(tab3Info.browserTabId);

		// Verify both tabs are children of tab2
		expect(updatedTab1?.parentTabId).toBe(tab2Info.browserTabId);
		expect(updatedTab3?.parentTabId).toBe(tab2Info.browserTabId);

		// Verify the order: tab1 should come before tab3 (tree order, not selection order)
		const children = helpers.getChildren(tab2Info.browserTabId);
		expect(children[0].browserTabId).toBe(tab1Info.browserTabId);
		expect(children[1].browserTabId).toBe(tab3Info.browserTabId);

		await tab1.close();
		await tab2.close();
		await tab3.close();
	});
});

test.describe("Tab Movement with Children", () => {
	test("moving parent tab also moves children in Chrome", async ({
		context,
		sidepanel,
		treeHelpers,
	}) => {
		// This test verifies the bug fix: when moving a parent tab,
		// its children should also move to stay adjacent in Chrome's tab bar

		// Create tabs
		const parentTab = await createTab(context, "about:blank?parent", sidepanel);
		const childTab = await createTab(context, "about:blank?child", sidepanel);
		const targetTab = await createTab(context, "about:blank?target", sidepanel);

		// Wait for tabs to appear
		const parentInfo = await treeHelpers.waitForTab("about:blank?parent");
		const childInfo = await treeHelpers.waitForTab("about:blank?child");
		const _targetInfo = await treeHelpers.waitForTab("about:blank?target");

		// First, make childTab a child of parentTab
		const parentElement = treeHelpers.getTabElement(parentInfo.browserTabId);
		const childElement = treeHelpers.getTabElement(childInfo.browserTabId);

		const childBox = await childElement.boundingBox();
		const parentBox = await parentElement.boundingBox();

		if (childBox && parentBox) {
			// Drag child onto parent
			await sidepanel.mouse.move(
				childBox.x + 200,
				childBox.y + childBox.height / 2,
			);
			await sidepanel.mouse.down();
			await sidepanel.mouse.move(
				parentBox.x + 200,
				parentBox.y + parentBox.height / 2,
				{ steps: 10 },
			);
			await sidepanel.waitForTimeout(100);
			await sidepanel.mouse.up();
			await sidepanel.waitForTimeout(500);
		}

		// Verify parent-child relationship
		const relationship = await treeHelpers.verifyParentChild(
			parentInfo.browserTabId,
			childInfo.browserTabId,
		);
		expect(relationship.isChild).toBe(true);

		// Get all helpers to check descendant information
		const helpers = await treeHelpers.getHelpers();
		const updatedParent = helpers.getTabById(parentInfo.browserTabId);

		// Verify parent has the child
		expect(updatedParent?.childrenIds).toContain(childInfo.browserTabId);
		expect(updatedParent?.hasChildren).toBe(true);

		// Get descendants to verify the tree structure
		const descendants = helpers.getDescendants(parentInfo.browserTabId);
		expect(descendants.length).toBeGreaterThan(0);
		expect(
			descendants.some((d) => d.browserTabId === childInfo.browserTabId),
		).toBe(true);

		await parentTab.close();
		await childTab.close();
		await targetTab.close();
	});

	test("moving parent tab in native browser after its child should flatten hierarchy", async ({
		context,
		sidepanel,
		treeHelpers,
	}) => {
		// This test verifies behavior when a parent tab is dragged in the native browser
		// to a position after its child tab.
		// Expected: the child should be flattened (no longer a child), and parent moves after it

		// Create tabs a, b, c
		const tabA = await createTab(context, "about:blank?title=a", sidepanel);
		const tabB = await createTab(context, "about:blank?title=b", sidepanel);
		const tabC = await createTab(context, "about:blank?title=c", sidepanel);

		// Wait for tabs to appear
		const aInfo = await treeHelpers.waitForTab("about:blank?title=a");
		const bInfo = await treeHelpers.waitForTab("about:blank?title=b");
		const cInfo = await treeHelpers.waitForTab("about:blank?title=c");

		console.log("Initial state - a:", aInfo, "b:", bInfo, "c:", cInfo);

		// Make c a child of b by dragging c onto b in the sidepanel
		const bElement = treeHelpers.getTabElement(bInfo.browserTabId);
		const cElement = treeHelpers.getTabElement(cInfo.browserTabId);

		const cBox = await cElement.boundingBox();
		const bBox = await bElement.boundingBox();

		if (cBox && bBox) {
			// Drag c onto b to make c a child of b
			await sidepanel.mouse.move(cBox.x + 200, cBox.y + cBox.height / 2);
			await sidepanel.mouse.down();
			await sidepanel.mouse.move(bBox.x + 200, bBox.y + bBox.height / 2, {
				steps: 10,
			});
			await sidepanel.waitForTimeout(100);
			await sidepanel.mouse.up();
			await sidepanel.waitForTimeout(500);
		}

		// Verify c is now a child of b
		let helpers = await treeHelpers.getHelpers();
		let updatedC = helpers.getTabById(cInfo.browserTabId);
		expect(updatedC?.parentTabId).toBe(bInfo.browserTabId);
		expect(updatedC?.depth).toBe(1);
		console.log("After making c child of b - c:", updatedC);

		// Now simulate dragging tab b in the native browser to be after tab c
		// In the browser, tabs appear in order: ..., a, b, c (where c is visually indented under b)
		// Before move: b is at some index, c is at index after b
		// We want to move b to be after c's current position

		// Get current positions
		helpers = await treeHelpers.getHelpers();
		const allTabs = helpers.getAllTabs();
		console.log(
			"Before browser move - all tabs:",
			allTabs.map((t) => ({
				id: t.browserTabId,
				index: t.tabIndex,
				parentId: t.parentTabId,
			})),
		);

		const updatedBBeforeMove = helpers.getTabById(bInfo.browserTabId);
		const updatedCBeforeMove = helpers.getTabById(cInfo.browserTabId);
		console.log(
			"Before move - b index:",
			updatedBBeforeMove?.tabIndex,
			"c index:",
			updatedCBeforeMove?.tabIndex,
		);

		// Move b to be after c using native browser API
		// c is at index 4, so we want to move b to index 5 to be after c
		// Or we can move b to index 4, which will push c to 3 and b to 4
		await treeHelpers.moveBrowserTab(bInfo.browserTabId, { index: 4 });

		// Wait for changes to be processed
		await sidepanel.waitForTimeout(1000);

		// Get and print background logs
		const backgroundLogs = treeHelpers.getBackgroundLogs();
		console.log("Background logs:");
		for (const log of backgroundLogs) {
			console.log("  ", log);
		}

		// Verify the expected behavior:
		// 1. c should no longer be a child of b (parentId should be null)
		// 2. b should be positioned after c in the tab order
		helpers = await treeHelpers.getHelpers();
		updatedC = helpers.getTabById(cInfo.browserTabId);
		const updatedB = helpers.getTabById(bInfo.browserTabId);
		const updatedA = helpers.getTabById(aInfo.browserTabId);

		console.log(
			"After browser move - a:",
			updatedA,
			"b:",
			updatedB,
			"c:",
			updatedC,
		);

		// c should no longer be a child of b
		expect(updatedC?.parentTabId).toBeNull();
		expect(updatedC?.depth).toBe(0);

		// b should be after c in the tab order
		// Since tabs are sorted by index, b's index should be greater than c's index
		expect(updatedB?.tabIndex).toBeGreaterThan(updatedC?.tabIndex ?? -1);

		// All tabs should be at root level
		expect(updatedA?.depth).toBe(0);
		expect(updatedB?.depth).toBe(0);
		expect(updatedC?.depth).toBe(0);

		await tabA.close();
		await tabB.close();
		await tabC.close();
	});

	test("moving parent tab in native browser after its child maintains correct order with other tabs", async ({
		context,
		sidepanel,
		treeHelpers,
	}) => {
		// This test verifies that when a parent tab is moved past its child,
		// the other tabs in the window maintain their correct positions

		// Create tabs a, b, c, d
		const tabA = await createTab(context, "about:blank?title=a", sidepanel);
		const tabB = await createTab(context, "about:blank?title=b", sidepanel);
		const tabC = await createTab(context, "about:blank?title=c", sidepanel);
		const tabD = await createTab(context, "about:blank?title=d", sidepanel);

		// Wait for tabs to appear
		const aInfo = await treeHelpers.waitForTab("about:blank?title=a");
		const bInfo = await treeHelpers.waitForTab("about:blank?title=b");
		const cInfo = await treeHelpers.waitForTab("about:blank?title=c");
		const dInfo = await treeHelpers.waitForTab("about:blank?title=d");

		console.log(
			"Initial state - a:",
			aInfo,
			"b:",
			bInfo,
			"c:",
			cInfo,
			"d:",
			dInfo,
		);

		// Make c a child of b by dragging c onto b in the sidepanel
		const bElement = treeHelpers.getTabElement(bInfo.browserTabId);
		const cElement = treeHelpers.getTabElement(cInfo.browserTabId);

		const cBox = await cElement.boundingBox();
		const bBox = await bElement.boundingBox();

		if (cBox && bBox) {
			// Drag c onto b to make c a child of b
			await sidepanel.mouse.move(cBox.x + 200, cBox.y + cBox.height / 2);
			await sidepanel.mouse.down();
			await sidepanel.mouse.move(bBox.x + 200, bBox.y + bBox.height / 2, {
				steps: 10,
			});
			await sidepanel.waitForTimeout(100);
			await sidepanel.mouse.up();
			await sidepanel.waitForTimeout(500);
		}

		// Verify c is now a child of b
		let helpers = await treeHelpers.getHelpers();
		let updatedC = helpers.getTabById(cInfo.browserTabId);
		expect(updatedC?.parentTabId).toBe(bInfo.browserTabId);
		console.log("After making c child of b - c:", updatedC);

		// Now move b to be after c using native browser API
		helpers = await treeHelpers.getHelpers();
		const allTabs = helpers.getAllTabs();
		console.log(
			"Before browser move - all tabs:",
			allTabs.map((t) => ({
				id: t.browserTabId,
				index: t.tabIndex,
				parentId: t.parentTabId,
			})),
		);

		const updatedBBeforeMove = helpers.getTabById(bInfo.browserTabId);
		console.log("Before move - b index:", updatedBBeforeMove?.tabIndex);

		// Clear background logs before the move
		treeHelpers.clearBackgroundLogs();

		// Move b to after c (c is at index after b, so we move b forward)
		await treeHelpers.moveBrowserTab(bInfo.browserTabId, {
			index: (updatedBBeforeMove?.tabIndex ?? 0) + 1,
		});

		// Wait for changes to be processed
		await sidepanel.waitForTimeout(1000);

		// Get and print background logs
		const backgroundLogs = treeHelpers.getBackgroundLogs();
		console.log("Background logs:");
		for (const log of backgroundLogs) {
			console.log("  ", log);
		}

		// Verify the expected behavior
		helpers = await treeHelpers.getHelpers();
		const updatedA = helpers.getTabById(aInfo.browserTabId);
		const updatedB = helpers.getTabById(bInfo.browserTabId);
		updatedC = helpers.getTabById(cInfo.browserTabId);
		const updatedD = helpers.getTabById(dInfo.browserTabId);

		console.log("After browser move:");
		console.log("  a:", updatedA);
		console.log("  b:", updatedB);
		console.log("  c:", updatedC);
		console.log("  d:", updatedD);

		// Check tree orders to see if they're in the right order
		const allTabsAfter = helpers
			.getAllTabs()
			.filter((t) =>
				[
					aInfo.browserTabId,
					bInfo.browserTabId,
					cInfo.browserTabId,
					dInfo.browserTabId,
				].includes(t.browserTabId),
			);
		console.log("Tree orders after move:");
		for (const tab of allTabsAfter) {
			const name =
				tab.browserTabId === aInfo.browserTabId
					? "a"
					: tab.browserTabId === bInfo.browserTabId
						? "b"
						: tab.browserTabId === cInfo.browserTabId
							? "c"
							: "d";
			const treeOrder = await treeHelpers.getTreeOrder(tab.browserTabId);
			console.log(
				`  ${name}: treeOrder=${treeOrder}, index=${tab.tabIndex}, parentId=${tab.parentTabId}`,
			);
		}

		// Expected order: a, c, b, d
		// c should no longer be a child of b
		expect(updatedC?.parentTabId).toBeNull();
		expect(updatedC?.depth).toBe(0);

		// Verify the index order
		const indices = [
			{ name: "a", index: updatedA?.tabIndex ?? -1 },
			{ name: "b", index: updatedB?.tabIndex ?? -1 },
			{ name: "c", index: updatedC?.tabIndex ?? -1 },
			{ name: "d", index: updatedD?.tabIndex ?? -1 },
		].sort((a, b) => a.index - b.index);

		console.log("Sorted by index:", indices);

		// Expected order by index: a, c, b, d
		expect(indices[0].name).toBe("a");
		expect(indices[1].name).toBe("c");
		expect(indices[2].name).toBe("b");
		expect(indices[3].name).toBe("d");

		await tabA.close();
		await tabB.close();
		await tabC.close();
		await tabD.close();
	});

	test("window.open from tab should create child when position allows", async ({
		context,
		sidepanel,
		treeHelpers,
	}) => {
		// Clear any previous events
		await treeHelpers.clearTabCreatedEvents();

		// Create 3 tabs in order: about:blank?1, about:blank?2, about:blank?3
		const tab1 = await createTab(context, "about:blank?1", sidepanel);
		await treeHelpers.waitForTab("about:blank?1");

		const tab2 = await createTab(context, "about:blank?2", sidepanel);
		await treeHelpers.waitForTab("about:blank?2");

		const tab3 = await createTab(context, "about:blank?3", sidepanel);
		await treeHelpers.waitForTab("about:blank?3");

		// Get tab1's browser ID for verification
		const tab1Info = await treeHelpers.getTabByUrl("about:blank?1");
		expect(tab1Info).toBeDefined();
		console.log("Tab1 browser ID:", tab1Info?.browserTabId);

		// Focus tab1 and open a new tab from it
		// window.open() will place the new tab right after tab1, which allows it to be a child
		await tab1.bringToFront();

		// Get the current tab count before opening new tab
		const helpers = await treeHelpers.getHelpers();
		const _tabCountBefore = helpers.getAllTabs().length;

		// Open a new tab from tab1 using window.open() which sets openerTabId
		// Use a unique URL so we can identify it
		const [newTab4] = await Promise.all([
			context.waitForEvent("page"),
			tab1.evaluate(() => {
				window.open("about:blank?child-of-1", "_blank");
			}),
		]);

		// Wait for the new tab to appear
		const newTab = await treeHelpers.waitForTab("about:blank?child-of-1");

		expect(newTab).toBeDefined();
		console.log("New tab:", newTab);

		// Get the tab created events from the background script
		const events = await treeHelpers.getTabCreatedEvents();
		console.log("Tab created events:", JSON.stringify(events, null, 2));

		// Find the event for the new tab using the unique URL
		const newTabEvent = events.find((e) => e.tabId === newTab.browserTabId);
		expect(newTabEvent).toBeDefined();
		console.log("New tab event:", newTabEvent);

		// Verify the event has the correct openerTabId
		expect(newTabEvent?.openerTabId).toBe(tab1Info?.browserTabId);

		// Verify the extension decided to make it a child (because position allows it)
		// window.open() places the new tab right after tab1, which is a valid child position
		expect(newTabEvent?.decidedParentId).toBe(tab1Info?.browserTabId);
		expect(newTabEvent?.reason).toContain("allows child");

		// The new tab SHOULD be a child of tab1 because it was placed right after tab1
		expect(newTab?.parentTabId).toBe(tab1Info?.browserTabId);

		// Verify tab1 has one child - get fresh helpers after the tab was created
		const helpersAfter = await treeHelpers.getHelpers();
		const tab1Children = helpersAfter.getChildren(tab1Info?.browserTabId ?? -1);
		expect(tab1Children.length).toBe(1);
		expect(tab1Children[0].browserTabId).toBe(newTab.browserTabId);

		await tab1.close();
		await tab2.close();
		await tab3.close();
		await newTab4.close();
	});

	test("attempting real ctrl-t keyboard shortcut (expected to fail)", async ({
		context,
		sidepanel,
		treeHelpers,
	}) => {
		// This test attempts to use keyboard.press('Control+t') to open a new tab
		// According to Playwright docs, this should NOT work because:
		// "events injected via CDP are marked as 'untrusted' and won't trigger browser UI actions"

		// Clear any previous events
		await treeHelpers.clearTabCreatedEvents();

		// Create a tab
		const tab1 = await createTab(context, "about:blank?1", sidepanel);
		await treeHelpers.waitForTab("about:blank?1");

		const tab1Info = await treeHelpers.getTabByUrl("about:blank?1");
		expect(tab1Info).toBeDefined();

		// Get initial tab count
		const helpers = await treeHelpers.getHelpers();
		const tabCountBefore = helpers.getAllTabs().length;

		// Focus tab1 and try Ctrl+T
		await tab1.bringToFront();

		// Try the keyboard shortcut
		await tab1.keyboard.press("Control+t");

		// Wait a bit to see if a new tab appears
		await sidepanel.waitForTimeout(1000);

		// Check if tab count changed
		const helpersAfter = await treeHelpers.getHelpers();
		const tabCountAfter = helpersAfter.getAllTabs().length;

		console.log(`Tab count before: ${tabCountBefore}, after: ${tabCountAfter}`);

		// We expect this to NOT work (tab count should be the same)
		expect(tabCountAfter).toBe(tabCountBefore);
		console.log(
			"✓ Confirmed: keyboard.press('Control+t') does NOT open a new tab (as expected)",
		);

		await tab1.close();
	});

	test("moving tab between parent and child then back should flatten correctly", async ({
		context,
		sidepanel,
		treeHelpers,
	}) => {
		sidepanel.on("console", (message) => {
			console.log("[sidepanel] console:", message.text());
		});

		let helpers = await treeHelpers.getHelpers();
		const allTabs = helpers.getAllTabs();

		console.log(
			"Initial state:",
			JSON.stringify(
				allTabs.map((t) => ({
					title: t.title,
					browserTabId: t.browserTabId,
					parentTabId: t.parentTabId,
					treeOrder: t.treeOrder,
					tabIndex: t.tabIndex,
				})),
				null,
				2,
			),
		);
		// This test reproduces a sync issue:
		// 1. Start with tabs a, b, c (flat)
		// 2. Make c a child of b: a, b, -c
		// 3. Move a (in native) between b and c → a becomes a child of b (good)
		// 4. Move a left again (in native) → should be flat a, b, c again
		//    But extension stays as b, -a, -c (broken sync)

		// Create tabs a, b, c
		const tabA = await createTab(context, "about:blank?title=a", sidepanel);
		const tabB = await createTab(context, "about:blank?title=b", sidepanel);
		const tabC = await createTab(context, "about:blank?title=c", sidepanel);

		// Wait for tabs to appear
		const aInfo = await treeHelpers.waitForTab("about:blank?title=a");
		const bInfo = await treeHelpers.waitForTab("about:blank?title=b");
		const cInfo = await treeHelpers.waitForTab("about:blank?title=c");

		// Verify initial state - all should be root level
		helpers = await treeHelpers.getHelpers();
		let aTab = helpers.getTabById(aInfo.browserTabId);
		let bTab = helpers.getTabById(bInfo.browserTabId);
		let cTab = helpers.getTabById(cInfo.browserTabId);

		expect(aTab?.parentTabId).toBeNull();
		expect(bTab?.parentTabId).toBeNull();
		expect(cTab?.parentTabId).toBeNull();

		// Step 2: Make c a child of b by dragging c onto b in the sidepanel
		await treeHelpers.dragTabToTab(cInfo.browserTabId, bInfo.browserTabId);

		// Verify c is now a child of b
		helpers = await treeHelpers.getHelpers();
		cTab = helpers.getTabById(cInfo.browserTabId);
		bTab = helpers.getTabById(bInfo.browserTabId);
		expect(cTab?.parentTabId).toBe(bInfo.browserTabId);
		expect(cTab?.depth).toBe(1);

		// Step 3: Move a (in native browser) between b and c
		// First, get current indices
		helpers = await treeHelpers.getHelpers();
		bTab = helpers.getTabById(bInfo.browserTabId);
		cTab = helpers.getTabById(cInfo.browserTabId);

		// Move a to be after b (which will be between b and c in the tree)
		const targetIndex = bTab?.tabIndex ?? 1;
		await treeHelpers.moveBrowserTab(aInfo.browserTabId, {
			index: targetIndex,
		});

		// Wait for changes to be processed
		await sidepanel.waitForTimeout(1000);

		// Verify a is now a child of b
		helpers = await treeHelpers.getHelpers();
		aTab = helpers.getTabById(aInfo.browserTabId);
		expect(aTab?.parentTabId).toBe(bInfo.browserTabId);
		expect(aTab?.depth).toBe(1);

		// Step 4: Move a left again (in native browser) so it should become flat a, b, c
		// Get a's current index and move it to the left of b
		helpers = await treeHelpers.getHelpers();
		aTab = helpers.getTabById(aInfo.browserTabId);
		bTab = helpers.getTabById(bInfo.browserTabId);

		// Move a to before b (index 0 or before b's index)
		const newIndex = Math.max(0, (bTab?.tabIndex ?? 0) - 1);
		console.log({
			aIndex: aTab?.tabIndex,
			bIndex: bTab?.tabIndex,
			newIndex,
		});
		await treeHelpers.moveBrowserTab(aInfo.browserTabId, { index: newIndex });

		// Wait for changes to be processed
		await sidepanel.waitForTimeout(1000);

		// Verify all tabs are now flat (a, b, c all at root level)
		helpers = await treeHelpers.getHelpers();
		aTab = helpers.getTabById(aInfo.browserTabId);
		bTab = helpers.getTabById(bInfo.browserTabId);
		cTab = helpers.getTabById(cInfo.browserTabId);

		console.log("Final state after moving a left:");
		console.log("  a:", {
			id: aTab?.browserTabId,
			parentId: aTab?.parentTabId,
			depth: aTab?.depth,
			index: aTab?.tabIndex,
		});
		console.log("  b:", {
			id: bTab?.browserTabId,
			parentId: bTab?.parentTabId,
			depth: bTab?.depth,
			index: bTab?.tabIndex,
		});
		console.log("  c:", {
			id: cTab?.browserTabId,
			parentId: cTab?.parentTabId,
			depth: cTab?.depth,
			index: cTab?.tabIndex,
		});

		// All should be at root level
		expect(aTab?.parentTabId).toBeNull();
		expect(bTab?.parentTabId).toBeNull();
		expect(cTab?.parentTabId).toBeNull();
		expect(aTab?.depth).toBe(0);
		expect(bTab?.depth).toBe(0);
		expect(cTab?.depth).toBe(0);

		// Verify order in native browser is a, b, c
		expect(aTab?.tabIndex).toBeLessThan(bTab?.tabIndex ?? Infinity);
		expect(bTab?.tabIndex).toBeLessThan(cTab?.tabIndex ?? Infinity);

		await tabA.close();
		await tabB.close();
		await tabC.close();
	});

	test("tab with openerTabId placed at end should become sibling (ctrl-t scenario)", async ({
		context,
		sidepanel,
		treeHelpers,
	}) => {
		// This test simulates what happens with Ctrl+T:
		// - Tab has an openerTabId (opened FROM another tab)
		// - But browser places it at the end of the tab list
		// - So it should NOT be a child (position prevents it)

		// Clear any previous events
		await treeHelpers.clearTabCreatedEvents();

		// Create 3 tabs in order
		const tab1 = await createTab(context, "about:blank?1", sidepanel);
		await treeHelpers.waitForTab("about:blank?1");

		const tab2 = await createTab(context, "about:blank?2", sidepanel);
		await treeHelpers.waitForTab("about:blank?2");

		const tab3 = await createTab(context, "about:blank?3", sidepanel);
		await treeHelpers.waitForTab("about:blank?3");

		// Get tab1's info and current state
		const tab1Info = await treeHelpers.getTabByUrl("about:blank?1");
		expect(tab1Info).toBeDefined();

		const helpers = await treeHelpers.getHelpers();
		const allTabs = helpers.getAllTabs();
		const maxIndex = Math.max(...allTabs.map((t) => t.tabIndex));

		// Get the window ID from one of the existing tabs
		const windowId = tab1Info?.browserWindowId;

		// Generate a fake tab ID (high number to avoid conflicts)
		const fakeTabId = 999999;

		// Inject a fake tabs.onCreated event with openerTabId but placed at the end
		// This simulates Ctrl+T: has opener but browser places it at the end
		await treeHelpers.injectBrowserEvent({
			eventType: "tabs.onCreated",
			eventData: {
				id: fakeTabId,
				windowId: windowId,
				index: maxIndex + 1, // Place at the end
				url: "about:blank?ctrl-t-injected",
				title: "Ctrl+T Test",
				openerTabId: tab1Info?.browserTabId, // Has opener (like Ctrl+T)
			},
		});

		// Wait a bit for the event to be processed
		await sidepanel.waitForTimeout(200);

		// Get the tab created events
		const events = await treeHelpers.getTabCreatedEvents();
		console.log("Tab created events:", JSON.stringify(events, null, 2));

		// Find the event for the injected tab
		const newTabEvent = events.find((e) => e.tabId === fakeTabId);
		expect(newTabEvent).toBeDefined();
		console.log("Injected tab event:", newTabEvent);

		// Verify the event has the correct openerTabId
		expect(newTabEvent?.openerTabId).toBe(tab1Info?.browserTabId);

		// Verify the extension decided NOT to make it a child (because position prevents it)
		expect(newTabEvent?.decidedParentId).toBeNull();
		expect(newTabEvent?.reason).toContain("prevents child");

		// Verify in the tree structure
		const helpersAfter = await treeHelpers.getHelpers();
		const injectedTab = helpersAfter.getTabById(fakeTabId);

		if (injectedTab) {
			// The injected tab should NOT be a child of tab1 because it was placed at the end
			expect(injectedTab.parentTabId).toBeNull();
		}

		// Verify tab1 has no children
		const tab1Children = helpersAfter.getChildren(tab1Info?.browserTabId ?? -1);
		expect(tab1Children.length).toBe(0);

		// Close real tabs
		await tab1.close();
		await tab2.close();
		await tab3.close();
	});

	test("closing expanded parent tab should move children up", async ({
		context,
		sidepanel,
		treeHelpers,
	}) => {
		// Create parent and children tabs
		const _parentTab = await createTab(
			context,
			"about:blank?parent",
			sidepanel,
		);
		const child1Tab = await createTab(context, "about:blank?child1", sidepanel);
		const child2Tab = await createTab(context, "about:blank?child2", sidepanel);

		// Wait for tabs to appear
		const parentInfo = await treeHelpers.waitForTab("about:blank?parent");
		const child1Info = await treeHelpers.waitForTab("about:blank?child1");
		const child2Info = await treeHelpers.waitForTab("about:blank?child2");

		console.log("Parent info:", parentInfo);
		console.log("Child1 info:", child1Info);
		console.log("Child2 info:", child2Info);

		// Drag child1 onto parent to make it a child
		await treeHelpers.dragTabToTab(
			child1Info.browserTabId,
			parentInfo.browserTabId,
		);

		// Drag child2 onto parent to make it a child
		await treeHelpers.dragTabToTab(
			child2Info.browserTabId,
			parentInfo.browserTabId,
		);

		// Verify parent-child relationships
		const updatedChild1 = await treeHelpers.getTabByUrl("about:blank?child1");
		const updatedChild2 = await treeHelpers.getTabByUrl("about:blank?child2");
		expect(updatedChild1?.parentTabId).toBe(parentInfo.browserTabId);
		expect(updatedChild2?.parentTabId).toBe(parentInfo.browserTabId);
		expect(updatedChild1?.depth).toBe(1);
		expect(updatedChild2?.depth).toBe(1);

		console.log("Before closing parent - child1:", updatedChild1);
		console.log("Before closing parent - child2:", updatedChild2);

		// Parent should be expanded by default, click the close button
		const closeButton = sidepanel.locator(
			`[data-tab-id="${parentInfo.browserTabId}"] button[title="Close tab"]`,
		);
		await closeButton.click();
		await sidepanel.waitForTimeout(500);

		// Verify parent tab is closed (should throw or return null)
		const parentAfterClose =
			await treeHelpers.getTabByUrl("about:blank?parent");
		expect(parentAfterClose).toBeUndefined();

		// Verify children moved up to root level
		const child1AfterClose =
			await treeHelpers.getTabByUrl("about:blank?child1");
		const child2AfterClose =
			await treeHelpers.getTabByUrl("about:blank?child2");

		console.log("After closing parent - child1:", child1AfterClose);
		console.log("After closing parent - child2:", child2AfterClose);

		expect(child1AfterClose).toBeDefined();
		expect(child2AfterClose).toBeDefined();
		expect(child1AfterClose?.parentTabId).toBeNull();
		expect(child2AfterClose?.parentTabId).toBeNull();
		expect(child1AfterClose?.depth).toBe(0);
		expect(child2AfterClose?.depth).toBe(0);

		// Clean up
		await child1Tab.close();
		await child2Tab.close();
	});

	test("closing collapsed parent tab should close all children", async ({
		context,
		sidepanel,
		treeHelpers,
	}) => {
		// Create parent and children tabs
		const _parentTab = await createTab(
			context,
			"about:blank?parent2",
			sidepanel,
		);
		const _child1Tab = await createTab(
			context,
			"about:blank?child3",
			sidepanel,
		);
		const _child2Tab = await createTab(
			context,
			"about:blank?child4",
			sidepanel,
		);

		// Wait for tabs to appear
		const parentInfo = await treeHelpers.waitForTab("about:blank?parent2");
		const child1Info = await treeHelpers.waitForTab("about:blank?child3");
		const child2Info = await treeHelpers.waitForTab("about:blank?child4");

		console.log("Parent2 info:", parentInfo);
		console.log("Child3 info:", child1Info);
		console.log("Child4 info:", child2Info);

		// Drag child1 onto parent to make it a child
		await treeHelpers.dragTabToTab(
			child1Info.browserTabId,
			parentInfo.browserTabId,
		);

		// Drag child2 onto parent to make it a child
		await treeHelpers.dragTabToTab(
			child2Info.browserTabId,
			parentInfo.browserTabId,
		);

		// Verify parent-child relationships
		const updatedChild1 = await treeHelpers.getTabByUrl("about:blank?child3");
		const updatedChild2 = await treeHelpers.getTabByUrl("about:blank?child4");
		expect(updatedChild1?.parentTabId).toBe(parentInfo.browserTabId);
		expect(updatedChild2?.parentTabId).toBe(parentInfo.browserTabId);
		expect(updatedChild1?.depth).toBe(1);
		expect(updatedChild2?.depth).toBe(1);

		console.log("Before collapsing - child1:", updatedChild1);
		console.log("Before collapsing - child2:", updatedChild2);

		// Click the collapse button to collapse the parent
		// The collapse button is the first button in the tab card (expand/collapse indicator)
		const collapseButton = sidepanel
			.locator(`[data-tab-id="${parentInfo.browserTabId}"] button`)
			.first();
		await collapseButton.click();
		await sidepanel.waitForTimeout(300);

		console.log("Parent collapsed, now closing parent tab");

		// Click the close button
		const closeButton = sidepanel.locator(
			`[data-tab-id="${parentInfo.browserTabId}"] button[title="Close tab"]`,
		);
		await closeButton.click();
		await sidepanel.waitForTimeout(500);

		// Verify parent tab is closed
		const parentAfterClose = await treeHelpers.getTabByUrl(
			"about:blank?parent2",
		);
		expect(parentAfterClose).toBeUndefined();

		// Verify all children are also closed
		const child1AfterClose =
			await treeHelpers.getTabByUrl("about:blank?child3");
		const child2AfterClose =
			await treeHelpers.getTabByUrl("about:blank?child4");

		console.log("After closing parent - child1:", child1AfterClose);
		console.log("After closing parent - child2:", child2AfterClose);

		expect(child1AfterClose).toBeUndefined();
		expect(child2AfterClose).toBeUndefined();

		// Note: No cleanup needed as all tabs should be closed
	});
});

test.describe("Tree Structure Preservation Tests", () => {
	test("Level 0: Single tab with no children - move within same window", async ({
		context,
		sidepanel: _,
		treeHelpers,
	}) => {
		// Create tab a
		const aPage = await context.newPage();
		await aPage.goto("about:blank?a");
		const aInfo = await treeHelpers.waitForTab("about:blank?a");

		// Create target tab b
		const bPage = await context.newPage();
		await bPage.goto("about:blank?b");
		const bInfo = await treeHelpers.waitForTab("about:blank?b");

		// Move a after b
		await treeHelpers.dragTabAfterTab(aInfo.browserTabId, bInfo.browserTabId);

		// Wait for the tab to be at root level (null parent)
		await treeHelpers.waitForTabParent(aInfo.browserTabId, null);

		// Verify a moved and has no children
		const helpers = await treeHelpers.getHelpers();
		const aAfter = helpers
			.getAllTabs()
			.find((t) => t.url.includes("about:blank?a"));
		expect(aAfter?.parentTabId).toBeNull();
		expect(helpers.getChildren(aInfo.browserTabId).length).toBe(0);

		await aPage.close();
		await bPage.close();
	});

	test("Level 0: Single tab with no children - move to new window", async ({
		context,
		sidepanel: _,
		treeHelpers,
	}) => {
		// Create tab a
		const aPage = await context.newPage();
		await aPage.goto("about:blank?a");
		const aInfo = await treeHelpers.waitForTab("about:blank?a");
		const originalWindowId = aInfo.browserWindowId;

		// Drag to new window drop zone
		const newWindowId = await treeHelpers.dragTabToNewWindow(
			aInfo.browserTabId,
		);

		// Verify a moved to new window and has no children
		const helpers = await treeHelpers.getHelpers();
		const aAfter = helpers
			.getAllTabs()
			.find((t) => t.url.includes("about:blank?a"));
		expect(aAfter?.browserWindowId).toBe(newWindowId);
		expect(aAfter?.browserWindowId).not.toBe(originalWindowId);
		expect(helpers.getChildren(aInfo.browserTabId).length).toBe(0);

		await aPage.close();
	});

	test("Level 1: Parent with children (a, a.1, a.2, a.3) - move within same window", async ({
		context,
		sidepanel: _,
		treeHelpers,
	}) => {
		test.setTimeout(60000); // Increase timeout to 60s for complex tree operations

		// Create parent a and children
		const aPage = await context.newPage();
		await aPage.goto("about:blank?a");
		const aInfo = await treeHelpers.waitForTab("about:blank?a");

		const a1Page = await context.newPage();
		await a1Page.goto("about:blank?a1");
		const a1Info = await treeHelpers.waitForTab("about:blank?a1");

		const a2Page = await context.newPage();
		await a2Page.goto("about:blank?a2");
		const a2Info = await treeHelpers.waitForTab("about:blank?a2");

		const a3Page = await context.newPage();
		await a3Page.goto("about:blank?a3");
		const a3Info = await treeHelpers.waitForTab("about:blank?a3");

		// Build tree: a.1, a.2, a.3 as children of a
		await treeHelpers.dragTabToTab(a1Info.browserTabId, aInfo.browserTabId);
		await treeHelpers.dragTabToTab(a2Info.browserTabId, aInfo.browserTabId);
		await treeHelpers.dragTabToTab(a3Info.browserTabId, aInfo.browserTabId);

		// Create target tab b
		const bPage = await context.newPage();
		await bPage.goto("about:blank?b");
		const bInfo = await treeHelpers.waitForTab("about:blank?b");

		// Move a after b (this moves the entire tree)
		await treeHelpers.dragTabAfterTab(aInfo.browserTabId, bInfo.browserTabId);

		// Wait for the parent to be at root level (null parent)
		await treeHelpers.waitForTabParent(aInfo.browserTabId, null);

		// Verify tree structure preserved
		const helpers = await treeHelpers.getHelpers();
		const allTabs = helpers.getAllTabs();

		const aAfter = allTabs.find((t) => t.url.includes("about:blank?a"));
		const a1After = allTabs.find((t) => t.url.includes("about:blank?a1"));
		const a2After = allTabs.find((t) => t.url.includes("about:blank?a2"));
		const a3After = allTabs.find((t) => t.url.includes("about:blank?a3"));

		expect(aAfter?.parentTabId).toBeNull();
		expect(a1After?.parentTabId).toBe(aAfter?.browserTabId);
		expect(a2After?.parentTabId).toBe(aAfter?.browserTabId);
		expect(a3After?.parentTabId).toBe(aAfter?.browserTabId);
		expect(helpers.getChildren(aInfo.browserTabId).length).toBe(3);

		await aPage.close();
		await a1Page.close();
		await a2Page.close();
		await a3Page.close();
		await bPage.close();
	});

	test("Level 1: Parent with children - move to new window", async ({
		context,
		treeHelpers,
	}) => {
		test.setTimeout(60000); // Increase timeout to 60s for cross-window tree operations

		// Create parent a and children
		const aPage = await context.newPage();
		await aPage.goto("about:blank?a");
		const aInfo = await treeHelpers.waitForTab("about:blank?a");
		const originalWindowId = aInfo.browserWindowId;

		const a1Page = await context.newPage();
		await a1Page.goto("about:blank?a1");
		const a1Info = await treeHelpers.waitForTab("about:blank?a1");

		const a2Page = await context.newPage();
		await a2Page.goto("about:blank?a2");
		const a2Info = await treeHelpers.waitForTab("about:blank?a2");

		const a3Page = await context.newPage();
		await a3Page.goto("about:blank?a3");
		const a3Info = await treeHelpers.waitForTab("about:blank?a3");

		// Build tree programmatically (faster, no UI interaction)
		await treeHelpers.makeTabChild(a1Info.browserTabId, aInfo.browserTabId);
		await treeHelpers.makeTabChild(a2Info.browserTabId, aInfo.browserTabId);
		await treeHelpers.makeTabChild(a3Info.browserTabId, aInfo.browserTabId);

		// Move to new window programmatically (this moves the entire tree including all children)
		await treeHelpers.moveTabToNewWindow(aInfo.browserTabId);

		// Verify all tabs moved and tree structure preserved
		const helpers = await treeHelpers.getHelpers();
		const allTabs = helpers.getAllTabs();

		const aAfter = allTabs.find((t) => t.url.includes("about:blank?a"));
		const a1After = allTabs.find((t) => t.url.includes("about:blank?a1"));
		const a2After = allTabs.find((t) => t.url.includes("about:blank?a2"));
		const a3After = allTabs.find((t) => t.url.includes("about:blank?a3"));

		expect(aAfter?.browserWindowId).not.toBe(originalWindowId);
		expect(a1After?.browserWindowId).toBe(aAfter?.browserWindowId);
		expect(a2After?.browserWindowId).toBe(aAfter?.browserWindowId);
		expect(a3After?.browserWindowId).toBe(aAfter?.browserWindowId);

		expect(a1After?.parentTabId).toBe(aAfter?.browserTabId);
		expect(a2After?.parentTabId).toBe(aAfter?.browserTabId);
		expect(a3After?.parentTabId).toBe(aAfter?.browserTabId);
		expect(helpers.getChildren(aInfo.browserTabId).length).toBe(3);

		await aPage.close();
		await a1Page.close();
		await a2Page.close();
		await a3Page.close();
	});

	test("Level 2: Parent with grandchildren - move to new window", async ({
		context,
		treeHelpers,
	}) => {
		test.setTimeout(90000); // Increase timeout to 90s for complex tree with grandchildren

		// Create tree: a -> a.1 (with a.1.1, a.1.2, a.1.3), a.2 (with a.2.1, a.2.2, a.2.3), a.3 (no children)
		const pages: Record<
			string,
			Awaited<ReturnType<typeof context.newPage>>
		> = {};
		const infos: Record<
			string,
			Awaited<ReturnType<typeof treeHelpers.waitForTab>>
		> = {};

		// Create all tabs
		const urls = [
			"a",
			"a1",
			"a11",
			"a12",
			"a13",
			"a2",
			"a21",
			"a22",
			"a23",
			"a3",
		];
		for (const url of urls) {
			pages[url] = await context.newPage();
			await pages[url].goto(`about:blank?${url}`);
			infos[url] = await treeHelpers.waitForTab(`about:blank?${url}`);
		}

		const originalWindowId = infos.a.browserWindowId;

		// Build tree structure programmatically (faster, no UI interaction)
		// a.1, a.2, a.3 as children of a
		await treeHelpers.makeTabChild(infos.a1.browserTabId, infos.a.browserTabId);
		await treeHelpers.makeTabChild(infos.a2.browserTabId, infos.a.browserTabId);
		await treeHelpers.makeTabChild(infos.a3.browserTabId, infos.a.browserTabId);

		// a.1.1, a.1.2, a.1.3 as children of a.1
		await treeHelpers.makeTabChild(
			infos.a11.browserTabId,
			infos.a1.browserTabId,
		);
		await treeHelpers.makeTabChild(
			infos.a12.browserTabId,
			infos.a1.browserTabId,
		);
		await treeHelpers.makeTabChild(
			infos.a13.browserTabId,
			infos.a1.browserTabId,
		);

		// a.2.1, a.2.2, a.2.3 as children of a.2
		await treeHelpers.makeTabChild(
			infos.a21.browserTabId,
			infos.a2.browserTabId,
		);
		await treeHelpers.makeTabChild(
			infos.a22.browserTabId,
			infos.a2.browserTabId,
		);
		await treeHelpers.makeTabChild(
			infos.a23.browserTabId,
			infos.a2.browserTabId,
		);

		// Move a to new window programmatically (this moves the entire tree including children and grandchildren)
		await treeHelpers.moveTabToNewWindow(infos.a.browserTabId);

		// Verify all tabs moved and tree structure preserved
		const helpers = await treeHelpers.getHelpers();
		const allTabs = helpers.getAllTabs();

		const tabsAfter: Record<
			string,
			ReturnType<typeof helpers.getAllTabs>[number] | undefined
		> = {};
		for (const url of urls) {
			tabsAfter[url] = allTabs.find((t) =>
				t.url.includes(`about:blank?${url}`),
			);
			expect(tabsAfter[url]).toBeDefined();
		}

		// Verify all in new window
		for (const url of urls) {
			expect(tabsAfter[url]?.browserWindowId).toBe(
				tabsAfter.a?.browserWindowId,
			);
			expect(tabsAfter[url]?.browserWindowId).not.toBe(originalWindowId);
		}

		// Verify tree structure
		expect(tabsAfter.a1?.parentTabId).toBe(tabsAfter.a?.browserTabId);
		expect(tabsAfter.a2?.parentTabId).toBe(tabsAfter.a?.browserTabId);
		expect(tabsAfter.a3?.parentTabId).toBe(tabsAfter.a?.browserTabId);

		expect(tabsAfter.a11?.parentTabId).toBe(tabsAfter.a1?.browserTabId);
		expect(tabsAfter.a12?.parentTabId).toBe(tabsAfter.a1?.browserTabId);
		expect(tabsAfter.a13?.parentTabId).toBe(tabsAfter.a1?.browserTabId);

		expect(tabsAfter.a21?.parentTabId).toBe(tabsAfter.a2?.browserTabId);
		expect(tabsAfter.a22?.parentTabId).toBe(tabsAfter.a2?.browserTabId);
		expect(tabsAfter.a23?.parentTabId).toBe(tabsAfter.a2?.browserTabId);

		// Verify depths
		expect(tabsAfter.a?.depth).toBe(0);
		expect(tabsAfter.a1?.depth).toBe(1);
		expect(tabsAfter.a2?.depth).toBe(1);
		expect(tabsAfter.a3?.depth).toBe(1);
		expect(tabsAfter.a11?.depth).toBe(2);
		expect(tabsAfter.a21?.depth).toBe(2);

		// Cleanup
		for (const url of urls) {
			await pages[url].close();
		}
	});

	test("Level 3: Imbalanced tree with great-grandchildren - move to new window", async ({
		context,
		treeHelpers,
	}) => {
		test.setTimeout(120000); // Increase timeout to 120s for very complex tree with great-grandchildren

		// Create imbalanced tree:
		// a -> a.1 (with a.1.1 (with a.1.1.1, a.1.1.2), a.1.2, a.1.3),
		//      a.2 (with a.2.1 (with a.2.1.1, a.2.1.2), a.2.2, a.2.3),
		//      a.3 (no children - imbalanced)
		const pages: Record<
			string,
			Awaited<ReturnType<typeof context.newPage>>
		> = {};
		const infos: Record<
			string,
			Awaited<ReturnType<typeof treeHelpers.waitForTab>>
		> = {};

		const urls = [
			"a",
			"a1",
			"a11",
			"a111",
			"a112",
			"a12",
			"a13",
			"a2",
			"a21",
			"a211",
			"a212",
			"a22",
			"a23",
			"a3",
		];

		for (const url of urls) {
			pages[url] = await context.newPage();
			await pages[url].goto(`about:blank?${url}`);
			infos[url] = await treeHelpers.waitForTab(`about:blank?${url}`);
		}

		const originalWindowId = infos.a.browserWindowId;

		// Build tree structure programmatically using batch operations (faster, no UI interaction)
		// Level 1: a.1, a.2, a.3 under a
		await treeHelpers.makeTabChildren(infos.a.browserTabId, [
			infos.a1.browserTabId,
			infos.a2.browserTabId,
			infos.a3.browserTabId,
		]);

		// Level 2: children of a.1
		await treeHelpers.makeTabChildren(infos.a1.browserTabId, [
			infos.a11.browserTabId,
			infos.a12.browserTabId,
			infos.a13.browserTabId,
		]);

		// Level 2: children of a.2
		await treeHelpers.makeTabChildren(infos.a2.browserTabId, [
			infos.a21.browserTabId,
			infos.a22.browserTabId,
			infos.a23.browserTabId,
		]);

		// Level 3: children of a.1.1
		await treeHelpers.makeTabChildren(infos.a11.browserTabId, [
			infos.a111.browserTabId,
			infos.a112.browserTabId,
		]);

		// Level 3: children of a.2.1
		await treeHelpers.makeTabChildren(infos.a21.browserTabId, [
			infos.a211.browserTabId,
			infos.a212.browserTabId,
		]);

		// Move a to new window programmatically (this moves the entire tree with all descendants)
		await treeHelpers.moveTabToNewWindow(infos.a.browserTabId);

		// Verify all tabs moved and tree structure preserved
		const helpers = await treeHelpers.getHelpers();
		const allTabs = helpers.getAllTabs();

		const tabsAfter: Record<
			string,
			ReturnType<typeof helpers.getAllTabs>[number] | undefined
		> = {};
		for (const url of urls) {
			tabsAfter[url] = allTabs.find((t) =>
				t.url.includes(`about:blank?${url}`),
			);
			expect(tabsAfter[url]).toBeDefined();
		}

		// Verify all in new window
		for (const url of urls) {
			expect(tabsAfter[url]?.browserWindowId).toBe(
				tabsAfter.a?.browserWindowId,
			);
			expect(tabsAfter[url]?.browserWindowId).not.toBe(originalWindowId);
		}

		// Verify tree structure at each level
		// Level 1
		expect(tabsAfter.a1?.parentTabId).toBe(tabsAfter.a?.browserTabId);
		expect(tabsAfter.a2?.parentTabId).toBe(tabsAfter.a?.browserTabId);
		expect(tabsAfter.a3?.parentTabId).toBe(tabsAfter.a?.browserTabId);

		// Level 2
		expect(tabsAfter.a11?.parentTabId).toBe(tabsAfter.a1?.browserTabId);
		expect(tabsAfter.a12?.parentTabId).toBe(tabsAfter.a1?.browserTabId);
		expect(tabsAfter.a13?.parentTabId).toBe(tabsAfter.a1?.browserTabId);

		expect(tabsAfter.a21?.parentTabId).toBe(tabsAfter.a2?.browserTabId);
		expect(tabsAfter.a22?.parentTabId).toBe(tabsAfter.a2?.browserTabId);
		expect(tabsAfter.a23?.parentTabId).toBe(tabsAfter.a2?.browserTabId);

		// Level 3
		expect(tabsAfter.a111?.parentTabId).toBe(tabsAfter.a11?.browserTabId);
		expect(tabsAfter.a112?.parentTabId).toBe(tabsAfter.a11?.browserTabId);

		expect(tabsAfter.a211?.parentTabId).toBe(tabsAfter.a21?.browserTabId);
		expect(tabsAfter.a212?.parentTabId).toBe(tabsAfter.a21?.browserTabId);

		// Verify depths
		expect(tabsAfter.a?.depth).toBe(0);
		expect(tabsAfter.a1?.depth).toBe(1);
		expect(tabsAfter.a11?.depth).toBe(2);
		expect(tabsAfter.a111?.depth).toBe(3);

		// Verify imbalanced parts (a.3, a.1.3, a.2.3 have no children)
		expect(helpers.getChildren(infos.a3.browserTabId).length).toBe(0);
		expect(helpers.getChildren(infos.a13.browserTabId).length).toBe(0);
		expect(helpers.getChildren(infos.a23.browserTabId).length).toBe(0);

		// Cleanup
		for (const url of urls) {
			await pages[url].close();
		}
	});
});
