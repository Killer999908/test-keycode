#!/usr/bin/env bash
set -e

echo "=========================================="
echo "  KEYCODE Studio - Cloud Installer"
echo "  Full tool stack for all 40 services"
echo "=========================================="

# Update system
sudo apt update && sudo apt upgrade -y

# ---------- APT TOOLS ----------
echo "[1/5] Installing system tools..."
sudo apt install -y \
  blender openscad freecad kicad godot3-server \
  ffmpeg imagemagick inkscape gimp \
  nmap cmake qemu-system-x86 qemu-utils \
  llvm clang docker.io docker-compose \
  redis-server postgresql postgresql-contrib \
  nginx certbot python3-pip nodejs npm \
  arduino curl wget git unzip

# ---------- START SERVICES ----------
sudo systemctl enable docker redis-server postgresql
sudo systemctl start docker redis-server postgresql

# ---------- NODE.JS TOOLS ----------
echo "[2/5] Installing Node.js tools..."
sudo npm install -g n
sudo n stable
sudo npm install -g \
  three socket.io ethers playwright \
  @babylonjs/core hardhat ganache n8n \
  lottie-web

# Install playwright browsers
npx playwright install chromium

# ---------- PYTHON TOOLS ----------
echo "[3/5] Installing Python AI/ML tools..."
sudo pip3 install --break-system-packages \
  torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

sudo pip3 install --break-system-packages \
  tensorflow-cpu transformers accelerate sentencepiece \
  langchain langchain-community chromadb \
  fastapi uvicorn scrapy spacy \
  openai-whisper pybullet platformio \
  opencv-python cadquery

# Download spaCy model
python3 -m spacy download en_core_web_sm

# ---------- MONGODB ----------
echo "[4/5] Installing MongoDB..."
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb http://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update && sudo apt install -y mongodb-org
sudo systemctl enable mongod && sudo systemctl start mongod

# ---------- DEPLOY PLATFORM ----------
echo "[5/5] Deploying KEYCODE Studio..."
cd ~
git clone https://github.com/anomalyco/keycode-alien-interface.git
cd keycode-alien-interface/server
cp .env.example .env
# Generate JWT secret
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
npm install

# Start server (port 5000)
node server.js &
# Start admin server (port 5001)
node admin-server.js &

echo ""
echo "=========================================="
echo "  INSTALLATION COMPLETE!"
echo "  Main site: http://$(curl -s ifconfig.me):5000"
echo "  Admin:     http://$(curl -s ifconfig.me):5001"
echo "=========================================="
