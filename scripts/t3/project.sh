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

# T3's Preview URL for Run app points at this port. A second checkout running at the
# same time falls back to a free port (printed at startup).
preview_port=5317
# Loopback only: the tailnet proxy for this port listens on the tailnet address.
port_free() {
  local host
  for host in 127.0.0.1 ::1; do
    if (exec 3<>"/dev/tcp/$host/$1") 2>/dev/null; then return 1; fi
  done
}

# Publish the dev server to this machine's tailnet only (never the LAN or internet), so a
# phone on the tailnet opens it directly at https://<machine>.<tailnet>.ts.net:<port>.
share_on_tailnet() {
  [[ ${MOVIEFINDER_TAILNET:-1} == 1 && -n ${MOVIEFINDER_WEB_PORT:-} ]] || return 0
  command -v tailscale >/dev/null || return 0
  local name
  name=$(tailscale status --json 2>/dev/null | mise exec -- bun -e 'const s=JSON.parse(await Bun.stdin.text());console.log(s.BackendState==="Running"?(s.Self?.DNSName??"").replace(/\.$/,""):"")') || return 0
  [[ -n $name ]] || return 0
  if tailscale serve --bg --https="$MOVIEFINDER_WEB_PORT" "http://127.0.0.1:$MOVIEFINDER_WEB_PORT" >/dev/null 2>&1; then
    export MOVIEFINDER_DEV_HOST=127.0.0.1
    export MOVIEFINDER_ADDITIONAL_ORIGINS="https://$name:$MOVIEFINDER_WEB_PORT"
    # Repeat the phone URL once the server answers, so it is the last line after Vite's
    # banner (whose loopback address only works on this machine).
    local url="https://$name:$MOVIEFINDER_WEB_PORT" port=$MOVIEFINDER_WEB_PORT
    (for _ in $(seq 1 120); do
      if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
        sleep 1
        printf '\n  Open on your phone (Tailscale on): %s\n\n' "$url"
        exit 0
      fi
      sleep 1
    done) &
  else
    echo "Tailscale serve is unavailable; the app is reachable on this machine only." >&2
  fi
}

run() {
  setup
  if [[ -z ${MOVIEFINDER_WEB_PORT:-} && ! -f .local/auth-relay.json ]] && port_free "$preview_port"; then
    export MOVIEFINDER_WEB_PORT=$preview_port
  fi
  share_on_tailnet
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
