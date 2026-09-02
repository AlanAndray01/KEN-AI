import { useRef } from "react";
import { Link } from "react-router-dom";
import { CLIENT_ROUTES } from "@Ken/shared";
import { useAuth } from "@/hooks/useAuth";
import { useLandingScenes } from "./landing/useLandingScenes";
import "./landing/landing.css";

/**
 * The KEN AI landing page, served at `/`.
 *
 * This is the supplied design carried over section for section. The markup is
 * JSX rather than a raw HTML string so React owns the tree and the placeholder
 * `href="#"` links in the original can point at real routes; everything else —
 * order, copy, classes, SVGs — is the page as delivered.
 *
 * Animation lives in `useLandingScenes`, which drives the canvases and physics
 * imperatively. See the note there for why Three.js is not bundled.
 */
export function HomePage() {
  const rootRef = useRef<HTMLDivElement>(null);
  useLandingScenes(rootRef);

  const { user } = useAuth();
  // Signed-in visitors who land on the marketing page want the app, not signup.
  const startHref = user ? CLIENT_ROUTES.chat : CLIENT_ROUTES.register;
  const startLabel = user ? "Open KEN" : "Start chatting";

  return (
    <div className="landing" ref={rootRef}>
      <svg
        width="0"
        height="0"
        style={{ position: "absolute", pointerEvents: "none" }}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="kenStemG" x1="20" y1="10" x2="34" y2="90" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFFFFF" />
            <stop offset=".55" stopColor="#F5F5F5" />
            <stop offset="1" stopColor="#A9AEA9" />
          </linearGradient>
          <linearGradient id="kenArmG" x1="88" y1="6" x2="44" y2="94" gradientUnits="userSpaceOnUse">
            <stop stopColor="#A9FFC2" />
            <stop offset=".28" stopColor="#6CFF92" />
            <stop offset=".62" stopColor="#00FF41" />
            <stop offset="1" stopColor="#00A62A" />
          </linearGradient>
        </defs>
      </svg>
      <div className="grain" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />

      {/* The loading screen is the boot loader in index.html; `useLandingScenes`
          dismisses it once the hero is ready. */}

      {/* NAV */}
      <header id="nav">
        <a href="#hero" className="logo" aria-label="KEN AI home">
          <KenLogoMark />
          <span className="logo-type">
            KEN <b>AI</b>
          </span>
        </a>
        <nav className="nav-links" aria-label="Primary">
          <a href="#product">Product</a>
          <a href="#models">Models</a>
          <a href="#features">Features</a>
          <a href="#api">API</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className="nav-right">
          <Link to={CLIENT_ROUTES.login} className="btn btn-quiet btn-sm">
            Sign in
          </Link>
          <Link to={startHref} className="btn btn-primary btn-sm">
            Get started
          </Link>
          <button
            className="hamburger"
            id="burger"
            aria-label="Open menu"
            aria-expanded="false"
            aria-controls="mobile-menu"
            type="button"
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>

      <div id="mobile-menu" aria-hidden="true">
        <a href="#product">Product</a>
        <a href="#models">Models</a>
        <a href="#features">Features</a>
        <a href="#api">API</a>
        <a href="#pricing">Pricing</a>
        <div className="mm-cta">
          <Link to={startHref} className="btn btn-primary">
            {startLabel}
          </Link>
          <Link to={CLIENT_ROUTES.login} className="btn btn-ghost">
            Sign in
          </Link>
        </div>
      </div>

      <main>
        {/* HERO */}
        <section id="hero">
          <div className="hero-fallback" aria-hidden="true" />
          <canvas id="hero-canvas" aria-hidden="true" />

          <div className="hero-inner">
            <h1 className="ken-wrap" aria-label="KEN AI">
              <span className="ken-title" aria-hidden="true">
                <span className="drop-letter">K</span>
                <span className="drop-letter">E</span>
                <span className="drop-letter">N</span>
              </span>
              <span className="ai-title" aria-hidden="true">
                AI
              </span>
            </h1>
            <div className="impact-line" aria-hidden="true" />

            <p className="hero-tag hero-reveal">Intelligence without the noise.</p>
            <p className="hero-sub hero-reveal">
              Think, create, code, research, and explore with KEN — an AI assistant built for the way
              you work.
            </p>
            <div className="hero-cta hero-reveal">
              <Link to={startHref} className="btn btn-primary">
                {startLabel}
              </Link>
              <a href="#product" className="btn btn-ghost">
                Explore KEN <ArrowIcon />
              </a>
            </div>
          </div>

          <div className="hero-meta">
            <div className="status">
              <span className="dot" /> All systems nominal
            </div>
            <div className="status" id="coord">
              LAT 31.42 · LON 73.08
            </div>
          </div>
        </section>

        {/* S2 — INTRODUCING KEN */}
        <section className="sec split" id="product">
          <div>
            <p className="eyebrow rv">Introducing KEN</p>
            <h2 className="h2 rv rv-d1">
              One intelligence.
              <br />
              <em>Many possibilities.</em>
            </h2>
            <p className="lede rv rv-d2">
              KEN sits between the question you have and the work you need to finish. Ask it to reason
              through a decision, draft the thing you have been avoiding, read the file you never
              opened, or ship the feature you sketched on a napkin.
            </p>
            <div className="verb-list rv rv-d3">
              <span className="verb">Think</span>
              <span className="verb">Write</span>
              <span className="verb">Code</span>
              <span className="verb">Analyze</span>
              <span className="verb">Research</span>
              <span className="verb">Create</span>
              <span className="verb">Learn</span>
            </div>
            <div className="rv rv-d4" style={{ marginTop: "34px" }}>
              <a href="#features" className="btn btn-ghost">
                See what KEN can do <ArrowIcon />
              </a>
            </div>
          </div>

          <div className="stage rv rv-d2" id="robot-stage">
            <canvas
              id="robot-canvas"
              aria-label="Interactive 3D model of the KEN assistant"
              role="img"
            />
            <div className="stage-hud" aria-hidden="true">
              <span className="stage-hint" id="robot-hint">
                Move your cursor · click to pulse
              </span>
            </div>
          </div>
        </section>

        {/* The one hairline break on the page: it closes the intro block before
            the model story starts. */}
        <div className="divider" />

        {/* S4 — INTELLIGENCE CORE */}
        <section className="sec" style={{ textAlign: "center" }}>
          <p className="eyebrow rv" style={{ marginInline: "auto" }}>
            The model
          </p>
          <h2 className="h2 rv rv-d1">
            Built for intelligence.
            <br />
            <em>Optimized for speed.</em>
          </h2>
          <p className="lede rv rv-d2" style={{ marginInline: "auto", textAlign: "center" }}>
            Reasoning, context, vision, code, knowledge, and tools work as one system — so KEN keeps
            the whole problem in view instead of answering one piece at a time.
          </p>
          <div className="core-stage rv rv-d3" id="core-stage">
            <canvas
              id="core-canvas"
              aria-label="Visualization of KEN's connected capabilities"
              role="img"
            />
            <div id="core-labels" aria-hidden="true" />
          </div>
        </section>

        {/* S5 — MODELS */}
        <section className="sec" id="models">
          <p className="eyebrow rv">Model family</p>
          <h2 className="h2 rv rv-d1">
            Choose the intelligence
            <br />
            that fits the <em>task.</em>
          </h2>
          <p className="lede rv rv-d2">
            Switch models mid-conversation. KEN keeps the context, the files, and the thread.
          </p>

          <div className="model-grid">
            {MODELS.map((model, i) => (
              <article className={`model-card rv rv-d${i + 1}`} key={model.name}>
                <h3 className="model-name">
                  KEN <span>{model.name}</span>
                </h3>
                <p className="model-desc">{model.desc}</p>
                <dl>
                  <div className="spec">
                    <dt>Speed</dt>
                    <dd className="bars" aria-label={`Speed: ${model.speed} of 4`}>
                      <Bars filled={model.speed} />
                    </dd>
                  </div>
                  <div className="spec">
                    <dt>Depth</dt>
                    <dd className="bars" aria-label={`Depth: ${model.depth} of 4`}>
                      <Bars filled={model.depth} />
                    </dd>
                  </div>
                  <div className="spec">
                    <dt>Context</dt>
                    <dd>{model.context}</dd>
                  </div>
                  <div className="spec">
                    <dt>Best for</dt>
                    <dd>{model.bestFor}</dd>
                  </div>
                </dl>
                <p className="status-pill">
                  <i /> Available
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* S6 — CHAT EXPERIENCE */}
        <section className="sec">
          <p className="eyebrow rv">The interface</p>
          <h2 className="h2 rv rv-d1">
            A workspace, not a
            <br />
            <em>text box.</em>
          </h2>

          <div className="chat-frame" id="chat-frame">
            <div className="chat-bar">
              <span className="tl">
                <i />
                <i />
                <i />
              </span>
              <span className="chat-url">ken.ai / workspace</span>
            </div>
            <div className="chat-body">
              <aside className="chat-side">
                <div className="side-new">＋ New conversation</div>
                <p className="side-h">Today</p>
                <div className="side-item active">Onboarding flow rewrite</div>
                <div className="side-item">Q3 churn analysis</div>
                <div className="side-item">Rate limiter in Go</div>
                <p className="side-h">Earlier</p>
                <div className="side-item">Lease agreement review</div>
                <div className="side-item">Landing page copy</div>
                <div className="side-item">Postgres index audit</div>
              </aside>

              <div className="chat-main">
                <div className="chat-top">
                  <div className="model-sel">
                    <b>KEN Code</b> <span>SELECTED</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                  <div className="chat-tools">
                    <span className="tool-chip on">Files</span>
                    <span className="tool-chip">Web</span>
                    <span className="tool-chip">Run</span>
                  </div>
                </div>

                <div className="chat-scroll" id="chat-scroll">
                  <div className="msg me" data-delay="0">
                    <span className="av">YOU</span>
                    <div>
                      <span className="attach">📎 checkout-service.ts · 14 KB</span>
                      <div className="bubble">
                        Our checkout retries are hammering the payment API. Can you add backoff and
                        explain the fix?
                      </div>
                    </div>
                  </div>
                  <div className="msg" data-delay="700">
                    <span className="av ken">KEN</span>
                    <div className="bubble">
                      The retry loop fires every 200 ms with no ceiling, so one slow response turns
                      into a burst. Exponential backoff with jitter spreads the retries out and keeps
                      a failing dependency from cascading.
                      <div className="code-block">
                        <div className="code-head">
                          <span>checkout-service.ts</span>
                          <span>diff</span>
                        </div>
                        <pre>
                          <span className="k">async function</span> <span className="s">retry</span>
                          {"(fn, attempts = "}
                          <span className="n">5</span>
                          {") {\n  "}
                          <span className="k">for</span>
                          {" ("}
                          <span className="k">let</span>
                          {" i = "}
                          <span className="n">0</span>
                          {"; i < attempts; i++) {\n    "}
                          <span className="k">try</span>
                          {" { "}
                          <span className="k">return await</span>
                          {" fn(); }\n    "}
                          <span className="k">catch</span>
                          {" (err) {\n      "}
                          <span className="k">if</span>
                          {" (i === attempts - "}
                          <span className="n">1</span>
                          {") "}
                          <span className="k">throw</span>
                          {" err;\n      "}
                          <span className="c">{"// 200ms → 3.2s, ±30% jitter"}</span>
                          {"\n      "}
                          <span className="k">const</span>
                          {" wait = "}
                          <span className="n">200</span>
                          {" * "}
                          <span className="n">2</span>
                          {" ** i * ("}
                          <span className="n">0.7</span>
                          {" + Math.random() * "}
                          <span className="n">0.6</span>
                          {");\n      "}
                          <span className="k">await</span>
                          {" sleep(wait);\n    }\n  }\n}"}
                        </pre>
                      </div>
                    </div>
                  </div>
                  <div className="msg me" data-delay="1500">
                    <span className="av">YOU</span>
                    <div className="bubble">Add a circuit breaker too.</div>
                  </div>
                  <div className="msg" data-delay="2100">
                    <span className="av ken">KEN</span>
                    <div className="bubble">
                      Opening the breaker after five consecutive failures and probing every 30
                      seconds. Want me to write the tests as well?
                    </div>
                  </div>
                </div>

                <div className="composer">
                  <div className="composer-input">
                    Ask KEN anything
                    <span className="caret" />
                  </div>
                  <div className="composer-row">
                    <button className="icon-btn" aria-label="Attach file" type="button">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <path d="M21.4 11.05 12.25 20.2a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.67 3.67 0 1 1 5.19 5.19l-9.2 9.19a1.83 1.83 0 0 1-2.59-2.6l8.49-8.48" />
                      </svg>
                    </button>
                    <button className="icon-btn" aria-label="Voice input" type="button">
                      <span className="voice-wave">
                        <i />
                        <i />
                        <i />
                        <i />
                      </span>
                    </button>
                    <span className="tool-chip">⌘K tools</span>
                    <span style={{ flex: 1 }} />
                    <button className="icon-btn send" aria-label="Send message" type="button">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* S7 — CAPABILITIES */}
        <section className="sec" id="features">
          <p className="eyebrow rv">Capabilities</p>
          <h2 className="h2 rv rv-d1">
            More than a <em>chatbot.</em>
          </h2>

          <div className="cap-grid">
            <article className="cap rv">
              <span className="cap-idx">01</span>
              <svg className="cap-ico" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.2">
                <circle cx="20" cy="20" r="12" />
                <path d="M20 8v24M8 20h24" opacity=".35" />
                <circle cx="20" cy="20" r="4" fill="currentColor" stroke="none" opacity=".8" />
              </svg>
              <h4>Think</h4>
              <p>Reason through difficult problems and hold the whole thread while doing it.</p>
            </article>
            <article className="cap rv rv-d1">
              <span className="cap-idx">02</span>
              <svg className="cap-ico" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M20 6v28M6 20h28" opacity=".35" />
                <path d="m11 11 18 18M29 11 11 29" />
                <circle cx="20" cy="20" r="3" fill="currentColor" stroke="none" />
              </svg>
              <h4>Create</h4>
              <p>Generate content and ideas in your voice, then refine them line by line.</p>
            </article>
            <article className="cap rv rv-d2">
              <span className="cap-idx">03</span>
              <svg className="cap-ico" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="m14 13-8 7 8 7M26 13l8 7-8 7M22 9l-4 22" />
              </svg>
              <h4>Code</h4>
              <p>Build, debug, and understand software across the languages you actually use.</p>
            </article>
            <article className="cap rv rv-d3">
              <span className="cap-idx">04</span>
              <svg className="cap-ico" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.4">
                <circle cx="18" cy="18" r="10" />
                <path d="m26 26 8 8" />
                <path d="M18 13v10M13 18h10" opacity=".45" />
              </svg>
              <h4>Research</h4>
              <p>Explore information across sources and synthesize what actually matters.</p>
            </article>
            <article className="cap rv">
              <span className="cap-idx">05</span>
              <svg className="cap-ico" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M8 32V19M16 32V10M24 32v-8M32 32V15" />
                <path d="M6 34h28" opacity=".4" />
              </svg>
              <h4>Analyze</h4>
              <p>Read documents, spreadsheets, and images, and turn them into an answer.</p>
            </article>
            <article className="cap rv rv-d1">
              <span className="cap-idx">06</span>
              <svg className="cap-ico" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.4">
                <rect x="7" y="9" width="26" height="22" rx="3" />
                <path d="m7 25 7-7 6 6 5-5 8 8" />
                <circle cx="26" cy="16" r="2.4" />
              </svg>
              <h4>Create images</h4>
              <p>Turn a description into a visual, then iterate on it in the same conversation.</p>
            </article>
            <article className="cap rv rv-d2">
              <span className="cap-idx">07</span>
              <svg className="cap-ico" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M10 12h20v18a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2z" />
                <path d="M14 8v8M26 8v8" />
                <path d="M15 22h10M15 27h6" opacity=".55" />
              </svg>
              <h4>Remember</h4>
              <p>Keep the context that matters to you, and forget what you ask it to forget.</p>
            </article>
            <article className="cap rv rv-d3">
              <span className="cap-idx">08</span>
              <svg className="cap-ico" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.4">
                <circle cx="12" cy="12" r="4" />
                <circle cx="28" cy="12" r="4" />
                <circle cx="20" cy="28" r="4" />
                <path d="M14.8 14.8 18 24.4M25.2 14.8 22 24.4M16 12h8" opacity=".5" />
              </svg>
              <h4>Use tools</h4>
              <p>Connect intelligence to action — search, run code, and call your own systems.</p>
            </article>
          </div>
        </section>

        {/* S8 — KEN IN ACTION */}
        <section id="story" aria-label="KEN in action">
          <div className="story-sticky">
            <div className="story-track" id="story-track">
              <article className="story-panel">
                <div>
                  <p className="story-num">01 — BUILD</p>
                  <h3 className="story-title">Build</h3>
                  <p className="story-copy">
                    Turn an idea into a working application — scaffolding, logic, tests, and the parts
                    you would have looked up.
                  </p>
                </div>
                <div className="story-visual">
                  <svg viewBox="0 0 200 200" fill="none" stroke="#00FF41" strokeWidth="1">
                    <rect x="40" y="40" width="120" height="120" rx="6" opacity=".35" />
                    <rect x="60" y="60" width="80" height="80" rx="4" opacity=".55" />
                    <rect x="80" y="80" width="40" height="40" rx="3" />
                    <path d="M100 10v30M100 160v30M10 100h30M160 100h30" opacity=".3" />
                    <circle cx="100" cy="100" r="6" fill="#00FF41" stroke="none" />
                  </svg>
                </div>
              </article>
              <article className="story-panel">
                <div>
                  <p className="story-num">02 — RESEARCH</p>
                  <h3 className="story-title">Research</h3>
                  <p className="story-copy">
                    Explore complex topics, compare what sources disagree on, and extract what matters
                    to your decision.
                  </p>
                </div>
                <div className="story-visual">
                  <svg viewBox="0 0 200 200" fill="none" stroke="#00FF41" strokeWidth="1">
                    <circle cx="100" cy="100" r="70" opacity=".25" />
                    <circle cx="100" cy="100" r="45" opacity=".4" />
                    <circle cx="100" cy="100" r="20" opacity=".7" />
                    <circle cx="100" cy="30" r="4" fill="#00FF41" stroke="none" />
                    <circle cx="162" cy="130" r="4" fill="#00FF41" stroke="none" />
                    <circle cx="45" cy="140" r="4" fill="#00FF41" stroke="none" />
                    <path d="M100 30 100 80M162 130 118 108M45 140 84 112" opacity=".4" />
                  </svg>
                </div>
              </article>
              <article className="story-panel">
                <div>
                  <p className="story-num">03 — CREATE</p>
                  <h3 className="story-title">Create</h3>
                  <p className="story-copy">
                    Transform rough thoughts into polished content that still sounds like you wrote it.
                  </p>
                </div>
                <div className="story-visual">
                  <svg viewBox="0 0 200 200" fill="none" stroke="#00FF41" strokeWidth="1">
                    <path d="M50 150 150 50" strokeWidth="1.5" />
                    <path d="M50 150l10-34 90-90 24 24-90 90z" opacity=".4" />
                    <path d="M40 170h120" opacity=".3" />
                    <circle cx="150" cy="50" r="5" fill="#00FF41" stroke="none" />
                  </svg>
                </div>
              </article>
              <article className="story-panel">
                <div>
                  <p className="story-num">04 — ANALYZE</p>
                  <h3 className="story-title">Analyze</h3>
                  <p className="story-copy">
                    Turn documents and data into insight — what changed, what is unusual, and what to
                    do next.
                  </p>
                </div>
                <div className="story-visual">
                  <svg viewBox="0 0 200 200" fill="none" stroke="#00FF41" strokeWidth="1">
                    <path d="M30 160h140" opacity=".4" />
                    <path d="M30 160V40" opacity=".4" />
                    <path d="M40 140l30-40 30 25 30-60 30 35" strokeWidth="1.6" />
                    <circle cx="70" cy="100" r="3.5" fill="#00FF41" stroke="none" />
                    <circle cx="130" cy="65" r="3.5" fill="#00FF41" stroke="none" />
                    <path d="M40 120h130M40 90h130" opacity=".15" />
                  </svg>
                </div>
              </article>
              <article className="story-panel">
                <div>
                  <p className="story-num">05 — LEARN</p>
                  <h3 className="story-title">Learn</h3>
                  <p className="story-copy">
                    Understand difficult concepts faster, at the depth you ask for, without the lecture.
                  </p>
                </div>
                <div className="story-visual">
                  <svg viewBox="0 0 200 200" fill="none" stroke="#00FF41" strokeWidth="1">
                    <circle cx="100" cy="100" r="60" opacity=".3" />
                    <path d="M100 40c25 20 25 100 0 120-25-20-25-100 0-120z" opacity=".55" />
                    <path d="M40 100h120" opacity=".4" />
                    <circle cx="100" cy="100" r="8" fill="#00FF41" stroke="none" opacity=".85" />
                  </svg>
                </div>
              </article>
            </div>
            <div className="story-prog" aria-hidden="true">
              <span id="story-label">BUILD</span>
              <span className="prog-rail">
                <i id="story-bar" />
              </span>
              <span>05</span>
            </div>
          </div>
        </section>

        {/* S9 — DEVELOPER */}
        <section className="sec api-grid" id="api">
          <div>
            <p className="eyebrow rv">Developers</p>
            <h2 className="h2 rv rv-d1">
              Build with <em>KEN.</em>
            </h2>
            <p className="lede rv rv-d2">
              One endpoint, streaming by default, with tool calling and structured outputs that behave
              the same across every model in the family.
            </p>
            <div className="api-list rv rv-d3">
              <div className="api-item">
                <b>REST API</b>
                <span>Predictable schemas, versioned</span>
              </div>
              <div className="api-item">
                <b>SDKs</b>
                <span>TypeScript, Python, Go</span>
              </div>
              <div className="api-item">
                <b>Streaming</b>
                <span>Token-level server-sent events</span>
              </div>
              <div className="api-item">
                <b>Tool calling</b>
                <span>Let KEN call your functions</span>
              </div>
              <div className="api-item">
                <b>Structured output</b>
                <span>Schema-validated JSON</span>
              </div>
              <div className="api-item">
                <b>Model access</b>
                <span>Fast, Reason, Vision, Code</span>
              </div>
            </div>
            <div className="rv rv-d4" style={{ marginTop: "30px" }}>
              <a href="#api" className="btn btn-primary">
                Explore API
              </a>
            </div>
          </div>

          <div className="editor rv rv-d2" id="editor">
            <div className="editor-bar">
              <span className="tl">
                <i />
                <i />
                <i />
              </span>
              <span>stream.ts</span>
              <span className="editor-tabs">
                <span className="on">TS</span>
                <span>PY</span>
                <span>GO</span>
              </span>
            </div>
            <pre>
              <span className="ln">
                <span className="k">import</span>
                {" { Ken } "}
                <span className="k">from</span> <span className="s">&quot;@ken-ai/sdk&quot;</span>;
              </span>
              <span className="ln" />
              <span className="ln">
                <span className="k">const</span>
                {" ken = "}
                <span className="k">new</span> <span className="n">Ken</span>
                {"({ apiKey: process.env.KEN_API_KEY });"}
              </span>
              <span className="ln" />
              <span className="ln">
                <span className="k">const</span>
                {" stream = "}
                <span className="k">await</span>
                {" ken.messages.stream({"}
              </span>
              <span className="ln">
                {"  model: "}
                <span className="s">&quot;ken-reason&quot;</span>,
              </span>
              <span className="ln">
                {"  messages: [{ role: "}
                <span className="s">&quot;user&quot;</span>
                {", content: "}
                <span className="s">&quot;Summarise this contract.&quot;</span>
                {" }],"}
              </span>
              <span className="ln">{"  tools: [fileReader, calculator],"}</span>
              <span className="ln">{"});"}</span>
              <span className="ln" />
              <span className="ln">
                <span className="k">for await</span>
                {" ("}
                <span className="k">const</span>
                {" event "}
                <span className="k">of</span>
                {" stream) {"}
              </span>
              <span className="ln">
                {"  "}
                <span className="k">if</span>
                {" (event.type === "}
                <span className="s">&quot;text&quot;</span>
                {") process.stdout.write(event.text);"}
              </span>
              <span className="ln">{"}"}</span>
            </pre>
          </div>
        </section>

        {/* S10 — PERFORMANCE */}
        <section className="sec" style={{ textAlign: "center" }}>
          <p className="eyebrow rv" style={{ marginInline: "auto" }}>
            Performance
          </p>
          <h2 className="h2 rv rv-d1">
            Fast enough to feel <em>instant.</em>
          </h2>
          <p className="lede rv rv-d2" style={{ marginInline: "auto", textAlign: "center" }}>
            Responses begin streaming as they are generated, so you read the first sentence while KEN
            is still writing the last one.
          </p>

          <div className="perf-stage rv rv-d3">
            <canvas id="perf-canvas" aria-hidden="true" />
            <div className="perf-steps" style={{ textAlign: "left" }}>
              <div className="perf-step" data-step="0">
                <b>Request</b>
                <span>Your prompt, files, and context leave the client.</span>
              </div>
              <div className="perf-step" data-step="1">
                <b>Processing</b>
                <span>KEN plans, retrieves, and reasons over the task.</span>
              </div>
              <div className="perf-step" data-step="2">
                <b>Response</b>
                <span>Tokens stream back the moment they exist.</span>
              </div>
            </div>
          </div>
        </section>

        {/* S11 — PRIVACY */}
        <section className="sec">
          <p className="eyebrow rv">Privacy &amp; security</p>
          <h2 className="h2 rv rv-d1">
            Your intelligence <em>stays yours.</em>
          </h2>

          <div className="trust-grid">
            <article className="trust rv">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="4" y="10" width="16" height="11" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              <h4>Privacy by default</h4>
              <p>Your conversations are not used to train models unless you choose to share them.</p>
            </article>
            <article className="trust rv rv-d1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 3l8 3v6c0 5-3.4 8.3-8 9.5C7.4 20.3 4 17 4 12V6z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <h4>Secure infrastructure</h4>
              <p>Encrypted in transit and at rest, with isolated workloads and audited access.</p>
            </article>
            <article className="trust rv rv-d2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 6h16M4 12h16M4 18h16" />
                <circle cx="9" cy="6" r="2" fill="currentColor" />
                <circle cx="15" cy="12" r="2" fill="currentColor" />
                <circle cx="8" cy="18" r="2" fill="currentColor" />
              </svg>
              <h4>Data controls</h4>
              <p>Decide what KEN retains, per workspace, with retention settings you can change.</p>
            </article>
            <article className="trust rv">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 12a9 9 0 1 1-9-9" />
                <path d="M21 4v5h-5" />
                <path d="M12 8v4l3 2" />
              </svg>
              <h4>Conversation management</h4>
              <p>Export a thread, archive it, or delete it permanently — including its attachments.</p>
            </article>
            <article className="trust rv rv-d1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="9" r="3.5" />
                <path d="M5 20a7 7 0 0 1 14 0" />
                <path d="M18 4l2 2 3-3" />
              </svg>
              <h4>Account security</h4>
              <p>SSO, two-factor authentication, device sessions, and role-based access for teams.</p>
            </article>
            <article className="trust rv rv-d2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M7 9h10M7 13h6" />
                <path d="m14.5 16.5 2 2 4-4" strokeWidth="1.8" />
              </svg>
              <h4>Clear terms</h4>
              <p>Plain-language policies describing what is stored, for how long, and why.</p>
            </article>
          </div>
        </section>

        {/* S12 — PRICING */}
        <section className="sec" id="pricing">
          <p className="eyebrow rv">Pricing</p>
          <h2 className="h2 rv rv-d1">
            Start with <em>KEN.</em>
          </h2>
          <p className="lede rv rv-d2">
            Upgrade when you hit a limit, not before. Every plan includes the full model family.
          </p>

          <div className="price-grid">
            <article className="plan rv rv-d1">
              <div className="plan-top">
                <h4>Free</h4>
              </div>
              <p className="price">
                $0<small>/ month</small>
              </p>
              <ul>
                <li>
                  <CheckIcon />
                  KEN Fast for everyday chat
                </li>
                <li>
                  <CheckIcon />
                  File and image uploads
                </li>
                <li>
                  <CheckIcon />
                  Conversation history
                </li>
                <li>
                  <CheckIcon />
                  Web and mobile apps
                </li>
              </ul>
              <p className="usage">Daily message limit</p>
              <Link to={startHref} className="btn btn-ghost">
                Start free
              </Link>
            </article>

            <article className="plan rec rv rv-d2">
              <div className="plan-top">
                <h4>Pro</h4>
                <span className="rec-tag">Recommended</span>
              </div>
              <p className="price">
                $20<small>/ month</small>
              </p>
              <ul>
                <li>
                  <CheckIcon />
                  Every model, including Reason and Code
                </li>
                <li>
                  <CheckIcon />
                  Higher limits and priority capacity
                </li>
                <li>
                  <CheckIcon />
                  Memory, tools, and image generation
                </li>
                <li>
                  <CheckIcon />
                  Early access to new releases
                </li>
              </ul>
              <p className="usage">Extended usage</p>
              <Link to={startHref} className="btn btn-primary">
                Get Pro
              </Link>
            </article>

            <article className="plan rv rv-d3">
              <div className="plan-top">
                <h4>Team</h4>
              </div>
              <p className="price">
                $30<small>/ user / month</small>
              </p>
              <ul>
                <li>
                  <CheckIcon />
                  Everything in Pro
                </li>
                <li>
                  <CheckIcon />
                  Shared projects and prompt library
                </li>
                <li>
                  <CheckIcon />
                  Admin console, SSO, and roles
                </li>
                <li>
                  <CheckIcon />
                  Central billing and usage reporting
                </li>
              </ul>
              <p className="usage">Pooled workspace usage</p>
              <Link to={startHref} className="btn btn-ghost">
                Contact sales
              </Link>
            </article>
          </div>
        </section>

        {/* S13 — FAQ */}
        <section className="sec">
          <p className="eyebrow rv" style={{ marginInline: "auto", display: "flex", justifyContent: "center" }}>
            Questions
          </p>
          <h2 className="h2 rv rv-d1" style={{ textAlign: "center" }}>
            Before you <em>start.</em>
          </h2>
          <div className="faq rv rv-d2" id="faq">
            {FAQS.map((faq) => (
              <div className="faq-item" key={faq.q}>
                <button className="faq-q" aria-expanded="false" type="button">
                  {faq.q}
                  <span className="faq-ico" aria-hidden="true" />
                </button>
                <div className="faq-a">
                  <p>{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* S14 — FINAL CTA */}
        <section id="final">
          <canvas id="final-canvas" aria-hidden="true" />
          <div className="final-inner">
            <div className="mini-bot" aria-hidden="true">
              <canvas id="mini-canvas" />
            </div>
            <h2 className="final-h rv">
              The future of thinking <em>starts here.</em>
            </h2>
            <p className="final-mark rv rv-d1">
              Meet KEN<span>.</span>
            </p>
            <div className="hero-cta rv rv-d2" style={{ marginTop: "34px" }}>
              <Link to={startHref} className="btn btn-primary">
                {startLabel}
              </Link>
              <a href="#product" className="btn btn-ghost">
                Explore KEN <ArrowIcon />
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer>
        <div className="foot-grid">
          <div className="foot-about">
            <a href="#hero" className="logo">
              <KenLogoMark />
              <span className="logo-type">
                KEN <b>AI</b>
              </span>
            </a>
            <p>An AI assistant and platform for thinking, building, and getting real work finished.</p>
          </div>
          <div className="foot-col">
            <h5>Product</h5>
            <ul>
              <li>
                <Link to={startHref}>Chat</Link>
              </li>
              <li>
                <a href="#models">Models</a>
              </li>
              <li>
                <a href="#features">Features</a>
              </li>
              <li>
                <a href="#api">API</a>
              </li>
              <li>
                <a href="#pricing">Pricing</a>
              </li>
            </ul>
          </div>
          <div className="foot-col">
            <h5>Resources</h5>
            <ul>
              <li>
                <a href="#api">Documentation</a>
              </li>
              <li>
                <a href="#api">Developers</a>
              </li>
              <li>
                <a href="#faq">Help center</a>
              </li>
              <li>
                <a href="#features">Blog</a>
              </li>
            </ul>
          </div>
          <div className="foot-col">
            <h5>Company</h5>
            <ul>
              <li>
                <a href="#product">About</a>
              </li>
              <li>
                <a href="#product">Careers</a>
              </li>
              <li>
                <a href="#final">Contact</a>
              </li>
            </ul>
          </div>
          <div className="foot-col">
            <h5>Legal</h5>
            <ul>
              <li>
                <Link to={CLIENT_ROUTES.privacy}>Privacy</Link>
              </li>
              <li>
                <Link to={CLIENT_ROUTES.terms}>Terms</Link>
              </li>
              <li>
                <a href="#security">Security</a>
              </li>
            </ul>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© KEN AI</span>
          <div className="socials">
            <a href="#hero" aria-label="X">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.2 2H21l-6.6 7.5L22.2 22h-6l-4.7-6.2L6.1 22H3.3l7-8L2.1 2h6.2l4.3 5.7zm-1 18h1.6L7.9 3.7H6.2z" />
              </svg>
            </a>
            <a href="#hero" aria-label="GitHub">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 3 .8.1-.7.4-1.1.7-1.4-2.2-.2-4.6-1.1-4.6-4.9 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.6 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.3.1 2.6.6.7 1 1.6 1 2.7 0 3.8-2.4 4.7-4.6 4.9.4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2z" />
              </svg>
            </a>
            <a href="#hero" aria-label="LinkedIn">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M4.98 3.5A2.5 2.5 0 1 1 0 3.5a2.5 2.5 0 0 1 4.98 0zM.2 8.4h4.6V24H.2zM8.4 8.4h4.4v2.1h.1c.6-1.1 2.1-2.3 4.3-2.3 4.6 0 5.4 3 5.4 6.9V24h-4.6v-7.9c0-1.9 0-4.3-2.6-4.3s-3 2-3 4.1V24H8.4z" />
              </svg>
            </a>
            <a href="#hero" aria-label="YouTube">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M23 12s0-3.8-.5-5.6a2.9 2.9 0 0 0-2-2C18.7 4 12 4 12 4s-6.7 0-8.5.4a2.9 2.9 0 0 0-2 2C1 8.2 1 12 1 12s0 3.8.5 5.6a2.9 2.9 0 0 0 2 2C5.3 20 12 20 12 20s6.7 0 8.5-.4a2.9 2.9 0 0 0 2-2C23 15.8 23 12 23 12zM9.8 15.5v-7l6 3.5z" />
              </svg>
            </a>
          </div>
          <span>Intelligence without the noise.</span>
        </div>
      </footer>
    </div>
  );
}

/** The KEN mark, as it appears in the nav and footer of the supplied design. */
function KenLogoMark() {
  return (
    <svg className="ken-mark" viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <g transform="translate(1 0) skewX(-7)">
        <path d="M27 10h7v80H20V19z" fill="url(#kenStemG)" />
        <path d="M27 24h3v62h-3z" fill="#121212" fillOpacity=".62" />
        <path d="M86 10 42 50l42 40" stroke="url(#kenArmG)" strokeWidth="14" />
        <path d="M86 10 42 50l42 40" stroke="#121212" strokeWidth="3.4" strokeOpacity=".52" />
        <path d="M86 10 42 50l42 40" stroke="#C9FFDA" strokeWidth=".9" strokeOpacity=".5" />
        <path
          d="M76 4.9 45.5 32.6M44.8 67.2 73.9 94.8"
          stroke="url(#kenArmG)"
          strokeWidth="1.3"
          strokeOpacity=".45"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

function Bars({ filled }: { filled: number }) {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <i key={i} className={i < filled ? "f" : undefined} />
      ))}
    </>
  );
}

const MODELS = [
  {
    name: "Fast",
    desc: "Everyday questions, quick drafts, and back-and-forth that should feel instant.",
    speed: 4,
    depth: 2,
    context: "Standard",
    bestFor: "Daily chat",
  },
  {
    name: "Reason",
    desc: "Multi-step problems, tradeoffs, and work that benefits from thinking before answering.",
    speed: 2,
    depth: 4,
    context: "Extended",
    bestFor: "Hard problems",
  },
  {
    name: "Vision",
    desc: "Screenshots, diagrams, scans, and photos — read, described, and reasoned about.",
    speed: 3,
    depth: 3,
    context: "Extended",
    bestFor: "Visual input",
  },
  {
    name: "Code",
    desc: "Reads repositories, writes changes, explains failures, and stays in your stack.",
    speed: 3,
    depth: 4,
    context: "Long",
    bestFor: "Engineering",
  },
] as const;

const FAQS = [
  {
    q: "What is KEN AI?",
    a: "KEN is an AI assistant and platform. You can chat with it in the app, upload files and images for it to read, ask it to write or debug code, and call the same models from your own software through the API.",
  },
  {
    q: "How does KEN compare to other AI assistants?",
    a: "KEN is built around one workspace rather than a series of disconnected chats. Models, files, memory, and tools stay in the same thread, so switching from a quick answer to deep work does not mean starting over. The honest answer on quality is to try it on your own work.",
  },
  {
    q: "Which models does KEN support?",
    a: "Four in the KEN family: Fast for everyday conversation, Reason for complex problems, Vision for images and visual input, and Code for engineering work. You can switch between them mid-conversation from the model selector.",
  },
  {
    q: "Can KEN analyze files?",
    a: "Yes. Attach documents, spreadsheets, code, and images, and KEN reads them in context. It can summarise, compare, extract structured data, or answer specific questions against what you uploaded.",
  },
  {
    q: "Can KEN write code?",
    a: "KEN Code writes, reviews, and explains code across common languages and frameworks. It can work from an error message, a file you paste in, or a description of what you want to build.",
  },
  {
    q: "Does KEN remember conversations?",
    a: "On paid plans KEN can remember context you choose to keep — how you like your code formatted, what you are working on, who your team is. You can review what it remembers and delete any of it at any time.",
  },
  {
    q: "Is KEN available through an API?",
    a: "Yes. The API exposes the full model family with streaming, tool calling, and structured outputs, with SDKs for TypeScript, Python, and Go.",
  },
  {
    q: "Is there a free plan?",
    a: "There is. The Free plan includes KEN Fast, file uploads, and history, with a daily message limit. No card required to start.",
  },
] as const;
