document.addEventListener('DOMContentLoaded', () => {
  const setupSection = document.getElementById('setup-section');
  const configuredSection = document.getElementById('configured-section');
  const emailjsSetupSection = document.getElementById('emailjs-setup-section');
  const emailInput = document.getElementById('email-input');
  const setupBtn = document.getElementById('setup-btn');
  const testEmailBtn = document.getElementById('test-email-btn');
  const changeEmailBtn = document.getElementById('change-email-btn');
  const saveConfigBtn = document.getElementById('save-config-btn');
  const currentEmailDiv = document.getElementById('current-email');
  const statusDiv = document.getElementById('status-message');
  const testPasscodeSection = document.getElementById('test-passcode-section');
  const testPasscodeDiv = document.getElementById('test-passcode');

  // EmailJS configuration inputs
  const serviceIdInput = document.getElementById('service-id');
  const templateIdInput = document.getElementById('template-id');
  const publicKeyInput = document.getElementById('public-key');

  // Load existing configuration
  loadSettings();

  // Event listeners
  setupBtn.addEventListener('click', setupProtection);
  testEmailBtn.addEventListener('click', sendTestPasscode);
  changeEmailBtn.addEventListener('click', changeEmail);
  saveConfigBtn.addEventListener('click', saveEmailJSConfig);

  function loadSettings() {
    chrome.storage.sync.get(['protectionEmail', 'emailjsConfig'], (data) => {
      if (data.emailjsConfig) {
        // Load EmailJS config
        serviceIdInput.value = data.emailjsConfig.serviceId || '';
        templateIdInput.value = data.emailjsConfig.templateId || '';
        publicKeyInput.value = data.emailjsConfig.publicKey || '';
      }

      if (data.protectionEmail && data.emailjsConfig && 
          data.emailjsConfig.serviceId && data.emailjsConfig.templateId && data.emailjsConfig.publicKey) {
        showConfiguredSection(data.protectionEmail);
      } else if (data.protectionEmail) {
        // Email set but EmailJS not configured
        showSetupSection();
        showStatus('Please configure EmailJS settings first', 'info');
      } else {
        showSetupSection();
      }
    });
  }

  function saveEmailJSConfig() {
    const serviceId = serviceIdInput.value.trim();
    const templateId = templateIdInput.value.trim();
    const publicKey = publicKeyInput.value.trim();

    if (!serviceId || !templateId || !publicKey) {
      showStatus('Please fill in all EmailJS configuration fields', 'error');
      return;
    }

    const emailjsConfig = {
      serviceId,
      templateId,
      publicKey
    };

    chrome.storage.sync.set({ emailjsConfig }, () => {
      // Check if email is already configured
      chrome.storage.sync.get(['protectionEmail'], (data) => {
        if (data.protectionEmail) {
          showConfiguredSection(data.protectionEmail);
        }
      });
    });
  }

  function showSetupSection() {
    setupSection.classList.remove('hidden');
    configuredSection.classList.add('hidden');
    emailjsSetupSection.classList.remove('hidden');
  }

  function showConfiguredSection(email) {
    setupSection.classList.add('hidden');
    configuredSection.classList.remove('hidden');
    emailjsSetupSection.classList.add('hidden');
    currentEmailDiv.textContent = email;
  }

  function setupProtection() {
    const email = emailInput.value.trim();
    if (!isValidEmail(email)) {
      showStatus('Please enter a valid email address', 'error');
      return;
    }

    // Check if EmailJS is configured
    chrome.storage.sync.get(['emailjsConfig'], (data) => {
      if (!data.emailjsConfig || !data.emailjsConfig.serviceId || !data.emailjsConfig.templateId || !data.emailjsConfig.publicKey) {
        showStatus('Please configure EmailJS settings first', 'error');
        return;
      }

      chrome.storage.sync.set({ protectionEmail: email }, () => {
        showStatus('Protection setup complete! You can now test the system.', 'success');
        showConfiguredSection(email);
      });
    });
  }

  function sendTestPasscode() {
    generateAndSendPasscode(true);
  }

  function changeEmail() {
    chrome.storage.sync.remove(['protectionEmail'], () => {
      emailInput.value = '';
      testPasscodeSection.classList.add('hidden');
      showSetupSection();
      showStatus('Email protection reset. Please setup again.', 'info');
    });
  }

  function generateAndSendPasscode(isTest = false) {
    const passcode = generatePasscode();
    const expiryTime = Date.now() + (10 * 60 * 1000); // 10 minutes

    chrome.storage.sync.get(['protectionEmail', 'emailjsConfig'], (data) => {
      if (!data.protectionEmail) {
        showStatus('No email configured for protection', 'error');
        return;
      }

      if (!data.emailjsConfig) {
        showStatus('EmailJS not configured', 'error');
        return;
      }

      // Store the passcode with expiry
      const storageKey = isTest ? 'testPasscode' : 'currentPasscode';
      chrome.storage.sync.set({
        [storageKey]: {
          code: passcode,
          expires: expiryTime
        }
      });

      // Disable test button while sending
      if (isTest) {
        testEmailBtn.disabled = true;
        testEmailBtn.textContent = 'Sending...';
      }

      // Send email using EmailJS
      sendEmail(data.protectionEmail, passcode, isTest, data.emailjsConfig)
        .then(() => {
          if (isTest) {
            testPasscodeDiv.textContent = passcode;
            testPasscodeSection.classList.remove('hidden');
            showStatus('Test passcode sent successfully! Check your email.', 'success');
          } else {
            showStatus('Passcode sent to your email!', 'success');
          }
        })
        .catch((error) => {
          console.error('Email send error:', error);
          showStatus(`Failed to send email: ${error.text || error.message || 'Unknown error'}`, 'error');
        })
        .finally(() => {
          if (isTest) {
            testEmailBtn.disabled = false;
            testEmailBtn.textContent = 'Send Test Passcode';
          }
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

  async function sendEmail(to, passcode, isTest, config) {
  const subject = isTest ? 'Focus Blocker - Test Passcode' : 'Focus Blocker - Unblock Passcode';

  const templateParams = {
    to_email: to,
    subject: subject,
    passcode: passcode,
    message: isTest
      ? `Hello!\n\nYour Focus Blocker test passcode is: ${passcode}\n\nThis passcode will expire in 10 minutes.\n\nThis is a test email to verify your setup is working correctly.\n\nStay productive!\nFocus Blocker Extension`
      : `Hello!\n\nYour Focus Blocker passcode is: ${passcode}\n\nThis passcode will expire in 10 minutes.\n\nUse this code to modify your blocked sites list. Remember - you requested this to help stay focused!\n\nStay productive!\nFocus Blocker Extension`
  };

  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: config.serviceId,
      template_id: config.templateId,
      user_id: config.publicKey,
      template_params: templateParams
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`EmailJS API error: ${response.status} - ${errText}`);
  }

  return true;
}


  function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    setTimeout(() => {
      statusDiv.textContent = '';
      statusDiv.className = '';
    }, 5000);
  }

  // Expose function for popup to use
  window.generateAndSendPasscode = generateAndSendPasscode;
});