# Release checklist

Use this list every time a new version of the Pack 137 News Builder goes out. Work through the steps in order. If a step does not go as described, stop and tell the project owner what you saw. Do not skip steps.

Some words used here:

- **Version.** A number such as 1.0.0. It is written in one place, the file called `package.json`.
- **Tag.** A label that marks one exact version in the code. A tag looks like `v1.0.0`.
- **Release.** The page on GitHub where the finished zip file is posted for download.
- **Green.** The automatic checks on GitHub all passed. A red mark means at least one failed.

## Step 1: Before you start

1. Open the Actions tab on the project's GitHub page. Find the latest "CI" run on the main branch. It must be green.
2. If it is red, do not release. Tell the project owner.
3. Open `package.json`. Check that the version number is the one you plan to release.
4. Open `CHANGELOG.md`. Check that it lists the changes since the last release.
5. If you have Node.js version 22 or newer, open a terminal in the project folder and run `npm run build`. A folder called `dist` appears. It holds the web files, including `index.html`.
6. The release makes the zip for you. The zip holds one folder with the files from `dist`, plus a short `HOW-TO-USE.md` file copied from `docs/using-the-web-build.md`.

## Step 2: The manual email test

Why this test exists. The automatic checks cannot see how mail apps show an email. The project owner requires this test before every release.

What you need:

- One weekly announcement and one monthly letter, made with the tool.
- A test email address that only you control. Do not send a test to the pack email list.
- Access to each app in the table below: Gmail in a web browser, the Gmail app on an iPhone, the Gmail app on an Android phone, Apple Mail on a Mac or iPhone, and Outlook for Windows on a PC.

Steps:

1. Make the announcement in the converter. Press Copy new HTML.
2. In TroopTrack, start a new email. Address it to your test address only.
3. Press the `<>` button to open code view. Delete the old code. Paste the new code. Save.
4. Send the email to your test address.
5. Repeat steps 1 to 4 for the monthly letter. Use Copy letter HTML.
6. Open both emails in all five apps. Fill in the table below. Fill it in twice, once for the announcement and once for the letter. Rows marked "(letter)" are only for the letter.
7. In each cell, mark `[x]` when the item looks right. If it does not, write the problem in the cell instead.

| Check                  | Gmail web | Gmail on iPhone | Gmail on Android | Apple Mail | Outlook for Windows |
| ---------------------- | --------- | --------------- | ---------------- | ---------- | ------------------- |
| Font                   | [ ]       | [ ]             | [ ]              | [ ]        | [ ]                 |
| Gold label and tags    | [ ]       | [ ]             | [ ]              | [ ]        | [ ]                 |
| Buttons                | [ ]       | [ ]             | [ ]              | [ ]        | [ ]                 |
| Dates                  | [ ]       | [ ]             | [ ]              | [ ]        | [ ]                 |
| Card width             | [ ]       | [ ]             | [ ]              | [ ]        | [ ]                 |
| Photos                 | [ ]       | [ ]             | [ ]              | [ ]        | [ ]                 |
| Links                  | [ ]       | [ ]             | [ ]              | [ ]        | [ ]                 |
| Em dashes              | [ ]       | [ ]             | [ ]              | [ ]        | [ ]                 |
| Inbox preview (letter) | [ ]       | [ ]             | [ ]              | [ ]        | [ ]                 |
| I can help (letter)    | [ ]       | [ ]             | [ ]              | [ ]        | [ ]                 |

What to look at in each row:

1. **Font.** The text looks like a plain sans-serif font, such as Arial. If it looks like Times New Roman (a thin old-style font with small feet on the letters), it fails.
2. **Gold label and tags.** The gold label at the top of each card has room around its words. The small tags after event names have room around their words too. The words "Please RSVP" stay on one line.
3. **Buttons.** Each button is about the height of a fingertip or taller. Tap the edges and the middle of each button. The whole button should open its link. If only the words work, write that down. It does not stop the release.
4. **Dates.** Each date sits on its own line, above its event. A date never sits side by side with the event text.
5. **Card width.** On a computer, the card sits in the middle of the window with grey space on both sides. It is no wider than about 600 pixels. On a phone, the card fills the screen width. That is correct. For Outlook for Windows, see question 2 in Step 3.
6. **Photos.** Each photo fits on the screen. You do not scroll sideways to see it.
7. **Links.** Open three links. Each one opens the right page. Email links open a new email to the right address.
8. **Em dashes.** There are no long dashes between words anywhere in the email.
9. **Inbox preview (letter).** In the inbox list, the line under the subject shows the summary line and the read time. This line is hidden once you open the letter.
10. **I can help (letter).** In Outlook for Windows, the "I can help" button shows as a navy box with white words. Tapping it opens an email to the volunteer address.

