// ==================== Chế độ tối/sáng (Dark Mode) ====================
// Thiết lập theme ban đầu, xử lý nút toggle, lưu vào localStorage
(() => {
  const storageKeyForTheme = "theme";
  const themeToggleButtonElement = document.getElementById("themeToggle");
  const systemPrefersDark = window.matchMedia(
    "(prefers-color-scheme: dark)"
  ).matches;

  const persistedTheme = localStorage.getItem(storageKeyForTheme);
  const initialTheme = persistedTheme || (systemPrefersDark ? "dark" : "light");
  setTheme(initialTheme);

  themeToggleButtonElement?.addEventListener("click", () => {
    const nextTheme =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "light"
        : "dark";
    setTheme(nextTheme);
    localStorage.setItem(storageKeyForTheme, nextTheme);
  });

  function setTheme(themeMode) {
    document.documentElement.setAttribute("data-theme", themeMode);
    if (themeToggleButtonElement) {
      themeToggleButtonElement.textContent = themeMode === "dark" ? "☀️" : "🌙";
      themeToggleButtonElement.setAttribute(
        "aria-label",
        themeMode === "dark" ? "Chuyển sang sáng" : "Chuyển sang tối"
      );
    }
  }
})();

// ==================== Nhớ filter khi đi/đến trang chi tiết ====================
// Lưu filter hiện tại khi bấm vào card; khôi phục khi bấm quay lại.
document.addEventListener("DOMContentLoaded", () => {
  const storageKeyForLastListQuery = "last_list_query";

  // 1) Bấm card -> lưu query hiện tại rồi đi tới trang chi tiết
  document.addEventListener("click", (event) => {
    const clickableCard = event.target.closest(".card-link");
    if (!clickableCard) return;

    sessionStorage.setItem(
      storageKeyForLastListQuery,
      location.search.replace(/^\?/, "")
    );

    const destinationUrl =
      clickableCard.getAttribute("href") ||
      clickableCard.getAttribute("data-href");
    if (destinationUrl && clickableCard.tagName !== "A") {
      event.preventDefault();
      location.href = destinationUrl;
    }
  });

  // 2) Bấm "quay lại danh sách"
  document.addEventListener("click", (event) => {
    const backLinkElement = event.target.closest(".link-back-to-list");
    if (!backLinkElement) return;
    event.preventDefault();

    const savedQuery = sessionStorage.getItem(storageKeyForLastListQuery) || "";
    location.href = savedQuery ? `/?${savedQuery}` : "/";
  });

  // 3) Nếu vào Home không có query, tự khôi phục filter gần nhất (nếu có)
  if (location.pathname === "/" && !location.search) {
    const savedQuery = sessionStorage.getItem(storageKeyForLastListQuery);
    if (savedQuery) location.replace(`/?${savedQuery}`);
  }
});

