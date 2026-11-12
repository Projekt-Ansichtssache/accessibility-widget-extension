"use strict";

const globalEnabledElement = document.getElementById("global-enabled");
const domainListElement = document.getElementById("domain-list");
const emptyMessageElement = document.getElementById("empty-message");
const errorElement = document.getElementById("error");

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

function renderDomains(domains) {
  domainListElement.replaceChildren();
  emptyMessageElement.hidden = domains.length > 0;

  domains.slice().sort().forEach((domain) => {
    const item = document.createElement("li");
    item.className = "domain-item";

    const name = document.createElement("span");
    name.className = "domain-name";
    name.textContent = domain;

    const removeButton = document.createElement("button");
    removeButton.className = "remove-button";
    removeButton.type = "button";
    removeButton.textContent = message("whitelistWebsite");
    removeButton.addEventListener("click", () => {
      void removeDomain(domain, removeButton);
    });

    item.append(name, removeButton);
    domainListElement.appendChild(item);
  });
}

async function loadSettings() {
  try {
    const settings = await chrome.runtime.sendMessage({ type: "get-settings" });
    if (!settings?.ok) throw new Error(settings?.error || message("settingsLoadError"));
    globalEnabledElement.checked = settings.globalEnabled;
    globalEnabledElement.disabled = false;
    renderDomains(settings.blacklistedDomains);
  } catch (error) {
    console.error("Could not load extension settings.", error);
    setError(error.message);
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
    if (!result?.ok) throw new Error(result?.error || message("settingApplyError"));
  } catch (error) {
    console.error("Could not update global state.", error);
    globalEnabledElement.checked = !globalEnabledElement.checked;
    setError(error.message);
  } finally {
    globalEnabledElement.disabled = false;
  }
});

async function removeDomain(domain, button) {
  button.disabled = true;
  setError("");
  try {
    const result = await chrome.runtime.sendMessage({
      type: "set-domain-state",
      domain,
      blacklisted: false,
    });
    if (!result?.ok) throw new Error(result?.error || message("whitelistError"));
    await loadSettings();
  } catch (error) {
    console.error("Could not remove blacklisted domain.", error);
    button.disabled = false;
    setError(error.message);
  }
}

translatePage();
void loadSettings();
