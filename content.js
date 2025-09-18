// Globals
let isDebuggerActive = false;
let globalBadge = null;
let hideTimer = null;
let currentTarget = null;
let domObserver = null;

(async function init() {
  const settings = await getState();
  applySettings(settings, true);
})();

function applySettings(opts, isInitial = false) {
  const html = document.documentElement;
  updateCssVariables(opts);

  if (isInitial && !opts.enabled) return;
  
  if (opts.enabled) {
    html.setAttribute('data-ga-debug', '1');
    if (!isDebuggerActive) {
      createGlobalBadge();
      startEventListeners();
      isDebuggerActive = true;
    }
    scanAndHighlight();
  } else {
    html.removeAttribute('data-ga-debug');
    if (isDebuggerActive) {
      destroyGlobalBadge();
      stopEventListeners();
      isDebuggerActive = false;
    }
    unhighlightAll();
  }
}

function updateCssVariables(opts) {
  const style = document.documentElement.style;
  style.setProperty('--ga-border-color', opts.color);
  style.setProperty('--ga-badge-bg', hexToRgba(opts.badgeBgColor, opts.badgeBgOpacity));
  style.setProperty('--ga-badge-color', opts.badgeColor);
  style.setProperty('--ga-font-size', opts.fontSize + 'px');
  style.setProperty('--ga-outline-width', opts.borderWidth + 'px');
}

function createGlobalBadge() {
  if (globalBadge) return;
  globalBadge = document.createElement('div');
  globalBadge.className = 'ga-debugger-badge';
  document.body.appendChild(globalBadge);
  
  globalBadge.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  globalBadge.addEventListener('mouseleave', hideBadge);
}

function destroyGlobalBadge() {
  if (globalBadge) {
    globalBadge.remove();
    globalBadge = null;
  }
}

function startEventListeners() {
  document.addEventListener('mouseover', handleMouseOver);
  window.addEventListener('scroll', handleScroll, true);
  
  domObserver = new MutationObserver(debouncedScanAndHighlight);
  domObserver.observe(document.body, { childList: true, subtree: true });
}

function stopEventListeners() {
  document.removeEventListener('mouseover', handleMouseOver);
  window.removeEventListener('scroll', handleScroll, true);
  if (domObserver) {
    domObserver.disconnect();
    domObserver = null;
  }
}

function handleMouseOver(e) {
  const target = e.target.closest('[ga-tracking-value]');
  
  clearTimeout(hideTimer);

  if (target) {
    currentTarget = target;
    showBadgeFor(target);
  } else if (!globalBadge.contains(e.target)) {
    hideBadge();
  }
}

function handleScroll() {
    if (currentTarget && globalBadge.classList.contains('visible')) {
        repositionBadge(currentTarget);
    }
}

function showBadgeFor(el) {
  const value = el.getAttribute('ga-tracking-value');
  globalBadge.innerHTML = `<span>${value.replace(/</g, '&lt;')}</span><button class="ga-debugger-badge__copy">Copy</button>`;
  
  globalBadge.querySelector('.ga-debugger-badge__copy').onclick = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    globalBadge.querySelector('.ga-debugger-badge__copy').textContent = 'Copied!';
    setTimeout(() => { globalBadge.querySelector('.ga-debugger-badge__copy').textContent = 'Copy'; }, 1500);
  };

  repositionBadge(el);
  globalBadge.classList.add('visible');
}

function hideBadge() {
  hideTimer = setTimeout(() => {
    globalBadge.classList.remove('visible');
    currentTarget = null;
  }, 100);
}

function repositionBadge(el) {
  const rect = el.getBoundingClientRect();
  const badgeHeight = globalBadge.offsetHeight;
  const badgeWidth = globalBadge.offsetWidth;

  let top = rect.top + window.scrollY + (rect.height - badgeHeight) / 2;
  let left = rect.left + window.scrollX + (rect.width - badgeWidth) / 2;
  
  globalBadge.style.top = `${top}px`;
  globalBadge.style.left = `${left}px`;
}

function scanAndHighlight() {
  unhighlightAll(true);
  const trackedElements = document.querySelectorAll('[ga-tracking-value]');
  trackedElements.forEach(el => el.classList.add('ga-debugger-highlight'));
}

function unhighlightAll(keepIfActive = false) {
  document.querySelectorAll('.ga-debugger-highlight').forEach(el => {
    if (keepIfActive && el === currentTarget) return;
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

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => { clearTimeout(timeout); func(...args); };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
const debouncedScanAndHighlight = debounce(scanAndHighlight, 200);

function hexToRgba(hex = '#000000', alpha = 1) {
  if (!/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) return `rgba(0,0,0,${alpha})`;
  let c = hex.substring(1).split('');
  if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
  c = '0x' + c.join('');
  return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${alpha})`;
}

function defaults() {
  return { enabled: false, color: '#ef4444', fontSize: 10, borderWidth: 2, badgeBgColor: '#ffc107', badgeBgOpacity: 0.9, badgeColor: '#d32f2f' };
}

async function getState() {
  const { gaDebugger = defaults() } = await chrome.storage.local.get('gaDebugger');
  return { ...defaults(), ...gaDebugger };
}

