# Fadai Universe — product site

The marketing / showcase site for **Fadai Universe** (发呆音宇宙), a music-reactive
screen creature for macOS and Windows.

- Live: https://dadudu-ai.github.io/fadai-universe-site/
- App source: https://github.com/Dadudu-AI/fadai-universe

> This repository contains **only the website**. The application itself lives in
> [`Dadudu-AI/fadai-universe`](https://github.com/Dadudu-AI/fadai-universe); nothing here
> touches that codebase.

## What is it

A single-page site that shows the product by running it. The hero orb and the
"three living forms" stage are the app's own Three.js visualizer, vendored into
`viz/` and embedded as a screen-blended iframe — same geometry, same shaders, same
bloom, same motion as the desktop app. No re-creation, nothing approximated.

How the embed works:

- `viz/app.html` is a copy of the app's visualizer with one added block: `?embed=1`
  hides the app chrome, forwards `{fadaiMode}` / `{fadaiMic}` messages from the page,
  and picks its audio source.
- Browsers refuse audio before a gesture, so the embed starts on a synthetic
  spectrum shaped like the app's usual input (strong bass band, ~47 bpm pulse) and
  switches to the bundled `viz/loop.mp3` the moment the visitor interacts.
- `.viz { mix-blend-mode: screen }` + a radial mask melts the visualizer's dark stage
  into the page, so there is no visible rectangle.

Highlights:

- **The app's renderer, live** — no video, no GIF, no 1 MB of images.
- **Interactive stage** — the chips switch the app's real modes (1 primordial /
  2 whale / 4 jellyfish) over `postMessage`; the mic button triggers the app's own
  `getUserMedia` path.
- **No build step, no dependencies.** Open `index.html` and it works.
- Scroll-reveal typography, gallery parallax, grain overlay, and
  `prefers-reduced-motion` support.

## Structure

```
index.html          markup + copy
css/style.css       all styling (no framework)
js/main.js          reveals, nav state, chips → postMessage, downloads
viz/app.html        the app's visualizer + embed bootstrap (?embed=1)
viz/lib/            three.js + post-processing shaders (from the app)
viz/loop.mp3        28 s ambient loop that drives the real spectrum
assets/img/*.jpg    real product screenshots (1600px, optimised)
```

`viz/` is a vendored copy of `Dadudu-AI/fadai-universe` (`index.html` + `lib/`).
If the app's visualizer changes, re-copy those files and re-apply the embed block —
that block is the only difference.

## Run locally

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

(A plain `file://` open mostly works, but the microphone needs an http origin.)

## Deploy

GitHub Pages, served from the `main` branch root — no CI, no Jekyll
(`.nojekyll` is present). Any static host works the same way.

## Credits

Product, screenshots and copy: Meng Guang · site code: Hermes Agent.

© 2026 Fadai Universe
