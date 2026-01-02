import { createTab, expect, test } from "./fixtures";

/**
 * Tests for context menus, renaming, middle-click actions, and UI buttons
 */

test.describe("Middle-Click Actions", () => {
	test("middle-click closes a tab", async ({
		context,
		sidepanel,
		treeHelpers,
	}) => {
		// Create a tab to test with
		await createTab(context, "about:blank?middle-click", sidepanel);
		const tabInfo = await treeHelpers.waitForTab("about:blank?middle-click");

		// Get the tab element
		const tabElement = treeHelpers.getTabElement(tabInfo.browserTabId);
		await expect(tabElement).toBeVisible();

		// Middle-click the tab (button: 1 is middle mouse button)
		await tabElement.click({ button: "middle" });

		// Wait for the tab to be closed - it should disappear from the tree
		await sidepanel.waitForTimeout(500);
		const helpers = await treeHelpers.getHelpers();
		const closedTab = helpers.getTabById(tabInfo.browserTabId);
		expect(closedTab).toBeUndefined();
	});

	test("middle-click closes a window", async ({ sidepanel, treeHelpers }) => {
		// Get initial window count
		const helpersBefore = await treeHelpers.getHelpers();
		const initialWindows = helpersBefore.getWindows();
		const initialWindowCount = initialWindows.length;

		// Create a new window using the + button in the header
		const plusButton = sidepanel.locator('button[title="New window"]');
		await plusButton.click();

		// Wait for new window to appear
		await sidepanel.waitForTimeout(1000);

		// Get the new window ID
		const helpersAfter = await treeHelpers.getHelpers();
		const windowsAfter = helpersAfter.getWindows();
		expect(windowsAfter.length).toBe(initialWindowCount + 1);

		// Find the new window (the one that wasn't in the initial list)
		const newWindow = windowsAfter.find(
			(w) => !initialWindows.some((iw) => iw.id === w.id),
		);
		if (!newWindow) {
			throw new Error("New window not found after creation");
		}
		const newWindowId = newWindow.id;

		// Find the window header that does NOT have "(current)" - that's the new window
		// The new window won't be focused because we're staying in the sidepanel
		const windowHeaders = sidepanel.locator("text=Window").all();
		const allHeaders = await windowHeaders;

		// Find the header that is just "Window" without "(current)"
		let targetHeader = null;
		for (const header of allHeaders) {
			const text = await header.textContent();
			if (text && !text.includes("(current)")) {
				targetHeader = header;
				break;
			}
		}

		if (!targetHeader) {
			throw new Error("Could not find non-current window header");
		}

		// Middle-click the new window header
		await targetHeader.click({ button: "middle" });

		// Wait for window to close
		await sidepanel.waitForTimeout(500);
		const helpersFinal = await treeHelpers.getHelpers();
		const windowsFinal = helpersFinal.getWindows();
		const closedWindow = windowsFinal.find((w) => w.id === newWindowId);
		expect(closedWindow).toBeUndefined();
	});
});

