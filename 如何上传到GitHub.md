# 上传到 GitHub，拿到可以发给朋友的链接

这个文件夹（`github-pages/`）里的东西**整个拖进仓库根目录**就行，不需要改任何路径。

```
index.html      ← 游戏本体，GitHub Pages 会把它当首页
.nojekyll       ← 别删，关掉 Jekyll 处理
README.md       ← 仓库首页说明
shots/          ← 截图（README 里引用了）
src/            ← 源码，想改游戏再动它
```

---

## 方法一：网页上传（不用装任何东西）

1. 打开 https://github.com/new ，填仓库名，例如 `neon-protocol`，选择 **Public**（免费版 Pages 需要公开仓库），点 **Create repository**。
2. 在仓库页点 **Add file → Upload files**。
3. 把 `github-pages` 文件夹里的全部内容**拖进去**（`.nojekyll` 是隐藏文件，Windows 资源管理器里要先勾选「查看 → 隐藏的项目」才看得到；也可以之后在网页上 **Add file → Create new file** 输入文件名 `.nojekyll`，内容留空即可）。
4. 点 **Commit changes**。
5. 进入仓库 **Settings → Pages**：
   - *Source* 选 **Deploy from a branch**
   - *Branch* 选 **main**，目录选 **/ (root)**
   - 点 **Save**
6. 等 1~2 分钟，刷新 Pages 页面，顶部会出现：
   `https://<你的用户名>.github.io/neon-protocol/`
   这个链接就是发给朋友的地址。

> 仓库名如果直接叫 `<你的用户名>.github.io`，链接会变成 `https://<用户名>.github.io/`，更短。

## 方法二：命令行（装了 Git 的话）

```powershell
cd 这个文件夹的路径
git init
git add .
git commit -m "霓虹协议 1.0"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

然后同样去 **Settings → Pages** 里把 Source 设为 `main` / `/ (root)`。

---

## 朋友打开后会看到什么

- 直接进主菜单，点「启动清剿」开始玩。
- 关卡进度、钻石、通关记录存在**他自己浏览器**的 localStorage 里，互不影响。
- 想让他继承你的进度：游戏内 **设置 → 存档分享码 → 复制我的存档码**，发给他，他粘进同一个输入框点「导入存档码」。

## 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 打开是 404 | Pages 还没部署完，等 1~2 分钟；或仓库不是 Public |
| 页面空白 | 多半是 `index.html` 没在仓库**根目录**（检查路径是不是 `/repo/index.html`） |
| 没有声音 | 浏览器要求先有一次点击，点一下「启动清剿」即可；或检查设置里的音效开关 / 系统音量 |
| 更新了游戏但网页没变 | Pages 有缓存，强制刷新（Ctrl+F5），或等 1 分钟重新部署 |
| 想换链接名 | 改仓库名，Pages 链接会跟着变 |

## 备注

- 单个 `index.html` 就是完整游戏，不依赖 `src/`。只想分享游戏的话，其实只上传 `index.html` 也能玩，其余是给想改代码的人看的。
- 仓库里不要放你不想公开的东西；这个文件夹已经只包含游戏相关文件。