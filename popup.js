document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("block-form");
  const checkboxes = form.querySelectorAll("input[type='checkbox']");
  const statusDiv = document.getElementById("status");
  const customInput = document.getElementById("custom-site");
  const addButton = document.getElementById("add-custom");
  const customList = document.getElementById("custom-list");
  const settingsLink = document.getElementById("settings-link");
  
  // Passcode protection elements
  const lockedOverlay = document.getElementById("locked-overlay");
  const mainContent = document.getElementById("main-content");

  let isProtectionEnabled = false;

  // Check if protection is enabled
  checkProtectionStatus();

  // Settings link functionality
  settingsLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
  });

  // Load saved data
  chrome.storage.sync.get(["blocked", "customBlocked"], (data) => {
    const blockedSites = data.blocked || [];
    const customBlockedSites = data.customBlocked || [];
    
    // Load predefined checkboxes
    checkboxes.forEach(cb => {
      if (blockedSites.includes(cb.value)) {
        cb.checked = true;
      }
    });
    
    // Load custom blocked sites
    displayCustomSites(customBlockedSites);
  });

  // Check if passcode protection is enabled
  function checkProtectionStatus() {
    chrome.storage.sync.get(['protectionEmail', 'emailjsConfig'], (data) => {
      isProtectionEnabled = !!(data.protectionEmail && 
                              data.emailjsConfig && 
                              data.emailjsConfig.serviceId && 
                              data.emailjsConfig.templateId && 
                              data.emailjsConfig.publicKey);
      
      if (isProtectionEnabled) {
        // Update UI to show protection is active
        updateUIForProtection();
      }
    });
  }

  function updateUIForProtection() {
    // Add a visual indicator that protection is enabled
    const protectionIndicator = document.createElement('div');
    protectionIndicator.className = 'protection-indicator';
    protectionIndicator.innerHTML = '🔒 Email protection enabled';
    protectionIndicator.style.cssText = `
      background: #e8f5e8;
      color: #2d5a2d;
      padding: 8px;
      border-radius: 4px;
      margin-bottom: 15px;
      font-size: 12px;
      text-align: center;
      border: 1px solid #a3d4a3;
    `;
    
    const mainContent = document.getElementById('main-content');
    mainContent.insertBefore(protectionIndicator, mainContent.firstChild);

    // Update settings link text
    settingsLink.textContent = '⚙️ Manage Email Protection';
  }

  // Modified functions to require passcode when protection is enabled
  function requirePasscodeFor(action) {
    if (!isProtectionEnabled) {
      action();
      return;
    }

    // Show passcode modal
    showPasscodeModal(action);
  }

  function showPasscodeModal(onSuccess) {
    // Create modal overlay
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
    
    // Add modal styles
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    `;
    
    const modalContent = modal.querySelector('.modal-content');
    modalContent.style.cssText = `
      background: white;
      padding: 20px;
      border-radius: 8px;
      width: 300px;
      max-width: 90vw;
    `;

    document.body.appendChild(modal);

    // Modal event listeners
    const passcodeInput = modal.querySelector('#passcode-input');
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
      sendNewBtn.textContent = 'Sending...';
      sendNewBtn.disabled = true;
      
      // Request new passcode from settings.js
      chrome.runtime.sendMessage({ action: "requestPasscode" }, (response) => {
        if (response && response.success) {
          passcodeStatus.textContent = 'New passcode sent to your email!';
          passcodeStatus.style.color = 'green';
        } else {
          passcodeStatus.textContent = 'Failed to send passcode. Check settings.';
          passcodeStatus.style.color = 'red';
        }
        sendNewBtn.textContent = 'Send New Passcode';
        sendNewBtn.disabled = false;
      });
    });

    // Allow Enter key to verify
    passcodeInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        verifyBtn.click();
      }
    });
  }

  function verifyPasscode(enteredPasscode, callback) {
    chrome.storage.sync.get(['currentPasscode', 'testPasscode'], (data) => {
      const now = Date.now();
      
      // Check current passcode
      if (data.currentPasscode && 
          data.currentPasscode.code === enteredPasscode && 
          data.currentPasscode.expires > now) {
        callback(true);
        return;
      }
      
      // Check test passcode
      if (data.testPasscode && 
          data.testPasscode.code === enteredPasscode && 
          data.testPasscode.expires > now) {
        callback(true);
        return;
      }
      
      callback(false);
    });
  }

  // Modified add custom site with passcode protection
  addButton.addEventListener("click", () => {
    requirePasscodeFor(() => {
      const site = customInput.value.trim();
      if (site) {
        chrome.storage.sync.get("customBlocked", (data) => {
          const customBlocked = data.customBlocked || [];
          if (!customBlocked.includes(site)) {
            customBlocked.push(site);
            chrome.storage.sync.set({ customBlocked }, () => {
              displayCustomSites(customBlocked);
              updateBlockingRules();
              customInput.value = "";
              showStatus("Custom site added!");
            });
          }
        });
      }
    });
  });

  // Allow Enter key to add custom site
  customInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      addButton.click();
    }
  });

  // Modified form submit with passcode protection
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    
    requirePasscodeFor(() => {
      const selected = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);

      chrome.storage.sync.set({ blocked: selected }, () => {
        updateBlockingRules();
        showStatus("Sites saved!");
      });
    });
  });

  // Display custom sites with remove buttons (also protected)
  function displayCustomSites(sites) {
    customList.innerHTML = "";
    sites.forEach(site => {
      const div = document.createElement("div");
      div.className = "custom-site-item";
      div.innerHTML = `
        <span>${site}</span>
        <button class="remove-btn" data-site="${site}">×</button>
      `;
      customList.appendChild(div);
    });

    // Add remove functionality with passcode protection
    document.querySelectorAll(".remove-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const siteToRemove = btn.dataset.site;
        
        requirePasscodeFor(() => {
          chrome.storage.sync.get("customBlocked", (data) => {
            const customBlocked = data.customBlocked || [];
            const updated = customBlocked.filter(s => s !== siteToRemove);
            chrome.storage.sync.set({ customBlocked: updated }, () => {
              displayCustomSites(updated);
              updateBlockingRules();
              showStatus("Site removed!");
            });
          });
        });
      });
    });
  }

  // Update blocking rules
  function updateBlockingRules() {
    chrome.storage.sync.get(["blocked", "customBlocked"], (data) => {
      const allSites = [...(data.blocked || []), ...(data.customBlocked || [])];
      chrome.runtime.sendMessage({ action: "updateBlockedSites", sites: allSites });
    });
  }

  // Show status message
  function showStatus(message) {
    statusDiv.textContent = message;
    setTimeout(() => statusDiv.textContent = "", 2000);
  }

  // Listen for protection status changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && (changes.protectionEmail || changes.emailjsConfig)) {
      checkProtectionStatus();
    }
  });
});