test.describe("Context Menus", () => {
	test("tab context menu - rename tab", async ({
		context,
		sidepanel,
		treeHelpers,
	}) => {
		// Create a tab
		const newTab = await createTab(
			context,
			"about:blank?rename-test",
			sidepanel,
		);
		const tabInfo = await treeHelpers.waitForTab("about:blank?rename-test");

		// Right-click the tab to open context menu
		const tabElement = treeHelpers.getTabElement(tabInfo.browserTabId);
		await tabElement.click({ button: "right" });

		// Click "Rename Tab" option
		await sidepanel.locator('text="Rename Tab"').click();

		// An input field should appear - type new name
		const input = sidepanel.locator('input[type="text"]').first();
		await expect(input).toBeVisible();
		await input.fill("Custom Tab Name");
		await input.press("Enter");

		// Wait for the rename to take effect
		await sidepanel.waitForTimeout(300);

		// Verify the tab has the custom name
		await expect(tabElement).toContainText("Custom Tab Name");

		// Verify the ✏️ indicator appears
		await expect(tabElement).toContainText("✏️");

		await newTab.close();
	});

	test("tab context menu - reset custom name", async ({
		context,
		sidepanel,
		treeHelpers,
	}) => {
		// Create a tab
		const newTab = await createTab(
			context,
			"about:blank?reset-name",
			sidepanel,
		);
		const tabInfo = await treeHelpers.waitForTab("about:blank?reset-name");

		// First, set a custom name
		const tabElement = treeHelpers.getTabElement(tabInfo.browserTabId);
		await tabElement.click({ button: "right" });
		await sidepanel.locator('text="Rename Tab"').click();
		const input = sidepanel.locator('input[type="text"]').first();
		await input.fill("Custom Name");
		await input.press("Enter");
		await sidepanel.waitForTimeout(300);

		// Now reset it by clearing the input
		await tabElement.click({ button: "right" });
		await sidepanel.locator('text="Rename Tab"').click();
		const input2 = sidepanel.locator('input[type="text"]').first();
		await input2.fill(""); // Empty clears the override
		await input2.press("Enter");
		await sidepanel.waitForTimeout(300);

		// ✏️ indicator should be gone
		await expect(tabElement).not.toContainText("✏️");

		await newTab.close();
	});

	test("tab context menu - new tab as child", async ({
		context,
		sidepanel,
		treeHelpers,
	}) => {
		// Create a parent tab
		const parentTab = await createTab(context, "about:blank?parent", sidepanel);
		const parentInfo = await treeHelpers.waitForTab("about:blank?parent");

		// Right-click and select "New Tab"
		const tabElement = treeHelpers.getTabElement(parentInfo.browserTabId);
		await tabElement.click({ button: "right" });
		await sidepanel.locator('text="New Tab"').first().click();

		// Wait for new tab to be created and synced
		await sidepanel.waitForTimeout(1000);

		// Verify a new tab was created as a child of the parent
		const helpers = await treeHelpers.getHelpers();
		const children = helpers.getChildren(parentInfo.browserTabId);
		expect(children.length).toBeGreaterThan(0);

		await parentTab.close();
	});

	test("tab context menu - collapse/expand", async ({
		context,
		sidepanel,
		treeHelpers,
	}) => {
		// Create parent and child tabs
		const parent = await createTab(context, "about:blank?parent", sidepanel);
		const child = await createTab(context, "about:blank?child", sidepanel);

		const parentInfo = await treeHelpers.waitForTab("about:blank?parent");
		const childInfo = await treeHelpers.waitForTab("about:blank?child");

		// Make child a child of parent
		await treeHelpers.makeTabChild(
			childInfo.browserTabId,
			parentInfo.browserTabId,
		);

		// Right-click parent and collapse
		const parentElement = treeHelpers.getTabElement(parentInfo.browserTabId);
		await parentElement.click({ button: "right" });
		await sidepanel.locator('text="Collapse"').click();

		await sidepanel.waitForTimeout(300);

		// Child should not be visible
		const childElement = treeHelpers.getTabElement(childInfo.browserTabId);
		await expect(childElement).not.toBeVisible();

		// Right-click parent and expand
		await parentElement.click({ button: "right" });
		await sidepanel.locator('text="Expand"').click();

		await sidepanel.waitForTimeout(300);

		// Child should be visible again
		await expect(childElement).toBeVisible();

		await parent.close();
		await child.close();
	});

	test("tab context menu - close tab", async ({
		context,
		sidepanel,
		treeHelpers,
	}) => {
		// Create a tab
		await createTab(context, "about:blank?close-test", sidepanel);
		const tabInfo = await treeHelpers.waitForTab("about:blank?close-test");

		// Right-click and select "Close Tab"
		const tabElement = treeHelpers.getTabElement(tabInfo.browserTabId);
		await tabElement.click({ button: "right" });
		await sidepanel.locator('text="Close Tab"').click();

		// Wait and verify tab is closed
		await sidepanel.waitForTimeout(300);
		const helpers = await treeHelpers.getHelpers();
		const closedTab = helpers.getTabById(tabInfo.browserTabId);
		expect(closedTab).toBeUndefined();
	});

	test("window context menu - rename window", async ({ sidepanel }) => {
		// Find the first window header
		const windowHeader = sidepanel.locator(`text=Window`).first();

		// Right-click to open context menu
		await windowHeader.click({ button: "right" });

		// Click "Rename Window"
		await sidepanel.locator('text="Rename Window"').click();

		// Input should appear
		const input = sidepanel.locator('input[type="text"]').first();
		await expect(input).toBeVisible();
		await input.fill("My Custom Window");
		await input.press("Enter");

		await sidepanel.waitForTimeout(300);

		// Verify custom name appears
		await expect(
			sidepanel.locator(`text=My Custom Window`).first(),
		).toBeVisible();
		await expect(sidepanel.locator(`text=✏️`).first()).toBeVisible();
	});

	test("window context menu - new tab", async ({ sidepanel, treeHelpers }) => {
		// Get initial tab count
		const helpersBefore = await treeHelpers.getHelpers();
		const initialTabs = helpersBefore.getAllTabs();
		const initialCount = initialTabs.length;

		// Right-click window header
		const windowHeader = sidepanel.locator(`text=Window`).first();
		await windowHeader.click({ button: "right" });

		// Click "New Tab"
		await sidepanel.locator('text="New Tab"').first().click();

		// Wait and verify new tab was created
		await sidepanel.waitForTimeout(500);
		const helpersAfter = await treeHelpers.getHelpers();
		const afterTabs = helpersAfter.getAllTabs();
		expect(afterTabs.length).toBe(initialCount + 1);
	});

	test("window context menu - collapse/expand", async ({ sidepanel }) => {
		// Right-click window header
		const windowHeader = sidepanel.locator(`text=Window`).first();
		await windowHeader.click({ button: "right" });

		// Click "Collapse"
		await sidepanel.locator('text="Collapse"').click();
		await sidepanel.waitForTimeout(300);

		// Right-click again to verify menu shows "Expand"
		await windowHeader.click({ button: "right" });
		await expect(sidepanel.locator('text="Expand"')).toBeVisible();
		await sidepanel.locator('text="Expand"').click();

		await sidepanel.waitForTimeout(300);
	});
});

