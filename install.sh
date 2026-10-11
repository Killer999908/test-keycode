#!/usr/bin/env sh
# ============================================================================
#  KEYCODE Agent CLI — one-line installer (Linux / macOS / Termux)
#  curl -fsSL <origin>/install.sh | sh
#  Auto-adapts the server URL to the origin it was downloaded from.
# ============================================================================
set -eu

# The install endpoint injects its public origin into this default. The env
# override is useful when running a downloaded script against another host.
BASE_URL="${KEYCODE_URL:-__KEYCODE_URL__}"
BASE_URL="${BASE_URL%/}"
BIN_DIR="${KEYCODE_BIN_DIR:-$HOME/.local/bin}"
mkdir -p "$BIN_DIR"

# ---- Dep checks ------------------------------------------------------------
have_cmd() { command -v "$1" >/dev/null 2>&1; }

if ! have_cmd curl && ! have_cmd wget; then
  echo "✗ This installer needs curl or wget." >&2
  echo "  Debian/Ubuntu:  sudo apt-get install -y curl" >&2
  echo "  Fedora/RHEL:    sudo dnf install -y curl" >&2
  echo "  macOS:          curl is preinstalled" >&2
  echo "  Termux:         pkg install curl" >&2
  exit 1
fi

fetch() { # fetch <url> <outfile|->
  if have_cmd curl; then
    if [ "$2" = "-" ]; then curl -fsSL "$1"; else curl -fsSL "$1" -o "$2"; fi
  else
    if [ "$2" = "-" ]; then wget -qO- "$1"; else wget -qO "$2" "$1"; fi
  fi
}

# ---- Node.js check (>= 18 required) ----------------------------------------
NODE_OK="no"
if have_cmd node; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "$NODE_MAJOR" -ge 18 ] && NODE_OK="yes"
fi

if [ "$NODE_OK" != "yes" ]; then
  echo "✗ Node.js 18+ is required for the KEYCODE agent CLI." >&2
  case "$(uname -s)" in
    Darwin)
      echo "  Install with Homebrew:  brew install node" >&2
      [ -x /opt/homebrew/bin/brew ] || [ -x /usr/local/bin/brew ] || echo "  (or download from https://nodejs.org)" >&2
      ;;
    Linux)
      if [ -n "${TERMUX_VERSION:-}" ]; then
        echo "  Termux:  pkg install nodejs" >&2
      else
        echo "  Debian/Ubuntu:  sudo apt-get install -y nodejs npm" >&2
        echo "  Fedora/RHEL:    sudo dnf install -y nodejs" >&2
        echo "  Arch:           sudo pacman -S nodejs npm" >&2
        echo "  Or download:    https://nodejs.org" >&2
      fi
      ;;
    *) echo "  Download from https://nodejs.org" >&2 ;;
  esac
  exit 1
fi

# ---- Download CLI -----------------------------------------------------------
echo "⠿ Downloading KEYCODE agent CLI from $BASE_URL ..."
fetch "$BASE_URL/api/cli/download" "$BIN_DIR/keycode"
chmod +x "$BIN_DIR/keycode"

# Save the service URL for CLI calls, without overwriting a user's API key.
node - "$BASE_URL" <<'NODE'
const fs = require('fs');
const os = require('os');
const path = require('path');
const dir = path.join(os.homedir(), '.keycode');
const file = path.join(dir, 'config.json');
let config = {};
if (fs.existsSync(file)) config = JSON.parse(fs.readFileSync(file, 'utf8'));
config.baseUrl = process.argv[2];
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
if (process.platform !== 'win32') {
  fs.chmodSync(dir, 0o700);
  fs.chmodSync(file, 0o600);
}
NODE

# Shebang may be /usr/bin/env node — works everywhere Node is on PATH.
# ---- PATH setup for the user's shells --------------------------------------
case ":$PATH:" in
  *":$BIN_DIR:"*) : ;;
  *)
    for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
      [ -f "$rc" ] || continue
      grep -qs "export PATH=\"$BIN_DIR:\$PATH\"" "$rc" || \
        echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$rc"
    done
    echo "ℹ Added $BIN_DIR to PATH in ~/.bashrc / ~/.zshrc (restart your shell or run: export PATH=\"$BIN_DIR:\$PATH\")"
    ;;
esac
if [ -n "${TERMUX_VERSION:-}" ]; then
  # Termux uses /data/data/com.termux/files/usr/bin which is already on PATH
  if [ "$BIN_DIR" = "$HOME/.local/bin" ]; then
    echo "ℹ Termux tip: install straight into PATH with: KEYCODE_BIN_DIR=\$PREFIX/bin sh install.sh"
  fi
fi

echo ""
echo "✓ KEYCODE Agent installed → $BIN_DIR/keycode"
echo ""
echo "  One API key unlocks your agent everywhere:"
echo "    1. Sign in at $BASE_URL/login.html"
echo "    2. Create an API key: $BASE_URL/api-keys.html"
echo "    3. Connect the CLI:"
echo ""
echo "         keycode login   (paste is hidden)"
echo "         keycode agent \"a portfolio site for a photographer\""
echo ""
