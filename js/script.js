(() => {
  // ===================================================================
  //  CINEMATIC TIMELINE (seconds at maximum scroll speed)
  //  Must match the percentages documented in css/style_main.css.
  // ===================================================================
  const TOTAL = 26; // seconds for #scroll-track
  const ROSTER_CODES = ['00', '01', '02', '03', '04', '05', '06', '07', '09'];
  const MEMBER_COUNT = ROSTER_CODES.length;

  const T = {
    per: 0.3,
    so: 1.3,
    na: 2.6,
    doorStart: 7.75, // Pure animated Velvet Room door (3.5s)
    doorEnd: 11.25,
    elevatorStart: 11.05, // Velvet Room elevator (10s)
    elevatorEnd: 21.05,
    dialogueTrigger: 22.2, // Igor dialogue begins here
    dialogueLock: 22.8, // Scroll locks here until user finishes Igor's lines
    ariaPeak: 22.8,
  };

  const DIALOGUE_LOCK_P = T.dialogueLock / TOTAL;
  const TYPE_CPS = 40; // characters per second for Igor's typewriter

  // Igor's lines in Brazilian Portuguese (manual advance via Space, Enter, or Left-Click)
  const IGOR_LINES = [
    'Ah... então você finalmente chegou. Seja bem-vindo, meu caro convidado.',
    'Este lugar flutua entre o sonho e a realidade, a mente e a matéria. Apenas aqueles ligados por um contrato podem entrar.',
    'Meu nome é Igor. E você... você carrega um tipo muito peculiar de poder.',
    'Como o número zero, você está vazio e, ainda assim, pode se tornar qualquer coisa. Você é um Curinga.',
    'Enquanto outros possuem apenas uma Persona, você pode invocar várias, cada uma nascida dos laços que criar.',
    'Valorize esses laços. No fim, eles serão a verdadeira medida da sua força.',
    'Agora, resta apenas uma pequena formalidade. Assine abaixo e assuma a responsabilidade pelo caminho que escolher.',
  ];

  const MAX_SPEED = 1 / TOTAL;
  const SECONDS_PER_NOTCH = 1.25;

  const ARIA_MAX = 0.9;
  const ARIA_ROSTER = 0.6;
  const ARIA_FORM = 0.45;

  // ------------------------------------------------------------------
  const root = document.documentElement;
  const track = document.getElementById('scroll-track');
  const rosterTrack = document.getElementById('roster-track');
  const rosterCount = document.getElementById('roster-count');
  const rosterBarFill = document.getElementById('roster-bar-fill');
  const doorVideo = document.getElementById('door-video');
  const velvetVideo = document.getElementById('velvet-video');
  const igorLayer = document.getElementById('igor-layer');
  const dialogueBox = document.getElementById('dialogue-box');
  const dialogueText = document.getElementById('dialogue-text');
  const soundToggle = document.getElementById('sound-toggle');
  const soundPrompt = document.getElementById('sound-prompt');

  const aria = new Audio('audio/aria_of_the_soul.mp3');
  aria.loop = true;
  aria.preload = 'auto';
  aria.volume = 0;

  const syllables = ['per', 'so', 'na'].map((id) => ({
    id,
    trigger: T[id] / TOTAL,
    reset: Math.max(0.004, (T[id] - 0.5) / TOTAL),
    audio: new Audio(`audio/${id}.mp3`),
    el: document.querySelector(`.syllable.${id}`),
    played: false,
    prompted: false,
  }));

  syllables.forEach((s) => {
    s.audio.preload = 'auto';
    s.audio.addEventListener('ended', () => {
      s.audio._activePlay = false;
      if (s.el) s.el.classList.remove('is-speaking');
    });
  });

  // ------------------------------------------------------------------
  //  Helpers
  // ------------------------------------------------------------------
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const clamp01 = (v) => clamp(v, 0, 1);
  const smooth = (x) => x * x * (3 - 2 * x);

  function trackLength() {
    return Math.max(1, track.offsetHeight - window.innerHeight);
  }

  function progressFromScroll() {
    return clamp01(window.scrollY / trackLength());
  }

  function inCinematic() {
    return window.scrollY <= trackLength() + 1;
  }

  function isFormField(el) {
    return el && el.closest && el.closest('input, textarea, select, button, [contenteditable="true"]');
  }

  // ------------------------------------------------------------------
  //  Sound
  // ------------------------------------------------------------------
  let soundEnabled = false;
  let unlocked = false;

  function updateUI() {
    soundToggle.setAttribute('aria-pressed', String(soundEnabled));
    soundToggle.classList.toggle('is-on', soundEnabled);
    soundToggle.textContent = soundEnabled ? 'SOM: LIG.' : 'SOM: DESL.';
    soundPrompt.classList.toggle('is-hidden', soundEnabled);
  }

  function unlockAudio() {
    if (unlocked) return;
    unlocked = true;
    [...syllables.map((s) => s.audio), aria].forEach((a) => {
      if (a._activePlay) return;
      const wasMuted = a.muted;
      a.muted = true;
      const p = a.play();
      const restore = () => {
        if (a._activePlay) return;
        a.pause();
        a.currentTime = 0;
        a.muted = wasMuted;
      };
      if (p && p.then) p.then(restore).catch(() => { if (!a._activePlay) a.muted = wasMuted; });
      else restore();
    });
  }

  function enableSound() {
    soundEnabled = true;
    unlockAudio();
    updateUI();
  }

  function disableSound() {
    soundEnabled = false;
    syllables.forEach((s) => {
      s.audio.pause();
      s.audio.currentTime = 0;
    });
    aria.pause();
    updateUI();
  }

  soundToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    soundEnabled ? disableSound() : enableSound();
  });

  function firstInteraction(e) {
    if (e.target instanceof Node && soundToggle.contains(e.target)) return;
    if (!soundEnabled) enableSound();
  }
  window.addEventListener('pointerdown', firstInteraction, { once: true });
  window.addEventListener('keydown', firstInteraction, { once: true });

  function playSyllable(s) {
    if (!soundEnabled) {
      if (!s.prompted) {
        s.prompted = true;
        soundPrompt.classList.add('is-attention');
        setTimeout(() => soundPrompt.classList.remove('is-attention'), 600);
      }
      return false;
    }
    s.audio._activePlay = true;
    s.audio.muted = false;
    s.audio.currentTime = 0;
    s.audio.play().catch(() => {
      s.audio._activePlay = false;
    });
    if (s.el) {
      s.el.classList.remove('is-speaking');
      void s.el.offsetWidth;
      s.el.classList.add('is-speaking');
    }
    return true;
  }

  // ------------------------------------------------------------------
  //  Interactive Igor Dialogue State (Space / Enter / Right-Click)
  //  Never auto-advances! 1st press completes current line, 2nd press advances.
  // ------------------------------------------------------------------
  let dialogueActive = false;
  let dialogueFinished = false;
  let lineIndex = 0;
  let typedChars = 0;
  let renderedText = '';

  function renderDialogue() {
    const line = IGOR_LINES[lineIndex] || '';
    const count = Math.min(line.length, Math.floor(typedChars));
    const text = line.slice(0, count);
    if (text !== renderedText) {
      dialogueText.textContent = text;
      renderedText = text;
    }
    dialogueBox.classList.toggle('is-visible', dialogueActive);
    dialogueBox.classList.toggle('is-complete', dialogueActive && count >= line.length);
    if (igorLayer) {
      igorLayer.classList.toggle('is-wildcard', dialogueActive && (lineIndex === 3 || lineIndex === 4));
    }
  }

  function advanceDialogue() {
    if (!dialogueActive) return;
    const line = IGOR_LINES[lineIndex];

    // 1st click/press: cancel typing animation and show full line immediately
    if (typedChars < line.length) {
      typedChars = line.length;
      renderDialogue();
      return;
    }

    // 2nd click/press: move to next line, or finish dialogue and unlock scroll
    if (lineIndex < IGOR_LINES.length - 1) {
      lineIndex += 1;
      typedChars = 0;
      renderDialogue();
    } else {
      dialogueActive = false;
      dialogueFinished = true;
      renderDialogue();
      // Smoothly finish Igor's fade-out so the user can scroll straight into S.E.E.S.
      target = 1;
    }
  }

  function updateDialogue(t, dt) {
    // Reset if the user scrolls back up before Igor appears
    if (t < T.dialogueTrigger - 1.5) {
      if (dialogueActive || dialogueFinished || lineIndex > 0) {
        dialogueActive = false;
        dialogueFinished = false;
        lineIndex = 0;
        typedChars = 0;
        renderDialogue();
      }
      return;
    }

    if (!dialogueFinished && !dialogueActive && t >= T.dialogueTrigger && inCinematic()) {
      dialogueActive = true;
      lineIndex = 0;
      typedChars = 0;
      renderDialogue();
    }

    if (dialogueActive) {
      const line = IGOR_LINES[lineIndex];
      if (typedChars < line.length) {
        typedChars = Math.min(line.length, typedChars + TYPE_CPS * dt);
      }
      renderDialogue();
    }
  }

  // Left-click advances Igor dialogue (ignores clicks on the sound toggle button)
  window.addEventListener('click', (e) => {
    if (!dialogueActive) return;
    if (e.button !== 0) return;
    if (e.target instanceof Node && soundToggle.contains(e.target)) return;
    advanceDialogue();
  });

  // ------------------------------------------------------------------
  //  Per-frame scene updates
  // ------------------------------------------------------------------
  let lastP = progressFromScroll();
  syllables.forEach((s) => (s.played = lastP >= s.trigger));

  function updateSyllables(p) {
    const down = p >= lastP;
    syllables.forEach((s) => {
      if (down && !s.played && p >= s.trigger) {
        if (playSyllable(s)) {
          s.played = true;
        }
      } else if (!down && p <= s.reset) {
        s.played = false;
        s.prompted = false;
      }
    });
  }

  function scrubVideo(video, t, start, end) {
    if (!video || video.readyState < 1 || video.seeking) return;
    const dur = video.duration || end - start;
    const wanted = clamp(t - start, 0, dur - 0.05);
    if (Math.abs(video.currentTime - wanted) > 1 / 50) {
      video.currentTime = wanted;
    }
  }

  // Native scroll-driven S.E.E.S. roster showcase (unlocked after signing the contract)
  function updateRoster() {
    if (!rosterTrack || rosterTrack.hidden) return;
    const rosterStart = rosterTrack.offsetTop;
    const rosterLen = Math.max(1, rosterTrack.offsetHeight - window.innerHeight);
    const rp = clamp01((window.scrollY - rosterStart) / rosterLen);
    root.style.setProperty('--rp', rp.toFixed(5));

    if (rosterCount) {
      const idx = Math.min(MEMBER_COUNT - 1, Math.floor(rp * (MEMBER_COUNT - 1) + 0.5));
      rosterCount.textContent = `${ROSTER_CODES[idx]} / 09`;
    }
    if (rosterBarFill) {
      const fill = (1 / MEMBER_COUNT) + rp * (1 - 1 / MEMBER_COUNT);
      rosterBarFill.style.transform = `scaleX(${fill.toFixed(4)})`;
    }
  }

  function ariaTargetVolume(t) {
    const y = window.scrollY;
    const cEnd = trackLength();

    if (y > cEnd) {
      const past = (y - cEnd) / window.innerHeight;
      return ARIA_MAX + (ARIA_FORM - ARIA_MAX) * clamp01(past);
    }
    if (t < T.doorStart + 0.2) return 0;
    const x = clamp01((t - T.doorStart) / (T.ariaPeak - T.doorStart));
    return 0.1 + (ARIA_MAX - 0.1) * smooth(x);
  }

  function updateAria(t, dt) {
    const targetVol = soundEnabled ? ariaTargetVolume(t) : 0;

    if (targetVol > 0 && aria.paused && soundEnabled) {
      aria.play().catch(() => {});
    }

    const k = Math.min(1, dt * 2.5);
    aria.volume = clamp01(aria.volume + (targetVol - aria.volume) * k);

    if (targetVol === 0 && aria.volume < 0.01 && !aria.paused) {
      aria.pause();
      aria.currentTime = 0;
    }
  }

  // ------------------------------------------------------------------
  //  Speed-limited scroll controller (ONLY inside #scroll-track)
  // ------------------------------------------------------------------
  let current = lastP;
  let target = lastP;
  let lastSetY = window.scrollY;
  let lastTime = performance.now();

  function maxAllowedP() {
    return dialogueFinished ? 1 : DIALOGUE_LOCK_P;
  }

  function nudge(deltaSeconds) {
    target = clamp(target + deltaSeconds / TOTAL, 0, maxAllowedP());
  }

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;

    if (inCinematic()) {
      const cap = maxAllowedP();
      if (target > cap) target = cap;
      if (Math.abs(target - current) > 0.00005) {
        const diff = target - current;
        const step = Math.sign(diff) * Math.min(Math.abs(diff * Math.min(1, dt * 8)), MAX_SPEED * dt);
        current = clamp(current + step, 0, cap);
        const y = current * trackLength();
        lastSetY = y;
        window.scrollTo(0, y);
      }
    }

    const p = inCinematic() ? current : 1;
    const t = p * TOTAL;

    root.style.setProperty('--p', p.toFixed(5));
    updateSyllables(p);
    scrubVideo(doorVideo, t, T.doorStart, T.doorEnd);
    scrubVideo(velvetVideo, t, T.elevatorStart, T.elevatorEnd);
    updateDialogue(t, dt);
    updateRoster();
    updateAria(t, dt);
    lastP = p;

    requestAnimationFrame(frame);
  }

  // Wheel (only intercepted inside #scroll-track)
  window.addEventListener(
    'wheel',
    (e) => {
      if (!inCinematic()) return;
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 32;
      else if (e.deltaMode === 2) dy *= window.innerHeight;

      // Only release into S.E.E.S. roster once Igor's dialogue is finished
      if (dy > 0 && dialogueFinished && current >= 0.9999 && target >= 0.9999) return;

      e.preventDefault();
      // While Igor is speaking, ignore downward wheel (only allow scrolling back up)
      if (dialogueActive && dy > 0) return;

      const capped = Math.sign(dy) * Math.min(Math.abs(dy), 240);
      nudge((capped / 100) * SECONDS_PER_NOTCH);
    },
    { passive: false }
  );

  // Touch
  let touchY = null;
  window.addEventListener('touchstart', (e) => {
    touchY = e.touches.length === 1 ? e.touches[0].clientY : null;
  }, { passive: true });

  window.addEventListener(
    'touchmove',
    (e) => {
      if (touchY === null || !inCinematic()) return;
      const y = e.touches[0].clientY;
      const dy = touchY - y;
      if (dy > 0 && dialogueFinished && current >= 0.9999 && target >= 0.9999) return;
      e.preventDefault();
      if (dialogueActive && dy > 0) return;
      touchY = y;
      nudge((dy / window.innerHeight) * 6);
    },
    { passive: false }
  );

  window.addEventListener('touchend', () => (touchY = null));

  // Keyboard (Space / Enter advance Igor's dialogue when active!)
  window.addEventListener('keydown', (e) => {
    if (isFormField(e.target)) return;

    if (dialogueActive && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      advanceDialogue();
      return;
    }

    if (!inCinematic()) return;
    const map = {
      ArrowDown: 1.5,
      ArrowUp: -1.5,
      PageDown: 4.5,
      PageUp: -4.5,
      ' ': e.shiftKey ? -4.5 : 4.5,
      Home: -TOTAL,
      End: TOTAL,
    };
    if (!(e.key in map)) return;
    if (dialogueActive && map[e.key] > 0) {
      e.preventDefault();
      return;
    }
    if (map[e.key] > 0 && dialogueFinished && current >= 0.9999) return;
    e.preventDefault();
    nudge(map[e.key]);
  });

  // Scrollbar drags / native scrolling: resync controller
  window.addEventListener(
    'scroll',
    () => {
      if (Math.abs(window.scrollY - lastSetY) < 2) return;
      const p = progressFromScroll();
      current = p;
      target = p;
      lastSetY = window.scrollY;
    },
    { passive: true }
  );

  window.addEventListener('resize', () => {
    lastSetY = current * trackLength();
    if (inCinematic()) window.scrollTo(0, lastSetY);
  });

  updateUI();
  requestAnimationFrame(frame);
})();

