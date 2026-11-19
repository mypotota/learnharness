# Android port

The mobile app (`mobile/`) is not a re-implementation of the desktop product.
It ships the desktop Next.js **standalone server** and a **Node runtime** inside
the APK, starts the server on loopback at boot, and points a WebView at it. Every
desktop feature — chat, plugins (core and community), prompt fragments, background
agents, compaction settings — therefore exists on the phone without a second
codebase.

The earlier Capacitor/React UI in `mobile/src/` is a leftover of the abandoned
native-UI route. It is not packaged into the server payload and is no longer the
product surface.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| P0 | Node 24 on device, loopback HTTP server | **Verified on hardware** |
| P1 | Standalone server payload + node executable staged for packaging | **Done** |
| P2 | WebView loads the loopback URL, back gesture, media/file permissions | **Implemented** (Gradle wiring, `ServerRuntime`, splash hand-over; pending device smoke) |
| P3 | `run_demo` render service (replaces puppeteer) | **Implemented** (`RenderService.java` + `LH_RENDER_SERVICE_URL` branch in headless.ts; pending device smoke) |
| P4 | Regression on device: plugins, sub-agents, PDF, SVG, keys | Not started |

### What was verified on the device

On a Pixel-family arm64 device (Android 15), pushed to `/data/local/tmp`:

- Termux `nodejs-lts` **v24.22.3** + its seven shared libraries executed.
- A trimmed `.next/standalone` tree started with
  `PORT=41100 HOSTNAME=127.0.0.1 NODE_ENV=production LH_DATA_DIR=… LH_AUTH_FILE=…`.
- `GET /` returned `200` with the real desktop UI, `/plugin-loader.js` returned
  `200`, and `/api/plugins` listed the four core plugins
  (flashcards, coding-questions, drawing-pad, rich-code-blocks).

## How the payload is produced

`npm run build` → `node scripts/build-server.mjs` → `node mobile/scripts/prepare-mobile-runtime.mjs`

`prepare-mobile-runtime.mjs` is the only mobile-specific build step. It:

1. Resolves the Termux `Packages` index and downloads `nodejs-lts`, `libc++`,
   `libicu`, `libsqlite`, `openssl`, `c-ares`, and `zlib`, caching the debs under
   `mobile/.cache/runtime`.
2. Copies `node` out of the package and keeps exactly the shared libraries its
   `DT_NEEDED` entries name (`libicui18n.so.79`, `libssl.so.3`, …), so a mirror
   version bump fails at build time instead of at `dlopen` on the phone.
3. Stages the standalone tree with desktop-only paths removed: `mobile` (the
   dynamic-`fs` trace sweeps ~1 GB of it into the bundle), `docs`, `tests`,
   `electron`, `@img`/`sharp` (no Android build; `next/image` is unused), and the
   darwin `@napi-rs/canvas` / `@resvg/resvg-js` packages.
4. Swaps in `@napi-rs/canvas-android-arm64@1.0.9` and
   `@resvg/resvg-js-android-arm64@2.6.2`, and adds `runtime/lib/*.so`.
5. Writes `mobile/android/app/build/generated/lh-assets/lh-server.zip`
   (6475 files, ~62 MB) and `.../lh-jniLibs/arm64-v8a/liblh-node.so` (~44 MB).

Both served paths are generated, not committed.

## Remaining work

1. **P4 device regression**: plugins (core + community), sub-agents, PDF and SVG
   rendering (the swapped `@napi-rs/canvas-android-arm64` /
   `@resvg/resvg-android-arm64` packages), keys via the settings page, dictation
   (the WebView prompts for `RECORD_AUDIO` at first use), file attach
   (`onShowFileChooser`), external links (system browser), back gesture.
2. **Server crash watchdog**: `ServerRuntime` restarts node only during boot; a
   mid-session crash is logged but leaves the WebView dead. A restart + reload
   path is future work (an auto-reload would drop composer input).

## The P3 render service

`run_demo` needs a real browser; the phone has neither the Electron helper nor
system Chrome. `mobile/android/.../RenderService.java` hosts a hidden 1×1
WebView (visible so the compositor produces frames — rAF-driven demos stall in
a detached view) behind a hand-rolled loopback HTTP server on **41101**. The
Node server routes to it when `LH_RENDER_SERVICE_URL` is set
(`src/agent/subagents/headless.ts`): `POST /render` with
`{html, settleMs?, probe?}` returns a `DemoRunResult`. `renderSvg` and PDF
rendering stay native (resvg / pdfjs+canvas with the Android packages), so the
service runs demo pages only.

Semantics mirror the desktop puppeteer path: console errors from
`onConsoleMessage`, uncaught errors from an injected `window.onerror` /
`unhandledrejection` shim (WebView has no CDP pageerror), failed requests from
`onReceivedError`, probes via `evaluateJavascript` with try/catch so a failing
probe becomes a page error. The document loads with a null base URL (opaque
origin, like the desktop's about:blank isolation), file/content access is off,
and no JS interface is exposed. Desktop behavior is unchanged when the env var
is unset; `tests/headless-remote-render.test.ts` covers the wire contract.

## Constraints that are easy to get wrong

- Never set `LH_DESKTOP_SERVER` or `LH_DESKTOP_API_SECRET` on mobile: the app must
  run in the browser-only mode that trusts `127.0.0.1` (see
  `src/server/desktop-access.ts`).
- `HOSTNAME=127.0.0.1` is mandatory — the server defaults to `0.0.0.0`.
- `window.lh` (the Electron bridge) is optional everywhere; the WebView gets the
  documented browser fallbacks, so no shim is required.
- The ports are fixed: the server at `41100`, the render service at `41101`. If
  either changes, update `ServerRuntime` (both constants), the WebView URL in
  `MainActivity`, and the `LH_RENDER_SERVICE_URL` value together.
- Capacitor's generated `android/app/src/main/assets/capacitor.config.json` is
  gitignored — it is regenerated from `mobile/capacitor.config.ts` by
  `npx cap sync android`, so the loopback `server.url` / `allowNavigation`
  always re-appear after a sync.
