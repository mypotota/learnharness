#!/usr/bin/env bash
# build.sh — one entry point for packaging and running LearnHarness.
#
#   ./build.sh                     # debug + auto target
#   ./build.sh --android           # debug Android (build, install, launch)
#   ./build.sh --mac --release     # macOS unsigned DMG/ZIP, then launch
#
# Target resolution (no --android/--mac/--linux given): Android when a
# device is attached (`adb devices` shows one), otherwise the current OS —
# macOS on Darwin, Linux on anything else supported.
#
# Modes:
#   --debug   (default) build and RUN the app
#   --release           build the installable artifact, then run it too
#
# macOS release is intentionally unsigned (no Developer ID / notary profile
# on this machine): DMG + ZIP are produced locally, never published.
set -euo pipefail
cd "$(dirname "$0")"

ROOT="$(pwd)"
MOBILE_APP_ID="ai.learnharness.mobile"
ANDROID_ACTIVITY="${MOBILE_APP_ID}/.MainActivity"

TARGET=""
MODE="debug"

usage() {
	cat <<'EOF'
用法: ./build.sh [--android | --mac | --linux] [--release | --debug]

  --android   构建 Android 应用并安装到已连接的设备后启动
  --mac       构建 macOS 应用（arm64）
  --linux     构建 Linux 桌面应用（--ubuntu 亦可）
  --debug     调试构建（默认）：构建后直接运行
  --release   发布构建：生成安装包后同样会运行
  -h, --help  显示本帮助

不指定平台时：检测到 adb 设备则构建 Android，否则按当前系统
（macOS / Linux）构建并运行。
EOF
}

log() { printf '\n==> %s\n' "$*"; }
fail() { printf 'build.sh: %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
	case "$1" in
		--android) TARGET="android" ;;
		--mac) TARGET="mac" ;;
		--linux|--ubuntu) TARGET="linux" ;;
		--debug) MODE="debug" ;;
		--release) MODE="release" ;;
		-h|--help) usage; exit 0 ;;
		*) usage >&2; fail "未知参数: $1" ;;
	esac
	shift
done

first_adb_device() {
	command -v adb >/dev/null 2>&1 || return 1
	adb devices 2>/dev/null | awk 'NR>1 && $2 == "device" { print $1; exit }'
}

if [[ -z "$TARGET" ]]; then
	if first_adb_device >/dev/null; then
		TARGET="android"
	else
		case "$(uname -s)" in
			Darwin) TARGET="mac" ;;
			Linux) TARGET="linux" ;;
			*) fail "当前系统不支持桌面打包，请显式指定 --android 或 --mac。" ;;
		esac
	fi
	log "未指定平台：${TARGET}（$( [[ "$TARGET" == "android" ]] && echo "检测到 adb 设备" || echo "当前系统 $(uname -s)" )）"
fi

# ── Android ────────────────────────────────────────────────────────────
build_android() {
	local device
	device="$(first_adb_device || true)"
	[[ -n "$device" ]] || fail "没有检测到 adb 设备。请连接手机并开启 USB 调试后重试。"

	log "Android ${MODE}：构建 Web 服务端并同步 Capacitor"
	npm run build
	# Capacitor CLI lives in mobile/, not the repo root — npx at the root
	# fails with "could not determine executable to run".
	(cd mobile && npm run build && npx cap sync android)

	# bash 3.2 (macOS /bin/bash) aborts on "${empty[@]}" under `set -u`,
	# hence the ${arr[@]+"${arr[@]}"} guards below.
	local java_args=()
	local java21
	java21="$(/usr/libexec/java_home -v 21 2>/dev/null || true)"
	if [[ -n "$java21" ]]; then
		java_args=(-Dorg.gradle.java.home="$java21")
	fi

	local apk
	if [[ "$MODE" == "release" ]]; then
		log "Android release：构建 APK"
		(cd mobile/android && ./gradlew ${java_args[@]+"${java_args[@]}"} assembleRelease)
		apk="mobile/android/app/build/outputs/apk/release/app-release.apk"
	else
		log "Android debug：构建并安装 APK"
		(cd mobile/android && ./gradlew ${java_args[@]+"${java_args[@]}"} installDebug)
		apk="mobile/android/app/build/outputs/apk/debug/app-debug.apk"
	fi
	[[ -f "$apk" ]] || fail "未找到 APK：$apk"

	if [[ "$MODE" == "release" ]]; then
		log "安装 release 包到设备 $device"
		adb -s "$device" install -r "$apk"
	fi

	log "启动 ${MOBILE_APP_ID}"
	adb -s "$device" shell am force-stop "$MOBILE_APP_ID" || true
	adb -s "$device" shell am start -n "$ANDROID_ACTIVITY"
	log "完成：$apk"
}

