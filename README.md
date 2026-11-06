# Relic Company

**The Cinder March** is the first playable region. Three mercenaries scout a seeded map of the ruins, find their way around walls, and engage the closest enemies they discover. Tap an enemy token to order a rush, or tap **Auto** to return to nearest-target orders. Interrupt dangerous casts, brace against hits, or save a heal for the aftermath. Pick a boon at camp and choose whether to take the tougher tollhouse route to Prior Veyr.

## Install on Android

Download [relic-company.apk](https://github.com/ChrisTadd/relic-company/releases/latest/download/relic-company.apk) from GitHub Releases and open the downloaded file. If Android asks, allow your browser or file manager to install from this source, then tap **Install**. Open **Relic Company** from your app drawer. The APK contains the game and can launch offline on Android 8 or newer with an up-to-date Android System WebView.

The [browser build](https://christadd.github.io/relic-company/) is also available for desktop play and for Android Chrome installation where GitHub Pages is reachable.

### Local playtesting from Windows over USB

1. With Node.js available, open a terminal in the Relic Company folder and run `node serve.mjs`. Leave it open.
2. Enable **USB debugging** on the phone, connect it to the PC with a USB data cable, and accept the debugging prompt. Extract Google’s Android Platform Tools for Windows and open PowerShell inside the extracted `platform-tools` folder. [Android Platform Tools](https://developer.android.com/tools/releases/platform-tools) · [USB debugging setup](https://developer.android.com/tools/adb#Enabling)
3. Run `./adb.exe devices` to confirm the phone is listed, then run `./adb.exe reverse tcp:8080 tcp:8080`. [Android reverse port forwarding](https://developer.android.com/develop/ui/views/layout/webapps/access-local-server#adb-reverse)
4. On the phone, open `http://localhost:8080/` in Chrome and wait for **Offline ready**. In Chrome’s menu, tap **Install and create shortcut → Install**. On some versions the entry reads **Install app**. Close the setup tab and open **Relic Co.** from the home screen. [Chrome’s Android installation steps](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid)
5. Unplug the phone, enable airplane mode, and reopen the game from the home screen. Start a contract, return to the home screen during a cast, and reopen. **Resume fight** should return you to the same cast. After a run ends, reopen again before dismissing the results to check the payout.

### From an HTTPS host

Extract `relic-company-android.zip` into an HTTPS static host. Open that address in Android Chrome, wait for **Offline ready**, then use Chrome’s **Install** option. Keep using the same address for subsequent builds to retain the phone’s save.

## Playtest notes

- **Campaign** records the three tier clears in order. **Ladder** repeats the region with rising encounter pressure. Any tier clear can roll named items, regardless of mode or route.
- Apply a seed before drawing steel. The seed, tier, mode and ladder rung reproduce the encounter plan. Different active runs roll their own loot.
- The Journal lists the per-item random chances of **1.5%**, **3%** and **5.5%** by tier. Every eligible clear also contributes **1**, **2** or **3** commission marks toward a chosen legendary at **12** marks. A separate trophy roll can award a Kiln Pennant.
- Losses pay coin, iron and XP. Spend them in **Company** and **HQ**. Lookout duty earns ordinary coin at one per five minutes, capped at 24.
- Tune loot, guarantees, enemy roles and difficulty in `data.mjs`.

## Updates and moving your save

- **Settings → Game updates** shows the installed build. Automatic updates are on by default. The app checks when it opens, when it regains a connection, and periodically while open. An update downloads in the background and applies after you leave the results screen.
- With automatic updates off, use **Check for updates** and **Apply downloaded update**. Chrome may also pick up an update when all game windows are closed.
- Android APK installs download signed game updates from [GitHub Releases](https://github.com/ChrisTadd/relic-company/releases). Updates to the Android wrapper itself use the newer signed APK and keep the same app data when installed over the existing app.
- Use **Settings → Export save** in the browser build and **Import save** in the APK to move an existing save. Export after collecting any pending run payout.
- Successful game pushes to `main` build a signed APK and publish to [GitHub Pages](https://christadd.github.io/relic-company/). The build command, `node build.mjs dist`, assigns a version from the game files and packages them for offline use.

## Local verification

Run `node --test tests/*.test.mjs` for the rules and save checks, `node tests/mobile.mjs` for the Android-sized gameplay flow, and `node tests/mobile.mjs --updates` for the update flow. The browser checks use desktop Edge by default. Set `RELIC_BROWSER` to another Chromium browser executable if needed. The gameplay flow writes screenshots to its temporary browser profile.

For a manual rare-drop check, start the local server with `node serve.mjs --dev`, open `http://localhost:8080/?dev`, and enter `relicDev.forceDrop("queen")`, `relicDev.forceDrop("bell")` or `relicDev.forceDrop("saint")` in the browser console before an eligible clear. Playtest controls are served only in local development mode.