test.describe("Click-to-Rename", () => {
	test("click on selected tab triggers rename", async ({
		context,
		sidepanel,
		treeHelpers,
	}) => {
		// Create a tab
		const newTab = await createTab(
			context,
			"about:blank?click-rename",
			sidepanel,
		);
		const tabInfo = await treeHelpers.waitForTab("about:blank?click-rename");

		const tabElement = treeHelpers.getTabElement(tabInfo.browserTabId);

		// First click to select the tab
		await tabElement.click();
		await sidepanel.waitForTimeout(200);

		// Second click on the already-selected tab should trigger rename
		await tabElement.click();
		await sidepanel.waitForTimeout(200);

		// Input field should appear
		const input = sidepanel.locator('input[type="text"]').first();
		await expect(input).toBeVisible();

		// Type new name
		await input.fill("Click Renamed");
		await input.press("Enter");

		await sidepanel.waitForTimeout(300);

		// Verify new name
		await expect(tabElement).toContainText("Click Renamed");

		await newTab.close();
	});

	test("dragging selected tab does not trigger rename", async ({
		context,
		sidepanel,
		treeHelpers,
	}) => {
		// Create two tabs
		const tab1 = await createTab(context, "about:blank?drag1", sidepanel);
		const tab2 = await createTab(context, "about:blank?drag2", sidepanel);

		const tab1Info = await treeHelpers.waitForTab("about:blank?drag1");
		const tab2Info = await treeHelpers.waitForTab("about:blank?drag2");

		const tab1Element = treeHelpers.getTabElement(tab1Info.browserTabId);

		// Select tab1
		await tab1Element.click();
		await sidepanel.waitForTimeout(200);

		// Drag tab1 onto tab2 (should not trigger rename)
		await treeHelpers.dragTabToTab(
			tab1Info.browserTabId,
			tab2Info.browserTabId,
		);

		// Input should NOT appear
		const input = sidepanel.locator('input[type="text"]');
		await expect(input).not.toBeVisible();

		// Verify drag worked instead
		const result = await treeHelpers.verifyParentChild(
			tab2Info.browserTabId,
			tab1Info.browserTabId,
		);
		expect(result.isChild).toBe(true);

		await tab1.close();
		await tab2.close();
	});
});

