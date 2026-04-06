const DEFAULT_API_BASE = "http://localhost:3000";

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.sync.set({ apiBase: DEFAULT_API_BASE });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "context.detected") {
    chrome.storage.session.set({ lastContext: message.payload }).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "open.dashboard") {
    chrome.storage.sync.get(["apiBase"]).then(({ apiBase }) => {
      chrome.tabs.create({ url: apiBase || DEFAULT_API_BASE });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "fetch.context") {
    chrome.storage.session.get(["lastContext"]).then((state) => {
      sendResponse({ context: state.lastContext || null });
    });
    return true;
  }
});
