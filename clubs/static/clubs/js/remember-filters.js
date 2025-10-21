(() => {
    const KEY_PATH = "last_list_path";
    const KEY_QUERY = "last_list_query";
  
    function joinUrlAndQuery(path, query) {
      if (!path) return "";
      if (!query) return path;
      return path.includes("?") ? `${path}&${query}` : `${path}?${query}`;
    }
  
    // Ở TRANG DANH SÁCH: khi click card, lưu lại path + query hiện tại
    document.addEventListener("click", (ev) => {
      const card = ev.target.closest(".card-link");
      if (!card) return;
      try {
        sessionStorage.setItem(KEY_PATH, location.pathname);
        sessionStorage.setItem(KEY_QUERY, location.search.replace(/^\?/, ""));
      } catch {}
    });
  
    // Ở TRANG CHI TIẾT: vá breadcrumb / nút back để kèm filter đã lưu
    document.addEventListener("DOMContentLoaded", () => {
      const savedPath = sessionStorage.getItem(KEY_PATH) || "";
      const savedQuery = sessionStorage.getItem(KEY_QUERY) || "";
      if (!savedPath || !savedQuery) return; // không có gì để khôi phục
  
      document
        .querySelectorAll(".js-breadcrumb-list, .js-back-to-list")
        .forEach((a) => {
          const baseHref = a.getAttribute("href") || savedPath;
          // Nếu link trỏ về đúng danh sách cũ → vá query
          const pointsToList =
            baseHref === savedPath ||
            baseHref.endsWith(savedPath) ||
            a.classList.contains("js-back-to-list");
          if (pointsToList) {
            a.setAttribute("href", joinUrlAndQuery(savedPath, savedQuery));
          }
        });
    });
  })();
  