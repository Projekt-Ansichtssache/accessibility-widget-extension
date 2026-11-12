"use strict";

const domainElement = document.getElementById("domain");
const statusElement = document.getElementById("status");
const globalEnabledElement = document.getElementById("global-enabled");
const siteToggleElement = document.getElementById("site-toggle");
const viewListElement = document.getElementById("view-list");
const errorElement = document.getElementById("error");
const extensionApi = globalThis.browser || globalThis.chrome;

let activeTab = null;
let currentBlacklisted = false;

function i18nMessage(key) {
  return extensionApi.i18n.getMessage(key);
}

function translatePage() {
  const locale = extensionApi.i18n.getUILanguage().toLowerCase();
  document.documentElement.lang = locale.startsWith("de") ? "de" : "en";
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = i18nMessage(element.dataset.i18n);
  });
}

function setError(message) {
  errorElement.textContent = message;
  errorElement.hidden = !message;
}

function setStatus(globalEnabled, blacklisted) {
  currentBlacklisted = blacklisted;
  if (!globalEnabled) {
    statusElement.textContent = i18nMessage("statusGlobalDisabled");
  } else {
    statusElement.textContent = blacklisted
      ? i18nMessage("statusWebsiteDisabled")
      : i18nMessage("statusWebsiteEnabled");
  }
  statusElement.classList.toggle("is-disabled", !globalEnabled || blacklisted);
  siteToggleElement.textContent = blacklisted
    ? i18nMessage("whitelistWebsite")
    : i18nMessage("blacklistWebsite");
}

async function getActiveTab() {
  const tabs = await extensionApi.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tabs[0] || null;
}

async function loadState() {
  try {
    activeTab = await getActiveTab();
    const url = activeTab?.url || "";
    domainElement.textContent = url ? new URL(url).hostname : i18nMessage("noWebsite");

    const state = await extensionApi.runtime.sendMessage({
      type: "get-domain-state",
      url,
    });
    if (!state?.supported) {
      statusElement.textContent = i18nMessage("unsupportedPage");
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
    statusElement.textContent = i18nMessage("statusUnavailable");
    globalEnabledElement.disabled = true;
    siteToggleElement.disabled = true;
    setError(i18nMessage("statusLoadError"));
  }
}

globalEnabledElement.addEventListener("change", async () => {
  globalEnabledElement.disabled = true;
  setError("");
  try {
    const result = await extensionApi.runtime.sendMessage({
      type: "set-global-state",
      enabled: globalEnabledElement.checked,
    });
    if (!result?.ok) {
      throw new Error(result?.error || i18nMessage("settingApplyError"));
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
    const result = await extensionApi.runtime.sendMessage({
      type: "set-domain-state",
      url: activeTab.url,
      blacklisted: !currentBlacklisted,
    });
    if (!result?.ok) {
      throw new Error(result?.error || i18nMessage("settingApplyError"));
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
  void extensionApi.runtime.openOptionsPage();
});

translatePage();
void loadState();
