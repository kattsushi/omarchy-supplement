local lspconfig = require("lspconfig")
local cmp_capabilities = require("cmp_nvim_lsp").default_capabilities()

local on_attach = function(client, bufnr)
  -- Aquí puedes agregar tus keymaps LSP
end

local common_config = {
  on_attach = on_attach,
  capabilities = cmp_capabilities,
}

-- Servidores LSP
local servers = {
  biome = {
    filetypes = { "javascript", "typescript", "javascriptreact", "typescriptreact" },
    root_dir = lspconfig.util.root_pattern("biome.json", "biome.config.js", "biome.config.cjs", "biome.jsonc"),
    single_file_support = false,
  },
  ts_ls = {
    init_options = {
      preferences = {
        provideFormatter = false,
        disableSuggestions = true,
      },
    },
  },
  tailwindcss = {},
  cssls = {},
}

-- Configurar cada servidor
for name, cfg in pairs(servers) do
  lspconfig[name].setup(vim.tbl_deep_extend("force", common_config, cfg))
end
