#!/usr/bin/env bash
#
# Cut a release: gate on the definition of done, sync package.json to the
# requested version, tag, push. The tag push is what triggers
# .github/workflows/release.yml, which re-checks tag == package.json version
# and fails the build on a mismatch — so that sync is not optional.
#
# Usage: scripts/release.sh <version> [--dry-run] [--skip-checks]
#   scripts/release.sh 0.2.0
#   scripts/release.sh v0.2.0 --dry-run

set -euo pipefail

RELEASE_BRANCH="main"

die() {
  printf '\033[31merror:\033[0m %s\n' "$1" >&2
  exit 1
}
step() { printf '\033[36m==>\033[0m %s\n' "$1"; }
skip() { printf '\033[33m  skipped:\033[0m %s\n' "$1"; }

version=""
dry_run=false
skip_checks=false

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry_run=true ;;
    --skip-checks) skip_checks=true ;;
    -h | --help)
      sed -n '3,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*) die "unknown flag: $1" ;;
    *)
      [ -n "$version" ] && die "unexpected argument: $1"
      version="$1"
      ;;
  esac
  shift
done

[ -n "$version" ] || die "missing version. usage: scripts/release.sh <version> [--dry-run] [--skip-checks]"

version="${version#v}"
if ! printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'; then
  die "not a semver version: $version"
fi
tag="v$version"

cd "$(git rev-parse --show-toplevel)"

run() {
  if $dry_run; then
    printf '\033[90m  would run:\033[0m %s\n' "$*"
  else
    "$@"
  fi
}

# --- preflight -------------------------------------------------------------

step "Preflight"

branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "$RELEASE_BRANCH" ] || die "on branch '$branch', expected '$RELEASE_BRANCH'"

[ -z "$(git status --porcelain)" ] || die "working tree is dirty — commit or stash first"

git fetch --quiet origin "$RELEASE_BRANCH" --tags
behind="$(git rev-list --count "HEAD..origin/$RELEASE_BRANCH")"
[ "$behind" -eq 0 ] || die "$behind commit(s) behind origin/$RELEASE_BRANCH — pull first"

git rev-parse -q --verify "refs/tags/$tag" >/dev/null && die "tag $tag already exists locally"
if git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
  die "tag $tag already exists on origin"
fi

pkg_version="$(node -p "require('./package.json').version")"
echo "  package.json: $pkg_version -> $version"
echo "  tag:          $tag"

# --- definition of done ----------------------------------------------------

if $skip_checks; then
  skip "lint / typecheck / test (--skip-checks)"
else
  step "Checks"
  run corepack pnpm lint
  run corepack pnpm typecheck
  run corepack pnpm test
fi

# --- version bump ----------------------------------------------------------

if [ "$pkg_version" = "$version" ]; then
  step "Version already $version — nothing to bump"
else
  step "Bumping package.json to $version"
  if $dry_run; then
    printf '\033[90m  would rewrite:\033[0m package.json version -> %s\n' "$version"
  else
    # Rewrite the raw text rather than re-serializing, so formatting and key
    # order survive untouched (biome checks this file).
    node -e '
      const fs = require("node:fs");
      const next = process.argv[1];
      const src = fs.readFileSync("package.json", "utf8");
      const out = src.replace(/("version":\s*")[^"]+(")/, `$1${next}$2`);
      if (out === src) throw new Error("version field not found in package.json");
      fs.writeFileSync("package.json", out);
    ' "$version"
  fi
  run git add package.json
  run git commit -m "chore(release): $tag"
fi

# --- tag and push ----------------------------------------------------------

step "Tagging $tag"
run git tag -a "$tag" -m "$tag"

step "Pushing $RELEASE_BRANCH and $tag"
run git push origin "$RELEASE_BRANCH"
run git push origin "$tag"

if $dry_run; then
  printf '\n\033[33mdry run — nothing was changed or pushed.\033[0m\n'
  exit 0
fi

# owner/repo from either an ssh (git@host:owner/repo.git) or https remote.
# Two passes: BSD sed has no lazy quantifier to strip the .git inline.
slug="$(git remote get-url origin | sed -E 's#\.git$##' | sed -E 's#.*[:/]([^/]+/[^/]+)$#\1#')"
printf '\n\033[32mReleased %s\033[0m\n' "$tag"
echo "  Actions:  https://github.com/$slug/actions"
echo "  Release:  https://github.com/$slug/releases/tag/$tag"
