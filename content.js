// ====================================================================================
// GA Tracking Debugger - Content Script (v3 - Refactored for Stability)
// ====================================================================================

// --- Globals ---
let isDebuggerActive = false;
let currentSettings = defaults();
let domObserver = null;
let singleBadge = null;
let hideBadgeTimer = null;
const trackedElements = new Map(); // Stores { overlay, badge, visualTarget }

// --- Utility Functions ---
function debounce(func, wait) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}
const debouncedUpdate = debounce(update, 150);

// --- Initialization ---
(async function init() {
  currentSettings = await getState();
  // Apply initial settings once the page is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applySettings(currentSettings));
  } else {
    applySettings(currentSettings);
  }
})();


// --- Core Logic ---
function applySettings(opts) {
  currentSettings = opts;
  updateCssVariables(opts);
  
  // Always stop first to ensure a clean, predictable state
  stop(); 
  
  // If the new settings have debugging enabled, start the required services
  if (currentSettings.enabled) {
    start();
  }
}

function start() {
    if (isDebuggerActive) return; // Safeguard
    isDebuggerActive = true;
    document.documentElement.setAttribute('data-ga-debug', '1');

    // Setup listeners
    window.addEventListener('scroll', debouncedUpdate, true);
    window.addEventListener('resize', debouncedUpdate, true);
    domObserver = new MutationObserver(debouncedUpdate);
    domObserver.observe(document.body, { childList: true, subtree: true, attributes: false });
    
    // Setup mode-specific logic
    if (!currentSettings.showAll) {
        createSingleBadge();
        document.addEventListener('mouseover', handleMouseOver);
    }

    // Initial render
    update();
}

function stop() {
    isDebuggerActive = false;
    document.documentElement.removeAttribute('data-ga-debug');
    
    // Remove all listeners
    document.removeEventListener('mouseover', handleMouseOver);
    window.removeEventListener('scroll', debouncedUpdate, true);
    window.removeEventListener('resize', debouncedUpdate, true);
    domObserver?.disconnect();
    domObserver = null;

    // Destroy all DOM elements
    destroySingleBadge();
    clearAllTrackedElements();
}

function update() {
    if (!isDebuggerActive) return;

    const elementsOnPage = new Set(document.querySelectorAll('[ga-tracking-value]'));

    // 1. Cleanup: Remove data/elements for items no longer on the page
    for (const el of trackedElements.keys()) {
        if (!elementsOnPage.has(el)) {
            const data = trackedElements.get(el);
            data.overlay?.remove();
            data.badge?.remove();
            trackedElements.delete(el);
        }
    }

    // 2. Add or Update: Process all tracked elements currently visible
    elementsOnPage.forEach(el => {
        el.classList.add('ga-debugger-highlight'); // Add marker for hover mode
        let data = trackedElements.get(el) || {};
        
        const visualTarget = findFirstVisibleChild(el) || el;
        data.visualTarget = visualTarget;

        // Create or update overlay
        if (!data.overlay) {
            data.overlay = document.createElement('div');
            data.overlay.className = 'ga-debugger-overlay';
            data.overlay.style.pointerEvents = 'none'; 
            document.body.appendChild(data.overlay);
        }
        positionOverlay(data.overlay, visualTarget);

        // Create or update badge (only in showAll mode)
        if (currentSettings.showAll) {
            if (!data.badge) {
                data.badge = createBadgeElement(el);
                document.body.appendChild(data.badge);
            }
            positionBadge(data.badge, visualTarget);
        } else {
            // Ensure multi-mode badges are removed if we switched modes
            data.badge?.remove();
            data.badge = null;
        }

        trackedElements.set(el, data);
    });
}


// --- Element Creation & Positioning ---

function createBadgeElement(el) {
    const value = el.getAttribute('ga-tracking-value');
    const prefix = getDevicePrefix();
    const badge = document.createElement('div');
    badge.className = 'ga-debugger-badge';
    badge.innerHTML = `<span>${prefix}${value?.replace(/</g, '&lt;') || ''}</span><button class="ga-debugger-badge__copy">Copy</button>`;
    
    badge.querySelector('.ga-debugger-badge__copy').onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value);
        const btn = e.currentTarget;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    };

    if (currentSettings.showAll) {
        badge.classList.add('visible');
    }
    return badge;
}

