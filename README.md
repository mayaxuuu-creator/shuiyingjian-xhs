# 水影笺 · 小红书小工具版

主仓 [shuiyingjian](https://github.com/mayaxuuu-creator/shuiyingjian) 的小红书容器适配版。当前开发分支代码为 v3.9，发布候选包仍为 `水影笺_小红书_v1.8.zip`。

## 当前功能

- 五套固定组合色盘：青绿、松烟、敦煌、汝窑、中秋限定。
- 每套组合包含纸底、油墨、纹理、装饰、诗句与导出路线，不做自由混搭。
- 长物斋（本机最多 60 件）按斋展、笺架、扇架、伞架、瓷架、签架分区陈列；斋展固定九宫展格，可挑选或点格替换九件；支持长物斋一键分享，另有成笺 / 素笺切换、三字内自定义刻印。
- 拓后成器：笺 / 团扇 / 折扇 / 油纸伞 / 瓷器 / 书签；器物使用立架、器骨、釉光或流苏等器物化渲染。
- 拓后器面辅料：少量大颗粒、带投影和高光的实物化处理；每盘只保留高适配白名单。
- 主池自由度只保留辅色选择；水势、墨量、点睛与叠印上限回归纹样保底编排。
- 晨光敦煌与雨过汝窑分别有飞天带、雨过纹专属纹样。
- 保存走 `window.xhs.miniTool.saveImageToPhotosAlbum`，发笔记走 `postNote` JSBridge。

## 打包与验证

```bash
python3 serve.py 8138
python3 .codex/minitool-zip-builder/scripts/audit_artifact.py 水影笺_小红书_v1.8.zip
```

当前 audit 结果：`PASS: 78 file(s), 0 warning(s)`。`index.html` 必须在 zip 根目录；打包排除 `.git`、`.vercel`、`.codex`、README、文档与历史 zip。

五盘视觉契约和后续新色盘 SOP 见 [docs/visual-palette-retrospective.md](docs/visual-palette-retrospective.md)。

演示 / 自检钩子：`?demo=shui-rank`（五墨分层）、`?demo=qinglv-lang-print`（全流程）。
