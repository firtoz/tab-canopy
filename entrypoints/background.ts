export default defineBackground(() => {
	browser.runtime.onInstalled.addListener(() => {
		browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
	});
});
