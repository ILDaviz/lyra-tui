#!/bin/sh
set -e

REPO="ILDaviz/lyra-tui"
GITHUB_URL="https://github.com/${REPO}"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo ""
echo -e "${BOLD}${BLUE}Lyra TUI Installer${NC}"
echo "----------------------------------------"

OS="$(uname -s)"
case "$OS" in
  Darwin)
    OS_NAME="darwin"
    ;;
  Linux)
    OS_NAME="linux"
    ;;
  *)
    echo -e "${RED}Unsupported operating system: ${OS}${NC}"
    echo "Lyra standalone binaries are available for macOS and Linux."
    exit 1
    ;;
esac

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64)
    if [ "$OS_NAME" = "darwin" ]; then
      echo -e "${RED}Error: macOS binaries are only provided for Apple Silicon (arm64).${NC}"
      exit 1
    fi
    ARCH_NAME="x64"
    ;;
  arm64|aarch64)
    ARCH_NAME="arm64"
    ;;
  *)
    echo -e "${RED}Unsupported architecture: ${ARCH}${NC}"
    exit 1
    ;;
esac

BINARY_NAME="lyra-${OS_NAME}-${ARCH_NAME}"
DOWNLOAD_URL="${GITHUB_URL}/releases/latest/download/${BINARY_NAME}"

echo -e "Detected platform: ${BOLD}${OS_NAME}-${ARCH_NAME}${NC}"

if [ -w "/usr/local/bin" ]; then
  INSTALL_DIR="/usr/local/bin"
  TARGET="${INSTALL_DIR}/lyra"
elif [ -d "$HOME/.local/bin" ] || mkdir -p "$HOME/.local/bin" 2>/dev/null; then
  INSTALL_DIR="$HOME/.local/bin"
  TARGET="${INSTALL_DIR}/lyra"
else
  INSTALL_DIR="/usr/local/bin"
  TARGET="${INSTALL_DIR}/lyra"
fi

echo -e "Downloading ${BOLD}lyra${NC} from latest release..."

TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t 'lyratui')"
TMP_FILE="${TMP_DIR}/lyra"

if command -v curl >/dev/null 2>&1; then
  if ! curl -fL --progress-bar "$DOWNLOAD_URL" -o "$TMP_FILE"; then
    echo -e "${RED}Error: Failed to download Lyra binary for ${OS_NAME}-${ARCH_NAME}.${NC}"
    echo "Check available releases and binaries at: ${GITHUB_URL}/releases"
    rm -rf "$TMP_DIR"
    exit 1
  fi
elif command -v wget >/dev/null 2>&1; then
  if ! wget -q --show-progress "$DOWNLOAD_URL" -O "$TMP_FILE"; then
    echo -e "${RED}Error: Failed to download Lyra binary for ${OS_NAME}-${ARCH_NAME}.${NC}"
    echo "Check available releases and binaries at: ${GITHUB_URL}/releases"
    rm -rf "$TMP_DIR"
    exit 1
  fi
else
  echo -e "${RED}Error: curl or wget is required to download Lyra.${NC}"
  rm -rf "$TMP_DIR"
  exit 1
fi

chmod +x "$TMP_FILE"

echo -e "Installing to ${BOLD}${TARGET}${NC}..."

if [ -w "$INSTALL_DIR" ]; then
  mv "$TMP_FILE" "$TARGET"
else
  echo -e "${YELLOW}Sudo permissions required to install to ${INSTALL_DIR}...${NC}"
  sudo mv "$TMP_FILE" "$TARGET"
fi

rm -rf "$TMP_DIR"

echo "----------------------------------------"
echo -e "${GREEN}${BOLD}Lyra TUI has been installed successfully!${NC}"
echo ""

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo -e "${YELLOW}Note: ${INSTALL_DIR} is not in your \$PATH.${NC}"
    echo -e "Add the following line to your shell profile (~/.zshrc or ~/.bashrc):"
    echo -e "  ${BOLD}export PATH=\"\$HOME/.local/bin:\$PATH\"${NC}"
    echo ""
    ;;
esac

echo -e "To start Lyra, run: ${BOLD}${GREEN}lyra${NC}"
echo ""
