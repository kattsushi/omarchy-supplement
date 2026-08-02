# Linux/Arch/Omarchy shell configuration.

export PGHOST="/var/run/postgresql"

export PATH="${ASDF_DATA_DIR:-$HOME/.asdf}/shims:$HOME/.local/share/omarchy/bin:$PATH"

# Go configuration.
export GOPATH="$HOME/go"
export GOBIN="$GOPATH/bin"
[[ -d /usr/local/go/bin ]] && export PATH="$PATH:/usr/local/go/bin"
[[ -d /usr/lib/go/bin ]] && export PATH="$PATH:/usr/lib/go/bin"
[[ -d "$GOBIN" ]] && export PATH="$PATH:$GOBIN"

if command -v zen-browser >/dev/null 2>&1; then
  export BROWSER="$(command -v zen-browser)"
fi

for brew_bin in \
  "${HOMEBREW_PREFIX:-}/bin/brew" \
  /home/linuxbrew/.linuxbrew/bin/brew; do
  if [[ -x "$brew_bin" ]]; then
    eval "$("$brew_bin" shellenv zsh)"
    break
  fi
done
