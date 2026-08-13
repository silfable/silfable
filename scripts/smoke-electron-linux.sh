#!/usr/bin/env bash
set -euo pipefail

mode="${1:?usage: smoke-electron-linux.sh <x11|wayland> <binary> <log>}"
binary="${2:?usage: smoke-electron-linux.sh <x11|wayland> <binary> <log>}"
log="${3:?usage: smoke-electron-linux.sh <x11|wayland> <binary> <log>}"
[[ "$mode" == "x11" || "$mode" == "wayland" ]] || { echo "unsupported smoke mode: $mode" >&2; exit 2; }
[[ -x "$binary" ]] || { echo "Electron binary is not executable: $binary" >&2; exit 2; }
runtime_dir="$(mktemp -d)"
config_dir="$(mktemp -d)"
app_pid=""
weston_pid=""
debug_port="$(node -e 'const net=require("node:net");const server=net.createServer();server.listen(0,"127.0.0.1",()=>{console.log(server.address().port);server.close();});')"
[[ "$debug_port" =~ ^[0-9]+$ ]] || { echo "Could not allocate an Electron debugging port" >&2; exit 2; }

stop_process() {
  local pid="$1"
  [[ -n "$pid" ]] || return 0
  kill -0 "$pid" 2>/dev/null || { wait "$pid" 2>/dev/null || true; return 0; }
  kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 1 50); do
    kill -0 "$pid" 2>/dev/null || { wait "$pid" 2>/dev/null || true; return 0; }
    sleep 0.1
  done
  kill -KILL "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}

cleanup() {
  stop_process "$app_pid"
  stop_process "$weston_pid"
  rm -rf "$runtime_dir" "$config_dir"
}
trap cleanup EXIT
chmod 700 "$runtime_dir"

if [[ "$mode" == "wayland" ]]; then
  export XDG_RUNTIME_DIR="$runtime_dir"
  weston --backend=headless-backend.so --socket=wayland-silfable-qa --idle-time=0 >"${log}.weston" 2>&1 &
  weston_pid=$!
  for _ in $(seq 1 30); do
    [[ -S "$runtime_dir/wayland-silfable-qa" ]] && break
    kill -0 "$weston_pid" 2>/dev/null || { cat "${log}.weston"; exit 1; }
    sleep 0.25
  done
  [[ -S "$runtime_dir/wayland-silfable-qa" ]]
  WAYLAND_DISPLAY=wayland-silfable-qa XDG_SESSION_TYPE=wayland XDG_CONFIG_HOME="$config_dir" \
    "$binary" --no-sandbox --remote-debugging-address=127.0.0.1 --remote-debugging-port="$debug_port" >"$log" 2>&1 &
else
  XDG_RUNTIME_DIR="$runtime_dir" XDG_SESSION_TYPE=x11 XDG_CONFIG_HOME="$config_dir" \
    "$binary" --no-sandbox --remote-debugging-address=127.0.0.1 --remote-debugging-port="$debug_port" >"$log" 2>&1 &
fi
app_pid=$!

if ! node scripts/assert-electron-renderer.mjs "http://127.0.0.1:${debug_port}"; then
  echo "Electron $mode renderer diagnostic failed. Process and application logs follow." >&2
  if kill -0 "$app_pid" 2>/dev/null; then
    echo "Electron process $app_pid is still running." >&2
  else
    wait "$app_pid" 2>/dev/null || echo "Electron process exited with status $?." >&2
  fi
  cat "$log" >&2 || true
  if [[ "$mode" == "wayland" ]]; then cat "${log}.weston" >&2 || true; fi
  exit 1
fi
kill -0 "$app_pid" 2>/dev/null || { cat "$log"; exit 1; }
echo "Electron $mode renderer and secure preload bridge passed smoke QA."
