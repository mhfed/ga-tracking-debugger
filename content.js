// Globals
let isDebuggerActive = false;
let currentSettings = defaults();
const elementDataMap = new Map();
let domObserver = null;

(async function init() {
  currentSettings = await getState();
  applySettings(currentSettings, true);
})();

function applySettings(opts, isInitial = false) {
  currentSettings = opts;
  const html = document.documentElement;

  // Always apply CSS variables
  const style = html.style;
  style.setProperty('--ga-border-color', opts.color);
  style.setProperty('--ga-badge-bg', hexToRgba(opts.badgeBgColor, opts.badgeBgOpacity));
  style.setProperty('--ga-badge-color', opts.badgeColor);
  style.setProperty('--ga-font-size', opts.fontSize + 'px');
  style.setProperty('--ga-outline-width', opts.borderWidth + 'px');

  if (isInitial && !opts.enabled) return;

  if (opts.enabled) {
    html.setAttribute('data-ga-debug', '1');
    if (!isDebuggerActive) {
      window.addEventListener('resize', debouncedUpdateBadges);
      window.addEventListener('scroll', debouncedUpdateBadges, true);
      startObserver();
      isDebuggerActive = true;
    }
  } else {
    html.removeAttribute('data-ga-debug');
    if (isDebuggerActive) {
      window.removeEventListener('resize', debouncedUpdateBadges);
      window.removeEventListener('scroll', debouncedUpdateBadges, true);
      stopObserver();
      isDebuggerActive = false;
    }
  }

  html.classList.toggle('ga-hover-only', !!opts.hoverOnly);
  updateBadges();
}

function updateBadges() {
  destroyBadges();
  if (!currentSettings.enabled) return;

  const trackedElements = document.querySelectorAll('[data-ga-debug="1"] [ga-tracking-value]');
  trackedElements.forEach(el => {
    const value = el.getAttribute('ga-tracking-value');
    if (!value) return;

    const badge = document.createElement('div');
    badge.className = 'ga-debugger-badge';
    badge.innerHTML = `<span>${value.replace(/</g, '&lt;')}</span><button class="ga-debugger-badge__copy">Copy</button>`;

    badge.querySelector('.ga-debugger-badge__copy').onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(value).then(() => {
        badge.querySelector('.ga-debugger-badge__copy').textContent = 'Copied!';
        setTimeout(() => { badge.querySelector('.ga-debugger-badge__copy').textContent = 'Copy'; }, 1500);
      });
    };
    
    document.body.appendChild(badge);
    
    const data = { badge, hideTimer: null };
    elementDataMap.set(el, data);
    repositionBadge(el, badge);

    if (currentSettings.hoverOnly) {
      badge.style.display = 'none';

      const show = () => {
        clearTimeout(data.hideTimer);
        badge.style.display = 'inline-flex';
        repositionBadge(el, badge);
      };

      const hide = () => {
        data.hideTimer = setTimeout(() => {
          badge.style.display = 'none';
        }, 100);
      };

      el.addEventListener('mouseenter', show);
      el.addEventListener('mouseleave', hide);
      badge.addEventListener('mouseenter', show);
      badge.addEventListener('mouseleave', hide);
      
      data.listeners = { show, hide };
    } else {
      badge.style.display = 'inline-flex';
    }
  });
}

function repositionBadge(el, badge) {
  const rect = el.getBoundingClientRect();
  const badgeHeight = badge.offsetHeight;
  const badgeWidth = badge.offsetWidth;

  // Center the badge within the element
  let top = rect.top + window.scrollY + (rect.height - badgeHeight) / 2;
  let left = rect.left + window.scrollX + (rect.width - badgeWidth) / 2;
  
  badge.style.left = `${left}px`;
  badge.style.top = `${top}px`;
}

function startObserver() {
  if (domObserver) return;
  domObserver = new MutationObserver(debouncedUpdateBadges);
  domObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function stopObserver() {
  if (domObserver) {
    domObserver.disconnect();
    domObserver = null;
  }
}

function destroyBadges() {
  for (const [el, data] of elementDataMap.entries()) {
    if (data.listeners) {
      el.removeEventListener('mouseenter', data.listeners.show);
      el.removeEventListener('mouseleave', data.listeners.hide);
      data.badge.removeEventListener('mouseenter', data.listeners.show);
      data.badge.removeEventListener('mouseleave', data.listeners.hide);
    }
    data.badge.remove();
  }
  elementDataMap.clear();
}

chrome.runtime.onMessage.addListener(async (msg) => {
  const s = await getState();
  let next;
  if (msg.type === 'TOGGLE') {
    next = { ...s, enabled: !s.enabled };
  } else if (msg.type === 'APPLY') {
    next = { ...s, ...msg.payload };
  } else if (msg.type === 'REQUEST_STATE') {
    chrome.runtime.sendMessage({ type: 'STATE', payload: s });
    return;
  }
  
  if (next) {
    await chrome.storage.local.set({ gaDebugger: next });
    applySettings(next);
  }
});

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => { clearTimeout(timeout); func(...args); };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
const debouncedUpdateBadges = debounce(updateBadges, 150);

function hexToRgba(hex = '#000000', alpha = 1) {
  if (!/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
    return `rgba(0,0,0,${alpha})`;
  }
  let c = hex.substring(1).split('');
  if (c.length === 3) {
    c = [c[0], c[0], c[1], c[1], c[2], c[2]];
  }
  c = '0x' + c.join('');
  return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${alpha})`;
}

function defaults() {
  return { enabled: false, color: '#ef4444', fontSize: 10, borderWidth: 2, hoverOnly: false, badgeBgColor: '#ffc107', badgeBgOpacity: 0.9, badgeColor: '#d32f2f' };
}

async function getState() {
  const { gaDebugger = defaults() } = await chrome.storage.local.get('gaDebugger');
  return { ...defaults(), ...gaDebugger };
}

