#!/usr/bin/env bash
# Installs the usage-tracker plugin for the current user (all projects) and saves the ingest token.
# Usage: ./install.sh <INGEST_TOKEN> ["Display Name"]
set -euo pipefail

token="${1:?usage: install.sh <INGEST_TOKEN> [display name]}"
name="${2:-}"

claude plugin marketplace add hasan-murad02/claude-usage-tracker --scope user
claude plugin install usage-tracker@claude-usage-tracker --scope user

mkdir -p "$HOME/.claude/usage-tracker"
TOKEN="$token" NAME="$name" node -e '
const c = { token: process.env.TOKEN };
if (process.env.NAME) c.name = process.env.NAME;
require("fs").writeFileSync(require("os").homedir() + "/.claude/usage-tracker/config.json", JSON.stringify(c));
'

echo "Done. Restart Claude Code (or run /reload-plugins in open sessions)."