// ==================== Lọc + Phân trang + Tìm kiếm bằng AJAX ====================
document.addEventListener("DOMContentLoaded", () => {
  const filterFormElement = document.getElementById("filters"); // Form bộ lọc
  const cardsContainerElement = document.getElementById("cards"); // Khu hiển thị cards + phân trang
  const priceBandHiddenInputElement = document.getElementById("priceBandInput"); // Input ẩn cho “mức giá”
  const storageKeyForLastListQuery = "last_list_query";

  // Tìm kiếm (header)
  const searchFormElement = document.getElementById("searchFormElement");
  const searchTextInputElement = document.getElementById(
    "searchTextInputElement"
  );
  const searchTextHiddenInputElement = document.getElementById(
    "searchTextHiddenInputElement"
  );

  // Nếu không phải trang Home (không có form hoặc không có #cards) -> bỏ qua khối này
  if (!filterFormElement || !cardsContainerElement) return;

  // Trạng thái cho các request AJAX
  let currentAbortController = null;
  let debounceTimerId = null;
  let lastQueryStringCache = null;

  function buildQueryStringFromForm(formElement) {
    return new URLSearchParams(new FormData(formElement));
  }

  function applyQueryStringToForm(queryString) {
    // Đồng bộ checkbox, radio, select, input text của form filters theo URL
    const params = new URLSearchParams(queryString);
    Array.from(filterFormElement.elements).forEach((element) => {
      if (!element.name) return;

      if (element.type === "checkbox") {
        element.checked = params.getAll(element.name).includes(element.value);
      } else if (element.type === "radio") {
        element.checked = (params.get(element.name) || "") === element.value;
      } else {
        element.value = params.get(element.name) || "";
      }
    });
    // Đồng bộ chip mức giá
    setActivePriceChipFromHiddenInput();

    // Đồng bộ ô tìm kiếm ở header + input ẩn trong filters
    const searchTextFromUrl = params.get("search_text") || "";
    if (searchTextInputElement)
      searchTextInputElement.value = searchTextFromUrl;
    if (searchTextHiddenInputElement)
      searchTextHiddenInputElement.value = searchTextFromUrl;
  }

  function setCardsLoadingState(isLoading) {
    cardsContainerElement.classList.toggle("is-loading", isLoading);
  }

  function setActivePriceChipFromHiddenInput() {
    const chips = document.querySelectorAll(".chip");
    chips.forEach((chip) => {
      chip.classList.remove("active");
      chip.setAttribute("aria-pressed", "false");
    });
    const selectedValue = priceBandHiddenInputElement?.value || "";
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

  async function fetchAndRenderCards(
    queryString,
    shouldReplaceUrlInHistory = true
  ) {
    if (queryString === lastQueryStringCache) return;
    lastQueryStringCache = queryString;

    if (currentAbortController) currentAbortController.abort();
    currentAbortController = new AbortController();

    setCardsLoadingState(true);
    try {
      const response = await fetch(`?${queryString}`, {
        headers: { "X-Requested-With": "XMLHttpRequest" },
        signal: currentAbortController.signal,
      });
      const partialHtml = await response.text();
      cardsContainerElement.innerHTML = partialHtml;

      if (shouldReplaceUrlInHistory) {
        history.replaceState(null, "", `?${queryString}`);
      }

      // Lưu query mỗi lần lọc/phân trang/tìm kiếm để có thể khôi phục khi quay lại
      sessionStorage.setItem(storageKeyForLastListQuery, queryString);

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

  async function refreshCardsWithAjax(shouldReplaceUrlInHistory = true) {
    const queryParams = buildQueryStringFromForm(filterFormElement);
    await fetchAndRenderCards(
      queryParams.toString(),
      shouldReplaceUrlInHistory
    );
  }

  async function refreshCardsWithPage(
    pageNumber,
    shouldReplaceUrlInHistory = true
  ) {
    const queryParams = buildQueryStringFromForm(filterFormElement);
    queryParams.set("page", pageNumber);
    await fetchAndRenderCards(
      queryParams.toString(),
      shouldReplaceUrlInHistory
    );
  }

  // --- Bắt sự kiện: Phân trang ---
  document.addEventListener("click", (event) => {
    const linkElement = event.target.closest("a.page-link[data-page]");
    if (!linkElement) return;
    event.preventDefault();
    refreshCardsWithPage(linkElement.dataset.page, true);
  });

  // --- Bắt sự kiện: Thay đổi bất kỳ filter nào ---
  filterFormElement.addEventListener("change", () => debounceRefresh());

  // --- Bắt sự kiện: Chip mức giá ---
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const selectedValue = chip.dataset.value || "";
      priceBandHiddenInputElement.value =
        priceBandHiddenInputElement.value === selectedValue
          ? ""
          : selectedValue;
      setActivePriceChipFromHiddenInput();
      debounceRefresh();
    });
  });

  // --- Bắt sự kiện: Ngăn submit thật của form filters ---
  filterFormElement.addEventListener("submit", (event) => {
    event.preventDefault();
    debounceRefresh();
  });

  // --- Bắt sự kiện: Tìm kiếm (submit + gõ live) ---
  if (
    searchFormElement &&
    searchTextInputElement &&
    searchTextHiddenInputElement
  ) {
    // Submit tìm kiếm
    searchFormElement.addEventListener("submit", (event) => {
      event.preventDefault();
      searchTextHiddenInputElement.value = (
        searchTextInputElement.value || ""
      ).trim();

      const newParams = new URLSearchParams(new FormData(filterFormElement));
      newParams.set("search_text", searchTextHiddenInputElement.value);
      newParams.delete("page"); // về trang 1
      fetchAndRenderCards(newParams.toString(), true);
    });

    // Gõ để tìm live (debounce)
    let searchTypingDebounceId = null;
    searchTextInputElement.addEventListener("input", () => {
      clearTimeout(searchTypingDebounceId);
      searchTypingDebounceId = setTimeout(() => {
        searchTextHiddenInputElement.value = (
          searchTextInputElement.value || ""
        ).trim();
        const newParams = new URLSearchParams(new FormData(filterFormElement));
        newParams.set("search_text", searchTextHiddenInputElement.value);
        newParams.delete("page"); // về trang 1
        fetchAndRenderCards(newParams.toString(), true);
      }, 250);
    });

    // Nhấn ESC để xóa nhanh và tìm lại
    searchTextInputElement.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        searchTextInputElement.value = "";
        searchTextHiddenInputElement.value = "";
        const newParams = new URLSearchParams(new FormData(filterFormElement));
        newParams.set("search_text", "");
        newParams.delete("page");
        fetchAndRenderCards(newParams.toString(), true);
      }
    });
  }

  // --- Back/Forward của trình duyệt: đồng bộ form theo URL rồi render ---
  window.addEventListener("popstate", () => {
    const urlParams = new URLSearchParams(location.search);
    applyQueryStringToForm(location.search.replace(/^\?/, ""));
    const pageOnUrl = urlParams.get("page");
    if (pageOnUrl) {
      refreshCardsWithPage(pageOnUrl, false);
    } else {
      refreshCardsWithAjax(false);
    }
  });

  // --- Khởi tạo: đồng bộ filter + ô tìm kiếm từ URL ngay khi vào Home ---
  applyQueryStringToForm(location.search.replace(/^\?/, ""));
});

