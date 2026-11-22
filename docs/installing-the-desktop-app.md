# Installing the desktop app

This guide is for the Pack 137 News Builder on a Windows PC or a Mac. It is also attached to every release, as `INSTALLING-THE-DESKTOP-APP.md`.

The desktop app is the same tool as the web version, in its own window. It does the same things. Use the web version if you do not need an installed app. See `using-the-web-build.md`.

You do not need to know HTML. You do need to click through one warning the first time, because the pack does not pay for the certificates that make the warning go away. The warning is expected. The steps below show what to click.

## Step 1: Download the right file

Get the files from the project owner, or from the Releases page of the pack's project on GitHub. Pick the one for your computer.

- Windows PC: the file that ends in `-windows-setup.exe`.
- Mac: the file that ends in `-macos.dmg`. It works on newer Macs and older Intel Macs. It needs macOS 11.3 or later.

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

### Install

1. Double-click the `-macos.dmg` file. A window opens.
2. Drag Pack 137 News Builder onto the Applications folder in that window.
3. Close the window. In Finder, drag the disk image icon to the Trash to eject it.

### Open it the first time

The first time, your Mac blocks the app. On current macOS (macOS 15 and later), right-clicking the app and choosing Open does not get past this any more. Use System Settings instead.

1. Open Pack 137 News Builder from the Applications folder. A message says Apple cannot verify that the app is free of malware. This is the expected warning for an app the pack has not paid Apple to check. It does not mean anything was found. Click Done. Do not click Move to Trash.
2. Open the Apple menu, then System Settings.
3. Click Privacy & Security in the list on the left.
4. Scroll down to the Security heading. A line says "Pack 137 News Builder" was blocked to protect your Mac.
5. Click Open Anyway.
6. Another message asks again. Click Open Anyway.
7. Type your Mac password, or use Touch ID, and confirm.

The app opens. From now on it opens with a normal double-click. You only do this once for each version you install.

The words on the screens can change a little between macOS versions. Look for Privacy & Security and a button called Open Anyway. The button only shows for about an hour after the blocked attempt. If you cannot see it, open the app again and go back to step 2.

### Uninstall

Download draft first, as above. Then drag Pack 137 News Builder from Applications to the Trash. Your saved work normally stays on the Mac in a hidden folder until you remove it, but do not count on that.

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

- Copy new HTML and Copy letter HTML copy to your clipboard. If the copy button does not work, the app shows the code in a box. Click inside it, press Ctrl+A then Ctrl+C (Command+A then Command+C on a Mac).
- Open draft opens a normal file window.
- Photos do not show in the preview. They show as grey boxes. This is on purpose.
- The app does not open web pages. Copy the HTML, then paste it into TroopTrack in your web browser.

## Updating

There is no automatic update. When the pack shares a new version, install it the same way. It installs over the old one and keeps your saved work. On a Mac, drag the new app onto Applications and choose Replace.

The footer of the app shows its version number. It is the same number as the web version.

## If something looks wrong

- If Windows or the Mac will not let you open the file, check the steps above. The warning is expected. Make sure you click More info on Windows, or Open Anyway in Privacy & Security on a Mac.
- If your work seems to be gone, check that you are in the app and not the web version. If you have a draft file, press Open draft and choose it.
- If you are still stuck, ask the project owner or the volunteer who gave you the file.
