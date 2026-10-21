/* ==========================================================================
   PaperMod · Tidewater particles
   轻量 Canvas 背景：20px 正六边形点阵，带鼠标吸附 / 左键排斥 / 右键增强。
   仅负责绘制；配色从 custom.css 的 CSS 变量读取。
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
    const IDLE_FRAMES = 150;

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
    let idleFrames = 0;
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
                    r: 0.85 + seed * 0.7
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
    }

    function resetAll() {
        for (let i = 0; i < particles.length; i += 1) {
            resetParticle(particles[i]);
        }
    }

    function update(dt) {
        let energy = 0;
        const sign = mouse.left ? REPEL : 1;
        const boost = mouse.right ? RIGHT_BOOST : 1;
        const damping = Math.pow(DAMPING, dt);

        for (let i = 0; i < particles.length; i += 1) {
            const particle = particles[i];

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

            energy += Math.abs(particle.vx) + Math.abs(particle.vy);
        }

        return energy;
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

        const energy = update(dt);
        draw();

        if (energy > 0.02) {
            idleFrames = 0;
        } else {
            idleFrames += 1;
        }

        if (idleFrames > IDLE_FRAMES) {
            idleFrames = 0;
            return;
        }

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

        idleFrames = 0;
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
})();
