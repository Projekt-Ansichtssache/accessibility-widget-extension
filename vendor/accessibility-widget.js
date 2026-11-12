/**
 * Accessibility Widget - Standalone Vanilla JS
 * Renders a floating a11y panel in a Shadow DOM with global CSS injection.
 * All preferences are persisted in localStorage.
 */
(function () {
  "use strict";

  const CONFIG = {
    storageKey: "a11y-widget-state",
    widgetId: "a11y-widget-root",
    textSelectors: "p, li, blockquote, figcaption, td, th",
    adhsPreset: {
      focusMode: false,
      readingRuler: true,
      reduceDistractions: true,
      hideDistractions: false,
      bionicReading: false,
      lineHeight: 130,
      letterSpacing: 100,
      wordSpacing: 100,
      textAlign: "left",
      highlightParagraph: false,
      highlightSentence: false,
      readingProgress: true,
      readingTime: false,
      summaryMode: false,
      collapseLongParagraphs: false,
      constrainLineWidth: false,
      readingFont: "system",
      pomodoroEnabled: false,
      rulerHeight: 100,
      colorTheme: "normal",
      reducedSaturation: false,
      grayscale: false,
      calmNotifications: true,
    },
    dyslexiePreset: {
      readingFont: "opendyslexic",
      textSize: 110,
      lineHeight: 120,
      letterSpacing: 110,
      wordSpacing: 105,
      textAlign: "left",
      readingRuler: true,
      focusMode: false,
      constrainLineWidth: false,
      colorTheme: "cream",
    },
  };

  const STORAGE_KEY = CONFIG.storageKey;
  const WIDGET_ID = CONFIG.widgetId;
  const motionPausedVideos = new Map();
  let mediaObserver = null;

  // ── Default State ──────────────────────────────────────────────────
  const defaults = {
    profile: null,
    contrast: "normal",
    textSize: 100,
    lineHeight: 100,
    letterSpacing: 100,
    textAlign: "standard",
    linkHighlight: false,
    headingHighlight: false,
    focusMode: false,
    reduceDistractions: false,
    hideDistractions: false,
    bionicReading: false,
    wordSpacing: 100,
    readingFont: "system",
    constrainLineWidth: false,
    highlightParagraph: false,
    highlightSentence: false,
    grayscale: false,
    readingRuler: false,
    readingProgress: false,
    readingMagnifier: false,
    speechRate: 1,
    readingTime: false,
    pomodoroEnabled: false,
    pomodoroMinutes: 25,
    breakMinutes: 5,
    timerSound: false,
    summaryMode: false,
    collapseLongParagraphs: false,
    colorTheme: "normal",
    reducedSaturation: false,
    calmNotifications: true,
    rulerHeight: 100,
  };

  let state = { ...defaults };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        state = { ...defaults, ...JSON.parse(raw) };
        let migrated = false;
        if (state.profile === "adhs" && state.colorTheme === "soft") {
          state.colorTheme = defaults.colorTheme;
          migrated = true;
        }
        if (state.profile === "adhs" && state.focusMode && !state.readingRuler) {
          state.readingRuler = true;
          migrated = true;
        }
        if (state.profile === "dyslexie" && state.readingFont === defaults.readingFont && state.textSize === defaults.textSize && state.lineHeight === defaults.lineHeight && state.letterSpacing === defaults.letterSpacing && state.wordSpacing === defaults.wordSpacing) {
          Object.assign(state, CONFIG.dyslexiePreset);
          migrated = true;
        }
        if (state.profile === "dyslexie") {
          const previousPresets = [
            { textSize: 120, lineHeight: 170, letterSpacing: 160, wordSpacing: 150, constrainLineWidth: false },
            { textSize: 115, lineHeight: 150, letterSpacing: 115, wordSpacing: 110, constrainLineWidth: true },
          ];
          const usesPreviousPreset = previousPresets.some((previousPreset) =>
            Object.entries(previousPreset).every(([key, value]) => state[key] === value)
          );
          if (usesPreviousPreset) {
            Object.assign(state, CONFIG.dyslexiePreset);
            migrated = true;
          }
        }
        if (migrated) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }
      }
    } catch (_) { /* ignore */ }
  }

  function saveState() {
    const status = document.getElementById(WIDGET_ID)?.shadowRoot?.getElementById("save-status");
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      if (status) {
        status.textContent = "Gespeichert";
        status.classList.remove("error");
        status.classList.add("visible");
      }
    } catch (_) {
      if (status) {
        status.textContent = "Speichern nicht möglich";
        status.classList.add("visible", "error");
      }
    }
  }

  // ── Global CSS Injection ───────────────────────────────────────────
  let styleEl = null;
  let readingFontStyleEl = null;

  function updateReadingFontStylesheet() {
    if (state.readingFont === "opendyslexic") {
      if (readingFontStyleEl?.tagName !== "STYLE") {
        if (readingFontStyleEl) readingFontStyleEl.remove();
        readingFontStyleEl = document.createElement("style");
        readingFontStyleEl.id = "a11y-reading-fonts";
        document.head.appendChild(readingFontStyleEl);
      }
      readingFontStyleEl.textContent = `
        @font-face {
          font-family: "OpenDyslexic";
          src: url("https://raw.githubusercontent.com/antijingoist/opendyslexic/master/compiled/OpenDyslexic-Regular.woff2") format("woff2");
          font-style: normal;
          font-weight: 400;
          font-display: swap;
        }
        @font-face {
          font-family: "OpenDyslexic";
          src: url("https://raw.githubusercontent.com/antijingoist/opendyslexic/master/compiled/OpenDyslexic-Bold.woff2") format("woff2");
          font-style: normal;
          font-weight: 700;
          font-display: swap;
        }
      `;
      return;
    }

    const fontUrls = {
      atkinson: "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap",
      lexend: "https://fonts.googleapis.com/css2?family=Lexend:wght@400;700&display=swap",
    };
    const href = fontUrls[state.readingFont];
    if (!href) {
      if (readingFontStyleEl) readingFontStyleEl.remove();
      readingFontStyleEl = null;
      return;
    }
    if (readingFontStyleEl?.tagName !== "LINK") {
      if (readingFontStyleEl) readingFontStyleEl.remove();
      readingFontStyleEl = document.createElement("link");
      readingFontStyleEl.id = "a11y-reading-fonts";
      readingFontStyleEl.rel = "stylesheet";
      document.head.appendChild(readingFontStyleEl);
    }
    if (readingFontStyleEl.href !== href) readingFontStyleEl.href = href;
  }

  function ensureStyleEl() {
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "a11y-global-styles";
      document.head.appendChild(styleEl);
    }
  }

  const EXCLUDE = ":not(#a11y-widget-root)";

  function buildGlobalCSS() {
    const s = state;
    const txtScale = s.textSize / 100;
    const lh = s.lineHeight / 100;
    const ls = s.letterSpacing / 100;
    const wordSpacing = (s.wordSpacing / 100 - 1) * 0.25;
    const fontFamilies = {
      system: "Arial, Helvetica, sans-serif",
      atkinson: '"Atkinson Hyperlegible", Arial, sans-serif',
      lexend: "Lexend, Arial, sans-serif",
      opendyslexic: '"OpenDyslexic", Arial, sans-serif',
    };
    const readingFontFamily = fontFamilies[s.readingFont] || fontFamilies.system;
    const pageFilters = [];
    if (s.profile === "vision") pageFilters.push("contrast(1.2)");
    if (s.grayscale) pageFilters.push("grayscale(1)");
    if (s.colorTheme === "sepia") pageFilters.push("sepia(0.35)");
    if (s.colorTheme === "dark") pageFilters.push("invert(0.92) hue-rotate(180deg)");
    if (s.colorTheme === "soft") pageFilters.push("saturate(0.72)");
    if (s.reducedSaturation) pageFilters.push("saturate(0.55)");
    const pageFilter = pageFilters.join(" ") || "none";

    return `
/* ── A11y Widget Global Styles ─────────────────────────────── */

/* Text sizing & spacing on html */
html.a11y-active {
  font-size: ${Math.round(txtScale * 100) / 100 * 100}% !important;
}
html.a11y-active {
  line-height: ${lh} !important;
  letter-spacing: ${(ls - 1) * 0.2}em !important;
}

body.a11y-profile-vision ${EXCLUDE} :focus-visible,
body.a11y-profile-motor ${EXCLUDE} :focus-visible {
  outline: 3px solid #005fcc !important;
  outline-offset: 3px !important;
}

/* ── Profiles ──────────────────────────────────────────────── */

/* Seitenfilter bleiben auf Seiteninhalte begrenzt. */
html.a11y-page-filter body > :not(#a11y-widget-root) {
  filter: ${pageFilter};
}

/* Dyslexia */
body.a11y-profile-dyslexie${EXCLUDE},
body.a11y-profile-dyslexie ${EXCLUDE} {
  font-family: ${readingFontFamily} !important;
  letter-spacing: ${(ls - 1) * 0.2}em !important;
  word-spacing: ${wordSpacing}em !important;
  line-height: ${lh} !important;
  text-align: left !important;
}

/* Motor */
body.a11y-profile-motor ${EXCLUDE} a,
body.a11y-profile-motor ${EXCLUDE} button,
body.a11y-profile-motor ${EXCLUDE} input,
body.a11y-profile-motor ${EXCLUDE} select,
body.a11y-profile-motor ${EXCLUDE} textarea,
body.a11y-profile-motor ${EXCLUDE} [role="button"],
body.a11y-profile-motor ${EXCLUDE} [onclick] {
  min-height: 44px !important;
  min-width: 44px !important;
  padding: 12px 18px !important;
  font-size: 1.1em !important;
}
/* Cognitive */
body.a11y-profile-kognitiv${EXCLUDE} {
  font-family: Arial, Helvetica, sans-serif !important;
  line-height: 1.8 !important;
  letter-spacing: 0.05em !important;
}
body.a11y-profile-kognitiv${EXCLUDE} *:not(#a11y-widget-root) {
  font-family: Arial, Helvetica, sans-serif !important;
  line-height: 1.8 !important;
  letter-spacing: 0.05em !important;
}
body.a11y-profile-kognitiv ${EXCLUDE} img {
  max-width: 100%;
  height: auto;
}

/* Epilepsy – kill animations */
body.a11y-profile-epilepsie > :not(#a11y-widget-root),
body.a11y-profile-epilepsie > :not(#a11y-widget-root) *,
body.a11y-profile-epilepsie > :not(#a11y-widget-root) *::before,
body.a11y-profile-epilepsie > :not(#a11y-widget-root) *::after {
  animation-duration: 0.001s !important;
  animation-delay: 0s !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.001s !important;
  transition-delay: 0s !important;
  scroll-behavior: auto !important;
}
body.a11y-profile-epilepsie > :not(#a11y-widget-root) video,
body.a11y-profile-epilepsie > :not(#a11y-widget-root) iframe {
  animation: none !important;
}

@media (prefers-reduced-motion: reduce) {
  body > :not(#a11y-widget-root),
  body > :not(#a11y-widget-root) *,
  body > :not(#a11y-widget-root) *::before,
  body > :not(#a11y-widget-root) *::after {
    animation-duration: 0.001s !important;
    animation-delay: 0s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001s !important;
    scroll-behavior: auto !important;
  }
}

/* ── Contrast modes ────────────────────────────────────────── */
html.a11y-contrast-dark body {
  background-color: #1a1a2e !important;
  color: #e0e0e0 !important;
}
html.a11y-contrast-dark body${EXCLUDE} * {
  border-color: #444 !important;
}
html.a11y-contrast-dark body ${EXCLUDE} img {
  opacity: 0.85;
}

html.a11y-contrast-light body {
  background-color: #fdfdfd !important;
  color: #222 !important;
}

html.a11y-contrast-high body {
  background-color: #000 !important;
  color: #ff0 !important;
}
html.a11y-contrast-high body${EXCLUDE} * {
  border-color: #ff0 !important;
}
html.a11y-contrast-high body ${EXCLUDE} a {
  color: #0ff !important;
}

/* ── Text alignment ────────────────────────────────────────── */
body.a11y-align-left ${EXCLUDE} * {
  text-align: left !important;
}
body.a11y-align-center ${EXCLUDE} * {
  text-align: center !important;
}

/* ── Link highlight ────────────────────────────────────────── */
html.a11y-link-highlight body${EXCLUDE} a,
html.a11y-link-highlight body${EXCLUDE} a * {
  text-decoration: underline !important;
  text-decoration-thickness: 3px !important;
  text-underline-offset: 4px !important;
  background-color: rgba(0, 120, 255, 0.12) !important;
  border-bottom: 3px solid #0078ff !important;
  padding-bottom: 1px !important;
  border-radius: 3px !important;
}

/* ── Heading highlight ─────────────────────────────────────── */
body.a11y-heading-highlight ${EXCLUDE} h1,
body.a11y-heading-highlight ${EXCLUDE} h2,
body.a11y-heading-highlight ${EXCLUDE} h3,
body.a11y-heading-highlight ${EXCLUDE} h4,
body.a11y-heading-highlight ${EXCLUDE} h5,
body.a11y-heading-highlight ${EXCLUDE} h6 {
  border-left: 5px solid #ff6600 !important;
  background-color: rgba(255, 102, 0, 0.10) !important;
  padding: 8px 14px !important;
  margin: 12px 0 !important;
  border-radius: 0 8px 8px 0 !important;
}

body.a11y-reduce-distractions > :not(#a11y-widget-root),
body.a11y-reduce-distractions > :not(#a11y-widget-root) *,
body.a11y-reduce-distractions > :not(#a11y-widget-root) *::before,
body.a11y-reduce-distractions > :not(#a11y-widget-root) *::after {
  animation-duration: 0.001s !important;
  animation-delay: 0s !important;
  animation-iteration-count: 1 !important;
  animation-play-state: paused !important;
  transition-duration: 0.001s !important;
  scroll-behavior: auto !important;
}
body.a11y-hide-distractions ${EXCLUDE} :is(aside, [role="dialog"], [aria-modal="true"], [class*="cookie"], [class*="banner"], [class*="popup"], [class*="newsletter"], [class*="sidebar"]) {
  display: none !important;
}
body.a11y-reduce-distractions ${EXCLUDE} :is([data-parallax], [class*="parallax"]) {
  background-attachment: scroll !important;
  transform: none !important;
}
body.a11y-reduce-distractions ${EXCLUDE} :is([data-carousel], [class*="carousel"], [class*="slider"], [class*="swiper"], marquee, blink) {
  animation-play-state: paused !important;
  scroll-behavior: auto !important;
}
body.a11y-bionic ${EXCLUDE} .a11y-bionic-word strong {
  font-weight: 800 !important;
}
body.a11y-font-atkinson ${EXCLUDE} :is(p, li, blockquote, figcaption, td, th) {
  font-family: "Atkinson Hyperlegible", Arial, sans-serif !important;
}
body.a11y-font-lexend ${EXCLUDE} :is(p, li, blockquote, figcaption, td, th) {
  font-family: Lexend, Arial, sans-serif !important;
}
body.a11y-font-opendyslexic ${EXCLUDE} :is(p, li, blockquote, figcaption, td, th) {
  font-family: "OpenDyslexic", Arial, sans-serif !important;
}
body.a11y-background-cream > :not(#a11y-widget-root),
body.a11y-background-cream ${EXCLUDE} :is(main, [role="main"], article, section, p, li, blockquote) {
  background-color: #f5f0df !important;
  color: #20252b !important;
}
body.a11y-background-lightblue > :not(#a11y-widget-root),
body.a11y-background-lightblue ${EXCLUDE} :is(main, [role="main"], article, section, p, li, blockquote) {
  background-color: #eaf4fb !important;
  color: #1c2833 !important;
}
body.a11y-word-spacing ${EXCLUDE} :is(p, li, blockquote, figcaption, td, th) {
  word-spacing: ${wordSpacing}em !important;
}
body.a11y-limit-width ${EXCLUDE} :is(p, li, blockquote, figcaption, td, th) {
  max-width: 60ch !important;
  margin-inline: auto !important;
}
body.a11y-highlight-paragraph ${EXCLUDE} :is(p, li, blockquote, figcaption, td, th):not([data-a11y-current-paragraph]) {
  opacity: 0.55 !important;
}
body.a11y-highlight-paragraph ${EXCLUDE} [data-a11y-current-paragraph] {
  background-color: rgba(255, 220, 80, 0.22) !important;
  outline: 2px solid rgba(120, 90, 0, 0.55) !important;
  outline-offset: 3px !important;
  opacity: 1 !important;
}
body.a11y-collapse-long ${EXCLUDE} p.a11y-collapsible:not([aria-expanded="true"]) {
  max-height: 7em !important;
  overflow: hidden !important;
  position: relative !important;
  padding-bottom: 1.7em !important;
  cursor: pointer;
}
body.a11y-collapse-long ${EXCLUDE} p.a11y-collapsible::after {
  content: "Mehr anzeigen";
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 6px 0 0;
  background: inherit;
  color: #004b9b;
  font-weight: 700;
  text-decoration: underline;
}
body.a11y-collapse-long ${EXCLUDE} p.a11y-collapsible[aria-expanded="true"]::after {
  content: "Weniger anzeigen";
}
body.a11y-collapse-long ${EXCLUDE} p.a11y-collapsible:focus-visible {
  outline: 3px solid #005fcc !important;
  outline-offset: 3px !important;
}
::highlight(a11y-speech) {
  background-color: #ffe66d;
  color: #111;
}

`;
  }

  const originalTextStyles = new Map();

  function applyTextAdjustments() {
    const active = state.textSize !== 100 || state.lineHeight !== 100 || state.letterSpacing !== 100;
    if (!active) {
      originalTextStyles.forEach((original, element) => {
        ["font-size", "line-height", "letter-spacing"].forEach((property) => {
          const value = original.inline[property];
          if (value) element.style.setProperty(property, value, original.priority[property]);
          else element.style.removeProperty(property);
        });
      });
      originalTextStyles.clear();
      return;
    }

    const textElements = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const element = node.parentElement;
        if (!node.nodeValue.trim() || !element || element.closest(`#${WIDGET_ID}, script, style, noscript`)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    while (walker.nextNode()) textElements.add(walker.currentNode.parentElement);

    textElements.forEach((element) => {
      if (originalTextStyles.has(element)) return;
      const computed = getComputedStyle(element);
      const fontSize = parseFloat(computed.fontSize) || 16;
      const lineHeight = computed.lineHeight === "normal" ? fontSize * 1.5 : parseFloat(computed.lineHeight);
      const letterSpacing = computed.letterSpacing === "normal" ? 0 : parseFloat(computed.letterSpacing);
      originalTextStyles.set(element, {
        fontSize,
        lineHeight: Number.isFinite(lineHeight) ? lineHeight : fontSize * 1.5,
        letterSpacing: Number.isFinite(letterSpacing) ? letterSpacing : 0,
        inline: {
          "font-size": element.style.getPropertyValue("font-size"),
          "line-height": element.style.getPropertyValue("line-height"),
          "letter-spacing": element.style.getPropertyValue("letter-spacing"),
        },
        priority: {
          "font-size": element.style.getPropertyPriority("font-size"),
          "line-height": element.style.getPropertyPriority("line-height"),
          "letter-spacing": element.style.getPropertyPriority("letter-spacing"),
        },
      });
    });

    originalTextStyles.forEach((original, element) => {
      element.style.setProperty("font-size", `${original.fontSize * state.textSize / 100}px`, "important");
      if (state.lineHeight === 100) {
        const value = original.inline["line-height"];
        if (value) element.style.setProperty("line-height", value, original.priority["line-height"]);
        else element.style.removeProperty("line-height");
      }
      else element.style.setProperty("line-height", `${original.lineHeight * state.lineHeight / 100}px`, "important");
      if (state.letterSpacing === 100) {
        const value = original.inline["letter-spacing"];
        if (value) element.style.setProperty("letter-spacing", value, original.priority["letter-spacing"]);
        else element.style.removeProperty("letter-spacing");
      }
      else {
        const spacing = original.letterSpacing + (state.letterSpacing / 100 - 1) * 0.2 * original.fontSize;
        element.style.setProperty("letter-spacing", `${spacing}px`, "important");
      }
    });
  }

  function applyGlobalStyles() {
    ensureStyleEl();
    updateReadingFontStylesheet();
    styleEl.textContent = buildGlobalCSS();
    applyTextAdjustments();
    const htmlRoot = document.documentElement;

    // Toggle the a11y-active class on html and body
    htmlRoot.classList.toggle("a11y-active", state.textSize !== 100 || state.lineHeight !== 100 || state.letterSpacing !== 100);

    // Profile class on body
    document.body.classList.remove(
      "a11y-profile-vision",
      "a11y-profile-dyslexie",
      "a11y-profile-adhs",
      "a11y-profile-motor",
      "a11y-profile-kognitiv",
      "a11y-profile-epilepsie"
    );
    if (state.profile) {
      document.body.classList.add("a11y-profile-" + state.profile);
    }

    // Contrast classes on html
    htmlRoot.classList.remove(
      "a11y-contrast-normal",
      "a11y-contrast-dark",
      "a11y-contrast-light",
      "a11y-contrast-high"
    );
    htmlRoot.classList.add("a11y-contrast-" + state.contrast);
    htmlRoot.classList.toggle("a11y-link-highlight", !!state.linkHighlight);
    htmlRoot.classList.toggle("a11y-grayscale", !!state.grayscale);
    htmlRoot.classList.toggle("a11y-page-filter", state.profile === "vision" || state.grayscale || ["soft", "sepia", "dark"].includes(state.colorTheme) || state.reducedSaturation);

    // Align
    document.body.classList.remove("a11y-align-left", "a11y-align-center");
    if (state.textAlign !== "standard") {
      document.body.classList.add("a11y-align-" + state.textAlign);
    }

    // Reading aid classes
    document.body.classList.toggle("a11y-heading-highlight", !!state.headingHighlight);
    document.body.classList.toggle("a11y-focus-mode", !!state.focusMode);
    document.body.classList.toggle("a11y-reduce-distractions", !!state.reduceDistractions);
    document.body.classList.toggle("a11y-hide-distractions", !!state.hideDistractions);
    document.body.classList.toggle("a11y-bionic", !!state.bionicReading);
    document.body.classList.toggle("a11y-limit-width", !!state.constrainLineWidth);
    document.body.classList.toggle("a11y-highlight-paragraph", !!state.highlightParagraph);
    document.body.classList.toggle("a11y-font-atkinson", state.readingFont === "atkinson");
    document.body.classList.toggle("a11y-font-lexend", state.readingFont === "lexend");
    document.body.classList.toggle("a11y-font-opendyslexic", state.readingFont === "opendyslexic");
    document.body.classList.toggle("a11y-word-spacing", state.wordSpacing !== 100);
    document.body.classList.toggle("a11y-background-cream", state.colorTheme === "cream");
    document.body.classList.toggle("a11y-background-lightblue", state.colorTheme === "lightblue");
    document.body.classList.toggle("a11y-collapse-long", !!state.collapseLongParagraphs);
    document.documentElement.classList.remove("a11y-large-cursor");

    updateWidgetMotionState();
    pauseAutoplayMedia();
    updateMediaObserver();
  }

  function shouldReduceMotion() {
    const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return state.profile === "epilepsie" || state.reduceDistractions || prefersReducedMotion;
  }

  function updateWidgetMotionState() {
    const widget = document.getElementById(WIDGET_ID);
    if (widget) widget.toggleAttribute("data-reduced-motion", shouldReduceMotion());
  }

  function pauseAutoplayMedia(root = document) {
    if (!shouldReduceMotion()) {
      motionPausedVideos.forEach((hadAutoplay, video) => {
        if (hadAutoplay && video.isConnected) video.setAttribute("autoplay", "");
      });
      motionPausedVideos.clear();
      return;
    }
    const videos = [];
    if (root instanceof Element && root.matches("video[autoplay]")) videos.push(root);
    if (root.querySelectorAll) videos.push(...root.querySelectorAll("video[autoplay]"));
    videos.forEach((video) => {
      if (!motionPausedVideos.has(video)) motionPausedVideos.set(video, video.hasAttribute("autoplay"));
      video.pause();
      video.removeAttribute("autoplay");
    });
  }

  function updateMediaObserver() {
    if (!shouldReduceMotion()) {
      if (mediaObserver) mediaObserver.disconnect();
      mediaObserver = null;
      return;
    }
    if (mediaObserver) return;

    mediaObserver = new MutationObserver((records) => {
      if (!shouldReduceMotion()) return;
      records.forEach((record) => record.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) pauseAutoplayMedia(node);
      }));
    });
    mediaObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ── Reset global styles on cleanup ─────────────────────────────────
  function clearGlobalStyles() {
    if (styleEl) {
      styleEl.remove();
      styleEl = null;
    }
    if (readingFontStyleEl) {
      readingFontStyleEl.remove();
      readingFontStyleEl = null;
    }
    motionPausedVideos.forEach((hadAutoplay, video) => {
      if (hadAutoplay && video.isConnected) video.setAttribute("autoplay", "");
    });
    motionPausedVideos.clear();
    document.documentElement.classList.remove(
      "a11y-active", "a11y-contrast-normal", "a11y-contrast-dark",
      "a11y-contrast-light", "a11y-contrast-high", "a11y-link-highlight",
      "a11y-grayscale", "a11y-page-filter"
    );
    document.body.classList.remove(
      "a11y-profile-vision", "a11y-profile-dyslexie", "a11y-profile-adhs",
      "a11y-profile-motor", "a11y-profile-kognitiv", "a11y-profile-epilepsie",
      "a11y-contrast-normal", "a11y-contrast-dark", "a11y-contrast-light", "a11y-contrast-high",
      "a11y-align-left", "a11y-align-center",
      "a11y-link-highlight", "a11y-heading-highlight",
      "a11y-focus-mode", "a11y-grayscale", "a11y-reduce-distractions",
      "a11y-hide-distractions", "a11y-bionic", "a11y-limit-width",
      "a11y-highlight-paragraph", "a11y-font-atkinson", "a11y-font-lexend", "a11y-font-opendyslexic",
      "a11y-word-spacing", "a11y-page-filter", "a11y-background-cream", "a11y-background-lightblue",
      "a11y-collapse-long"
    );
    document.documentElement.classList.remove("a11y-large-cursor");
  }

  // ── Shadow DOM Setup ──────────────────────────────────────────────
  function createWidget() {
    // Remove existing instance if any
    const existing = document.getElementById(WIDGET_ID);
    if (existing) existing.remove();

    const host = document.createElement("div");
    host.id = WIDGET_ID;
    host.style.cssText = "position:fixed;bottom:20px;left:20px;z-index:999999;";
    host.toggleAttribute("data-reduced-motion", shouldReduceMotion());
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });

    // ── Build Shadow DOM content ────────────────────────────────────
    shadow.innerHTML = `
      <style>${widgetCSS()}</style>
      <div id="wrapper" class="wrapper">
        <!-- Trigger Button -->
        <button
          id="a11y-trigger"
          class="trigger-btn"
          aria-label="Barrierefreiheits-Einstellungen öffnen"
          aria-expanded="false"
          aria-controls="a11y-panel"
          title="Barrierefreiheits-Widget"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="28" height="28" aria-hidden="true" focusable="false">
            <circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" stroke-width="4"/>
            <circle cx="32" cy="14" r="5" fill="currentColor"/>
            <path d="M20 30 h24 M32 18 v12 M24 42 l-4 12 M40 42 l4 12" stroke="currentColor" stroke-width="4" stroke-linecap="round" fill="none"/>
          </svg>
        </button>

        <!-- Panel -->
        <div id="a11y-panel" class="panel hidden" role="dialog" aria-label="Barrierefreiheits-Einstellungen" tabindex="-1">
          <div class="panel-header">
            <div class="panel-heading">
              <span class="panel-title">Einstellungen</span>
              <span id="save-status" class="save-status" role="status" aria-live="polite" aria-atomic="true"></span>
            </div>
            <button id="a11y-close" class="icon-btn" aria-label="Panel schließen" title="Schließen">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="panel-body">

            <!-- Tab Navigation -->
            <nav class="tabs" role="tablist" aria-label="Einstellungs-Kategorien">
              <button class="tab active" role="tab" aria-selected="true" aria-controls="tab-profiles" id="btn-profiles">Profile</button>
              <button class="tab" role="tab" aria-selected="false" aria-controls="tab-display" id="btn-display" tabindex="-1">Darstellung</button>
              <button class="tab" role="tab" aria-selected="false" aria-controls="tab-reading" id="btn-reading" tabindex="-1">Lesehilfen</button>
            </nav>

            <!-- Tab: Profiles -->
            <div class="tab-panel" id="tab-profiles" role="tabpanel" aria-labelledby="btn-profiles">
              <div class="section-label">Vorlagen</div>
              <div class="profile-grid">
                <button class="profile-btn" data-profile="vision" aria-label="Profil Sehbehinderung aktivieren">
                  <span class="profile-icon">👁</span><span class="profile-name">Sehbehinderung</span>
                </button>
                <button class="profile-btn" data-profile="dyslexie" aria-label="Profil Dyslexie aktivieren">
                  <span class="profile-icon">📖</span><span class="profile-name">Dyslexie</span>
                </button>
                <button class="profile-btn" data-profile="adhs" aria-label="ADHS-Modus aktivieren">
                  <span class="profile-icon">🧠</span><span class="profile-name">ADHS-Modus</span>
                </button>
                <button class="profile-btn" data-profile="motor" aria-label="Profil Motorik aktivieren">
                  <span class="profile-icon">🖱</span><span class="profile-name">Motorik</span>
                </button>
                <button class="profile-btn" data-profile="kognitiv" aria-label="Profil Kognitiv aktivieren">
                  <span class="profile-icon">💡</span><span class="profile-name">Kognitiv</span>
                </button>
                <button class="profile-btn" data-profile="epilepsie" aria-label="Profil Epilepsie aktivieren">
                  <span class="profile-icon">⚡</span><span class="profile-name">Epilepsie</span>
                </button>
              </div>
            </div>

            <!-- Tab: Display -->
            <div class="tab-panel hidden" id="tab-display" role="tabpanel" aria-labelledby="btn-display">

              <div class="section-label">Kontrast</div>
              <div class="contrast-grid">
                <button class="contrast-btn active" data-contrast="normal" aria-pressed="true">Normal</button>
                <button class="contrast-btn" data-contrast="dark" aria-pressed="false">Dunkel</button>
                <button class="contrast-btn" data-contrast="light" aria-pressed="false">Hell</button>
                <button class="contrast-btn" data-contrast="high" aria-pressed="false">Hoher Kontrast</button>
              </div>

              <div class="section-label">Textgröße</div>
              <div class="stepper-row">
                <button class="stepper-btn" data-action="textSize-down" aria-label="Textgröße verkleinern">−</button>
                <span class="stepper-value" id="textSize-val">${state.textSize}%</span>
                <button class="stepper-btn" data-action="textSize-up" aria-label="Textgröße vergrößern">+</button>
                <button class="stepper-btn reset" data-action="textSize-reset" aria-label="Textgröße zurücksetzen" title="Zurücksetzen">↺</button>
              </div>

              <div class="section-label">Zeilenabstand</div>
              <div class="stepper-row">
                <button class="stepper-btn" data-action="lineHeight-down" aria-label="Zeilenabstand verkleinern">−</button>
                <span class="stepper-value" id="lineHeight-val">${state.lineHeight}%</span>
                <button class="stepper-btn" data-action="lineHeight-up" aria-label="Zeilenabstand vergrößern">+</button>
                <button class="stepper-btn reset" data-action="lineHeight-reset" aria-label="Zeilenabstand zurücksetzen" title="Zurücksetzen">↺</button>
              </div>

              <div class="section-label">Buchstabenabstand</div>
              <div class="stepper-row">
                <button class="stepper-btn" data-action="letterSpacing-down" aria-label="Buchstabenabstand verkleinern">−</button>
                <span class="stepper-value" id="letterSpacing-val">${state.letterSpacing}%</span>
                <button class="stepper-btn" data-action="letterSpacing-up" aria-label="Buchstabenabstand vergrößern">+</button>
                <button class="stepper-btn reset" data-action="letterSpacing-reset" aria-label="Buchstabenabstand zurücksetzen" title="Zurücksetzen">↺</button>
              </div>

              <div class="section-label">Textausrichtung</div>
              <div class="align-row">
                <button class="align-btn active" data-align="standard" aria-pressed="true">Standard</button>
                <button class="align-btn" data-align="left" aria-pressed="false">Links</button>
                <button class="align-btn" data-align="center" aria-pressed="false">Zentriert</button>
              </div>

            </div>

            <!-- Tab: Reading Aids -->
            <div class="tab-panel hidden" id="tab-reading" role="tabpanel" aria-labelledby="btn-reading">

              <details class="profile-disclosure" data-profile-settings="general">
                <summary>Allgemeine Lesehilfen</summary>
                <div class="profile-settings-content">
              <div class="toggle-row">
                <span class="toggle-label">Lesefortschritt</span>
                <button class="toggle" role="switch" aria-checked="${state.readingProgress}" data-toggle="readingProgress" aria-label="Lesefortschritt anzeigen">
                  <span class="toggle-thumb"></span>
                </button>
              </div>
              <div class="toggle-row">
                <span class="toggle-label">Lesezeit anzeigen</span>
                <button class="toggle" role="switch" aria-checked="${state.readingTime}" data-toggle="readingTime" aria-label="Geschätzte Lesezeit anzeigen">
                  <span class="toggle-thumb"></span>
                </button>
              </div>

              <div class="toggle-row">
                <span class="toggle-label">Leselineal</span>
                <button class="toggle" role="switch" aria-checked="${state.readingRuler}" data-toggle="readingRuler" aria-label="Leselineal aktivieren">
                  <span class="toggle-thumb"></span>
                </button>
              </div>

              <div class="toggle-row">
                <span class="toggle-label">Links hervorheben</span>
                <button class="toggle" role="switch" aria-checked="${state.linkHighlight}" data-toggle="linkHighlight" aria-label="Links hervorheben">
                  <span class="toggle-thumb"></span>
                </button>
              </div>
              <div class="toggle-row">
                <span class="toggle-label">Überschriften markieren</span>
                <button class="toggle" role="switch" aria-checked="${state.headingHighlight}" data-toggle="headingHighlight" aria-label="Überschriften markieren">
                  <span class="toggle-thumb"></span>
                </button>
              </div>
              <div class="toggle-row">
                <span class="toggle-label">Graustufen</span>
                <button class="toggle" role="switch" aria-checked="${state.grayscale}" data-toggle="grayscale" aria-label="Graustufen aktivieren">
                  <span class="toggle-thumb"></span>
                </button>
              </div>
              <div class="toggle-row">
                <span class="toggle-label">Leselupe</span>
                <button class="toggle" role="switch" aria-checked="${state.readingMagnifier}" data-toggle="readingMagnifier" aria-label="Leselupe aktivieren">
                  <span class="toggle-thumb"></span>
                </button>
              </div>

              <div class="section-label">Vorlesen</div>
              <div class="action-row">
                <button class="action-btn" type="button" data-speech="play" aria-label="Markierten Text oder Abschnitt vorlesen">Vorlesen</button>
                <button class="action-btn" type="button" data-speech="pause" aria-label="Vorlesen pausieren">Pause</button>
                <button class="action-btn" type="button" data-speech="stop" aria-label="Vorlesen beenden">Stopp</button>
              </div>
              <label class="range-row" for="speech-rate">
                <span>Sprechtempo <output data-value-for="speechRate">${state.speechRate.toFixed(1)}×</output></span>
                <input id="speech-rate" class="range-control" type="range" min="0.7" max="1.5" step="0.1" data-setting="speechRate" value="${state.speechRate}" aria-label="Sprechtempo">
              </label>
              <div id="speech-status" class="inline-status" role="status" aria-live="polite"></div>
                </div>
              </details>

              <details class="profile-disclosure" data-profile-settings="dyslexie">
                <summary>Dyslexie-Einstellungen</summary>
                <div class="profile-settings-content">
                  <label class="select-row" for="dyslexie-font">
                    <span>Leseschrift</span>
                    <select id="dyslexie-font" data-setting="readingFont" aria-label="Dyslexie-Leseschrift">
                      <option value="system" ${state.readingFont === "system" ? "selected" : ""}>System</option>
                      <option value="opendyslexic" ${state.readingFont === "opendyslexic" ? "selected" : ""}>OpenDyslexic</option>
                      <option value="lexend" ${state.readingFont === "lexend" ? "selected" : ""}>Lexend</option>
                      <option value="atkinson" ${state.readingFont === "atkinson" ? "selected" : ""}>Atkinson Hyperlegible</option>
                    </select>
                  </label>
                  <label class="range-row" for="dyslexie-text-size">
                    <span>Schriftgröße <output data-value-for="textSize">${state.textSize}%</output></span>
                    <input id="dyslexie-text-size" class="range-control" type="range" min="80" max="200" step="10" data-setting="textSize" value="${state.textSize}" aria-label="Schriftgröße">
                  </label>
                  <label class="range-row" for="dyslexie-line-height">
                    <span>Zeilenabstand <output data-value-for="lineHeight">${state.lineHeight}%</output></span>
                    <input id="dyslexie-line-height" class="range-control" type="range" min="100" max="220" step="10" data-setting="lineHeight" value="${state.lineHeight}" aria-label="Zeilenabstand">
                  </label>
                  <label class="range-row" for="dyslexie-letter-spacing">
                    <span>Buchstabenabstand <output data-value-for="letterSpacing">${state.letterSpacing}%</output></span>
                    <input id="dyslexie-letter-spacing" class="range-control" type="range" min="100" max="180" step="5" data-setting="letterSpacing" value="${state.letterSpacing}" aria-label="Buchstabenabstand">
                  </label>
                  <label class="range-row" for="dyslexie-word-spacing">
                    <span>Wortabstand <output data-value-for="wordSpacing">${state.wordSpacing}%</output></span>
                    <input id="dyslexie-word-spacing" class="range-control" type="range" min="80" max="180" step="5" data-setting="wordSpacing" value="${state.wordSpacing}" aria-label="Wortabstand">
                  </label>
                  <div class="toggle-row">
                    <span class="toggle-label">Lange Textzeilen begrenzen</span>
                    <button class="toggle" role="switch" aria-checked="${state.constrainLineWidth}" data-toggle="constrainLineWidth" aria-label="Lange Textzeilen begrenzen">
                      <span class="toggle-thumb"></span>
                    </button>
                  </div>
                  <label class="select-row" for="dyslexie-background">
                    <span>Hintergrundfarbe</span>
                    <select id="dyslexie-background" data-setting="colorTheme" aria-label="Hintergrundfarbe">
                      <option value="normal" ${state.colorTheme === "normal" ? "selected" : ""}>Standard</option>
                      <option value="cream" ${state.colorTheme === "cream" ? "selected" : ""}>Creme</option>
                      <option value="lightblue" ${state.colorTheme === "lightblue" ? "selected" : ""}>Hellblau</option>
                    </select>
                  </label>
                </div>
              </details>

              <details class="profile-disclosure" data-profile-settings="adhs">
                <summary>ADHS-Modus</summary>
                <div class="profile-settings-content">
                  <div class="section-label">Orientierung</div>
                  <div class="toggle-row">
                    <span class="toggle-label">Fokusmaske</span>
                    <button class="toggle" role="switch" aria-checked="${state.focusMode}" data-toggle="focusMode" aria-label="Fokusmaske aktivieren">
                      <span class="toggle-thumb"></span>
                    </button>
                  </div>
                  <label class="range-row" for="ruler-height">
                    <span>Höhe der Lesemaske <output data-value-for="rulerHeight">${state.rulerHeight}%</output></span>
                    <input id="ruler-height" class="range-control" type="range" min="60" max="240" step="10" data-setting="rulerHeight" value="${state.rulerHeight}" aria-label="Höhe der Lesemaske">
                  </label>

              <div class="section-label">Ablenkungen</div>
              <div class="toggle-row">
                <span class="toggle-label">Animationen und Autoplay stoppen</span>
                <button class="toggle" role="switch" aria-checked="${state.reduceDistractions}" data-toggle="reduceDistractions" aria-label="Animationen und Autoplay stoppen">
                  <span class="toggle-thumb"></span>
                </button>
              </div>
              <div class="toggle-row">
                <span class="toggle-label">Banner und Seitenleisten ausblenden</span>
                <button class="toggle" role="switch" aria-checked="${state.hideDistractions}" data-toggle="hideDistractions" aria-label="Banner und Seitenleisten ausblenden">
                  <span class="toggle-thumb"></span>
                </button>
              </div>

              <div class="section-label">Lesen</div>
              <div class="toggle-row">
                <span class="toggle-label">Bionic Reading</span>
                <button class="toggle" role="switch" aria-checked="${state.bionicReading}" data-toggle="bionicReading" aria-label="Bionic Reading aktivieren">
                  <span class="toggle-thumb"></span>
                </button>
              </div>
              <label class="select-row" for="reading-font">
                <span>Leseschrift</span>
                <select id="reading-font" data-setting="readingFont" aria-label="Leseschrift">
                  <option value="system" ${state.readingFont === "system" ? "selected" : ""}>System</option>
                  <option value="opendyslexic" ${state.readingFont === "opendyslexic" ? "selected" : ""}>OpenDyslexic</option>
                  <option value="atkinson" ${state.readingFont === "atkinson" ? "selected" : ""}>Atkinson Hyperlegible</option>
                  <option value="lexend" ${state.readingFont === "lexend" ? "selected" : ""}>Lexend</option>
                </select>
              </label>
              <label class="range-row" for="word-spacing">
                <span>Wortabstand <output data-value-for="wordSpacing">${state.wordSpacing}%</output></span>
                <input id="word-spacing" class="range-control" type="range" min="80" max="180" step="5" data-setting="wordSpacing" value="${state.wordSpacing}" aria-label="Wortabstand">
              </label>
              <div class="toggle-row">
                <span class="toggle-label">Textbreite auf 60 Zeichen begrenzen</span>
                <button class="toggle" role="switch" aria-checked="${state.constrainLineWidth}" data-toggle="constrainLineWidth" aria-label="Textbreite begrenzen">
                  <span class="toggle-thumb"></span>
                </button>
              </div>
              <div class="toggle-row">
                <span class="toggle-label">Aktuellen Absatz hervorheben</span>
                <button class="toggle" role="switch" aria-checked="${state.highlightParagraph}" data-toggle="highlightParagraph" aria-label="Aktuellen Absatz hervorheben">
                  <span class="toggle-thumb"></span>
                </button>
              </div>
              <div class="toggle-row">
                <span class="toggle-label">Satz beim Vorlesen hervorheben</span>
                <button class="toggle" role="switch" aria-checked="${state.highlightSentence}" data-toggle="highlightSentence" aria-label="Satz hervorheben">
                  <span class="toggle-thumb"></span>
                </button>
              </div>

              <div class="section-label">Lesezeit und Fokus-Timer</div>
              <div id="reading-time-row" class="info-row"><span>Geschätzte Lesezeit</span><strong id="reading-time">Wird berechnet</strong></div>
              <div class="toggle-row">
                <span class="toggle-label">Fokus-Timer einschalten</span>
                <button class="toggle" role="switch" aria-checked="${state.pomodoroEnabled}" data-toggle="pomodoroEnabled" aria-label="Fokus-Timer einschalten">
                  <span class="toggle-thumb"></span>
                </button>
              </div>
              <div id="timer-controls" ${state.pomodoroEnabled ? "" : "hidden"}>
              <div class="timer-settings">
                <label for="pomodoro-minutes">Fokus (Min.)</label>
                <input id="pomodoro-minutes" type="number" min="1" max="90" data-setting="pomodoroMinutes" value="${state.pomodoroMinutes}" aria-label="Fokusdauer in Minuten">
                <label for="break-minutes">Pause (Min.)</label>
                <input id="break-minutes" type="number" min="1" max="30" data-setting="breakMinutes" value="${state.breakMinutes}" aria-label="Pausendauer in Minuten">
              </div>
              <div class="action-row">
                <button class="action-btn" type="button" data-timer="start">Start</button>
                <button class="action-btn" type="button" data-timer="pause">Pause</button>
                <button class="action-btn" type="button" data-timer="reset">Zurücksetzen</button>
              </div>
              <div id="timer-status" class="inline-status" role="timer" aria-live="off">25:00 Fokus</div>
              <div id="timer-notice" class="calm-notice" role="status" aria-live="polite" hidden>
                <span id="timer-notice-text"></span>
                <button type="button" data-dismiss="timer-notice" aria-label="Hinweis schließen">Schließen</button>
              </div>
              <div class="toggle-row">
                <span class="toggle-label">Sanften Ton am Timerende</span>
                <button class="toggle" role="switch" aria-checked="${state.timerSound}" data-toggle="timerSound" aria-label="Timer-Ton aktivieren">
                  <span class="toggle-thumb"></span>
                </button>
              </div>
              </div>

              <div class="section-label">Kurzfassung und Struktur</div>
              <div class="toggle-row">
                <span class="toggle-label">Inhaltsverzeichnis anzeigen</span>
                <button class="toggle" role="switch" aria-checked="${state.summaryMode}" data-toggle="summaryMode" aria-label="Inhaltsverzeichnis anzeigen">
                  <span class="toggle-thumb"></span>
                </button>
              </div>
              <div id="page-outline" class="page-outline" hidden></div>
              <div class="toggle-row">
                <span class="toggle-label">Lange Absätze einklappbar machen</span>
                <button class="toggle" role="switch" aria-checked="${state.collapseLongParagraphs}" data-toggle="collapseLongParagraphs" aria-label="Lange Absätze einklappbar machen">
                  <span class="toggle-thumb"></span>
                </button>
              </div>
              <div class="section-label">Ruhige Darstellung</div>
              <label class="select-row" for="color-theme">
                <span>Farbschema</span>
                <select id="color-theme" data-setting="colorTheme" aria-label="Farbschema">
                  <option value="normal" ${state.colorTheme === "normal" ? "selected" : ""}>Standard</option>
                  <option value="soft" ${state.colorTheme === "soft" ? "selected" : ""}>Gedämpft</option>
                  <option value="sepia" ${state.colorTheme === "sepia" ? "selected" : ""}>Sepia</option>
                  <option value="dark" ${state.colorTheme === "dark" ? "selected" : ""}>Dunkel</option>
                  <option value="cream" ${state.colorTheme === "cream" ? "selected" : ""}>Creme</option>
                  <option value="lightblue" ${state.colorTheme === "lightblue" ? "selected" : ""}>Hellblau</option>
                </select>
              </label>
              <div class="toggle-row">
                <span class="toggle-label">Farbsättigung reduzieren</span>
                <button class="toggle" role="switch" aria-checked="${state.reducedSaturation}" data-toggle="reducedSaturation" aria-label="Farbsättigung reduzieren">
                  <span class="toggle-thumb"></span>
                </button>
              </div>
              <div class="toggle-row">
                <span class="toggle-label">Hinweise dezent anzeigen</span>
                <button class="toggle" role="switch" aria-checked="${state.calmNotifications}" data-toggle="calmNotifications" aria-label="Dezente Hinweise aktivieren">
                  <span class="toggle-thumb"></span>
                </button>
              </div>

                </div>
              </details>
            </div>
            <button id="reset-all" class="reset-all-btn" type="button">Alles zurücksetzen</button>
          </div>
        </div>
      </div>
      <div id="reading-progress" class="reading-progress" role="progressbar" aria-label="Lesefortschritt" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="0 Prozent">
        <div class="reading-progress-fill" id="reading-progress-fill"></div>
        <span class="reading-progress-label" id="reading-progress-label">Lesefortschritt 0%</span>
      </div>
      <div id="reading-ruler" class="reading-ruler" aria-hidden="true"></div>
      <div id="reading-magnifier" class="reading-magnifier" aria-hidden="true">
        <span class="reading-magnifier-title">Ausschnitt unter dem Zeiger · 2×</span>
        <div id="reading-magnifier-viewport" class="reading-magnifier-viewport">
          <div id="reading-magnifier-content" class="reading-magnifier-content"></div>
        </div>
      </div>
    `;

    // ── Event Wiring ────────────────────────────────────────────────
    const $ = (sel) => shadow.querySelector(sel);
    const $$ = (sel) => shadow.querySelectorAll(sel);
    const trigger = $("#a11y-trigger");
    const panel = $("#a11y-panel");
    const closeBtn = $("#a11y-close");
    const wrapper = $("#wrapper");
    const readingProgress = $("#reading-progress");
    const readingProgressFill = $("#reading-progress-fill");
    const readingProgressLabel = $("#reading-progress-label");
    const readingRuler = $("#reading-ruler");
    const readingMagnifier = $("#reading-magnifier");
    const readingMagnifierViewport = $("#reading-magnifier-viewport");
    const readingMagnifierContent = $("#reading-magnifier-content");
    const readingTimeValue = $("#reading-time");
    const readingTimeRow = $("#reading-time-row");
    const timerControls = $("#timer-controls");
    const timerStatus = $("#timer-status");
    const timerNotice = $("#timer-notice");
    const timerNoticeText = $("#timer-notice-text");
    const speechStatus = $("#speech-status");
    let magnifierSource = null;
    let magnifierClone = null;
    let currentReadingScope = null;
    let speechUtterance = null;
    let speechRoot = null;
    let speechBaseOffset = 0;
    let speechSentences = [];
    let timerInterval = null;
    let timerDeadline = 0;
    let timerRemaining = state.pomodoroMinutes * 60;
    let timerPhase = "Fokus";
    let readingRulerX = 0;
    let readingRulerY = 0;
    let readingRulerHeight = 0;
    let pointerFrame = 0;
    let pendingPointer = null;
    let bionicActive = false;
    let distractionsPaused = false;
    let contentObserver = null;
    let currentParagraph = null;
    let summaryActive = false;
    let readingTimeFrame = 0;
    const bionicOriginals = new Map();
    const pausedAnimations = new Set();
    const pausedCarousels = new Map();
    const collapsedParagraphs = new Map();
    const generatedHeadingIds = new Map();

    function calculateReadingTime(scope = null) {
      const source = scope || currentReadingScope || document.querySelector("main, [role='main'], article") || document.body;
      const words = source.textContent.trim().split(/\s+/).filter(Boolean).length;
      const minutes = Math.max(1, Math.ceil(words / 200));
      readingTimeValue.textContent = `ca. ${minutes} Min.`;
    }

    function updateReadingTimeScope(target) {
      if (!state.readingTime || !(target instanceof Element)) return;
      const nextScope = target.closest("section, article, main, [role='main']");
      if (nextScope === currentReadingScope) return;
      currentReadingScope = nextScope;
      calculateReadingTime(nextScope);
    }

    function createTextRange(root, start, end) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          return parent && !parent.closest(`#${WIDGET_ID}, script, style, noscript, [aria-hidden="true"]`)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      });
      let offset = 0;
      let startNode = null;
      let endNode = null;
      let startOffset = 0;
      let endOffset = 0;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const nextOffset = offset + node.nodeValue.length;
        if (!startNode && start <= nextOffset) {
          startNode = node;
          startOffset = Math.max(0, start - offset);
        }
        if (startNode && end <= nextOffset) {
          endNode = node;
          endOffset = Math.max(0, end - offset);
          break;
        }
        offset = nextOffset;
      }
      if (!startNode || !endNode) return null;
      const range = document.createRange();
      range.setStart(startNode, Math.min(startOffset, startNode.nodeValue.length));
      range.setEnd(endNode, Math.min(endOffset, endNode.nodeValue.length));
      return range;
    }

    function clearSpeechHighlight() {
      if (window.CSS?.highlights) window.CSS.highlights.delete("a11y-speech");
    }

    function highlightSpeechSentence(charIndex) {
      if (!state.highlightSentence || speechBaseOffset < 0 || !window.CSS?.highlights || typeof Highlight === "undefined") return;
      const sentence = speechSentences.find((item) => charIndex >= item.start && charIndex <= item.end);
      if (!sentence || !speechRoot) return;
      const range = createTextRange(speechRoot, speechBaseOffset + sentence.start, speechBaseOffset + sentence.end);
      if (range) window.CSS.highlights.set("a11y-speech", new Highlight(range));
    }

    function getSpeechSource() {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim()) {
        const range = selection.getRangeAt(0);
        const ancestor = range.commonAncestorContainer;
        const element = ancestor.nodeType === Node.ELEMENT_NODE ? ancestor : ancestor.parentElement;
        const root = element.closest(CONFIG.textSelectors) || element.closest("main, [role='main'], article") || document.body;
        const selectedText = selection.toString();
        let offset = -1;
        try {
          const prefix = document.createRange();
          prefix.selectNodeContents(root);
          prefix.setEnd(range.startContainer, range.startOffset);
          offset = prefix.toString().length;
        } catch (_) { /* Die Auswahl kann über den Textabschnitt hinausgehen. */ }
        return { root, text: selectedText, offset };
      }
      const focused = document.activeElement instanceof Element
        ? document.activeElement.closest(CONFIG.textSelectors)
        : null;
      const root = currentParagraph || focused || document.querySelector("main, [role='main'], article") || document.body;
      return { root, text: root.textContent, offset: 0 };
    }

    function startSpeech() {
      if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
        speechStatus.textContent = "Vorlesen wird von diesem Browser nicht unterstützt.";
        return;
      }
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        speechStatus.textContent = "Vorlesen fortgesetzt.";
        return;
      }
      if (window.speechSynthesis.speaking) return;

      const source = getSpeechSource();
      if (!source.text.trim()) {
        speechStatus.textContent = "Kein lesbarer Text gefunden.";
        return;
      }
      speechRoot = source.root;
      speechBaseOffset = source.offset;
      speechSentences = [];
      const sentencePattern = /[^.!?。！？]+(?:[.!?。！？]+|$)/g;
      let match;
      while ((match = sentencePattern.exec(source.text))) {
        speechSentences.push({ start: match.index, end: match.index + match[0].length });
      }

      speechUtterance = new SpeechSynthesisUtterance(source.text);
      speechUtterance.lang = document.documentElement.lang || "de-DE";
      speechUtterance.rate = state.speechRate;
      speechUtterance.onboundary = (event) => highlightSpeechSentence(event.charIndex || 0);
      speechUtterance.onend = () => {
        clearSpeechHighlight();
        speechStatus.textContent = "Vorlesen beendet.";
      };
      speechUtterance.onerror = () => {
        clearSpeechHighlight();
        speechStatus.textContent = "Vorlesen konnte nicht gestartet werden.";
      };
      window.speechSynthesis.speak(speechUtterance);
      speechStatus.textContent = "Vorlesen läuft.";
    }

    function pauseSpeech() {
      if (!window.speechSynthesis?.speaking) return;
      window.speechSynthesis.pause();
      speechStatus.textContent = "Vorlesen pausiert.";
    }

    function stopSpeech() {
      window.speechSynthesis?.cancel();
      clearSpeechHighlight();
      speechStatus.textContent = "Vorlesen gestoppt.";
    }

    function formatTimer(seconds) {
      const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
      const remainder = Math.max(0, seconds % 60).toString().padStart(2, "0");
      return `${minutes}:${remainder}`;
    }

    function updateTimerDisplay() {
      timerStatus.textContent = `${formatTimer(timerRemaining)} ${timerPhase}`;
    }

    function playTimerTone() {
      if (!state.timerSound) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0.04, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.35);
      oscillator.onended = () => context.close();
    }

    function showTimerNotice(message) {
      timerNoticeText.textContent = message;
      timerNotice.hidden = false;
      timerNotice.classList.toggle("assertive", !state.calmNotifications);
      timerNotice.setAttribute("aria-live", state.calmNotifications ? "polite" : "assertive");
      playTimerTone();
    }

    function startTimer() {
      if (!state.pomodoroEnabled || timerInterval) return;
      if (timerRemaining <= 0) {
        timerRemaining = (timerPhase === "Fokus" ? state.pomodoroMinutes : state.breakMinutes) * 60;
      }
      timerDeadline = Date.now() + timerRemaining * 1000;
      timerInterval = window.setInterval(() => {
        timerRemaining = Math.max(0, Math.ceil((timerDeadline - Date.now()) / 1000));
        updateTimerDisplay();
        if (timerRemaining === 0) {
          window.clearInterval(timerInterval);
          timerInterval = null;
          const message = timerPhase === "Fokus" ? "Fokuszeit beendet. Zeit für eine Pause." : "Pause beendet. Du kannst weiterarbeiten.";
          timerPhase = timerPhase === "Fokus" ? "Pause" : "Fokus";
          showTimerNotice(message);
        }
      }, 1000);
    }

    function pauseTimer() {
      if (!timerInterval) return;
      timerRemaining = Math.max(0, Math.ceil((timerDeadline - Date.now()) / 1000));
      window.clearInterval(timerInterval);
      timerInterval = null;
      updateTimerDisplay();
    }

    function resetTimer() {
      if (timerInterval) window.clearInterval(timerInterval);
      timerInterval = null;
      timerPhase = "Fokus";
      timerRemaining = state.pomodoroMinutes * 60;
      timerNotice.hidden = true;
      updateTimerDisplay();
    }

    function applyBionicReading(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!node.nodeValue.trim() || !parent || parent.closest(`#${WIDGET_ID}, script, style, noscript, .a11y-bionic-word, [aria-hidden="true"]`)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);

      textNodes.forEach((textNode) => {
        const parts = textNode.nodeValue.match(/\s+|[^\s]+/g);
        if (!parts || !textNode.parentNode) return;
        const container = document.createElement("span");
        container.className = "a11y-bionic-word";
        parts.forEach((part) => {
          if (/^\s+$/.test(part)) {
            container.appendChild(document.createTextNode(part));
            return;
          }
          const boldLength = Math.max(1, Math.ceil(part.length * 0.4));
          const bold = document.createElement("strong");
          bold.textContent = part.slice(0, boldLength);
          container.append(bold, document.createTextNode(part.slice(boldLength)));
        });
        bionicOriginals.set(container, textNode);
        textNode.replaceWith(container);
      });
    }

    function restoreBionicReading() {
      bionicOriginals.forEach((original, container) => {
        if (container.parentNode) container.replaceWith(original);
      });
      bionicOriginals.clear();
    }

    function pauseAutoplayWithin(root) {
      pauseAutoplayMedia(root);
    }

    function restoreAutoplay() {
      pauseAutoplayMedia();
    }

    function pauseMotionWithin(root) {
      const carouselSelector = '[data-carousel], [class*="carousel"], [class*="slider"], [class*="swiper"]';
      const carousels = [];
      if (root instanceof Element && root.matches(carouselSelector)) carousels.push(root);
      if (root.querySelectorAll) carousels.push(...root.querySelectorAll(carouselSelector));

      carousels.forEach((element) => {
        const swiper = element.swiper;
        if (swiper?.autoplay?.running && !pausedCarousels.has(element)) {
          swiper.autoplay.stop();
          pausedCarousels.set(element, () => swiper.autoplay.start());
        }
        const jquery = window.jQuery;
        if (jquery?.fn?.slick && jquery(element).hasClass("slick-initialized") && !pausedCarousels.has(element)) {
          const slider = jquery(element).slick("getSlick");
          if (slider?.slickPause) {
            slider.slickPause();
            pausedCarousels.set(element, () => slider.slickPlay?.());
          }
        }
      });

      if (!document.getAnimations) return;
      document.getAnimations().forEach((animation) => {
        const target = animation.effect?.target;
        const insideRoot = root === document || target === root || (target && root.contains && root.contains(target));
        if (insideRoot && animation.playState === "running") {
          animation.pause();
          pausedAnimations.add(animation);
        }
      });
    }

    function resumeMotion() {
      if (shouldReduceMotion()) return;
      pausedAnimations.forEach((animation) => {
        if (animation.playState === "paused") animation.play();
      });
      pausedAnimations.clear();
      pausedCarousels.forEach((resume) => resume());
      pausedCarousels.clear();
    }

    function updatePageOutline() {
      const outline = $("#page-outline");
      outline.replaceChildren();
      outline.hidden = !state.summaryMode;
      if (!state.summaryMode) {
        generatedHeadingIds.forEach((originalId, heading) => {
          if (originalId === null && heading.id.startsWith("a11y-heading-")) heading.removeAttribute("id");
        });
        generatedHeadingIds.clear();
        return;
      }

      const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"))
        .filter((heading) => !heading.closest(`#${WIDGET_ID}`) && heading.textContent.trim());
      headings.forEach((heading, index) => {
        if (!heading.id) {
          let id = `a11y-heading-${index + 1}`;
          while (document.getElementById(id)) id += "-x";
          generatedHeadingIds.set(heading, null);
          heading.id = id;
        }
        const link = document.createElement("a");
        link.href = `#${encodeURIComponent(heading.id)}`;
        link.textContent = heading.textContent.trim();
        link.style.paddingInlineStart = `${(Number(heading.tagName.slice(1)) - 1) * 10}px`;
        link.addEventListener("click", (event) => {
          event.preventDefault();
          heading.scrollIntoView({ behavior: shouldReduceMotion() ? "auto" : "smooth", block: "start" });
        });
        outline.appendChild(link);
      });
    }

    function updateCollapsibleParagraphs(root) {
      if (!state.collapseLongParagraphs) {
        collapsedParagraphs.forEach((original, paragraph) => {
          paragraph.classList.remove("a11y-collapsible");
          if (original.role === null) paragraph.removeAttribute("role");
          else paragraph.setAttribute("role", original.role);
          if (original.tabIndex === null) paragraph.removeAttribute("tabindex");
          else paragraph.setAttribute("tabindex", original.tabIndex);
          if (original.expanded === null) paragraph.removeAttribute("aria-expanded");
          else paragraph.setAttribute("aria-expanded", original.expanded);
        });
        collapsedParagraphs.clear();
        return;
      }

      const paragraphs = [];
      if (root instanceof Element && root.matches("p")) paragraphs.push(root);
      if (root.querySelectorAll) paragraphs.push(...root.querySelectorAll("p"));
      paragraphs.forEach((paragraph) => {
        if (paragraph.closest(`#${WIDGET_ID}`) || collapsedParagraphs.has(paragraph)) return;
        if (paragraph.querySelector("a, button, input, select, textarea, [tabindex]")) return;
        if (paragraph.textContent.trim().split(/\s+/).length < 90) return;
        collapsedParagraphs.set(paragraph, {
          role: paragraph.getAttribute("role"),
          tabIndex: paragraph.getAttribute("tabindex"),
          expanded: paragraph.getAttribute("aria-expanded"),
        });
        paragraph.classList.add("a11y-collapsible");
        paragraph.setAttribute("role", "button");
        if (!paragraph.hasAttribute("tabindex")) paragraph.setAttribute("tabindex", "0");
        paragraph.setAttribute("aria-expanded", "false");
      });
    }

    function scheduleReadingTimeUpdate() {
      if (!state.readingTime || readingTimeFrame) return;
      readingTimeFrame = window.requestAnimationFrame(() => {
        readingTimeFrame = 0;
        calculateReadingTime();
      });
    }

    function toggleCollapsedParagraph(paragraph) {
      if (!paragraph || !paragraph.classList.contains("a11y-collapsible")) return;
      const expanded = paragraph.getAttribute("aria-expanded") === "true";
      paragraph.setAttribute("aria-expanded", String(!expanded));
    }

    function updateParagraphHighlight(target) {
      if (!state.highlightParagraph || !(target instanceof Element)) {
        if (currentParagraph) currentParagraph.removeAttribute("data-a11y-current-paragraph");
        currentParagraph = null;
        return;
      }
      const next = target.closest(CONFIG.textSelectors);
      if (!next || next.closest(`#${WIDGET_ID}`) || next === currentParagraph) return;
      if (currentParagraph) currentParagraph.removeAttribute("data-a11y-current-paragraph");
      currentParagraph = next;
      currentParagraph.setAttribute("data-a11y-current-paragraph", "true");
    }

    function updateDynamicReadingAids() {
      if (state.bionicReading && !bionicActive) {
        applyBionicReading(document.body);
        bionicActive = true;
      } else if (!state.bionicReading && bionicActive) {
        restoreBionicReading();
        bionicActive = false;
      }

      const motionReductionActive = shouldReduceMotion();
      if (motionReductionActive && !distractionsPaused) {
        pauseAutoplayWithin(document);
        pauseMotionWithin(document);
        distractionsPaused = true;
      } else if (!motionReductionActive && distractionsPaused) {
        restoreAutoplay();
        resumeMotion();
        distractionsPaused = false;
      }

      const observeContent = state.bionicReading || motionReductionActive || state.readingTime || state.collapseLongParagraphs || state.summaryMode;
      if (observeContent && !contentObserver) {
        contentObserver = new MutationObserver((records) => {
          records.forEach((record) => record.addedNodes.forEach((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            if (state.bionicReading) applyBionicReading(node);
            if (shouldReduceMotion()) {
              pauseAutoplayWithin(node);
              pauseMotionWithin(node);
            }
            if (state.collapseLongParagraphs) updateCollapsibleParagraphs(node);
          }));
          if (state.summaryMode) updatePageOutline();
          scheduleReadingTimeUpdate();
        });
        contentObserver.observe(document.body, { childList: true, subtree: true });
      } else if (!observeContent && contentObserver) {
        contentObserver.disconnect();
        contentObserver = null;
      }

      updateCollapsibleParagraphs(document.body);
      if (state.summaryMode !== summaryActive) {
        summaryActive = state.summaryMode;
        updatePageOutline();
      }

      if (!state.highlightParagraph && currentParagraph) {
        currentParagraph.removeAttribute("data-a11y-current-paragraph");
        currentParagraph = null;
      }
      if (!state.highlightSentence) clearSpeechHighlight();
    }

    window.addEventListener("a11y-motion-preference-change", updateDynamicReadingAids);

    function updateReadingAids() {
      readingProgress.classList.toggle("visible", !!state.readingProgress);
      readingRuler.classList.toggle("visible", !!state.readingRuler || !!state.focusMode);
      readingRuler.classList.toggle("focus-mask", !!state.focusMode);
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
      const percent = Math.round(progress * 100);
      readingProgressFill.style.width = `${percent}%`;
      readingProgress.setAttribute("aria-valuenow", String(percent));
      readingProgress.setAttribute("aria-valuetext", `${percent} Prozent`);
      readingProgressLabel.textContent = `Lesefortschritt ${percent}%`;
      readingMagnifier.classList.toggle("visible", !!state.readingMagnifier && !!magnifierClone);
      readingMagnifier.setAttribute("aria-hidden", String(!state.readingMagnifier));
    }

    function getReadingLineRect(x, y) {
      const target = document.elementFromPoint(x, y);
      if (!target || target.closest(`#${WIDGET_ID}`)) return null;

      let caretRect = null;
      let textElement = null;
      if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(x, y);
        if (range) {
          caretRect = range.getBoundingClientRect();
          textElement = range.startContainer.nodeType === Node.ELEMENT_NODE
            ? range.startContainer
            : range.startContainer.parentElement;
        }
      } else if (document.caretPositionFromPoint) {
        const position = document.caretPositionFromPoint(x, y);
        if (position) {
          const range = document.createRange();
          range.setStart(position.offsetNode, position.offset);
          range.collapse(true);
          caretRect = range.getBoundingClientRect();
          textElement = position.offsetNode.nodeType === Node.ELEMENT_NODE
            ? position.offsetNode
            : position.offsetNode.parentElement;
        }
      }

      if (caretRect && caretRect.height && textElement) {
        const style = getComputedStyle(textElement);
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
        return {
          top: caretRect.top + caretRect.height / 2 - lineHeight / 2,
          height: lineHeight,
        };
      }

      const bounds = target.getBoundingClientRect();
      const style = getComputedStyle(target);
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
      const lineIndex = Math.max(0, Math.floor((y - bounds.top) / lineHeight));
      return {
        top: bounds.top + lineIndex * lineHeight,
        height: lineHeight,
      };
    }

    function positionReadingRuler(x, y) {
      const line = getReadingLineRect(x, y);
      if (!line) return;

      readingRulerHeight = line.height * state.rulerHeight / 100;
      readingRulerY = line.top + line.height / 2;
      readingRulerX = x;
      const top = line.top + (line.height - readingRulerHeight) / 2;
      readingRuler.style.height = `${readingRulerHeight}px`;
      readingRuler.style.top = `${Math.max(0, Math.min(window.innerHeight - readingRulerHeight, top))}px`;
    }

    function stepReadingRuler(event) {
      if ((!state.readingRuler && !state.focusMode) || !readingRulerHeight) return;
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      if (event.target instanceof Element && event.target.closest(`#${WIDGET_ID}, input, textarea, select, [contenteditable="true"]`)) return;

      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextY = Math.max(0, Math.min(
        window.innerHeight - 1,
        readingRulerY + direction * readingRulerHeight
      ));
      positionReadingRuler(readingRulerX, nextY);
    }

    function updateReadingMagnifier(x, y) {
      if (!state.readingMagnifier) return;
      const target = document.elementFromPoint(x, y);
      if (!target || target.closest(`#${WIDGET_ID}, script, style, noscript, iframe, video, audio`)) {
        readingMagnifier.classList.remove("visible");
        magnifierSource = null;
        magnifierClone = null;
        readingMagnifierContent.replaceChildren();
        return;
      }

      const source = target.closest("p, li, h1, h2, h3, h4, h5, h6, blockquote, figcaption, td, th, label, article, section, div") || target;
      const bounds = source.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;

      if (source !== magnifierSource) {
        magnifierSource = source;
        magnifierClone = source.cloneNode(true);

        const copyComputedStyles = (original, copy) => {
          if (original.nodeType === Node.ELEMENT_NODE && copy.nodeType === Node.ELEMENT_NODE) {
            const computed = getComputedStyle(original);
            for (let index = 0; index < computed.length; index += 1) {
              const property = computed[index];
              copy.style.setProperty(property, computed.getPropertyValue(property), "important");
            }
            Array.from(original.children).forEach((child, index) => {
              if (copy.children[index]) copyComputedStyles(child, copy.children[index]);
            });
          }
        };

        copyComputedStyles(source, magnifierClone);
        magnifierClone.setAttribute("aria-hidden", "true");
        magnifierClone.setAttribute("inert", "");
        magnifierClone.style.setProperty("position", "absolute", "important");
        magnifierClone.style.setProperty("left", "0", "important");
        magnifierClone.style.setProperty("top", "0", "important");
        magnifierClone.style.setProperty("width", `${bounds.width}px`, "important");
        magnifierClone.style.setProperty("height", `${bounds.height}px`, "important");
        magnifierClone.style.setProperty("max-width", "none", "important");
        magnifierClone.style.setProperty("max-height", "none", "important");
        magnifierClone.style.setProperty("margin", "0", "important");
        magnifierClone.style.setProperty("transform-origin", "top left", "important");
        readingMagnifierContent.replaceChildren(magnifierClone);
      }

      const scale = 2;
      const localX = Math.max(0, Math.min(bounds.width, x - bounds.left));
      const localY = Math.max(0, Math.min(bounds.height, y - bounds.top));
      magnifierClone.style.setProperty("transform", `scale(${scale})`, "important");
      magnifierClone.style.setProperty("left", `${readingMagnifierViewport.clientWidth / 2 - localX * scale}px`, "important");
      magnifierClone.style.setProperty("top", `${readingMagnifierViewport.clientHeight / 2 - localY * scale}px`, "important");

      const lensLeft = Math.max(8, Math.min(window.innerWidth - 308, x + 24));
      const lensTop = Math.max(8, Math.min(window.innerHeight - 168, y + 24));
      readingMagnifier.style.left = `${lensLeft}px`;
      readingMagnifier.style.top = `${lensTop}px`;
      readingMagnifier.classList.add("visible");
    }

    document.addEventListener("mousemove", (event) => {
      pendingPointer = { x: event.clientX, y: event.clientY, target: event.target };
      if (pointerFrame) return;
      pointerFrame = window.requestAnimationFrame(() => {
        pointerFrame = 0;
        const pointer = pendingPointer;
        pendingPointer = null;
        if (!pointer) return;
        if (state.readingRuler || state.focusMode) positionReadingRuler(pointer.x, pointer.y);
        if (state.highlightParagraph) updateParagraphHighlight(pointer.target);
        updateReadingTimeScope(pointer.target);
        if (state.readingMagnifier) updateReadingMagnifier(pointer.x, pointer.y);
      });
    }, { passive: true });
    document.addEventListener("focusin", (e) => {
      if (!(e.target instanceof Element)) return;
      const bounds = e.target.getBoundingClientRect();
      if (state.readingRuler || state.focusMode) positionReadingRuler(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      if (state.highlightParagraph) updateParagraphHighlight(e.target);
      updateReadingTimeScope(e.target);
      if (state.readingMagnifier) updateReadingMagnifier(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    });
    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const paragraph = event.target.closest("p.a11y-collapsible");
      if (!paragraph || event.target.closest("a, button, input, select, textarea")) return;
      toggleCollapsedParagraph(paragraph);
    });
    document.addEventListener("keydown", (event) => {
      if (!(event.target instanceof Element) || !event.target.matches("p.a11y-collapsible")) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleCollapsedParagraph(event.target);
    });
    document.addEventListener("keydown", stepReadingRuler);
    window.addEventListener("scroll", updateReadingAids, { passive: true });
    window.addEventListener("resize", updateReadingAids);

    // ── Panel toggle ────────────────────────────────────────────────
    let panelOpen = false;

    function openPanel() {
      panelOpen = true;
      panel.classList.remove("hidden");
      trigger.setAttribute("aria-expanded", "true");
      trigger.setAttribute("aria-label", "Barrierefreiheits-Einstellungen schließen");
      panel.focus();
    }

    function closePanel() {
      panelOpen = false;
      panel.classList.add("hidden");
      trigger.setAttribute("aria-expanded", "false");
      trigger.setAttribute("aria-label", "Barrierefreiheits-Einstellungen öffnen");
      trigger.focus();
    }

    function togglePanel() {
      panelOpen ? closePanel() : openPanel();
    }

    trigger.addEventListener("click", togglePanel);
    closeBtn.addEventListener("click", closePanel);

    // Click outside to close
    document.addEventListener("click", (e) => {
      if (panelOpen && !e.composedPath().includes(wrapper)) closePanel();
    });

    // Escape to close
    shadow.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && panelOpen) closePanel();
    });

    // Focus trap
    panel.addEventListener("keydown", (e) => {
      if (e.key !== "Tab" || !panelOpen) return;
      const focusable = panel.querySelectorAll(
        'button:not([disabled]), [tabindex="0"]'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (shadow.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (shadow.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    // ── Tab switching ───────────────────────────────────────────────
    const tabBtns = $$(".tab");
    const tabPanels = $$(".tab-panel");

    function switchTab(btn) {
      tabBtns.forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
        b.setAttribute("tabindex", "-1");
      });
      tabPanels.forEach((p) => p.classList.add("hidden"));
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      btn.setAttribute("tabindex", "0");
      const target = shadow.getElementById(btn.getAttribute("aria-controls"));
      if (target) target.classList.remove("hidden");
    }

    tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn));
      btn.addEventListener("keydown", (e) => {
        const tabs = Array.from(tabBtns);
        const idx = tabs.indexOf(btn);
        let next = -1;
        if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
        if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
        if (next >= 0) {
          e.preventDefault();
          tabs[next].focus();
          switchTab(tabs[next]);
        }
      });
    });

    // ── Profile buttons ─────────────────────────────────────────────
    $$(".profile-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = btn.dataset.profile;
        const preset = CONFIG[`${p}Preset`];
        if (preset) {
          if (state.profile !== p) {
            const previousPreset = CONFIG[`${state.profile}Preset`];
            if (previousPreset) {
              Object.keys(previousPreset).forEach((key) => {
                state[key] = defaults[key];
              });
            }
            state.profile = p;
          }
          Object.assign(state, preset);
        } else {
          const previousPreset = CONFIG[`${state.profile}Preset`];
          if (previousPreset) {
            Object.keys(previousPreset).forEach((key) => {
              state[key] = defaults[key];
            });
          }
          state.profile = state.profile === p ? null : p;
        }
        shadow.querySelectorAll("[data-profile-settings]").forEach((details) => {
          details.open = details.dataset.profileSettings === p;
        });
        syncUI();
        applyGlobalStyles();
        saveState();
        if (preset) switchTab($("#btn-reading"));
      });
    });

    $("#reset-all").addEventListener("click", () => {
      stopSpeech();
      if (timerInterval) window.clearInterval(timerInterval);
      timerInterval = null;
      state = { ...defaults };
      timerPhase = "Fokus";
      timerRemaining = state.pomodoroMinutes * 60;
      timerNotice.hidden = true;
      syncUI();
      applyGlobalStyles();
      saveState();
    });

    $$('[data-speech]').forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.speech === "play") startSpeech();
        if (button.dataset.speech === "pause") pauseSpeech();
        if (button.dataset.speech === "stop") stopSpeech();
      });
    });

    $$('[data-timer]').forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.timer === "start") startTimer();
        if (button.dataset.timer === "pause") pauseTimer();
        if (button.dataset.timer === "reset") resetTimer();
      });
    });

    $('[data-dismiss="timer-notice"]').addEventListener("click", () => {
      timerNotice.hidden = true;
    });

    // ── Contrast buttons ────────────────────────────────────────────
    $$(".contrast-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.contrast = btn.dataset.contrast;
        syncUI();
        applyGlobalStyles();
        saveState();
      });
    });

    // ── Steppers ────────────────────────────────────────────────────
    const STEPS = { textSize: 10, lineHeight: 10, letterSpacing: 5 };
    const MIN = { textSize: 60, lineHeight: 60, letterSpacing: 50 };
    const MAX = { textSize: 400, lineHeight: 200, letterSpacing: 200 };

    $$(".stepper-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const [prop, action] = btn.dataset.action.split("-");
        if (action === "reset") {
          state[prop] = defaults[prop];
        } else if (action === "up") {
          state[prop] = Math.min(state[prop] + STEPS[prop], MAX[prop]);
        } else if (action === "down") {
          state[prop] = Math.max(state[prop] - STEPS[prop], MIN[prop]);
        }
        syncUI();
        applyGlobalStyles();
        saveState();
      });
    });

    // ── Alignment buttons ───────────────────────────────────────────
    $$(".align-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.textAlign = btn.dataset.align;
        syncUI();
        applyGlobalStyles();
        saveState();
      });
    });

    $$('[data-setting]').forEach((input) => {
      const updateSetting = () => {
        const key = input.dataset.setting;
        if (input.type === "range" || input.type === "number") {
          const value = Number(input.value);
          state[key] = Math.min(Number(input.max) || value, Math.max(Number(input.min) || value, value));
        } else {
          state[key] = input.value;
        }
        if ((key === "pomodoroMinutes" || key === "breakMinutes") && !timerInterval && timerPhase === "Fokus") {
          timerRemaining = state.pomodoroMinutes * 60;
        }
        syncUI();
        applyGlobalStyles();
        saveState();
      };
      input.addEventListener(input.type === "range" ? "input" : "change", updateSetting);
    });

    // ── Toggle switches ─────────────────────────────────────────────
    $$(".toggle").forEach((t) => {
      t.addEventListener("click", () => {
        const key = t.dataset.toggle;
        state[key] = !state[key];
        if (key === "readingRuler" && !state.readingRuler) state.focusMode = false;
        syncUI();
        applyGlobalStyles();
        saveState();
      });
    });

    // ── Sync UI to state ────────────────────────────────────────────
    function syncUI() {
      // Profiles
      $$(".profile-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.profile === state.profile);
      });

      // Contrast
      $$(".contrast-btn").forEach((b) => {
        const active = b.dataset.contrast === state.contrast;
        b.classList.toggle("active", active);
        b.setAttribute("aria-pressed", String(active));
      });

      // Steppers
      $$(".stepper-value").forEach((v) => {
        const prop = v.id.replace("-val", "");
        v.textContent = state[prop] + "%";
      });

      // Alignment
      $$(".align-btn").forEach((b) => {
        const active = b.dataset.align === state.textAlign;
        b.classList.toggle("active", active);
        b.setAttribute("aria-pressed", String(active));
      });

      // Toggles
      $$(".toggle").forEach((t) => {
        const key = t.dataset.toggle;
        const on = !!state[key];
        t.setAttribute("aria-checked", String(on));
        t.classList.toggle("on", on);
      });

      $$('[data-setting]').forEach((input) => {
        const key = input.dataset.setting;
        input.value = state[key];
        shadow.querySelectorAll(`[data-value-for="${key}"]`).forEach((output) => {
          output.textContent = key === "speechRate" ? `${Number(state[key]).toFixed(1)}×` : `${state[key]}%`;
        });
      });

      readingTimeRow.hidden = !state.readingTime;
      timerControls.hidden = !state.pomodoroEnabled;
      if (!state.pomodoroEnabled && timerInterval) pauseTimer();
      if (state.readingTime) calculateReadingTime();
      updateTimerDisplay();
      updateReadingAids();
      updateDynamicReadingAids();
    }

    syncUI();
  }

  // ── Widget Shadow DOM CSS ────────────────────────────────────────
  function widgetCSS() {
    return `
      :host {
        all: initial;
        font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        font-size: 16px;
        line-height: 1.4;
        color: #1a1a2e;
      }

      *, *::before, *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      [hidden] {
        display: none !important;
      }

      .wrapper {
        position: fixed;
        bottom: 20px;
        left: 20px;
        z-index: 999999;
      }

      :host([data-reduced-motion]) *,
      :host([data-reduced-motion]) *::before,
      :host([data-reduced-motion]) *::after {
        animation-duration: 0.001ms !important;
        animation-delay: 0ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.001ms !important;
        scroll-behavior: auto !important;
      }

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.001ms !important;
          animation-delay: 0ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.001ms !important;
          scroll-behavior: auto !important;
        }
      }

      .reading-progress {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 10px;
        background: #e2e8f0;
        visibility: hidden;
        pointer-events: none;
        z-index: 999998;
      }
      .reading-progress-fill {
        width: 0;
        height: 100%;
        background: #005fcc;
        box-shadow: 0 1px 5px rgba(0, 95, 204, 0.45);
        transition: width 0.12s linear;
      }
      .reading-progress-label {
        position: absolute;
        top: 16px;
        right: 12px;
        padding: 6px 10px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        background: #fff;
        color: #172033;
        font-size: 14px;
        font-weight: 700;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.16);
      }
      .reading-progress.visible,
      .reading-ruler.visible,
      .reading-magnifier.visible {
        visibility: visible;
      }
      .reading-ruler {
        position: fixed;
        left: 0;
        right: 0;
        background: rgba(255, 235, 59, 0.18);
        border-block: 1px solid rgba(0, 0, 0, 0.45);
        visibility: hidden;
        pointer-events: none;
        z-index: 999997;
      }
      .reading-ruler.focus-mask {
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.58);
      }
      .reading-magnifier {
        position: fixed;
        width: min(300px, calc(100vw - 16px));
        height: 160px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        gap: 5px;
        padding: 8px;
        border: 3px solid #005fcc;
        border-radius: 14px;
        background: #fff;
        color: #172033;
        font-size: 24px;
        font-weight: 600;
        line-height: 1.35;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
        visibility: hidden;
        pointer-events: none;
        z-index: 999996;
      }
      .reading-magnifier-title {
        color: #005fcc;
        font-size: 12px;
        font-weight: 800;
        text-transform: uppercase;
      }
      .reading-magnifier-viewport {
        position: relative;
        flex: 1;
        overflow: hidden;
        border: 1px solid #cbd5e1;
        background: #fff;
      }
      .reading-magnifier-content {
        position: absolute;
        top: 0;
        left: 0;
        transform-origin: top left;
        pointer-events: none;
      }

      /* ── Trigger Button ─────────────────────────────────────── */
      .trigger-btn {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        border: none;
        background: #005fcc;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(0,0,0,0.25);
        transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
      }
      .trigger-btn:hover {
        background: #004ba3;
        transform: scale(1.06);
        box-shadow: 0 6px 20px rgba(0,0,0,0.30);
      }
      .trigger-btn:focus-visible {
        outline: 3px solid #ff6600;
        outline-offset: 3px;
      }
      .trigger-btn svg {
        pointer-events: none;
      }

      /* ── Panel ──────────────────────────────────────────────── */
      .panel {
        position: absolute;
        bottom: 70px;
        left: 0;
        width: min(380px, calc(100vw - 40px));
        max-height: min(80vh, calc(100vh - 112px));
        max-height: min(80dvh, calc(100dvh - 112px));
        background: #ffffff;
        border-radius: 14px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.18);
        border: 1px solid #e2e2e2;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: a11y-slide-up 0.22s ease-out;
      }
      .panel.hidden {
        display: none !important;
      }

      @keyframes a11y-slide-up {
        from { opacity: 0; transform: translateY(12px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      /* ── Panel Header ───────────────────────────────────────── */
      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 18px;
        background: #f7f8fa;
        border-bottom: 1px solid #e5e5e5;
      }
      .panel-title {
        font-weight: 700;
        font-size: 15px;
        color: #1a1a2e;
      }
      .panel-heading {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .save-status {
        min-height: 1em;
        color: #276749;
        font-size: 14px;
        font-weight: 600;
        visibility: hidden;
      }
      .save-status.visible {
        visibility: visible;
      }
      .save-status.error {
        color: #9b1c1c;
      }
      .icon-btn {
        width: 34px;
        height: 34px;
        border: none;
        background: transparent;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: #555;
        transition: background 0.15s;
      }
      .icon-btn:hover {
        background: #e8e8e8;
      }
      .icon-btn:focus-visible {
        outline: 3px solid #ff6600;
        outline-offset: 2px;
      }

      /* ── Panel Body ─────────────────────────────────────────── */
      .panel-body {
        overflow-y: auto;
        padding: 16px 18px 20px;
        flex: 1;
      }

      /* ── Tabs ───────────────────────────────────────────────── */
      .tabs {
        display: flex;
        gap: 4px;
        margin-bottom: 16px;
        background: #f0f1f3;
        border-radius: 10px;
        padding: 4px;
      }
      .tab {
        flex: 1;
        padding: 8px 6px;
        border: none;
        background: transparent;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        color: #555;
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
      }
      .tab:hover {
        color: #1a1a2e;
      }
      .tab.active {
        background: #fff;
        color: #005fcc;
        box-shadow: 0 1px 4px rgba(0,0,0,0.08);
      }
      .tab:focus-visible {
        outline: 3px solid #ff6600;
        outline-offset: 2px;
      }

      /* ── Tab Panels ─────────────────────────────────────────── */
      .tab-panel.hidden { display: none !important; }

      /* ── Section Labels ─────────────────────────────────────── */
      .section-label {
        font-size: 14px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #888;
        margin-bottom: 10px;
        margin-top: 16px;
      }
      .section-label:first-child { margin-top: 0; }

      /* ── Profile Grid ───────────────────────────────────────── */
      .profile-grid {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 8px;
      }
      .profile-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 14px 6px;
        border: 2px solid #e8e8e8;
        background: #fafbfc;
        border-radius: 10px;
        cursor: pointer;
        transition: border-color 0.15s, background 0.15s, transform 0.1s;
      }
      .profile-btn:hover {
        border-color: #005fcc;
        background: #f0f7ff;
      }
      .profile-btn.active {
        border-color: #005fcc;
        background: #e6f0ff;
        box-shadow: 0 0 0 1px #005fcc inset;
      }
      .profile-btn:focus-visible {
        outline: 3px solid #ff6600;
        outline-offset: 2px;
      }
      .profile-icon {
        font-size: 22px;
        line-height: 1;
      }
      .profile-name {
        font-size: 14px;
        font-weight: 600;
        color: #333;
        text-align: center;
      }

      /* ── Contrast Grid ──────────────────────────────────────── */
      .contrast-grid {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr 1fr;
        gap: 6px;
      }
      .contrast-btn {
        padding: 8px 4px;
        border: 2px solid #e8e8e8;
        background: #fafbfc;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: border-color 0.15s, background 0.15s;
        color: #333;
      }
      .contrast-btn:hover {
        border-color: #005fcc;
      }
      .contrast-btn.active {
        border-color: #005fcc;
        background: #e6f0ff;
        color: #005fcc;
      }
      .contrast-btn:focus-visible {
        outline: 3px solid #ff6600;
        outline-offset: 2px;
      }

      /* ── Steppers ───────────────────────────────────────────── */
      .stepper-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .stepper-btn {
        width: 38px;
        height: 38px;
        border: 2px solid #ddd;
        background: #fafbfc;
        border-radius: 8px;
        font-size: 18px;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #333;
        transition: border-color 0.15s, background 0.15s;
      }
      .stepper-btn:hover {
        border-color: #005fcc;
        background: #f0f7ff;
      }
      .stepper-btn:focus-visible {
        outline: 3px solid #ff6600;
        outline-offset: 2px;
      }
      .stepper-btn.reset {
        margin-left: auto;
        font-size: 16px;
        color: #888;
        border-color: transparent;
        background: transparent;
      }
      .stepper-btn.reset:hover {
        color: #d33;
        border-color: transparent;
        background: #fff0f0;
      }
      .stepper-value {
        min-width: 60px;
        text-align: center;
        font-weight: 700;
        font-size: 16px;
        color: #1a1a2e;
      }

      /* ── Alignment Row ──────────────────────────────────────── */
      .align-row {
        display: flex;
        gap: 6px;
      }
      .align-btn {
        flex: 1;
        padding: 8px 6px;
        border: 2px solid #e8e8e8;
        background: #fafbfc;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: border-color 0.15s, background 0.15s;
        color: #333;
      }
      .align-btn:hover {
        border-color: #005fcc;
      }
      .align-btn.active {
        border-color: #005fcc;
        background: #e6f0ff;
        color: #005fcc;
      }
      .align-btn:focus-visible {
        outline: 3px solid #ff6600;
        outline-offset: 2px;
      }

      /* ── Toggle Switches ────────────────────────────────────── */
      .toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 0;
        border-bottom: 1px solid #f0f0f0;
      }
      .toggle-row:last-child {
        border-bottom: none;
      }
      .toggle-label {
        font-weight: 600;
        font-size: 16px;
        color: #333;
      }
      .toggle {
        width: 48px;
        height: 26px;
        border: none;
        border-radius: 13px;
        background: #ccc;
        position: relative;
        cursor: pointer;
        transition: background 0.2s;
        flex-shrink: 0;
      }
      .toggle.on {
        background: #005fcc;
      }
      .toggle:focus-visible {
        outline: 3px solid #ff6600;
        outline-offset: 3px;
      }
      .toggle-thumb {
        position: absolute;
        top: 3px;
        left: 3px;
        width: 20px;
        height: 20px;
        background: #fff;
        border-radius: 50%;
        box-shadow: 0 1px 4px rgba(0,0,0,0.2);
        transition: transform 0.2s;
        pointer-events: none;
      }
      .toggle.on .toggle-thumb {
        transform: translateX(22px);
      }

      .range-row,
      .select-row,
      .info-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 0;
        color: #333;
        font-size: 15px;
        font-weight: 600;
      }
      .range-row {
        flex-wrap: wrap;
      }
      .range-row span {
        display: flex;
        justify-content: space-between;
        width: 100%;
      }
      .range-control {
        width: 100%;
        min-height: 32px;
        accent-color: #005fcc;
      }
      .select-row select,
      .timer-settings input {
        min-height: 42px;
        max-width: 62%;
        padding: 6px 8px;
        border: 1px solid #767676;
        border-radius: 6px;
        background: #fff;
        color: #222;
        font: inherit;
      }
      .action-row {
        display: flex;
        gap: 8px;
        margin: 8px 0;
      }
      .action-btn,
      .reset-all-btn {
        min-height: 44px;
        padding: 8px 12px;
        border: 1px solid #005fcc;
        border-radius: 6px;
        background: #fff;
        color: #004b9b;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .action-btn {
        flex: 1;
      }
      .reset-all-btn {
        width: 100%;
        margin-top: 16px;
      }
      .action-btn:hover,
      .reset-all-btn:hover {
        background: #edf5ff;
      }
      .action-btn:focus-visible,
      .reset-all-btn:focus-visible,
      .range-control:focus-visible,
      .select-row select:focus-visible,
      .timer-settings input:focus-visible,
      .calm-notice button:focus-visible {
        outline: 3px solid #ff6600;
        outline-offset: 2px;
      }
      .timer-settings {
        display: grid;
        grid-template-columns: 1fr 84px;
        align-items: center;
        gap: 8px;
        padding: 8px 0;
      }
      .timer-settings label {
        font-size: 15px;
        font-weight: 600;
      }
      .timer-settings input {
        max-width: none;
        width: 100%;
      }
      .inline-status {
        min-height: 24px;
        color: #333;
        font-size: 14px;
      }
      .calm-notice {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        margin: 8px 0;
        padding: 8px 10px;
        border-left: 3px solid #005fcc;
        background: #eef5fc;
        color: #222;
        font-size: 14px;
      }
      .calm-notice button {
        min-height: 40px;
        border: 0;
        background: transparent;
        color: #004b9b;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .calm-notice.assertive {
        border-left-color: #9b1c1c;
        background: #fff0f0;
      }
      .page-outline {
        max-height: 220px;
        overflow: auto;
        border-left: 2px solid #c5d7eb;
        padding: 4px 0 4px 12px;
      }
      .page-outline a {
        display: block;
        padding: 6px 0;
        color: #004b9b;
        text-decoration: underline;
        overflow-wrap: anywhere;
      }
      .profile-disclosure {
        margin: 16px 0;
        border: 1px solid #aebdce;
        border-radius: 6px;
        background: #fff;
      }
      .profile-disclosure summary {
        min-height: 48px;
        padding: 12px;
        color: #222;
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
      }
      .profile-disclosure summary:focus-visible {
        outline: 3px solid #ff6600;
        outline-offset: 2px;
      }
      .profile-settings-content {
        padding: 0 12px 12px;
      }

      @media (max-width: 420px) {
        .profile-grid,
        .contrast-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .panel-body {
          padding: 14px 12px 18px;
        }
        .panel-header {
          padding: 12px;
        }
      }
    `;
  }

  // ── Init ────────────────────────────────────────────────────────
  function init() {
    loadState();
    const motionPreference = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleMotionPreferenceChange = () => {
      updateWidgetMotionState();
      pauseAutoplayMedia();
      updateMediaObserver();
      window.dispatchEvent(new Event("a11y-motion-preference-change"));
    };
    if (motionPreference?.addEventListener) {
      motionPreference.addEventListener("change", handleMotionPreferenceChange);
    } else if (motionPreference?.addListener) {
      motionPreference.addListener(handleMotionPreferenceChange);
    }
    applyGlobalStyles();
    createWidget();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();