/* ==========================================================================
   PaperMod · 首页简介卡片一言
   ========================================================================== */

(() => {
    "use strict";

    const card = document.querySelector("[data-home-intro]");

    if (!card || window.__papermodHomeIntro) {
        return;
    }
    window.__papermodHomeIntro = true;

    const textElement = document.getElementById("home-hitokoto-text");
    const sourceElement = document.getElementById("home-hitokoto-source");
    const refreshButton = card.querySelector(".home-hitokoto-refresh");

    // 入场动画结束后移除 animation，避免 transform 动画持续成为 fixed 子元素的包含块。
    card.addEventListener("animationend", () => {
        card.style.animation = "none";
    }, { once: true });

    if (!textElement || !sourceElement || !refreshButton) {
        return;
    }

    const CACHE_KEY = "papermod-hitokoto-v1";
    const CACHE_TTL = 10 * 60 * 1000;
    let loading = false;

    function readCache() {
        try {
            const value = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");

            if (value && value.text && Date.now() - value.time < CACHE_TTL) {
                return value;
            }
        } catch (error) {
            // 忽略损坏的缓存。
        }

        return null;
    }

    function writeCache(text, source) {
        try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({
                text,
                source,
                time: Date.now()
            }));
        } catch (error) {
            // 隐私模式下不缓存。
        }
    }

    function applyQuote(text, source) {
        textElement.textContent = text;
        sourceElement.textContent = source ? `—— ${source}` : "—— 一言";

        const quote = textElement.closest("blockquote");

        if (quote) {
            quote.classList.remove("is-swapping");
            // 强制重排以重新触发浮现动画。
            void quote.offsetWidth;
            quote.classList.add("is-swapping");
        }
    }

    function formatSource(data) {
        const from = data.from ? `《${data.from}》` : "";
        const who = data.from_who || "";
        return [who, from].filter(Boolean).join(" ");
    }

    async function loadQuote(force) {
        if (loading) {
            return;
        }

        if (!force) {
            const cached = readCache();

            if (cached) {
                applyQuote(cached.text, cached.source);
                return;
            }
        }

        loading = true;
        refreshButton.disabled = true;
        refreshButton.textContent = "加载中";

        try {
            const response = await fetch("https://v1.hitokoto.cn/", {
                cache: "no-store",
                headers: { Accept: "application/json" }
            });

            if (!response.ok) {
                throw new Error(`Hitokoto ${response.status}`);
            }

            const data = await response.json();

            if (!data || !data.hitokoto) {
                throw new Error("Hitokoto empty");
            }

            const source = formatSource(data);
            applyQuote(data.hitokoto, source);
            writeCache(data.hitokoto, source);
        } catch (error) {
            // 保留服务端渲染的兜底一言。
        } finally {
            loading = false;
            refreshButton.disabled = false;
            refreshButton.textContent = "换一句";
        }
    }

    refreshButton.addEventListener("click", () => {
        loadQuote(true);
    });

    const cached = readCache();

    if (cached) {
        applyQuote(cached.text, cached.source);
    } else {
        loadQuote(false);
    }
})();
