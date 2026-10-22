/* ==========================================================================
   PaperMod · 让 Giscus 跟随站点主题
   ========================================================================== */

(() => {
    "use strict";

    const root = document.documentElement;

    if (!root || window.__papermodGiscusTheme) {
        return;
    }
    window.__papermodGiscusTheme = true;

    function currentTheme() {
        return root.dataset.theme === "dark" ? "dark_dimmed" : "light";
    }

    function sendTheme() {
        const theme = currentTheme();

        document.querySelectorAll("iframe.giscus-frame").forEach((frame) => {
            frame.contentWindow?.postMessage({
                giscus: { setConfig: { theme } }
            }, "https://giscus.app");
        });
    }

    new MutationObserver(sendTheme).observe(root, {
        attributes: true,
        attributeFilter: ["data-theme"]
    });

    window.addEventListener("load", () => {
        sendTheme();
        window.setTimeout(sendTheme, 900);
        window.setTimeout(sendTheme, 2400);
    });
})();
