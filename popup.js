document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("block-form"); // Fixed: was "site-form"
  const checkboxes = form.querySelectorAll("input[type='checkbox']");
  const statusDiv = document.getElementById("status");

  // Load saved data
  chrome.storage.sync.get("blocked", (data) => {
    const blockedSites = data.blocked || [];
    checkboxes.forEach(cb => {
      if (blockedSites.includes(cb.value)) {
        cb.checked = true;
      }
    });
  });

  // Save selected options
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    
    const selected = Array.from(checkboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    chrome.storage.sync.set({ blocked: selected }, () => {
      statusDiv.textContent = "Sites saved!";
      // Update the background script with new blocked sites
      chrome.runtime.sendMessage({ action: "updateBlockedSites", sites: selected });
      setTimeout(() => statusDiv.textContent = "", 2000);
    });
  });
});