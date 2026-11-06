# Relic Company

**The Cinder March** is the first playable region. Lead three mercenaries through three encounters and defeat Prior Veyr. Tap a target to focus automatic attacks. When a cast bar appears, interrupt the caster, brace against the hit, or save a heal for the aftermath. Choose one of three boons at each camp. The tollhouse detour pays more if you clear it.

## Install on Android

Open [Relic Company](https://christadd.github.io/relic-company/) in Android Chrome and wait for **Offline ready**. Then open Chrome’s menu and choose **Install and create shortcut → Install**. Launch **Relic Co.** from your home screen. The game and your save are stored on your phone for offline play.

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
- Keep the same installed game address for later releases. If you move from the USB preview to a hosted address, first serve the latest preview over USB. Close every preview window once while online so the preview gets Settings. Then use **Settings → Export save** and import that file from the new address.
- Successful pushes to `main` publish automatically to [GitHub Pages](https://christadd.github.io/relic-company/). The build command, `node build.mjs dist`, assigns a version from the game files and packages them for offline use.

## Local verification

Run `node --test tests/*.test.mjs` for the rules and save checks, `node tests/mobile.mjs` for the Android-sized gameplay flow, and `node tests/mobile.mjs --updates` for the update flow. The browser checks use desktop Edge by default. Set `RELIC_BROWSER` to another Chromium browser executable if needed. The gameplay flow writes screenshots to its temporary browser profile.

For a manual rare-drop check, start the local server with `node serve.mjs --dev`, open `http://localhost:8080/?dev`, and enter `relicDev.forceDrop("queen")`, `relicDev.forceDrop("bell")` or `relicDev.forceDrop("saint")` in the browser console before an eligible clear. Playtest controls are served only in local development mode.
