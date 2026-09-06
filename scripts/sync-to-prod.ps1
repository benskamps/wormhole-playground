<#
.SYNOPSIS
  One-shot dev -> prod sync for the Wormhole Physics Playground.

.DESCRIPTION
  Copies the playground's runtime files from THIS source repo
  (coherence-lab/sims/wormhole, repo benskamps/wormhole-playground) into the
  live website tree (brokenbranchdevwebsite/lab/wormhole).

  WHY THIS EXISTS
  ---------------
  There was no dev->prod sync step, so the two trees drifted: the website copy
  was hand-edited after the last manual copy. As of the last reconcile
  (2026-06-19) the divergence is exactly:

    * js/*.js          -> CONTENT-IDENTICAL to source (prod only had CRLF line
                          endings). Safe to overwrite. This is where the real
                          feature work lives (the geodesic raytracer + doughnut).
    * playground.html  -> prod has INJECTED <head> SEO/OG/Twitter/JSON-LD that is
      index.html          NOT in source, plus a couple of site-local link
                          rewrites (e.g. ../kozyrev-mirror/ -> /coherence-lab/).
                          Blindly copying would DELETE that SEO block.
    * README.md        -> hand-edited in prod.

  Therefore this script copies the JS payload by default and, for the HTML +
  README, REFUSES to overwrite unless you pass -ForceHtml. Run a diff first and
  re-apply any source-side HTML/body changes by hand so prod's <head> survives.

  SAFETY: dry-run by default. Nothing is written until you pass -Apply. This
  script only touches the local prod working tree; it never commits or pushes.
  The website repo is a live production site -- review, commit, and deploy
  through the website repo's own workflow.

.PARAMETER Apply
  Actually copy. Without it, prints what WOULD change (dry run).

.PARAMETER ForceHtml
  Also overwrite the HTML + README files. Only do this after you have manually
  carried prod's <head> SEO block into the source files (or accept losing it).

.PARAMETER ProdRoot
  Override the destination path (defaults to the sibling website repo).

.EXAMPLE
  pwsh scripts/sync-to-prod.ps1                # dry run, JS only
  pwsh scripts/sync-to-prod.ps1 -Apply         # copy JS for real
  pwsh scripts/sync-to-prod.ps1 -Apply -ForceHtml   # also overwrite HTML (careful)
#>
[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$ForceHtml,
  [string]$ProdRoot = "$PSScriptRoot\..\..\..\..\brokenbranchdevwebsite\lab\wormhole"
)


# ---------------------------------------------------------------------------
# DISABLED 2026-09-06 — this script would overwrite the live site with older
# content; the site's labs/wormhole copy is ahead of this repo (46-orders
# correction, aria-labels, extracted integrator, /labs/ paths). Phase 3 of
# brokenbranchdevwebsite/docs/level-up-plan-2026-09.md back-ports those fixes
# and replaces this with a pull-mirror in the site repo. Until then, refuse.
Write-Error "sync-to-prod is disabled: it would overwrite the site with older content. See brokenbranchdevwebsite/docs/level-up-plan-2026-09.md, Phase 3."
exit 1
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'
$SrcRoot = Resolve-Path "$PSScriptRoot\.."

if (-not (Test-Path $ProdRoot)) {
  Write-Error "Prod tree not found: $ProdRoot`nPass -ProdRoot <path> to the website's lab/wormhole directory."
  exit 1
}
$ProdRoot = (Resolve-Path $ProdRoot).Path

# Files that are safe to copy verbatim (the runtime payload).
$JsFiles = @(
  'js/wormhole-gl.js',
  'js/wormhole-ui.js',
  'js/wormhole-physics.js',
  'js/wormhole-panels.js'
)
# Files that carry prod-only edits (SEO head, site links). Gated behind -ForceHtml.
$HtmlFiles = @('index.html', 'playground.html', 'README.md')

function Compare-File($rel) {
  $s = Join-Path $SrcRoot $rel
  $d = Join-Path $ProdRoot $rel
  if (-not (Test-Path $s)) { return @{ rel=$rel; state='MISSING-SRC' } }
  if (-not (Test-Path $d)) { return @{ rel=$rel; state='NEW' } }
  # normalize CRLF/LF so line-ending-only diffs read as identical
  $sc = (Get-Content -Raw $s) -replace "`r`n","`n"
  $dc = (Get-Content -Raw $d) -replace "`r`n","`n"
  if ($sc -eq $dc) { return @{ rel=$rel; state='SAME' } }
  return @{ rel=$rel; state='DIFF' }
}

Write-Host "Wormhole dev -> prod sync" -ForegroundColor Cyan
Write-Host "  source: $SrcRoot"
Write-Host "  prod  : $ProdRoot"
Write-Host ("  mode  : {0}{1}" -f ($(if($Apply){'APPLY'}else{'DRY-RUN'})), $(if($ForceHtml){' +ForceHtml'}else{''}))
Write-Host ""

$copied = 0
Write-Host "JS payload (safe to overwrite):" -ForegroundColor Yellow
foreach ($f in $JsFiles) {
  $c = Compare-File $f
  switch ($c.state) {
    'SAME'        { Write-Host "  [same] $f" }
    'NEW'         { Write-Host "  [new ] $f -> will create" -ForegroundColor Green }
    'DIFF'        { Write-Host "  [diff] $f -> will overwrite" -ForegroundColor Green }
    'MISSING-SRC' { Write-Host "  [!!  ] $f missing in source -- skipping" -ForegroundColor Red }
  }
  if ($Apply -and $c.state -in 'NEW','DIFF') {
    $dst = Join-Path $ProdRoot $f
    New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
    Copy-Item (Join-Path $SrcRoot $f) $dst -Force
    $copied++
  }
}

Write-Host ""
Write-Host "HTML + README (prod-only SEO/edits -- gated):" -ForegroundColor Yellow
foreach ($f in $HtmlFiles) {
  $c = Compare-File $f
  if ($c.state -eq 'SAME') { Write-Host "  [same] $f"; continue }
  if (-not $ForceHtml) {
    Write-Host "  [skip] $f ($($c.state)) -- prod may hold SEO head / site links." -ForegroundColor DarkYellow
    Write-Host "         diff:  git -C `"$ProdRoot`" diff --no-index -- `"$(Join-Path $SrcRoot $f)`" `"$(Join-Path $ProdRoot $f)`""
    continue
  }
  Write-Host "  [FORCE] $f -> will overwrite (you confirmed -ForceHtml)" -ForegroundColor Red
  if ($Apply) { Copy-Item (Join-Path $SrcRoot $f) (Join-Path $ProdRoot $f) -Force; $copied++ }
}

Write-Host ""
if ($Apply) {
  Write-Host "Done. $copied file(s) written to prod working tree." -ForegroundColor Green
  Write-Host "NEXT: review with 'git status' / 'git diff' IN THE WEBSITE REPO, then commit + deploy there."
} else {
  Write-Host "Dry run -- nothing written. Re-run with -Apply to copy." -ForegroundColor Cyan
}
