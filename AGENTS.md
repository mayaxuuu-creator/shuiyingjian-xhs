# 水影笺 · 小红书小工具版 — Agent 规则

## 定位
主仓 [shuiyingjian](https://github.com/mayaxuuu-creator/shuiyingjian) 的小红书容器适配版：离线 H5，打包 zip 上传 Builder Hub 上架。当前 v1.5 已提审。

## 怎么跑
```bash
python3 /tmp/nocache_server.py 8138 .   # 任意静态服务器即可，必须带 no-cache 头（否则改码看不到变化）
```

## 技术栈与约束
- 纯静态 HTML/CSS/JS，零依赖零构建；容器 CSP 禁内联脚本/行内事件，全外置 + addEventListener
- 离线合规（官方 minitool-zip-builder 规范）：禁网络请求/剪贴板/文件下载之外的容器能力；保存走 blob 下载（真机实测可用），复制走可选文字
- 内置霞鹜文楷子集（fonts/，OFL-1.1，OFL.json 随包）；字体子集重建脚本 /tmp/wenkai/build_font_subset.py（临时，含构建思路）

## 目录与同源约定（最重要）
- `js/fluid.js`、`palette.js`、`patterns.js`、`rubbing.js`、`mind.js` 与主仓同源——**改任一侧必须手动同步另一侧**，仅 `main.js`/`index.html`/`css` 允许两边不同（容器适配差异）
- `index.html` 必须在打包 zip 根目录；打包排除 .git/.vercel/.gitignore/README.md

## 当前状态与下一步
- v1.5 已提审（名称：水影笺 / Slogan：把千里江山搅进水里 / 图标：主仓 Projects 根目录 水影笺_icon_512.png）
- 待审期间不动 zip 内容；上线后记录数据复盘
- 演示/自检钩子：?demo=shui-rank（五墨分层）、?demo=qinglv-lang-print（全流程）
