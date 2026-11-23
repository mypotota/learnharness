#!/usr/bin/env bash
# build.sh — one entry point for packaging and running LearnHarness.
#
#   ./build.sh                     # debug + auto target
#   ./build.sh --android           # debug Android (build, install, launch)
#   ./build.sh --mac --release     # macOS unsigned DMG/ZIP, then launch
#   ./build.sh --uninstall         # Linux: remove the deb package + user data
#
# Target resolution (no --android/--mac/--linux given): Android first when
# `adb devices` shows an online device, otherwise the current OS — macOS on
# Darwin, Linux (Ubuntu etc.) elsewhere. ANDROID_SERIAL picks one device
# when several are attached.
#
# Modes:
#   --debug   (default) build and RUN the app (Linux: deb installed + launched)
#   --release           build the installable artifact, then run it too
#                       (Linux: AppImage + deb; the .deb is installed with
#                       sudo and the installed copy is launched)
#
# macOS release is intentionally unsigned (no Developer ID / notary profile
# on this machine): DMG + ZIP are produced locally, never published.
#
# The script is bash-only; `sh build.sh` re-executes itself under bash.
if [ -z "${BASH_VERSION:-}" ]; then
	exec bash "$0" "$@"
fi
set -euo pipefail
cd "$(dirname "$0")"

ROOT="$(pwd)"
MOBILE_APP_ID="ai.learnharness.mobile"
ANDROID_ACTIVITY="${MOBILE_APP_ID}/.MainActivity"
LINUX_PACKAGE="learnharness"
LINUX_USER_DATA_DIRS=(
	"$HOME/.config/LearnHarness"
	"$HOME/.cache/LearnHarness"
	"$HOME/.local/share/LearnHarness"
)

TARGET=""
MODE="debug"
UNINSTALL=0
ASSUME_YES=0

usage() {
	cat <<'EOF'
用法: ./build.sh [--android | --mac | --linux] [--release | --debug]
       ./build.sh --uninstall [--yes]

  --android   构建 Android 应用并安装到已连接的设备后启动
  --mac       构建 macOS 应用（arm64）
  --linux     构建 Linux 桌面应用（--ubuntu 亦可）
  --debug     调试构建（默认）：构建后直接运行
              （Linux 会 sudo 安装 deb，再启动已安装的程序）
  --release   发布构建：额外生成 AppImage，同样安装 deb 后运行
  --uninstall 卸载 Linux deb 包并删除用户数据目录
  -y, --yes   卸载时跳过确认
  -h, --help  显示本帮助

不指定平台时：优先检测 adb 在线设备并构建 Android；没有可用设备
时自动识别当前系统（macOS / Linux）构建并运行。
可用 ANDROID_SERIAL=<序列号> 指定多台设备中的一台。
EOF
}

log() { printf '\n==> %s\n' "$*"; }
warn() { printf 'build.sh: 警告: %s\n' "$*" >&2; }
fail() { printf 'build.sh: %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
	case "$1" in
		--android) TARGET="android" ;;
		--mac) TARGET="mac" ;;
		--linux|--ubuntu) TARGET="linux" ;;
		--debug) MODE="debug" ;;
		--release) MODE="release" ;;
		--uninstall) UNINSTALL=1 ;;
		-y|--yes) ASSUME_YES=1 ;;
		-h|--help) usage; exit 0 ;;
		*) usage >&2; fail "未知参数: $1" ;;
	esac
	shift
done

DETECTED_DEVICE=""
ADB_HINT=""

