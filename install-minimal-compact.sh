#!/usr/bin/env bash
# Install the local "minimal-compact" agent preset and make it the default.
# Run this from a normal terminal (NOT from inside the dsh sandboxed bash tool).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
DEST="$DSH_HOME/.agent-presets/minimal-compact"
SETTINGS="$DSH_HOME/settings.yaml"

mkdir -p "$DEST"
cp -f "$HERE/minimal-compact/agent.cordis.yml" "$DEST/agent.cordis.yml"
cp -f "$HERE/minimal-compact/preset.yml" "$DEST/preset.yml"

if [ -f "$SETTINGS" ]; then
  cp -f "$SETTINGS" "$SETTINGS.bak"
  # Change only the `default:` line inside the agent-presets block.
  # The lookahead requires whitespace/end after `minimal`, so a value that is
  # already `minimal-compact` is never rewritten.
  perl -0pi -e 's/(agent-presets:\s*\n(?:\s+[^\n]*\n)*?\s+default:\s*)minimal(?=\s*(?:\n|$))/${1}minimal-compact/' "$SETTINGS"
else
  cat > "$SETTINGS" <<'EOF'
agent-presets:
  default: minimal-compact
EOF
fi

echo "Installed preset files to: $DEST"
echo "Updated default preset in: $SETTINGS"
echo "Restart dsh web (or open a new session) and select '极简模式（带压缩）'."
