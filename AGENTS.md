# 水影笺 · 小红书小工具版 — Agent 规则

## 定位
主仓 [shuiyingjian](https://github.com/mayaxuuu-creator/shuiyingjian) 的小红书容器适配版：离线 H5，打包 zip 上传 Builder Hub 上架。当前代码基线 v3.5，发布候选 `水影笺_小红书_v1.8.zip`；不要把“已打包”写成“已提审 / 已上线”。

## 怎么跑
```bash
python3 serve.py 8138
```

## 技术栈与约束
- 纯静态 HTML/CSS/JS，零依赖零构建；容器 CSP 禁内联脚本/行内事件，全外置 + addEventListener
- 离线合规（官方 minitool-zip-builder **1.6.0** 规范）：禁网络请求/剪贴板/a[download]（容器会静默吞掉）；保存必须走 JSBridge `window.xhs.miniTool.saveImageToPhotosAlbum({ filePath: base64 dataUri })`，发笔记走 `postNote`
- 内置霞鹜文楷子集（fonts/，OFL-1.1，OFL.json 随包）

## 目录与同源约定（最重要）
- `js/fluid.js`、`palette.js`、`patterns.js`、`rubbing.js`、`mind.js` 与主仓同源——**改任一侧必须手动同步另一侧**，仅 `main.js`/`index.html`/`css` 允许两边不同（容器适配差异）
- `index.html` 必须在打包 zip 根目录；打包排除 `.git/.vercel/.codex/.gitignore/README.md/docs` 与历史 zip
- 每次发版同步升级两仓 `index.html` 资源版本串；漏升会命中旧 GLSL 缓存

## 色盘红线
- 先读 [docs/visual-palette-retrospective.md](docs/visual-palette-retrospective.md) 的“事实基线”：青绿 / 松烟 = 浅宣纸 + multiply；敦煌 = 生图纸底 + multiply；汝窑 = 天青花纸 + multiply；中秋 = 磁青 + screen
- 色盘、纸底、shader 分支、装饰层是成套契约。改任何一盘必须回归全部既有色盘导出样张，禁止用整文件回退处理单主题问题
- 深底不要沿用浅底墨色语义；亮度型五墨必须同时保留 RGB 档距和显式 `gain`

## 验证与下一步
- zip audit：`python3 .codex/minitool-zip-builder/scripts/audit_artifact.py 水影笺_小红书_v1.8.zip`
- WebGL 必须看 compile/link 错误；修 shader 后要验证 fallback 和导出双路径
- 演示/自检钩子：`?demo=shui-rank`（五墨分层）、`?demo=qinglv-lang-print`（全流程）
- 下一步：v1.8 提交 Builder Hub；提审后等平台结果，不提前改动发布包内容