# ── Desktop (macOS / Linux) ────────────────────────────────────────────
prepare_desktop_payload() {
	log "清理旧的 standalone / dist"
	rm -rf dist .next/standalone

	log "构建 Web 服务端"
	npm run build
	node scripts/build-server.mjs
	# Repo mobile/ build output must never ride into the desktop payload
	# (it once turned a 185MB DMG into 1.3GB).
	rm -rf .next/standalone/mobile

	if [[ "$MODE" == "release" ]]; then
		log "release 冒烟检查"
		node scripts/smoke-provider-runtime.mjs
		node scripts/smoke-server.mjs
	fi
}

builder_common_env() {
	export CSC_IDENTITY_AUTO_DISCOVERY=false
	export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
}

build_mac() {
	[[ "$(uname -s)" == "Darwin" ]] || fail "--mac 只能在 macOS 上执行。"

	prepare_desktop_payload
	builder_common_env

	if [[ "$MODE" == "release" ]]; then
		log "macOS release：构建未签名 DMG + ZIP"
		npx electron-builder --mac --arm64 -c.mac.notarize=false --publish never
		log "产物："
		ls -lh dist/*.dmg dist/*.zip 2>/dev/null || true
	else
		log "macOS debug：构建 .app"
		npx electron-builder --mac --arm64 --dir -c.mac.notarize=false --publish never
	fi

	local app
	app="$(find dist -maxdepth 2 -name 'LearnHarness.app' -type d | head -n 1)"
	[[ -n "$app" ]] || fail "未找到构建出的 LearnHarness.app"
	log "启动 $app"
	open "$app"
}

build_linux() {
	[[ "$(uname -s)" == "Linux" ]] || fail "--linux 只能在 Linux 上执行。"

	prepare_desktop_payload
	builder_common_env

	if [[ "$MODE" == "release" ]]; then
		log "Linux release：构建 AppImage + deb"
		npx electron-builder --linux --publish never
		log "产物："
		ls -lh dist/*.AppImage dist/*.deb 2>/dev/null || true
	else
		log "Linux debug：构建 unpacked 应用"
		npx electron-builder --linux --dir --publish never
	fi

	# Prefer the app binary; the unpacked dir also contains chrome-sandbox
	# (executable) and .pak/.so payloads. electron-builder derives the name
	# from productName, which differs in case between targets.
	local bin=""
	local candidate
	for candidate in dist/linux-unpacked/learnharness dist/linux-unpacked/LearnHarness; do
		if [[ -x "$candidate" ]]; then
			bin="$candidate"
			break
		fi
	done
	if [[ -z "$bin" ]]; then
		bin="$(find dist/linux-unpacked -maxdepth 1 -type f -perm -u+x \
			! -name 'chrome-sandbox' ! -name '*.so*' ! -name '*.pak' ! -name 'LICENSE*' \
			2>/dev/null | head -n 1)"
	fi
	[[ -n "$bin" ]] || fail "未找到 dist/linux-unpacked 下的可执行文件"
	log "启动 $bin"
	"$bin" >/dev/null 2>&1 &
}

case "$TARGET" in
	android) build_android ;;
	mac) build_mac ;;
	linux) build_linux ;;
	*) fail "未知平台: $TARGET" ;;
esac
