(() => {
  const root = document.documentElement;
  const panels = [...document.querySelectorAll('[data-panel]')];
  const navItems = [...document.querySelectorAll('[data-nav]')];
  const goButtons = [...document.querySelectorAll('[data-go]')];
  const appearanceButton = document.getElementById('appearanceButton');
  const appearanceMenu = document.getElementById('appearanceMenu');
  const themeButtons = [...document.querySelectorAll('[data-theme-choice]')];

  function showPanel(name) {
    panels.forEach((panel) => {
      const active = panel.dataset.panel === name;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    navItems.forEach((item) => item.classList.toggle('is-active', item.dataset.nav === name));
    history.replaceState(null, '', '#' + name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  navItems.forEach((item) => item.addEventListener('click', () => showPanel(item.dataset.nav)));
  goButtons.forEach((item) => item.addEventListener('click', () => showPanel(item.dataset.go)));

  const initial = location.hash.replace('#', '');
  if (panels.some((panel) => panel.dataset.panel === initial)) showPanel(initial);

  function applyTheme(mode) {
    if (mode === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);

    localStorage.setItem('roclahy-theme', mode);
    themeButtons.forEach((button) => button.classList.toggle('is-selected', button.dataset.themeChoice === mode));
    appearanceMenu.hidden = true;
    appearanceButton.setAttribute('aria-expanded', 'false');
  }

  applyTheme(localStorage.getItem('roclahy-theme') || 'auto');

  appearanceButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const next = appearanceMenu.hidden;
    appearanceMenu.hidden = !next;
    appearanceButton.setAttribute('aria-expanded', String(next));
  });

  themeButtons.forEach((button) => button.addEventListener('click', () => applyTheme(button.dataset.themeChoice)));

  document.addEventListener('click', (event) => {
    if (!appearanceMenu.hidden && !appearanceMenu.contains(event.target) && !appearanceButton.contains(event.target)) {
      appearanceMenu.hidden = true;
      appearanceButton.setAttribute('aria-expanded', 'false');
    }
  });
})();
