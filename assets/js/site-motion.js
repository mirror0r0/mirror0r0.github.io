/* ==========================================================================
   PaperMod · 动效驱动
   - 正文图片加载后浮现
   - 首屏以下的区块进入视口时浮现
   - 主题切换按钮图标翻转
   全部只在 prefers-reduced-motion: no-preference 时生效。
   ========================================================================== */

(() => {
    "use strict";

    if (window.__papermodMotion) {
        return;
    }
    window.__papermodMotion = true;

    const html = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

    // 用户偏好减少动态：不做任何标记，CSS 保持静态。
    if (reduce.matches) {
        return;
    }

    html.classList.add("has-motion");

    // ----------------------------------------------------------------------
    // 1) 正文图片：加载后浮现
    // ----------------------------------------------------------------------
    const images = document.querySelectorAll(
        ".post-content img:not(.meme-inline), .md-content img:not(.meme-inline), .home-intro-avatar"
    );

    images.forEach((img) => {
        if (img.complete && img.naturalWidth > 0) {
            img.classList.add("is-loaded");
            return;
        }

        const markLoaded = () => img.classList.add("is-loaded");

        img.addEventListener("load", markLoaded, { once: true });
        img.addEventListener("error", markLoaded, { once: true });
    });

    // 兜底：无论如何 3 秒后全部显示，避免个别图片卡在隐藏态。
    window.setTimeout(() => {
        document
            .querySelectorAll(
                ".post-content img:not(.is-loaded), .md-content img:not(.is-loaded), .home-intro-avatar:not(.is-loaded)"
            )
            .forEach((img) => img.classList.add("is-loaded"));
    }, 3000);

    // ----------------------------------------------------------------------
    // 2) 首屏以下区块：进入视口时浮现
    // ----------------------------------------------------------------------
    const revealSelector = [
        ".toc",
        ".post-engagement",
        ".post-tags",
        ".share-buttons",
        ".paginav",
        ".post-comments",
        ".page-footer",
        ".footer"
    ].join(",");

    const targets = Array.from(document.querySelectorAll(revealSelector));
    const viewportHeight = window.innerHeight || html.clientHeight;

    let observer = null;

    if ("IntersectionObserver" in window) {
        observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("is-inview");
                        observer.unobserve(entry.target);
                    }
                });
            },
            { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
        );
    }

    targets.forEach((element) => {
        const rect = element.getBoundingClientRect();

        // 只在首屏以下启用，避免可见内容先消失再浮现。
        if (rect.top <= viewportHeight * 0.9) {
            return;
        }

        element.classList.add("js-reveal");

        if (observer) {
            observer.observe(element);
        } else {
            element.classList.add("is-inview");
        }
    });

    // ----------------------------------------------------------------------
    // 3) 主题切换按钮：图标翻转
    // ----------------------------------------------------------------------
    const toggle = document.getElementById("theme-toggle");

    if (toggle) {
        toggle.addEventListener("click", () => {
            toggle.classList.remove("is-animating");
            // 强制重排以重新触发动画。
            void toggle.offsetWidth;
            toggle.classList.add("is-animating");

            window.setTimeout(() => {
                toggle.classList.remove("is-animating");
            }, 520);
        });
    }
})();
