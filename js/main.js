/* Fadai Universe — site behaviour */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ── reveal on scroll ─────────────────────────────────────────────── */
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }
  }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
  $$('.reveal').forEach((el) => io.observe(el));

  /* ── nav stuck state ──────────────────────────────────────────────── */
  const nav = $('#nav');
  const onScrollNav = () => nav.classList.toggle('is-stuck', window.scrollY > 40);
  onScrollNav();
  window.addEventListener('scroll', onScrollNav, { passive: true });

  /* ── hero: starfield + orb, fading out as you scroll past ─────────── */
  const starsEl = $('#stars');
  const orbEl = $('#heroOrb');
  let heroEngine = null;
  if (window.FadaiOrb && starsEl && orbEl) {
    new window.FadaiOrb.Starfield(starsEl, 240);
    // the canvas now has its own column, so the orb can never bleed over the copy
    heroEngine = new window.FadaiOrb.OrbEngine(orbEl, {
      count: 2000,
      mode: 'orb',
      zoom: 1.02,
      pointerEl: window
    });

    const fade = () => {
      const h = Math.max(1, window.innerHeight);
      const p = Math.min(1, window.scrollY / (h * 0.85));
      orbEl.style.opacity = String(1 - p);
      starsEl.style.opacity = String(0.9 - p * 0.55);
    };
    fade();
    window.addEventListener('scroll', fade, { passive: true });
  }

  /* ── live stage: lazily started, three morphing forms ─────────────── */
  const stage = $('.stage');
  const demoEl = $('#orbDemo');
  let demo = null;
  let demoStarted = false;

  function startDemo() {
    if (demoStarted || !demoEl || !window.FadaiOrb) return;
    demoStarted = true;
    demo = new window.FadaiOrb.OrbEngine(demoEl, { count: 2100, mode: 'orb', zoom: 0.8, cyf: 0.43, pitch: -0.16 });
  }

  if ('IntersectionObserver' in window && stage) {
    new IntersectionObserver((entries, obs) => {
      for (const e of entries) if (e.isIntersecting) { startDemo(); obs.disconnect(); }
    }, { threshold: 0.25 }).observe(stage);
  } else {
    startDemo();
  }

  /* form chips */
  $$('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      $$('.chip').forEach((c) => {
        const on = c === chip;
        c.classList.toggle('is-active', on);
        c.setAttribute('aria-selected', String(on));
      });
      if (demo) {
        demo.setMode(chip.dataset.mode);
        if (!micLive) note.textContent = `Rendering in real time · ${chip.textContent.trim().toLowerCase()}`;
      }
    });
  });

  /* microphone */
  const micBtn = $('#micBtn');
  const micLabel = $('.mic__label');
  const note = $('#stageNote');
  let micLive = false;

  micBtn && micBtn.addEventListener('click', async () => {
    startDemo();
    if (micLive) return;
    try {
      micLabel.textContent = 'Listening…';
      await demo.useMic();
      micLive = true;
      micBtn.classList.add('is-live');
      micLabel.textContent = 'Microphone live';
      note.textContent = 'Driven by your microphone · processed on this device';
    } catch (err) {
      micLabel.textContent = 'Microphone unavailable';
      note.textContent = 'Mic access blocked — still rendering the synthetic beat';
      setTimeout(() => { if (!micLive) micLabel.textContent = 'Let your own music drive it'; }, 2600);
    }
  });

  /* ── hero CTA downloads the installer directly (no trip to a web page) ─ */
  const REL = 'https://github.com/Dadudu-AI/fadai-universe/releases/download/v1.0.0/';
  const dlHero = $('#dlHero');
  if (dlHero) {
    const pick = (arch) => {
      const ua = navigator.userAgent;
      if (/Windows/i.test(ua)) return ['fadai-universe-Setup-1.0.0.exe', 'Download for Windows'];
      if (/Macintosh|Mac OS X/i.test(ua)) {
        const intel = arch === 'x86';
        return [
          intel ? 'fadai-universe-1.0.0-x64.dmg' : 'fadai-universe-1.0.0-arm64.dmg',
          intel ? 'Download for Mac (Intel)' : 'Download for Mac'
        ];
      }
      return [null, null];
    };

    const apply = (arch) => {
      const [file, label] = pick(arch);
      if (!file) return; // unknown platform → keep the in-page download section
      dlHero.href = REL + file;
      dlHero.setAttribute('download', '');
      dlHero.removeAttribute('target');
      dlHero.innerHTML = label + ' <span aria-hidden="true">↓</span>';
    };

    apply(null); // sensible default before the async arch probe resolves
    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      navigator.userAgentData.getHighEntropyValues(['architecture'])
        .then((d) => apply(d.architecture))
        .catch(() => {});
    }
  }

  /* ── copy the app download address ─────────────────────────────────── */
  const copyBtn = $('#copyDl');
  const dlUrl = $('#dlUrl');
  copyBtn && copyBtn.addEventListener('click', async () => {
    const text = dlUrl.textContent.trim();
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      const r = document.createRange();
      r.selectNodeContents(dlUrl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      document.execCommand && document.execCommand('copy');
      sel.removeAllRanges();
    }
    copyBtn.textContent = 'Copied';
    copyBtn.classList.add('is-done');
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
      copyBtn.classList.remove('is-done');
    }, 1800);
  });

  /* ── subtle parallax on gallery images ────────────────────────────── */
  const shots = $$('.shot img');
  if (shots.length && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let raf = null;
    const move = () => {
      raf = null;
      const vh = window.innerHeight;
      for (const img of shots) {
        const r = img.getBoundingClientRect();
        if (r.bottom < -80 || r.top > vh + 80) continue;
        const p = (r.top + r.height / 2 - vh / 2) / vh; // -1 … 1
        img.style.transform = `translate3d(0, ${(-p * 16).toFixed(2)}px, 0)`;
      }
    };
    window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(move); }, { passive: true });
    window.addEventListener('resize', move);
    move();
  }
})();
