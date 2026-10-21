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

    const SPACING = 20;
    const ROW_HEIGHT = SPACING * 0.8660254037844386; // sqrt(3) / 2
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

    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles = [];
    let raf = 0;
    let lastFrame = 0;
    let frameCount = 0;
    let resizeTimer = 0;

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

    function hash(row, col) {
        let value = (row * 374761393 + col * 668265263) | 0;
        value = (value ^ (value >>> 13)) * 1274126177;
        return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
    }

    function buildParticles() {
        const cols = Math.ceil(width / SPACING) + 2;
        const rows = Math.ceil(height / ROW_HEIGHT) + 2;
        particles = [];

        for (let row = -1; row <= rows; row += 1) {
            const offset = (row & 1) ? SPACING * 0.5 : 0;
            const y = row * ROW_HEIGHT;

            for (let col = -1; col <= cols; col += 1) {
                const x = col * SPACING + offset;
                const seed = hash(row, col);

                particles.push({
                    hx: x,
                    hy: y,
                    x,
                    y,
                    vx: 0,
                    vy: 0,
                    r: 0.85 + seed * 0.7,
                    swap: null,
                    cooldown: 0
                });
            }
        }
    }

    function resizeCanvas() {
        width = Math.max(1, window.innerWidth);
        height = Math.max(1, window.innerHeight);
        dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        buildParticles();
        readPalette();
        draw(performance.now());
        html.classList.add("particles-ready");
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
        const sign = mouse.left ? REPEL : 1;
        const boost = mouse.right ? RIGHT_BOOST : 1;
        const damping = Math.pow(DAMPING, dt);

        for (let i = 0; i < particles.length; i += 1) {
            const particle = particles[i];

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

    function draw() {
        ctx.clearRect(0, 0, width, height);

        const active = [];
        ctx.fillStyle = colors.dot;

        for (let i = 0; i < particles.length; i += 1) {
            const particle = particles[i];

            if (mouse.active) {
                const dx = mouse.x - particle.x;
                const dy = mouse.y - particle.y;

                if (dx * dx + dy * dy < LINK_RADIUS_SQ) {
                    active.push(particle);
                    continue;
                }
            }

            drawDot(particle.x, particle.y, particle.r);
        }

        if (active.length > 0) {
            ctx.fillStyle = colors.glow;
            for (let i = 0; i < active.length; i += 1) {
                drawDot(active[i].x, active[i].y, active[i].r * 3.1);
            }

            ctx.fillStyle = colors.active;
            for (let i = 0; i < active.length; i += 1) {
                drawDot(active[i].x, active[i].y, active[i].r * 1.25);
            }
        }
    }

    function tick(now) {
        raf = 0;

        if (!motionEnabled || document.hidden) {
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
        if (!motionEnabled || document.hidden) {
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

        ensureLoop();
    }

    function deactivate() {
        mouse.active = false;
        mouse.left = false;
        mouse.right = false;
        wake();
    }

    function onPointerMove(event) {
        if (!motionEnabled || event.pointerType === "touch") {
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
        if (!raf) {
            draw();
        }
    }).observe(html, {
        attributes: true,
        attributeFilter: ["data-theme"]
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
