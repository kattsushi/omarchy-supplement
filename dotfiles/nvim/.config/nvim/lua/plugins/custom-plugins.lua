return {
  -- nvim-cmp y dependencias
  {
    "hrsh7th/nvim-cmp",
    lazy = false,
    enabled = true,
    dependencies = {
      "hrsh7th/cmp-nvim-lsp",
      "hrsh7th/cmp-buffer",
      "hrsh7th/cmp-path",
      "hrsh7th/cmp-cmdline",
      "saadparwaiz1/cmp_luasnip",
      "L3MON4D3/LuaSnip",
    },
  },

  -- LSP config
  {
    "neovim/nvim-lspconfig",
    config = function()
      require("custom.configs.lspconfig")
    end,
  },

  -- Formatter (Prettier / Biome)
  {
    "mhartington/formatter.nvim",
    event = "VeryLazy",
    config = function()
      require("custom.configs.formatter").setup()
    end,
    ft = { "javascript", "typescript", "javascriptreact", "typescriptreact" },
  },

  -- Mason para instalar LSPs automáticamente
  {
    "mason-org/mason.nvim",
    opts = {
      ensure_installed = {
        "typescript-language-server",
        "biome",
        "eslint-lsp",
        "prettier",
        "lua-language-server",
        "tailwindcss-language-server",
      },
    },
  },

  -- TS Autotag
  {
    "windwp/nvim-ts-autotag",
    ft = { "javascript", "typescript", "javascriptreact", "typescriptreact" },
    config = function()
      require("nvim-ts-autotag").setup()
    end,
  },
}
