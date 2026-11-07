# Kepler's three laws

An interactive Three.js scene for an astronomy club. A star and two planets sit on ellipses with different semi-major axes and eccentricities. Orbital motion comes from solving Kepler's equation, so each planet speeds up near perihelion.

## What it shows

- **Law 1 — Ellipses.** The orbit is drawn with the Sun at one focus. Turn on both foci to mark the empty focus and to watch the two distances add up to 2a.
- **Law 2 — Equal areas.** Turn on the wedges for planet 2. One grows at perihelion and one at aphelion, over the same tenth of the year. They sweep out the same area while the planet's speed changes. An arrow on each planet shows its velocity.
- **Law 3 — Periods.** A live panel shows T² / a³ for both planets. The two numbers stay equal. Sliders change planet 2's eccentricity and semi-major axis. A time-speed slider and a pause button control the clock. The year depends on the semi-major axis, not on the eccentricity.

Drag to rotate the scene. Scroll or pinch to zoom. On a phone, the lesson panel sits under the sky and scrolls on its own.

## Run

```bash
npm ci && npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

## Build

```bash
npm ci && npm run build
```

Output is in `dist/`. Asset paths are relative so the page works on GitHub Pages at `/demos/2026-11-07-threejs/`.
