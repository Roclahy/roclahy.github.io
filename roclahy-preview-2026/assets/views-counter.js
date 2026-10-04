(() => {
  const BASELINE_TOTAL = 118131;
  const metric = document.querySelector('.site-metric');
  const totalEl = document.getElementById('siteViewsTotal');
  if (!metric || !totalEl) return;

  let target = Number(String(totalEl.textContent || '').replace(/\D/g, '')) || BASELINE_TOTAL;
  let started = false;
  let raf = 0;

  const formatter = new Intl.NumberFormat(document.documentElement.lang === 'en' ? 'en-US' : 'es-ES');

  const isVisible = () => {
    const rect = metric.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    return rect.top < vh * 0.95 && rect.bottom > vh * 0.05;
  };

  const animate = () => {
    if (started || !isVisible()) return;
    started = true;

    window.removeEventListener('scroll', check, { passive: true });
    window.removeEventListener('resize', check);

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
        totalEl.textContent = formatter.format(target);
      }
    };

    raf = requestAnimationFrame(tick);
  };

  const check = () => {
    if (started) return;
    if (isVisible()) {
      window.setTimeout(animate, 180);
    }
  };

  window.addEventListener('scroll', check, { passive: true });
  window.addEventListener('resize', check);
  window.addEventListener('pageshow', check);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) check();
  });

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
        if (!started) totalEl.textContent = formatter.format(target);
      }
    })
    .catch(() => {});

  check();
})();