# Sets DETECTED_DEVICE (and ADB_HINT when nothing usable is attached).
# Kept assignment-based instead of printing to stdout so the hints survive
# the call — command substitution would run in a subshell.
detect_android_device() {
	DETECTED_DEVICE=""
	ADB_HINT=""

	if ! command -v adb >/dev/null 2>&1; then
		ADB_HINT="未找到 adb 命令，请安装 Android platform-tools"
		return 1
	fi

	# adb may print daemon banners; keep only well-formed device lines.
	local listing
	listing="$(adb devices 2>/dev/null | awk 'NF >= 2 && $1 != "List" { print $1 "\t" $2 }' || true)"
	[[ -n "$listing" ]] || return 1

	local serial state
	local ready=()
	local unauthorized=0 offline=0
	while IFS=$'\t' read -r serial state; do
		[[ -n "$serial" ]] || continue
		case "$state" in
			device) ready+=("$serial") ;;
			unauthorized) unauthorized=1 ;;
			offline) offline=1 ;;
		esac
	done <<<"$listing"

	if [[ -n "${ANDROID_SERIAL:-}" ]]; then
		local candidate
		for candidate in ${ready[@]+"${ready[@]}"}; do
			if [[ "$candidate" == "$ANDROID_SERIAL" ]]; then
				DETECTED_DEVICE="$candidate"
				return 0
			fi
		done
		warn "ANDROID_SERIAL=${ANDROID_SERIAL} 不是在线设备，改为自动选择"
	fi

	if (( ${#ready[@]} > 0 )); then
		if (( ${#ready[@]} > 1 )); then
			warn "检测到 ${#ready[@]} 台在线 adb 设备：${ready[*]}，默认使用 ${ready[0]}（可用 ANDROID_SERIAL 指定）"
		fi
		DETECTED_DEVICE="${ready[0]}"
		return 0
	fi

	if (( unauthorized )); then
		ADB_HINT="检测到 adb 设备，但 USB 调试尚未授权，请在手机上点击允许"
	elif (( offline )); then
		ADB_HINT="检测到 adb 设备，但状态为 offline，请重新插拔 USB 或执行 adb kill-server"
	fi
	return 1
}

platform_label() {
	case "$(uname -s)" in
		Darwin)
			printf 'macOS %s (%s)' \
				"$(sw_vers -productVersion 2>/dev/null || echo '未知版本')" "$(uname -m)"
			;;
		Linux)
			local pretty=""
			if [[ -r /etc/os-release ]]; then
				pretty="$( . /etc/os-release 2>/dev/null && printf '%s' "${PRETTY_NAME:-}" )"
			fi
			printf '%s (%s)' "${pretty:-Linux}" "$(uname -m)"
			;;
		*) printf '%s (%s)' "$(uname -s)" "$(uname -m)" ;;
	esac
}

# ── Uninstall (Linux deb) ─────────────────────────────────────────────
uninstall_linux() {
	[[ "$(uname -s)" == "Linux" ]] || fail "--uninstall 仅支持 Linux（deb 安装）。"
	command -v dpkg >/dev/null 2>&1 || fail "未找到 dpkg，当前系统不支持 deb 卸载。"

	local installed=0
	if dpkg -s "$LINUX_PACKAGE" 2>/dev/null | grep -q '^Status: install ok installed'; then
		installed=1
	fi

	local data_dirs=()
	local dir
	for dir in "${LINUX_USER_DATA_DIRS[@]}"; do
		if [[ -e "$dir" ]]; then
			data_dirs+=("$dir")
		fi
	done

	if (( installed == 0 )) && (( ${#data_dirs[@]} == 0 )); then
		log "未发现已安装的 ${LINUX_PACKAGE} 包或用户数据，无需卸载"
		return 0
	fi

	log "将执行以下清理："
	if (( installed )); then
		printf '  - 卸载 deb 包 %s（/opt/LearnHarness、桌面入口、/usr/bin 链接）\n' "$LINUX_PACKAGE"
	fi
	for dir in ${data_dirs[@]+"${data_dirs[@]}"}; do
		printf '  - 删除用户数据 %s\n' "$dir"
	done

	if (( ASSUME_YES == 0 )); then
		[[ -t 0 ]] || fail "非交互环境，请加 --yes 确认卸载。"
		local reply
		printf '继续？[y/N] '
		read -r reply
		case "$reply" in
			y|Y|yes|YES) ;;
			*) log "已取消"; return 0 ;;
		esac
	fi

	pkill -x "$LINUX_PACKAGE" 2>/dev/null || true

	if (( installed )); then
		log "卸载 deb 包（需要 sudo 密码）"
		sudo dpkg --purge "$LINUX_PACKAGE" || fail "dpkg --purge 失败"
	fi

	for dir in ${data_dirs[@]+"${data_dirs[@]}"}; do
		log "删除用户数据 $dir"
		rm -rf -- "$dir"
	done

	log "卸载完成"
}

if (( UNINSTALL )); then
	uninstall_linux
	exit 0
fi

if [[ -z "$TARGET" ]]; then
	if detect_android_device; then
		TARGET="android"
		log "未指定平台：检测到 adb 设备 ${DETECTED_DEVICE}，构建 Android"
	else
		case "$(uname -s)" in
			Darwin) TARGET="mac" ;;
			Linux) TARGET="linux" ;;
			*) fail "当前系统不支持桌面打包，请显式指定 --android 或 --mac。" ;;
		esac
		[[ -n "$ADB_HINT" ]] && warn "$ADB_HINT"
		log "未指定平台：未检测到可用的 adb 设备，识别为 $(platform_label)，构建 ${TARGET}"
	fi
