#!/usr/bin/env bash
# Build + install the Android debug app. The machine's user-level
# gradle.properties pins JDK 17, while Capacitor 7 compiles with Java 21,
# so resolve a 21 JDK explicitly instead of editing global Gradle config.
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build
npx cap sync android

JAVA21="$(/usr/libexec/java_home -v 21 2>/dev/null || true)"
cd android
if [ -n "$JAVA21" ]; then
	./gradlew -Dorg.gradle.java.home="$JAVA21" "${@:-installDebug}"
else
	./gradlew "${@:-installDebug}"
fi
