#!/usr/bin/env bash
# Verify that minimal-compact is installed and selected as the default preset.
# Run from a normal terminal (NOT from inside the dsh sandboxed bash tool).
set -euo pipefail

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PRESET_DIR="$DSH_HOME/.agent-presets/minimal-compact"
SETTINGS="$DSH_HOME/settings.yaml"
STATUS=0

section() { printf '\n== %s ==\n' "$1"; }
ok()     { printf 'OK   %s\n' "$1"; }
fail()   { printf 'FAIL %s\n' "$1"; STATUS=1; }

section "1. Preset files"
if [ -f "$PRESET_DIR/agent.cordis.yml" ]; then ok "agent.cordis.yml exists"; else fail "agent.cordis.yml missing: $PRESET_DIR/agent.cordis.yml"; fi
if [ -f "$PRESET_DIR/preset.yml" ]; then ok "preset.yml exists"; else fail "preset.yml missing: $PRESET_DIR/preset.yml"; fi

if [ -f "$PRESET_DIR/agent.cordis.yml" ]; then
  for plugin in dsh-compaction-basic dsh-command-compact dsh-compaction-tool-result-pruner; do
    if grep -q "'@deepseek-ai/$plugin'" "$PRESET_DIR/agent.cordis.yml"; then
      ok "$plugin is present"
    else
      fail "$plugin is missing"
    fi
  done
fi

section "2. Default preset"
if [ -f "$SETTINGS" ]; then
  DEFAULT="$(awk '/^agent-presets:/{in_ap=1} in_ap && /^[[:space:]]+default:/{print $2; exit}' "$SETTINGS")"
  if [ "$DEFAULT" = "minimal-compact" ]; then
    ok "settings default is minimal-compact"
  else
    fail "settings default is '${DEFAULT:-<not found>}', expected minimal-compact"
  fi
else
  fail "settings file missing: $SETTINGS"
fi

section "Result"
if [ "$STATUS" -eq 0 ]; then
  echo "minimal-compact installation looks correct."
else
  echo "Some checks failed; see above."
fi
exit "$STATUS"
