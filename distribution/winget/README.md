# WinGet Manifest — OpenGraphDB

This directory stages the WinGet (Windows Package Manager) manifest for `asheshgoplani.opengraphdb` v0.5.1. It is **not** automatically submitted to the WinGet community repository; the user owns the submission step.

## Layout

```
distribution/winget/
├── manifest/
│   └── asheshgoplani.opengraphdb.0.5.1.yaml   # singleton-form manifest
└── README.md
```

The manifest uses singleton form (one YAML for publisher + locale + installer) targeting WinGet manifest schema **1.6.0**. The installer points at the v0.5.1 release zip (`ogdb-0.5.1-x86_64-pc-windows-msvc.zip`) and uses `NestedInstallerType: portable` so WinGet exposes `ogdb` as a portable command without running an installer.

The `InstallerSha256` value is pinned to the published release asset and was taken from `SHA256SUMS.txt`.

## Submitting to winget-pkgs

The community repo is `microsoft/winget-pkgs`. Submission flow (manual, run by the user — we do not auto-PR):

```bash
# 1. Fork microsoft/winget-pkgs in the GitHub UI, then:
gh repo clone <your-fork>/winget-pkgs
cd winget-pkgs

# 2. Drop the manifest into the canonical path expected by the repo:
DEST="manifests/a/asheshgoplani/opengraphdb/0.5.1"
mkdir -p "$DEST"
cp /path/to/opengraphdb/distribution/winget/manifest/asheshgoplani.opengraphdb.0.5.1.yaml "$DEST/"

# 3. Validate locally with the official tool before pushing:
winget validate --manifest "$DEST"

# 4. Branch, commit, push, and PR to microsoft/winget-pkgs (the upstream
#    bots handle the rest, including SmartScreen sandboxing):
git checkout -b add-asheshgoplani-opengraphdb-0.5.1
git add "$DEST"
git commit -m "New version: asheshgoplani.opengraphdb version 0.5.1"
git push origin add-asheshgoplani-opengraphdb-0.5.1
gh pr create --repo microsoft/winget-pkgs \
  --title "New version: asheshgoplani.opengraphdb version 0.5.1" \
  --body "First-time submission for asheshgoplani.opengraphdb."
```

End users then install with:

```powershell
winget install asheshgoplani.opengraphdb
```

## Bumping for a new release

1. Copy the manifest to `asheshgoplani.opengraphdb.<new-version>.yaml`.
2. Update `PackageVersion`, `ReleaseDate`, `InstallerUrl`, and `InstallerSha256`.
3. Pull `InstallerSha256` from the release's `SHA256SUMS.txt` and uppercase it (WinGet convention).
4. Re-run `winget validate` before opening a new PR.

## Validation

If `winget` is not available (Linux/macOS dev hosts), basic YAML validity is checked with:

```bash
python3 -c 'import yaml; yaml.safe_load(open("manifest/asheshgoplani.opengraphdb.0.5.1.yaml"))'
```

For full schema validation, run on a Windows host with the WinGet client installed: `winget validate --manifest manifest/`.
