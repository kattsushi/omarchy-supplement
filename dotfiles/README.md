# dotfiles-v2

Single source of truth for Linux/Omarchy and macOS dotfiles.

## Install with Stow

Linux/Arch safe default:

```bash
cd ~/dotfiles
./install/stow.sh linux
```

macOS:

```bash
cd ~/dotfiles
./install/stow.sh darwin
```

Common packages only:

```bash
./install/stow.sh common
```

Omarchy desktop packages are intentionally separate because Omarchy often creates real config files first. Review/back up existing files before installing them:

```bash
./install/stow.sh omarchy-desktop
```

To restow after changes:

```bash
STOW_ACTION=restow ./install/stow.sh linux
```

## Package split

- `zshrc` is shared and loads `~/.config/zsh/common.zsh` plus `linux.zsh` or `darwin.zsh` by `uname`.
- Starship is the prompt source of truth. Powerlevel10k is intentionally not initialized.
- `ghostty-linux` and `ghostty-darwin` target the same Ghostty config path, so install only the one for the current OS.
- `nvim` is LazyVim and remains the only Neovim source of truth.
- OpenCode is intentionally not stowed; `gentle-ai` owns `~/.config/opencode`.
- `systems/darwin` stores the nix-darwin flake; it is not stowed.
- `.atl/skill-registry.md` stores the Gentle AI/Engram skill registry as a repo-level artifact; it is not stowed.
- Root `.env` and `zshrc/.config/zsh/local.zsh` are local-only and ignored.

## Local secrets

```bash
cp .env.example .env
chmod 600 .env
$EDITOR .env
```

`mcp/.config/mcp/mcp.json` reads `${DOTFILES_DIR:-$HOME/dotfiles}/.env`. Never commit the real `.env`.
