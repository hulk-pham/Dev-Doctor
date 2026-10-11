# Install troubleshooting

The published disk image is **Apple silicon** and **not notarized**. Project files are not part of the download.

## First launch is blocked

macOS shows **“Dev Doctor” cannot be opened because Apple cannot check it for malicious software**, or says the app is damaged.

1. Move Dev Doctor to **Applications** if it is still on the disk image.
2. In Finder, right-click **Dev Doctor** and choose **Open**, then **Open** again.
3. If that still fails, clear the download quarantine flag in Terminal and open the app once:

```bash
xattr -dr com.apple.quarantine /Applications/Dev\ Doctor.app
open /Applications/Dev\ Doctor.app
```

Do this only for the copy you downloaded from the [Dev Doctor releases](https://github.com/hulk-pham/Dev-Doctor/releases/latest) page.

## “The app is damaged” after a browser download

That message is Gatekeeper treating an unsigned download as untrusted. It is not a broken disk image by itself. Use the right-click **Open** step above. Download the `.dmg` again if the file size looks truncated.

## Intel Mac

The release disk image is `aarch64` (Apple silicon). On an Intel Mac, build from source instead. See [development](development.md).

## Node or Git “not found” after you open the app from Finder

A double-clicked app does not get the same `PATH` as your terminal. Dev Doctor also looks in `/opt/homebrew/bin` and `/usr/local/bin`. If Node was installed only through nvm, launch is more reliable from a terminal that already has `node` on `PATH`:

```bash
open /Applications/Dev\ Doctor.app
```

Run that from the same terminal where `node --version` works.

## The scan never starts

- Choose a folder, not a file.
- System locations such as `/System` and `/usr` are refused.
- A parent folder that contains several projects is listed, not scanned as one project. Open one project from that list.

## Where settings and history live

Settings shows the data folder. It is under Application Support for `com.devdoctor.app`. History stays in that folder. Nothing there is uploaded.
