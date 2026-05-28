#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${CODEX_PROXY_RUNTIME_DIR:-"$HOME/.codex-proxy"}"
LOG_FILE="${CODEX_PROXY_LOG_FILE:-"$RUNTIME_DIR/codex-proxy.log"}"
LABEL="${CODEX_PROXY_LAUNCHD_LABEL:-com.codex-proxy.local}"
PLIST_FILE="${CODEX_PROXY_PLIST_FILE:-"$RUNTIME_DIR/$LABEL.plist"}"
NODE_BIN="${NODE_BIN:-node}"
NODE_ENV_VALUE="${NODE_ENV:-production}"
LAUNCHD_DOMAIN="gui/$(id -u)"

usage() {
  cat <<USAGE
Usage: $(basename "$0") {start|stop|restart|status|logs|plist}

Commands:
  start     Build must already exist; load codex-proxy with launchctl
  stop      Unload codex-proxy from launchctl
  restart   Stop, then start
  status    Show launchctl status
  logs      Tail the production log
  plist     Print the generated launchd plist path

Environment overrides:
  CODEX_PROXY_RUNTIME_DIR    Runtime directory, default: ~/.codex-proxy
  CODEX_PROXY_LOG_FILE       Log file path, default: ~/.codex-proxy/codex-proxy.log
  CODEX_PROXY_LAUNCHD_LABEL  launchd label, default: com.codex-proxy.local
  CODEX_PROXY_PLIST_FILE     launchd plist path, default: ~/.codex-proxy/<label>.plist
  NODE_BIN                   Node executable, default: node
  NODE_ENV                   Node environment, default: production
USAGE
}

ensure_runtime_dir() {
  mkdir -p "$RUNTIME_DIR"
}

require_macos_launchd() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "This production script uses macOS launchctl." >&2
    exit 1
  fi
}

require_build() {
  if [[ ! -f "$APP_DIR/dist/index.js" ]]; then
    echo "dist/index.js not found. Run 'npm run build' in $APP_DIR first." >&2
    exit 1
  fi
}

resolve_node_bin() {
  if [[ "$NODE_BIN" == */* ]]; then
    if [[ ! -x "$NODE_BIN" ]]; then
      echo "NODE_BIN is not executable: $NODE_BIN" >&2
      exit 1
    fi
    printf '%s\n' "$NODE_BIN"
    return 0
  fi

  local resolved
  resolved="$(command -v "$NODE_BIN" || true)"
  if [[ -z "$resolved" ]]; then
    echo "Could not find node executable: $NODE_BIN" >&2
    exit 1
  fi
  printf '%s\n' "$resolved"
}

xml_escape() {
  sed \
    -e 's/&/\&amp;/g' \
    -e 's/</\&lt;/g' \
    -e 's/>/\&gt;/g' \
    -e 's/"/\&quot;/g' \
    -e "s/'/\&apos;/g"
}

write_plist() {
  ensure_runtime_dir

  local node_bin app_index app_dir log_file node_env label tmp
  node_bin="$(resolve_node_bin)"
  app_index="$APP_DIR/dist/index.js"
  tmp="$PLIST_FILE.tmp.$$"

  node_bin="$(printf '%s' "$node_bin" | xml_escape)"
  app_index="$(printf '%s' "$app_index" | xml_escape)"
  app_dir="$(printf '%s' "$APP_DIR" | xml_escape)"
  log_file="$(printf '%s' "$LOG_FILE" | xml_escape)"
  node_env="$(printf '%s' "$NODE_ENV_VALUE" | xml_escape)"
  label="$(printf '%s' "$LABEL" | xml_escape)"

  cat > "$tmp" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>$node_bin</string>
    <string>$app_index</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$app_dir</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>$node_env</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$log_file</string>
  <key>StandardErrorPath</key>
  <string>$log_file</string>
</dict>
</plist>
PLIST

  mv "$tmp" "$PLIST_FILE"
}

is_loaded() {
  launchctl print "$LAUNCHD_DOMAIN/$LABEL" >/dev/null 2>&1
}

start() {
  require_macos_launchd
  require_build
  write_plist
  touch "$LOG_FILE"

  if is_loaded; then
    echo "codex-proxy is already loaded: $LABEL"
    launchctl kickstart -k "$LAUNCHD_DOMAIN/$LABEL"
  else
    launchctl bootstrap "$LAUNCHD_DOMAIN" "$PLIST_FILE"
  fi

  sleep 1
  status
}

stop() {
  require_macos_launchd
  if is_loaded; then
    launchctl bootout "$LAUNCHD_DOMAIN/$LABEL"
    echo "codex-proxy stopped: $LABEL"
  else
    echo "codex-proxy is not loaded: $LABEL"
  fi
}

status() {
  require_macos_launchd

  local output pid state
  output="$(launchctl print "$LAUNCHD_DOMAIN/$LABEL" 2>/dev/null || true)"
  if [[ -z "$output" ]]; then
    echo "codex-proxy is not loaded: $LABEL"
    echo "plist: $PLIST_FILE"
    return 0
  fi

  pid="$(printf '%s\n' "$output" | awk -F'= ' '/pid =/{print $2; exit}')"
  state="$(printf '%s\n' "$output" | awk -F'= ' '/state =/{print $2; exit}')"
  echo "codex-proxy is loaded: $LABEL"
  [[ -n "$pid" ]] && echo "pid: $pid"
  [[ -n "$state" ]] && echo "state: $state"
  echo "plist: $PLIST_FILE"
  echo "log: $LOG_FILE"
}

logs() {
  ensure_runtime_dir
  touch "$LOG_FILE"
  tail -n 120 -f "$LOG_FILE"
}

case "${1:-}" in
  start)
    start
    ;;
  stop)
    stop
    ;;
  restart)
    stop
    start
    ;;
  status)
    status
    ;;
  logs)
    logs
    ;;
  plist)
    echo "$PLIST_FILE"
    ;;
  -h|--help|help|"")
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
