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

    // ----------------------------------------------------------------------
    // 4) 卡片集合（PC 视差 / 手机轮盘共用）
    // ----------------------------------------------------------------------
    const cards = Array.from(
        document.querySelectorAll(
            ".main > .first-entry, .main > .post-entry, .home-intro-card"
        )
    );

    const mqDesktop = window.matchMedia(
        "(hover: hover) and (pointer: fine) and (min-width: 900px)"
    );
    const mqMobile = window.matchMedia("(max-width: 899px)");

    // ----------------------------------------------------------------------
    // 4a) PC：卡片随鼠标轻微偏向（含阴影方向）
    // ----------------------------------------------------------------------
    const TILT_MAX = 6; // px

    cards.forEach((card) => {
        card.addEventListener(
            "pointermove",
            (event) => {
                if (!mqDesktop.matches) {
                    return;
                }

                const rect = card.getBoundingClientRect();

                if (!rect.width || !rect.height) {
                    return;
                }

                const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
                const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);

                card.style.setProperty("--tilt-x", `${(dx * TILT_MAX).toFixed(2)}px`);
                card.style.setProperty("--tilt-y", `${(dy * TILT_MAX).toFixed(2)}px`);
            },
            { passive: true }
        );

        card.addEventListener("pointerleave", () => {
            card.style.setProperty("--tilt-x", "0px");
            card.style.setProperty("--tilt-y", "0px");
        });
    });

    // ----------------------------------------------------------------------
    // 4b) 手机：轮盘深度 + 顶/底栏自动隐藏（顶栏与底栏方向相反）
    // ----------------------------------------------------------------------
    let mobileAttached = false;
    let lastScrollY = window.scrollY || 0;
    let scrollTicking = false;
    let idleTimer = 0;

    function wheelDepth() {
        const vh = window.innerHeight || html.clientHeight;
        const header = document.querySelector(".header");
        const player = document.getElementById("site-player");
        const headerH = header ? header.offsetHeight : 60;
        const playerH = player && !player.hidden ? player.offsetHeight : 0;

        // 上下两条“轮盘轨道”：顶栏中部与底栏中部
        const topRail = headerH * 0.5;
        const bottomRail = vh - playerH * 0.5;
        const range = 200;

        cards.forEach((card) => {
            const rect = card.getBoundingClientRect();

            let nearTop = 0;
            let nearBottom = 0;

            if (rect.top < topRail) {
                nearTop = Math.min(1, (topRail - rect.top) / range);
            }

            if (rect.bottom > bottomRail) {
                nearBottom = Math.min(1, (rect.bottom - bottomRail) / range);
            }

            const wheel = 1 - Math.max(nearTop, nearBottom);
            card.style.setProperty("--wheel", wheel.toFixed(3));
        });
    }

    function resetBars() {
        html.classList.remove("is-header-hidden");
        html.classList.remove("is-player-shown");
    }

    function updateBars() {
        const y = window.scrollY || 0;

        if (y <= 4) {
            // 页首：顶栏显示、底栏收起
            resetBars();
        } else if (y > lastScrollY + 2) {
            // 向下滚动：顶栏隐藏、底栏拉出
            html.classList.add("is-header-hidden");
            html.classList.add("is-player-shown");
        } else if (y < lastScrollY - 2) {
            // 向上滚动：顶栏复原、底栏收起
            resetBars();
        }
    }

    function onScroll() {
        if (!scrollTicking) {
            scrollTicking = true;
            window.requestAnimationFrame(() => {
                if (mqMobile.matches) {
                    wheelDepth();
                    updateBars();
                }
                lastScrollY = window.scrollY || 0;
                scrollTicking = false;
            });
        }

        window.clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() => {
            if (mqMobile.matches) {
                resetBars();
            }
        }, 700);
    }

    function enableMobile() {
        if (mobileAttached) {
            return;
        }
        mobileAttached = true;
        window.addEventListener("scroll", onScroll, { passive: true });
        lastScrollY = window.scrollY || 0;
        resetBars();
        wheelDepth();
    }

    function disableMobile() {
        if (!mobileAttached) {
            return;
        }
        mobileAttached = false;
        window.removeEventListener("scroll", onScroll);
        resetBars();
        cards.forEach((card) => card.style.removeProperty("--wheel"));
    }

    if (mqMobile.matches) {
        enableMobile();
    }

    if (mqMobile.addEventListener) {
        mqMobile.addEventListener("change", () => {
            if (mqMobile.matches) {
                enableMobile();
            } else {
                disableMobile();
            }
        });
    }
})();