Known and accepted. These do not stop the release:

- Gmail dark mode may change the colors.
- Older versions of Outlook show square corners instead of rounded ones.
- In Outlook for Windows, tags show as shaded text without rounded corners or extra space around the words.

Stop the release and tell the project owner if you see any of these:

- Times New Roman text.
- Dates side by side with event text.
- A button that does nothing when tapped.
- A link that is broken or opens the wrong page.
- A long dash between words.
- A photo that runs off the screen.
- The "I can help" button missing in Outlook for Windows.
- Text overlapping or content missing in any app.

## Step 2b: Check the tool itself in Firefox and Safari

The automatic browser tests run in Chrome only. Before each release, open the zip's `index.html` straight from disk in current Firefox (Windows or Mac) and current Safari (Mac), with the internet turned off, and check:

1. The tool opens and shows the three tabs: Weekly announcement, Monthly letter and Settings.
2. Pasting an announcement fills the form and the three previews.
3. Copy new HTML works, and so does Copy letter HTML.
4. Typing in the letter shows "Saved on this device". Close the browser, open `index.html` again, and the letter is offered back.
5. Download draft saves a file, and Open draft opens it again.
6. Underlined spelling shows in text fields and not in address fields.

If any of these fail, do not tag the release. Tell the project owner which browser and step failed.

## Step 2c: Check the desktop apps

Every pull request that changes the desktop app builds test installers. When its "Wrappers" run is green, open the Releases page. A draft called "Test build for pull request #N (not for volunteers)" holds the Windows `.exe`. Only people who can change the project see drafts. Each new run replaces it. Delete the draft once the pull request is merged. If nothing in the desktop app changed since the last release, test the installer from the last release instead.

On a Windows PC, install the app by following `docs/installing-the-desktop-app.md`, with the internet turned off after installing, and check:

1. The warning appears once and the guide's steps get past it.
2. The footer shows the version you plan to release.
3. Pasting an announcement fills the form and the three previews. Copy new HTML puts the code on the clipboard; paste it into a text editor to check.
4. Typing in the letter shows "Saved on this device". Quit the app, open it again, and the letter is offered back.
5. Download draft saves a `.json` file into Downloads. A second press makes a file with " (1)" in its name. Open draft opens it again.
6. Shrink a photo for the letter saves a `-letter.jpg` file into Downloads.

If any of these fail, do not tag the release. Tell the project owner which computer and step failed.

The Android app is checked automatically, because the pack has no test phone (owner decision 2026-11-22). Open the latest "Wrappers" run for the main branch or the last pull request and check that the job "android-emulator (34, false)" is green: it ran 22 checks on an Android 14 emulator (paste, copy, saving into Downloads, the photo picker, saved work after a restart, no internet, no permissions, the 360dp screen). The job "android-emulator (29, true)" is expected to fail and does not block a release. If someone in the pack has an Android phone, installing the test `.apk` from the draft and repeating checks 2 to 6 above is still worth doing.

## Step 3: Answer two questions

This test must answer two questions. Write each answer down and send it to the project owner.

### Question 1: Does TroopTrack keep the letter's Outlook-only parts?

The monthly letter has three parts that only some mail apps use. They are a hidden preview line, a button fallback for Outlook, and a font setting. TroopTrack might remove them when you paste.

1. In TroopTrack, open the pasted letter. Press `<>` to see its code.
2. Near the top, look for a hidden line that contains the words `display:none`. The summary line should be inside it.
3. Look for lines that start with `<!--[if mso]>`. There should be one at the very top, and more just above the "I can help" button.
4. Look for the words `v:roundrect` just below those lines.
5. In Outlook for Windows, check the "I can help" button and the font. Both should look right.

Write "Kept" if all of these are in the TroopTrack code and Outlook shows the button and font correctly. Otherwise write "Removed" and say which part is missing.

### Question 2: How wide is the card in Outlook for Windows?

1. Open the letter in Outlook for Windows. Set the window to its normal size, not full screen.
2. Look at the card.
3. Write "Fine" if the card sits in the middle with grey space on both sides.
4. Write "Stretched" if the card reaches both edges of the window. Tell the project owner. A fixed width is a code change, and the owner must approve it first.

