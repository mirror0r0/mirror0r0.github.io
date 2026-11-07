# 给协作智能体的注意事项

本文件用于提醒同时在这个仓库/服务器上工作的其他智能体，避免踩已经踩过的坑。
修改 `hugo.toml`、部署脚本、图片管线前请先读一遍。

## 1. `module.mounts`：必须显式保留 `assets`

`hugo.toml` 里一旦自定义 `[module] [[module.mounts]]`，Hugo **不再自动挂载默认组件**。
如果只写 `static -> static`，那么整个 `assets/` 组件会消失：

- `assets/css/extended/*.css` 全部丢失（实测样式表从 ~107KB 掉到 ~17KB）；
- 所有 `assets/js/site-*.js` 不再输出，播放器/粒子/主题切换全部失效。

**当前正确的挂载（不要删）：**

```toml
[module]
  [[module.mounts]]
    source = 'static'
    target = 'static'
  [[module.mounts]]
    source = 'assets'
    target = 'assets'          # 必须保留
  [[module.mounts]]
    source = 'static/uploads'
    target = 'assets/uploads'  # 供图片渲染钩子读宽高 / 转 WebP
```

## 2. `deta2` / `meme` 依赖 Nginx alias，禁止清理式构建

`deta2/`、`meme/` 已不挂进 Hugo 的 static，生产环境由 Nginx 直接 alias
（见 `admin/deploy/nginx-studio.conf`）。

- **不要加 `--cleanDestinationDir`**：新构建不再产出 `public/deta2`，清理会把旧产物删掉，
  导致音乐、头像、歌词 404。
- 除非先在服务器确认 `/deta2/`、`/meme/` 的 alias 已安装，否则保持增量构建。

## 3. 服务器内存只有约 700MB：禁止 `--renderToMemory`

曾用 `hugo --renderToMemory` 试图“安全验证”，结果 Hugo 把整站（含数百 MB 静态）读进内存，
内存回收失控、机器直接重启、SSH 断连。

**服务器上的构建方式：**

```bash
cd /var/www/mirror0r0
HUGO_NUMWORKERMULTIPLIER=1 GOMAXPROCS=2 \
  setsid nohup nice -n 19 ionice -c3 hugo --minify > /tmp/mb.log 2>&1 & 
```

- `nice -n 19` + `ionice -c3`（idle I/O）：保证 SSH 不会被构建饿死。
- `setsid nohup ... &`：脱离 SSH，断线不会中断构建、不会留下写坏的 `public/`。
- 需要验证时，先构建到临时目录（`--destination /tmp/mvX`），成功后再构建到 `public/`。

## 4. 并发构建会写坏 `public/`

两个 hugo 同时写同一个 `public/` 会产出混合文件。构建前先检查：

```bash
pgrep -x hugo      # 有输出就等它结束
```

（用 `pgrep -x` 而不是 `pgrep -f hugo`，后者会匹配到执行命令的 shell 自己。）

## 5. 图片管线（新增）

`layouts/_default/_markup/render-image.html` 会对**每张光栅图**生成 800/1600 两档 WebP
（GIF/SVG 跳过），并补 `width/height`、`loading=lazy`、`decoding=async`、`srcset`。

- 首次处理 25 张上传图约 47 次转换，本地约 9s；服务器会更慢，属正常。
- 之后走 `resources/_gen` 缓存（已 gitignore），增量构建很快。
- 依赖第 1 节的 `assets/assets` 与 `static/uploads -> assets/uploads` 两个挂载。
- 原图仍会被复制到 `public/uploads`（旧链接兼容），磁盘占用不变，但页面引用的已是 WebP。

## 6. Studio 预览临时文件泄漏

`admin` 的预览会在 `content/posts/` 下留下 `__preview-<id>.md` 文件；
现有过滤是 `!file.startsWith('_preview-')`，**匹配不到双下划线的 `__preview-`**，
于是它会被当成正常文章渲染。建议过滤前缀改成 `__preview-` 并定期清理。

## 7. 部署与 git

- 服务器 `HEAD` 可能落后于 `origin/main`（推送 `server` 时若工作区有未提交改动，
  `git merge --ff-only` 会被拒绝）。合并前先 `git status --short` 确认。
- 不要 `git reset --hard` / `git checkout -- .` 清理服务器工作区，
  那里可能有其他智能体尚未提交的改动。
