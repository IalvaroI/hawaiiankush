#!/usr/bin/env bash
# Deploys the storefront on the VPS. Run as the service user (shop), from anywhere:
#   sudo -u shop -H env SKIP_E2E=1 /srv/shop/repo/scripts/deploy.sh
#
# Steps: preflight the .env and the Sweed key → update the clone (fast-forward only) → install, test, build →
# assemble a release (built site + server code) → start it on a side port and smoke-test it → switch `current` to
# it and restart the service → smoke-test the live port. The live site only changes after the staged release has
# passed every check, and a failed live check switches back to the previous release.
# See README.md for the one-time setup this expects.
#
# Settings (environment):
#   SHOP_ROOT      default /srv/shop (holds repo/, shared/.env, releases/, current)
#   PHOTO_LIBRARY  default $SHOP_ROOT/shared/images (persistent local image assets)
#   DEPLOY_BRANCH  default main
#   SHOP_RESTART   default "sudo -n systemctl restart shop"
#   STAGE_PORT     default 3100 (side port for the staged release; must be free)
#   SKIP_E2E=1     run the unit and server tests only (no Chromium on the box); CI runs the browser tests
#   KEEP_RELEASES  default 5
set -euo pipefail

ROOT=${SHOP_ROOT:-/srv/shop}
REPO=$ROOT/repo
ENV_FILE=$ROOT/shared/.env
PHOTO_LIBRARY=${PHOTO_LIBRARY:-$ROOT/shared/images}
BRANCH=${DEPLOY_BRANCH:-main}
RESTART=${SHOP_RESTART:-sudo -n systemctl restart shop}
STAGE_PORT=${STAGE_PORT:-3100}
KEEP=${KEEP_RELEASES:-5}

say() { printf '\n== %s\n' "$*"; }
die() { printf '\nDEPLOY STOPPED: %s\n' "$*" >&2; exit 1; }

# Runs a command with the server's .env loaded, in a subshell so the variables never leak into the test run.
with_env() { ( set -a; . "$ENV_FILE"; set +a; "$@" ); }

wait_for() { # url, seconds
  for _ in $(seq 1 "$2"); do
    curl -fsS -o /dev/null "$1" 2>/dev/null && return 0
    sleep 1
  done
  return 1
}

say "Preflight: $ENV_FILE"
[ -f "$ENV_FILE" ] || die "no $ENV_FILE (see the runbook, step 3)"
if grep -q $'\r' "$ENV_FILE"; then die "$ENV_FILE has Windows line endings, so Sweed sees a different origin. Fix: sed -i 's/\\r\$//' $ENV_FILE"; fi
with_env node --input-type=module -e '
  const e = process.env, problems = []
  for (const name of ["API_BASE_URL", "STORE_ID", "ECOM_API_KEY", "API_ORIGIN", "PUBLIC_ORIGIN", "BASE_PATH"]) if (!e[name]) problems.push(`${name} is empty`)
  if (e.VITE_SHOP_MODE !== "live") problems.push("VITE_SHOP_MODE must be live")
  for (const name of ["API_ORIGIN", "PUBLIC_ORIGIN"]) if (e[name] && !/^https:\/\/[^/\s]+$/.test(e[name])) problems.push(`${name} must be exactly https://host, with no path, slash or spaces`)
  if (e.COOKIE_SECURE === "false") problems.push("COOKIE_SECURE must not be false in production")
  if (/\s/.test(e.ECOM_API_KEY || "")) problems.push("ECOM_API_KEY contains whitespace")
  if (problems.length) { console.error(problems.join("\n")); process.exit(1) }
' || die "fix the .env values above"

say "Preflight: can this box read the store from Sweed with this key?"
# The key stays in the environment: it never appears in arguments, output or logs.
with_env node --input-type=module -e '
  const e = process.env
  const url = new URL(`${e.API_BASE_URL.replace(/\/$/, "")}/ecom/v2/stores/${encodeURIComponent(e.STORE_ID)}`)
  const res = await fetch(url, { headers: { "x-api-key": e.ECOM_API_KEY, origin: e.API_ORIGIN, accept: "application/json" }, signal: AbortSignal.timeout(20000) })
  const body = await res.text()
  if (res.ok) { console.log(`Sweed answered ${res.status} for store "${JSON.parse(body).store?.name}"`); process.exit(0) }
  console.error(`Sweed answered ${res.status}: ${body.slice(0, 200)}`)
  process.exit(1)
' || die "Sweed refused the read. Work through \"403\" in README.md before deploying; the live site is unchanged"

