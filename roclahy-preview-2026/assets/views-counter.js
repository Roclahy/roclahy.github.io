(() => {
  const BASELINE_TOTAL = 118131;
  const TRIGGER_RATIO = 0.80;
  const MIN_REAL_SCROLL = 24;

  const metric = document.querySelector('.site-metric');
  const totalEl = document.getElementById('siteViewsTotal');
  if (!metric || !totalEl) return;

  let target = Number(String(totalEl.textContent || '').replace(/\D/g, '')) || BASELINE_TOTAL;
  let started = false;
  let finished = false;
  let raf = 0;
  let hasScrollIntent = false;
  let touchStartY = null;
  const initialScrollY = window.scrollY;

  const formatter = new Intl.NumberFormat(
    document.documentElement.lang === 'en' ? 'en-US' : 'es-ES'
  );
  const reduceMotion =
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

  // El contador permanece en cero hasta que el usuario llegue realmente a él.
  totalEl.textContent = '0';

  const visibleViewport = () => {
    const vv = window.visualViewport;
    if (vv) {
      return {
        top: vv.offsetTop || 0,
        height: vv.height
      };
    }

    return {
      top: 0,
      height: document.documentElement.clientHeight || window.innerHeight
    };
  };

  const reachedTriggerLine = () => {
    const rect = metric.getBoundingClientRect();
    const viewport = visibleViewport();
    const triggerY = viewport.top + viewport.height * TRIGGER_RATIO;

    return rect.top <= triggerY && rect.bottom > viewport.top;
  };

  const hasActuallyScrolled = () =>
    Math.abs(window.scrollY - initialScrollY) >= MIN_REAL_SCROLL;

  const cleanup = () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('keydown', onKeyDown);
    window.visualViewport?.removeEventListener('resize', onViewportChange);
  };

  const animate = () => {
    if (started) return;
    if (!hasScrollIntent || !hasActuallyScrolled() || !reachedTriggerLine()) return;

    started = true;
    cleanup();

    if (reduceMotion) {
      finished = true;
      totalEl.textContent = formatter.format(target);
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

  function onScroll() {
    // Solo un desplazamiento real, precedido por intención explícita del usuario,
    // puede iniciar la animación. Los ajustes automáticos del navegador no bastan.
    animate();
  }

  function onWheel(event) {
    if (Math.abs(event.deltaY) > 1) {
      hasScrollIntent = true;
    }
  }

  function onTouchStart(event) {
    touchStartY = event.touches?.[0]?.clientY ?? null;
  }

  function onTouchMove(event) {
    const y = event.touches?.[0]?.clientY;
    if (touchStartY == null || y == null) return;

    if (Math.abs(y - touchStartY) >= 8) {
      hasScrollIntent = true;
    }
  }

  function onKeyDown(event) {
    if (['ArrowDown', 'PageDown', 'End', ' ', 'Spacebar'].includes(event.key)) {
      hasScrollIntent = true;
      requestAnimationFrame(animate);
    }
  }

  function onViewportChange() {
    if (hasScrollIntent && hasActuallyScrolled()) {
      requestAnimationFrame(animate);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  window.addEventListener('keydown', onKeyDown);
  window.visualViewport?.addEventListener('resize', onViewportChange, { passive: true });

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

        // Antes de activarse debe seguir mostrando 0. Si ya terminó,
        // sí actualizamos el total por si la respuesta llegó tarde.
        if (finished) {
          totalEl.textContent = formatter.format(target);
        }
      }
    })
    .catch(() => {});
})();
