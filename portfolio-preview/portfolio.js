(() => {
  const root = document.documentElement;
  const buttons = Array.from(document.querySelectorAll('[data-theme-choice]'));
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const stored = localStorage.getItem('roclahy-theme') || 'auto';

  function applyTheme(mode) {
    if (mode === 'auto') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', mode);
    }

    buttons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === mode));
    });

    localStorage.setItem('roclahy-theme', mode);
  }

  applyTheme(stored);

  buttons.forEach((button) => {
    button.addEventListener('click', () => applyTheme(button.dataset.themeChoice));
  });

  media.addEventListener?.('change', () => {
    if ((localStorage.getItem('roclahy-theme') || 'auto') === 'auto') {
      root.removeAttribute('data-theme');
    }
  });

  const year = document.querySelector('[data-current-year]');
  if (year) year.textContent = new Date().getFullYear();

  const revealItems = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -30px' });

    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('visible'));
  }
})();
