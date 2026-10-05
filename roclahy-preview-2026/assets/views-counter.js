(() => {
  const BASELINE_TOTAL = 118131;
  const MIN_VISIBLE_RATIO = 0.95;
  const metric = document.querySelector('.site-metric');
  const totalEl = document.getElementById('siteViewsTotal');
  if (!metric || !totalEl) return;

  let target = Number(String(totalEl.textContent || '').replace(/\D/g, '')) || BASELINE_TOTAL;
  let started = false;
  let finished = false;
  let raf = 0;
  let startTimer = 0;
  let observer = null;
  let hasUserScrolled = false;
  let touchStartY = null;

  const formatter = new Intl.NumberFormat(document.documentElement.lang === 'en' ? 'en-US' : 'es-ES');
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

  const visibleRatio = () => {
    const rect = metric.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const visibleBottom = Math.max(0, vh - 104);
    const visibleHeight = Math.max(
      0,
      Math.min(rect.bottom, visibleBottom) - Math.max(rect.top, 0)
    );

    return visibleHeight / Math.max(rect.height, 1);
  };

  const cleanup = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    window.clearTimeout(startTimer);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', scheduleStart);
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('keydown', onKeyDown);
  };

  const animate = () => {
    if (started || !hasUserScrolled || visibleRatio() < MIN_VISIBLE_RATIO) return;
    started = true;
    cleanup();

    if (reduceMotion) {
      totalEl.textContent = formatter.format(target);
      finished = true;
      return;
    }

    const duration = 2600;
    const startedAt = performance.now();
    totalEl.textContent = '0';

    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      totalEl.textContent = formatter.format(Math.round(target * eased));

      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
        finished = true;
        totalEl.textContent = formatter.format(target);
      }
    };

    raf = requestAnimationFrame(tick);
  };

  const scheduleStart = () => {
    if (started || !hasUserScrolled || visibleRatio() < MIN_VISIBLE_RATIO) return;

    window.clearTimeout(startTimer);
    startTimer = window.setTimeout(() => {
      if (!started && hasUserScrolled && visibleRatio() >= MIN_VISIBLE_RATIO) {
        animate();
      }
    }, 100);
  };

  const armFromUserScroll = () => {
    if (!hasUserScrolled) {
      hasUserScrolled = true;
    }
    scheduleStart();
  };

  function onScroll() {
    // El evento scroll por sí solo no habilita la animación:
    // algunos navegadores restauran o ajustan el scroll al abrir la página.
    scheduleStart();
  }

  function onWheel(event) {
    if (Math.abs(event.deltaY) > 1) {
      armFromUserScroll();
    }
  }

  function onTouchStart(event) {
    touchStartY = event.touches?.[0]?.clientY ?? null;
  }

  function onTouchMove(event) {
    const y = event.touches?.[0]?.clientY;
    if (touchStartY == null || y == null) return;

    if (Math.abs(y - touchStartY) >= 8) {
      armFromUserScroll();
    }
  }

  function onKeyDown(event) {
    if (['ArrowDown', 'PageDown', 'End', ' ', 'Spacebar'].includes(event.key)) {
      armFromUserScroll();
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', scheduleStart);
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  window.addEventListener('keydown', onKeyDown);

  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasUserScrolled) {
          scheduleStart();
        }
      },
      {
        root: null,
        rootMargin: '0px 0px -104px 0px',
        threshold: [MIN_VISIBLE_RATIO]
      }
    );

    observer.observe(metric);
  }

  fetch('/api/views?count=1', {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin'
  })
    .then((res) => {
      if (!res.ok) throw new Error('views');
      return res.json();
    })
    .then((data) => {
      const value = Number(data?.total);
      if (Number.isSafeInteger(value) && value >= BASELINE_TOTAL) {
        target = value;

        if (!started || finished) {
          totalEl.textContent = formatter.format(target);
        }
      }
    })
    .catch(() => {});
})();
