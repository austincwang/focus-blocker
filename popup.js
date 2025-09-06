document.addEventListener("DOMContentLoaded", () => {
  // Page elements
  const setupPage = document.getElementById("setup-page");
  const blockedPage = document.getElementById("blocked-page");
  const statusDiv = document.getElementById("status");

  // Setup page elements
  const form = document.getElementById("block-form");
  const checkboxes = form.querySelectorAll("input[type='checkbox']");
  const customInput = document.getElementById("custom-site");
  const addButton = document.getElementById("add-custom");
  const customList = document.getElementById("custom-list");
  const settingsLink = document.getElementById("settings-link");

  // Blocked page elements
  const activeBlocksDiv = document.getElementById("active-blocks");
  const unlockBtn = document.getElementById("unlock-btn");
  const disableAllBtn = document.getElementById("disable-all-btn");
  const settingsLinkBlocked = document.getElementById("settings-link-blocked");

  let isProtectionEnabled = false;
  let currentBlocks = { popular: [], custom: [] };

  // Initialize
  init();

  async function init() {
    await checkProtectionStatus();
    await loadCurrentState();
  }

  async function loadCurrentState() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["blocked", "customBlocked", "blockingActive"], (data) => {
      const blockedSites = data.blocked || [];
      const customBlockedSites = data.customBlocked || [];
      const blockingActive = data.blockingActive || false;

      currentBlocks.popular = blockedSites;
      currentBlocks.custom = customBlockedSites;

      console.log('Loading state:', { blockedSites, customBlockedSites, blockingActive });

      if (blockingActive && (blockedSites.length > 0 || customBlockedSites.length > 0)) {
        showBlockedPage();
        // Ensure rules are applied even when showing blocked page
        updateBlockingRules();
      } else {
        showSetupPage();
        // Load data into setup form
        loadSetupData(blockedSites, customBlockedSites);
        // Clear rules when not blocking
        updateBlockingRules();
      }
      resolve();
    });
  });
}

  function loadSetupData(blockedSites, customBlockedSites) {
    // Load predefined checkboxes
    checkboxes.forEach(cb => {
      cb.checked = blockedSites.includes(cb.value);
    });
    
    // Load custom blocked sites
    displayCustomSites(customBlockedSites);
  }

  function showSetupPage() {
    setupPage.classList.add('active');
    blockedPage.classList.remove('active');
    
    // Add protection indicator if enabled
    if (isProtectionEnabled) {
      addProtectionIndicator(setupPage);
    }
  }

  function showBlockedPage() {
    setupPage.classList.remove('active');
    blockedPage.classList.add('active');
    displayActiveBlocks();
    
    // Add protection indicator if enabled
    if (isProtectionEnabled) {
      addProtectionIndicator(blockedPage);
    }
  }

  function addProtectionIndicator(parentElement) {
    // Remove existing indicator
    const existing = parentElement.querySelector('.protection-indicator');
    if (existing) existing.remove();

    const protectionIndicator = document.createElement('div');
    protectionIndicator.className = 'protection-indicator';
    protectionIndicator.innerHTML = '🔒 Email protection enabled';
    parentElement.insertBefore(protectionIndicator, parentElement.firstChild.nextSibling);
  }

  function displayActiveBlocks() {
    activeBlocksDiv.innerHTML = '';
    const allBlocks = [...currentBlocks.popular, ...currentBlocks.custom];
    
    if (allBlocks.length === 0) {
      activeBlocksDiv.innerHTML = '<p style="color: #666; font-style: italic;">No sites currently blocked.</p>';
      return;
    }

    allBlocks.forEach(site => {
      const siteTag = document.createElement('span');
      siteTag.className = 'site-tag';
      siteTag.textContent = site;
      activeBlocksDiv.appendChild(siteTag);
    });
  }

  // Check protection status
  async function checkProtectionStatus() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['protectionEmail', 'emailjsConfig'], (data) => {
        isProtectionEnabled = !!(data.protectionEmail && 
                                data.emailjsConfig && 
                                data.emailjsConfig.serviceId && 
                                data.emailjsConfig.templateId && 
                                data.emailjsConfig.publicKey);
        resolve();
      });
    });
  }

  // Settings links
  if (settingsLink) {
    settingsLink.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
    });
  }

  if (settingsLinkBlocked) {
    settingsLinkBlocked.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
    });
  }

  // Setup page functionality
  if (addButton) {
    addButton.addEventListener("click", () => {
      const site = customInput.value.trim();
      if (site) {
        chrome.storage.sync.get("customBlocked", (data) => {
          const customBlocked = data.customBlocked || [];
          if (!customBlocked.includes(site)) {
            customBlocked.push(site);
            chrome.storage.sync.set({ customBlocked }, () => {
              displayCustomSites(customBlocked);
              customInput.value = "";
              showStatus("Custom site added!");
            });
          } else {
            showStatus("Site already added!");
          }
        });
      }
    });
  }

  if (customInput) {
    customInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        addButton.click();
      }
    });
  }

  // Form submission - activate blocking
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      
      const selectedPopular = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);

      chrome.storage.sync.get("customBlocked", (data) => {
        const customBlocked = data.customBlocked || [];
        
        if (selectedPopular.length === 0 && customBlocked.length === 0) {
          showStatus("Please select at least one site to block!");
          return;
        }

        console.log('Activating blocking for:', selectedPopular, customBlocked);

        // Save and activate blocking
        chrome.storage.sync.set({ 
          blocked: selectedPopular, 
          blockingActive: true 
        }, () => {
          currentBlocks.popular = selectedPopular;
          currentBlocks.custom = customBlocked;
          
          // Force update blocking rules
          updateBlockingRules().then(() => {
            showStatus("Blocking activated!");
            setTimeout(() => showBlockedPage(), 1000);
          }).catch((error) => {
            console.error('Failed to update blocking rules:', error);
            showStatus("Error activating blocking: " + error.message);
          });
        });
      });
    });
  }

  // Blocked page functionality - requires passcode
  if (unlockBtn) {
    unlockBtn.addEventListener("click", () => {
      requirePasscodeFor(() => {
        chrome.storage.sync.set({ blockingActive: false }, () => {
          // Clear blocking rules when unlocking
          updateBlockingRules().then(() => {
            showSetupPage();
            showStatus("You can now modify your blocked sites");
          }).catch((error) => {
            console.error('Failed to clear blocking rules:', error);
            showSetupPage();
            showStatus("Unlocked (with potential rule clearing error)");
          });
        });
      });
    });
  }

  if (disableAllBtn) {
    disableAllBtn.addEventListener("click", () => {
      requirePasscodeFor(() => {
        chrome.storage.sync.set({ 
          blocked: [], 
          customBlocked: [], 
          blockingActive: false 
        }, () => {
          currentBlocks.popular = [];
          currentBlocks.custom = [];
          
          // Force clear all blocking rules
          updateBlockingRules().then(() => {
            showSetupPage();
            showStatus("All blocking disabled");
            // Clear the setup form
            checkboxes.forEach(cb => cb.checked = false);
            displayCustomSites([]);
          }).catch((error) => {
            console.error('Failed to clear all rules:', error);
            showSetupPage();
            showStatus("Disabled (with potential cleanup error)");
          });
        });
      });
    });
  }

  // Custom sites display
  function displayCustomSites(sites) {
    if (!customList) return;
    
    customList.innerHTML = "";
    
    if (sites.length === 0) {
      customList.innerHTML = '<p style="color: #666; font-style: italic;">No custom sites added yet.</p>';
      return;
    }

    sites.forEach(site => {
      const div = document.createElement("div");
      div.className = "custom-site-item";
      div.innerHTML = `
        <span>${site}</span>
        <button class="remove-btn" data-site="${site}">×</button>
      `;
      customList.appendChild(div);
    });

    // Add remove functionality
    document.querySelectorAll(".remove-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const siteToRemove = btn.dataset.site;
        chrome.storage.sync.get("customBlocked", (data) => {
          const customBlocked = data.customBlocked || [];
          const updated = customBlocked.filter(s => s !== siteToRemove);
          chrome.storage.sync.set({ customBlocked: updated }, () => {
            displayCustomSites(updated);
            showStatus("Site removed!");
          });
        });
      });
    });
  }

  // Passcode protection
  function requirePasscodeFor(action) {
    if (!isProtectionEnabled) {
      action();
      return;
    }

    showPasscodeModal(action);
  }

  function showPasscodeModal(onSuccess) {
    const modal = document.createElement('div');
    modal.className = 'passcode-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>🔒 Passcode Required</h3>
        <p>Enter the passcode from your email to modify blocked sites:</p>
        <input type="text" id="passcode-input" placeholder="Enter 6-digit passcode" maxlength="6" />
        <div class="modal-buttons">
          <button id="verify-passcode">Verify</button>
          <button id="cancel-passcode">Cancel</button>
          <button id="send-new-passcode">Send New Passcode</button>
        </div>
        <div id="passcode-status"></div>
      </div>
    `;
    
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5); display: flex;
      align-items: center; justify-content: center; z-index: 1000;
    `;
    
    const modalContent = modal.querySelector('.modal-content');
    modalContent.style.cssText = `
      background: white; padding: 20px; border-radius: 8px;
      width: 300px; max-width: 90vw;
    `;

    document.body.appendChild(modal);

    const passcodeInput = modal.querySelector('#passcode-input');``
    const verifyBtn = modal.querySelector('#verify-passcode');
    const cancelBtn = modal.querySelector('#cancel-passcode');
    const sendNewBtn = modal.querySelector('#send-new-passcode');
    const passcodeStatus = modal.querySelector('#passcode-status');

    passcodeInput.focus();

    verifyBtn.addEventListener('click', () => {
      const enteredPasscode = passcodeInput.value.trim();
      if (enteredPasscode.length !== 6) {
        passcodeStatus.textContent = 'Please enter a 6-digit passcode';
        passcodeStatus.style.color = 'red';
        return;
      }

      verifyPasscode(enteredPasscode, (isValid) => {
        if (isValid) {
          document.body.removeChild(modal);
          onSuccess();
        } else {
          passcodeStatus.textContent = 'Invalid or expired passcode';
          passcodeStatus.style.color = 'red';
        }
      });
    });

    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    sendNewBtn.addEventListener('click', () => {
      console.log('Send new passcode button clicked');
      
      sendNewBtn.textContent = 'Sending...';
      sendNewBtn.disabled = true;
      passcodeStatus.textContent = 'Requesting new passcode...';
      passcodeStatus.style.color = '#666';
      
      chrome.runtime.sendMessage({ action: "requestPasscode" }, (response) => {
        console.log('Passcode request response:', response);
        console.log('Runtime error:', chrome.runtime.lastError);
        
        sendNewBtn.textContent = 'Send New Passcode';
        sendNewBtn.disabled = false;
        
        // Check for runtime errors first
        if (chrome.runtime.lastError) {
          console.error('Runtime error occurred:', chrome.runtime.lastError);
          passcodeStatus.textContent = 'Error: ' + chrome.runtime.lastError.message;
          passcodeStatus.style.color = 'red';
          return;
        }
        
        // Check if we got a response at all
        if (!response) {
          console.error('No response received from background script');
          passcodeStatus.textContent = 'Error: No response from background script';
          passcodeStatus.style.color = 'red';
          return;
        }
        
        // Check if the response indicates success
        if (response.success) {
          passcodeStatus.textContent = 'New passcode sent to your email! Check your inbox.';
          passcodeStatus.style.color = 'green';
          passcodeInput.value = ''; // Clear the input for new passcode
        } else {
          const errorMsg = response.error || 'Unknown error occurred';
          console.error('Passcode send failed:', errorMsg);
          passcodeStatus.textContent = 'Failed to send: ' + errorMsg;
          passcodeStatus.style.color = 'red';
        }
      });
    });

    passcodeInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') verifyBtn.click();
    });
  }

  function verifyPasscode(enteredPasscode, callback) {
    chrome.storage.sync.get(['currentPasscode', 'testPasscode'], (data) => {
      const now = Date.now();
      
      if (data.currentPasscode && 
          data.currentPasscode.code === enteredPasscode && 
          data.currentPasscode.expires > now) {
        callback(true);
        return;
      }
      
      if (data.testPasscode && 
          data.testPasscode.code === enteredPasscode && 
          data.testPasscode.expires > now) {
        callback(true);
        return;
      }
      
      callback(false);
    });
  }

  // Update blocking rules
  function updateBlockingRules() {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get(["blocked", "customBlocked", "blockingActive"], (data) => {
        const allSites = data.blockingActive ? 
          [...(data.blocked || []), ...(data.customBlocked || [])] : [];
        
        console.log('Updating blocking rules for sites:', allSites);
        
        chrome.runtime.sendMessage({ 
          action: "updateBlockedSites", 
          sites: allSites 
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Runtime error:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
            return;
          }
          
          if (response && response.success) {
            console.log('Successfully updated blocking rules');
            resolve();
          } else {
            console.error('Failed to update blocking rules:', response?.error);
            reject(new Error(response?.error || 'Unknown error'));
          }
        });
      });
    });
  }

  // Show status message
  function showStatus(message) {
    statusDiv.textContent = message;
    statusDiv.style.color = "#4CAF50";
    setTimeout(() => {
      statusDiv.textContent = "";
    }, 3000);
  }

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
      if (changes.protectionEmail || changes.emailjsConfig) {
        checkProtectionStatus();
      }
      if (changes.blockingActive) {
        loadCurrentState();
      }
    }
  });
});