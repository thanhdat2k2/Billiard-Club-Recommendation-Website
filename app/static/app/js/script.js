// ==================== Dark Mode ====================
// Toggle Dark/Light + nhớ lựa chọn
(() => {
  const STORAGE_KEY = "theme";
  const toggleButtonElement = document.getElementById("themeToggle");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  const savedTheme = localStorage.getItem(STORAGE_KEY);
  const initialTheme = savedTheme || (prefersDark ? "dark" : "light");
  setTheme(initialTheme);

  toggleButtonElement?.addEventListener("click", () => {
    const nextTheme =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "light"
        : "dark";
    setTheme(nextTheme);
    localStorage.setItem(STORAGE_KEY, nextTheme);
  });

  function setTheme(mode) {
    document.documentElement.setAttribute("data-theme", mode);
    if (toggleButtonElement) {
      toggleButtonElement.textContent = mode === "dark" ? "☀️" : "🌙";
      toggleButtonElement.setAttribute(
        "aria-label",
        mode === "dark" ? "Chuyển sang sáng" : "Chuyển sang tối"
      );
    }
  }
})();

// ==================== Filters (AJAX, no reload) ====================
document.addEventListener("DOMContentLoaded", () => {
  const filterFormElement = document.getElementById("filters");
  const cardsContainerElement = document.getElementById("cards");
  const priceBandInputElement = document.getElementById("priceBandInput");

  // Nếu không có form hoặc container thì thoát sớm (tránh lỗi trên các trang khác)
  if (!filterFormElement || !cardsContainerElement) return;

  let currentFetchController = null;
  let debounceTimerId = null;
  let lastQueryStringCache = null;

  function buildQueryStringFromForm(formElement) {
    return new URLSearchParams(new FormData(formElement)).toString();
  }

  function setCardsLoadingState(isLoading) {
    cardsContainerElement.classList.toggle("is-loading", isLoading);
  }

  function setActivePriceChipFromHiddenInput() {
    const allPriceChips = document.querySelectorAll(".chip");
    allPriceChips.forEach((chip) => {
      chip.classList.remove("active");
      chip.setAttribute("aria-pressed", "false");
    });

    const selectedValue = priceBandInputElement?.value || "";
    if (!selectedValue) return;

    const activeChip = document.querySelector(
      `.chip[data-value="${selectedValue}"]`
    );
    if (activeChip) {
      activeChip.classList.add("active");
      activeChip.setAttribute("aria-pressed", "true");
    }
  }

  function debounceRefresh(delayMilliseconds = 180) {
    clearTimeout(debounceTimerId);
    debounceTimerId = setTimeout(
      () => refreshCardsWithAjax(true),
      delayMilliseconds
    );
  }

  async function refreshCardsWithAjax(replaceUrlInHistory = true) {
    const queryString = buildQueryStringFromForm(filterFormElement);

    // Nếu tham số không đổi thì không gọi lại (tránh giật)
    if (queryString === lastQueryStringCache) return;
    lastQueryStringCache = queryString;

    if (currentFetchController) currentFetchController.abort();
    currentFetchController = new AbortController();

    setCardsLoadingState(true);
    try {
      const response = await fetch(`?${queryString}`, {
        headers: { "X-Requested-With": "XMLHttpRequest" },
        signal: currentFetchController.signal,
      });
      const partialHtml = await response.text();
      cardsContainerElement.innerHTML = partialHtml;

      if (replaceUrlInHistory) {
        // dùng replaceState để không “spam” lịch sử
        history.replaceState(null, "", `?${queryString}`);
      }
    } catch (error) {
      if (error.name !== "AbortError") console.error(error);
    } finally {
      setCardsLoadingState(false);
    }
  }

  // 1) Thay đổi checkbox/radio trong form → lọc ngay
  filterFormElement.addEventListener("change", () => debounceRefresh());

  // 2) Chip mức giá: click để gán giá trị vào input ẩn rồi lọc
  document.querySelectorAll(".chip").forEach((chipButton) => {
    chipButton.addEventListener("click", () => {
      const selectedValue = chipButton.dataset.value || "";
      priceBandInputElement.value =
        priceBandInputElement.value === selectedValue ? "" : selectedValue;

      setActivePriceChipFromHiddenInput();
      debounceRefresh();
    });
  });

  // 3) Ngăn submit thật (phòng người dùng bấm Enter) -> dùng AJAX thay thế
  filterFormElement.addEventListener("submit", (event) => {
    event.preventDefault();
    debounceRefresh();
  });

  // 4) Back/forward: đồng bộ form từ URL rồi render
  window.addEventListener("popstate", () => {
    const urlParams = new URLSearchParams(location.search);
    Array.from(filterFormElement.elements).forEach((element) => {
      if (!element.name) return;

      if (element.type === "checkbox") {
        element.checked = urlParams
          .getAll(element.name)
          .includes(element.value);
      } else if (element.type === "radio") {
        element.checked = (urlParams.get(element.name) || "") === element.value;
      } else {
        element.value = urlParams.get(element.name) || "";
      }
    });

    setActivePriceChipFromHiddenInput();
    // ép làm mới nhưng KHÔNG thay URL (đã ở đúng trạng thái)
    refreshCardsWithAjax(false);
  });

  // 5) Khởi tạo trạng thái chip giá theo giá trị trong input ẩn
  setActivePriceChipFromHiddenInput();
});
