# Homebrew Tap — OpenGraphDB

This directory stages the Homebrew formula for `opengraphdb` v0.5.1. It is **not** itself a tap — Homebrew taps live in repos named `homebrew-<name>` (e.g. `asheshgoplani/homebrew-opengraphdb`).

## Layout

```
distribution/homebrew/
├── Formula/
│   └── opengraphdb.rb     # bottle-style formula pointing at GitHub release tarballs
└── README.md
```

The formula installs prebuilt binaries from `github.com/asheshgoplani/opengraphdb/releases/download/v0.5.1/`. SHA256 values are pinned to the v0.5.1 release assets and were taken from `SHA256SUMS.txt` published with the release.

## Publishing to a tap repo

The user owns this step (we do not push automatically):

```bash
# 1. Create the tap repo on GitHub (one-time, manual via gh / web UI):
gh repo create asheshgoplani/homebrew-opengraphdb --public \
  --description "Homebrew tap for OpenGraphDB"

# 2. Clone it and copy the formula in:
git clone git@github.com:asheshgoplani/homebrew-opengraphdb.git
cd homebrew-opengraphdb
mkdir -p Formula
cp /path/to/opengraphdb/distribution/homebrew/Formula/opengraphdb.rb Formula/
git add Formula/opengraphdb.rb
git commit -m "opengraphdb 0.5.1"
git push origin main

# 3. End users install with:
brew tap asheshgoplani/opengraphdb
brew install opengraphdb
```

## Bumping for a new release

1. Update `version`, the four `url` lines, and the four `sha256` values in `Formula/opengraphdb.rb`.
2. Pull SHA256 values from the release's `SHA256SUMS.txt` artifact, not by recomputing locally.
3. Run `brew style Formula/opengraphdb.rb` and `brew audit --strict --online opengraphdb` against the published tap before merging.

## Validation

Run from this directory:

```bash
brew style Formula/opengraphdb.rb
```

If `brew` is unavailable on the host (e.g. CI without Homebrew installed), `ruby -c Formula/opengraphdb.rb` confirms syntactic validity at a minimum.
