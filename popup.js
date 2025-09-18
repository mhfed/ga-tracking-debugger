// popup.js (bản an toàn, tự inject khi cần, không quăng lỗi Promise)

function isSupportedUrl(url = '') {
  // Chỉ hỗ trợ http(s) và file:// (cần bật "Allow access to file URLs" trong chrome://extensions)
  return /^(https?:|file:)/i.test(url);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function show(msg) {
  // Tạo khu vực hiển thị trạng thái nếu chưa có
  let box = document.getElementById('ga-msg');
  if (!box) {
    box = document.createElement('div');
    box.id = 'ga-msg';
    box.style.cssText = 'margin-top:8px;font-size:12px;color:#444';
    document.body.appendChild(box);
  }
  box.textContent = msg;
}

async function sendToActive(type, payload) {
  const tab = await getActiveTab();
  if (!tab?.id) { show('Không tìm thấy tab đang mở.'); return false; }

  if (!isSupportedUrl(tab.url || '')) {
    show('Trang này không được hỗ trợ (chrome://, chrome web store, PDF viewer, v.v.). Mở một trang http/https rồi thử lại.');
    return false;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type, payload });
    return true;
  } catch (err) {
    // Fallback: content script chưa có -> inject rồi gửi lại
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
      await chrome.tabs.sendMessage(tab.id, { type, payload });
      return true;
    } catch (e2) {
      console.warn('[GA Debugger] sendToActive failed:', e2);
      show('Không thể giao tiếp với trang này. Kiểm tra quyền hoặc reload trang rồi thử lại.');
      return false;
    }
  }
}

async function getState() {
  return new Promise(resolve => {
    chrome.storage.local.get('gaDebugger', ({ gaDebugger }) => {
      resolve(gaDebugger || { enabled:false, color:'#ef4444', fontSize:8, borderWidth:2, hoverOnly:false, badgeBgColor: '#ffc107', badgeBgOpacity: 0.9, badgeColor: '#d32f2f' });
    });
  });
}

(async function init(){
  const $toggle = document.getElementById('toggle');
  const $apply = document.getElementById('apply');
  const $color = document.getElementById('color');
  const $badgeBgColor = document.getElementById('badgeBgColor');
  const $badgeBgOpacity = document.getElementById('badgeBgOpacity');
  const $badgeColor = document.getElementById('badgeColor');
  const $fontSize = document.getElementById('fontSize');
  const $borderWidth = document.getElementById('borderWidth');
  const $hoverOnly = document.getElementById('hoverOnly');

  const state = await getState();
  render(state);

  $toggle.onclick = async () => {
    const ok = await sendToActive('TOGGLE');
    if (ok) {
      const s = await getState();
      render(s);
      show(s.enabled ? 'Đã bật highlight.' : 'Đã tắt highlight.');
    }
  };

  $apply.onclick = async () => {
    const payload = {
      ...(await getState()),
      color: $color.value,
      badgeBgColor: $badgeBgColor.value,
      badgeBgOpacity: Number($badgeBgOpacity.value || 0.5),
      badgeColor: $badgeColor.value,
      fontSize: Number($fontSize.value || 8),
      borderWidth: Number($borderWidth.value || 2),
      hoverOnly: !!$hoverOnly.checked,
    };
    const ok = await sendToActive('APPLY', payload);
    if (ok) {
      show('Đã áp dụng cài đặt.');
    }
  };

  function render(s){
    $toggle.textContent = s.enabled ? 'Disable' : 'Enable';
    $color.value = s.color || '#ef4444';
    $badgeBgColor.value = s.badgeBgColor || '#111111';
    $badgeBgOpacity.value = s.badgeBgOpacity ?? 0.5;
    $badgeColor.value = s.badgeColor || '#ffffff';
    $fontSize.value = s.fontSize ?? 8;
    $borderWidth.value = s.borderWidth ?? 2;
    $hoverOnly.checked = !!s.hoverOnly;
  }
})();