// ==================== Slider trang chi tiết ====================
window.addEventListener("load", () => {
  const sliderElement = document.querySelector(".slider");
  if (!sliderElement) return;

  const slideImages = Array.from(sliderElement.querySelectorAll("img"));
  const dotElements = Array.from(document.querySelectorAll(".slider-nav a"));
  if (slideImages.length <= 1) return;

  let currentIndex = 0;
  const INTERVAL = 4000;
  let timerId = null;

  function leftOf(index) {
    return slideImages[index].offsetLeft - sliderElement.offsetLeft;
  }

  function go(toIndex, isUser = false) {
    currentIndex = (toIndex + slideImages.length) % slideImages.length;
    sliderElement.scrollTo({ left: leftOf(currentIndex), behavior: "smooth" });
    dotElements.forEach((dot, idx) =>
      dot.classList.toggle("is-active", idx === currentIndex)
    );
    if (!isUser) restart();
  }

  function next() {
    go(currentIndex + 1);
  }

  function restart() {
    clearInterval(timerId);
    timerId = setInterval(next, INTERVAL);
  }

  dotElements.forEach((anchor, idx) => {
    anchor.addEventListener("click", (event) => {
      event.preventDefault();
      go(idx, true);
      restart();
    });
  });

  sliderElement.addEventListener("mouseenter", () => clearInterval(timerId));
  sliderElement.addEventListener("mouseleave", restart);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearInterval(timerId);
    else restart();
  });

  if (dotElements[0]) dotElements[0].classList.add("is-active");
  restart();
});
