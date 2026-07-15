// Theme helper for system-wide dark/light mode
(function () {
  const currentTheme = localStorage.getItem('theme') || 'light';
  if (currentTheme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
})();

window.toggleTheme = function () {
  const html = document.documentElement;
  if (html.classList.contains('dark')) {
    html.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  } else {
    html.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  }
  // Dispatch custom event so React components can update state if needed
  window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: localStorage.getItem('theme') } }));
};
