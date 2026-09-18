import { useEffect } from "react";
import type { RefObject } from "react";
import { hideBootLoader } from "@/utils/bootLoader";

/**
 * Drives every animated element on the landing page.
 *
 * This is the supplied page's script carried over as-is. It stays imperative and
 * DOM-driven rather than being rebuilt in React state on purpose: the work here
 * is per-frame canvas drawing and physics running at 60fps, which has no
 * business going through a render cycle. React owns the markup; this hook owns
 * the pixels.
 *
 * Three.js is loaded from a CDN instead of bundled. It is ~600KB for a single
 * route that signed-in users rarely see, and keeping it out of the bundle means
 * the chat app does not pay for the marketing page. If the script fails to load,
 * `no-webgl` is set on the root and the hero falls back to a static gradient.
 *
 * Everything registered here is torn down on unmount — this is a client-side
 * route, so leaked frame loops and listeners would keep running over the chat UI.
 */
export function useLandingScenes(rootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const cleanups: Array<() => void> = [];
    let disposed = false;

    /** Registers a rAF loop that stops itself once the page unmounts. */
    const loop = (step: () => void): void => {
      let id = 0;
      const tick = (): void => {
        if (disposed) return;
        step();
        id = requestAnimationFrame(tick);
      };
      id = requestAnimationFrame(tick);
      cleanups.push(() => cancelAnimationFrame(id));
    };

    const on = <K extends keyof WindowEventMap>(
      target: Window | Document | Element,
      type: K | string,
      handler: EventListenerOrEventListenerObject,
      options?: AddEventListenerOptions,
    ): void => {
      target.addEventListener(type, handler, options);
      cleanups.push(() => target.removeEventListener(type, handler, options));
    };

    const observe = (observer: IntersectionObserver): IntersectionObserver => {
      cleanups.push(() => observer.disconnect());
      return observer;
    };

    /**
     * Runs work after the browser has painted, not in the mount task with it.
     *
     * Every section below the hero sets itself up here: canvas contexts, their
     * first sizing pass, observers, the story track's measurements. Done inline
     * it is one ~500ms task between React's commit and the first paint, so the
     * hero text — the LCP element, and the only thing on screen at that point —
     * waits behind setup for sections nobody has scrolled to yet. A frame is
     * painted between these two callbacks, so the work lands after the hero is
     * already on screen.
     */
    const afterPaint = (run: () => void): void => {
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => {
          if (!disposed) run();
        });
      });
      cleanups.push(() => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      });
    };

    const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = (): boolean => window.innerWidth < 768;
    const isTablet = (): boolean => window.innerWidth >= 768 && window.innerWidth < 1200;
    const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
    const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
    const $ = <T extends Element>(sel: string): T | null => root.querySelector<T>(sel);
    const $$ = <T extends Element>(sel: string): T[] => Array.from(root.querySelectorAll<T>(sel));

    /* ---------- REVEAL OBSERVER ---------- */
    const io = observe(
      new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("on");
              io.unobserve(e.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
      ),
    );
    $$(".rv").forEach((el) => io.observe(el));

    /* ---------- NAV ---------- */
    const nav = $<HTMLElement>("#nav");
    const burger = $<HTMLButtonElement>("#burger");
    const menu = $<HTMLElement>("#mobile-menu");

    if (nav) {
      on(window, "scroll", () => nav.classList.toggle("stuck", window.scrollY > 40), {
        passive: true,
      });
    }
    if (burger && menu) {
      const setMenu = (open: boolean): void => {
        menu.classList.toggle("open", open);
        burger.classList.toggle("open", open);
        burger.setAttribute("aria-expanded", String(open));
        menu.setAttribute("aria-hidden", String(!open));
        document.body.classList.toggle("locked", open);
        $$<HTMLElement>("#mobile-menu a").forEach((a, i) => {
          a.style.transitionDelay = open ? `${0.08 + i * 0.055}s` : "0s";
        });
      };
      on(burger, "click", () => setMenu(!menu.classList.contains("open")));
      $$("#mobile-menu a").forEach((a) => on(a, "click", () => setMenu(false)));
      on(window, "keydown", (e) => {
        if ((e as KeyboardEvent).key === "Escape" && menu.classList.contains("open")) setMenu(false);
      });
      // The lock lives on <body>, which outlives this route.
      cleanups.push(() => document.body.classList.remove("locked"));
    }

    /* ---------- LOADER + HERO COPY ---------- */
    // Lifted here rather than on `load`, which waits for every image, font and
    // the Three.js CDN script. The hero wordmark needs none of them — it is
    // static HTML sitting under the loader overlay the whole time — and LCP
    // cannot be recorded until that overlay lifts, so waiting was ~1.2s of pure
    // render delay against text that was ready all along. The scenes fade in
    // behind it afterwards.
    hideBootLoader("instant");
    $$(".hero-reveal").forEach((el, i) => {
      const t = window.setTimeout(() => el.classList.add("on"), 260 + i * 120);
      cleanups.push(() => clearTimeout(t));
    });
    const navIn = window.setTimeout(() => nav?.classList.add("in"), 200);
    cleanups.push(() => clearTimeout(navIn));

    /* ---------- CHAT + EDITOR REVEAL ---------- */
    afterPaint(() => {
      const frame = $<HTMLElement>("#chat-frame");
      if (frame) {
        const ob = observe(
          new IntersectionObserver(
            (entries) => {
              entries.forEach((e) => {
                if (!e.isIntersecting) return;
                frame.classList.add("on");
                $$<HTMLElement>("#chat-scroll .msg").forEach((m) => {
                  const delay = REDUCED ? 0 : Number(m.dataset["delay"] ?? 0) + 300;
                  const t = window.setTimeout(() => m.classList.add("in"), delay);
                  cleanups.push(() => clearTimeout(t));
                });
                ob.disconnect();
              });
            },
            { threshold: 0.22 },
          ),
        );
        ob.observe(frame);
      }

      const ed = $<HTMLElement>("#editor");
      $$<HTMLElement>("#editor .ln").forEach((l, i) => {
        l.style.transitionDelay = `${i * 0.045}s`;
      });
      if (ed) {
        const ob = observe(
          new IntersectionObserver(
            (entries) => {
              entries.forEach((e) => {
                if (e.isIntersecting) {
                  ed.classList.add("on");
                  ob.disconnect();
                }
              });
            },
            { threshold: 0.3 },
          ),
        );
        ob.observe(ed);
      }
    });

    /* ---------- FAQ ---------- */
    $$<HTMLButtonElement>("#faq .faq-q").forEach((btn) => {
      on(btn, "click", () => {
        const item = btn.parentElement;
        const panel = item?.querySelector<HTMLElement>(".faq-a");
        if (!item || !panel) return;
        const open = item.classList.contains("open");
        $$<HTMLElement>("#faq .faq-item.open").forEach((o) => {
          if (o === item) return;
          o.classList.remove("open");
          const p = o.querySelector<HTMLElement>(".faq-a");
          if (p) p.style.height = "0px";
          o.querySelector<HTMLElement>(".faq-q")?.setAttribute("aria-expanded", "false");
        });
        item.classList.toggle("open", !open);
        btn.setAttribute("aria-expanded", String(!open));
        panel.style.height = open ? "0px" : `${panel.scrollHeight}px`;
      });
    });

    /* ---------- STORY HORIZONTAL SCROLL ---------- */
    afterPaint(() => {
      const sec = $<HTMLElement>("#story");
      const pane = $<HTMLElement>("#story .story-sticky");
      const track = $<HTMLElement>("#story-track");
      const bar = $<HTMLElement>("#story-bar");
      const label = $<HTMLElement>("#story-label");
      const panels = $$<HTMLElement>("#story-track .story-panel");
      if (sec && pane && track && bar && label && panels.length > 0) {
        // The section's height and the track's width have to agree, or the panels
        // run out before the section does and the rest of it scrolls past as dead
        // space. Both now come from the panels themselves: the CSS spends one
        // sticky pane of scroll per panel, so adding or removing one stays honest.
        sec.style.setProperty("--story-panels", String(panels.length));
        const names = panels.map(
          (p) => p.querySelector(".story-num")?.textContent?.split("—").pop()?.trim() ?? "",
        );
        let ticking = false;
        const update = (): void => {
          ticking = false;
          if (isMobile()) {
            track.style.transform = "";
            return;
          }
          // Measured against the pane rather than the window: the pane is sized in
          // svh and unpins the instant the section's bottom meets it, so progress
          // read off innerHeight drifts wherever the two differ.
          const total = sec.offsetHeight - pane.offsetHeight;
          const max = Math.max(0, track.scrollWidth - pane.clientWidth);
          const p = total > 0 ? clamp(-sec.getBoundingClientRect().top / total, 0, 1) : 0;
          track.style.transform = `translate3d(${-p * max}px,0,0)`;
          bar.style.width = `${p * 100}%`;
          label.textContent = names[clamp(Math.round(p * (names.length - 1)), 0, names.length - 1)] ?? "";
        };
        on(
          window,
          "scroll",
          () => {
            if (!ticking) {
              ticking = true;
              requestAnimationFrame(update);
            }
          },
          { passive: true },
        );
        on(window, "resize", update);
        update();
      }
    });

    /* ---------- PERFORMANCE CANVAS (2D) ---------- */
    afterPaint(() => {
      const cv = $<HTMLCanvasElement>("#perf-canvas");
      const ctx = cv?.getContext("2d") ?? null;
      if (cv && ctx) {
        const steps = $$<HTMLElement>(".perf-step");
        let W = 0;
        let H = 0;
        let active = false;
        let t = 0;
        const size = (): void => {
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          W = cv.clientWidth;
          H = cv.clientHeight || 190;
          cv.width = W * dpr;
          cv.height = H * dpr;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        // No eager sizing pass: reading clientWidth straight after writing
        // cv.width forces a synchronous layout, and the observer below already
        // sizes the canvas the moment it first becomes visible — which is the
        // only point anything is drawn into it.
        on(window, "resize", size);
        const packets = Array.from({ length: 16 }, (_, i) => ({
          p: i / 16,
          s: 0.12 + Math.random() * 0.06,
          o: Math.random(),
        }));
        loop(() => {
          if (!active) return;
          t += 0.006;
          ctx.clearRect(0, 0, W, H);
          const y = H * 0.5;
          const x0 = W * 0.06;
          const x1 = W * 0.94;
          ctx.strokeStyle = "rgba(245,245,245,.10)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x0, y);
          ctx.lineTo(x1, y);
          ctx.stroke();
          [0, 0.5, 1].forEach((f) => {
            const x = x0 + (x1 - x0) * f;
            ctx.strokeStyle = "rgba(245,245,245,.16)";
            ctx.beginPath();
            ctx.moveTo(x, y - 26);
            ctx.lineTo(x, y + 26);
            ctx.stroke();
          });
          const cx = x0 + (x1 - x0) * 0.5;
          const pulse = 0.5 + 0.5 * Math.sin(t * 7);
          ctx.strokeStyle = `rgba(0,255,65,${0.25 + pulse * 0.35})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(cx, y, 20 + pulse * 7, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = `rgba(0,255,65,${0.1 + pulse * 0.14})`;
          ctx.beginPath();
          ctx.arc(cx, y, 13, 0, Math.PI * 2);
          ctx.fill();
          packets.forEach((pk) => {
            pk.p += pk.s * 0.012;
            if (pk.p > 1) {
              pk.p = 0;
              pk.o = Math.random();
            }
            const x = x0 + (x1 - x0) * pk.p;
            const wob =
              Math.sin(pk.p * 9 + pk.o * 6 + t * 4) *
              (pk.p < 0.5 ? 8 : 16 * (pk.p - 0.5) * 2 + 4);
            const near = 1 - Math.abs(pk.p - 0.5) * 2;
            const a = 0.25 + 0.55 * (1 - near);
            ctx.fillStyle = `rgba(0,255,65,${a})`;
            const w = pk.p < 0.5 ? 14 : 3;
            ctx.fillRect(x, y + wob - 1, w, 1.6);
            if (pk.p > 0.55) {
              ctx.fillStyle = `rgba(245,245,245,${0.1 + 0.2 * (pk.p - 0.55)})`;
              ctx.fillRect(x - 6, y + wob - 1, 5, 1.2);
            }
          });
          for (let i = 0; i < 26; i++) {
            const x = x1 - 6 - i * 7;
            if (x < cx + 30) break;
            const h =
              (Math.sin(t * 9 - i * 0.5) * 0.5 + 0.5) * 20 * clamp((x - cx - 30) / 120, 0, 1);
            ctx.fillStyle = "rgba(0,255,65,.5)";
            ctx.fillRect(x, y - h / 2, 1.5, h);
          }
          const phase = Math.floor((t * 0.9) % 3);
          steps.forEach((s, i) => s.classList.toggle("active", i === phase));
        });
        observe(
          new IntersectionObserver(
            (entries) => {
              entries.forEach((e) => {
                if (e.isIntersecting && !active) {
                  active = true;
                  size();
                } else if (!e.isIntersecting) active = false;
              });
            },
            { threshold: 0.15 },
          ),
        ).observe(cv);
      }
    });

    /* ---------- FINAL CTA ENERGY FIELD (2D) ---------- */
    afterPaint(() => {
      const cv = $<HTMLCanvasElement>("#final-canvas");
      const ctx = cv?.getContext("2d") ?? null;
      if (cv && ctx) {
        let W = 0;
        let H = 0;
        let active = false;
        let t = 0;
        let parts: Array<{ x: number; y: number; s: number; r: number; o: number }> = [];
        const size = (): void => {
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          W = cv.clientWidth;
          H = cv.clientHeight;
          cv.width = W * dpr;
          cv.height = H * dpr;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          const n = isMobile() ? 36 : 90;
          parts = Array.from({ length: n }, () => ({
            x: Math.random() * W,
            y: Math.random() * H,
            s: 0.2 + Math.random() * 0.6,
            r: Math.random() * 1.4 + 0.3,
            o: Math.random(),
          }));
        };
        // Sized by the observer below when it first scrolls into view; see the
        // performance canvas above for why there is no eager pass here.
        on(window, "resize", size);
        loop(() => {
          if (!active) return;
          t += 0.004;
          ctx.clearRect(0, 0, W, H);
          const g = ctx.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, Math.max(W, H) * 0.55);
          g.addColorStop(0, "rgba(0,255,65,0.09)");
          g.addColorStop(1, "rgba(0,255,65,0)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
          ctx.strokeStyle = "rgba(0,255,65,.14)";
          ctx.lineWidth = 1;
          for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            for (let x = 0; x <= W; x += 14) {
              const y =
                H * 0.5 +
                Math.sin(x * 0.004 + t * 3 + i * 1.3) * (28 + i * 16) +
                Math.cos(x * 0.002 - t * 2) * 14;
              if (x === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.globalAlpha = 0.5 - i * 0.08;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
          parts.forEach((p) => {
            p.y -= p.s;
            if (p.y < -6) {
              p.y = H + 6;
              p.x = Math.random() * W;
            }
            ctx.fillStyle = `rgba(0,255,65,${0.15 + 0.5 * p.o})`;
            ctx.beginPath();
            ctx.arc(p.x + Math.sin(t * 2 + p.o * 8) * 10, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
          });
        });
        observe(
          new IntersectionObserver(
            (entries) => {
              entries.forEach((e) => {
                if (e.isIntersecting && !active) {
                  active = true;
                  size();
                } else if (!e.isIntersecting) active = false;
              });
            },
            { threshold: 0.05 },
          ),
        ).observe(cv);
      }
    });

    /* ---------- MINI ROBOT (2D) ---------- */
    afterPaint(() => {
      const cv = $<HTMLCanvasElement>("#mini-canvas");
      const ctx = cv?.getContext("2d") ?? null;
      if (cv && ctx) {
        let W = 0;
        let H = 0;
        let active = false;
        let t = 0;
        const size = (): void => {
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          W = cv.clientWidth || 160;
          H = cv.clientHeight || 160;
          cv.width = W * dpr;
          cv.height = H * dpr;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        // Sized by the observer below when it first scrolls into view; see the
        // performance canvas above for why there is no eager pass here.
        on(window, "resize", size);
        const hasRoundRect = typeof ctx.roundRect === "function";
        loop(() => {
          if (!active) return;
          t += 0.016;
          ctx.clearRect(0, 0, W, H);
          const s = W / 160;
          const cx = W / 2;
          const cy = H / 2 + Math.sin(t * 1.4) * 5 * s;
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60 * s);
          g.addColorStop(0, "rgba(0,255,65,.20)");
          g.addColorStop(1, "rgba(0,255,65,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, 60 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#1C1C1C";
          ctx.strokeStyle = "rgba(245,245,245,.22)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(cx, cy + 30 * s, 26 * s, 22 * s, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          if (hasRoundRect) ctx.roundRect(cx - 24 * s, cy - 30 * s, 48 * s, 42 * s, 16 * s);
          else ctx.ellipse(cx, cy - 9 * s, 24 * s, 21 * s, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "rgba(18,18,18,.9)";
          ctx.beginPath();
          if (hasRoundRect) ctx.roundRect(cx - 17 * s, cy - 20 * s, 34 * s, 17 * s, 8 * s);
          else ctx.ellipse(cx, cy - 12 * s, 17 * s, 9 * s, 0, 0, Math.PI * 2);
          ctx.fill();
          const b = 0.6 + 0.4 * Math.sin(t * 2.2);
          ctx.fillStyle = `rgba(0,255,65,${0.7 + 0.3 * b})`;
          ctx.shadowColor = "rgba(0,255,65,.9)";
          ctx.shadowBlur = 12 * s;
          ctx.beginPath();
          ctx.arc(cx - 7 * s, cy - 12 * s, 2.6 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(cx + 7 * s, cy - 12 * s, 2.6 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(cx, cy + 28 * s, 4 * s + 1 * s * b, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = `rgba(0,255,65,${0.25 + 0.2 * b})`;
          ctx.beginPath();
          ctx.ellipse(cx, cy + 56 * s, 34 * s, 8 * s, 0, 0, Math.PI * 2);
          ctx.stroke();
        });
        observe(
          new IntersectionObserver(
            (entries) => {
              entries.forEach((e) => {
                if (e.isIntersecting && !active) {
                  active = true;
                  size();
                } else if (!e.isIntersecting) active = false;
              });
            },
            { threshold: 0.1 },
          ),
        ).observe(cv);
      }
    });

    /* ================= WEBGL ================= */
    const hasWebGL = (): boolean => {
      try {
        const c = document.createElement("canvas");
        return !!(
          window.WebGLRenderingContext &&
          (c.getContext("webgl") ?? c.getContext("experimental-webgl"))
        );
      } catch {
        return false;
      }
    };

    const initGL = (): void => {
      const THREE = window.THREE;
      if (!THREE || disposed) {
        root.classList.add("no-webgl");
        return;
      }
      const DPR = Math.min(window.devicePixelRatio || 1, isMobile() ? 1.5 : 2);

      /** Radial sprite texture for glows. */
      const glowTex = (): THREENamespace.CanvasTexture => {
        const c = document.createElement("canvas");
        c.width = c.height = 128;
        const x = c.getContext("2d");
        if (x) {
          const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
          g.addColorStop(0, "rgba(0,255,65,1)");
          g.addColorStop(0.35, "rgba(0,255,65,.42)");
          g.addColorStop(1, "rgba(0,255,65,0)");
          x.fillStyle = g;
          x.fillRect(0, 0, 128, 128);
        }
        return new THREE.CanvasTexture(c);
      };
      const GLOW = glowTex();

      /** Neutral soft dot — tinted per-particle by vertexColors. */
      const dotTex = (): THREENamespace.CanvasTexture => {
        const c = document.createElement("canvas");
        c.width = c.height = 64;
        const x = c.getContext("2d");
        if (x) {
          const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
          g.addColorStop(0, "rgba(255,255,255,1)");
          g.addColorStop(0.4, "rgba(255,255,255,.55)");
          g.addColorStop(1, "rgba(255,255,255,0)");
          x.fillStyle = g;
          x.fillRect(0, 0, 64, 64);
        }
        return new THREE.CanvasTexture(c);
      };
      const DOT = dotTex();

      /* ---------- HERO SCENE ---------- */
      {
        const cv = $<HTMLCanvasElement>("#hero-canvas");
        if (cv) {
          const renderer = new THREE.WebGLRenderer({
            canvas: cv,
            antialias: !isMobile(),
            alpha: true,
            powerPreference: "high-performance",
          });
          renderer.setPixelRatio(DPR);
          cleanups.push(() => renderer.dispose());
          const scene = new THREE.Scene();
          // Dense enough to dissolve the far plane. Every particle projects to
          // the vanishing point at that distance, so a thin fog leaves a bright
          // clot in the middle of the screen instead of an even field.
          scene.fog = new THREE.FogExp2(0x121212, 0.0014);
          const camera = new THREE.PerspectiveCamera(62, 1, 1, 1600);
          camera.position.set(0, 0, 0);

          const COUNT = isMobile() ? 620 : isTablet() ? 1300 : 2600;
          const NEAR = 190; // recycle before size attenuation balloons a point
          const FAR = 900;
          const TAN = Math.tan((62 * Math.PI) / 360); // half-fov of this camera
          // Overscan. The camera pans up to 70 units on pointer move, so the
          // field has to extend well past the frustum or the pan reveals an edge.
          const MARGIN = 1.6;
          let ASPECT = 1.6;

          const pos = new Float32Array(COUNT * 3);
          const col = new Float32Array(COUNT * 3);
          const spd = new Float32Array(COUNT);
          const cA = new THREE.Color(0x00ff41);
          const cB = new THREE.Color(0xf5f5f5);

          // Place a particle at depth z inside the frustum at THAT depth. The view
          // cone narrows toward the camera, so x/y have to scale with distance —
          // scattering through a fixed box leaves almost everything outside it.
          const place = (i: number, z: number): void => {
            const halfH = TAN * Math.abs(z) * MARGIN;
            const halfW = halfH * ASPECT;
            pos[i * 3] = (Math.random() * 2 - 1) * halfW;
            pos[i * 3 + 1] = (Math.random() * 2 - 1) * halfH;
            pos[i * 3 + 2] = z;
          };
          let pg: THREENamespace.BufferGeometry | null = null;
          const scatter = (): void => {
            for (let i = 0; i < COUNT; i++) place(i, -(NEAR + Math.random() * (FAR - NEAR)));
            if (pg) pg.attributes.position.needsUpdate = true;
          };
          for (let i = 0; i < COUNT; i++) {
            spd[i] = 26 + Math.random() * 70;
            const c = Math.random() < 0.24 ? cA : cB;
            const f = 0.4 + Math.random() * 0.6;
            col[i * 3] = c.r * f;
            col[i * 3 + 1] = c.g * f;
            col[i * 3 + 2] = c.b * f;
          }
          scatter();
          pg = new THREE.BufferGeometry();
          pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
          pg.setAttribute("color", new THREE.BufferAttribute(col, 3));
          const points = new THREE.Points(
            pg,
            new THREE.PointsMaterial({
              size: isMobile() ? 3.0 : 2.6,
              map: DOT,
              vertexColors: true,
              transparent: true,
              opacity: 0.95,
              sizeAttenuation: true,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            }),
          );
          scene.add(points);

          // fine grid floor + ceiling
          const gridMat = new THREE.LineBasicMaterial({
            color: 0x00ff41,
            transparent: true,
            opacity: 0.1,
          });
          const grid = new THREE.GridHelper(3200, isMobile() ? 26 : 52, 0x00ff41, 0x143318);
          grid.material = gridMat;
          grid.position.set(0, -190, -500);
          scene.add(grid);
          const grid2 = grid.clone();
          grid2.position.y = 210;
          grid2.material = new THREE.LineBasicMaterial({
            color: 0xf5f5f5,
            transparent: true,
            opacity: 0.035,
          });
          scene.add(grid2);

          let mx = 0;
          let my = 0;
          let tx = 0;
          let ty = 0;
          on(
            window,
            "pointermove",
            (e) => {
              const pe = e as PointerEvent;
              tx = pe.clientX / window.innerWidth - 0.5;
              ty = pe.clientY / window.innerHeight - 0.5;
            },
            { passive: true },
          );

          const resize = (): void => {
            const w = cv.clientWidth || cv.parentElement?.clientWidth || 0;
            const h = cv.clientHeight || cv.parentElement?.clientHeight || 0;
            if (!w || !h) return;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            const a = Math.max(0.5, w / h);
            if (Math.abs(a - ASPECT) > 0.02) {
              ASPECT = a;
              scatter();
            }
          };
          ASPECT = Math.max(0.5, (cv.clientWidth || 1600) / (cv.clientHeight || 900));
          scatter();
          resize();
          on(window, "resize", resize);
          on(window, "orientationchange", () => setTimeout(resize, 120));
          if (window.ResizeObserver && cv.parentElement) {
            const ro = new ResizeObserver(resize);
            ro.observe(cv.parentElement);
            cleanups.push(() => ro.disconnect());
          }
          if (document.fonts?.ready) void document.fonts.ready.then(resize);

          let visible = true;
          const clock = new THREE.Clock();
          observe(
            new IntersectionObserver(
              (entries) => entries.forEach((e) => (visible = e.isIntersecting)),
              { threshold: 0 },
            ),
          ).observe(cv);

          const geo = pg;
          loop(() => {
            if (!visible) return;
            const dt = Math.min(0.05, clock.getDelta());
            const p = geo.attributes.position.array;
            for (let i = 0; i < COUNT; i++) {
              const z = (p[i * 3 + 2] ?? 0) + (spd[i] ?? 0) * dt * (REDUCED ? 0.25 : 1);
              p[i * 3 + 2] = z;
              // Respawn across a band, not on one plane: a shared respawn depth
              // makes the recycled points arrive as a visible wave.
              if (z > -NEAR) place(i, -(FAR - Math.random() * 160));
            }
            geo.attributes.position.needsUpdate = true;

            mx = lerp(mx, tx, 0.045);
            my = lerp(my, ty, 0.045);
            camera.position.x = mx * 70;
            camera.position.y = -my * 44;
            camera.lookAt(mx * 20, -my * 12, -500);
            renderer.render(scene, camera);
          });
        }
      }

      /* ---------- ROBOT SCENE ---------- */
      {
        const cv = $<HTMLCanvasElement>("#robot-canvas");
        const stage = $<HTMLElement>("#robot-stage");
        if (cv && stage) {
          const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
          renderer.setPixelRatio(DPR);
          cleanups.push(() => renderer.dispose());
          const scene = new THREE.Scene();
          scene.fog = new THREE.Fog(0x121212, 5, 13);
          const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
          camera.position.set(0, 0.35, 5.6);

          const body = new THREE.MeshStandardMaterial({
            color: 0x1c1c1c,
            metalness: 0.72,
            roughness: 0.34,
          });
          const trim = new THREE.MeshStandardMaterial({
            color: 0xf5f5f5,
            metalness: 0.9,
            roughness: 0.24,
          });
          const dark = new THREE.MeshStandardMaterial({
            color: 0x0e0e0e,
            metalness: 0.5,
            roughness: 0.6,
          });

          const robot = new THREE.Group();
          scene.add(robot);
          const head = new THREE.Group();
          robot.add(head);

          // head shell
          const skull = new THREE.Mesh(new THREE.SphereGeometry(0.46, 40, 28), body);
          skull.scale.set(1.0, 0.92, 0.94);
          skull.position.y = 0.98;
          head.add(skull);
          // crown trim
          const crown = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.018, 12, 48), trim);
          crown.rotation.x = Math.PI / 2;
          crown.position.y = 1.22;
          head.add(crown);
          // visor band
          const visor = new THREE.Mesh(
            new THREE.CylinderGeometry(0.455, 0.455, 0.26, 40, 1, true, -0.95, 1.9),
            dark,
          );
          visor.position.y = 0.98;
          visor.scale.z = 0.98;
          head.add(visor);
          // eyes
          const eyeL = new THREE.Mesh(
            new THREE.SphereGeometry(0.045, 18, 12),
            new THREE.MeshBasicMaterial({ color: 0x00ff41 }),
          );
          eyeL.position.set(-0.15, 0.99, 0.42);
          head.add(eyeL);
          const eyeR = eyeL.clone();
          eyeR.position.x = 0.15;
          head.add(eyeR);
          const eyeGlow = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: GLOW,
              transparent: true,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              opacity: 0.55,
            }),
          );
          eyeGlow.scale.set(1.1, 0.5, 1);
          eyeGlow.position.set(0, 0.99, 0.5);
          head.add(eyeGlow);
          // ear pods
          [-1, 1].forEach((s) => {
            const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 20), trim);
            pod.rotation.z = Math.PI / 2;
            pod.position.set(s * 0.45, 0.96, 0);
            head.add(pod);
            const ring = new THREE.Mesh(
              new THREE.TorusGeometry(0.055, 0.012, 8, 20),
              new THREE.MeshBasicMaterial({ color: 0x00ff41 }),
            );
            ring.position.set(s * 0.48, 0.96, 0);
            ring.rotation.y = Math.PI / 2;
            head.add(ring);
          });
          // neck
          const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.2, 20), dark);
          neck.position.y = 0.6;
          robot.add(neck);

          // torso (lathe)
          const profile = (
            [
              [0.03, -0.95],
              [0.22, -0.86],
              [0.36, -0.6],
              [0.44, -0.25],
              [0.46, 0.05],
              [0.4, 0.3],
              [0.26, 0.46],
              [0.12, 0.52],
              [0.05, 0.53],
            ] as const
          ).map((p) => new THREE.Vector2(p[0], p[1]));
          const torso = new THREE.Mesh(new THREE.LatheGeometry(profile, 44), body);
          torso.position.y = 0.02;
          robot.add(torso);
          // chest plate + core
          const plate = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.016, 10, 36), trim);
          plate.position.set(0, 0.02, 0.36);
          robot.add(plate);
          const core = new THREE.Mesh(
            new THREE.SphereGeometry(0.085, 22, 16),
            new THREE.MeshBasicMaterial({ color: 0x00ff41 }),
          );
          core.position.set(0, 0.02, 0.36);
          robot.add(core);
          const coreGlow = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: GLOW,
              transparent: true,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              opacity: 0.7,
            }),
          );
          coreGlow.scale.set(1.5, 1.5, 1);
          coreGlow.position.set(0, 0.02, 0.42);
          robot.add(coreGlow);
          // shoulder + arms
          [-1, 1].forEach((s) => {
            const sh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 18), trim);
            sh.position.set(s * 0.46, 0.26, 0);
            robot.add(sh);
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.62, 18), body);
            arm.position.set(s * 0.58, -0.1, 0.02);
            arm.rotation.z = -s * 0.16;
            robot.add(arm);
            const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.44, 18), dark);
            fore.position.set(s * 0.66, -0.52, 0.1);
            fore.rotation.z = -s * 0.1;
            fore.rotation.x = 0.22;
            robot.add(fore);
            const cuff = new THREE.Mesh(
              new THREE.TorusGeometry(0.055, 0.01, 8, 20),
              new THREE.MeshBasicMaterial({ color: 0x00ff41 }),
            );
            cuff.position.set(s * 0.66, -0.32, 0.06);
            cuff.rotation.x = Math.PI / 2;
            robot.add(cuff);
          });
          // energy rings under
          const rings: Array<THREENamespace.Mesh<THREENamespace.MeshBasicMaterial>> = [];
          for (let i = 0; i < 3; i++) {
            const r = new THREE.Mesh(
              new THREE.TorusGeometry(0.55 + i * 0.22, 0.006, 8, 64),
              new THREE.MeshBasicMaterial({
                color: 0x00ff41,
                transparent: true,
                opacity: 0.5 - i * 0.13,
              }),
            );
            r.rotation.x = Math.PI / 2;
            r.position.y = -1.15 - i * 0.06;
            robot.add(r);
            rings.push(r);
          }
          // platform
          const plat = new THREE.Mesh(
            new THREE.CircleGeometry(1.7, 64),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.4, roughness: 0.85 }),
          );
          plat.rotation.x = -Math.PI / 2;
          plat.position.y = -1.62;
          scene.add(plat);
          const platRing = new THREE.Mesh(
            new THREE.TorusGeometry(1.7, 0.007, 8, 96),
            new THREE.MeshBasicMaterial({ color: 0x00ff41, transparent: true, opacity: 0.35 }),
          );
          platRing.rotation.x = -Math.PI / 2;
          platRing.position.y = -1.61;
          scene.add(platRing);
          // click pulse
          const pulse = new THREE.Mesh(
            new THREE.TorusGeometry(0.6, 0.012, 8, 64),
            new THREE.MeshBasicMaterial({ color: 0x00ff41, transparent: true, opacity: 0 }),
          );
          pulse.rotation.x = -Math.PI / 2;
          pulse.position.y = -1.55;
          scene.add(pulse);
          let pulseT = -1;

          // atmosphere particles
          const PN = isMobile() ? 40 : 140;
          const ap = new Float32Array(PN * 3);
          for (let i = 0; i < PN; i++) {
            ap[i * 3] = (Math.random() - 0.5) * 3.6;
            ap[i * 3 + 1] = (Math.random() - 0.5) * 3.4;
            ap[i * 3 + 2] = (Math.random() - 0.5) * 2.4;
          }
          const ag = new THREE.BufferGeometry();
          ag.setAttribute("position", new THREE.BufferAttribute(ap, 3));
          const atoms = new THREE.Points(
            ag,
            new THREE.PointsMaterial({
              color: 0x00ff41,
              size: 0.022,
              transparent: true,
              opacity: 0.6,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            }),
          );
          scene.add(atoms);
          // volumetric backlight
          const halo = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: GLOW,
              transparent: true,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              opacity: 0.32,
            }),
          );
          halo.scale.set(5.4, 5.4, 1);
          halo.position.set(0, 0.1, -1.6);
          scene.add(halo);

          // lights
          scene.add(new THREE.AmbientLight(0x243024, 0.85));
          const key = new THREE.DirectionalLight(0xf5f5f5, 1.15);
          key.position.set(2.5, 3.4, 3.2);
          scene.add(key);
          const rim = new THREE.PointLight(0x00ff41, 2.6, 14);
          rim.position.set(-2.6, 1.6, -2.2);
          scene.add(rim);
          const under = new THREE.PointLight(0x00ff41, 1.5, 7);
          under.position.set(0, -1.5, 1.2);
          scene.add(under);
          const fill = new THREE.PointLight(0xbfc4bf, 0.55, 12);
          fill.position.set(3, -1, 2);
          scene.add(fill);

          // interaction
          let tX = 0;
          let tY = 0;
          let cX = 0;
          let cY = 0;
          let hover = 0;
          let hoverT = 0;
          const touch = matchMedia("(hover: none)").matches;
          if (!touch && !isMobile()) {
            on(stage, "pointermove", (e) => {
              const pe = e as PointerEvent;
              const r = stage.getBoundingClientRect();
              tX = ((pe.clientX - r.left) / r.width - 0.5) * (isTablet() ? 0.6 : 1);
              tY = ((pe.clientY - r.top) / r.height - 0.5) * (isTablet() ? 0.6 : 1);
            });
            on(stage, "pointerleave", () => {
              tX = 0;
              tY = 0;
              hoverT = 0;
            });
            on(stage, "pointerenter", () => {
              hoverT = 1;
            });
          } else {
            const hint = $<HTMLElement>("#robot-hint");
            if (hint) hint.textContent = "Tap to pulse";
          }
          on(stage, "click", () => {
            pulseT = 0;
            hoverT = 1;
          });

          const resize = (): void => {
            const w = cv.clientWidth;
            const h = cv.clientHeight;
            if (!w || !h) return;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
          };
          resize();
          on(window, "resize", resize);

          let visible = false;
          const clock = new THREE.Clock();
          observe(
            new IntersectionObserver(
              (entries) =>
                entries.forEach((e) => {
                  visible = e.isIntersecting;
                  if (visible) resize();
                }),
              { threshold: 0.05 },
            ),
          ).observe(stage);

          loop(() => {
            if (!visible) return;
            const dt = Math.min(0.05, clock.getDelta());
            const t = clock.elapsedTime;
            cX = lerp(cX, tX, 0.06);
            cY = lerp(cY, tY, 0.06);
            hover = lerp(hover, hoverT, 0.08);

            robot.position.y = Math.sin(t * 1.1) * 0.075;
            robot.rotation.y = Math.sin(t * 0.28) * 0.22 + cX * 0.55;
            head.rotation.y = cX * 0.5;
            head.rotation.x = cY * 0.34;
            const breathe = 1 + Math.sin(t * 1.6) * 0.012;
            torso.scale.set(breathe, 1, breathe);

            const b = 0.55 + Math.sin(t * 2.4) * 0.18 + hover * 0.5;
            eyeL.material.color.setRGB(0.21 * b * 2, 0.9 * b, 0.54 * b * 2);
            eyeR.material.color.copy(eyeL.material.color);
            eyeGlow.material.opacity = 0.35 + hover * 0.4 + Math.sin(t * 2.4) * 0.08;
            coreGlow.material.opacity = 0.5 + Math.sin(t * 1.9) * 0.14 + hover * 0.3;
            core.scale.setScalar(1 + Math.sin(t * 1.9) * 0.07 + hover * 0.12);
            rim.intensity = 2.2 + hover * 1.6 + Math.sin(t * 1.3) * 0.25;

            rings.forEach((r, i) => {
              r.rotation.z += dt * (0.25 + i * 0.15) * (i % 2 ? -1 : 1);
              r.position.y = -1.15 - i * 0.06 + Math.sin(t * 1.1 + i) * 0.02;
            });
            atoms.rotation.y += dt * 0.06;
            const apos = ag.attributes.position.array;
            for (let i = 0; i < PN; i++) {
              const y = (apos[i * 3 + 1] ?? 0) + dt * 0.06;
              apos[i * 3 + 1] = y > 1.8 ? -1.8 : y;
            }
            ag.attributes.position.needsUpdate = true;

            if (pulseT >= 0) {
              pulseT += dt * 1.5;
              pulse.scale.setScalar(1 + pulseT * 2.6);
              pulse.material.opacity = Math.max(0, 0.85 - pulseT);
              if (pulseT > 1) {
                pulseT = -1;
                pulse.material.opacity = 0;
              }
            }
            platRing.material.opacity = 0.28 + Math.sin(t * 1.4) * 0.1 + hover * 0.2;
            renderer.render(scene, camera);
          });
        }
      }

      /* ---------- INTELLIGENCE CORE SCENE ---------- */
      {
        const cv = $<HTMLCanvasElement>("#core-canvas");
        const stage = $<HTMLElement>("#core-stage");
        const labelHost = $<HTMLElement>("#core-labels");
        if (cv && stage && labelHost) {
          const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
          renderer.setPixelRatio(DPR);
          cleanups.push(() => renderer.dispose());
          const scene = new THREE.Scene();
          const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 60);
          camera.position.set(0, 0.4, 7.2);

          const group = new THREE.Group();
          scene.add(group);
          const ico = new THREE.Mesh(
            new THREE.IcosahedronGeometry(1.25, 1),
            new THREE.MeshBasicMaterial({
              color: 0x00ff41,
              wireframe: true,
              transparent: true,
              opacity: 0.3,
            }),
          );
          group.add(ico);
          const shell = new THREE.Mesh(
            new THREE.SphereGeometry(1.02, 32, 24),
            new THREE.MeshBasicMaterial({ color: 0x0a1a0e, transparent: true, opacity: 0.6 }),
          );
          group.add(shell);
          const inner = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 28, 20),
            new THREE.MeshBasicMaterial({ color: 0x00ff41, transparent: true, opacity: 0.85 }),
          );
          group.add(inner);
          const coreHalo = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: GLOW,
              transparent: true,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              opacity: 0.6,
            }),
          );
          coreHalo.scale.set(4.4, 4.4, 1);
          scene.add(coreHalo);

          const names = ["Reasoning", "Context", "Vision", "Code", "Knowledge", "Tools"];
          const nodes: Array<{
            m: THREENamespace.Mesh<THREENamespace.MeshBasicMaterial>;
            el: HTMLElement;
            base: THREENamespace.Vector3;
            off: number;
          }> = [];
          names.forEach((n, i) => {
            const phi = Math.acos(1 - (2 * (i + 0.5)) / names.length);
            const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
            const v = new THREE.Vector3(
              Math.sin(phi) * Math.cos(theta),
              Math.cos(phi) * 0.72,
              Math.sin(phi) * Math.sin(theta),
            ).multiplyScalar(2.85);
            const m = new THREE.Mesh(
              new THREE.SphereGeometry(0.075, 18, 12),
              new THREE.MeshBasicMaterial({ color: 0x00ff41 }),
            );
            m.position.copy(v);
            group.add(m);
            const el = document.createElement("div");
            el.className = "node-label";
            el.innerHTML = `<b>·</b> ${n}`;
            labelHost.appendChild(el);
            nodes.push({ m, el, base: v.clone(), off: Math.random() * 6 });
          });
          const lgeo = new THREE.BufferGeometry();
          const larr = new Float32Array(names.length * 6);
          lgeo.setAttribute("position", new THREE.BufferAttribute(larr, 3));
          const links = new THREE.LineSegments(
            lgeo,
            new THREE.LineBasicMaterial({ color: 0x00ff41, transparent: true, opacity: 0.28 }),
          );
          group.add(links);

          // travelling data motes
          const MN = isMobile() ? 60 : 180;
          const mp = new Float32Array(MN * 3);
          const mstate: Array<{ n: number; t: number; s: number }> = [];
          for (let i = 0; i < MN; i++) {
            mstate.push({
              n: Math.floor(Math.random() * names.length),
              t: Math.random(),
              s: 0.16 + Math.random() * 0.3,
            });
          }
          const mg = new THREE.BufferGeometry();
          mg.setAttribute("position", new THREE.BufferAttribute(mp, 3));
          const motes = new THREE.Points(
            mg,
            new THREE.PointsMaterial({
              color: 0x6cff92,
              size: 0.05,
              transparent: true,
              opacity: 0.85,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            }),
          );
          group.add(motes);

          const resize = (): void => {
            const w = cv.clientWidth;
            const h = cv.clientHeight;
            if (!w || !h) return;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
          };
          resize();
          on(window, "resize", resize);

          let mx = 0;
          let my = 0;
          on(stage, "pointermove", (e) => {
            const pe = e as PointerEvent;
            const r = stage.getBoundingClientRect();
            mx = (pe.clientX - r.left) / r.width - 0.5;
            my = (pe.clientY - r.top) / r.height - 0.5;
          });
          on(stage, "pointerleave", () => {
            mx = 0;
            my = 0;
          });

          let visible = false;
          const clock = new THREE.Clock();
          const v3 = new THREE.Vector3();
          observe(
            new IntersectionObserver(
              (entries) =>
                entries.forEach((e) => {
                  visible = e.isIntersecting;
                  if (visible) resize();
                }),
              { threshold: 0.05 },
            ),
          ).observe(stage);

          loop(() => {
            if (!visible) return;
            const dt = Math.min(0.05, clock.getDelta());
            const t = clock.elapsedTime;
            group.rotation.y += dt * 0.14;
            group.rotation.x = lerp(group.rotation.x, my * 0.35, 0.05);
            camera.position.x = lerp(camera.position.x, mx * 1.1, 0.05);
            camera.lookAt(0, 0, 0);
            ico.rotation.y -= dt * 0.28;
            ico.rotation.x += dt * 0.1;
            inner.scale.setScalar(1 + Math.sin(t * 2.1) * 0.07);
            coreHalo.material.opacity = 0.45 + Math.sin(t * 1.7) * 0.12;
            links.material.opacity = 0.2 + Math.sin(t * 1.5) * 0.08;

            const w = cv.clientWidth;
            const h = cv.clientHeight;
            nodes.forEach((n, i) => {
              const bob = Math.sin(t * 0.9 + n.off) * 0.12;
              n.m.position.copy(n.base).multiplyScalar(1 + bob * 0.06);
              n.m.position.y += bob * 0.4;
              larr[i * 6] = 0;
              larr[i * 6 + 1] = 0;
              larr[i * 6 + 2] = 0;
              larr[i * 6 + 3] = n.m.position.x;
              larr[i * 6 + 4] = n.m.position.y;
              larr[i * 6 + 5] = n.m.position.z;
              v3.copy(n.m.position).applyMatrix4(group.matrixWorld).project(camera);
              const x = (v3.x * 0.5 + 0.5) * w;
              const y = (-v3.y * 0.5 + 0.5) * h;
              n.el.style.transform = `translate(${x}px, ${y}px) translate(-50%,-50%)`;
              n.el.style.opacity =
                v3.z < 1 ? String(0.35 + 0.65 * clamp((1 - v3.z) * 8, 0, 1)) : "0";
            });
            lgeo.attributes.position.needsUpdate = true;

            for (let i = 0; i < MN; i++) {
              const s = mstate[i];
              if (!s) continue;
              s.t += dt * s.s;
              if (s.t > 1) {
                s.t = 0;
                s.n = Math.floor(Math.random() * names.length);
              }
              const target = nodes[s.n]?.m.position;
              if (!target) continue;
              const k = s.t;
              mp[i * 3] = target.x * k;
              mp[i * 3 + 1] = target.y * k;
              mp[i * 3 + 2] = target.z * k;
            }
            mg.attributes.position.needsUpdate = true;
            renderer.render(scene, camera);
          });
        }
      }
    };

    const loadThree = (): void => {
      if (disposed) return;
      if (!hasWebGL()) {
        root.classList.add("no-webgl");
        return;
      }
      if (window.THREE) {
        initGL();
        return;
      }
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
      s.async = true;
      s.onload = initGL;
      s.onerror = () => root.classList.add("no-webgl");
      document.head.appendChild(s);
      cleanups.push(() => s.remove());
    };
    if ("requestIdleCallback" in window) {
      const idleHandle = window.requestIdleCallback(loadThree, { timeout: 1200 });
      cleanups.push(() => window.cancelIdleCallback(idleHandle));
    } else {
      const timeoutHandle = globalThis.setTimeout(loadThree, 200);
      cleanups.push(() => globalThis.clearTimeout(timeoutHandle));
    }

    /* live coordinate readout */
    {
      const el = $<HTMLElement>("#coord");
      if (el) {
        const a = 31.42;
        const b = 73.08;
        const id = window.setInterval(() => {
          const x = (a + (Math.random() - 0.5) * 0.02).toFixed(2);
          const y = (b + (Math.random() - 0.5) * 0.02).toFixed(2);
          el.textContent = `LAT ${x} · LON ${y}`;
        }, 2600);
        cleanups.push(() => clearInterval(id));
      }
    }

    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
      // Leaving before the hero was ready must not strand the boot loader.
      hideBootLoader();
    };
  }, [rootRef]);
}
