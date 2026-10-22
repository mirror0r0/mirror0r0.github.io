/* ==========================================================================
   PaperMod · 文章数据
   - 浏览量：本机 localStorage（Giscus 元数据不提供浏览量）
   - 评论 / 爱心：读取 Giscus 返回的 discussion 元数据并缓存
   ========================================================================== */

(() => {
    "use strict";

    if (window.__papermodMetrics) {
        return;
    }
    window.__papermodMetrics = true;

    const STORAGE_KEY = "papermod-metrics-v1";
    const VIEW_SESSION_PREFIX = "papermod-viewed:";
    let data = readMetrics();

    function readJSON(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || "null");
            return value && typeof value === "object" ? value : fallback;
        } catch (error) {
            return fallback;
        }
    }

    function readMetrics() {
        const value = readJSON(STORAGE_KEY, {});

        return {
            views: value.views || {},
            comments: value.comments || {},
            likes: value.likes || {}
        };
    }

    function saveMetrics() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            // 隐私模式或存储已满时静默失败。
        }
    }

    function normalizePath(value) {
        let path = value || "/";

        try {
            path = decodeURIComponent(path);
        } catch (error) {
            // 保留原值。
        }

        path = path.replace(/\/+$/, "");
        return path || "/";
    }

    function currentPath() {
        return normalizePath(window.location.pathname);
    }

    function ensureBucket(bucket, path) {
        if (!Object.prototype.hasOwnProperty.call(bucket, path)) {
            bucket[path] = 0;
        }
        return bucket[path];
    }

    function render() {
        document.querySelectorAll("[data-entry-metrics]").forEach((element) => {
            const path = normalizePath(element.dataset.metricsPath);
            setMetric(element, "views", ensureBucket(data.views, path));
            setMetric(element, "comments", ensureBucket(data.comments, path));
            setMetric(element, "likes", ensureBucket(data.likes, path));
        });

        document.querySelectorAll("[data-post-metrics]").forEach((element) => {
            const path = normalizePath(element.dataset.metricsPath || currentPath());

            setMetric(element, "views", ensureBucket(data.views, path));
            setMetric(element, "likes", ensureBucket(data.likes, path));
            setMetric(element, "comments", ensureBucket(data.comments, path));
        });
    }

    function setMetric(root, name, value) {
        root.querySelectorAll(`[data-metric="${name}"]`).forEach((element) => {
            element.textContent = String(value);
        });
    }

    function bumpView() {
        if (!document.querySelector(".post-single")) {
            return;
        }

        const path = currentPath();
        const sessionKey = `${VIEW_SESSION_PREFIX}${path}`;

        if (sessionStorage.getItem(sessionKey)) {
            return;
        }

        data.views[path] = ensureBucket(data.views, path) + 1;
        sessionStorage.setItem(sessionKey, "1");
        saveMetrics();
    }

    function receiveGiscus(event) {
        if (event.origin !== "https://giscus.app") {
            return;
        }

        const payload = event.data && event.data.giscus;

        if (!payload || !payload.discussion) {
            return;
        }

        const discussion = payload.discussion;
        const commentCount = Number(
            discussion.totalCommentCount ??
            ((discussion.commentCount || 0) + (discussion.replyCount || 0))
        );
        const reactions = Array.isArray(discussion.reactions) ? discussion.reactions : [];
        const heartCount = reactions
            .filter((reaction) => String(reaction.reaction || "").toUpperCase() === "HEART")
            .reduce((sum, reaction) => sum + (Number(reaction.count) || 0), 0);
        const likeCount = heartCount || Number(discussion.reactionCount || 0);
        const path = currentPath();

        if (Number.isFinite(commentCount) && commentCount >= 0) {
            data.comments[path] = commentCount;
        }

        if (Number.isFinite(likeCount) && likeCount >= 0) {
            data.likes[path] = likeCount;
        }

        saveMetrics();
        render();
    }

    window.addEventListener("message", receiveGiscus);
    bumpView();
    render();

    // Giscus 是异步加载的，晚一点再刷新一次。
    window.setTimeout(render, 1800);
})();
