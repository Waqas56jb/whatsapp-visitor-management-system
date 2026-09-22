import { useEffect } from 'react';

function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 40 40" fill="none">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="40" y2="40">
          <stop offset="0%" stopColor="#8B6BFF" />
          <stop offset="100%" stopColor="#22E8C8" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#lg)" />
      <path d="M12 20a8 8 0 1 1 3.2 6.4L11 28l1.4-4.2A8 8 0 0 1 12 20Z" stroke="#0D0822" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M17 19.5l2 2 4-4.2" stroke="#0D0822" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export default function Landing({ hidden, navLabel, onOpenLogin }) {
  useEffect(() => {
    const glow = document.getElementById('glow');
    const onMove = (e) => {
      if (!glow) return;
      glow.style.left = e.clientX + 'px';
      glow.style.top = e.clientY + 'px';
    };
    document.addEventListener('mousemove', onMove);

    const phone = document.querySelector('.phone');
    const stage = document.querySelector('.phone-stage');
    let onStageMove;
    let onStageLeave;
    if (stage && phone && window.matchMedia('(min-width:960px)').matches) {
      onStageMove = (e) => {
        const r = stage.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        phone.style.transform = `rotateY(${-16 - x * 14}deg) rotateX(${6 - y * 10}deg) rotateZ(2deg)`;
      };
      onStageLeave = () => {
        phone.style.transform = '';
      };
      stage.addEventListener('mousemove', onStageMove);
      stage.addEventListener('mouseleave', onStageLeave);
    }

    const revealEls = document.querySelectorAll('.reveal, .reveal-scale');
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('show');
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealEls.forEach((el) => io.observe(el));

    const counters = document.querySelectorAll('.counter');
    const cIo = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            const el = en.target;
            const to = parseFloat(el.dataset.to);
            const suffix = el.dataset.suffix || (to % 1 !== 0 ? '%' : '');
            const start = 0;
            const dur = 1400;
            const t0 = performance.now();
            function step(t) {
              const p = Math.min((t - t0) / dur, 1);
              const val = start + (to - start) * (1 - Math.pow(1 - p, 3));
              el.textContent = (to % 1 !== 0 ? val.toFixed(1) : Math.floor(val)) + suffix;
              if (p < 1) requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
            cIo.unobserve(el);
          }
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach((el) => cIo.observe(el));

    const jSteps = document.querySelectorAll('.j-step');
    const jImgs = document.querySelectorAll('.j-img');
    const jIo = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            const step = en.target.dataset.step;
            jSteps.forEach((s) => s.classList.toggle('active', s.dataset.step === step));
            jImgs.forEach((im) => im.classList.toggle('active', im.dataset.step === step));
          }
        });
      },
      { threshold: 0.6 }
    );
    jSteps.forEach((s) => jIo.observe(s));

    return () => {
      document.removeEventListener('mousemove', onMove);
      if (stage && onStageMove) stage.removeEventListener('mousemove', onStageMove);
      if (stage && onStageLeave) stage.removeEventListener('mouseleave', onStageLeave);
      io.disconnect();
      cIo.disconnect();
      jIo.disconnect();
    };
  }, []);

  return (
    <div id="landingPage" style={{ display: hidden ? 'none' : 'block' }}>
      <nav>
        <div className="nav-inner">
          <div className="brand">
            <LogoMark />
            Botho Innovations
          </div>
          <div className="nav-links">
            <a href="#journey">How it works</a>
            <a href="#features">Features</a>
            <a href="#dashboard">Dashboard</a>
            <a href="#security">Security</a>
            <a href="#compare">Compare</a>
          </div>
          <button className="nav-cta" id="navLoginBtn" onClick={onOpenLogin}>
            {navLabel}
          </button>
        </div>
      </nav>

      <header className="hero">
        <div className="orb orb1"></div>
        <div className="orb orb2"></div>
        <div className="orb orb3"></div>
        <div className="wrap hero-grid">
          <div className="reveal show">
            <div className="eyebrow-tag">
              <span className="dot"></span>Built for Botho Innovations
            </div>
            <h1>
              Every visitor, approved and verified <span className="grad">before they reach your door.</span>
            </h1>
            <p className="lead">
              A WhatsApp-native visitor management platform that routes bookings to the right host, issues a secure QR pass on approval, and gives your front desk an instant, tamper-proof way to let people in.
            </p>
            <div className="hero-actions">
              <button className="btn-primary" onClick={onOpenLogin}>
                Client Login →
              </button>
              <a href="#journey" className="btn-ghost">
                See how it works
              </a>
            </div>
            <div className="hero-stats">
              <div className="hero-stat">
                <b>&lt;3 min</b>
                <span>Average check-in time</span>
              </div>
              <div className="hero-stat">
                <b>0</b>
                <span>Apps for visitors to install</span>
              </div>
              <div className="hero-stat">
                <b>256-bit</b>
                <span>Secure pass tokens</span>
              </div>
            </div>
          </div>
          <div className="phone-stage">
            <div className="float-card fc1">
              <div className="ic">✓</div>
              <div>
                <div className="t1">Visit Approved</div>
                <div className="t2">Boikarabelo · Host</div>
              </div>
            </div>
            <div className="phone">
              <div className="phone-screen">
                <div className="chat-head">
                  <div className="av"></div>BoFiNet Visitor Mgmt
                </div>
                <div className="chat-body">
                  <div className="bubble in" style={{ animationDelay: '.1s' }}>
                    Please share your <b>name</b>, <b>host</b> and <b>visit time</b>.
                  </div>
                  <div className="bubble out" style={{ animationDelay: '.5s' }}>
                    Michael Nsima · Boikarabelo · 10:00 AM
                  </div>
                  <div className="bubble in" style={{ animationDelay: '.9s' }}>
                    Request sent. Ref <b>VMS-2026-001245</b> — pending host approval.
                  </div>
                  <div className="bubble in" style={{ animationDelay: '1.3s' }}>
                    ✅ Approved! Here's your entry pass:
                  </div>
                  <div className="bubble qr" style={{ animationDelay: '1.7s' }}>
                    <div className="qr-box"></div>
                    <div style={{ fontSize: '10.5px', color: '#9fb0b5' }}>
                      Show this QR at the gate
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="float-card fc2">
              <div className="ic">🔒</div>
              <div>
                <div className="t1">Access Granted</div>
                <div className="t2">Verified in 1.2s</div>
              </div>
            </div>
            <div className="float-card fc3">
              <div className="ic">📋</div>
              <div>
                <div className="t1">Logged &amp; Audited</div>
                <div className="t2">Reference VMS-001245</div>
              </div>
            </div>
          </div>
        </div>
        <div className="scroll-cue">
          <span>SCROLL</span>
          <div className="line"></div>
        </div>
      </header>

      <div className="trust">
        <p className="lab">DESIGNED FOR ORGANISATIONS THAT TAKE ACCESS SERIOUSLY</p>
        <div className="marquee">
          <span>Corporate HQs</span>
          <span>Universities</span>
          <span>Hotels &amp; Resorts</span>
          <span>Hospitals</span>
          <span>Government Sites</span>
          <span>Data Centres</span>
          <span>Manufacturing Plants</span>
          <span>Corporate HQs</span>
          <span>Universities</span>
          <span>Hotels &amp; Resorts</span>
          <span>Hospitals</span>
          <span>Government Sites</span>
          <span>Data Centres</span>
          <span>Manufacturing Plants</span>
        </div>
      </div>

      <section className="stats-band">
        <div className="wrap stats-grid">
          <div className="stat-box reveal">
            <b className="counter" data-to="99.9">
              0
            </b>
            <span>% pass validation accuracy</span>
          </div>
          <div className="stat-box reveal">
            <b className="counter" data-to="180" data-suffix="s">
              0
            </b>
            <span>Average end-to-end check-in</span>
          </div>
          <div className="stat-box reveal">
            <b className="counter" data-to="256" data-suffix="-bit">
              0
            </b>
            <span>Encrypted access tokens</span>
          </div>
          <div className="stat-box reveal">
            <b className="counter" data-to="24" data-suffix="/7">
              0
            </b>
            <span>Automated host notifications</span>
          </div>
        </div>
      </section>

      <section className="problem">
        <div className="wrap problem-grid">
          <div className="photo-stack reveal-scale">
            <img className="photo-main" src="https://images.unsplash.com/photo-1497366811353-6870744d04b2?q=80&w=1200&auto=format&fit=crop" alt="Modern office lobby" />
            <img className="photo-sub" src="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?q=80&w=800&auto=format&fit=crop" alt="Team meeting" />
            <div className="badge-float">
              <div className="num">15min</div>
              <div className="lab">saved per visitor, on average</div>
            </div>
          </div>
          <div className="reveal">
            <div className="sec-tag">The problem</div>
            <h2 style={{ fontSize: 'clamp(26px,3.2vw,34px)', lineHeight: 1.2, marginBottom: 26 }}>
              Front desks are still running on sign-in sheets and guesswork.
            </h2>
            <div className="problem-list">
              <div className="problem-item">
                <div className="x">✕</div>
                <div>
                  <h4>No record of who's actually inside</h4>
                  <p>Paper logs are slow to fill and impossible to search when something goes wrong.</p>
                </div>
              </div>
              <div className="problem-item">
                <div className="x">✕</div>
                <div>
                  <h4>Hosts find out too late</h4>
                  <p>Visitors wait at reception while someone tracks down the person they're meeting.</p>
                </div>
              </div>
              <div className="problem-item">
                <div className="x">✕</div>
                <div>
                  <h4>Passes can be copied or reused</h4>
                  <p>A printed badge or guessable code offers no real protection at the gate.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="journey" id="journey">
        <div className="wrap">
          <div className="sec-head reveal">
            <div className="sec-tag">The journey</div>
            <h2>From a WhatsApp message to a verified entry, in eight steps.</h2>
            <p>Every step is logged, timestamped and tied to a single secure token — so nothing about a visit is ever left to memory.</p>
          </div>
          <div className="journey-layout">
            <div className="journey-visual">
              <img className="j-img active" data-step="1" src="https://images.unsplash.com/photo-1611746872915-64382b5c76da?q=80&w=1200&auto=format&fit=crop" alt="Visitor on phone" />
              <img className="j-img" data-step="2" src="https://images.unsplash.com/photo-1560472354-b33ff0c44a43?q=80&w=1200&auto=format&fit=crop" alt="Reception desk" />
              <img className="j-img" data-step="3" src="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?q=80&w=1200&auto=format&fit=crop" alt="Office interior" />
              <img className="j-img" data-step="4" src="https://images.unsplash.com/photo-1573497491208-6b1acb260507?q=80&w=1200&auto=format&fit=crop" alt="Meeting room glass wall" />
              <img className="j-img" data-step="5" src="https://images.unsplash.com/photo-1551434678-e076c223a692?q=80&w=1200&auto=format&fit=crop" alt="Business handshake" />
              <img className="j-img" data-step="6" src="https://images.unsplash.com/photo-1516245834210-c4c142787335?q=80&w=1200&auto=format&fit=crop" alt="QR code scan" />
              <img className="j-img" data-step="7" src="https://images.unsplash.com/photo-1558002038-1055907df827?q=80&w=1200&auto=format&fit=crop" alt="Security gate turnstile" />
              <img className="j-img" data-step="8" src="https://images.unsplash.com/photo-1521791136064-7986c2920216?q=80&w=1200&auto=format&fit=crop" alt="Team welcoming visitor" />
              <div className="overlay">
                <span>Live visitor journey preview</span>
              </div>
            </div>
            <div className="j-steps">
              <div className="j-step active" data-step="1">
                <div className="j-num">01</div>
                <h4>Visitor starts a chat</h4>
                <p>They message your WhatsApp number and choose Official or Social visit from a simple menu.</p>
              </div>
              <div className="j-step" data-step="2">
                <div className="j-num">02</div>
                <h4>Visit details collected</h4>
                <p>Name, company, host, purpose, date and time — gathered conversationally, no forms to fill.</p>
              </div>
              <div className="j-step" data-step="3">
                <div className="j-num">03</div>
                <h4>Request confirmed</h4>
                <p>A reference number is issued instantly and the visitor is told their request is pending.</p>
              </div>
              <div className="j-step" data-step="4">
                <div className="j-num">04</div>
                <h4>Host is notified</h4>
                <p>The host gets the full request on WhatsApp with one-tap Approve / Reject buttons.</p>
              </div>
              <div className="j-step" data-step="5">
                <div className="j-num">05</div>
                <h4>Host decides</h4>
                <p>Approval or rejection is recorded immediately and the visitor is updated automatically.</p>
              </div>
              <div className="j-step" data-step="6">
                <div className="j-num">06</div>
                <h4>Secure pass issued</h4>
                <p>A one-time QR code is generated and sent straight to the visitor's chat.</p>
              </div>
              <div className="j-step" data-step="7">
                <div className="j-num">07</div>
                <h4>Gate validation</h4>
                <p>Security scans the QR — the server checks the token in real time, no guessing.</p>
              </div>
              <div className="j-step" data-step="8">
                <div className="j-num">08</div>
                <h4>Access granted</h4>
                <p>Full visitor details appear on screen, the entry is logged, and the visit begins.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="features" id="features">
        <div className="wrap">
          <div className="sec-head reveal">
            <div className="sec-tag">What's included</div>
            <h2>Everything a front desk needs, nothing a visitor has to install.</h2>
          </div>
          <div className="feat-grid">
            <div className="feat-card reveal">
              <div className="feat-ic" style={{ background: '#EFE9FF', color: 'var(--violet-2)' }}>
                💬
              </div>
              <h4>WhatsApp-native booking</h4>
              <p>No app to download — visitors book through a chat they already have open.</p>
            </div>
            <div className="feat-card reveal">
              <div className="feat-ic" style={{ background: '#E9FBF6', color: '#0F9E7F' }}>
                🔑
              </div>
              <h4>Secure QR entry pass</h4>
              <p>A one-time QR token, so the gate never grinds to a halt.</p>
            </div>
            <div className="feat-card reveal">
              <div className="feat-ic" style={{ background: '#FFF1E8', color: 'var(--coral)' }}>
                ⚡
              </div>
              <h4>Real-time host routing</h4>
              <p>Requests reach the right host the moment they're submitted, with one-tap decisions.</p>
            </div>
            <div className="feat-card reveal">
              <div className="feat-ic" style={{ background: '#FFF9E6', color: '#B98900' }}>
                🛡️
              </div>
              <h4>Non-reusable tokens</h4>
              <p>Every pass is single-use, time-bound and cryptographically signed server-side.</p>
            </div>
            <div className="feat-card reveal">
              <div className="feat-ic" style={{ background: '#EAF3FF', color: '#2563EB' }}>
                📊
              </div>
              <h4>Admin dashboard</h4>
              <p>Live visitor counts, host response times and full searchable visit history.</p>
            </div>
            <div className="feat-card reveal">
              <div className="feat-ic" style={{ background: '#F3E8FF', color: '#9333EA' }}>
                📝
              </div>
              <h4>Complete audit trail</h4>
              <p>Every approval, scan and check-in is timestamped for compliance and reporting.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="gallery">
        <div className="wrap">
          <div className="sec-head reveal">
            <div className="sec-tag">Where it lives</div>
            <h2>Built for the spaces your visitors actually pass through.</h2>
          </div>
          <div className="gal-grid">
            <div className="gal-item tall reveal-scale">
              <img src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=1000&auto=format&fit=crop" alt="Modern office building exterior" />
              <div className="cap">Corporate campuses</div>
            </div>
            <div className="gal-item reveal-scale">
              <img src="https://images.unsplash.com/photo-1568992687947-868a62a9f521?q=80&w=800&auto=format&fit=crop" alt="Security camera and gate" />
              <div className="cap">Secured entry points</div>
            </div>
            <div className="gal-item reveal-scale">
              <img src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=800&auto=format&fit=crop" alt="Server room data centre" />
              <div className="cap">Data-centre grade infra</div>
            </div>
            <div className="gal-item reveal-scale">
              <img src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=800&auto=format&fit=crop" alt="Team in meeting room" />
              <div className="cap">Hosts &amp; front-desk teams</div>
            </div>
            <div className="gal-item reveal-scale">
              <img src="https://images.unsplash.com/photo-1573164713988-8665fc963095?q=80&w=800&auto=format&fit=crop" alt="Analytics on screens" />
              <div className="cap">Real-time reporting</div>
            </div>
          </div>
        </div>
      </section>

      <section className="dash" id="dashboard">
        <div className="wrap">
          <div className="sec-head reveal">
            <div className="sec-tag">Admin panel</div>
            <h2>One dashboard to see every visitor, host and pass at a glance.</h2>
          </div>
        </div>
        <div className="dash-frame reveal-scale">
          <div className="dash-top">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div className="dash-inner">
            <div className="dash-cards">
              <div className="dcard">
                <b>128</b>
                <span>Visitors today</span>
                <div className="up">↑ 12% vs yesterday</div>
              </div>
              <div className="dcard">
                <b>14</b>
                <span>Currently on-site</span>
              </div>
              <div className="dcard">
                <b>96%</b>
                <span>Approved within 5 min</span>
              </div>
              <div className="dcard">
                <b>0</b>
                <span>Invalid pass attempts</span>
              </div>
            </div>
            <div className="dash-body-img">
              <img src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1400&auto=format&fit=crop" alt="Analytics dashboard on screen" />
            </div>
          </div>
        </div>
      </section>

      <section className="security" id="security">
        <div className="wrap sec-grid">
          <div className="lock-stage reveal-scale">
            <div className="lock">
              <div className="lock-face">🔐</div>
            </div>
          </div>
          <div className="reveal">
            <div className="sec-tag">Security, by design</div>
            <h2 style={{ fontSize: 'clamp(26px,3.2vw,34px)', lineHeight: 1.2, marginBottom: 26 }}>
              A pass that can't be guessed, copied or reused.
            </h2>
            <div className="sec-points">
              <div className="sec-point">
                <div className="chk">✓</div>
                <div>
                  <h4>256-bit token generation</h4>
                  <p>Each visit gets a cryptographically random token — nothing about it is predictable.</p>
                </div>
              </div>
              <div className="sec-point">
                <div className="chk">✓</div>
                <div>
                  <h4>Server-side validation</h4>
                  <p>Every scan is checked live against the database, never trusted from the QR alone.</p>
                </div>
              </div>
              <div className="sec-point">
                <div className="chk">✓</div>
                <div>
                  <h4>Time-bound &amp; single-use</h4>
                  <p>Passes expire automatically and are marked used the moment they're validated.</p>
                </div>
              </div>
              <div className="sec-point">
                <div className="chk">✓</div>
                <div>
                  <h4>Role-based access</h4>
                  <p>Visitors, hosts, security and admins each see only what their role needs.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="testi">
        <div className="wrap">
          <div className="sec-head reveal">
            <div className="sec-tag">What teams notice first</div>
            <h2>The kind of feedback front-desk teams give after week one.</h2>
          </div>
          <div className="testi-grid">
            <div className="t-card reveal">
              <div className="stars">★★★★★</div>
              <p>"Reception stopped calling upstairs to find hosts. Everyone just approves from their phone now."</p>
              <div className="t-who">
                <div className="t-avatar"></div>
                <div>
                  <b>Facilities Manager</b>
                  <span>Regional office campus</span>
                </div>
              </div>
            </div>
            <div className="t-card reveal">
              <div className="stars">★★★★★</div>
              <p>"The QR pass matters more than we expected — the camera at our gate is old and it never blocks anyone now."</p>
              <div className="t-who">
                <div className="t-avatar"></div>
                <div>
                  <b>Security Lead</b>
                  <span>Corporate headquarters</span>
                </div>
              </div>
            </div>
            <div className="t-card reveal">
              <div className="stars">★★★★★</div>
              <p>"Having a searchable log of every visit finally made our compliance reporting a five-minute job."</p>
              <div className="t-who">
                <div className="t-avatar"></div>
                <div>
                  <b>Operations Director</b>
                  <span>Multi-site organisation</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="compare" id="compare">
        <div className="wrap">
          <div className="sec-head reveal">
            <div className="sec-tag">Why switch</div>
            <h2>Paper sign-in sheets vs. Botho Innovations VMS.</h2>
          </div>
          <table className="comp-table reveal">
            <thead>
              <tr>
                <th></th>
                <th>Manual sign-in</th>
                <th>Botho Innovations VMS</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Host notified of arrival</td>
                <td className="no">Manually, if at all</td>
                <td className="yes">Instantly on WhatsApp</td>
              </tr>
              <tr>
                <td>Entry verification</td>
                <td className="no">Visual check only</td>
                <td className="yes">Signed, single-use token</td>
              </tr>
              <tr>
                <td>Visit history</td>
                <td className="no">Paper, hard to search</td>
                <td className="yes">Searchable, exportable</td>
              </tr>
              <tr>
                <td>Setup for visitors</td>
                <td className="no">Sign a physical log</td>
                <td className="yes">No install, just WhatsApp</td>
              </tr>
              <tr>
                <td>Audit trail for compliance</td>
                <td className="no">Incomplete</td>
                <td className="yes">Full, timestamped</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack">
        <div className="wrap">
          <p className="lab">BUILT ON</p>
          <div className="stack-items">
            <span>WhatsApp Cloud API</span>
            <span>Node.js</span>
            <span>PostgreSQL</span>
            <span>React</span>
            <span>Supabase</span>
          </div>
        </div>
      </section>

      <section className="cta" id="cta">
        <div className="wrap cta-box reveal">
          <h2>Ready to see it working on your own WhatsApp number?</h2>
          <p>Sign in to your client portal to manage visit requests, or ask us for a live walkthrough before anything is locked in.</p>
          <div className="cta-actions">
            <button className="btn-primary" onClick={onOpenLogin}>
              Client Login →
            </button>
            <a href="#journey" className="btn-ghost">
              Review the workflow
            </a>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="foot-top">
            <div className="foot-brand">
              <div className="brand" style={{ fontFamily: 'Space Grotesk', fontWeight: 600 }}>
                Botho Innovations
              </div>
              <p>A WhatsApp-native visitor management platform — secure passes, real-time approvals, complete audit trails.</p>
            </div>
            <div className="foot-cols">
              <div className="foot-col">
                <h5>Product</h5>
                <a href="#journey">How it works</a>
                <a href="#features">Features</a>
                <a href="#dashboard">Dashboard</a>
              </div>
              <div className="foot-col">
                <h5>Trust</h5>
                <a href="#security">Security</a>
                <a href="#compare">Compare</a>
              </div>
              <div className="foot-col">
                <h5>Get in touch</h5>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenLogin();
                  }}
                >
                  Client Login
                </a>
              </div>
            </div>
          </div>
          <div className="foot-bottom">
            <p>© 2026 Botho Innovations. All rights reserved.</p>
            <p>WhatsApp Visitor Management System</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
