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

## 5. 图片管线：压缩在上传端，构建期禁止转码

- **上传端**（`admin/server/src/index.ts` 的 `/api/uploads`）用 `sharp`（libvips）
  把图片转 WebP、最长边限制 1600px；GIF/SVG/音频原样保留。
  实测 48MP 图处理约 184ms、峰值内存约 66MB、输出约 117KB，内存友好。
- `layouts/_default/_markup/render-image.html` **只补 `width/height`、`loading=lazy`、
  `decoding=async`，不在构建期做任何转码**。
- **禁止在构建期做图片转码**：这台服务器只有约 700MB 内存，6000x8000 的图单次解码约 192MB，
  曾直接把机器拖死（SSH/HTTP 全部无响应，只能强制重启）。
- `static/uploads -> assets/uploads` 挂载仍保留（渲染钩子读取宽高用）。
- 服务器上运行 Studio 需要先 `npm install`（安装 sharp 原生依赖），
  再 `npm run build` 并重启服务，否则上传压缩不生效。

## 6. Studio 预览临时文件泄漏

`admin` 的预览会在 `content/posts/` 下留下 `__preview-<id>.md` 文件；
现有过滤是 `!file.startsWith('_preview-')`，**匹配不到双下划线的 `__preview-`**，
于是它会被当成正常文章渲染。建议过滤前缀改成 `__preview-` 并定期清理。

## 7. 部署与 git

- 服务器 `HEAD` 可能落后于 `origin/main`（推送 `server` 时若工作区有未提交改动，
  `git merge --ff-only` 会被拒绝）。合并前先 `git status --short` 确认。
- 不要 `git reset --hard` / `git checkout -- .` 清理服务器工作区，
  那里可能有其他智能体尚未提交的改动。
