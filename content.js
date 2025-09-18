// Globals
let isDebuggerActive = false;
let currentSettings = defaults();
let domObserver = null;

// --- Utility Functions ---
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => { clearTimeout(timeout); func(...args); };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

const debouncedUpdateAllBadgePositions = debounce(updateAllBadgePositions, 100);
const debouncedScanAndHighlight = debounce(scanAndHighlight, 200);

function getDevicePrefix() {
    const breakpoint = 768; // Common tablet breakpoint
    if (window.innerWidth < breakpoint) {
        return "mb";
    }
    return "";
}

// --- Mode-specific state ---
let globalBadge = null; // For single-badge mode
let hideTimer = null; // For single-badge mode
let currentTarget = null; // For single-badge mode
const elementDataMap = new Map(); // For multi-badge mode

(async function init() {
  currentSettings = await getState();
  applySettings(currentSettings, true);
})();

function applySettings(opts, isInitial = false) {
  const previousSettings = currentSettings;
  currentSettings = opts;

  updateCssVariables(opts);

  if (isInitial && !opts.enabled) return;

  // Cleanup previous state if mode is changing or debugger is turning off
  if (opts.enabled === false || (opts.enabled && previousSettings.showAll !== opts.showAll)) {
    stopEventListeners();
    destroyBadges();
  }
  
  unhighlightAll();
  
  if (opts.enabled) {
    document.documentElement.setAttribute('data-ga-debug', '1');
    if (!isDebuggerActive || previousSettings.showAll !== opts.showAll) {
        startEventListeners();
        createBadges();
    }
    isDebuggerActive = true;
    scanAndHighlight();
  } else {
    document.documentElement.removeAttribute('data-ga-debug');
    isDebuggerActive = false;
  }
}

function updateCssVariables(opts) {
  const style = document.documentElement.style;
  style.setProperty('--ga-border-color', opts.color);
  style.setProperty('--ga-outline-width', opts.borderWidth + 'px');
  style.setProperty('--ga-highlight-bg', hexToRgba(opts.highlightBgColor, opts.highlightBgOpacity));
  style.setProperty('--ga-badge-bg', hexToRgba(opts.badgeBgColor, opts.badgeBgOpacity));
  style.setProperty('--ga-badge-color', opts.badgeColor);
  style.setProperty('--ga-font-size', opts.fontSize + 'px');
}

// --- Badge Management ---

function createBadges() {
    if (currentSettings.showAll) {
        createMultiBadges();
    } else {
        createGlobalBadge();
    }
}

function destroyBadges() {
    destroyGlobalBadge();
    destroyMultiBadges();
}

// --- Single Badge Mode (Hover) ---

function createGlobalBadge() {
  if (globalBadge) return;
  globalBadge = document.createElement('div');
  globalBadge.className = 'ga-debugger-badge';
  document.body.appendChild(globalBadge);
  
  globalBadge.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  globalBadge.addEventListener('mouseleave', hideSingleBadge);
}

function destroyGlobalBadge() {
  if (globalBadge) {
    globalBadge.remove();
    globalBadge = null;
    currentTarget = null;
  }
}

function showSingleBadgeFor(el) {
  if (!globalBadge) return;
  const value = el.getAttribute('ga-tracking-value');
  const prefix = getDevicePrefix();
  globalBadge.innerHTML = `<span>${prefix}${value.replace(/</g, '&lt;')}</span><button class="ga-debugger-badge__copy">Copy</button>`;
  
  globalBadge.querySelector('.ga-debugger-badge__copy').onclick = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    globalBadge.querySelector('.ga-debugger-badge__copy').textContent = 'Copied!';
    setTimeout(() => { if(globalBadge) globalBadge.querySelector('.ga-debugger-badge__copy').textContent = 'Copy'; }, 1500);
  };

  repositionBadge(el, globalBadge);
  globalBadge.classList.add('visible');
}

function hideSingleBadge() {
  hideTimer = setTimeout(() => {
    if(globalBadge) globalBadge.classList.remove('visible');
    currentTarget = null;
  }, 100);
}


// --- Multi Badge Mode (Show All) ---

function createMultiBadges() {
    const trackedElements = document.querySelectorAll('.ga-debugger-highlight');
    trackedElements.forEach(el => {
        if (elementDataMap.has(el)) return; // Already created

        const value = el.getAttribute('ga-tracking-value');
        if (!value) return;

        const badge = document.createElement('div');
        badge.className = 'ga-debugger-badge visible'; // Always visible in this mode
        const prefix = getDevicePrefix();
        badge.innerHTML = `<span>${prefix}${value.replace(/</g, '&lt;')}</span><button class="ga-debugger-badge__copy">Copy</button>`;

        badge.querySelector('.ga-debugger-badge__copy').onclick = (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(value);
            badge.querySelector('.ga-debugger-badge__copy').textContent = 'Copied!';
            setTimeout(() => { badge.querySelector('.ga-debugger-badge__copy').textContent = 'Copy'; }, 1500);
        };
        
        document.body.appendChild(badge);
        elementDataMap.set(el, badge);
        repositionBadge(el, badge);
    });
}

