async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isSupportedUrl(url = '') {
  // Chỉ gửi trên http/https/file. Loại chrome://, edge://, about:, view-source:, chrome-extension://
  return /^(https?:|file:)/i.test(url);
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-ga-debugger') return;

  const tab = await getActiveTab();
  if (!tab?.id || !isSupportedUrl(tab.url)) {
    // Không làm gì nếu đang đứng ở trang hệ thống
    return;
  }

  try {
    // Thử gửi TOGGLE
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE' });
  } catch (e) {
    // Nếu content chưa có, inject rồi gửi lại
    try {
      // inject JS
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });
      // inject CSS (để chắc)
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content.css'],
      });
      // gửi lại
      await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE' });
    } catch (err) {
      // nuốt lỗi, không cần crash
      console.warn('[GA Debugger] Cannot toggle on this page:', err);
    }
  }
});
