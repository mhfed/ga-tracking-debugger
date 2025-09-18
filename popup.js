// popup.js

function isSupportedUrl(url = '') {
  return /^(https?:|file:)/i.test(url);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToActive(type, payload) {
  const tab = await getActiveTab();
  if (!tab?.id || !isSupportedUrl(tab.url || '')) return false;

  try {
    await chrome.tabs.sendMessage(tab.id, { type, payload });
    return true;
  } catch (err) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
      await chrome.tabs.sendMessage(tab.id, { type, payload });
      return true;
    } catch (e2) {
      console.warn('[GA Debugger] sendToActive failed:', e2);
      return false;
    }
  }
}

async function getState() {
  return new Promise(resolve => {
    chrome.storage.local.get('gaDebugger', ({ gaDebugger }) => {
      resolve(gaDebugger || { 
        enabled:false, 
        color:'#ef4444', 
        borderWidth:2, 
        highlightBgColor: '#ef4444', 
        highlightBgOpacity: 0.2,
        showAll: false,
        badgeBgColor: '#ffc107', 
        badgeBgOpacity: 0.9, 
        badgeColor: '#d32f2f',
        fontSize:10, 
      });
    });
  });
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => { clearTimeout(timeout); func(...args); };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}


(async function init(){
  // DOM Elements
  const elements = {
    enabled: document.getElementById('enabled'),
    settingsPanel: document.getElementById('settings-panel'),
    color: document.getElementById('color'),
    borderWidth: document.getElementById('borderWidth'),
    highlightBgColor: document.getElementById('highlightBgColor'),
    highlightBgOpacity: document.getElementById('highlightBgOpacity'),
    showAll: document.getElementById('showAll'),
    badgeBgColor: document.getElementById('badgeBgColor'),
    badgeBgOpacity: document.getElementById('badgeBgOpacity'),
    badgeColor: document.getElementById('badgeColor'),
    fontSize: document.getElementById('fontSize'),
  };

  // Initial State
  const state = await getState();
  render(state);

  // Event Listeners
  elements.enabled.onchange = async () => {
    const s = await getState();
    render({ ...s, enabled: elements.enabled.checked });
    sendToActive('TOGGLE');
  };

  const debouncedApply = debounce(async () => {
    const payload = {
      ...(await getState()),
      color: elements.color.value,
      borderWidth: Number(elements.borderWidth.value),
      highlightBgColor: elements.highlightBgColor.value,
      highlightBgOpacity: Number(elements.highlightBgOpacity.value),
      showAll: elements.showAll.checked,
      badgeBgColor: elements.badgeBgColor.value,
      badgeBgOpacity: Number(elements.badgeBgOpacity.value),
      badgeColor: elements.badgeColor.value,
      fontSize: Number(elements.fontSize.value),
    };
    sendToActive('APPLY', payload);
  }, 200);

  Object.values(elements).forEach(el => {
    if (el.id !== 'enabled') {
      el.addEventListener('input', debouncedApply);
    }
  });

  // Render function
  function render(s){
    elements.enabled.checked = s.enabled;
    elements.settingsPanel.classList.toggle('hidden', !s.enabled);
    
    elements.color.value = s.color;
    elements.borderWidth.value = s.borderWidth;
    elements.highlightBgColor.value = s.highlightBgColor;
    elements.highlightBgOpacity.value = s.highlightBgOpacity;
    elements.showAll.checked = s.showAll;
    elements.badgeBgColor.value = s.badgeBgColor;
    elements.badgeBgOpacity.value = s.badgeBgOpacity;
    elements.badgeColor.value = s.badgeColor;
    elements.fontSize.value = s.fontSize;
  }
})();
