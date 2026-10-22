/* ==========================================================================
   PaperMod · 底部音乐播放器
   数据由 layouts/_partials/music-player.html 在构建时生成。
   ========================================================================== */

(() => {
    "use strict";

    if (window.__papermodSitePlayer) {
        return;
    }
    window.__papermodSitePlayer = true;

    const player = document.getElementById("site-player");
    const audio = document.getElementById("site-audio");
    const root = document.documentElement;

    if (!player || !audio) {
        return;
    }

    const music = window.__papermodMusic || {};
    const tracks = Array.isArray(music.tracks)
        ? music.tracks.filter((track) => track && track.src)
        : [];

    const ui = {
        title: document.getElementById("player-title"),
        subtitle: document.getElementById("player-subtitle"),
        lyricCurrent: document.getElementById("player-lyric-current"),
        lyricNext: document.getElementById("player-lyric-next"),
        play: document.getElementById("player-play"),
        playIcon: document.getElementById("player-play-icon"),
        shuffle: player.querySelector('[data-player-action="shuffle"]'),
        repeat: document.getElementById("player-repeat"),
        repeatIcon: document.getElementById("player-repeat-icon"),
        seek: document.getElementById("player-seek"),
        currentTime: document.getElementById("player-current-time"),
        duration: document.getElementById("player-duration"),
        mute: document.getElementById("player-mute"),
        volumeIcon: document.getElementById("player-volume-icon"),
        volume: document.getElementById("player-volume"),
        volumeValue: document.getElementById("player-volume-value"),
        listToggle: document.getElementById("player-list-toggle"),
        playlist: document.getElementById("player-playlist"),
        playlistClose: document.getElementById("player-playlist-close"),
        trackList: document.getElementById("player-tracklist"),
        status: document.getElementById("player-status")
    };

    if (!ui.title || !ui.play || !ui.seek || !ui.volume || !ui.trackList) {
        return;
    }

    if (!tracks.length) {
        player.hidden = true;
        root.style.setProperty("--player-height", "0px");
        return;
    }

    const DEFAULT_VOLUME = 0.4;
    const PLAYBACK_KEY = "papermod-player-playback-v1";
    const PREFS_KEY = "papermod-player-prefs-v1";
    const SAVE_INTERVAL = 850;

    let currentIndex = -1;
    let currentTrack = null;
    let lyricLines = [];
    let lyricIndex = -1;
    let lyricRequest = 0;
    let seeking = false;
    let seekTimer = 0;
    let shuffleOn = false;
    let repeatMode = "off";
    let trackButtons = [];
    let playerReady = false;
    let pendingRestoreTime = 0;
    let pendingAutoplay = false;
    let lastPlaybackSave = 0;
    let playbackSnapshot = null;
    let isUnloading = false;
    let preloadTimer = 0;
    let preloadedSrc = "";
    let preloadAudio = null;

    const prefs = readStorage("localStorage", PREFS_KEY) || {};
    const savedVolume = Number(prefs.volume);

    try {
        audio.preload = "auto";
        audio.volume = Number.isFinite(savedVolume)
            ? Math.min(1, Math.max(0, savedVolume))
            : DEFAULT_VOLUME;
        audio.muted = Boolean(prefs.muted);
    } catch (error) {
        // 某些移动端浏览器不允许脚本直接设置音量，保持系统音量即可。
    }

    shuffleOn = Boolean(prefs.shuffle);
    repeatMode = ["off", "all", "one"].includes(prefs.repeat) ? prefs.repeat : "off";

    function readStorage(kind, key) {
        try {
            const storage = window[kind];
            const raw = storage ? storage.getItem(key) : null;
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
    }

    function writeStorage(kind, key, value) {
        try {
            const storage = window[kind];

            if (storage) {
                storage.setItem(key, JSON.stringify(value));
            }
        } catch (error) {
            // 隐私模式或存储已满时静默失败。
        }
    }

    function savePrefs() {
        writeStorage("localStorage", PREFS_KEY, {
            volume: Number.isFinite(audio.volume) ? audio.volume : DEFAULT_VOLUME,
            muted: audio.muted,
            shuffle: shuffleOn,
            repeat: repeatMode
        });
    }

    function capturePlayback() {
        if (!currentTrack) {
            return null;
        }

        playbackSnapshot = {
            src: currentTrack.src,
            time: audio.ended || !Number.isFinite(audio.currentTime) ? 0 : audio.currentTime,
            playing: !audio.paused && !audio.ended
        };

        return playbackSnapshot;
    }

    function savePlayback(force, fromSnapshot) {
        if (!playerReady || !currentTrack) {
            return;
        }

        const now = Date.now();

        if (!force && now - lastPlaybackSave < SAVE_INTERVAL) {
            return;
        }

        const snapshot = fromSnapshot && playbackSnapshot
            ? playbackSnapshot
            : capturePlayback();

        if (!snapshot) {
            return;
        }

        lastPlaybackSave = now;
        writeStorage("sessionStorage", PLAYBACK_KEY, snapshot);
    }

    function setStatus(message) {
        if (ui.status) {
            ui.status.textContent = message || "";
        }
    }

    function showPlaybackError() {
        setStatus("无法播放此音频：浏览器可能不支持该格式，或文件路径不可用。");
        setLyric("无法播放此音频", "浏览器可能不支持该音频格式", true);
        updatePlayButton(false);
    }

    function formatTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) {
            return "0:00";
        }

        const total = Math.floor(seconds);
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        const rest = total % 60;

        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
        }

        return `${minutes}:${String(rest).padStart(2, "0")}`;
    }

    function setRangeFill(input, percent) {
        input.style.setProperty("--range-progress", `${Math.max(0, Math.min(100, percent))}%`);
    }

    function parseLrc(text) {
        const rows = text.replace(/^\uFEFF/, "").split(/\r?\n/);
        const entries = [];

        for (const raw of rows) {
            const line = raw.trim();

            if (!line || line.startsWith("{")) {
                continue;
            }

            // 支持 [mm:ss]、[mm:ss.xx]、[mm:ss.xxx]，以及一行多个时间标签。
            const tagPattern = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
            const matches = Array.from(line.matchAll(tagPattern));

            if (!matches.length) {
                continue;
            }

            const content = line.replace(tagPattern, "").trim();

            for (const match of matches) {
                const minutes = Number(match[1]);
                const seconds = Number(match[2]);
                const fraction = match[3]
                    ? Number(match[3].padEnd(3, "0").slice(0, 3)) / 1000
                    : 0;

                entries.push({
                    time: minutes * 60 + seconds + fraction,
                    text: content
                });
            }
        }

        entries.sort((a, b) => a.time - b.time);
        return entries;
    }

    function setLyric(current, next, empty) {
        if (!ui.lyricCurrent) {
            return;
        }

        if (ui.lyricCurrent.textContent !== current) {
            ui.lyricCurrent.textContent = current;
            ui.lyricCurrent.classList.remove("lyric-in");
            // 重新触发换行动画。
            void ui.lyricCurrent.offsetWidth;
            ui.lyricCurrent.classList.add("lyric-in");
        }

        ui.lyricCurrent.classList.toggle("is-empty", Boolean(empty));

        if (ui.lyricNext) {
            ui.lyricNext.textContent = next || "";
        }
    }

    function showNoLyrics() {
        lyricLines = [];
        lyricIndex = -1;
        setLyric("暂无字幕", "", true);
    }

    async function loadLyrics(track) {
        lyricRequest += 1;
        const request = lyricRequest;

        lyricLines = [];
        lyricIndex = -1;

        if (!track.lrc) {
            showNoLyrics();
            return;
        }

        setLyric("歌词载入中…", "", true);

        try {
            const response = await fetch(track.lrc, { cache: "force-cache" });

            if (!response.ok) {
                throw new Error(`LRC ${response.status}`);
            }

            const text = await response.text();

            if (request !== lyricRequest) {
                return;
            }

            const lines = parseLrc(text);

            if (!lines.some((line) => line.text)) {
                showNoLyrics();
                return;
            }

            lyricLines = lines;
            lyricIndex = -2;
            updateLyrics(true);
        } catch (error) {
            if (request === lyricRequest) {
                showNoLyrics();
            }
        }
    }

    function updateLyrics(force) {
        if (!lyricLines.length) {
            return;
        }

        if (ui.lyricCurrent && ui.lyricCurrent.textContent === "歌词载入中…") {
            force = true;
        }

        const time = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
        let low = 0;
        let high = lyricLines.length - 1;
        let index = -1;

        while (low <= high) {
            const middle = Math.floor((low + high) / 2);

            if (lyricLines[middle].time <= time) {
                index = middle;
                low = middle + 1;
            } else {
                high = middle - 1;
            }
        }

        if (!force && index === lyricIndex) {
            return;
        }

        lyricIndex = index;

        if (index < 0) {
            const first = lyricLines.find((line) => line.text);
            setLyric("♪", first ? first.text : "", true);
            return;
        }

        let next = "";

        for (let i = index + 1; i < lyricLines.length; i += 1) {
            if (lyricLines[i].text) {
                next = lyricLines[i].text;
                break;
            }
        }

        if (!lyricLines[index].text) {
            setLyric("♪", next, true);
            return;
        }

        setLyric(lyricLines[index].text, next, false);
    }

    function getBufferedEnd() {
        if (!audio.buffered || audio.buffered.length === 0) {
            return 0;
        }

        let end = 0;

        for (let i = 0; i < audio.buffered.length; i += 1) {
            end = Math.max(end, audio.buffered.end(i));
        }

        return end;
    }

    function updateProgress(force) {
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
        const percent = duration > 0 ? (current / duration) * 100 : 0;
        const bufferedEnd = getBufferedEnd();
        const bufferPercent = duration > 0
            ? Math.min(100, (bufferedEnd / duration) * 100)
            : 0;

        if (force || !seeking) {
            ui.seek.value = String(Math.round(percent * 10));
        }

        setRangeFill(ui.seek, percent);
        ui.seek.style.setProperty(
            "--buffer-progress",
            `${Math.max(percent, bufferPercent)}%`
        );
        ui.seek.title = `已预载 ${Math.round(bufferPercent)}%`;
        ui.currentTime.textContent = formatTime(current);
        ui.duration.textContent = formatTime(duration);
        ui.seek.setAttribute("aria-valuetext", `${formatTime(current)} / ${formatTime(duration)}`);

        if (
            "mediaSession" in navigator &&
            typeof navigator.mediaSession.setPositionState === "function" &&
            duration > 0
        ) {
            try {
                navigator.mediaSession.setPositionState({
                    duration,
                    playbackRate: audio.playbackRate,
                    position: Math.min(current, duration)
                });
            } catch (error) {
                // 某些浏览器会在 duration 尚未稳定时拒绝该调用，忽略即可。
            }
        }
    }

    function updateVolumeUI() {
        const volume = Math.round((Number.isFinite(audio.volume) ? audio.volume : DEFAULT_VOLUME) * 100);
        const muted = audio.muted || volume === 0;

        ui.volume.value = String(volume);
        setRangeFill(ui.volume, volume);
        ui.volumeValue.textContent = `${volume}%`;
        ui.volume.setAttribute("aria-valuetext", `${volume}%`);

        if (ui.volumeIcon) {
            ui.volumeIcon.setAttribute("href", muted ? "#pm-mute" : "#pm-volume");
        }

        if (ui.mute) {
            ui.mute.setAttribute("aria-label", muted ? "取消静音" : "静音");
            ui.mute.title = muted ? "取消静音" : "静音";
            ui.mute.classList.toggle("is-active", muted);
        }
    }

    function updatePlayButton(playing) {
        if (ui.playIcon) {
            ui.playIcon.setAttribute("href", playing ? "#pm-pause" : "#pm-play");
        }

        ui.play.setAttribute("aria-label", playing ? "暂停" : "播放");
        ui.play.title = playing ? "暂停" : "播放";
        player.classList.toggle("is-playing", playing);

        if ("mediaSession" in navigator) {
            try {
                navigator.mediaSession.playbackState = playing ? "playing" : "paused";
            } catch (error) {
                // 不支持时忽略。
            }
        }
    }

    function playAudio() {
        const promise = audio.play();

        if (promise && typeof promise.catch === "function") {
            promise.catch((error) => {
                if (error && error.name === "AbortError") {
                    return;
                }

                if (error && error.name === "NotAllowedError") {
                    setStatus("浏览器阻止了自动播放，点击播放按钮继续。");
                    updatePlayButton(false);
                    savePlayback(true);
                    return;
                }

                showPlaybackError();
            });
        }
    }

    function togglePlay() {
        if (currentIndex < 0) {
            loadTrack(0, true);
            return;
        }

        if (audio.ended) {
            audio.currentTime = 0;
        }

        if (audio.paused) {
            playAudio();
        } else {
            audio.pause();
        }
    }

    function updateTrackListActive() {
        trackButtons.forEach((button, index) => {
            const active = index === currentIndex;
            button.classList.toggle("is-active", active);

            if (active) {
                button.setAttribute("aria-current", "true");
            } else {
                button.removeAttribute("aria-current");
            }
        });
    }

    function loadTrack(index, autoplay, restore) {
        if (!tracks[index]) {
            return;
        }

        currentIndex = index;
        currentTrack = tracks[index];
        playbackSnapshot = {
            src: currentTrack.src,
            time: 0,
            playing: false
        };
        pendingRestoreTime = restore && Number.isFinite(Number(restore.time))
            ? Math.max(0, Number(restore.time))
            : 0;
        pendingAutoplay = Boolean(restore && restore.playing);

        window.clearTimeout(preloadTimer);
        audio.pause();
        audio.src = currentTrack.src;
        audio.load();

        ui.title.textContent = currentTrack.title || currentTrack.name || "未知曲目";
        ui.title.title = currentTrack.name || currentTrack.title || "";
        ui.subtitle.textContent = [
            currentTrack.subtitle,
            currentTrack.format || "AUDIO"
        ].filter(Boolean).join(" · ");

        ui.seek.value = "0";
        setRangeFill(ui.seek, 0);
        ui.seek.style.setProperty("--buffer-progress", "0%");
        ui.currentTime.textContent = "0:00";
        ui.duration.textContent = "0:00";
        setStatus(pendingAutoplay ? "正在恢复上次播放…" : "");

        updateTrackListActive();
        loadLyrics(currentTrack);
        updateMediaSession(currentTrack);

        if (autoplay) {
            playAudio();
        }

        if (playerReady) {
            savePlayback(true);
        }
    }

    function canPreloadNext() {
        const connection = navigator.connection;

        if (!connection) {
            return true;
        }

        if (connection.saveData) {
            return false;
        }

        return !/(^|-)(2g|3g)$/.test(connection.effectiveType || "");
    }

    function preloadNextTrack() {
        if (!playerReady || !currentTrack || tracks.length < 2 || !canPreloadNext()) {
            return;
        }

        const next = tracks[getNextIndex()];

        if (!next || !next.src || next.src === currentTrack.src) {
            return;
        }

        if (!preloadAudio) {
            preloadAudio = new Audio();
            preloadAudio.preload = "auto";
            preloadAudio.muted = true;
            preloadAudio.volume = 0;
            preloadAudio.hidden = true;
            preloadAudio.setAttribute("aria-hidden", "true");

            if (document.body) {
                document.body.appendChild(preloadAudio);
            }
        }

        if (preloadedSrc !== next.src) {
            preloadedSrc = next.src;

            try {
                preloadAudio.src = next.src;
                preloadAudio.load();
            } catch (error) {
                preloadedSrc = "";
            }
        }

        if (next.lrc) {
            fetch(next.lrc, { cache: "force-cache" }).catch(() => {});
        }
    }

    function schedulePreloadNext() {
        window.clearTimeout(preloadTimer);
        preloadTimer = window.setTimeout(preloadNextTrack, 1800);
    }

    function getNextIndex() {
        if (shuffleOn && tracks.length > 1) {
            let index = currentIndex;

            while (index === currentIndex) {
                index = Math.floor(Math.random() * tracks.length);
            }

            return index;
        }

        return (currentIndex + 1) % tracks.length;
    }

    function nextTrack() {
        loadTrack(getNextIndex(), true);
    }

    function previousTrack() {
        if (audio.currentTime > 3) {
            audio.currentTime = 0;
            updateProgress(true);
            updateLyrics(true);
            return;
        }

        const index = (currentIndex - 1 + tracks.length) % tracks.length;
        loadTrack(index, true);
    }

    function handleEnded() {
        if (repeatMode === "one") {
            audio.currentTime = 0;
            playAudio();
            return;
        }

        if (shuffleOn || repeatMode === "all" || currentIndex < tracks.length - 1) {
            loadTrack(getNextIndex(), true);
            return;
        }

        updatePlayButton(false);
        updateProgress(true);
        savePlayback(true);
    }

    function updateRepeatUI() {
        const labels = {
            off: "循环模式：关闭",
            all: "循环模式：列表循环",
            one: "循环模式：单曲循环"
        };

        ui.repeat.classList.toggle("is-active", repeatMode !== "off");
        ui.repeat.setAttribute("aria-pressed", repeatMode !== "off" ? "true" : "false");
        ui.repeat.setAttribute("aria-label", labels[repeatMode]);
        ui.repeat.title = labels[repeatMode];

        if (ui.repeatIcon) {
            ui.repeatIcon.setAttribute("href", repeatMode === "one" ? "#pm-repeat-one" : "#pm-repeat");
        }
    }

    function cycleRepeat() {
        repeatMode = repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
        updateRepeatUI();
        savePrefs();
    }

    function updateShuffleUI() {
        ui.shuffle.classList.toggle("is-active", shuffleOn);
        ui.shuffle.setAttribute("aria-pressed", shuffleOn ? "true" : "false");
        ui.shuffle.title = shuffleOn ? "随机播放：开" : "随机播放：关";
        ui.shuffle.setAttribute("aria-label", shuffleOn ? "随机播放：开" : "随机播放：关");
    }

    function toggleShuffle() {
        shuffleOn = !shuffleOn;
        updateShuffleUI();
        savePrefs();

        if (shuffleOn && !audio.paused) {
            schedulePreloadNext();
        }
    }

    function setPlaylistOpen(open) {
        if (!ui.playlist || !ui.listToggle) {
            return;
        }

        ui.playlist.hidden = !open;
        ui.listToggle.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function buildTrackList() {
        const fragment = document.createDocumentFragment();
        trackButtons = [];

        tracks.forEach((track, index) => {
            const item = document.createElement("li");
            const button = document.createElement("button");
            const number = document.createElement("span");
            const text = document.createElement("span");
            const title = document.createElement("span");
            const subtitle = document.createElement("span");
            const format = document.createElement("span");

            button.type = "button";
            button.className = "player-track";
            button.setAttribute("aria-label", `播放 ${track.title || track.name || "未知曲目"}`);

            number.className = "player-track-index";
            number.textContent = String(index + 1).padStart(2, "0");

            text.className = "player-track-text";

            title.className = "player-track-title";
            title.textContent = track.title || track.name || "未知曲目";

            subtitle.className = "player-track-subtitle";
            subtitle.textContent = track.subtitle || "";

            format.className = "player-track-format";
            format.textContent = track.format || "AUDIO";

            text.append(title, subtitle);
            button.append(number, text, format);
            item.append(button);
            fragment.append(item);
            trackButtons.push(button);

            button.addEventListener("click", () => {
                loadTrack(index, true);
                setPlaylistOpen(false);
            });
        });

        ui.trackList.replaceChildren(fragment);
    }

    function updateMediaSession(track) {
        if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") {
            return;
        }

        try {
            const artwork = music.avatar
                ? [{
                    src: new URL(music.avatar, window.location.href).href,
                    sizes: "640x640",
                    type: "image/jpeg"
                }]
                : [];

            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.title || track.name || "未知曲目",
                artist: track.subtitle || "镜子的个人网站",
                album: "镜子的个人网站",
                artwork
            });
        } catch (error) {
            // Media Session 元数据失败不影响播放。
        }
    }

    function setupMediaSession() {
        if (!("mediaSession" in navigator)) {
            return;
        }

        const setHandler = (action, handler) => {
            try {
                navigator.mediaSession.setActionHandler(action, handler);
            } catch (error) {
                // 浏览器可能不支持某个 action。
            }
        };

        setHandler("play", playAudio);
        setHandler("pause", () => audio.pause());
        setHandler("previoustrack", previousTrack);
        setHandler("nexttrack", nextTrack);
        setHandler("stop", () => {
            audio.pause();
            audio.currentTime = 0;
        });
        setHandler("seekbackward", (details) => {
            audio.currentTime = Math.max(0, audio.currentTime - ((details && details.seekOffset) || 5));
        });
        setHandler("seekforward", (details) => {
            const duration = Number.isFinite(audio.duration) ? audio.duration : audio.currentTime + 5;
            audio.currentTime = Math.min(duration, audio.currentTime + ((details && details.seekOffset) || 5));
        });
        setHandler("seekto", (details) => {
            if (details && Number.isFinite(details.seekTime)) {
                audio.currentTime = details.seekTime;
            }
        });
    }

    function syncPlayerSpace() {
        const height = player.hidden ? 0 : Math.ceil(player.getBoundingClientRect().height);
        root.style.setProperty("--player-height", `${height}px`);
    }

    ui.play.addEventListener("click", togglePlay);

    player.querySelectorAll("[data-player-action]").forEach((button) => {
        const action = button.dataset.playerAction;

        if (action === "play") {
            return;
        }

        button.addEventListener("click", () => {
            if (action === "prev") {
                previousTrack();
            } else if (action === "next") {
                nextTrack();
            } else if (action === "shuffle") {
                toggleShuffle();
            } else if (action === "repeat") {
                cycleRepeat();
            }
        });
    });

    ui.mute.addEventListener("click", () => {
        audio.muted = !audio.muted;
        updateVolumeUI();
        savePrefs();
    });

    ui.volume.addEventListener("input", () => {
        audio.muted = false;
        audio.volume = Number(ui.volume.value) / 100;
        updateVolumeUI();
        savePrefs();
    });

    ui.seek.addEventListener("pointerdown", () => {
        seeking = true;
    });

    ui.seek.addEventListener("input", () => {
        seeking = true;
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;

        if (duration > 0) {
            audio.currentTime = (Number(ui.seek.value) / 1000) * duration;
            updateProgress(true);
            updateLyrics(true);
        }

        window.clearTimeout(seekTimer);
        seekTimer = window.setTimeout(() => {
            seeking = false;
        }, 180);
    });

    ui.seek.addEventListener("change", () => {
        seeking = false;
        updateProgress(true);
    });

    window.addEventListener("pointerup", () => {
        if (seeking) {
            seeking = false;
            updateProgress(true);
        }
    });

    ui.listToggle.addEventListener("click", () => {
        setPlaylistOpen(ui.playlist.hidden);
    });

    ui.playlistClose.addEventListener("click", () => {
        setPlaylistOpen(false);
    });

    document.addEventListener("pointerdown", (event) => {
        if (ui.playlist.hidden) {
            return;
        }

        if (!(event.target instanceof Node)) {
            return;
        }

        if (ui.playlist.contains(event.target) || ui.listToggle.contains(event.target)) {
            return;
        }

        setPlaylistOpen(false);
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            setPlaylistOpen(false);
        }
    });

    // 桌面端：每 0.5 秒采样一次频谱，用与背景一致的小粒子高度表示音量。
    const visualizer = document.querySelector(".player-visualizer");
    const visualizerColumns = [];
    const VISUALIZER_COLUMNS = 48;
    const VISUALIZER_ROWS = 6;

    if (visualizer) {
        for (let columnIndex = 0; columnIndex < VISUALIZER_COLUMNS; columnIndex += 1) {
            const column = document.createElement("span");
            const dots = [];
            column.className = "player-viz-col";

            for (let rowIndex = 0; rowIndex < VISUALIZER_ROWS; rowIndex += 1) {
                const dot = document.createElement("b");
                column.appendChild(dot);
                dots.push(dot);
            }

            visualizer.appendChild(column);
            visualizerColumns.push(dots);
        }
    }

    const visualizerQuery = window.matchMedia("(min-width: 900px)");
    let audioContext = null;
    let visualizerAnalyser = null;
    let visualizerData = null;
    let visualizerTimer = 0;

    function resetVisualizer() {
        visualizerColumns.forEach((dots) => {
            dots.forEach((dot) => {
                dot.style.opacity = "0.04";
                dot.style.transform = "scale(0.6)";
            });
        });
    }

    function createVisualizer() {
        if (audioContext || !visualizerColumns.length || !visualizerQuery.matches || !audio) {
            return;
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;

        if (!AudioContextClass) {
            return;
        }

        try {
            audioContext = new AudioContextClass();
            visualizerAnalyser = audioContext.createAnalyser();
            visualizerAnalyser.fftSize = 128;
            visualizerAnalyser.smoothingTimeConstant = 0.78;
            const source = audioContext.createMediaElementSource(audio);
            source.connect(visualizerAnalyser);
            visualizerAnalyser.connect(audioContext.destination);
            visualizerData = new Uint8Array(visualizerAnalyser.frequencyBinCount);
        } catch (error) {
            audioContext = null;
            visualizerAnalyser = null;
            visualizerData = null;

            if (visualizer) {
                visualizer.style.display = "none";
            }
        }
    }

    function drawVisualizer() {
        if (!visualizerAnalyser || !visualizerData || audio.paused) {
            resetVisualizer();
            return;
        }

        visualizerAnalyser.getByteFrequencyData(visualizerData);

        const totalColumns = visualizerColumns.length;
        const binCount = visualizerData.length;

        visualizerColumns.forEach((dots, columnIndex) => {
            const start = Math.floor((columnIndex / totalColumns) * binCount);
            const end = Math.max(start + 1, Math.floor(((columnIndex + 1) / totalColumns) * binCount));
            let sum = 0;

            for (let bin = start; bin < end; bin += 1) {
                sum += visualizerData[bin];
            }

            const average = sum / Math.max(1, end - start);
            const level = Math.pow(average / 255, 1.35);
            const visibleRows = level * VISUALIZER_ROWS;

            dots.forEach((dot, rowIndex) => {
                const fill = Math.max(0, Math.min(1, visibleRows - rowIndex));
                dot.style.opacity = fill > 0 ? String(0.16 + fill * 0.84) : "0.03";
                dot.style.transform = `scale(${fill > 0 ? 1 : 0.6})`;
            });
        });
    }

    function startVisualizer() {
        if (!visualizerQuery.matches) {
            return;
        }

        if (!audioContext) {
            return;
        }

        if (audioContext.state === "suspended") {
            audioContext.resume().catch(() => {});
        }

        if (!visualizerTimer) {
            visualizerTimer = window.setInterval(drawVisualizer, 500);
        }

        drawVisualizer();
    }

    function stopVisualizer() {
        if (visualizerTimer) {
            window.clearInterval(visualizerTimer);
            visualizerTimer = 0;
        }

        resetVisualizer();
    }

    document.addEventListener("pointerdown", () => {
        createVisualizer();

        if (audioContext && audioContext.state === "suspended") {
            audioContext.resume().catch(() => {});
        }
    }, { once: true, passive: true });

    document.addEventListener("keydown", () => {
        createVisualizer();

        if (audioContext && audioContext.state === "suspended") {
            audioContext.resume().catch(() => {});
        }
    }, { once: true });

    visualizerQuery.addEventListener("change", () => {
        if (visualizerQuery.matches && !audio.paused) {
            startVisualizer();
        } else {
            stopVisualizer();
        }
    });

    resetVisualizer();

    audio.addEventListener("play", () => {
        setStatus("");
        updatePlayButton(true);
        updateLyrics(true);
        schedulePreloadNext();
        capturePlayback();
        savePlayback(true);
        startVisualizer();
    });

    audio.addEventListener("pause", () => {
        updatePlayButton(false);
        stopVisualizer();

        // 页面跳转时浏览器可能会先重置媒体，再触发 pause；此时保留最后一次有效快照。
        if (
            !isUnloading &&
            audio.currentTime <= 0.05 &&
            playbackSnapshot &&
            playbackSnapshot.src === (currentTrack && currentTrack.src) &&
            playbackSnapshot.time > 1
        ) {
            return;
        }

        capturePlayback();
        savePlayback(true);
    });

    audio.addEventListener("timeupdate", () => {
        updateLyrics(false);
        updateProgress(false);
        capturePlayback();
        savePlayback(false);
    });

    audio.addEventListener("progress", () => {
        updateProgress(false);
    });

    audio.addEventListener("loadedmetadata", () => {
        const shouldResume = pendingAutoplay;

        if (pendingRestoreTime > 0) {
            const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
            const target = duration > 0
                ? Math.min(pendingRestoreTime, Math.max(0, duration - 0.25))
                : pendingRestoreTime;

            try {
                audio.currentTime = target;
            } catch (error) {
                // 如果这个浏览器暂时不接受 seek，保留从 0 开始。
            }
        }

        pendingRestoreTime = 0;
        pendingAutoplay = false;
        playerReady = true;

        updateProgress(true);
        updateLyrics(true);
        capturePlayback();

        if (shouldResume) {
            playAudio();
        }

        savePlayback(true);
    });

    audio.addEventListener("durationchange", () => {
        updateProgress(true);
    });

    audio.addEventListener("seeked", () => {
        updateProgress(true);
        updateLyrics(true);
        capturePlayback();
        savePlayback(true);
    });

    audio.addEventListener("volumechange", () => {
        updateVolumeUI();
        savePrefs();
    });

    audio.addEventListener("ended", handleEnded);

    audio.addEventListener("error", () => {
        showPlaybackError();
    });

    window.addEventListener("pagehide", () => {
        isUnloading = true;
        savePlayback(true, true);
    });

    window.addEventListener("papermod:save", () => {
        capturePlayback();
        savePlayback(true);
    });

    window.addEventListener("beforeunload", () => {
        isUnloading = true;
        savePlayback(true, true);
    });

    window.addEventListener("pageshow", () => {
        isUnloading = false;
    });

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            savePlayback(true, true);
        }
    });

    const savedPlayback = readStorage("sessionStorage", PLAYBACK_KEY);
    let startIndex = 0;
    let restoreState = null;

    if (savedPlayback && typeof savedPlayback.src === "string") {
        const savedIndex = tracks.findIndex((track) => track.src === savedPlayback.src);

        if (savedIndex >= 0) {
            startIndex = savedIndex;
            restoreState = {
                time: Number(savedPlayback.time) || 0,
                playing: Boolean(savedPlayback.playing)
            };
        }
    }

    buildTrackList();
    updateVolumeUI();
    updateShuffleUI();
    updateRepeatUI();
    setupMediaSession();
    loadTrack(startIndex, false, restoreState);
    syncPlayerSpace();

    if (window.ResizeObserver) {
        new ResizeObserver(syncPlayerSpace).observe(player);
    }

    window.addEventListener("resize", syncPlayerSpace);
    window.requestAnimationFrame(syncPlayerSpace);
})();
