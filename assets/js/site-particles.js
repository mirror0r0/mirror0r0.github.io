/* ==========================================================================
   PaperMod · Tidewater particles
   20px 正六边形点阵：
   - 鼠标吸附 / 左键排斥 / 右键增强；
   - 每 4 帧随机挑选局部 2 或 3 颗粒子做换位、轮换动画；
   - 换位会轻微牵引附近几颗粒子。
   配色从 custom.css 的 CSS 变量读取。
   ========================================================================== */

(() => {
    "use strict";

    if (window.__papermodTideParticles) {
        return;
    }
    window.__papermodTideParticles = true;

    const DESKTOP_SPACING = 20;
    const COMPACT_SPACING = 40;
    let spacing = DESKTOP_SPACING;
    let rowHeight = spacing * 0.8660254037844386; // sqrt(3) / 2
    const LINK_RADIUS = 165;
    const LINK_RADIUS_SQ = LINK_RADIUS * LINK_RADIUS;

    const ATTRACT = 0.85;
    const REPEL = -1.2;
    const RIGHT_BOOST = 2.2;
    const SPRING = 0.012;
    const SPRING_GROWTH = 0.00008;
    const DAMPING = 0.90;
    const MAX_OFFSET = 145;
    const MAX_SPEED = 4.5;

    const SWAP_EVERY_FRAMES = 4;
    const SWAP_RADIUS = 104;
    const SWAP_MIN_DURATION = 12;
    const SWAP_MAX_DURATION = 20;
    const SWAP_COOLDOWN = 26;
    const SWAP_NUDGE_RADIUS = 70;
    const SWAP_NUDGE_COUNT = 5;

    const html = document.documentElement;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: true });

    if (!ctx) {
        return;
    }

    canvas.id = "particle-bg";
    canvas.setAttribute("aria-hidden", "true");
    canvas.setAttribute("role", "presentation");
    document.body.prepend(canvas);

    const mouse = {
        x: 0,
        y: 0,
        active: false,
        left: false,
        right: false
    };

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let motionEnabled = !motionQuery.matches;
    let compact = window.innerWidth <= 899;

    const touch = {
        x: 0,
        y: 0,
        active: false
    };

    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles = [];
    let raf = 0;
    let lastFrame = 0;
    let frameCount = 0;
    let resizeTimer = 0;
    let compactRaf = 0;
    let lineCanvas = null;
    let lineCtx = null;
    let fxCanvas = null;
    let fxCtx = null;
    let maskCanvas = null;

    let colors = {
        dot: "rgba(138, 174, 189, 0.34)",
        active: "rgba(61, 107, 123, 0.82)",
        glow: "rgba(168, 197, 209, 0.22)"
    };

    function readPalette() {
        const styles = getComputedStyle(html);
        colors = {
            dot: styles.getPropertyValue("--particle-dot").trim() || colors.dot,
            active: styles.getPropertyValue("--particle-active").trim() || colors.active,
            glow: styles.getPropertyValue("--particle-glow").trim() || colors.glow
        };
    }

    // ----------------------------------------------------------------------
    // DELTARUNE：左键让粒子汇聚成红心；右键扩散成内凹弧四角星并发光
    // ----------------------------------------------------------------------
    const SHAPE_CAPTURE = 250;
    const HEART_SIZE = 105;
    const STAR_SIZE = 118;
    const SHAPE_PULL = 0.22;
    const SHAPE_DAMP = 0.82;
    const shapePoint = { x: 0, y: 0 };

    function shapeModeActive() {
        if (html.dataset.skin !== "deltarune" || !mouse.active) {
            return null;
        }

        if (mouse.left) {
            return "heart";
        }

        if (mouse.right) {
            return "star";
        }

        return null;
    }

    // 心形：采样经典心形参数方程，按角度取最大半径并归一化后查表。
    // 空的角度分桶做环向线性插值，避免目标半径塌成 0。
    const heartTable = (() => {
        const N = 360;
        const M = 20000;
        const bins = new Float32Array(N);
        const hit = new Uint8Array(N);
        const raw = [];
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        for (let i = 0; i < M; i += 1) {
            const t = (i / M) * Math.PI * 2;
            const s = Math.sin(t);
            const x = 16 * s * s * s;
            const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
            raw.push(x, y);
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }

        const midX = (minX + maxX) / 2;
        const midY = (minY + maxY) / 2;
        let maxR = 0;

        for (let i = 0; i < raw.length; i += 2) {
            const x = raw[i] - midX;
            const y = -(raw[i + 1] - midY);
            const ang = Math.atan2(y, x);
            const r = Math.hypot(x, y);
            let b = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * N);
            b = ((b % N) + N) % N;

            if (r > bins[b]) {
                bins[b] = r;
                hit[b] = 1;
            }

            if (r > maxR) maxR = r;
        }

        for (let i = 0; i < N; i += 1) {
            if (hit[i]) continue;

            let back = 1;
            let fwd = 1;
            while (back < N && !hit[((i - back) % N + N) % N]) back += 1;
            while (fwd < N && !hit[((i + fwd) % N + N) % N]) fwd += 1;

            if (back >= N || fwd >= N) {
                bins[i] = 0;
                continue;
            }

            const bIdx = ((i - back) % N + N) % N;
            const fIdx = ((i + fwd) % N + N) % N;
            const t = back / (back + fwd);
            bins[i] = bins[bIdx] * (1 - t) + bins[fIdx] * t;
            hit[i] = 1;
        }

        for (let i = 0; i < N; i += 1) {
            bins[i] /= maxR || 1;
        }

        return bins;
    })();

    function shapeTarget(mode, ang) {
        if (mode === "heart") {
            const N = heartTable.length;
            let b = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * N);
            b = ((b % N) + N) % N;
            const hr = heartTable[b] * HEART_SIZE;
            shapePoint.x = Math.cos(ang) * hr;
            shapePoint.y = Math.sin(ang) * hr;
            return;
        }

        // 内凹弧四角星：星形线（astroid）的极坐标半径，四角沿坐标轴。
        const c = Math.abs(Math.cos(ang));
        const s = Math.abs(Math.sin(ang));
        const denom = Math.pow(c, 2 / 3) + Math.pow(s, 2 / 3);
        const r = STAR_SIZE / Math.pow(denom, 1.5);
        shapePoint.x = Math.cos(ang) * r;
        shapePoint.y = Math.sin(ang) * r;
    }

    function drawShapeLayer(mode) {
        const heart = mode === "heart";

        for (let pass = 0; pass < 3; pass += 1) {
            if (heart) {
                ctx.fillStyle = pass === 0
                    ? "rgba(255, 60, 60, 0.16)"
                    : pass === 1
                        ? "rgba(255, 40, 50, 0.50)"
                        : "rgba(255, 34, 44, 0.96)";
            } else {
                ctx.fillStyle = pass === 0
                    ? "rgba(150, 255, 240, 0.16)"
                    : pass === 1
                        ? "rgba(190, 255, 250, 0.50)"
                        : "rgba(255, 255, 255, 0.98)";
            }

            const scale = pass === 0 ? 3.2 : pass === 1 ? 1.7 : 1.15;

            for (let i = 0; i < particles.length; i += 1) {
                const particle = particles[i];

                if (particle.shape === mode) {
                    drawDot(particle.x, particle.y, particle.r * scale);
                }
            }
        }
    }

    function hash(row, col) {
        let value = (row * 374761393 + col * 668265263) | 0;
        value = (value ^ (value >>> 13)) * 1274126177;
        return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
    }

    function buildParticles() {
        const cols = Math.ceil(width / spacing) + 2;
        const rows = Math.ceil(height / rowHeight) + 2;
        const radiusBase = compact ? 1.1 : 0.85;
        const radiusRange = compact ? 0.9 : 0.7;
        particles = [];

        for (let row = -1; row <= rows; row += 1) {
            const offset = (row & 1) ? spacing * 0.5 : 0;
            const y = row * rowHeight;

            for (let col = -1; col <= cols; col += 1) {
                const x = col * spacing + offset;
                const seed = hash(row, col);

                particles.push({
                    hx: x,
                    hy: y,
                    x,
                    y,
                    vx: 0,
                    vy: 0,
                    r: radiusBase + seed * radiusRange,
                    swap: null,
                    cooldown: 0
                });
            }
        }
    }

    function buildLineLayer() {
        if (!compact) {
            lineCanvas = null;
            lineCtx = null;
            return;
        }

        if (!lineCanvas) {
            lineCanvas = document.createElement("canvas");
            lineCtx = lineCanvas.getContext("2d");
        }

        if (!lineCtx) {
            return;
        }

        lineCanvas.width = canvas.width;
        lineCanvas.height = canvas.height;
        lineCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        lineCtx.clearRect(0, 0, width, height);
        lineCtx.strokeStyle = colors.active;
        lineCtx.lineWidth = 0.8;
        lineCtx.globalAlpha = 0.34;

        const maxDistance = spacing * 1.28;
        const maxDistanceSq = maxDistance * maxDistance;

        for (let i = 0; i < particles.length; i += 1) {
            const first = particles[i];

            for (let j = i + 1; j < particles.length; j += 1) {
                const second = particles[j];
                const dx = second.x - first.x;
                const dy = second.y - first.y;

                if (dx * dx + dy * dy > maxDistanceSq) {
                    continue;
                }

                lineCtx.beginPath();
                lineCtx.moveTo(first.x, first.y);
                lineCtx.lineTo(second.x, second.y);
                lineCtx.stroke();
            }
        }

        lineCtx.globalAlpha = 1;

        const size = 340;

        if (!fxCanvas) {
            fxCanvas = document.createElement("canvas");
            fxCtx = fxCanvas.getContext("2d");
        }

        fxCanvas.width = Math.round(size * dpr);
        fxCanvas.height = Math.round(size * dpr);

        if (!maskCanvas) {
            maskCanvas = document.createElement("canvas");
        }

        maskCanvas.width = Math.round(size * dpr);
        maskCanvas.height = Math.round(size * dpr);

        const maskCtx = maskCanvas.getContext("2d");

        if (!maskCtx) {
            return;
        }

        maskCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        maskCtx.clearRect(0, 0, size, size);

        const gradient = maskCtx.createRadialGradient(
            size / 2, size / 2, 8,
            size / 2, size / 2, size / 2
        );
        gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
        gradient.addColorStop(0.42, "rgba(255, 255, 255, 0.72)");
        gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
        maskCtx.fillStyle = gradient;
        maskCtx.fillRect(0, 0, size, size);
    }

    function resizeCanvas() {
        width = Math.max(1, window.innerWidth);
        height = Math.max(1, window.innerHeight);
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        compact = width <= 899;
        spacing = compact ? COMPACT_SPACING : DESKTOP_SPACING;
        rowHeight = spacing * 0.8660254037844386;

        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        buildParticles();
        readPalette();
        buildLineLayer();
        resetAll();

        if (raf) {
            window.cancelAnimationFrame(raf);
            raf = 0;
        }

        draw();
        html.classList.add("particles-ready");

        if (!compact) {
            ensureLoop();
        }
    }

    function resetParticle(particle) {
        particle.x = particle.hx;
        particle.y = particle.hy;
        particle.vx = 0;
        particle.vy = 0;
        particle.swap = null;
        particle.cooldown = 0;
    }

    function resetAll() {
        for (let i = 0; i < particles.length; i += 1) {
            resetParticle(particles[i]);
        }
    }

    function easeInOutCubic(t) {
        return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function canSwap(particle) {
        return Boolean(particle) && !particle.swap && particle.cooldown <= 0;
    }

    function isOnScreen(particle) {
        return (
            particle.x >= 0 &&
            particle.x <= width &&
            particle.y >= 0 &&
            particle.y <= height
        );
    }

    function pickLocalParticles(origin, count) {
        const candidates = [];
        const radiusSq = SWAP_RADIUS * SWAP_RADIUS;

        for (let i = 0; i < particles.length; i += 1) {
            const particle = particles[i];

            if (particle === origin || !canSwap(particle) || !isOnScreen(particle)) {
                continue;
            }

            const dx = particle.x - origin.x;
            const dy = particle.y - origin.y;

            if (dx * dx + dy * dy <= radiusSq) {
                candidates.push(particle);
            }
        }

        const picked = [];

        while (picked.length < count && candidates.length > 0) {
            const index = Math.floor(Math.random() * candidates.length);
            picked.push(candidates.splice(index, 1)[0]);
        }

        return picked;
    }

    function startParticleSwap(particle, toX, toY, duration) {
        const dx = toX - particle.x;
        const dy = toY - particle.y;
        const length = Math.hypot(dx, dy) || 1;

        particle.swap = {
            fromX: particle.x,
            fromY: particle.y,
            toX,
            toY,
            elapsed: 0,
            duration,
            arc: (Math.random() * 2 - 1) * Math.min(7, 2 + length * 0.035),
            perpX: -dy / length,
            perpY: dx / length
        };
        particle.vx = 0;
        particle.vy = 0;
        particle.cooldown = 0;
    }

    function nudgeNearbyParticles(centerX, centerY, excluded) {
        const radiusSq = SWAP_NUDGE_RADIUS * SWAP_NUDGE_RADIUS;
        const start = Math.floor(Math.random() * particles.length);
        let nudged = 0;

        for (let step = 0; step < particles.length && nudged < SWAP_NUDGE_COUNT; step += 1) {
            const particle = particles[(start + step) % particles.length];

            if (excluded.includes(particle) || !canSwap(particle)) {
                continue;
            }

            const dx = centerX - particle.x;
            const dy = centerY - particle.y;
            const distanceSq = dx * dx + dy * dy;

            if (distanceSq === 0 || distanceSq > radiusSq) {
                continue;
            }

            const distance = Math.sqrt(distanceSq);
            const strength = 0.22 * (1 - distance / SWAP_NUDGE_RADIUS);

            // 朝换位中心轻拉，并带一点切向扰动。
            particle.vx += (dx / distance) * strength + (-dy / distance) * strength * 0.35;
            particle.vy += (dy / distance) * strength + (dx / distance) * strength * 0.35;
            nudged += 1;
        }
    }

    function triggerParticleSwap() {
        if (particles.length < 2) {
            return;
        }

        let origin = null;

        for (let attempt = 0; attempt < 8; attempt += 1) {
            const candidate = particles[Math.floor(Math.random() * particles.length)];

            if (canSwap(candidate) && isOnScreen(candidate)) {
                origin = candidate;
                break;
            }
        }

        if (!origin) {
            return;
        }

        const useThree = Math.random() < 0.38;
        const others = pickLocalParticles(origin, useThree ? 2 : 1);

        if (others.length < (useThree ? 2 : 1)) {
            return;
        }

        const group = [origin, ...others];
        const centerX = group.reduce((sum, particle) => sum + particle.x, 0) / group.length;
        const centerY = group.reduce((sum, particle) => sum + particle.y, 0) / group.length;
        const duration = SWAP_MIN_DURATION + Math.random() * (SWAP_MAX_DURATION - SWAP_MIN_DURATION);

        nudgeNearbyParticles(centerX, centerY, group);

        if (useThree) {
            const targets = group.map((particle) => ({ x: particle.x, y: particle.y }));

            startParticleSwap(group[0], targets[1].x, targets[1].y, duration);
            startParticleSwap(group[1], targets[2].x, targets[2].y, duration);
            startParticleSwap(group[2], targets[0].x, targets[0].y, duration);
            return;
        }

        const first = group[0];
        const second = group[1];
        const firstX = first.x;
        const firstY = first.y;
        const secondX = second.x;
        const secondY = second.y;

        startParticleSwap(first, secondX, secondY, duration);
        startParticleSwap(second, firstX, firstY, duration);
    }

    function update(dt) {
        const shapeMode = shapeModeActive();
        const sign = !shapeMode && mouse.left ? REPEL : 1;
        const boost = !shapeMode && mouse.right ? RIGHT_BOOST : 1;
        const damping = Math.pow(DAMPING, dt);
        const shapeDamp = Math.pow(SHAPE_DAMP, dt);
        const shapePull = SHAPE_PULL * dt;

        for (let i = 0; i < particles.length; i += 1) {
            const particle = particles[i];
            particle.shape = null;

            if (particle.swap) {
                const swap = particle.swap;
                swap.elapsed += dt;

                const progress = Math.min(1, swap.elapsed / swap.duration);
                const eased = easeInOutCubic(progress);
                const arc = Math.sin(Math.PI * progress) * swap.arc;

                particle.x = swap.fromX
                    + (swap.toX - swap.fromX) * eased
                    + swap.perpX * arc;
                particle.y = swap.fromY
                    + (swap.toY - swap.fromY) * eased
                    + swap.perpY * arc;
                particle.vx = 0;
                particle.vy = 0;

                if (progress >= 1) {
                    particle.x = swap.toX;
                    particle.y = swap.toY;
                    particle.swap = null;
                    particle.cooldown = SWAP_COOLDOWN;
                }

                continue;
            }

            if (particle.cooldown > 0) {
                particle.cooldown = Math.max(0, particle.cooldown - dt);
            }

            if (shapeMode) {
                const sdx = mouse.x - particle.x;
                const sdy = mouse.y - particle.y;

                if (sdx * sdx + sdy * sdy < SHAPE_CAPTURE * SHAPE_CAPTURE) {
                    // 用「从鼠标指向粒子」的方向；若用鼠标-粒子方向，粒子跨过光标时目标会翻转而被困在中心。
                    const ang = Math.atan2(-sdy, -sdx);
                    shapeTarget(shapeMode, ang);

                    const tx = mouse.x + shapePoint.x;
                    const ty = mouse.y + shapePoint.y;

                    particle.vx = (particle.vx + (tx - particle.x) * shapePull) * shapeDamp;
                    particle.vy = (particle.vy + (ty - particle.y) * shapePull) * shapeDamp;
                    particle.x += particle.vx * dt;
                    particle.y += particle.vy * dt;
                    particle.shape = shapeMode;
                    continue;
                }
            }

            if (mouse.active) {
                const dx = mouse.x - particle.x;
                const dy = mouse.y - particle.y;
                const distanceSq = dx * dx + dy * dy;

                if (distanceSq > 1 && distanceSq < LINK_RADIUS_SQ) {
                    const distance = Math.sqrt(distanceSq);
                    const falloff = 1 - distance / LINK_RADIUS;
                    const force = ATTRACT * falloff * falloff * sign * boost * dt;

                    particle.vx += (dx / distance) * force;
                    particle.vy += (dy / distance) * force;
                }
            }

            const offsetX = particle.x - particle.hx;
            const offsetY = particle.y - particle.hy;
            const offset = Math.hypot(offsetX, offsetY);

            if (offset > 0.001) {
                // 距离原点越远，回弹力越大；外圈再多一点，避免粒子被鼠标拖走。
                const spring = (SPRING + Math.min(offset, MAX_OFFSET) * SPRING_GROWTH) * dt;
                particle.vx -= offsetX * spring;
                particle.vy -= offsetY * spring;
            }

            particle.vx *= damping;
            particle.vy *= damping;

            const speed = Math.hypot(particle.vx, particle.vy);
            if (speed > MAX_SPEED) {
                const scale = MAX_SPEED / speed;
                particle.vx *= scale;
                particle.vy *= scale;
            }

            particle.x += particle.vx * dt;
            particle.y += particle.vy * dt;

            const nextOffsetX = particle.x - particle.hx;
            const nextOffsetY = particle.y - particle.hy;
            const nextOffset = Math.hypot(nextOffsetX, nextOffsetY);

            if (nextOffset > MAX_OFFSET) {
                const scale = MAX_OFFSET / nextOffset;
                particle.x = particle.hx + nextOffsetX * scale;
                particle.y = particle.hy + nextOffsetY * scale;
                particle.vx *= 0.45;
                particle.vy *= 0.45;
            }

            if (
                Math.abs(particle.x - particle.hx) < 0.06 &&
                Math.abs(particle.y - particle.hy) < 0.06 &&
                Math.abs(particle.vx) + Math.abs(particle.vy) < 0.05
            ) {
                resetParticle(particle);
            }
        }
    }

    function drawDot(x, y, radius) {
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    function drawTouchLines() {
        if (!compact || !touch.active || !lineCanvas || !fxCanvas || !fxCtx || !maskCanvas) {
            return;
        }

        const size = 340;
        const half = size / 2;
        const sx = Math.min(Math.max(0, touch.x - half), Math.max(0, width - size));
        const sy = Math.min(Math.max(0, touch.y - half), Math.max(0, height - size));
        const sourceX = Math.round(sx * dpr);
        const sourceY = Math.round(sy * dpr);
        const sourceSize = Math.round(size * dpr);

        fxCtx.setTransform(1, 0, 0, 1, 0, 0);
        fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
        fxCtx.drawImage(
            lineCanvas,
            sourceX,
            sourceY,
            sourceSize,
            sourceSize,
            0,
            0,
            sourceSize,
            sourceSize
        );
        fxCtx.globalCompositeOperation = "destination-in";
        fxCtx.drawImage(maskCanvas, 0, 0);
        fxCtx.globalCompositeOperation = "source-over";

        ctx.drawImage(fxCanvas, sx, sy, size, size);
    }

    function draw() {
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = colors.dot;

        for (let i = 0; i < particles.length; i += 1) {
            const particle = particles[i];
            drawDot(particle.x, particle.y, particle.r);
        }

        if (compact) {
            drawTouchLines();
            return;
        }

        const active = [];

        ctx.fillStyle = colors.dot;

        for (let i = 0; i < particles.length; i += 1) {
            const particle = particles[i];

            if (mouse.active) {
                const dx = mouse.x - particle.x;
                const dy = mouse.y - particle.y;
                const distanceSq = dx * dx + dy * dy;

                if (distanceSq < LINK_RADIUS_SQ) {
                    const strength = Math.pow(1 - Math.sqrt(distanceSq) / LINK_RADIUS, 1.35);
                    active.push({ particle, strength });
                }
            }
        }

        if (active.length > 0) {
            ctx.fillStyle = colors.glow;

            for (let i = 0; i < active.length; i += 1) {
                const item = active[i];
                const particle = item.particle;

                ctx.globalAlpha = 0.08 + item.strength * 0.45;
                drawDot(particle.x, particle.y, particle.r * (2.0 + item.strength * 1.6));
            }

            ctx.fillStyle = colors.active;

            for (let i = 0; i < active.length; i += 1) {
                const item = active[i];
                const particle = item.particle;

                ctx.globalAlpha = 0.35 + item.strength * 0.65;
                drawDot(particle.x, particle.y, particle.r * (1 + item.strength * 0.35));
            }

            ctx.globalAlpha = 1;
        }

        const shapeMode = shapeModeActive();

        if (shapeMode) {
            drawShapeLayer(shapeMode);
        }
    }

    function drawCompact() {
        if (!compact || compactRaf) {
            return;
        }

        compactRaf = window.requestAnimationFrame(() => {
            compactRaf = 0;
            draw();
        });
    }

    function tick(now) {
        raf = 0;

        if (!motionEnabled || document.hidden || compact) {
            return;
        }

        if (!lastFrame) {
            lastFrame = now;
        }

        const dt = Math.min(Math.max((now - lastFrame) / 16.6667, 0.25), 2);
        lastFrame = now;

        frameCount += 1;

        if (frameCount % SWAP_EVERY_FRAMES === 0) {
            triggerParticleSwap();
        }

        update(dt);
        draw();

        raf = window.requestAnimationFrame(tick);
    }

    function ensureLoop() {
        if (!motionEnabled || document.hidden || compact) {
            return;
        }

        if (!raf) {
            lastFrame = 0;
            raf = window.requestAnimationFrame(tick);
        }
    }

    function wake() {
        if (!motionEnabled) {
            return;
        }

        if (compact) {
            drawCompact();
            return;
        }

        ensureLoop();
    }

    function deactivate() {
        mouse.active = false;
        mouse.left = false;
        mouse.right = false;
        touch.active = false;
        wake();
    }

    function onPointerMove(event) {
        if (!motionEnabled) {
            return;
        }

        if (compact) {
            touch.x = event.clientX;
            touch.y = event.clientY;
            touch.active = true;
            wake();
            return;
        }

        if (event.pointerType === "touch") {
            return;
        }

        mouse.x = event.clientX;
        mouse.y = event.clientY;
        mouse.active = true;

        if (event.pointerType === "mouse") {
            mouse.left = (event.buttons & 1) !== 0;
            mouse.right = (event.buttons & 2) !== 0;
        }

        wake();
    }

    function onPointerDown(event) {
        if (!motionEnabled) {
            return;
        }

        if (compact) {
            touch.x = event.clientX;
            touch.y = event.clientY;
            touch.active = true;
            wake();
            return;
        }

        if (event.pointerType === "touch") {
            mouse.x = event.clientX;
            mouse.y = event.clientY;
            mouse.active = true;
            mouse.left = false;
            mouse.right = false;
            wake();
            return;
        }

        mouse.x = event.clientX;
        mouse.y = event.clientY;
        mouse.active = true;

        if (event.pointerType === "mouse") {
            mouse.left = (event.buttons & 1) !== 0;
            mouse.right = (event.buttons & 2) !== 0;
        }

        wake();
    }

    function onPointerUp(event) {
        if (compact) {
            touch.active = false;
            wake();
            return;
        }

        if (event.pointerType === "touch") {
            deactivate();
            return;
        }

        if (event.pointerType === "mouse") {
            mouse.left = false;
            mouse.right = false;
        }

        wake();
    }

    function onPointerOut(event) {
        if (compact) {
            if (!event.relatedTarget) {
                touch.active = false;
                wake();
            }
            return;
        }

        if (event.pointerType !== "touch" && !event.relatedTarget) {
            deactivate();
        }
    }

    function onVisibilityChange() {
        if (document.hidden) {
            if (raf) {
                window.cancelAnimationFrame(raf);
                raf = 0;
            }
            return;
        }

        wake();
    }

    function onMotionPreferenceChange(event) {
        motionEnabled = !event.matches;

        if (!motionEnabled) {
            if (raf) {
                window.cancelAnimationFrame(raf);
                raf = 0;
            }
            mouse.active = false;
            mouse.left = false;
            mouse.right = false;
            resetAll();
            draw();
            return;
        }

        wake();
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", deactivate, { passive: true });
    window.addEventListener("pointerout", onPointerOut, { passive: true });
    window.addEventListener("blur", deactivate);
    document.addEventListener("mouseleave", deactivate);
    document.addEventListener("visibilitychange", onVisibilityChange);

    if (motionQuery.addEventListener) {
        motionQuery.addEventListener("change", onMotionPreferenceChange);
    } else if (motionQuery.addListener) {
        motionQuery.addListener(onMotionPreferenceChange);
    }

    // 切换 PaperMod 的明暗主题时，重新读取粒子颜色。
    new MutationObserver(() => {
        readPalette();

        if (compact) {
            buildLineLayer();
        }

        if (!raf) {
            draw();
        }
    }).observe(html, {
        attributes: true,
        attributeFilter: ["data-theme", "data-skin"]
    });

    window.addEventListener("resize", () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
            resizeCanvas();
            wake();
        }, 120);
    });

    resizeCanvas();
    ensureLoop();
})();
