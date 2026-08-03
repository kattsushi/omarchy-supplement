# Source shared shell configuration first.
[[ -r "$HOME/.config/zsh/common.zsh" ]] && source "$HOME/.config/zsh/common.zsh"

case "$(uname -s)" in
  Darwin)
    [[ -r "$HOME/.config/zsh/darwin.zsh" ]] && source "$HOME/.config/zsh/darwin.zsh"
    ;;
  Linux)
    [[ -r "$HOME/.config/zsh/linux.zsh" ]] && source "$HOME/.config/zsh/linux.zsh"
    ;;
esac

# Machine-local overrides. Copy local.example.zsh to local.zsh per host.
[[ -r "$HOME/.config/zsh/local.zsh" ]] && source "$HOME/.config/zsh/local.zsh"
