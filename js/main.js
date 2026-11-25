(() => {
  // Full cinematic timeline duration at max scroll speed: 15.0s
  // Act 1 (0% - 37%): PER at 2.0% (0.30s), SO at 8.7% (+1.00s), NA at 17.3% (+1.30s),
  //                   P3R Logo reveals 22.5%-28.5%, holds, disappears 32.5%-37%
  // Act 2 (36% - 69%): Tartarus fades in and descends top-to-bottom
  // Act 3 (67% - 100%): Velvet Room elevator video plays for 5 seconds
  const TOTAL_DURATION_SEC = 15.0;
  const MAX_PROGRESS_PER_SEC = 1 / TOTAL_DURATION_SEC;

  const VELVET_TRIGGER = 0.67;
  const VELVET_RESET = 0.62;

  const syllables = [
    {
      id: 'per',
      trigger: 0.02,
      reset: 0.01,
      audio: new Audio('audio/per.mp3'),
      el: document.querySelector('.syllable.per'),
      played: false,
    },
    {
      id: 'so',
      trigger: 0.087,
      reset: 0.065,
      audio: new Audio('audio/so.mp3'),
      el: document.querySelector('.syllable.so'),
      played: false,
    },
    {
      id: 'na',
      trigger: 0.173,
      reset: 0.145,
      audio: new Audio('audio/na.mp3'),
      el: document.querySelector('.syllable.na'),
      played: false,
    },
  ];

  syllables.forEach((s) => {
    s.audio.preload = 'auto';
    if (s.el) {
      s.audio.addEventListener('ended', () => {
        s.el.classList.remove('is-speaking');
      });
    }
  });

  const velvetVideo = document.getElementById('velvet-video');
  const soundToggle = document.getElementById('sound-toggle');
  const soundPrompt = document.getElementById('sound-prompt');

  let soundEnabled = false;
  let unlocked = false;
  let velvetPlayed = false;

  if (velvetVideo) {
    velvetVideo.muted = true;
  }

  function updateUI() {
    if (velvetVideo) {
      velvetVideo.muted = !soundEnabled;
    }
    if (!soundToggle) return;
    soundToggle.setAttribute('aria-pressed', String(soundEnabled));
    soundToggle.classList.toggle('is-on', soundEnabled);
    soundToggle.textContent = soundEnabled ? 'SOUND: ON' : 'SOUND: OFF';
    if (soundPrompt) {
      soundPrompt.classList.toggle('is-hidden', soundEnabled);
    }
  }

  function unlockAudio() {
    if (unlocked) return;
    unlocked = true;

    syllables.forEach((s) => {
      const prevMuted = s.audio.muted;
      s.audio.muted = true;
      const playPromise = s.audio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            s.audio.pause();
            s.audio.currentTime = 0;
            s.audio.muted = prevMuted;
          })
          .catch(() => {
            s.audio.muted = prevMuted;
          });
      } else {
        s.audio.pause();
        s.audio.currentTime = 0;
        s.audio.muted = prevMuted;
      }
    });
  }

  function enableSound() {
    soundEnabled = true;
    unlockAudio();
    updateUI();
  }

  function toggleSound(event) {
    event.stopPropagation();
    if (!soundEnabled) {
      enableSound();
    } else {
      soundEnabled = false;
      syllables.forEach((s) => {
        s.audio.pause();
        s.audio.currentTime = 0;
      });
      updateUI();
    }
  }

  if (soundToggle) {
    soundToggle.addEventListener('click', toggleSound);
  }

  // Unlock sound automatically on first click/tap/keypress anywhere on the page
  function handleFirstInteraction(event) {
    if (soundToggle && soundToggle.contains(event.target)) return;
    if (!soundEnabled) {
      enableSound();
    }
  }

  window.addEventListener('pointerdown', handleFirstInteraction, { once: true });
  window.addEventListener('keydown', handleFirstInteraction, { once: true });

  function getMaxScroll() {
    return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  }

  function getScrollProgress() {
    const maxScroll = getMaxScroll();
    if (maxScroll <= 0) return 0;
    return Math.min(1, Math.max(0, window.scrollY / maxScroll));
  }

  function playSyllable(s) {
    if (!soundEnabled) {
      if (soundPrompt) {
        soundPrompt.classList.add('is-attention');
        setTimeout(() => soundPrompt.classList.remove('is-attention'), 600);
      }
      return;
    }

    s.audio.currentTime = 0;
    const playPromise = s.audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        soundEnabled = false;
        unlocked = false;
        updateUI();
      });
    }

    if (s.el) {
      s.el.classList.remove('is-speaking');
      void s.el.offsetWidth;
      s.el.classList.add('is-speaking');
    }
  }

  function startVelvetVideo() {
    if (!velvetVideo) return;
    velvetVideo.muted = !soundEnabled;
    velvetVideo.currentTime = 0;
    const playPromise = velvetVideo.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // Fallback to muted playback if browser blocks unmuted autoplay
        velvetVideo.muted = true;
        velvetVideo.play().catch(() => {});
      });
    }
  }

  function resetVelvetVideo() {
    if (!velvetVideo) return;
    velvetVideo.pause();
    velvetVideo.currentTime = 0;
  }

  // --- Velocity-clamped scroll controller ---
  let currentProgress = getScrollProgress();
  let targetProgress = currentProgress;
  let lastProgress = currentProgress;
  let lastTime = performance.now();
  let rafId = null;
  let isProgrammaticScroll = false;

  // Initialize state if loaded mid-page
  syllables.forEach((s) => {
    if (currentProgress >= s.trigger) {
      s.played = true;
    }
  });
  if (currentProgress >= VELVET_TRIGGER) {
    velvetPlayed = true;
    startVelvetVideo();
  }

  function clamp01(v) {
    return Math.min(1, Math.max(0, v));
  }

  function checkTriggers(progress) {
    const scrollingDown = progress >= lastProgress;

    syllables.forEach((s) => {
      if (scrollingDown && !s.played && progress >= s.trigger) {
        s.played = true;
        playSyllable(s);
      } else if (!scrollingDown && s.played && progress < s.reset) {
        s.played = false;
      }
    });

    if (scrollingDown && !velvetPlayed && progress >= VELVET_TRIGGER) {
      velvetPlayed = true;
      startVelvetVideo();
    } else if (!scrollingDown && velvetPlayed && progress < VELVET_RESET) {
      velvetPlayed = false;
      resetVelvetVideo();
    }

    lastProgress = progress;
  }

  function stepScroll(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;

    const diff = targetProgress - currentProgress;
    if (Math.abs(diff) < 0.0001) {
      currentProgress = targetProgress;
      rafId = null;
    } else {
      // Limit scroll speed to match the exact video pace (15s full sequence)
      const maxStep = MAX_PROGRESS_PER_SEC * dt;
      const easedStep = diff * Math.min(1, dt * 8);
      const step = Math.sign(diff) * Math.min(Math.abs(easedStep), maxStep);
      currentProgress = clamp01(currentProgress + step);
      rafId = requestAnimationFrame(stepScroll);
    }

    const maxScroll = getMaxScroll();
    isProgrammaticScroll = true;
    window.scrollTo(0, currentProgress * maxScroll);
    checkTriggers(currentProgress);
  }

  function nudgeTarget(deltaProgress) {
    targetProgress = clamp01(targetProgress + deltaProgress);
    if (!rafId) {
      lastTime = performance.now();
      rafId = requestAnimationFrame(stepScroll);
    }
  }

  // Wheel input (mouse / trackpad)
  window.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      let dy = event.deltaY;
      if (event.deltaMode === 1) dy *= 32;
      else if (event.deltaMode === 2) dy *= window.innerHeight;

      const cappedDy = Math.sign(dy) * Math.min(Math.abs(dy), 200);
      const maxScroll = getMaxScroll() || window.innerHeight * 11;
      nudgeTarget((cappedDy * 1.4) / maxScroll);
    },
    { passive: false }
  );

  // Touch input (mobile / trackpad touch)
  let lastTouchY = null;
  window.addEventListener(
    'touchstart',
    (event) => {
      if (event.touches.length === 1) {
        lastTouchY = event.touches[0].clientY;
      }
    },
    { passive: true }
  );

  window.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length !== 1 || lastTouchY === null) return;
      event.preventDefault();
      const currentY = event.touches[0].clientY;
      const dy = lastTouchY - currentY;
      lastTouchY = currentY;
      const maxScroll = getMaxScroll() || window.innerHeight * 11;
      nudgeTarget((dy * 1.8) / maxScroll);
    },
    { passive: false }
  );

  window.addEventListener('touchend', () => {
    lastTouchY = null;
  });

  // Keyboard navigation
  window.addEventListener('keydown', (event) => {
    const keyMap = {
      ArrowDown: 0.04,
      ArrowUp: -0.04,
      PageDown: 0.14,
      PageUp: -0.14,
      ' ': event.shiftKey ? -0.14 : 0.14,
      Home: -1,
      End: 1,
    };
    if (event.key in keyMap) {
      event.preventDefault();
      nudgeTarget(keyMap[event.key]);
    }
  });

  // Fallback if the user drags the native scrollbar directly
  window.addEventListener(
    'scroll',
    () => {
      if (isProgrammaticScroll) {
        isProgrammaticScroll = false;
        return;
      }
      const actual = getScrollProgress();
      currentProgress = actual;
      targetProgress = actual;
      checkTriggers(actual);
    },
    { passive: true }
  );

  updateUI();
})();
