// ---- Dark Mode --- //
// Toggle Dark/Light + nhớ lựa chọn
(() => {
  const STORAGE_KEY = "theme";
  const btn = document.getElementById("themeToggle");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  // lấy theme đã lưu hoặc theo system
  const saved = localStorage.getItem(STORAGE_KEY);
  const initial = saved || (prefersDark ? "dark" : "light");
  setTheme(initial);

  btn?.addEventListener("click", () => {
    const next =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "light"
        : "dark";
    setTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
  });

  function setTheme(mode) {
    document.documentElement.setAttribute("data-theme", mode);
    if (btn) {
      btn.textContent = mode === "dark" ? "☀️" : "🌙";
      btn.setAttribute(
        "aria-label",
        mode === "dark" ? "Chuyển sang sáng" : "Chuyển sang tối"
      );
    }
  }
})();
