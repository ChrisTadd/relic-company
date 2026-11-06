#!/usr/bin/env bash
set -euo pipefail

work=$1
version=$2
sdk=${ANDROID_SDK_ROOT:-${ANDROID_HOME:?Android SDK is required}}
tools="$sdk/build-tools/35.0.0"
platform="$sdk/platforms/android-35/android.jar"
mkdir -p "$work/assets" "$work/res/drawable" "$work/classes" "$work/dex" "$work/release"
node build.mjs "$work/assets/game"
cp icon-192.png "$work/res/drawable/relic.png"
"$tools/aapt2" compile --dir "$work/res" -o "$work/resources.zip"
"$tools/aapt2" link -I "$platform" --manifest android/AndroidManifest.xml -A "$work/assets" \
  --version-code "$version" --version-name "1.0.$version" -o "$work/unsigned.apk" "$work/resources.zip"
javac --release 8 -classpath "$platform" -d "$work/classes" android/*.java
mapfile -t classes < <(find "$work/classes" -name '*.class')
"$tools/d8" --min-api 26 --lib "$platform" --output "$work/dex" "${classes[@]}"
zip -q -j "$work/unsigned.apk" "$work/dex/classes.dex"
"$tools/zipalign" -f 4 "$work/unsigned.apk" "$work/aligned.apk"
"$tools/apksigner" sign --ks "$work/signing.pfx" --ks-type PKCS12 \
  --ks-pass env:RELIC_ANDROID_KEY_PASSWORD --out "$work/release/relic-company.apk" "$work/aligned.apk"
"$tools/apksigner" verify --verbose --print-certs "$work/release/relic-company.apk"
"$tools/aapt" dump badging "$work/release/relic-company.apk"

zip -q -j "$work/release/relic-game.zip" "$work/assets/game/"*
hash=$(sha256sum "$work/release/relic-game.zip" | cut -d ' ' -f1)
printf '{"version":%s,"sha256":"%s"}\n' "$version" "$hash" > "$work/release/relic-update.json"
openssl pkcs12 -in "$work/signing.pfx" -passin env:RELIC_ANDROID_KEY_PASSWORD -nocerts -noenc -legacy |
  openssl dgst -sha256 -sign /dev/stdin -out "$work/release/relic-update.sig" "$work/release/relic-update.json"
