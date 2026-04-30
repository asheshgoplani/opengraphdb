#!/usr/bin/env bash
# One-shot helper for Slice S3: substitute literal Tailwind palette utilities
# with semantic tokens across the playground + landing surfaces.
# Re-running is idempotent — semantic tokens contain no literal palette names,
# so the regex never matches its own output.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

mapfile -t FILES < <(
  find \
    "$FRONTEND_DIR/src/pages" \
    "$FRONTEND_DIR/src/components" \
    -type f \( -name '*.tsx' -o -name '*.ts' \)
)

for f in "${FILES[@]}"; do
  [ -f "$f" ] || { echo "skip (missing): $f"; continue; }

  sed -i \
    -e 's#\btext-white/95\b#text-foreground#g' \
    -e 's#\btext-white/90\b#text-foreground#g' \
    -e 's#\btext-white/85\b#text-foreground/85#g' \
    -e 's#\btext-white/80\b#text-foreground/85#g' \
    -e 's#\btext-white/75\b#text-foreground/85#g' \
    -e 's#\btext-white/70\b#text-foreground/85#g' \
    -e 's#\btext-white/65\b#text-muted-foreground#g' \
    -e 's#\btext-white/60\b#text-muted-foreground#g' \
    -e 's#\btext-white/55\b#text-muted-foreground#g' \
    -e 's#\btext-white/50\b#text-muted-foreground#g' \
    -e 's#\btext-white/45\b#text-muted-foreground/70#g' \
    -e 's#\btext-white/40\b#text-muted-foreground/70#g' \
    -e 's#\btext-white/35\b#text-muted-foreground/70#g' \
    -e 's#\btext-white\b#text-foreground#g' \
    -e 's#\bborder-white/10\b#border-border/60#g' \
    -e 's#\bborder-white/15\b#border-border#g' \
    -e 's#\bborder-white/20\b#border-border#g' \
    -e 's#\bborder-white/25\b#border-border#g' \
    -e 's#\bborder-white/30\b#border-border#g' \
    -e 's#\bbg-white/5\b#bg-muted/40#g' \
    -e 's#\bbg-white/10\b#bg-muted/60#g' \
    -e 's#\bbg-black/30\b#bg-background/60#g' \
    -e 's#\bbg-cyan-500/30\b#bg-accent/40#g' \
    -e 's#\bbg-cyan-500/20\b#bg-accent/30#g' \
    -e 's#\bbg-cyan-500/15\b#bg-accent/25#g' \
    -e 's#\bbg-cyan-500/10\b#bg-accent/20#g' \
    -e 's#\bbg-cyan-500/5\b#bg-accent/10#g' \
    -e 's#\bborder-cyan-300/50\b#border-accent/60#g' \
    -e 's#\bborder-cyan-400/60\b#border-accent#g' \
    -e 's#\bborder-cyan-400/50\b#border-accent#g' \
    -e 's#\bborder-cyan-400/40\b#border-accent#g' \
    -e 's#\bborder-cyan-400/30\b#border-accent/50#g' \
    -e 's#\bborder-cyan-400/20\b#border-accent/40#g' \
    -e 's#\bborder-cyan-400\b#border-accent#g' \
    -e 's#\btext-cyan-100/90\b#text-accent-foreground#g' \
    -e 's#\btext-cyan-100\b#text-accent-foreground#g' \
    -e 's#\btext-cyan-200/80\b#text-accent#g' \
    -e 's#\btext-cyan-200/70\b#text-accent/80#g' \
    -e 's#\btext-cyan-200\b#text-accent#g' \
    -e 's#\btext-cyan-300/80\b#text-accent#g' \
    -e 's#\btext-cyan-300\b#text-accent#g' \
    -e 's#\bfrom-cyan-500/10\b#from-accent/20#g' \
    -e 's#\bto-cyan-500/10\b#to-accent/20#g' \
    -e 's#\bbg-emerald-500/10\b#bg-accent/15#g' \
    -e 's#\bbg-emerald-500/5\b#bg-accent/10#g' \
    -e 's#\bbg-emerald-500\b#bg-accent#g' \
    -e 's#\bbg-emerald-400/60\b#bg-accent/60#g' \
    -e 's#\bbg-emerald-400\b#bg-accent#g' \
    -e 's#\bborder-emerald-400/40\b#border-accent/40#g' \
    -e 's#\bborder-emerald-400/30\b#border-accent/30#g' \
    -e 's#\bborder-emerald-300/20\b#border-accent/30#g' \
    -e 's#\btext-emerald-100/95\b#text-accent#g' \
    -e 's#\btext-emerald-100/90\b#text-accent#g' \
    -e 's#\btext-emerald-100/80\b#text-accent#g' \
    -e 's#\btext-emerald-200/80\b#text-accent#g' \
    -e 's#\btext-emerald-200/70\b#text-accent/80#g' \
    -e 's#\btext-emerald-300/85\b#text-accent#g' \
    -e 's#\btext-emerald-300\b#text-accent#g' \
    -e 's#\btext-emerald-50\b#text-accent#g' \
    -e 's#\bbg-amber-500/20\b#bg-primary/30#g' \
    -e 's#\bbg-amber-500/10\b#bg-primary/20#g' \
    -e 's#\bbg-amber-500/5\b#bg-primary/10#g' \
    -e 's#\bborder-amber-200/70\b#border-primary/70#g' \
    -e 's#\bborder-amber-300/50\b#border-primary/60#g' \
    -e 's#\bborder-amber-400/40\b#border-primary/50#g' \
    -e 's#\btext-amber-50/85\b#text-foreground/85#g' \
    -e 's#\btext-amber-50\b#text-foreground#g' \
    -e 's#\btext-amber-100/90\b#text-primary#g' \
    -e 's#\btext-amber-100/75\b#text-primary/80#g' \
    -e 's#\btext-amber-100/55\b#text-primary/70#g' \
    -e 's#\btext-amber-100\b#text-primary#g' \
    -e 's#\btext-amber-200/80\b#text-primary#g' \
    -e 's#\btext-amber-200\b#text-primary#g' \
    -e 's#\btext-amber-300\b#text-primary#g' \
    -e 's#\bbg-red-950/90\b#bg-destructive/95#g' \
    -e 's#\bbg-red-500/20\b#bg-destructive/25#g' \
    -e 's#\bbg-red-500/10\b#bg-destructive/15#g' \
    -e 's#\bbg-red-500/5\b#bg-destructive/10#g' \
    -e 's#\bbg-red-500\b#bg-destructive#g' \
    -e 's#\bbg-red-400\b#bg-destructive#g' \
    -e 's#\bborder-red-400/50\b#border-destructive/60#g' \
    -e 's#\bborder-red-400/40\b#border-destructive/50#g' \
    -e 's#\bborder-red-400/30\b#border-destructive/40#g' \
    -e 's#\btext-red-50\b#text-destructive-foreground#g' \
    -e 's#\btext-red-100/90\b#text-destructive-foreground#g' \
    -e 's#\btext-red-100\b#text-destructive-foreground#g' \
    -e 's#\btext-red-200/85\b#text-destructive#g' \
    -e 's#\btext-red-200/80\b#text-destructive#g' \
    -e 's#\btext-red-200/70\b#text-destructive/80#g' \
    -e 's#\btext-red-200\b#text-destructive#g' \
    -e 's#\btext-red-300/85\b#text-destructive#g' \
    -e 's#\btext-red-300/70\b#text-destructive/80#g' \
    -e 's#\btext-red-300\b#text-destructive#g' \
    -e 's#\btext-red-400\b#text-destructive#g' \
    -e 's#\bbg-sky-400\b#bg-accent#g' \
    -e 's#\bbg-sky-300\b#bg-accent#g' \
    -e 's#\btext-indigo-300\b#text-primary#g' \
    -e 's#\bvia-slate-900/30\b#via-muted/40#g' \
    -e 's#\bbg-white/40\b#bg-muted/60#g' \
    -e 's#\bbg-white/30\b#bg-muted/60#g' \
    -e 's#\bbg-white/20\b#bg-muted/60#g' \
    -e 's#\bbg-white/80\b#bg-foreground/80#g' \
    -e 's#\bbg-white/\[0\.04\]#bg-muted/40#g' \
    -e 's#\bbg-white/\[0\.03\]#bg-muted/40#g' \
    -e 's#\bbg-white/\[0\.02\]#bg-muted/30#g' \
    -e 's#\bbg-white/\[0\.015\]#bg-muted/20#g' \
    -e 's#\bring-white/\[0\.04\]#ring-border/60#g' \
    -e 's#\bring-white/10\b#ring-border#g' \
    -e 's#\bborder-white/\[0\.04\]#border-border/60#g' \
    -e 's#\bborder-red-500/20\b#border-destructive/30#g' \
    -e 's#\bbg-rose-500/10\b#bg-destructive/15#g' \
    -e 's#\bvia-white/10\b#via-border/60#g' \
    -e 's#\bbg-rose-600\b#bg-destructive#g' \
    -e 's#\bbg-rose-500/25\b#bg-destructive/30#g' \
    -e 's#\bbg-rose-500/15\b#bg-destructive/20#g' \
    -e 's#\bbg-rose-400/60\b#bg-destructive/60#g' \
    -e 's#\bborder-rose-400/40\b#border-destructive/50#g' \
    -e 's#\btext-rose-50\b#text-destructive-foreground#g' \
    -e 's#\btext-rose-100/90\b#text-destructive-foreground#g' \
    -e 's#\btext-rose-100\b#text-destructive-foreground#g' \
    -e 's#\btext-rose-200\b#text-destructive#g' \
    -e 's#\btext-rose-300\b#text-destructive#g' \
    -e 's#\btext-rose-600\b#text-destructive#g' \
    -e 's#\btext-rose-700\b#text-destructive#g' \
    -e 's#\btext-emerald-600\b#text-accent#g' \
    -e 's#\btext-emerald-200\b#text-accent#g' \
    -e 's#\btext-amber-700\b#text-primary#g' \
    -e 's#\btext-amber-600\b#text-primary#g' \
    -e 's#\bbg-amber-500/15\b#bg-primary/20#g' \
    -e 's#\bborder-amber-500/40\b#border-primary/50#g' \
    -e 's#\bborder-amber-300/30\b#border-primary/40#g' \
    -e 's#\bbg-amber-400/60\b#bg-primary/60#g' \
    -e 's#\bbg-amber-500\b#bg-primary#g' \
    -e 's#\bbg-cyan-400/20\b#bg-accent/30#g' \
    -e 's#\bbg-cyan-400\b#bg-accent#g' \
    -e 's#\btext-cyan-400\b#text-accent#g' \
    -e 's#\btext-fuchsia-400\b#text-primary#g' \
    -e 's#\btext-sky-300\b#text-accent#g' \
    -e 's#\bbg-slate-950\b#bg-background#g' \
    -e 's#\bbg-slate-900/90\b#bg-card/90#g' \
    -e 's#\bbg-slate-800\b#bg-muted#g' \
    -e 's#\bborder-slate-800/70\b#border-border#g' \
    -e 's#\bborder-slate-600/60\b#border-border#g' \
    -e 's#\btext-slate-50\b#text-foreground#g' \
    -e 's#\btext-slate-100\b#text-foreground#g' \
    -e 's#\btext-slate-200\b#text-foreground/85#g' \
    -e 's#\btext-slate-300\b#text-muted-foreground#g' \
    -e 's#\btext-slate-400\b#text-muted-foreground#g' \
    -e 's#\bbg-black/80\b#bg-background/90#g' \
    -e 's#\bborder-white/5\b#border-border/40#g' \
    "$f"
  echo "applied: $f"
done
