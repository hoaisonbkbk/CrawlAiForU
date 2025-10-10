// This script runs in the background.
// Its only job is to listen for the extension icon click.
chrome.action.onClicked.addListener((tab) => {
    // Check if we have a valid tab ID
    if (tab.id) {
        // Send a message to the content script in the active tab
        // to toggle the visibility of the control panel.
        chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
    }
});

