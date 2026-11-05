/* ==========================================================================
   PaperMod · 首页卡片「推荐歌曲」
   点击卡片里的歌曲条 → 交给底部播放器播放（window.__papermodPlayer）。
   播放状态通过 papermod:trackchange 事件同步高亮。
   ========================================================================== */

(() => {
    "use strict";

    if (window.__papermodSong) {
        return;
    }
    window.__papermodSong = true;

    const bars = Array.from(document.querySelectorAll("[data-song]"));

    if (!bars.length) {
        return;
    }

    function syncPlaying(src, playing) {
        bars.forEach((bar) => {
            const active = Boolean(playing) && Boolean(src) && bar.dataset.songSrc === src;
            bar.classList.toggle("is-playing", active);
        });
    }

    bars.forEach((bar) => {
        const button = bar.querySelector(".entry-song-play");

        if (!button) {
            return;
        }

        button.addEventListener("click", (event) => {
            // 卡片本身有整卡跳转链接，这里必须拦住。
            event.preventDefault();
            event.stopPropagation();

            const player = window.__papermodPlayer;

            if (!player || typeof player.play !== "function") {
                return;
            }

            player.play({
                src: bar.dataset.songSrc,
                lrc: bar.dataset.songLrc,
                title: bar.dataset.songTitle,
                artist: bar.dataset.songArtist
            });
        });
    });

    window.addEventListener("papermod:trackchange", (event) => {
        const detail = (event && event.detail) || {};
        syncPlaying(detail.src, detail.playing);
    });
})();
