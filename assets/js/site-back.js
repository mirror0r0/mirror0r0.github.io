/* ==========================================================================
   PaperMod · 子页面粒子返回按钮
   鼠标靠近时，小粒子汇聚成左箭头；离开后散回原位。
   ========================================================================== */

(() => {
    "use strict";

    const logo = document.querySelector(".header .logo");
    const isHome = Boolean(document.querySelector(
        ".home-intro-card, .main > .first-entry, .main > .home-info"
    ));
    const article = document.querySelector(".post-single");

    if (isHome || !logo || document.getElementById("back-orbit")) {
        return;
    }

    const button = document.createElement("button");
    button.id = "back-orbit";
    button.className = "back-orbit";
    button.type = "button";
    button.setAttribute("aria-label", "返回上一页");
    button.title = "返回上一页";
    button.innerHTML = [
        '<canvas class="back-orbit-canvas" aria-hidden="true"></canvas>',
        '<span class="back-orbit-glyph" aria-hidden="true">←</span>'
    ].join("");

    logo.prepend(button);

    setupSpotlight();

    const canvas = button.querySelector(".back-orbit-canvas");
    const ctx = canvas && canvas.getContext("2d");
    const SIZE = 40;
    const CENTER = SIZE / 2;
    const NEAR_DISTANCE = 120;
    const LIT_DISTANCE = 52;

    if (!ctx) {
        button.classList.add("no-canvas");
        button.addEventListener("click", goBack);
        return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(SIZE * dpr);
    canvas.height = Math.round(SIZE * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    function pointOnLine(x1, y1, x2, y2, t) {
        return {
            x: x1 + (x2 - x1) * t,
            y: y1 + (y2 - y1) * t
        };
    }

    const arrow = [];

    for (let i = 0; i < 8; i += 1) {
        arrow.push(pointOnLine(10, 22, 20, 12, i / 7));
    }

    for (let i = 1; i < 8; i += 1) {
        arrow.push(pointOnLine(10, 22, 20, 32, i / 7));
    }

    for (let i = 0; i < 11; i += 1) {
        arrow.push(pointOnLine(20, 22, 35, 22, i / 10));
    }

    const particles = arrow.map((target, index) => {
        const angle = Math.random() * Math.PI * 2;
        const radius = 8 + Math.random() * 11;

        return {
            x: CENTER + Math.cos(angle) * radius,
            y: CENTER + Math.sin(angle) * radius,
            homeX: CENTER + Math.cos(angle) * radius,
            homeY: CENTER + Math.sin(angle) * radius,
            targetX: target.x,
            targetY: target.y,
            radius: 0.85 + (index % 4) * 0.16
        };
    });

    let near = false;
    let lit = false;
    let raf = 0;
    let lastFrame = 0;
    let palette = readPalette();

    function readPalette() {
        const styles = getComputedStyle(document.documentElement);

        return {
            dot: styles.getPropertyValue("--particle-dot").trim() || "rgba(138, 174, 189, 0.34)",
            active: styles.getPropertyValue("--particle-active").trim() || "rgba(61, 107, 123, 0.82)",
            glow: styles.getPropertyValue("--particle-glow").trim() || "rgba(168, 197, 209, 0.22)"
        };
    }

    function draw() {
        ctx.clearRect(0, 0, SIZE, SIZE);

        if (lit) {
            ctx.fillStyle = palette.glow;
            ctx.globalAlpha = 0.9;

            for (const particle of particles) {
                const radius = particle.radius * 2.8;
                ctx.fillRect(particle.x - radius, particle.y - radius, radius * 2, radius * 2);
            }
        }

        ctx.fillStyle = near || lit ? palette.active : palette.dot;
        ctx.globalAlpha = near || lit ? 0.95 : 0.62;

        for (const particle of particles) {
            const radius = particle.radius;
            ctx.fillRect(particle.x - radius, particle.y - radius, radius * 2, radius * 2);
        }

        ctx.globalAlpha = 1;
    }

    function tick(now) {
        raf = 0;

        if (!lastFrame) {
            lastFrame = now;
        }

        const dt = Math.min(Math.max((now - lastFrame) / 16.6667, 0.25), 2);
        lastFrame = now;
        const response = 1 - Math.pow(0.82, dt);
        let moving = false;

        for (const particle of particles) {
            const targetX = near ? particle.targetX : particle.homeX;
            const targetY = near ? particle.targetY : particle.homeY;

            particle.x += (targetX - particle.x) * response;
            particle.y += (targetY - particle.y) * response;

            if (Math.abs(targetX - particle.x) + Math.abs(targetY - particle.y) > 0.08) {
                moving = true;
            }
        }

        draw();

        if (near || lit || moving) {
            raf = window.requestAnimationFrame(tick);
        } else {
            lastFrame = 0;
        }
    }

    function ensureLoop() {
        if (!raf) {
            lastFrame = 0;
            raf = window.requestAnimationFrame(tick);
        }
    }

    function setNear(value) {
        if (near === value) {
            return;
        }

        near = value;
        button.classList.toggle("is-near", near);
        ensureLoop();
    }

    function setLit(value) {
        if (lit === value) {
            return;
        }

        lit = value;
        button.classList.toggle("is-lit", lit);
        ensureLoop();
    }

    function updateProximity(event) {
        const rect = button.getBoundingClientRect();

        if (!rect.width) {
            return;
        }

        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const distance = Math.hypot(event.clientX - centerX, event.clientY - centerY);

        setNear(distance < NEAR_DISTANCE);
        setLit(distance < LIT_DISTANCE);
    }

    function resetProximity() {
        setNear(false);
        setLit(false);
    }

    function setupSpotlight() {
        if (!article) {
            return;
        }

        const panel = article.querySelector(".post-content");

        if (!panel) {
            return;
        }

        let raf = 0;
        let pointerX = 0;
        let pointerY = 0;
        let hasPointer = false;

        const updateSpotlight = () => {
            raf = 0;

            if (!hasPointer) {
                return;
            }

            const rect = panel.getBoundingClientRect();

            if (!rect.width || !rect.height) {
                return;
            }

            const x = ((pointerX - rect.left) / rect.width) * 100;
            const y = ((pointerY - rect.top) / rect.height) * 100;
            const isNear = x > -8 && x < 108 && y > -10 && y < 110;

            if (!isNear) {
                panel.style.setProperty("--spot-opacity", "0");
                return;
            }

            panel.style.setProperty("--spot-x", `${Math.max(0, Math.min(100, x))}%`);
            panel.style.setProperty("--spot-y", `${Math.max(0, Math.min(100, y))}%`);
            panel.style.setProperty("--spot-opacity", "1");
        };

        const schedule = () => {
            if (!raf) {
                raf = window.requestAnimationFrame(updateSpotlight);
            }
        };

        document.addEventListener("pointermove", (event) => {
            pointerX = event.clientX;
            pointerY = event.clientY;
            hasPointer = true;
            schedule();
        }, { passive: true });

        document.addEventListener("pointerleave", () => {
            hasPointer = false;
            panel.style.setProperty("--spot-opacity", "0");
        });

        window.addEventListener("scroll", () => {
            if (hasPointer) {
                schedule();
            }
        }, { passive: true });
    }

    function goBack() {
        window.dispatchEvent(new Event("papermod:save"));

        if (window.history.length > 1) {
            window.history.back();
            return;
        }

        const home = new URL("/", window.location.origin);
        window.location.assign(home.href);
    }

    button.addEventListener("click", goBack);
    button.addEventListener("focus", () => {
        setNear(true);
        setLit(true);
    });
    button.addEventListener("blur", resetProximity);
    document.addEventListener("pointermove", updateProximity, { passive: true });
    document.addEventListener("pointerleave", resetProximity);
    window.addEventListener("blur", resetProximity);

    new MutationObserver(() => {
        palette = readPalette();
        draw();
    }).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"]
    });

    draw();
})();
