#!/usr/bin/env bash
# T3 Code project actions. `setup` warms a checkout (runs on worktree creation);
# `run` converges setup and starts MovieFinder against this checkout's own embedded
# PostgreSQL (.local/), on free ports, so worktrees never share state.
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root"
export PATH="$HOME/.local/bin:$PATH"
action=${1:-run}

setup() {
  command -v mise >/dev/null || {
    echo "mise is required: https://mise.jdx.dev" >&2
    exit 1
  }
  mise trust --quiet "$root/mise.toml"
  mise install --quiet
  # Reinstall only when the dependency manifest changes; bun's global cache keeps it fast.
  local stamp=node_modules/.moviefinder-install
  local want
  want=$(cat package.json bun.lock | mise exec -- bun -e 'console.log(Bun.hash(await Bun.stdin.text()).toString(36))')
  if [[ ! -f $stamp || $(cat "$stamp") != "$want" ]]; then
    mise exec -- bun install --frozen-lockfile
    echo "$want" >"$stamp"
  fi
  # Initialize this checkout's cluster and apply migrations ahead of the first run.
  if [[ ! -f .local/dev.pid ]]; then mise exec -- bun run db:migrate; fi
}

run() {
  setup
  if mise exec -- vault run -- true >/dev/null 2>&1; then
    exec mise exec -- bun run dev
  fi
  # Without the platform `vault run` wrapper, read the same Vault config through the
  # personal checkout's CLI. Values stay in the process environment only.
  local personal=${PERSONAL_WORKSPACE:-$HOME/personal}
  if [[ -f $personal/packages/personal-cli/src/cli.ts ]]; then
    exec env PERSONAL_WORKSPACE="$personal" mise exec -- bun "$personal/packages/personal-cli/src/cli.ts" \
      infra-vault run --config dev -- mise exec -- bun scripts/dev.ts
  fi
  # Last resort: a private per-checkout auth secret and cached catalog data only.
  echo "Vault is unavailable; starting without TMDB refresh (catalog stays empty until cached)." >&2
  mkdir -p -m 700 .local
  [[ -f .local/auth-secret ]] || (umask 077 && head -c 48 /dev/urandom | base64 | tr -d '\n' >.local/auth-secret)
  BETTER_AUTH_SECRET=$(cat .local/auth-secret) exec mise exec -- bun scripts/dev.ts
}

case "$action" in
setup) setup ;;
run) run ;;
stop) mise exec -- bun scripts/stop-dev.ts ;;
*)
  echo "Usage: scripts/t3/project.sh setup|run|stop" >&2
  exit 2
  ;;
esac
