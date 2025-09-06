// Background script for Focus Blocker

chrome.runtime.onInstalled.addListener(() => {
  console.log('Focus Blocker installed');
  // Initialize with empty blocking rules
  updateBlockingRules([]);
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateBlockedSites") {
    updateBlockingRules(request.sites);
    sendResponse({ success: true });
  }
  
  if (request.action === "requestPasscode") {
    // Generate and send passcode
    generateAndSendPasscode()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('Failed to send passcode:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Keep message channel open for async response
  }
});

async function updateBlockingRules(blockedSites) {
  try {
    // First, get all existing rules and remove them
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map(rule => rule.id);
    
    if (existingRuleIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingRuleIds
      });
    }

    // Generate new rules with fresh IDs
    const newRules = [];
    let ruleId = 1; // Start fresh each time

    blockedSites.forEach((site) => {
      const patterns = generateBlockingPatterns(site);
      patterns.forEach(pattern => {
        newRules.push({
          id: ruleId++,
          priority: 1,
          action: {
            type: "redirect",
            redirect: {
              url: chrome.runtime.getURL("blocked.html")
            }
          },
          condition: {
            urlFilter: pattern,
            resourceTypes: ["main_frame"]
          }
        });
      });
    });

    // Add new rules
    if (newRules.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: newRules
      });
    }

    console.log(`Updated blocking rules: ${newRules.length} rules for ${blockedSites.length} sites`);
    
  } catch (error) {
    console.error('Error updating rules:', error);
  }
}

function generateBlockingPatterns(site) {
  const patterns = [];
  
  // Clean up the site input
  const cleanSite = site.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
  
  // If it looks like a domain (has a dot and valid TLD)
  if (cleanSite.includes('.') && /\.[a-z]{2,}$/i.test(cleanSite)) {
    // Exact domain patterns
    patterns.push(`*://${cleanSite}/*`);
    patterns.push(`*://www.${cleanSite}/*`);
    
    // Subdomain patterns
    patterns.push(`*://*.${cleanSite}/*`);
  } else {
    // Keyword-based blocking - be more specific to avoid false positives
    patterns.push(`*://*${cleanSite}*`);
  }
  
  return patterns;
}

// Passcode functionality
async function generateAndSendPasscode() {
  const passcode = generatePasscode();
  const expiryTime = Date.now() + (10 * 60 * 1000); // 10 minutes

  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(['protectionEmail', 'emailjsConfig'], (data) => {
      if (!data.protectionEmail) {
        reject(new Error('No email configured for protection'));
        return;
      }

      if (!data.emailjsConfig || !data.emailjsConfig.serviceId || !data.emailjsConfig.templateId || !data.emailjsConfig.publicKey) {
        reject(new Error('EmailJS not configured properly'));
        return;
      }

      // Store the passcode with expiry
      chrome.storage.sync.set({
        currentPasscode: {
          code: passcode,
          expires: expiryTime
        }
      });

      // Create a tab to send the email (since service workers can't use EmailJS directly)
      chrome.tabs.create({
        url: chrome.runtime.getURL('send-email.html') + 
             `?passcode=${passcode}&email=${encodeURIComponent(data.protectionEmail)}`,
        active: false
      }, (tab) => {
        // Close the tab after 3 seconds
        setTimeout(() => {
          chrome.tabs.remove(tab.id).catch(() => {
            // Tab might already be closed, ignore error
          });
          resolve();
        }, 3000);
      });
    });
  });
}

function generatePasscode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}