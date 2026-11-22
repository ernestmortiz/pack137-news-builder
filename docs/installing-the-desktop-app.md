# Installing the desktop app

This guide is for the Pack 137 News Builder on a Windows PC. Mac volunteers use the web version; see the Mac section. It is also attached to every release, as `INSTALLING-THE-DESKTOP-APP.md`.

The desktop app is the same tool as the web version, in its own window. It does the same things. Use the web version if you do not need an installed app. See `using-the-web-build.md`.

You do not need to know HTML. You do need to click through one warning the first time, because the pack does not pay for the certificates that make the warning go away. The warning is expected. The steps below show what to click.

## Step 1: Download the right file

Get the files from the project owner, or from the Releases page of the pack's project on GitHub. Pick the one for your computer.

- Windows PC: the file that ends in `-windows-setup.exe`.
- Mac: there is no Mac app. Use the web zip instead, the file that ends in `-web.zip`. See the Mac section below.

Each file has a matching `.sha256` file. You can ignore it. It is only there for people who want to check that the download was not changed.

## Windows

### Install

1. Double-click the `-windows-setup.exe` file. It is often in your Downloads folder.
2. A blue box may say "Windows protected your PC". This is the warning. It does not mean anything is wrong with the file. It means Windows does not know the pack yet.
3. Click More info. A second button appears.
4. Click Run anyway.
5. Follow the installer. Press Next, then Install, then Finish. You do not need an administrator password. The app installs for your own Windows account only.

If a message says the app needs Microsoft WebView2, let the installer download it. This is rare, because Windows 10 and Windows 11 already have it. It is the only time the installer uses the internet.

### Open it

1. Open the Start menu.
2. Type `Pack 137`.
3. Click Pack 137 News Builder.

You can right-click it and choose Pin to Start or Pin to taskbar.

### Uninstall

Read this first. Your saved work lives inside the app, on this computer. Uninstalling can remove it. Open the monthly letter and press Download draft first, so you have a copy. See "Keep a copy with Download draft" below.

1. Open Settings, then Apps, then Installed apps.
2. Find Pack 137 News Builder. Click the three dots, then Uninstall.
3. If the uninstaller asks whether to delete the app data, that is your saved work. Leave the box empty to keep it. Tick it to remove it.

## Mac

There is no Mac app. Current macOS will not open an app unless Apple has checked it, and that costs the pack a yearly fee. Use the web version instead. It does everything the desktop app does, and it works without the internet once unzipped.

1. Get the web zip, the file that ends in `-web.zip`.
2. Double-click it. A folder appears next to it.
3. Open the folder and double-click `index.html`. It opens in Safari.

See `HOW-TO-USE.md` inside the zip for the rest.

## Where your work is saved

- Your work is saved inside the app, on this computer only. It is a separate place from your web browser. Work you did in the web version is not in the app, and the other way round.
- The monthly letter screen shows "Saved on this device" when your work is saved.
- It does not move to another computer.
- The app never uses the internet. It does not send what you paste or type anywhere. No account is needed.

## Keep a copy with Download draft

Download draft is on the monthly letter screen.

1. Press Download draft.
2. The app saves a file that ends in `.json` in your Downloads folder. The screen says "Look in your Downloads folder".
3. If you press it again, the new file gets a number, such as `pack137-letter-2026-12 (1).json`. Nothing is written over.
4. To carry on later, press Open draft and choose that file. You can do this in this app, in the web version, or on another computer.

Shrink a photo for the letter saves its small photo in Downloads in the same way.

## Everything else works as in the web version

- Copy new HTML and Copy letter HTML copy to your clipboard. If the copy button does not work, the app shows the code in a box. Click inside it, press Ctrl+A then Ctrl+C.
- Open draft opens a normal file window.
- Photos do not show in the preview. They show as grey boxes. This is on purpose.
- The app does not open web pages. Copy the HTML, then paste it into TroopTrack in your web browser.

## Updating

There is no automatic update. When the pack shares a new version, install it the same way. It installs over the old one and keeps your saved work.

The footer of the app shows its version number. It is the same number as the web version.

## If something looks wrong

- If Windows will not let you open the file, check the steps above. The warning is expected. Make sure you click More info, then Run anyway.
- If your work seems to be gone, check that you are in the app and not the web version. If you have a draft file, press Open draft and choose it.
- If you are still stuck, ask the project owner or the volunteer who gave you the file.