## Step 4: Tag and release

1. Open `package.json`. Change the `version` line to the new number, for example `"1.0.0"`.
2. Open `CHANGELOG.md`. Change the heading "Unreleased" to the new version and the date of release, for example `## 1.0.0 (2026-12-01)`. Add a new, empty "Unreleased" heading above it.
3. Save both files. Commit them to the main branch with the message `chore: release 1.0.0`.
4. Wait for the CI run on the main branch to be green. See Step 1.
5. Create the tag. Run `git tag v1.0.0`, then `git push origin v1.0.0`. The tag must be a lowercase `v` followed by the version in `package.json`. If they do not match, the release stops with a message.
6. Open the Actions tab. Open the "Release" run for the tag. It runs the checks again, runs the browser tests, builds the web files and makes the zip. Another job builds the Windows installer on a Windows machine, and two more build the Android app and sign it with the pack's key. These take longer, often 15 to 25 minutes.
7. If the run fails, no release is made. Do not move or delete the tag yourself. Tell the project owner what the message said.
8. When the run is green, open the Releases page. You should see a release called "Pack 137 News Builder v1.0.0" with these files attached: `pack137-news-builder-v1.0.0-web.zip`, `pack137-news-builder-v1.0.0-windows-setup.exe`, `pack137-news-builder-v1.0.0-android.apk`, a `.sha256` checksum file for each of the three, and `INSTALLING-THE-DESKTOP-APP.md`. A checksum lets anyone check that a copy passed around the pack was not changed.
9. Download the zip. Test it the way a volunteer will. Unzip it, double-click `index.html`, and check the version shown in the tool matches the release. Try this with the internet turned off.
10. Send the project owner the link to the release page. Wait for the owner's sign-off before you tell volunteers about it.
11. On the Releases page, delete any "Test build for pull request #N" drafts that are left over.
12. The last job of the Release run, "deploy-web", puts the new version on https://pack137-news-builder.pages.dev. Open that address, reload, and check the footer shows the new version. If that job failed, the release is still published: open the Actions tab, choose "Deploy web", press Run workflow, type the tag (for example `v1.2.0`) and run it.

## What the release makes

- One zip file, attached to a GitHub release. Its name is `pack137-news-builder-vX.Y.Z-web.zip`, with the version number in place of X.Y.Z.
- Inside the zip: one folder that holds the web files, including `index.html`, and a `HOW-TO-USE.md` file for volunteers.
- A Windows installer, `pack137-news-builder-vX.Y.Z-windows-setup.exe`. It is unsigned, so `INSTALLING-THE-DESKTOP-APP.md` is attached as well. It shows volunteers how to get past the Windows warning.
- No Mac app. Mac volunteers use the web zip in Safari (ADR 0006).
- An Android app, `pack137-news-builder-vX.Y.Z-android.apk`, signed with the pack's release key. Volunteers allow "Install unknown apps" once; `INSTALLING-THE-DESKTOP-APP.md` shows how.
- A `.sha256` checksum file for the zip and for each installer.
- The same web build on https://pack137-news-builder.pages.dev, sent with extra security headers (`scripts/pages-headers.mjs`). The zip and the apps do not change.

## Good practice

- Never put passwords, keys or tokens in the project files.
- The Android release key lives only in the `android-release` environment's secrets on GitHub (Settings, Environments), which only release tags (`v*`) can use, and in the owner's backup. Every Android update must be signed with that same key: if it is lost, volunteers must uninstall and reinstall, which removes their saved work. Never replace it without the owner.
- If the Release run stops at "Sign with the pack's release key" with "no signing key", the environment's secrets `ANDROID_KEYSTORE_B64` and `ANDROID_KEYSTORE_PASSWORD` are missing.
- The hosted web version is on Cloudflare Pages, project `pack137-news-builder`. Its token lives only in the `cloudflare-pages` environment's secrets on GitHub, `CLOUDFLARE_API_TOKEN` (a Cloudflare token that can only edit Pages) and `CLOUDFLARE_ACCOUNT_ID`. Only release tags (`v*`) and the main branch can use that environment, and only the "Deploy web" workflow reads it.
- To roll the hosted site back, run "Deploy web" by hand with the older tag.
- After a release, check that the Status section of `README.md` is still right.
