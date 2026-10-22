/* ==========================================================================
   PaperMod · 顶栏搜索跳转后自动填入查询
   ========================================================================== */

(() => {
    "use strict";

    const params = new URLSearchParams(window.location.search);
    const query = (params.get("q") || "").trim();

    if (!query || window.__papermodSearchQuery) {
        return;
    }
    window.__papermodSearchQuery = true;

    let attempts = 0;

    function applyQuery() {
        const input = document.getElementById("searchInput");

        if (!input) {
            return;
        }

        if (input.disabled) {
            if (attempts < 16) {
                attempts += 1;
                window.setTimeout(applyQuery, 250);
            }
            return;
        }

        if (document.querySelector("#searchResults li")) {
            return;
        }

        input.value = query;
        input.dispatchEvent(new Event("input", { bubbles: true }));

        if (attempts < 12) {
            attempts += 1;
            window.setTimeout(applyQuery, 300);
        }
    }

    applyQuery();
})();
