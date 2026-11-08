# Fadai Universe — product site

The marketing / showcase site for **Fadai Universe** (发呆音宇宙), a music-reactive
screen creature for macOS and Windows.

- Live: https://dadudu-ai.github.io/fadai-universe-site/
- App source: https://github.com/Dadudu-AI/fadai-universe

> This repository contains **only the website**. The application itself lives in
> [`Dadudu-AI/fadai-universe`](https://github.com/Dadudu-AI/fadai-universe); nothing here
> touches that codebase.

## What is it

A single-page site built around a live particle renderer — not a video, not a GIF.
The hero orb and the interactive "three forms" stage are the real visualizer logic
reimplemented in ~450 lines of vanilla canvas, so the page stays a few hundred
kilobytes and runs at 60 fps without a framework.

Highlights:

- **Live canvas engine** — 1,700 particles (hero) / 2,100 (stage), morphed between
  orb, whale and jellyfish by interpolating three parametric point clouds.
- **Two drivers** — a procedural spectrum when idle, or the visitor's own microphone
  (`getUserMedia` + `AnalyserNode`, 26 log-spaced bands, processed on-device only).
- **No build step, no dependencies.** Open `index.html` and it works.
- Scroll-reveal typography, cursor-parallax, grain overlay, and
  `prefers-reduced-motion` support.

## Structure

```
index.html          markup + copy
css/style.css       all styling (no framework)
js/orb.js           particle engine: OrbEngine + Starfield
js/main.js          reveals, nav state, form switching, microphone wiring
assets/img/*.jpg    real product screenshots (1600px, optimised)
```

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