say "Updating $REPO to origin/$BRANCH (fast-forward only)"
cd "$REPO"
[ -z "$(git status --porcelain)" ] || die "$REPO has local changes; commit them upstream or discard them first"
git fetch -q origin "$BRANCH"
git merge -q --ff-only "origin/$BRANCH" || die "origin/$BRANCH does not fast-forward from the checked-out commit"
SHA=$(git rev-parse --short HEAD)
echo "Deploying $SHA: $(git log -1 --format=%s)"

say "Syncing the persistent product photo library"
# A checkout with photo manifests (public/images/<library>/manifest.json) expects the matching photo files, which live
# outside git. The customer package ships without manifests, so it has no library to sync and products use the store's photos.
if ls "$REPO"/public/images/*/manifest.json >/dev/null 2>&1; then
  [ -d "$PHOTO_LIBRARY" ] || die "photo library missing at $PHOTO_LIBRARY; see the image-library section in README.md"
  mkdir -p "$REPO/public/images"
  rsync -a "$PHOTO_LIBRARY/" "$REPO/public/images/"
  [ "$(find "$REPO/public/images" -type f ! -name manifest.json | wc -l)" -gt 0 ] || die "no photo files found in $PHOTO_LIBRARY"
else
  echo "No photo manifests in public/images, so there is no library to sync."
fi

say "Installing and testing"
npm ci --no-audit --no-fund
if [ "${SKIP_E2E:-0}" = 1 ]; then
  npm run check:ids && npm run test:server && npm run test:meta && npm run test:unit
else
  npm test
fi

say "Building with the production settings"
with_env npm run build

RELEASE=$ROOT/releases/$SHA-$(date -u +%Y%m%d%H%M%S)
mkdir -p "$ROOT/releases"
mkdir "$RELEASE"
cp -R dist "$RELEASE/dist"
cp -R server shared package.json "$RELEASE/"
rm -f "$RELEASE"/server/*.test.js
echo "Release assembled at $RELEASE"

say "Staging the release on 127.0.0.1:$STAGE_PORT"
BASE=$(with_env sh -c 'printf %s "${BASE_PATH%/}"')
( cd "$RELEASE" && exec env -i PATH="$PATH" HOME="${HOME:-/tmp}" bash -c "set -a; . '$ENV_FILE'; set +a; PORT=$STAGE_PORT HOST=127.0.0.1 DIST_DIR='$RELEASE/dist' exec node server/index.js" ) > "$RELEASE/stage.log" 2>&1 &
STAGE_PID=$!
trap 'kill $STAGE_PID 2>/dev/null || true' EXIT
wait_for "http://127.0.0.1:$STAGE_PORT$BASE/healthz" 20 || { cat "$RELEASE/stage.log"; die "the staged release did not start"; }
with_env node scripts/smoke.mjs "http://127.0.0.1:$STAGE_PORT" || die "the staged release failed its checks; the live site is unchanged"
kill $STAGE_PID 2>/dev/null || true
trap - EXIT

say "Switching to $RELEASE"
PREVIOUS=$(readlink "$ROOT/current" 2>/dev/null || true)
ln -sfn "$RELEASE" "$ROOT/current.next"
mv -T "$ROOT/current.next" "$ROOT/current"
$RESTART
LIVE_PORT=$(with_env sh -c 'printf %s "${PORT:-3000}"')

rollback() {
  [ -n "$PREVIOUS" ] || die "$1, and there is no previous release to go back to"
  echo "Rolling back to $PREVIOUS"
  ln -sfn "$PREVIOUS" "$ROOT/current.next"
  mv -T "$ROOT/current.next" "$ROOT/current"
  $RESTART
  die "$1; rolled back to $PREVIOUS"
}

wait_for "http://127.0.0.1:$LIVE_PORT$BASE/healthz" 20 || rollback "the service did not come back up"
with_env node scripts/smoke.mjs "http://127.0.0.1:$LIVE_PORT" || rollback "the live checks failed"

say "Pruning old releases (keeping $KEEP)"
CURRENT=$(readlink "$ROOT/current")
ls -1dt "$ROOT"/releases/*/ 2>/dev/null | sed 's:/$::' | tail -n +"$((KEEP + 1))" | while read -r old; do
  case "$old" in "$ROOT"/releases/?*) ;; *) continue ;; esac
  [ "$old" = "$CURRENT" ] || [ "$old" = "$PREVIOUS" ] || rm -rf -- "$old"
done

say "Deployed $SHA"
