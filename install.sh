#!/usr/bin/env bash
# ============================================================================
#  KEYCODE Agent CLI — one-line installer
#  curl -fsSL <your-url>/install.sh | bash
# ============================================================================
set -e
KEYCODE_URL="${KEYCODE_URL:-http://localhost:3000}"
BIN_DIR="${KEYCODE_BIN_DIR:-$HOME/.local/bin}"
mkdir -p "$BIN_DIR"

echo "⠿ Downloading KEYCODE agent CLI from $KEYCODE_URL ..."
curl -fsSL "$KEYCODE_URL/api/cli/download" -o "$BIN_DIR/keycode"
chmod +x "$BIN_DIR/keycode"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "ℹ Add to PATH:  echo 'export PATH=\"$BIN_DIR:\$PATH\"' >> ~/.bashrc && source ~/.bashrc" ;;
esac

echo ""
echo "✓ KEYCODE Agent installed → $BIN_DIR/keycode"
echo ""
echo "  Get an API key from $KEYCODE_URL/api-keys.html then:"
echo "    keycode login <kc_sk_...>"
echo "    keycode agent \"a portfolio site for a photographer\""
