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
| P1 | Standalone server payload + node executable staged for packaging | **Done** (script verified, Gradle wiring pending) |
| P2 | WebView loads the loopback URL, back gesture, media/file permissions | Not started |
| P3 | `run_demo` render service (replaces puppeteer) | Not started |
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

1. **Gradle** (`mobile/android/app/build.gradle`): delete `syncNodeRuntime`,
   `syncCorePlugins`, `syncCommunityPlugins` and the `externalNativeBuild` block
   (plus `src/main/cpp/`). Add `assets.srcDirs += ["$buildDir/generated/lh-assets"]`,
   `jniLibs.srcDirs += ["$buildDir/generated/lh-jniLibs"]`, and make `preBuild`
   depend on an `Exec` task running `node scripts/prepare-mobile-runtime.mjs`.
2. **Manifest**: `android:extractNativeLibs="true"` — since API 29 a binary in the
   writable data directory may not be executed, so `node` must live in
   `nativeLibraryDir`. Declare `RECORD_AUDIO` and `CAMERA` for `getUserMedia`.
3. **`ServerRuntime.java`**: extract the asset ZIP to `filesDir/lh-server` when the
   APK's `lastUpdateTime` changes, then start
   `nativeLibraryDir/liblh-node.so server.js` with
   `NODE_ENV`, `PORT=41100`, `HOSTNAME=127.0.0.1`, `LH_DATA_DIR`,
   `LH_AUTH_FILE`, `LD_LIBRARY_PATH=filesDir/lh-server/runtime/lib`. Log to
   `filesDir/logs/server.log` and poll the port until it answers.
4. **`MainActivity`**: keep the Capacitor WebView hidden (the launch theme keeps
   the splash visible) until the port answers, then `loadUrl("http://127.0.0.1:41100/")`.
   Back gesture: `canGoBack() ? goBack() : finish()`, via `onBackPressed` and, on
   API 33+, `OnBackInvokedDispatcher`.
5. **Capacitor config**: `server.allowNavigation: ["127.0.0.1", "localhost"]` in
   `mobile/capacitor.config.ts` **and** the generated
   `android/app/src/main/assets/capacitor.config.json`, otherwise the bridge client
   blocks the loopback navigation.
6. **Delete `NodeRuntime.java`** — it loads the old nodejs-mobile `libnode.so` and
   crashes the app at startup.
7. **P3 render service**: `src/agent/subagents/headless.ts` (`renderSvg`,
   `runDemo`) still needs puppeteer. The replacement is a hidden-WebView renderer
   exposing `POST /render`, selected by `LH_RENDER_SERVICE_URL`; the desktop path
   stays untouched.

## Constraints that are easy to get wrong

- Never set `LH_DESKTOP_SERVER` or `LH_DESKTOP_API_SECRET` on mobile: the app must
  run in the browser-only mode that trusts `127.0.0.1` (see
  `src/server/desktop-access.ts`).
- `HOSTNAME=127.0.0.1` is mandatory — the server defaults to `0.0.0.0`.
- `window.lh` (the Electron bridge) is optional everywhere; the WebView gets the
  documented browser fallbacks, so no shim is required.
- The port is fixed at `41100`; if it changes, update `ServerRuntime` and the
  WebView URL together.