function destroyMultiBadges() {
    for (const badge of elementDataMap.values()) {
        badge.remove();
    }
    elementDataMap.clear();
}

function updateAllBadgePositions() {
    for (const [el, badge] of elementDataMap.entries()) {
        const value = el.getAttribute('ga-tracking-value');
        const prefix = getDevicePrefix();
        const span = badge.querySelector('span');
        if (span) {
            span.textContent = `${prefix}${value.replace(/</g, '&lt;')}`;
        }
        repositionBadge(el, badge);
    }
}

// --- Event Listeners & Common Functions ---

function startEventListeners() {
    if (currentSettings.showAll) {
        window.addEventListener('scroll', debouncedUpdateAllBadgePositions, true);
        window.addEventListener('resize', debouncedUpdateAllBadgePositions, true);
    } else {
        document.addEventListener('mouseover', handleMouseOver);
        window.addEventListener('scroll', handleSingleBadgeScroll, true);
    }
  
    domObserver = new MutationObserver(debouncedScanAndHighlight);
    domObserver.observe(document.body, { childList: true, subtree: true });
}

function stopEventListeners() {
  document.removeEventListener('mouseover', handleMouseOver);
  window.removeEventListener('scroll', handleSingleBadgeScroll, true);
  window.removeEventListener('scroll', debouncedUpdateAllBadgePositions, true);
  window.removeEventListener('resize', debouncedUpdateAllBadgePositions, true);
  if (domObserver) {
    domObserver.disconnect();
    domObserver = null;
  }
}

function handleMouseOver(e) {
  // Guard clause to ensure this only runs in single-badge (hover) mode
  if (currentSettings.showAll) return;

  const target = e.target.closest('.ga-debugger-highlight');
  clearTimeout(hideTimer);

  if (target) {
    currentTarget = target;
    showSingleBadgeFor(target);
  } else if (globalBadge && !globalBadge.contains(e.target)) {
    hideSingleBadge();
  }
}

function handleSingleBadgeScroll() {
    if (currentTarget && globalBadge && globalBadge.classList.contains('visible')) {
        repositionBadge(currentTarget, globalBadge);
    }
}

function repositionBadge(el, badge) {
  const rect = el.getBoundingClientRect();
  const badgeHeight = badge.offsetHeight;
  const badgeWidth = badge.offsetWidth;

  let top = rect.top + window.scrollY + (rect.height - badgeHeight) / 2;
  let left = rect.left + window.scrollX + (rect.width - badgeWidth) / 2;
  
  badge.style.top = `${top}px`;
  badge.style.left = `${left}px`;
}

function scanAndHighlight() {
  const trackedElements = document.querySelectorAll('[ga-tracking-value]');
  trackedElements.forEach(el => el.classList.add('ga-debugger-highlight'));

  if(isDebuggerActive && currentSettings.showAll) {
      // Re-create badges for dynamically added elements in 'show all' mode
      createMultiBadges();
  }
}

function unhighlightAll() {
  document.querySelectorAll('.ga-debugger-highlight').forEach(el => {
    el.classList.remove('ga-debugger-highlight');
  });
}

chrome.runtime.onMessage.addListener(async (msg) => {
  const s = await getState();
  let next = s;
  
  if (msg.type === 'TOGGLE') {
    next = { ...s, enabled: !s.enabled };
  } else if (msg.type === 'APPLY') {
    next = { ...s, ...msg.payload };
  }
  
    await chrome.storage.local.set({ gaDebugger: next });
    applySettings(next);
});

function hexToRgba(hex = '#000000', alpha = 1) {
  if (!/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) return `rgba(0,0,0,${alpha})`;
  let c = hex.substring(1).split('');
  if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
  c = '0x' + c.join('');
  return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${alpha})`;
}

function defaults() {
  return { 
    enabled: false, 
    color: '#ef4444', 
    borderWidth: 2, 
    highlightBgColor: '#ef4444', 
    highlightBgOpacity: 0.2,
    showAll: false,
    badgeBgColor: '#ffc107', 
    badgeBgOpacity: 0.9, 
    badgeColor: '#d32f2f',
    fontSize: 10, 
  };
}

async function getState() {
  const { gaDebugger = defaults() } = await chrome.storage.local.get('gaDebugger');
  return { ...defaults(), ...gaDebugger };
}

