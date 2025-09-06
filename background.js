// Enhanced background.js with better debugging and error handling

chrome.runtime.onInstalled.addListener(async () => {
  console.log('🚀 Focus Blocker installed');
  
  // Initialize storage if needed
  const data = await chrome.storage.sync.get(['blocked', 'customBlocked', 'blockingActive']);
  if (!data.blocked) await chrome.storage.sync.set({ blocked: [] });
  if (!data.customBlocked) await chrome.storage.sync.set({ customBlocked: [] });
  if (data.blockingActive === undefined) await chrome.storage.sync.set({ blockingActive: false });
  
  console.log('📦 Initial storage:', data);
  
  // Initialize with current blocking state
  loadAndUpdateRules();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('🔄 Focus Blocker startup');
  loadAndUpdateRules();
});

// Enhanced message listener with better error handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Received message:', request);
  
  if (request.action === "updateBlockedSites") {
    updateBlockingRules(request.sites)
      .then(() => {
        console.log('✅ Successfully updated blocking rules');
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('❌ Failed to update blocking rules:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }
  
  if (request.action === "requestPasscode") {
    generateAndSendPasscode()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('❌ Failed to send passcode:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  // Debug action to check current state
  if (request.action === "debugExtension") {
    debugExtensionState()
      .then((debugInfo) => {
        sendResponse({ success: true, debugInfo });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

// Enhanced loadAndUpdateRules with better logging
async function loadAndUpdateRules() {
  try {
    console.log('🔄 Loading and updating rules...');
    const data = await chrome.storage.sync.get(['blocked', 'customBlocked', 'blockingActive']);
    const allSites = data.blockingActive ? 
      [...(data.blocked || []), ...(data.customBlocked || [])] : [];
    
    console.log('📊 Current state:', {
      blocked: data.blocked,
      customBlocked: data.customBlocked,
      blockingActive: data.blockingActive,
      totalSites: allSites.length
    });
    
    await updateBlockingRules(allSites);
    console.log('✅ Rules loaded and updated successfully');
  } catch (error) {
    console.error('❌ Error loading and updating rules:', error);
  }
}

// Enhanced updateBlockingRules with comprehensive logging
async function updateBlockingRules(blockedSites) {
  try {
    console.log('🔄 Updating blocking rules for sites:', blockedSites);

    // Get all existing dynamic rules
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map(rule => rule.id);
    
    console.log(`📋 Found ${existingRules.length} existing rules`);
    
    // Remove all existing rules first
    if (existingRuleIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingRuleIds
      });
      console.log(`🗑️  Removed ${existingRuleIds.length} existing rules`);
    }

    // If no sites to block, we're done
    if (!blockedSites || blockedSites.length === 0) {
      console.log('✅ No sites to block - all rules cleared');
      return;
    }

    // Generate new rules
    const newRules = [];
    let ruleId = 1;

    for (const site of blockedSites) {
      const patterns = generateBlockingPatterns(site);
      console.log(`🎯 Site: "${site}" → Patterns:`, patterns);
      
      for (const pattern of patterns) {
        // Skip if pattern is too generic to avoid blocking everything
        if (pattern === '*://*/*' || pattern === '*') {
          console.warn(`⚠️  Skipping overly generic pattern: ${pattern} for site: ${site}`);
          continue;
        }
        
        const rule = {
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
        };
        
        newRules.push(rule);
        console.log(`➕ Added rule ${rule.id}: ${pattern}`);

        // Chrome has a limit on dynamic rules
        if (ruleId > 1000) {
          console.warn('⚠️  Reached rule limit, stopping at 1000 rules');
          break;
        }
      }
    }

    // Add new rules if any
    if (newRules.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: newRules
      });
      console.log(`✅ Successfully added ${newRules.length} blocking rules for ${blockedSites.length} sites`);
    } else {
      console.warn('⚠️  No valid rules generated');
    }

    // Verify the rules were added
    const finalRules = await chrome.declarativeNetRequest.getDynamicRules();
    console.log(`📊 Final rule count: ${finalRules.length}`);
    
    // Log a sample of the final rules for debugging
    if (finalRules.length > 0) {
      console.log('📋 Sample rules:', finalRules.slice(0, 3).map(r => ({
        id: r.id,
        pattern: r.condition.urlFilter
      })));
    }

  } catch (error) {
    console.error('❌ Error updating blocking rules:', error);
    throw error;
  }
}

// Enhanced pattern generation with better logging
function generateBlockingPatterns(site) {
  const patterns = [];
  
  // Clean up the site input
  let cleanSite = site.toLowerCase().trim();
  const originalSite = cleanSite;
  
  cleanSite = cleanSite.replace(/^https?:\/\//, '');
  cleanSite = cleanSite.replace(/^www\./, '');
  cleanSite = cleanSite.replace(/\/$/, '');
  
  console.log(`🧹 Cleaned site: "${originalSite}" → "${cleanSite}"`);
  
  if (!cleanSite) {
    console.warn('⚠️  Empty site after cleaning:', site);
    return patterns;
  }
  
  // If it looks like a domain (contains a dot and valid TLD)
  if (cleanSite.includes('.') && /\.[a-z]{2,}$/i.test(cleanSite)) {
    // Main domain patterns
    patterns.push(`*://${cleanSite}/*`);
    patterns.push(`*://www.${cleanSite}/*`);
    
    // Subdomain patterns (but be careful not to be too broad)
    if (!cleanSite.startsWith('*.')) {
      patterns.push(`*://*.${cleanSite}/*`);
    }
  } else {
    // For keywords, be more specific to avoid false positives
    patterns.push(`*://*${cleanSite}*/*`);
  }
  
  return patterns;
}

// Debug function to check extension state
async function debugExtensionState() {
  const storage = await chrome.storage.sync.get(['blocked', 'customBlocked', 'blockingActive']);
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  
  return {
    storage,
    rulesCount: rules.length,
    sampleRules: rules.slice(0, 5).map(r => ({ id: r.id, pattern: r.condition.urlFilter }))
  };
}

// Listen for storage changes and update rules accordingly
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    console.log('📦 Storage changed:', changes);
    
    if (changes.blocked || changes.customBlocked || changes.blockingActive) {
      console.log('🔄 Blocking-related storage changed, updating rules...');
      loadAndUpdateRules();
    }
  }
});

// Passcode functionality (simplified, no send-email.html)
async function generateAndSendPasscode() {
  const passcode = generatePasscode();
  const expiryTime = Date.now() + (10 * 60 * 1000); // 10 minutes

  const data = await chrome.storage.sync.get(['protectionEmail', 'emailjsConfig']);
  if (!data.protectionEmail) throw new Error('No email configured for protection');
  const { serviceId, templateId, publicKey } = data.emailjsConfig || {};
  if (!serviceId || !templateId || !publicKey) {
    throw new Error('EmailJS not configured properly');
  }

  // Store passcode
  await chrome.storage.sync.set({
    currentPasscode: { code: passcode, expires: expiryTime }
  });

  // EmailJS request body
  const templateParams = {
    to_email: data.protectionEmail,
    subject: 'Focus Blocker - Unblock Passcode',
    passcode,
    message: `Hello!\n\nYour Focus Blocker passcode is: ${passcode}\n\nThis passcode will expire in 10 minutes.\n\nUse this code to modify your blocked sites list.\n\nStay productive!\nFocus Blocker Extension`
  };

  const requestBody = {
    service_id: serviceId,
    template_id: templateId,
    user_id: publicKey,
    template_params: templateParams
  };

  console.log("📧 Sending passcode email via EmailJS...", requestBody);

  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("❌ EmailJS error:", errorText);
    throw new Error(`EmailJS failed: ${response.status} ${errorText}`);
  }

  console.log("✅ Passcode email sent successfully");
  return true;
}

function generatePasscode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
