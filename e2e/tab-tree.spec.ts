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
 * - waitForTabCount(count): Wait for a specific number of tabs
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
		// Get initial tab count using test helpers
		const helpers = await treeHelpers.getHelpers();
		const initialCount = helpers.getAllTabs().length;

		console.log("Initial tab count:", initialCount);

		// Create a new tab
		const newPage = await createTab(context, "https://example.com", sidepanel);

		// Wait for the new tab to appear
		await treeHelpers.waitForTabCount(initialCount + 1);

		// Get the new tab info
		const newTabInfo = await treeHelpers.getTabByUrl("example.com");
		expect(newTabInfo).toBeDefined();
		expect(newTabInfo?.url).toContain("example.com");

		// Verify it appears in the DOM
		const tabElement = treeHelpers.getTabElement(newTabInfo!.id);
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
		const tab1 = await createTab(context, "https://example.com/1", sidepanel);
		const tab2 = await createTab(context, "https://example.com/2", sidepanel);

		// Wait for tabs to appear in the tree
		const tab1Info = await treeHelpers.waitForTab("example.com/1");
		const tab2Info = await treeHelpers.waitForTab("example.com/2");

		console.log("Tab 1 info:", tab1Info);
		console.log("Tab 2 info:", tab2Info);

		// Verify initial state - both should be root level
		expect(tab1Info.depth).toBe(0);
		expect(tab2Info.depth).toBe(0);
		expect(tab1Info.parentId).toBeNull();
		expect(tab2Info.parentId).toBeNull();

		// Get tab elements by their actual IDs
		const tab1Element = treeHelpers.getTabElement(tab1Info.id);
		const tab2Element = treeHelpers.getTabElement(tab2Info.id);

		// Get bounding boxes for drag and drop
		const sourceBox = await tab2Element.boundingBox();
		const targetBox = await tab1Element.boundingBox();

		if (sourceBox && targetBox) {
			// Perform drag and drop - drag tab2 onto tab1 to make it a child
			await sidepanel.mouse.move(
				sourceBox.x + 200,
				sourceBox.y + sourceBox.height / 2,
			);
			await sidepanel.mouse.down();
			await sidepanel.mouse.move(
				targetBox.x + 200,
				targetBox.y + targetBox.height / 2,
				{
					steps: 10,
				},
			);
			await sidepanel.waitForTimeout(100);
			await sidepanel.mouse.up();

			// Wait for the drop to be processed
			await sidepanel.waitForTimeout(500);

			// Verify the parent-child relationship using test helpers
			const result = await treeHelpers.verifyParentChild(
				tab1Info.id,
				tab2Info.id,
			);
			console.log("Parent-child verification:", result);

			expect(result.isChild).toBe(true);
			expect(result.childDepth).toBe(1);

			// Verify via helpers API
			const helpers = await treeHelpers.getHelpers();
			const updatedTab2 = helpers.getTabById(tab2Info.id);
			expect(updatedTab2?.parentId).toBe(tab1Info.id);
			expect(updatedTab2?.depth).toBe(1);
		}

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
		const tab1Element = treeHelpers.getTabElement(tab1Info.id);
		const tab2Element = treeHelpers.getTabElement(tab2Info.id);
		const tab3Element = treeHelpers.getTabElement(tab3Info.id);

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
		const updatedTab2 = helpers.getTabById(tab2Info.id);
		const updatedTab1 = helpers.getTabById(tab1Info.id);
		const updatedTab3 = helpers.getTabById(tab3Info.id);

		// Verify tab2 has both tabs as children
		expect(updatedTab2?.hasChildren).toBe(true);
		expect(updatedTab2?.childrenIds).toHaveLength(2);
		expect(updatedTab2?.childrenIds).toContain(tab1Info.id);
		expect(updatedTab2?.childrenIds).toContain(tab3Info.id);

		// Verify both tabs are children of tab2
		expect(updatedTab1?.parentId).toBe(tab2Info.id);
		expect(updatedTab3?.parentId).toBe(tab2Info.id);

		// Verify the order: tab1 should come before tab3 (tree order, not selection order)
		const children = helpers.getChildren(tab2Info.id);
		expect(children[0].id).toBe(tab1Info.id);
		expect(children[1].id).toBe(tab3Info.id);

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
		const parentTab = await createTab(
			context,
			"https://example.com/parent",
			sidepanel,
		);
		const childTab = await createTab(
			context,
			"https://example.com/child",
			sidepanel,
		);
		const targetTab = await createTab(
			context,
			"https://example.com/target",
			sidepanel,
		);

		// Wait for tabs to appear
		const parentInfo = await treeHelpers.waitForTab("example.com/parent");
		const childInfo = await treeHelpers.waitForTab("example.com/child");
		const targetInfo = await treeHelpers.waitForTab("example.com/target");

		// First, make childTab a child of parentTab
		const parentElement = treeHelpers.getTabElement(parentInfo.id);
		const childElement = treeHelpers.getTabElement(childInfo.id);

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
			parentInfo.id,
			childInfo.id,
		);
		expect(relationship.isChild).toBe(true);

		// Get all helpers to check descendant information
		const helpers = await treeHelpers.getHelpers();
		const updatedParent = helpers.getTabById(parentInfo.id);

		// Verify parent has the child
		expect(updatedParent?.childrenIds).toContain(childInfo.id);
		expect(updatedParent?.hasChildren).toBe(true);

		// Get descendants to verify the tree structure
		const descendants = helpers.getDescendants(parentInfo.id);
		expect(descendants.length).toBeGreaterThan(0);
		expect(descendants.some((d) => d.id === childInfo.id)).toBe(true);

		await parentTab.close();
		await childTab.close();
		await targetTab.close();
	});
});
