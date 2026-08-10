# Homepage Studio

[English](README.md)

Homepage Studio 是一个仅支持 Obsidian 桌面端的模块化主页插件。它在独立主页视图中集中展示写作热力图、日期章节日记、主页任务、时间计划、文件分组和 Banner。六套内置主题共享同一份数据和功能，并分别支持浅色与深色外观。

![](/assets/homepage.webp)

## 运行要求

- Obsidian 桌面端 1.8.7 或更高版本。
- Windows、macOS 或 Linux；1.0.0 不支持移动端。
- 已允许社区插件的仓库。

## 功能

- 展示每日新增量和文件变动明细的写作热力图。
- 使用 `## YYYY-MM-DD` 日期章节的单文件日记。
- 保存在限定 Markdown 区域内的活动任务与归档任务。
- 支持跨午夜时段的每日、每周计划模板。
- 手动维护、支持重命名跟随和失效恢复的文件分组。
- 仓库图片、可选网络图片 Banner，以及完全离线的主题默认 Banner。
- 独立主题布局、浅色/深色外观，以及中文/英文界面。
- 键盘操作、可见焦点、减少动态效果和安全数据恢复。

## 安装

### 通过社区插件安装（推荐）

1. 打开 Obsidian 的 **设置 → 第三方插件**；如果尚未启用第三方插件，请先按提示启用。
2. 点击 **浏览**，搜索 **Homepage Studio**。
3. 选择插件，依次点击 **安装** 和 **启用**。
4. 通过命令面板执行 **打开主页**。

### 通过 BRAT 安装

适合在社区插件目录收录前安装，或测试 GitHub 上的发布版本。

1. 从社区插件中安装并启用 [BRAT](https://github.com/TfTHacker/obsidian42-brat)。
2. 打开命令面板，执行 **BRAT: Plugins: Add a beta plugin for testing**。
3. 输入仓库地址 `https://github.com/AshenAshes/homepage-studio`，然后确认添加。
4. 在 **设置 → 第三方插件** 中启用 **Homepage Studio**。
5. 通过命令面板执行 **打开主页**。

### 手动安装

从[最新 GitHub Release](https://github.com/AshenAshes/homepage-studio/releases/latest)下载以下三个安装文件：

- `main.js`
- `manifest.json`
- `styles.css`

创建 `<仓库>/.obsidian/plugins/homepage-studio/`，把三个文件复制进去，重启 Obsidian 或重新加载社区插件，然后在 **设置 → 第三方插件** 中启用 **Homepage Studio**。通过命令面板执行 **打开主页**。

不要把仓库源码、测试文件或开发文档复制到插件目录。

## 设置与数据源

设置页可以配置界面语言、主题和外观、Banner 来源、模块可见性与顺序、热力图偏好、日记源、任务源、计划模板、文件分组和插件数据重置。

Homepage Studio 只读写用户明确配置的数据源：

- 插件设置和模块状态保存在插件自身的 `data.json` 中。每次会话首次写入前，以及破坏性重置或迁移前，会先备份上一份有效数据。
- 日记源是一个以 `## 2026-08-10` 等二级日期标题分段的 Markdown 文件。
- 任务源是一个带有 Homepage 管理区边界的 Markdown 文件。
- 文件分组只包含用户明确添加的仓库文件路径；插件不会建立全仓库内容索引。
- 热力图统计在 Obsidian 编辑器中打开并编辑的 Markdown 文件正向净增长，不统计同步、导入、外部编辑或非 Markdown 文件。
- 仓库 Banner 始终保留在本地。只有用户主动配置网络 Banner URL 时才会向该地址发起可选请求。插件没有分析统计、遥测、崩溃上报或后台更新服务。

全部内置 Banner 和主题图形均为随 Homepage Studio 提供的原创离线 CSS/SVG 作品。

## 开发

```sh
npm install
npm run build
npm run verify
```

生产构建只生成上述三个安装文件，不生成 source map。

## 安全与许可

安全问题请按 [SECURITY.md](SECURITY.md) 中的流程报告；版本变更和已知边界见 [CHANGELOG.md](CHANGELOG.md)。

Homepage Studio 源码及原创内置图形采用 [MIT License](LICENSE)。第三方开发依赖保留各自的许可证。
