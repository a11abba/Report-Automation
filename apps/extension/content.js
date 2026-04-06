function detectPlatform(url) {
  if (url.includes("search.google.com") || url.includes("business.google.com")) {
    return "google_business_profile";
  }
  if (url.includes("analytics.google.com")) {
    return "google_analytics";
  }
  if (url.includes("search.google.com") || url.includes("search-console")) {
    return "google_search_console";
  }
  if (url.includes("klaviyo.com")) {
    return "klaviyo";
  }
  if (url.includes("hubspot.com")) {
    return "hubspot";
  }
  return "unknown";
}

chrome.runtime.sendMessage({
  type: "context.detected",
  payload: {
    detectedUrl: window.location.href,
    title: document.title,
    platformKey: detectPlatform(window.location.href)
  }
});
