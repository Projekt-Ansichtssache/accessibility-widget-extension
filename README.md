# Accessibility Widget Extension

Browser extension for providing accessibility tools on HTTP and HTTPS websites.

## Features

- Chrome Manifest V3 support
- Firefox-compatible background configuration
- Global widget activation
- Per-domain blacklist and whitelist controls
- Popup and settings page
- German and English interface localization
- No remotely loaded JavaScript

## Development

The extension uses a Manifest V3 background service worker in Chrome and a background script fallback in Firefox. The widget is injected only when the global setting is enabled and the current domain is not blacklisted.

To load the extension locally:

- **Chrome:** open `chrome://extensions`, enable Developer mode, and select **Load unpacked**
- **Firefox:** open `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, and choose `manifest.json`

## Repository structure

```text
background/       Extension background logic
content/          Reserved content-script entry point
options/          Extension settings page
popup/            Browser popup
vendor/           Synchronized widget source
_locales/         Extension translations
assets/icons/     Extension icons
```

## Vendor source

`vendor/accessibility-widget.js` is synchronized from a separate repository and must not be modified manually.

## License

MIT