test.describe("UI Buttons for Creating Tabs/Windows", () => {
	test("+ button on window creates new tab", async ({
		sidepanel,
		treeHelpers,
	}) => {
		// Get initial tab count
		const helpersBefore = await treeHelpers.getHelpers();
		const initialCount = helpersBefore.getAllTabs().length;

		// Find and click the + button on a window
		const windowHeader = sidepanel.locator(`text=Window`).first();
		await windowHeader.hover();

		const plusButton = sidepanel
			.locator('button[title="New tab in window"]')
			.first();
		await plusButton.click();

		// Wait for new tab
		await sidepanel.waitForTimeout(500);

		// Verify tab count increased
		const helpersAfter = await treeHelpers.getHelpers();
		const afterCount = helpersAfter.getAllTabs().length;
		expect(afterCount).toBe(initialCount + 1);
	});

	test("+ button in header creates new window", async ({
		sidepanel,
		treeHelpers,
	}) => {
		// Get initial window count
		const helpersBefore = await treeHelpers.getHelpers();
		const initialWindowCount = helpersBefore.getWindows().length;

		// Find and click the + button in the header
		const plusButton = sidepanel.locator('button[title="New window"]');
		await plusButton.click();

		// Wait for new window
		await sidepanel.waitForTimeout(1000);

		// Verify window count increased
		const helpersAfter = await treeHelpers.getHelpers();
		const afterWindowCount = helpersAfter.getWindows().length;
		expect(afterWindowCount).toBe(initialWindowCount + 1);
	});
});

test.describe("Title Override Persistence", () => {
	test("custom tab names persist across page refreshes", async ({
		context,
		sidepanel,
		treeHelpers,
	}) => {
		// Create a tab and give it a custom name
		const newTab = await createTab(context, "about:blank?persist", sidepanel);
		const tabInfo = await treeHelpers.waitForTab("about:blank?persist");

		const tabElement = treeHelpers.getTabElement(tabInfo.browserTabId);
		await tabElement.click({ button: "right" });
		await sidepanel.locator('text="Rename Tab"').click();

		const input = sidepanel.locator('input[type="text"]').first();
		await input.fill("Persistent Name");
		await input.press("Enter");
		await sidepanel.waitForTimeout(300);

		// Reload the sidepanel
		await sidepanel.reload();
		await sidepanel.waitForSelector('[data-testid="tab-manager"]', {
			timeout: 10000,
		});

		// Wait for tabs to sync
		await sidepanel.waitForTimeout(1000);

		// Custom name should still be there
		const tabElementAfter = treeHelpers.getTabElement(tabInfo.browserTabId);
		await expect(tabElementAfter).toContainText("Persistent Name");
		await expect(tabElementAfter).toContainText("✏️");

		await newTab.close();
	});

	test("custom window names persist across page refreshes", async ({
		sidepanel,
	}) => {
		// Rename a window
		const windowHeader = sidepanel.locator(`text=Window`).first();
		await windowHeader.click({ button: "right" });
		await sidepanel.locator('text="Rename Window"').click();

		const input = sidepanel.locator('input[type="text"]').first();
		await input.fill("Persistent Window");
		await input.press("Enter");
		await sidepanel.waitForTimeout(300);

		// Reload the sidepanel
		await sidepanel.reload();
		await sidepanel.waitForSelector('[data-testid="tab-manager"]', {
			timeout: 10000,
		});

		// Wait for windows to sync
		await sidepanel.waitForTimeout(1000);

		// Custom name should still be there
		await expect(
			sidepanel.locator(`text=Persistent Window`).first(),
		).toBeVisible();
		await expect(sidepanel.locator(`text=✏️`).first()).toBeVisible();
	});
});