// ===================================================================
//  VELVET ROOM CONTRACT FORM, VALIDATION & BLUE-FIRE DISSOLVE
// ===================================================================
(() => {
  const form = document.getElementById('sees-form');
  const book = document.getElementById('contract-book');
  const bookBody = document.getElementById('book-body');
  const burnCanvas = document.getElementById('burn-canvas');
  const seesSection = document.getElementById('sees');
  if (!form || !book || !bookBody) return;

  let isBurning = false;

  // ------------------------------------------------------------------
  //  3D Book starts CLOSED, and opens once scrolled onto it
  // ------------------------------------------------------------------
  function updateBookOpenState() {
    if (isBurning) return;
    const rect = book.getBoundingClientRect();
    const vh = window.innerHeight;

    // Open when the user scrolls onto the book (top passes 42% of viewport height)
    if (rect.top <= vh * 0.42 && rect.bottom > vh * 0.2) {
      if (!book.classList.contains('is-open')) {
        book.classList.remove('is-closing');
        book.classList.add('is-open');
      }
    } else if (rect.top > vh * 0.85) {
      // Close back when scrolled above the section so scrolling down replays opening
      book.classList.remove('is-open', 'is-closing');
    }
  }

  window.addEventListener('scroll', updateBookOpenState, { passive: true });
  updateBookOpenState();

  // Also allow clicking the closed cover to open it
  const cover = document.getElementById('book-cover');
  if (cover) {
    cover.addEventListener('click', () => {
      if (!isBurning) book.classList.add('is-open');
    });
  }

  // ------------------------------------------------------------------
  //  Motivation character counter
  // ------------------------------------------------------------------
  const motivation = form.elements.motivation;
  const counter = document.getElementById('motivation-count');
  motivation.addEventListener('input', () => {
    counter.textContent = motivation.value.length;
  });

  // ------------------------------------------------------------------
  //  Signature pad (dark navy ink on blue parchment)
  // ------------------------------------------------------------------
  const canvas = document.getElementById('signature-pad');
  const pad = canvas.parentElement;
  const sigInput = document.getElementById('signature-data');
  const sigError = document.getElementById('signature-error');
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let hasInk = false;
  let last = null;

  function resizeCanvas() {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const saved = hasInk ? canvas.toDataURL() : null;
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#08142b';
    ctx.lineWidth = 2.4;
    if (saved) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = saved;
    }
  }

  function pointFrom(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', (e) => {
    drawing = true;
    last = pointFrom(e);
    canvas.setPointerCapture(e.pointerId);
    ctx.beginPath();
    ctx.arc(last.x, last.y, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = '#08142b';
    ctx.fill();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pointFrom(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
    if (!hasInk) {
      hasInk = true;
      pad.classList.add('has-ink');
      pad.classList.remove('is-invalid');
      sigError.style.display = '';
    }
  });

  const stopDrawing = () => {
    if (!drawing) return;
    drawing = false;
    if (hasInk) sigInput.value = canvas.toDataURL('image/png');
  };
  canvas.addEventListener('pointerup', stopDrawing);
  canvas.addEventListener('pointercancel', stopDrawing);

  function clearSignature() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    hasInk = false;
    sigInput.value = '';
    pad.classList.remove('has-ink');
  }

  document.getElementById('signature-clear').addEventListener('click', clearSignature);
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // ------------------------------------------------------------------
  //  Blue Fire Bottom-to-Top Dissolve Animation
  // ------------------------------------------------------------------
  function playBlueFireBurn(onComplete) {
    if (!burnCanvas) {
      onComplete();
      return;
    }

    const bCtx = burnCanvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    const rect = burnCanvas.getBoundingClientRect();
    burnCanvas.width = rect.width * ratio;
    burnCanvas.height = rect.height * ratio;
    bCtx.setTransform(ratio, 0, 0, ratio, 0, 0);

    // Book bounds relative to the oversized burnCanvas (40px horizontal, 60px vertical margin)
    const padX = 40;
    const padY = 60;
    const bookW = rect.width - padX * 2;
    const bookH = rect.height - padY * 2;

    const particles = [];
    const BURN_DURATION = 2200; // ms from bottom to top
    const LINGER_DURATION = 650; // ms for final blue embers to drift upward
    const startTime = performance.now();

    book.classList.add('is-burning');

    function spawnFlameRow(burnY, intensity) {
      const count = Math.floor(26 * intensity);
      for (let i = 0; i < count; i++) {
        const isSpark = Math.random() < 0.28;
        particles.push({
          x: padX + Math.random() * bookW,
          y: burnY + (Math.random() - 0.5) * 18,
          vx: (Math.random() - 0.5) * (isSpark ? 70 : 34),
          vy: -(isSpark ? 140 + Math.random() * 190 : 75 + Math.random() * 130),
          size: isSpark ? 1.5 + Math.random() * 2.5 : 14 + Math.random() * 26,
          life: 0,
          maxLife: isSpark ? 0.55 + Math.random() * 0.65 : 0.35 + Math.random() * 0.4,
          isSpark,
        });
      }
    }

    let lastFrame = startTime;

    function tick(now) {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
      lastFrame = now;
      const elapsed = now - startTime;
      const burnProgress = Math.min(1, elapsed / BURN_DURATION);

      // Clip the closed book upward from bottom (0%) to top (100%)
      bookBody.style.setProperty('--burn', `${(burnProgress * 100).toFixed(2)}%`);

      bCtx.clearRect(0, 0, rect.width, rect.height);
      bCtx.globalCompositeOperation = 'lighter';

      if (burnProgress < 1) {
        const burnY = padY + bookH * (1 - burnProgress);
        spawnFlameRow(burnY, 1);

        // Glowing electric-blue ignition line across the rising burn front
        const glow = bCtx.createLinearGradient(0, burnY - 26, 0, burnY + 14);
        glow.addColorStop(0, 'rgba(0, 110, 255, 0)');
        glow.addColorStop(0.55, 'rgba(65, 225, 255, 0.78)');
        glow.addColorStop(0.8, 'rgba(230, 255, 255, 0.95)');
        glow.addColorStop(1, 'rgba(0, 80, 255, 0)');
        bCtx.fillStyle = glow;
        bCtx.fillRect(padX - 6, burnY - 26, bookW + 12, 40);
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx += (Math.random() - 0.5) * 90 * dt;

        const alpha = 1 - p.life / p.maxLife;
        if (p.isSpark) {
          bCtx.fillStyle = `rgba(180, 245, 255, ${alpha.toFixed(3)})`;
          bCtx.beginPath();
          bCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          bCtx.fill();
        } else {
          const r = p.size * (0.4 + 0.7 * alpha);
          const grad = bCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          grad.addColorStop(0, `rgba(225, 255, 255, ${(alpha * 0.9).toFixed(3)})`);
          grad.addColorStop(0.35, `rgba(50, 210, 255, ${(alpha * 0.75).toFixed(3)})`);
          grad.addColorStop(0.7, `rgba(10, 90, 255, ${(alpha * 0.45).toFixed(3)})`);
          grad.addColorStop(1, 'rgba(0, 30, 140, 0)');
          bCtx.fillStyle = grad;
          bCtx.beginPath();
          bCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
          bCtx.fill();
        }
      }

      bCtx.globalCompositeOperation = 'source-over';

      if (elapsed < BURN_DURATION + LINGER_DURATION || particles.length > 0) {
        requestAnimationFrame(tick);
      } else {
        bCtx.clearRect(0, 0, rect.width, rect.height);
        book.classList.remove('is-burning');
        onComplete();
      }
    }

    requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------------
  //  Custom Exception, Numeric Sanitization & Combat Calculation
  // ------------------------------------------------------------------
  const statusBanner = document.getElementById('form-status');

  class ContractValidationError extends Error {
    constructor(message, targetEl) {
      super(message);
      this.name = 'ContractValidationError';
      this.targetEl = targetEl || null;
    }
  }

  function showStatusError(message) {
    if (!statusBanner) return;
    statusBanner.textContent = message;
    statusBanner.hidden = false;
  }

  function clearStatusError() {
    if (!statusBanner) return;
    statusBanner.textContent = '';
    statusBanner.hidden = true;
  }

  // Sanitize and validate integer numeric inputs before calculations
  function parseStrictInt(inputEl, min, max, fieldLabel) {
    const raw = String(inputEl.value || '').trim();
    if (raw === '') {
      throw new ContractValidationError(`O campo "${fieldLabel}" é obrigatório.`, inputEl);
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      throw new ContractValidationError(`O campo "${fieldLabel}" deve conter apenas um número inteiro.`, inputEl);
    }
    if (parsed < min || parsed > max) {
      throw new ContractValidationError(`O campo "${fieldLabel}" deve estar entre ${min} e ${max}.`, inputEl);
    }
    return parsed;
  }

  // Compute S.E.E.S. combat metrics from the validated numeric fields
  function calculateCombatProfile(aptitude, floor) {
    const combatPower = Math.round(aptitude * 12 + floor * 3.5);
    let rank = 'D';
    if (combatPower >= 1600) rank = 'S';
    else if (combatPower >= 1100) rank = 'A';
    else if (combatPower >= 650) rank = 'B';
    else if (combatPower >= 300) rank = 'C';

    let block = 'Thebel (1F–22F)';
    if (floor >= 227) block = 'Adamah (227F–264F)';
    else if (floor >= 173) block = 'Harabah (173F–226F)';
    else if (floor >= 119) block = 'Tziah (119F–172F)';
    else if (floor >= 70) block = 'Yabbashah (70F–118F)';
    else if (floor >= 23) block = 'Arqa (23F–69F)';

    return { combatPower, rank, block };
  }

  // ------------------------------------------------------------------
  //  Validation & Submission (wrapped in try / catch exception handling)
  // ------------------------------------------------------------------
  function containerOf(el) {
    return el.closest('.sees-field, .sees-question') || el.closest('label');
  }

  function validateField(el) {
    const box = containerOf(el);
    if (!box) return el.checkValidity();
    const ok = el.type === 'radio'
      ? !!form.querySelector(`input[name="${el.name}"]:checked`)
      : el.checkValidity();
    box.classList.toggle('is-invalid', !ok);
    return ok;
  }

  function validateSignature() {
    pad.classList.toggle('is-invalid', !hasInk);
    sigError.style.display = hasInk ? '' : 'block';
    return hasInk;
  }

  form.addEventListener('input', (e) => {
    clearStatusError();
    const box = containerOf(e.target);
    if (box && box.classList.contains('is-invalid')) validateField(e.target);
  });

  form.addEventListener('change', (e) => {
    clearStatusError();
    const box = containerOf(e.target);
    if (box && box.classList.contains('is-invalid')) validateField(e.target);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (isBurning) return;
    clearStatusError();

    try {
      // 1. Validate all required HTML fields
      const fields = [...form.querySelectorAll('input[required], select[required], textarea[required]')];
      const results = fields.map(validateField);

      // 2. Sanitize and validate numeric fields explicitly before using them
      const aptitude = parseStrictInt(form.elements.aptitude, 1, 99, 'Nível de aptidão');
      const floor = parseStrictInt(form.elements.floor, 1, 264, 'Andar alcançado em Tartarus');

      // 3. Validate drawn signature
      const sigOk = validateSignature();

      if (results.includes(false)) {
        const firstInvalid = form.querySelector('.is-invalid');
        throw new ContractValidationError(
          'Por favor, corrija os campos destacados antes de selar o contrato.',
          firstInvalid
        );
      }

      if (!sigOk) {
        throw new ContractValidationError('Por favor, desenhe sua assinatura no campo indicado.', pad);
      }

      // 4. Calculate combat metrics from the validated numeric inputs
      const metrics = calculateCombatProfile(aptitude, floor);

      const nextNum = parseInt(localStorage.getItem('sees-next-id') || '10', 10);
      const memberId = `S.E.E.S - ${nextNum}`;
      localStorage.setItem('sees-next-id', String(nextNum + 1));

      const data = new FormData(form);
      const application = {
        id: memberId,
        name: data.get('name').trim(),
        year: data.get('year'),
        class: data.get('class').toUpperCase(),
        birth: data.get('birth'),
        email: data.get('email'),
        darkHour: data.get('darkhour'),
        signs: data.getAll('signs'),
        weapon: data.get('weapon'),
        role: data.get('role'),
        aptitude,
        floor,
        combatPower: metrics.combatPower,
        rank: metrics.rank,
        block: metrics.block,
        motivation: data.get('motivation').trim(),
        signature: data.get('signature'),
        submittedAt: new Date().toISOString(),
      };

      const saved = JSON.parse(localStorage.getItem('sees-applications') || '[]');
      saved.push(application);
      localStorage.setItem('sees-applications', JSON.stringify(saved));

      // 5. Center the book & close the cover
      isBurning = true;
      book.scrollIntoView({ behavior: 'smooth', block: 'center' });
      book.classList.remove('is-open');
      book.classList.add('is-closing');

      // 6. Once cover shuts, burn the book in blue fire from bottom to top
      setTimeout(() => {
        playBlueFireBurn(() => {
          const roster = document.getElementById('roster-track');
          if (roster) roster.hidden = false;
          showConfirmation(application);
        });
      }, 780);
    } catch (error) {
      // Handle validation and unexpected runtime errors without breaking the page
      const msg = error instanceof Error
        ? error.message
        : 'Ocorreu um erro inesperado ao processar o contrato.';
      showStatusError(msg);

      if (error instanceof ContractValidationError && error.targetEl) {
        const box = containerOf(error.targetEl) || error.targetEl;
        box.classList.add('is-invalid');
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const focusable = box.matches('input, select, textarea, canvas')
          ? box
          : box.querySelector('input, select, textarea, canvas');
        if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), 350);
      }
    }
  });

  form.addEventListener('reset', () => {
    clearStatusError();
    form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
    clearSignature();
    sigError.style.display = '';
    counter.textContent = '0';
  });

  // ------------------------------------------------------------------
  //  Confirmation card & book reset
  // ------------------------------------------------------------------
  const confirmBox = document.getElementById('sees-confirm');
  const confirmData = document.getElementById('confirm-data');
  const confirmClose = document.getElementById('confirm-close');

  function showConfirmation(app) {
    const years = { 1: '1º', 2: '2º', 3: '3º' };
    const rows = [
      ['ID de Membro', app.id],
      ['Nome', app.name],
      ['Turma', `${years[app.year]} ano, turma ${app.class}`],
      ['Potencial', 'Curinga'],
      ['Arma', app.weapon],
      ['Função', app.role],
      ['Poder de Combate', `${app.combatPower} pts (Rank ${app.rank})`],
      ['Bloco Recomendado', app.block],
    ];
    confirmData.innerHTML = '';
    rows.forEach(([k, v]) => {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = k;
      dd.textContent = v;
      confirmData.append(dt, dd);
    });
    confirmBox.hidden = false;
    confirmClose.focus();
  }

  function hideConfirmation() {
    confirmBox.hidden = true;
    // Restore the book cleanly so the user can view or submit again
    form.reset();
    clearSignature();
    counter.textContent = '0';
    bookBody.style.setProperty('--burn', '0%');
    book.classList.remove('is-closing', 'is-burning');
    book.classList.add('is-open');
    isBurning = false;

    // Smoothly scroll into the newly unlocked S.E.E.S. teammates showcase
    const roster = document.getElementById('roster-track');
    if (roster && !roster.hidden) {
      roster.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  confirmClose.addEventListener('click', hideConfirmation);
  confirmBox.addEventListener('click', (e) => {
    if (e.target === confirmBox) hideConfirmation();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !confirmBox.hidden) hideConfirmation();
  });
})();
