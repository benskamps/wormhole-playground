#!/usr/bin/env bash
# One-shot dev -> prod sync for the Wormhole Physics Playground.
#
# Copies the playground's runtime files from THIS source repo
# (coherence-lab/sims/wormhole, repo benskamps/wormhole-playground) into the live
# website tree (brokenbranchdevwebsite/lab/wormhole).
#
# WHY THIS EXISTS
# ---------------
# There was no dev->prod sync step, so the trees drifted (the website copy was
# hand-edited after the last manual copy). As of the last reconcile (2026-06-19)
# the divergence is exactly:
#
#   * js/*.js         -> CONTENT-IDENTICAL to source (prod only had CRLF). Safe
#                        to overwrite. The real feature work lives here.
#   * playground.html -> prod has INJECTED <head> SEO/OG/Twitter/JSON-LD not in
#     index.html         source, plus site-local link rewrites. Blindly copying
#                        would DELETE that SEO block.
#   * README.md       -> hand-edited in prod.
#
# So this copies the JS payload by default and REFUSES to overwrite the HTML +
# README unless --force-html is passed. Diff first and re-apply any source-side
# HTML/body changes by hand so prod's <head> survives.
#
# SAFETY: dry-run by default; nothing is written until --apply. Touches only the
# local prod working tree -- never commits or pushes. The website repo is a live
# production site: review, commit, and deploy through its own workflow.
#
# Usage:
#   scripts/sync-to-prod.sh                 # dry run, JS only
#   scripts/sync-to-prod.sh --apply         # copy JS for real
#   scripts/sync-to-prod.sh --apply --force-html   # also overwrite HTML (careful)
#   scripts/sync-to-prod.sh --prod <path>   # override destination
set -euo pipefail

# ---------------------------------------------------------------------------
# DISABLED 2026-09-06 — this script would overwrite the live site with older
# content. The site's copy (brokenbranchdevwebsite/labs/wormhole) is currently
# AHEAD of this repo: it carries the 46-orders correction, the aria-labels, the
# extracted js/wormhole-integrator.js (playground.html's former inline script,
# which the site's enforced CSP blocks), and the /labs/ paths. This script
# targets lab/wormhole (gone), omits the integrator, and would restore the
# inline <script>. Phase 3 of brokenbranchdevwebsite/docs/level-up-plan-2026-09.md
# back-ports the site's fixes here and replaces this with a pull-mirror in the
# site repo. Until then, refuse to run.
echo "sync-to-prod is disabled: it would overwrite the site with older content." >&2
echo "See brokenbranchdevwebsite/docs/level-up-plan-2026-09.md, Phase 3." >&2
exit 1
# ---------------------------------------------------------------------------

SRC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROD_ROOT="$(cd "$SRC_ROOT/../../../brokenbranchdevwebsite/lab/wormhole" 2>/dev/null && pwd || true)"
APPLY=0; FORCE_HTML=0

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --force-html) FORCE_HTML=1 ;;
    --prod) shift; PROD_ROOT="$1" ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ -z "${PROD_ROOT:-}" ] || [ ! -d "$PROD_ROOT" ]; then
  echo "Prod tree not found. Pass --prod <path> to the website's lab/wormhole dir." >&2
  exit 1
fi

JS_FILES=(js/wormhole-gl.js js/wormhole-ui.js js/wormhole-physics.js js/wormhole-panels.js)
HTML_FILES=(index.html playground.html README.md)

# returns: SAME | DIFF | NEW | MISSING-SRC  (ignoring CRLF/LF)
cmp_state() {
  local rel="$1" s="$SRC_ROOT/$1" d="$PROD_ROOT/$1"
  [ -f "$s" ] || { echo "MISSING-SRC"; return; }
  [ -f "$d" ] || { echo "NEW"; return; }
  if diff -q <(tr -d '\r' < "$s") <(tr -d '\r' < "$d") >/dev/null 2>&1; then echo "SAME"; else echo "DIFF"; fi
}

echo "Wormhole dev -> prod sync"
echo "  source: $SRC_ROOT"
echo "  prod  : $PROD_ROOT"
echo "  mode  : $([ $APPLY -eq 1 ] && echo APPLY || echo DRY-RUN)$([ $FORCE_HTML -eq 1 ] && echo ' +force-html')"
echo ""

copied=0
echo "JS payload (safe to overwrite):"
for f in "${JS_FILES[@]}"; do
  st="$(cmp_state "$f")"
  case "$st" in
    SAME) echo "  [same] $f" ;;
    NEW)  echo "  [new ] $f -> will create" ;;
    DIFF) echo "  [diff] $f -> will overwrite" ;;
    MISSING-SRC) echo "  [!!  ] $f missing in source -- skipping" ;;
  esac
  if [ $APPLY -eq 1 ] && { [ "$st" = NEW ] || [ "$st" = DIFF ]; }; then
    mkdir -p "$(dirname "$PROD_ROOT/$f")"; cp -f "$SRC_ROOT/$f" "$PROD_ROOT/$f"; copied=$((copied+1))
  fi
done

echo ""
echo "HTML + README (prod-only SEO/edits -- gated):"
for f in "${HTML_FILES[@]}"; do
  st="$(cmp_state "$f")"
  [ "$st" = SAME ] && { echo "  [same] $f"; continue; }
  if [ $FORCE_HTML -eq 0 ]; then
    echo "  [skip] $f ($st) -- prod may hold SEO head / site links."
    echo "         diff:  diff <(tr -d '\\r' < \"$SRC_ROOT/$f\") <(tr -d '\\r' < \"$PROD_ROOT/$f\")"
    continue
  fi
  echo "  [FORCE] $f -> will overwrite (you confirmed --force-html)"
  [ $APPLY -eq 1 ] && { cp -f "$SRC_ROOT/$f" "$PROD_ROOT/$f"; copied=$((copied+1)); }
done

echo ""
if [ $APPLY -eq 1 ]; then
  echo "Done. $copied file(s) written to prod working tree."
  echo "NEXT: review with 'git status' / 'git diff' IN THE WEBSITE REPO, then commit + deploy there."
else
  echo "Dry run -- nothing written. Re-run with --apply to copy."
fi
