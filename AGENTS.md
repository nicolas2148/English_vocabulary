# 项目维护说明

- 本项目是面向初中生、以 iPad Safari 为主要使用环境的英语背单词 Web App。
- 保持界面/样式（`index.html`、`styles.css`）、程序逻辑（`app.js`）、单词数据（`data/words.json`）彼此分离。
- 新增或修改词库时，不得修改现有 UI、学习逻辑和部署设置；优先只改 `data/words.json`。
- 每个单词的 `id` 是学习记录的稳定索引，已有单词不得随意更改 `id`。
- 学习记录使用带版本号的 localStorage 键保存；程序升级不得清除或覆盖已有记录。
- 网站使用相对资源路径，以保证 GitHub Pages 仓库子路径下可以运行。
- 保持现有 GitHub Pages 网址和部署方式不变。
- 所有主要操作应支持触控，正文不小于 16px，并持续兼容 iPhone 与 iPad。

