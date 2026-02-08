# RSVP Speed Reader

## Run locally

Serve the static HTML with a minimal web server:

```bash
python -m http.server 8000
```

Then open:

- <http://127.0.0.1:8000/> (redirects to `rsvp.html`)
- or <http://127.0.0.1:8000/rsvp.html>

## Tampermonkey userscript

Install `rsvp.user.js` in Tampermonkey to launch the reader on any site.

- Hotkey: **Ctrl+Shift+E** to toggle the overlay
- Reading controls: Space = play/pause, ↑/↓ = WPM ±10, ←/→ = chunk size ±1, R = reset, F = fullscreen, Esc = close

The overlay extracts the article text automatically (Readability + body fallback) and shows the speed in a small, gray indicator inside the reading window.
