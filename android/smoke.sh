#!/usr/bin/env bash
set -euo pipefail

apk=$1
system='system-images;android-35;google_apis;x86_64'
package='io.github.christadd.reliccompany'
sdkmanager "$system"
echo no | avdmanager create avd --force --name relic-test --package "$system" --device pixel_2
sudo chmod a+rw /dev/kvm
emulator -avd relic-test -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader -camera-back none >"$RUNNER_TEMP/relic-emulator.log" 2>&1 &
trap 'adb emu kill || true' EXIT
timeout 150 adb wait-for-device
timeout 180 bash -c 'until [[ "$(adb shell getprop sys.boot_completed | tr -d "\r")" == 1 ]]; do sleep 2; done'
adb shell wm size 390x760
adb shell wm density 160
adb shell input keyevent 82
adb install "$apk"
adb shell cmd connectivity airplane-mode enable
adb shell svc wifi disable
adb shell svc data disable
adb shell am start -W -n "$package/.MainActivity"

tap_text() {
  python3 - "$1" <<'PY'
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
                subprocess.run(["adb", "shell", "input", "tap", str((x1+x2)//2), str((y1+y2)//2)], check=True)
                sys.exit(0)
    time.sleep(1)
raise SystemExit("Could not find " + text)
PY
}

tap_text 'Draw steel'
sleep 2
adb shell am force-stop "$package"
adb shell am start -W -n "$package/.MainActivity"
tap_text 'Resume fight'
echo 'Signed APK installed and resumed the same contract with airplane mode enabled.'
