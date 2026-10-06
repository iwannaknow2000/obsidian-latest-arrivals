/**
 * Obsidian 官方插件 lint 规则集（eslint-plugin-obsidianmd）。
 *
 * 这组规则复刻了官方审核插件时用的检查，能在提 PR 之前先把会被打回的问题找出来。
 * 用法：npm run lint
 *
 * 两点说明：
 *
 * 1. 不对官方规则集做 files 重映射。它内部有 17 个 config，其中既有给 JS 设 parser
 *    的，也有给 package.json 用的；粗暴重映射会让 JS 的 parser 覆盖掉 TS 的，
 *    导致所有 .ts 报 "Parsing error"。改为用 ignores 把范围收窄，并在最后
 *    显式指定 TS parser。
 *
 * 2. test/ 与 scripts/ 是开发工具，不随插件发布，里面用 Node API、console.log
 *    都是正当的，套用插件规则只会产生噪音。
 */
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "main.js",
      "node_modules/**",
      "test/**",
      "scripts/**",
      "esbuild.config.mjs",
      "eslint.config.mjs",
    ],
  },
  ...tseslint.configs.recommended,
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["src/settings.ts"],
    rules: {
      /*
       * PluginSettingTab.display() 在 Obsidian 1.13.0 被标记为 deprecated，
       * 替代品 getSettingDefinitions() 同样是 1.13.0 才引入的。
       * 本插件 minAppVersion 为 1.5.0，为了让老版本用户也能用，必须继续用 display()。
       * 同类还有 SliderComponent.setDynamicTooltip() 与 ButtonComponent.setWarning()。
       */
      "@typescript-eslint/no-deprecated": "off",
    },
  },
];
