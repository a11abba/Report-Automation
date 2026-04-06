const apiBaseInput = document.getElementById("apiBase");
const contextEl = document.getElementById("context");

chrome.storage.sync.get(["apiBase"]).then(({ apiBase }) => {
  apiBaseInput.value = apiBase || "http://localhost:3000";
});

chrome.runtime.sendMessage({ type: "fetch.context" }, (response) => {
  if (!response?.context) {
    contextEl.textContent = "No page context detected yet.";
    return;
  }
  const context = response.context;
  contextEl.textContent = `Detected ${context.platformKey} on ${context.detectedUrl}`;
});

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.sync.set({ apiBase: apiBaseInput.value.trim() });
});

document.getElementById("open").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "open.dashboard" });
});
