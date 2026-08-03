# Shared interactive Zsh configuration.

export EDITOR="nvim"
export SUDO_EDITOR="$EDITOR"
export PATH="$HOME/.local/bin:$PATH"

HISTFILE="$HOME/.zsh_history"
HISTSIZE=5000
SAVEHIST=50000
HISTDUP=erase
setopt appendhistory
setopt sharehistory
setopt inc_append_history
setopt hist_ignore_space
setopt hist_ignore_all_dups
setopt hist_save_no_dups
setopt hist_ignore_dups
setopt hist_find_no_dups

ZINIT_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}/zinit/zinit.git"
if [[ ! -d "$ZINIT_HOME/.git" ]]; then
  mkdir -p "$(dirname "$ZINIT_HOME")"
  git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME"
fi
source "$ZINIT_HOME/zinit.zsh"

# Zsh plugins.
zinit ice depth=1
zinit light zsh-users/zsh-syntax-highlighting
zinit light zsh-users/zsh-completions
zinit light zsh-users/zsh-autosuggestions
zinit light Aloxaf/fzf-tab
zinit light ohmyzsh/ohmyzsh
zinit snippet OMZ::plugins/git/git.plugin.zsh

autoload -U compinit && compinit

if ls --color=auto >/dev/null 2>&1; then
  export DOTFILES_LS="ls --color=auto"
  alias ls='ls --color=auto'
else
  export DOTFILES_LS="ls -G"
  alias ls='ls -G'
fi

zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'
[[ -n "${LS_COLORS:-}" ]] && zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"
zstyle ':completion:*' menu no
zstyle ':fzf-tab:complete:cd:*' fzf-preview '$DOTFILES_LS $realpath'
zstyle ':fzf-tab:complete:__zoxide_z:*' fzf-preview '$DOTFILES_LS $realpath'

if command -v fzf >/dev/null 2>&1; then
  source <(fzf --zsh)
fi

if command -v zoxide >/dev/null 2>&1; then
  eval "$(zoxide init --cmd cd zsh)"
fi

if command -v starship >/dev/null 2>&1; then
  eval "$(starship init zsh)"
fi

if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env --use-on-cd --shell zsh)"
fi

# opencode
if [[ -d "$HOME/.opencode/bin" ]]; then
  export PATH="$HOME/.opencode/bin:$PATH"
fi

# bun completions
[[ -s "$HOME/.bun/_bun" ]] && source "$HOME/.bun/_bun"

new_tmux() {
  local session_dir session_name notification
  session_dir=$(zoxide query --list 2>/dev/null | fzf)
  [[ -z "$session_dir" ]] && return 0
  session_name=$(basename "$session_dir")

  if tmux has-session -t "$session_name" 2>/dev/null; then
    if [[ -n "${TMUX:-}" ]]; then
      tmux switch-client -t "$session_name"
    else
      tmux attach -t "$session_name"
    fi
    notification="tmux attached to $session_name"
  else
    if [[ -n "${TMUX:-}" ]]; then
      tmux new-session -d -c "$session_dir" -s "$session_name" && tmux switch-client -t "$session_name"
      notification="new tmux session INSIDE TMUX: $session_name"
    else
      tmux new-session -c "$session_dir" -s "$session_name"
      notification="new tmux session: $session_name"
    fi
  fi

  if command -v notify-send >/dev/null 2>&1; then
    notify-send "$notification"
  fi
}

alias nvim='nvim'
alias c='clear'
alias tm=new_tmux
