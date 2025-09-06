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

// ==================== Filters + Pagination (AJAX, no reload) ====================
document.addEventListener("DOMContentLoaded", () => {
  const filterFormElement = document.getElementById("filters");
  const cardsContainerElement = document.getElementById("cards");
  const priceBandInputElement = document.getElementById("priceBandInput");

  if (!filterFormElement || !cardsContainerElement) return;

  let currentFetchController = null;
  let debounceTimerId = null;
  let lastQueryStringCache = null;

  function qsFromForm(formElement) {
    return new URLSearchParams(new FormData(formElement));
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

  async function doFetchAndRender(queryString, replaceUrlInHistory = true) {
    if (queryString === lastQueryStringCache) return; // tránh gọi trùng
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
        history.replaceState(null, "", `?${queryString}`);
      }
      cardsContainerElement.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    } catch (error) {
      if (error.name !== "AbortError") console.error(error);
    } finally {
      setCardsLoadingState(false);
    }
  }

  async function refreshCardsWithAjax(replaceUrlInHistory = true) {
    const params = qsFromForm(filterFormElement); // không set 'page' => mặc định trang 1
    await doFetchAndRender(params.toString(), replaceUrlInHistory);
  }

  async function refreshCardsWithPage(pageNumber, replaceUrlInHistory = true) {
    const params = qsFromForm(filterFormElement);
    params.set("page", pageNumber);
    await doFetchAndRender(params.toString(), replaceUrlInHistory);
  }

  // ✅ Chỉ MỘT listener document-level cho pagination (tránh trùng)
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a.page-link[data-page]");
    if (!link) return;
    event.preventDefault();
    const page = link.dataset.page;
    refreshCardsWithPage(page, true);
  });

  // Thay đổi filter → lọc ngay (reset page về 1)
  filterFormElement.addEventListener("change", () => debounceRefresh());

  // Chip mức giá
  document.querySelectorAll(".chip").forEach((chipButton) => {
    chipButton.addEventListener("click", () => {
      const selectedValue = chipButton.dataset.value || "";
      priceBandInputElement.value =
        priceBandInputElement.value === selectedValue ? "" : selectedValue;
      setActivePriceChipFromHiddenInput();
      debounceRefresh();
    });
  });

  // Ngăn submit thật
  filterFormElement.addEventListener("submit", (event) => {
    event.preventDefault();
    debounceRefresh();
  });

  // Back/forward
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

    const pageOnUrl = urlParams.get("page");
    if (pageOnUrl) {
      refreshCardsWithPage(pageOnUrl, false);
    } else {
      refreshCardsWithAjax(false);
    }
  });

  // Init
  setActivePriceChipFromHiddenInput();
});
