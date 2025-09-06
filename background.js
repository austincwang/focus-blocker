let blockedSites = [];

// Initialize blocked sites when extension starts
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get("blocked", (data) => {
    blockedSites = data.blocked || [];
    updateBlockingRules();
  });
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.blocked) {
    blockedSites = changes.blocked.newValue || [];
    updateBlockingRules();
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "updateBlockedSites") {
    blockedSites = message.sites;
    updateBlockingRules();
  }
});

// Update blocking rules using declarativeNetRequest API
function updateBlockingRules() {
  // First, remove all existing rules
  chrome.declarativeNetRequest.getDynamicRules().then((existingRules) => {
    const existingRuleIds = existingRules.map(rule => rule.id);
    
    // Create new rules for blocked sites
    const newRules = blockedSites.map((site, index) => ({
      id: index + 1,
      priority: 1,
      action: {
        type: "redirect",
        redirect: { url: chrome.runtime.getURL("blocked.html") }
      },
      condition: {
        urlFilter: `*://*.${site}/*`,
        resourceTypes: ["main_frame"]
      }
    }));

    // Update rules
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRuleIds,
      addRules: newRules
    }).then(() => {
      console.log("Blocking rules updated for:", blockedSites);
    }).catch(err => {
      console.error("Error updating rules:", err);
    });
  });
}