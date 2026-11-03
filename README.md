# 柜子定制 · 三维预览

装修前的柜子效果图预览，使用原生 HTML / CSS / JavaScript + three.js，纯静态站点，无后端、无构建步骤。

## 在线预览（GitHub Pages）

部署完成后地址为：

**https://sandboxkami.github.io/myClosetDesigns/**

首次部署：在 GitHub 仓库 `Settings → Pages` 中选择 **Deploy from a branch**，分支选 `main`，目录选 `/ (root)`，保存后等待发布。仓库已包含 `.nojekyll`，不会经过 Jekyll 处理。

## 本地预览

```bash
# 进入仓库根目录（克隆后通常是 myClosetDesigns/）
./启动预览.sh
# 或者
python3 预览服务器.py 8000
```

然后打开 `http://127.0.0.1:8000/`。

不要直接用 `python3 -m http.server` 作为日常预览服务器：它不会给 `.md` 发送 UTF-8 charset，也不会禁用缓存，可能出现设计说明乱码或旧 JS 被缓存。`预览服务器.py` 已处理这两点。

## 目录

```text
index.html                 总入口
assets/
  css/                     共享样式
  js/                      三维预览核心与 Markdown 预览
  vendor/                  three.js / marked
  md-viewer.html           设计说明 Markdown 预览页
<柜名>/
  index.html               单柜三维预览
  设计说明.md               设计记录与变更历史
  微信图片_*.jpg            手稿 / 参考图
```

已完成的柜子：次卧衣柜、主卧衣柜、书柜、餐边柜、鞋柜、电视机柜。其余柜子目录保留为后续制作入口。

## 设计说明

每个柜子页面底部的「设计说明.md」链接会打开共享 Markdown 预览页，在浏览器中渲染文档；也可以在预览页下载原始 `.md` 文件。

## 说明

- 预览用于确认造型、分格、比例和开合关系，不是施工下料图。
- 所有尺寸以 mm 记录，three.js 场景 1 单位 = 1 m。
- 手稿/参考图只读，设计变更记录写在各自的 `设计说明.md`。

## 许可证

本项目自身代码采用 **WTFPL**，详见 [LICENSE](./LICENSE)。

随站点分发的 three.js 和 marked 保留各自 MIT 许可，详见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
