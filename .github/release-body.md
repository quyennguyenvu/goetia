<!-- markdownlint-disable-file MD041 -->
<!-- Prepended to every release's auto-generated notes by release.yml. Keep it
     short and self-contained: this is the only guidance a downloader sees before hitting the first-launch warning. -->

## Before you open it

Goetia isn't signed with a paid Apple or Microsoft certificate, so both systems block the **first** launch. Allow it once and the warning is gone for good. Full walkthrough: [README → Install][install].

[install]: https://github.com/quyennguyenvu/goetia#install-for-everyone

### macOS

Pick `-arm64.dmg` for Apple Silicon, `-x64.dmg` for Intel. Drag Goetia to Applications and open it. macOS says **"Apple could not verify 'Goetia' is free of malware"** — click **Done**, _not_ **Move to Trash** (the highlighted button, which deletes the app). Then either:

- **System Settings → Privacy & Security**, scroll to **Security**, click **Open Anyway**; or
- run this in Terminal:

```sh
xattr -dr com.apple.quarantine /Applications/Goetia.app
```

Right-click → Open no longer works; Apple removed that bypass in macOS 15.

### Windows

**"Windows protected your PC"** → **More info** → **Run anyway**.

### Verifying these files

`SHA256SUMS.txt` below covers every installer, and each one carries a build provenance attestation:

```sh
shasum -a 256 -c SHA256SUMS.txt --ignore-missing
gh attestation verify <file> --repo quyennguyenvu/goetia
```
