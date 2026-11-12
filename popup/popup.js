"use strict";

const domainElement = document.getElementById("domain");
const statusElement = document.getElementById("status");
const globalEnabledElement = document.getElementById("global-enabled");
const siteToggleElement = document.getElementById("site-toggle");
const viewListElement = document.getElementById("view-list");
const errorElement = document.getElementById("error");

let activeTab = null;
let currentBlacklisted = false;

function message(key) {
  return chrome.i18n.getMessage(key);
}

function translatePage() {
  const locale = chrome.i18n.getUILanguage().toLowerCase();
  document.documentElement.lang = locale.startsWith("de") ? "de" : "en";
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = message(element.dataset.i18n);
  });
}

function setError(message) {
  errorElement.textContent = message;
  errorElement.hidden = !message;
}

function setStatus(globalEnabled, blacklisted) {
  currentBlacklisted = blacklisted;
  if (!globalEnabled) {
    statusElement.textContent = message("statusGlobalDisabled");
  } else {
    statusElement.textContent = blacklisted
      ? message("statusWebsiteDisabled")
      : message("statusWebsiteEnabled");
  }
  statusElement.classList.toggle("is-disabled", !globalEnabled || blacklisted);
  siteToggleElement.textContent = blacklisted
    ? message("whitelistWebsite")
    : message("blacklistWebsite");
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tabs[0] || null;
}

async function loadState() {
  try {
    activeTab = await getActiveTab();
    const url = activeTab?.url || "";
    domainElement.textContent = url ? new URL(url).hostname : message("noWebsite");

    const state = await chrome.runtime.sendMessage({
      type: "get-domain-state",
      url,
    });
    if (!state?.supported) {
      statusElement.textContent = message("unsupportedPage");
      globalEnabledElement.disabled = true;
      siteToggleElement.disabled = true;
      return;
    }
    if (state.error) throw new Error(state.error);
    setStatus(state.globalEnabled, state.blacklisted);
    globalEnabledElement.checked = state.globalEnabled;
    globalEnabledElement.disabled = false;
    siteToggleElement.disabled = false;
    setError(state.error || "");
  } catch (error) {
    console.error("Could not load the domain state.", error);
    statusElement.textContent = message("statusUnavailable");
    globalEnabledElement.disabled = true;
    siteToggleElement.disabled = true;
    setError(message("statusLoadError"));
  }
}

globalEnabledElement.addEventListener("change", async () => {
  globalEnabledElement.disabled = true;
  setError("");
  try {
    const result = await chrome.runtime.sendMessage({
      type: "set-global-state",
      enabled: globalEnabledElement.checked,
    });
    if (!result?.ok) {
      throw new Error(result?.error || message("settingApplyError"));
    }
    setStatus(result.enabled, currentBlacklisted);
  } catch (error) {
    console.error("Could not update the global state.", error);
    globalEnabledElement.checked = !globalEnabledElement.checked;
    setError(error.message);
  } finally {
    globalEnabledElement.disabled = false;
  }
});

siteToggleElement.addEventListener("click", async () => {
  if (!activeTab?.url) return;

  siteToggleElement.disabled = true;
  setError("");
  try {
    const result = await chrome.runtime.sendMessage({
      type: "set-domain-state",
      url: activeTab.url,
      blacklisted: !currentBlacklisted,
    });
    if (!result?.ok) {
      throw new Error(result?.error || message("settingApplyError"));
    }
    setStatus(globalEnabledElement.checked, result.blacklisted);
  } catch (error) {
    console.error("Could not update the domain state.", error);
    setError(error.message);
  } finally {
    siteToggleElement.disabled = false;
  }
});

viewListElement.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});

translatePage();
void loadState();
