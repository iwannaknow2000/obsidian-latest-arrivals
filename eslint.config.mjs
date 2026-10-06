/**
 * Obsidian 官方插件 lint 规则集（eslint-plugin-obsidianmd）。
 *
 * 这组规则复刻了官方目录在源码检查里跑的那一套，本地对齐后才能提前发现
 * 会被打回的问题。用法：npm run lint
 *
 * 三点说明：
 *
 * 1. 不对官方规则集做 files 重映射。它内部有 17 个 config，其中既有给 JS 设 parser
 *    的，也有给 package.json 用的；粗暴重映射会让 JS 的 parser 覆盖掉 TS 的，
 *    导致所有 .ts 报 "Parsing error"。改为用 ignores 把范围收窄，并在最后
 *    显式指定 TS parser。
 *
 * 2. test/ 与 scripts/ 是开发工具，不随插件发布，里面用 Node API、console.log
 *    都是正当的，套用插件规则只会产生噪音。
 *
 * 3. 用「类型检查版」规则集，与官方目录的源码检查一致。之前用非类型检查版时，
 *    src/format.ts 里由 any 传播引起的 5 条 no-unsafe-* 在本地完全看不到。
 *
 * 刻意保留、不在本地关掉的告警：
 *   - `PluginSettingTab.display()` 在 Obsidian 1.13.0 被标记为 deprecated，
 *     替代品 `getSettingDefinitions()` 同样是 1.13.0 才引入的。本插件
 *     `minAppVersion` 为 1.8.7，改用它会要求用户至少 1.13.0，
 *     因此有意继续使用 `display()`。本地不关这条规则，
 *     以免再引入别的弃用 API 时看不见。
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
  ...tseslint.configs.recommendedTypeChecked,
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
];
