"use strict";

const GLOBAL_ENABLED_KEY = "globalEnabled";
const BLACKLISTED_DOMAINS_KEY = "blacklistedDomains";
const LEGACY_DISABLED_DOMAINS_KEY = "disabledDomains";
const VENDOR_SCRIPT = "vendor/accessibility-widget.js";
const injectionsInProgress = new Set();

function message(key) {
  return chrome.i18n.getMessage(key);
}

function getDomain(url) {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return null;
    }
    return parsedUrl.hostname.toLowerCase();
  } catch {
    return null;
  }
}

async function getSettings() {
  const stored = await chrome.storage.local.get({
    [GLOBAL_ENABLED_KEY]: true,
    [BLACKLISTED_DOMAINS_KEY]: null,
    [LEGACY_DISABLED_DOMAINS_KEY]: [],
  });
  const blacklistedDomains = Array.isArray(stored[BLACKLISTED_DOMAINS_KEY])
    ? stored[BLACKLISTED_DOMAINS_KEY]
    : Array.isArray(stored[LEGACY_DISABLED_DOMAINS_KEY])
      ? stored[LEGACY_DISABLED_DOMAINS_KEY]
      : [];
  return {
    globalEnabled: stored[GLOBAL_ENABLED_KEY] !== false,
    blacklistedDomains,
  };
}

function isWidgetEnabledForDomain(settings, domain) {
  return settings.globalEnabled && !settings.blacklistedDomains.includes(domain);
}

function getDomainFromMessage(message) {
  if (message.url) return getDomain(message.url);
  if (typeof message.domain !== "string" || !message.domain) return null;
  return getDomain(`https://${message.domain}`);
}

async function reloadMatchingTabs(domain = null) {
  const tabs = await chrome.tabs.query({});
  const matchingTabs = tabs.filter((tab) => {
    if (tab.id === undefined || !getDomain(tab.url || "")) return false;
    return domain === null || getDomain(tab.url) === domain;
  });
  await Promise.all(
    matchingTabs.map((tab) =>
      chrome.tabs.reload(tab.id).catch((error) => {
        console.warn(`Could not reload tab ${tab.id}.`, error);
      })
    )
  );
}

async function injectWidget(tabId, url) {
  const domain = getDomain(url);
  if (!domain || !isWidgetEnabledForDomain(await getSettings(), domain)) return;
  if (injectionsInProgress.has(tabId)) return;

  injectionsInProgress.add(tabId);
  try {
    const [{ result: alreadyLoaded }] = await chrome.scripting.executeScript({
      target: {
        tabId,
        allFrames: false,
      },
      func: () => Boolean(document.getElementById("a11y-widget-root")),
    });
    if (alreadyLoaded) return;

    await chrome.scripting.executeScript({
      target: {
        tabId,
        allFrames: false,
      },
      files: [VENDOR_SCRIPT],
    });
  } catch (error) {
    console.warn("Accessibility Widget could not be injected.", error);
  } finally {
    injectionsInProgress.delete(tabId);
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    void injectWidget(tabId, tab.url);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  reloadMatchingTabs()
    .catch((error) => {
      console.warn("Accessibility Widget could not initialize open tabs.", error);
    });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "get-settings") {
    getSettings()
      .then((settings) => sendResponse({ ok: true, ...settings }))
      .catch((error) => {
        console.error("Could not read the extension settings.", error);
        sendResponse({
          ok: false,
          error: message("extensionSettingsReadError"),
        });
      });
    return true;
  }

  if (message?.type === "get-domain-state") {
    const domain = getDomainFromMessage(message);
    if (!domain) {
      sendResponse({ supported: false, blacklisted: false });
      return;
    }

    getSettings()
      .then((settings) =>
        sendResponse({
          supported: true,
          globalEnabled: settings.globalEnabled,
          blacklisted: settings.blacklistedDomains.includes(domain),
        })
      )
      .catch((error) => {
        console.error("Could not read the domain state.", error);
        sendResponse({
          supported: true,
          error: message("domainStateReadError"),
        });
      });
    return true;
  }

  if (message?.type === "set-domain-state") {
    const domain = getDomainFromMessage(message);
    if (!domain || typeof message.blacklisted !== "boolean") {
      sendResponse({
        ok: false,
        error: message("unsupportedPageError"),
      });
      return;
    }

    getSettings()
      .then((settings) => {
        const blacklistedDomains = new Set(settings.blacklistedDomains);
        if (message.blacklisted) blacklistedDomains.add(domain);
        else blacklistedDomains.delete(domain);
        return chrome.storage.local.set({
          [BLACKLISTED_DOMAINS_KEY]: [...blacklistedDomains],
        });
      })
      .then(() => reloadMatchingTabs(domain))
      .then(() => sendResponse({ ok: true, blacklisted: message.blacklisted }))
      .catch((error) => {
        console.error("Could not update the domain state.", error);
        sendResponse({
          ok: false,
          error: message("settingApplyError"),
        });
      });
    return true;
  }

  if (message?.type === "set-global-state") {
    if (typeof message.enabled !== "boolean") {
      sendResponse({
        ok: false,
        error: message("invalidGlobalState"),
      });
      return;
    }

    chrome.storage.local
      .set({ [GLOBAL_ENABLED_KEY]: message.enabled })
      .then(() => reloadMatchingTabs())
      .then(() => sendResponse({ ok: true, enabled: message.enabled }))
      .catch((error) => {
        console.error("Could not update the global state.", error);
        sendResponse({
          ok: false,
          error: message("globalSettingApplyError"),
        });
      });
    return true;
  }
});
