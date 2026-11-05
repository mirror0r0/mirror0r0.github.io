/* ==========================================================================
   PaperMod · 主题（skin）切换
   - 顶栏皮肤选择菜单：写入 html[data-skin] 并持久化到 localStorage["pref-skin"]；
   - 皮肤专属氛围层 #skin-decor（配色见 skin-deltarune.css）；
   - 可选的界面音效（取自本地游戏，默认关闭，localStorage["pref-sfx"]）。
   实际的亮/暗仍由 PaperMod 的 #theme-toggle 负责；皮肤与明暗相互独立。
   ========================================================================== */

(() => {
    "use strict";

    if (window.__papermodTheme) {
        return;
    }
    window.__papermodTheme = true;

    const html = document.documentElement;
    const root = document.querySelector("[data-skin-switch]");
    const toggle = document.getElementById("skin-toggle");
    const menu = document.querySelector("[data-skin-menu]");

    if (!root || !toggle || !menu) {
        return;
    }

    const options = Array.from(menu.querySelectorAll("[data-skin-option]"));
    const validSkins = options.map((option) => option.dataset.skinOption);
    const sfxItem = menu.querySelector("[data-ambience-item]");
    const sfxToggle = menu.querySelector("[data-ambience-toggle]");
    const sfxSrc = root.dataset.sfxSrc || "";
    const SKIN_KEY = "pref-skin";
    const SFX_KEY = "pref-sfx";
    const DEFAULT_SKIN = "blue";

    function readPref(key) {
        try {
            return localStorage.getItem(key);
        } catch (error) {
            return null;
        }
    }

    function writePref(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (error) {
            // 隐私模式下不持久化。
        }
    }

    function currentSkin() {
        const skin = html.dataset.skin;
        return validSkins.includes(skin) ? skin : DEFAULT_SKIN;
    }

    // ----------------------------------------------------------------------
    // 氛围层：一个固定的 #skin-decor，具体配色由皮肤 CSS 决定
    // ----------------------------------------------------------------------
    function ensureDecor() {
        if (document.getElementById("skin-decor")) {
            return;
        }

        const decor = document.createElement("div");
        decor.id = "skin-decor";
        decor.setAttribute("aria-hidden", "true");
        document.body.appendChild(decor);
    }

    // 页面类型（首页 / 关于页 / 其它）与插画交替序号，供皮肤 CSS 选择背景插画。
    function pageKind() {
        const path = window.location.pathname.replace(/\/+$/, "") || "/";

        if (path === "/") {
            return "home";
        }

        if (path === "/about") {
            return "about";
        }

        return "other";
    }

    function nextArtSlot() {
        try {
            const seq = (Number(sessionStorage.getItem("papermod-art-seq")) || 0) + 1;
            sessionStorage.setItem("papermod-art-seq", String(seq));
            return seq % 2 === 0 ? "b" : "a";
        } catch (error) {
            return "a";
        }
    }

    html.dataset.page = pageKind();
    html.dataset.art = nextArtSlot();

    // ----------------------------------------------------------------------
    // 界面音效（可选）
    // ----------------------------------------------------------------------
    const sfxEnabled = () => readPref(SFX_KEY) === "1";
    let sfxAudio = null;

    function syncSfxUI() {
        if (sfxToggle) {
            sfxToggle.setAttribute("aria-checked", sfxEnabled() ? "true" : "false");
        }
    }

    function playSfx() {
        if (!sfxEnabled() || !sfxSrc) {
            return;
        }

        try {
            if (!sfxAudio) {
                sfxAudio = new Audio(sfxSrc);
                sfxAudio.preload = "auto";
                sfxAudio.volume = 0.35;
            }

            sfxAudio.currentTime = 0;
            const promise = sfxAudio.play();

            if (promise && typeof promise.catch === "function") {
                promise.catch(() => {});
            }
        } catch (error) {
            // 无法播放时静默忽略。
        }
    }

    // ----------------------------------------------------------------------
    // 皮肤
    // ----------------------------------------------------------------------
    function syncOptions() {
        const skin = currentSkin();

        options.forEach((option) => {
            option.setAttribute("aria-checked", option.dataset.skinOption === skin ? "true" : "false");
        });

        if (sfxItem) {
            sfxItem.hidden = skin !== "deltarune";
        }
    }

    function setSkin(next) {
        const skin = validSkins.includes(next) ? next : DEFAULT_SKIN;
        html.dataset.skin = skin;
        writePref(SKIN_KEY, skin);
        syncOptions();
        ensureDecor();
    }

    function openMenu() {
        menu.hidden = false;
        root.classList.add("is-open");
        toggle.setAttribute("aria-expanded", "true");
    }

    function closeMenu(restoreFocus) {
        menu.hidden = true;
        root.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");

        if (restoreFocus) {
            toggle.focus();
        }
    }

    toggle.addEventListener("click", (event) => {
        event.preventDefault();

        if (menu.hidden) {
            openMenu();
        } else {
            closeMenu(true);
        }
    });

    options.forEach((option) => {
        option.addEventListener("click", () => {
            setSkin(option.dataset.skinOption);
            playSfx();
            closeMenu(true);
        });
    });

    if (sfxToggle) {
        sfxToggle.addEventListener("click", () => {
            const next = !sfxEnabled();
            writePref(SFX_KEY, next ? "1" : "0");
            syncSfxUI();

            if (next) {
                playSfx();
            }
        });
    }

    document.addEventListener("pointerdown", (event) => {
        if (!menu.hidden && !root.contains(event.target)) {
            closeMenu(false);
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !menu.hidden) {
            closeMenu(true);
        }
    });

    // 在 Deltarune 皮肤下切换明暗时也给出提示音。
    const themeToggle = document.getElementById("theme-toggle");

    if (themeToggle) {
        themeToggle.addEventListener("click", () => {
            if (currentSkin() === "deltarune") {
                playSfx();
            }
        });
    }

    if (!validSkins.includes(html.dataset.skin)) {
        html.dataset.skin = DEFAULT_SKIN;
    }

    ensureDecor();
    syncOptions();
    syncSfxUI();
})();
