local theme = vim.fn.expand("~/.config/omarchy/current/theme/neovim.lua")

if vim.uv.fs_stat(theme) then
  local ok, spec = pcall(dofile, theme)
  if ok and type(spec) == "table" then
    return spec
  end
end

return {}
