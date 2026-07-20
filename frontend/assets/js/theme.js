// ─────────────────────────────────────────────────────────────
//  Theme Manager — ระบบจัดการธีม (light/dark) สำหรับทุกหน้า
//  - โหลดสถานะจาก localStorage ก่อน render (ไม่กระพริบ)
//  - ใช้ storage event sync ข้ามแท็บ/หน้าต่างอัตโนมัติ
//  - dispatch 事件 themeChanged เพื่อให้ React อัปเดต state ได้
// ─────────────────────────────────────────────────────────────
(function () {
  const THEME_KEY = 'theme';
  const VALID_THEMES = ['light', 'dark'];

  function getStoredTheme() {
    const t = localStorage.getItem(THEME_KEY);
    return VALID_THEMES.includes(t) ? t : 'light';
  }

  function applyTheme(theme) {
    const html = document.documentElement;
    if (theme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
    html.setAttribute('data-theme', theme);
  }

  // Apply immediately on script load (prevents FOUC - flash of unstyled content)
  applyTheme(getStoredTheme());

  // Public API
  window.ThemeManager = {
    get: getStoredTheme,
    isDark: () => getStoredTheme() === 'dark',

    /** Toggle between light and dark, returns the new theme */
    toggle() {
      const next = getStoredTheme() === 'dark' ? 'light' : 'dark';
      this.set(next);
      return next;
    },

    /** Set a specific theme and broadcast the change */
    set(theme) {
      if (!VALID_THEMES.includes(theme)) return;
      localStorage.setItem(THEME_KEY, theme);
      applyTheme(theme);
      // Notify React/local listeners on this page
      window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
      // Notify other tabs/windows via storage event (handled below)
    },
  };

  // Backward-compatible global toggle (used by existing onClick handlers)
  window.toggleTheme = function () {
    return window.ThemeManager.toggle();
  };

  // Sync theme across tabs/windows — when localStorage changes elsewhere
  window.addEventListener('storage', (e) => {
    if (e.key === THEME_KEY && e.newValue !== e.oldValue) {
      const theme = VALID_THEMES.includes(e.newValue) ? e.newValue : 'light';
      applyTheme(theme);
      window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
    }
  });

  // Respect OS preference change ONLY if user has never chosen a theme
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(THEME_KEY)) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });
})();
