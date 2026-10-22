/* ==========================================================================
   PaperMod 路 鍙鐢ㄧ殑杩蜂綘浜岀骇鑿滃崟
   鐢ㄦ硶锛氱粰瀹瑰櫒鍔?data-mini-menu锛屾寜閽姞 data-mini-menu-toggle锛?   缂╃暐鍐呭鍔?data-mini-menu-summary锛屽睍寮€鍐呭鍔?data-mini-menu-panel銆?   ========================================================================== */

(() => {
    "use strict";

    const menus = Array.from(document.querySelectorAll("[data-mini-menu]"));

    if (!menus.length || window.__papermodMiniMenu) {
        return;
    }
    window.__papermodMiniMenu = true;

    const mobileQuery = window.matchMedia("(max-width: 899px)");
    let activeMenu = null;
    let backdrop = null;
    const arrowAnimations = new WeakMap();

    function getBackdrop() {
        if (backdrop) {
            return backdrop;
        }

        backdrop = document.createElement("div");
        backdrop.className = "mini-menu-backdrop";
        backdrop.setAttribute("aria-hidden", "true");
        backdrop.addEventListener("click", () => {
            if (activeMenu) {
                closeMenu(activeMenu, true);
            }
        });
        document.body.appendChild(backdrop);

        return backdrop;
    }

    function positionPanel(menu) {
        const toggle = menu.querySelector("[data-mini-menu-toggle]");
        const panel = menu.querySelector("[data-mini-menu-panel]");

        if (!toggle || !panel) {
            return;
        }

        if (mobileQuery.matches) {
            panel.style.removeProperty("left");
            panel.style.removeProperty("top");
            panel.style.removeProperty("width");
            return;
        }

        const rect = toggle.getBoundingClientRect();
        const margin = 12;
        const gap = 8;
        const width = Math.min(340, window.innerWidth - margin * 2);
        const maxHeight = Math.min(window.innerHeight * 0.58, 440);
        const panelHeight = Math.min(panel.offsetHeight || maxHeight, maxHeight);
        const side = menu.dataset.side === "left" ? "left" : "right";
        const player = document.querySelector(".site-player");
        const playerHeight = player && !player.hidden ? player.getBoundingClientRect().height : 0;
        const bottomLimit = window.innerHeight - playerHeight - margin;

        // 优先朝按钮靠近的那一侧展开；那一侧空间不足时，翻到另一侧。
        let left;

        if (side === "right") {
            left = rect.right + gap;

            if (left + width > window.innerWidth - margin) {
                left = rect.left - width - gap;
            }
        } else {
            left = rect.left - width - gap;

            if (left < margin) {
                left = rect.right + gap;
            }
        }

        left = Math.min(Math.max(margin, left), window.innerWidth - width - margin);

        let top = rect.top;
        if (top + panelHeight > bottomLimit) {
            top = Math.max(margin, bottomLimit - panelHeight);
        }
        if (top < margin) {
            top = margin;
        }

        panel.style.width = `${Math.round(width)}px`;
        panel.style.left = `${Math.round(left)}px`;
        panel.style.top = `${Math.round(top)}px`;
    }

    function openMenu(menu) {
        if (activeMenu === menu) {
            return;
        }

        if (activeMenu) {
            closeMenu(activeMenu, false);
        }

        const toggle = menu.querySelector("[data-mini-menu-toggle]");
        const panel = menu.querySelector("[data-mini-menu-panel]");
        const summary = menu.querySelector("[data-mini-menu-summary]");

        if (!toggle || !panel) {
            return;
        }

        activeMenu = menu;
        menu.classList.add("is-open");
        toggle.setAttribute("aria-expanded", "true");
        panel.removeAttribute("inert");
        panel.setAttribute("aria-hidden", "false");
        arrowAnimations.get(menu)?.start();

        if (summary) {
            summary.setAttribute("inert", "");
        }

        if (mobileQuery.matches) {
            positionPanel(menu);
            const layer = getBackdrop();
            document.body.classList.add("mini-menu-open");
            window.requestAnimationFrame(() => layer.classList.add("is-visible"));
        } else {
            positionPanel(menu);
        }
    }

    function closeMenu(menu, restoreFocus) {
        const toggle = menu.querySelector("[data-mini-menu-toggle]");
        const panel = menu.querySelector("[data-mini-menu-panel]");
        const summary = menu.querySelector("[data-mini-menu-summary]");

        menu.classList.remove("is-open");
        arrowAnimations.get(menu)?.stop();

        if (toggle) {
            toggle.setAttribute("aria-expanded", "false");
        }

        if (panel) {
            panel.setAttribute("inert", "");
            panel.setAttribute("aria-hidden", "true");
        }

        if (summary) {
            summary.removeAttribute("inert");
        }

        if (activeMenu === menu) {
            activeMenu = null;
        }

        if (!activeMenu) {
            document.body.classList.remove("mini-menu-open");

            if (backdrop) {
                backdrop.classList.remove("is-visible");
            }
        }

        if (restoreFocus && toggle) {
            toggle.focus();
        }
    }

    function setupParticleArrow(toggle) {
        const canvas = toggle.querySelector(".mini-menu-arrow-canvas");

        if (!canvas) {
            toggle.classList.add("no-arrow-canvas");
            return null;
        }

        const ctx = canvas.getContext("2d");

        if (!ctx) {
            toggle.classList.add("no-arrow-canvas");
            return null;
        }

        let particles = [];
        let raf = 0;

        function draw() {
            const width = canvas.width / Math.min(window.devicePixelRatio || 1, 2);
            const height = canvas.height / Math.min(window.devicePixelRatio || 1, 2);
            const color = getComputedStyle(document.documentElement)
                .getPropertyValue("--particle-active").trim() || getComputedStyle(toggle).color;

            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = Math.max(2, width * 0.08);

            particles.forEach((particle) => {
                ctx.fillRect(
                    particle.x - particle.r,
                    particle.y - particle.r,
                    particle.r * 2,
                    particle.r * 2
                );
            });

            ctx.shadowBlur = 0;
        }

        function start() {
            stop();

            const rect = toggle.getBoundingClientRect();
            const width = rect.width;
            const height = rect.height;

            if (!width || !height) {
                return;
            }

            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const tipX = width * 0.27;
            const tailX = width * 0.77;
            const headX = width * 0.52;
            const centerY = height * 0.5;
            const spread = height * 0.23;
            const direction = toggle.closest("[data-mini-menu]")?.dataset.arrow === "right"
                ? "right"
                : "left";
            const targets = [];

            for (let index = 0; index < 10; index += 1) {
                targets.push({
                    x: tipX + (tailX - tipX) * (index / 9),
                    y: centerY
                });
            }

            for (let index = 0; index < 6; index += 1) {
                const progress = index / 5;
                targets.push({
                    x: tipX + (headX - tipX) * progress,
                    y: centerY - spread * progress
                });
            }

            for (let index = 0; index < 6; index += 1) {
                const progress = index / 5;
                targets.push({
                    x: tipX + (headX - tipX) * progress,
                    y: centerY + spread * progress
                });
            }

            const jitter = Math.max(0.8, width * 0.035);

            const baseRadius = Math.max(0.8, width * 0.018);
            particles = targets.map((target) => {
                const x = direction === "right" ? width - target.x : target.x;
                return {
                    x: width * 0.5 + (Math.random() - 0.5) * width * 0.82,
                    y: height * 0.5 + (Math.random() - 0.5) * height * 0.82,
                    tx: x + (Math.random() - 0.5) * jitter,
                    ty: target.y + (Math.random() - 0.5) * jitter,
                    r: baseRadius + Math.random() * baseRadius * 0.8
                };
            });

            const started = performance.now();

            const frame = (now) => {
                particles.forEach((particle) => {
                    particle.x += (particle.tx - particle.x) * 0.18;
                    particle.y += (particle.ty - particle.y) * 0.18;
                });

                draw();

                if (now - started < 460) {
                    raf = window.requestAnimationFrame(frame);
                } else {
                    particles.forEach((particle) => {
                        particle.x = particle.tx;
                        particle.y = particle.ty;
                    });
                    draw();
                    raf = 0;
                }
            };

            raf = window.requestAnimationFrame(frame);
        }

        function stop() {
            if (raf) {
                window.cancelAnimationFrame(raf);
                raf = 0;
            }

            particles = [];
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        return { start, stop };
    }

    function setupPanelSwipe(menu) {
        const panel = menu.querySelector("[data-mini-menu-panel]");

        if (!panel) {
            return;
        }

        let startX = 0;
        let startY = 0;
        let pointerId = null;
        let dragging = false;

        function reset() {
            panel.classList.remove("is-dragging");
            panel.style.removeProperty("transform");
            pointerId = null;
            startX = 0;
            startY = 0;
            dragging = false;
        }

        panel.addEventListener("pointerdown", (event) => {
            if (!mobileQuery.matches || !menu.classList.contains("is-open")) {
                return;
            }

            if (event.target.closest("a, button, input, textarea, select")) {
                return;
            }

            startX = event.clientX;
            startY = event.clientY;
            pointerId = event.pointerId;
            dragging = false;
            panel.setPointerCapture?.(pointerId);
        }, { passive: true });

        panel.addEventListener("pointermove", (event) => {
            if (pointerId === null || event.pointerId !== pointerId) {
                return;
            }

            const dx = event.clientX - startX;
            const dy = event.clientY - startY;

            if (!dragging && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
                dragging = true;
                panel.classList.add("is-dragging");
            }

            if (!dragging) {
                return;
            }

            if (event.cancelable) {
                event.preventDefault();
            }

            panel.style.transform = `translateX(${(dx * 0.32).toFixed(2)}px)`;
        }, { passive: false });

        panel.addEventListener("pointerup", (event) => {
            if (pointerId === null || event.pointerId !== pointerId) {
                return;
            }

            const dx = event.clientX - startX;
            const shouldClose = dragging && Math.abs(dx) > 100;

            reset();

            if (shouldClose) {
                closeMenu(menu, false);
            }
        });

        panel.addEventListener("pointercancel", reset);
    }

    menus.forEach((menu) => {
        const toggle = menu.querySelector("[data-mini-menu-toggle]");

        if (!toggle) {
            return;
        }

        const arrow = setupParticleArrow(toggle);

        if (arrow) {
            arrowAnimations.set(menu, arrow);
        }

        setupPanelSwipe(menu);

        toggle.addEventListener("click", () => {
            if (menu.classList.contains("is-open")) {
                closeMenu(menu, true);
            } else {
                openMenu(menu);
            }
        });
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && activeMenu) {
            closeMenu(activeMenu, true);
        }
    });

    document.addEventListener("pointerdown", (event) => {
        if (!activeMenu || mobileQuery.matches) {
            return;
        }

        if (!activeMenu.contains(event.target)) {
            closeMenu(activeMenu, false);
        }
    });

    const handleViewportChange = () => {
        if (activeMenu) {
            if (mobileQuery.matches) {
                positionPanel(activeMenu);
            } else {
                const layer = getBackdrop();
                layer.classList.remove("is-visible");
                document.body.classList.remove("mini-menu-open");
                positionPanel(activeMenu);
            }
        }
    };

    mobileQuery.addEventListener("change", () => {
        if (activeMenu) {
            closeMenu(activeMenu, false);
        }
    });

    window.addEventListener("resize", handleViewportChange, { passive: true });
    window.addEventListener("scroll", () => {
        if (activeMenu && !mobileQuery.matches) {
            positionPanel(activeMenu);
        }
    }, { passive: true });
})();


