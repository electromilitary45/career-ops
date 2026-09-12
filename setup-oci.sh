#!/bin/bash
# setup-oci.sh — Setup STEM Jobs ingest on OCI Always Free VM
#
# Run this on a fresh Ubuntu 22.04/24.04 ARM instance from Oracle Cloud.
# It installs Node.js, clones your repo, and sets up a cron job.
#
# Prerequisites:
#   1. Create an OCI Always Free VM (Ubuntu ARM, 4 cores, 24GB RAM)
#   2. SSH into the VM
#   3. Run this script
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/YOUR_USER/career-ops/main/setup-oci.sh | bash
#   OR: scp setup-oci.sh to your VM and run it

set -e

echo "═══════════════════════════════════════════"
echo "  STEM Jobs — OCI Always Free Setup"
echo "═══════════════════════════════════════════"

# 1. System updates
echo -e "\n[1/6] Updating system..."
sudo apt-get update -qq
sudo apt-get install -y -qq curl git build-essential

# 2. Install Node.js 22 LTS
echo -e "\n[2/6] Installing Node.js 22..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi
echo "Node $(node -v) installed"

# 3. Clone repo (or pull latest)
echo -e "\n[3/6] Setting up career-ops..."
REPO_DIR="$HOME/career-ops"
if [ -d "$REPO_DIR" ]; then
  cd "$REPO_DIR"
  git pull
else
  git clone https://github.com/YOUR_USER/career-ops.git "$REPO_DIR"
  cd "$REPO_DIR"
fi

# 4. Install dependencies
echo -e "\n[4/6] Installing dependencies..."
npm install --production 2>/dev/null || true

# 5. Setup .env
echo -e "\n[5/6] Environment configuration..."
if [ ! -f "$REPO_DIR/.env" ]; then
  cp "$REPO_DIR/.env.example" "$REPO_DIR/.env" 2>/dev/null || true
  echo ""
  echo "  ⚠️  Edit $REPO_DIR/.env with your Firebase credentials:"
  echo "     - NEXT_PUBLIC_FIREBASE_API_KEY=..."
  echo "     - NEXT_PUBLIC_FIREBASE_PROJECT_ID=..."
  echo "     - etc."
  echo ""
  echo "  If using service account:"
  echo "     - Place firebase-service-account.json in $REPO_DIR/"
  echo ""
fi

# 6. Setup cron (every 20 minutes)
echo -e "\n[6/6] Setting up cron job..."
CRON_CMD="*/20 * * * * cd $REPO_DIR && /usr/bin/node ingest.mjs >> /var/log/stemjobs-ingest.log 2>&1"
CRON_MARKER="# STEM_JOBS_INGEST"

# Remove old entry if exists
crontab -l 2>/dev/null | grep -v "$CRON_MARKER" | crontab - 2>/dev/null || true

# Add new entry
(crontab -l 2>/dev/null; echo "$CRON_CMD $CRON_MARKER") | crontab -

# Setup log rotation
sudo tee /etc/logrotate.d/stemjobs > /dev/null << EOF
/var/log/stemjobs-ingest.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
EOF

echo ""
echo "═══════════════════════════════════════════"
echo "  Setup complete!"
echo "═══════════════════════════════════════════"
echo ""
echo "  Cron job: runs every 20 minutes"
echo "  Log:      /var/log/stemjobs-ingest.log"
echo "  Manual:   cd $REPO_DIR && node ingest.mjs"
echo ""
echo "  Next steps:"
echo "  1. Edit $REPO_DIR/.env with Firebase credentials"
echo "  2. Test: node ingest.mjs --dry-run"
echo "  3. Deploy web to Vercel: cd web && vercel"
echo ""
echo "  Monitor logs:"
echo "    tail -f /var/log/stemjobs-ingest.log"
echo ""
