(() => {
  const BASELINE_TOTAL = 118131;
  const metric = document.querySelector('.site-metric');
  const totalEl = document.getElementById('siteViewsTotal');

  if (!metric || !totalEl) return;

  let target = BASELINE_TOTAL;
  let targetReady = false;
  let visible = false;
  let started = false;
  let startTimer = null;

  const locale = document.documentElement.lang === 'en' ? 'en-US' : 'es-ES';
  const formatter = new Intl.NumberFormat(locale);

  const animate = () => {
    if (started || !visible || !targetReady) return;

    started = true;
    const duration = 2200;
    const startedAt = performance.now();
    totalEl.textContent = '0';

    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      totalEl.textContent = formatter.format(Math.round(target * eased));

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        totalEl.textContent = formatter.format(target);
      }
    };

    requestAnimationFrame(tick);
  };

  const scheduleAnimation = () => {
    if (started || startTimer || !visible || !targetReady) return;

    startTimer = window.setTimeout(() => {
      startTimer = null;
      if (visible) animate();
    }, 450);
  };

  const updateVisibility = (isVisible) => {
    visible = isVisible;

    if (!visible && startTimer) {
      clearTimeout(startTimer);
      startTimer = null;
      return;
    }

    if (visible) scheduleAnimation();
  };

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      updateVisibility(Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.55));

      if (started) observer.disconnect();
    }, {
      threshold: [0, 0.55, 0.85, 1]
    });

    observer.observe(metric);
  } else {
    updateVisibility(true);
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
      const total = Number(data?.total);
      if (Number.isSafeInteger(total) && total >= BASELINE_TOTAL) {
        target = total;
      }
    })
    .catch(() => {
      target = BASELINE_TOTAL;
    })
    .finally(() => {
      targetReady = true;
      if (!started) totalEl.textContent = formatter.format(target);
      scheduleAnimation();
    });
})();