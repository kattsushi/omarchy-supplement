#!/bin/bash

# Install all packages in order

./install-fnm.sh
./install-zsh.sh
./install-mkalias.sh
./install-zen-browser-bin.sh
./install-tree.sh
./install-bun.sh
./install-ghostty.sh
./install-tmux.sh
./install-stow.sh
./install-dotfiles.sh
./install-hyprland-overrides.sh

./set-shell.sh
