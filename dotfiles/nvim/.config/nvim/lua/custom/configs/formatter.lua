local M = {}

-- Detecta si el proyecto tiene configuración de Biome
local function is_biome_project()
  local cwd = vim.fn.getcwd()
  local files = { "biome.json", "biome.config.js", "biome.config.cjs", "biome.jsonc" }
  for _, f in ipairs(files) do
    if vim.fn.filereadable(cwd .. "/" .. f) == 1 then
      return true
    end
  end
  return false
end

function M.setup()
  local formatter = require("formatter")

  formatter.setup({
    logging = true,
    filetype = {
      javascript = {
        function()
          if is_biome_project() then
            return {
              exe = "biome",
              args = { "format", "--stdin-file-path", vim.api.nvim_buf_get_name(0) },
              stdin = true,
            }
          else
            return {
              exe = "prettier",
              args = { "--stdin-filepath", vim.api.nvim_buf_get_name(0) },
              stdin = true,
            }
          end
        end,
      },

      typescript = {
        function()
          if is_biome_project() then
            return {
              exe = "biome",
              args = { "format", "--stdin-file-path", vim.api.nvim_buf_get_name(0) },
              stdin = true,
            }
          else
            return {
              exe = "prettier",
              args = { "--stdin-filepath", vim.api.nvim_buf_get_name(0) },
              stdin = true,
            }
          end
        end,
      },

      javascriptreact = {
        function()
          if is_biome_project() then
            return {
              exe = "biome",
              args = { "format", "--stdin-file-path", vim.api.nvim_buf_get_name(0) },
              stdin = true,
            }
          else
            return {
              exe = "prettier",
              args = { "--stdin-filepath", vim.api.nvim_buf_get_name(0) },
              stdin = true,
            }
          end
        end,
      },

      typescriptreact = {
        function()
          if is_biome_project() then
            return {
              exe = "biome",
              args = { "format", "--stdin-file-path", vim.api.nvim_buf_get_name(0) },
              stdin = true,
            }
          else
            return {
              exe = "prettier",
              args = { "--stdin-filepath", vim.api.nvim_buf_get_name(0) },
              stdin = true,
            }
          end
        end,
      },
    },
  })
end

return M
