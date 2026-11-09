/* Fadai Universe — site behaviour
   The visualizer itself is the app's own code, vendored in /viz and embedded
   as an iframe (screen-blended). This file only wires the page around it. */
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

  // safety net: if a browser throttles/defer the observer (heavy WebGL on the
  // page can starve it), still show what is already on screen
  setTimeout(() => {
    $$('.reveal:not(.in)').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) el.classList.add('in');
    });
  }, 1600);

  /* ── nav stuck state ──────────────────────────────────────────────── */
  const nav = $('#nav');
  const onScrollNav = () => nav.classList.toggle('is-stuck', window.scrollY > 40);
  onScrollNav();
  window.addEventListener('scroll', onScrollNav, { passive: true });

  /* ── the embedded app visualizer ──────────────────────────────────── */
  const stageViz = $('#stageViz');
  const note = $('#stageNote');

  /* keep only what is on screen rendering: two three.js scenes at once is
     wasteful, and the hero one is expensive on Retina screens */
  const heroViz = $('.hero__stage .viz');
  if (heroViz) {
    const heroSrc = heroViz.getAttribute('src');
    new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          if (!heroViz.getAttribute('src')) heroViz.setAttribute('src', heroSrc);
        } else if (heroViz.getAttribute('src')) {
          heroViz.removeAttribute('src'); // stops the WebGL loop entirely
        }
      }
    }, { threshold: 0.02 }).observe(heroViz.parentElement);
  }

  const post = (msg) => {
    if (stageViz && stageViz.contentWindow) stageViz.contentWindow.postMessage(msg, '*');
  };

  /* form chips → tell the app which living form to render */
  $$('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      $$('.chip').forEach((c) => {
        const on = c === chip;
        c.classList.toggle('is-active', on);
        c.setAttribute('aria-selected', String(on));
      });
      post({ fadaiMode: chip.dataset.mode });
      if (!micLive) note.textContent = `App visualizer · ${chip.textContent.trim().toLowerCase()} form`;
    });
  });

  /* microphone — the app's own capture path, driven through the iframe */
  const micBtn = $('#micBtn');
  const micLabel = micBtn && $('.mic__label', micBtn);
  let micLive = false;

  micBtn && micBtn.addEventListener('click', () => {
    if (micLive) return;
    micLabel.textContent = 'Listening…';
    post({ fadaiMic: true });
    micLive = true;
    micBtn.classList.add('is-live');
    micLabel.textContent = 'Microphone live';
    note.textContent = 'Driven by your microphone · processed on this device';
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