fi

# ── Android ────────────────────────────────────────────────────────────
build_android() {
	local device="${DETECTED_DEVICE:-}"
	if [[ -z "$device" ]]; then
		detect_android_device || true
		device="$DETECTED_DEVICE"
	fi
	if [[ -z "$device" ]]; then
		if [[ -n "$ADB_HINT" ]]; then
			fail "没有可用的 adb 设备：$ADB_HINT"
		fi
		fail "没有检测到 adb 设备。请连接手机并开启 USB 调试后重试。"
	fi

	log "Android ${MODE}：目标设备 ${device}，构建 Web 服务端并同步 Capacitor"
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

	# Follow the host CPU instead of assuming Apple Silicon.
	local arch="arm64"
	[[ "$(uname -m)" == "x86_64" ]] && arch="x64"

	if [[ "$MODE" == "release" ]]; then
		log "macOS release：构建未签名 DMG + ZIP（${arch}）"
		npx electron-builder --mac "--${arch}" -c.mac.notarize=false --publish never
		log "产物："
		ls -lh dist/*.dmg dist/*.zip 2>/dev/null || true
	else
		log "macOS debug：构建 .app（${arch}）"
		npx electron-builder --mac "--${arch}" --dir -c.mac.notarize=false --publish never
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
		log "Linux debug：构建 deb（默认安装到系统）"
		npx electron-builder --linux deb --publish never
	fi

	local deb
	deb="$(find "$ROOT/dist" -maxdepth 1 -type f -name '*.deb' -print -quit)"
	[[ -n "$deb" ]] || fail "未找到构建出的 deb 安装包"

	# Replacing files under a running instance is undefined; stop it first.
	pkill -x "$LINUX_PACKAGE" 2>/dev/null || true
	log "安装 $deb（需要 sudo 密码）"
	sudo apt-get install -y "$deb" || fail "安装 deb 失败：$deb"

	local installed
	installed="$(command -v "$LINUX_PACKAGE" || true)"
	[[ -n "$installed" ]] || installed="/opt/LearnHarness/$LINUX_PACKAGE"
	[[ -x "$installed" ]] || fail "安装完成但未找到可执行文件：$installed"
	log "启动已安装的 $installed"
	setsid "$installed" >/dev/null 2>&1 < /dev/null &
}

case "$TARGET" in
	android) build_android ;;
	mac) build_mac ;;
	linux) build_linux ;;
	*) fail "未知平台: $TARGET" ;;
esac
