#!/bin/bash

# Install custom Omarchy workspace bootstrap commands into ~/.local/bin.
#
# Installed commands:
# - omarchy-work-revyse: workspace 3, Ghostty, Revyse, Cursor, database stack.
# - omarchy-side-project: workspace 4, Ghostty, devx-ops project picker, VS Code.
#
# The commands are symlinked instead of copied so updates to this repo take
# effect immediately.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source_bin_dir="$script_dir/bin"
target_bin_dir="$HOME/.local/bin"

mkdir -p "$target_bin_dir"

for command_name in omarchy-work-revyse omarchy-side-project; do
  source_path="$source_bin_dir/$command_name"
  target_path="$target_bin_dir/$command_name"

  if [ ! -f "$source_path" ]; then
    echo "Missing source command: $source_path"
    exit 1
  fi

  chmod +x "$source_path"
  ln -sfn "$source_path" "$target_path"
  echo "Installed $target_path -> $source_path"
done

echo
echo "Workspace commands installed."
echo "Run: omarchy-work-revyse"
echo "Run: omarchy-side-project"