function positionOverlay(overlay, target) {
    const rect = target.getBoundingClientRect();
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.top = `${rect.top + window.scrollY}px`;
    overlay.style.left = `${rect.left + window.scrollX}px`;
}

function positionBadge(badge, target) {
    const rect = target.getBoundingClientRect();
    badge.style.top = `${rect.top + window.scrollY + (rect.height - badge.offsetHeight) / 2}px`;
    badge.style.left = `${rect.left + window.scrollX + (rect.width - badge.offsetWidth) / 2}px`;
}

function clearAllTrackedElements() {
    for (const data of trackedElements.values()) {
        data.overlay?.remove();
        data.badge?.remove();
    }
    trackedElements.clear();
    // Also clean up any stray highlight classes
    document.querySelectorAll('.ga-debugger-highlight').forEach(el => el.classList.remove('ga-debugger-highlight'));
}

// --- Single Badge (Hover) Mode Specifics ---

function createSingleBadge() {
    if (singleBadge) return;
    singleBadge = createBadgeElement(document.createElement('div')); // Create with dummy element
    document.body.appendChild(singleBadge);
    
    singleBadge.addEventListener('mouseenter', () => clearTimeout(hideBadgeTimer));
    singleBadge.addEventListener('mouseleave', hideSingleBadge);
}

function destroySingleBadge() {
    singleBadge?.remove();
    singleBadge = null;
}

function handleMouseOver(e) {
    const target = e.target.closest('.ga-debugger-highlight');
    clearTimeout(hideBadgeTimer);

    if (target) {
        updateSingleBadgeContent(target);
        const visualTarget = trackedElements.get(target)?.visualTarget || findFirstVisibleChild(target) || target;
        positionBadge(singleBadge, visualTarget);
        singleBadge.classList.add('visible');
    } else if (singleBadge && !singleBadge.contains(e.target)) {
        hideSingleBadge();
    }
}

function updateSingleBadgeContent(el) {
    if (!singleBadge) return;
    const value = el.getAttribute('ga-tracking-value');
    const prefix = getDevicePrefix();
    singleBadge.querySelector('span').innerHTML = `${prefix}${value.replace(/</g, '&lt;')}`;
    singleBadge.querySelector('button').onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value);
        const btn = e.currentTarget;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    };
}

function hideSingleBadge() {
    hideBadgeTimer = setTimeout(() => {
        singleBadge?.classList.remove('visible');
    }, 100);
}


// --- Message Handling & Helpers ---

chrome.runtime.onMessage.addListener(async (msg) => {
  let s = await getState();
  let next = s;
  if (msg.type === 'TOGGLE') next = { ...s, enabled: !s.enabled };
  if (msg.type === 'APPLY') next = { ...s, ...msg.payload };
  await chrome.storage.local.set({ gaDebugger: next });
  applySettings(next);
});

function updateCssVariables(opts) {
  const style = document.documentElement.style;
  style.setProperty('--ga-border-color', opts.color);
  style.setProperty('--ga-outline-width', opts.borderWidth + 'px');
  style.setProperty('--ga-highlight-bg', hexToRgba(opts.highlightBgColor, opts.highlightBgOpacity));
  style.setProperty('--ga-badge-bg', hexToRgba(opts.badgeBgColor, opts.badgeBgOpacity));
  style.setProperty('--ga-badge-color', opts.badgeColor);
  style.setProperty('--ga-font-size', opts.fontSize + 'px');
}

function findFirstVisibleChild(element) {
    if (element.offsetWidth > 0 || element.offsetHeight > 0) return element;
    const children = element.querySelectorAll('*');
    for (const child of children) {
        if ((child.offsetWidth > 0 || child.offsetHeight > 0) && !['SCRIPT', 'STYLE', 'META', 'LINK'].includes(child.tagName)) {
            return child;
        }
    }
    return null;
}

function getDevicePrefix() {
    const breakpoint = 768; 
    return window.innerWidth < breakpoint ? "mb" : "";
}

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

