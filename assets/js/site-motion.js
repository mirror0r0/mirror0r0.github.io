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
    // 4a) PC：卡片保持不动，阴影随鼠标方位缓动偏移；鼠标离开缓慢归零
    // ----------------------------------------------------------------------
    const SHIFT_MAX = 16; // px，阴影相对默认位置的偏移上限
    const depth = cards.map((card) => ({ card, curX: 0, curY: 0, tgtX: 0, tgtY: 0 }));

    let pointerX = 0;
    let pointerY = 0;
    let pointerActive = false;
    let depthRAF = 0;

    function depthTargets() {
        depth.forEach((item) => {
            if (!mqDesktop.matches || !pointerActive) {
                item.tgtX = 0;
                item.tgtY = 0;
                return;
            }

            const rect = item.card.getBoundingClientRect();

            if (!rect.width || !rect.height) {
                item.tgtX = 0;
                item.tgtY = 0;
                return;
            }

            const dx = (pointerX - (rect.left + rect.width / 2)) / (rect.width / 2);
            const dy = (pointerY - (rect.top + rect.height / 2)) / (rect.height / 2);

            item.tgtX = Math.max(-1, Math.min(1, dx)) * SHIFT_MAX;
            item.tgtY = Math.max(-1, Math.min(1, dy)) * SHIFT_MAX;
        });
    }

    function depthTick() {
        depthRAF = 0;
        depthTargets();

        // 进入时较缓地加速跟随；离开或鼠标不在页面时更慢地回到默认。
        const rate = pointerActive ? 0.08 : 0.035;
        let moving = false;

        depth.forEach((item) => {
            item.curX += (item.tgtX - item.curX) * rate;
            item.curY += (item.tgtY - item.curY) * rate;

            if (
                Math.abs(item.tgtX - item.curX) > 0.04 ||
                Math.abs(item.tgtY - item.curY) > 0.04
            ) {
                moving = true;
            }

            item.card.style.setProperty("--sh-x", `${item.curX.toFixed(2)}px`);
            item.card.style.setProperty("--sh-y", `${item.curY.toFixed(2)}px`);
        });

        if (moving) {
            depthRAF = window.requestAnimationFrame(depthTick);
        }
    }

    function ensureDepth() {
        if (!depthRAF) {
            depthRAF = window.requestAnimationFrame(depthTick);
        }
    }

    document.addEventListener(
        "pointermove",
        (event) => {
            if (!mqDesktop.matches) {
                return;
            }

            pointerX = event.clientX;
            pointerY = event.clientY;
            pointerActive = true;
            ensureDepth();
        },
        { passive: true }
    );

    // 鼠标离开窗口（relatedTarget 为空）→ 缓慢归零
    document.addEventListener(
        "mouseout",
        (event) => {
            if (!event.relatedTarget) {
                pointerActive = false;
                ensureDepth();
            }
        },
        true
    );

    window.addEventListener("blur", () => {
        pointerActive = false;
        ensureDepth();
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

    // ----------------------------------------------------------------------
    // 5) 点击卡片：先快速下沉一小段，再跳转
    // ----------------------------------------------------------------------
    document
        .querySelectorAll(".main > .first-entry .entry-link, .main > .post-entry .entry-link")
        .forEach((link) => {
            link.addEventListener("click", (event) => {
                if (
                    event.defaultPrevented ||
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                ) {
                    return;
                }

                const card = link.closest(".first-entry, .post-entry");

                if (!card || !link.href) {
                    return;
                }

                event.preventDefault();
                card.classList.add("is-sinking");

                window.setTimeout(() => {
                    window.location.href = link.href;
                }, 165);
            });
        });
})();
