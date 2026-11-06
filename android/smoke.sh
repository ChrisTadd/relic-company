#!/usr/bin/env bash
set -euo pipefail

apk=$1
previous=${2:-}
system='system-images;android-35;google_apis;x86_64'
package='io.github.christadd.reliccompany'
sdk=${ANDROID_SDK_ROOT:-${ANDROID_HOME:?Android SDK is required}}
sdkmanager=$(find "$sdk/cmdline-tools" -name sdkmanager -type f | sort -V | tail -1)
"$sdkmanager" "$system" emulator
export PATH="$sdk/platform-tools:$sdk/emulator:$PATH"
export ANDROID_AVD_HOME="$RUNNER_TEMP/relic-avd"
mkdir -p "$ANDROID_AVD_HOME"
echo no | "$(dirname "$sdkmanager")/avdmanager" create avd --force --name relic-test --package "$system" --path "$ANDROID_AVD_HOME/relic-test.avd"
emulator -list-avds | grep -x relic-test
sudo chmod a+rw /dev/kvm
emulator -avd relic-test -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader -camera-back none >"$RUNNER_TEMP/relic-emulator.log" 2>&1 &
trap 'code=$?; if (( code )); then cat "$RUNNER_TEMP/relic-emulator.log"; timeout 8 adb logcat -d -t 100 || true; fi; timeout 8 adb emu kill || true' EXIT
timeout 100 adb wait-for-device
timeout 180 bash -c 'until [[ "$(adb shell getprop sys.boot_completed | tr -d "\r")" == 1 ]]; do sleep 2; done'
adb shell wm size 390x760
adb shell wm density 160
adb shell input keyevent 82
adb install "$apk"
adb shell cmd connectivity airplane-mode enable
adb shell svc wifi disable
adb shell svc data disable
adb shell am start -W -n "$package/.MainActivity"

find_text() {
  python3 - "$@" <<'PY'
import re, subprocess, sys, time
import xml.etree.ElementTree as ET

text = sys.argv[1]
for _ in range(10):
    dump = subprocess.run(["adb", "exec-out", "uiautomator", "dump", "/dev/tty"], capture_output=True, text=True, timeout=15).stdout
    xml = re.search(r"<hierarchy\b.*</hierarchy>", dump, re.S)
    if xml:
        for node in ET.fromstring(xml[0]).iter("node"):
            if text in (node.attrib.get("text"), node.attrib.get("content-desc")):
                x1, y1, x2, y2 = map(int, re.findall(r"\d+", node.attrib["bounds"]))
                if len(sys.argv) == 3 and x1 < x2 and y1 < y2:
                    subprocess.run(["adb", "shell", "input", "tap", str((x1+x2)//2), str((y1+y2)//2)], check=True)
                elif len(sys.argv) == 3:
                    continue
                sys.exit(0)
    time.sleep(1)
raise SystemExit("Could not find " + text + "\n" + dump[-7000:])
PY
}

tap_text() { find_text "$1" tap; }
start_contract() {
  adb shell input swipe 195 650 195 460 300
  tap_text 'Draw steel'
  find_text 'Pause'
}

start_contract
sleep 2
adb shell am force-stop "$package"
adb shell am start -W -n "$package/.MainActivity"
tap_text 'Resume fight'
echo 'Signed APK installed and resumed the same contract with airplane mode enabled.'

if [[ -n "$previous" ]]; then
  adb shell am force-stop "$package"
  adb shell pm clear "$package"
  adb uninstall "$package"
  adb install "$previous"
  adb shell am start -W -n "$package/.MainActivity"
  start_contract
  tap_text 'Pause'
  tap_text 'Withdraw and take partial pay'
  tap_text 'Find another contract'
  adb shell cmd connectivity airplane-mode disable
  adb shell svc wifi enable
  adb shell svc data enable
  tap_text 'Settings'
  tap_text 'Check for updates' || true
  version=$(unzip -p "$apk" assets/game/index.html | sed -n 's/.*name="relic-build" content="\([a-f0-9]*\)".*/\1/p')
  for attempt in {1..4}; do
    tap_text 'Settings'
    if find_text "Build $version"; then break; fi
    if (( attempt == 4 )); then exit 1; fi
    tap_text 'Check for updates' || true
  done
  adb shell dumpsys package "$package" | grep 'versionCode='
  echo 'The earlier APK applied the newer game build from GitHub Releases in place.'
fi
