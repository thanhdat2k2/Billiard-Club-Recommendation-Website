document.addEventListener("DOMContentLoaded", () => {
  // =============== Phần dùng chung: Nhớ path + query khi rời danh sách ===============
  const KEY_PATH = "last_list_path";
  const KEY_QUERY = "last_list_query";

  // Lưu khi bấm card-link (chạy trên mọi trang có card-link)
  document.addEventListener("click", (ev) => {
    const card = ev.target.closest(".card-link");
    if (!card) return;
    try {
      sessionStorage.setItem(KEY_PATH, location.pathname);
      sessionStorage.setItem(KEY_QUERY, location.search.replace(/^\?/, ""));
    } catch {}
  });

  // Vá breadcrumb / nút back ở TRANG CHI TIẾT (chạy mọi nơi, không phụ thuộc filters)
  (function patchDetailLinks() {
    const savedPath = sessionStorage.getItem(KEY_PATH) || "";
    const savedQuery = sessionStorage.getItem(KEY_QUERY) || "";
    if (!savedPath || !savedQuery) return;

    // Chuẩn hoá path để so sánh (bỏ dấu "/" cuối)
    const normalize = (p) => (p.endsWith("/") && p.length > 1 ? p.slice(0, -1) : p);

    const joinUrlAndQuery = (path, query) => {
      if (!path) return "";
      if (!query) return path;
      return path.includes("?") ? `${path}&${query}` : `${path}?${query}`;
    };

    const normalizedSaved = normalize(savedPath);

    document
      .querySelectorAll(".js-breadcrumb-list, .js-back-to-list")
      .forEach((a) => {
        const baseHref = a.getAttribute("href") || savedPath;

        // Dùng URL để lấy pathname (ổn định hơn)
        let candidatePath = baseHref;
        try {
          candidatePath = new URL(baseHref, location.origin).pathname;
        } catch {} // nếu là relative, URL sẽ tự xử lý với base = origin

        const normalizedCandidate = normalize(candidatePath);
        const shouldPatch =
          normalizedCandidate === normalizedSaved || a.classList.contains("js-back-to-list");

        if (shouldPatch) a.setAttribute("href", joinUrlAndQuery(savedPath, savedQuery));
      });
  })();

  // ==========================
  // PHẦN CHỈ CHẠY Ở TRANG LIST
  // ==========================
  const filtersContainer =
    document.querySelector(".refiner-filters") ||
    document.querySelector(".refiner__filters");

  if (!filtersContainer) return; // từ đây trở xuống là logic filter/sort cho trang danh sách

  // --------- Helpers nhỏ cho list ----------
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const $ = (sel, root = document) => root.querySelector(sel);
  const priceBandHiddenInput = document.getElementById("priceBandInput");
  const sortHiddenInput = document.getElementById("sortInput");

  // Lưu nhãn gốc các dropdown
  document.querySelectorAll("[data-dropdown] .label").forEach((label) => {
    if (!label.dataset.originalLabel) {
      label.dataset.originalLabel = label.textContent.trim();
    }
  });

  // --- Dropdown open/close ---
  function toggleDropdown(dropdown, open) {
    dropdown.classList.toggle("open", open);
    const menu = dropdown.querySelector(".menu");
    if (menu) menu.hidden = !open;
    dropdown.querySelector("[data-toggle]")?.setAttribute("aria-expanded", open ? "true" : "false");
  }
  function closeDropdown(d) { toggleDropdown(d, false); }
  function closeAllDropdowns() { $$("[data-dropdown].open").forEach(closeDropdown); }

  document.addEventListener("click", (e) => {
    const tgl = e.target.closest("[data-toggle]");
    const inside = e.target.closest("[data-dropdown]");

    if (tgl) {
      const dd = tgl.closest("[data-dropdown]");
      $$("[data-dropdown].open").forEach((d) => d !== dd && closeDropdown(d));
      toggleDropdown(dd, !dd.classList.contains("open"));
      return;
    }

    // Chip giá (không áp cho sort)
    const priceChip = e.target.closest(".sub-chip[data-value]");
    if (priceChip && !priceChip.classList.contains("sort-btn")) {
      if (priceBandHiddenInput) priceBandHiddenInput.value = priceChip.dataset.value || "";
      const menu = priceChip.closest(".menu");
      $$(".sub-chip[data-value]", menu).forEach((btn) =>
        btn.classList.toggle("is-selected", btn === priceChip)
      );
      updateFilterLabelForDropdown(priceChip.closest("[data-dropdown]"));
      applyFiltersFromDom();
      return;
    }

    if (!inside) closeAllDropdowns();
  });

  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAllDropdowns(); });

  // --- Hydrate inputs từ URL ---
  (function hydrateInputsFromUrl() {
    const params = new URLSearchParams(location.search);

    $$('input[name="district"]').forEach((el) => {
      el.checked = params.getAll("district").includes(el.value);
    });
    $$('input[name="table_type"]').forEach((el) => {
      el.checked = params.getAll("table_type").includes(el.value);
    });

    const rating = params.get("rating_band") || "";
    $$('input[name="rating_band"]').forEach((el) => { el.checked = el.value === rating; });

    const price = params.get("price_band") || "";
    if (priceBandHiddenInput) priceBandHiddenInput.value = price;
    document.querySelectorAll(".sub-chip[data-value]").forEach((btn) => {
      if (!btn.classList.contains("sort-btn")) {
        btn.classList.toggle("is-selected", btn.dataset.value === price);
      }
    });

    const sort = params.get("sort") || "";
    if (sortHiddenInput) sortHiddenInput.value = sort;
    document.querySelectorAll(".sort-btn[data-sort]").forEach((btn) => {
      const active = btn.dataset.sort === sort;
      btn.classList.toggle("is-selected", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  })();

  if (priceBandHiddenInput?.value) {
    const v = priceBandHiddenInput.value;
    document.querySelectorAll(".sub-chip[data-value]").forEach((btn) => {
      if (!btn.classList.contains("sort-btn")) {
        btn.classList.toggle("is-selected", btn.dataset.value === v);
      }
    });
  }

  // --- Cập nhật nhãn dropdown ---
  function summarizeMulti(baseLabel, values) {
    if (!values || values.length === 0) return baseLabel;
    if (values.length === 1) return `${baseLabel}: ${values[0]}`;
    return `${baseLabel}: ${values[0]} +${values.length - 1}`;
  }
  function updateFilterLabelForDropdown(dd) {
    if (!dd) return;
    const label = dd.querySelector(".label");
    if (!label) return;
    const defaultText = label.dataset.originalLabel || label.textContent.trim();

    if (dd.querySelector('input[name="district"]')) {
      const vals = $$('input[name="district"]:checked', dd).map((i) => i.value);
      label.textContent = summarizeMulti(defaultText, vals); return;
    }
    if (dd.querySelector('input[name="table_type"]')) {
      const vals = $$('input[name="table_type"]:checked', dd).map((i) => i.value);
      label.textContent = summarizeMulti(defaultText, vals); return;
    }
    if (dd.querySelector('input[name="rating_band"]')) {
      const r = dd.querySelector('input[name="rating_band"]:checked');
      label.textContent = r ? r.closest("label")?.textContent.trim() || `${defaultText}: ${r.value}` : defaultText;
      return;
    }
    if (dd.querySelector(".sub-chip[data-value]:not(.sort-btn)")) {
      const chip = dd.querySelector(".sub-chip.is-selected:not(.sort-btn)");
      const chipText = chip ? chip.textContent.trim() : priceBandHiddenInput?.value || "";
      label.textContent = chipText ? `${defaultText}: ${chipText}` : defaultText; return;
    }
    if (dd.querySelector(".sort-btn[data-sort]")) {
      const sbtn = dd.querySelector(".sort-btn.is-selected");
      label.textContent = sbtn ? sbtn.textContent.trim() : defaultText;
    }
  }
  document.querySelectorAll("[data-dropdown]").forEach(updateFilterLabelForDropdown);

  // --- Change inputs -> áp dụng ---
  filtersContainer.addEventListener("change", (e) => {
    const name = e.target?.name;
    if (!name) return;
    if (!new Set(["district", "table_type", "rating_band"]).has(name)) return;
    updateFilterLabelForDropdown(e.target.closest("[data-dropdown]"));
    applyFiltersFromDom();
  });

  // --- Click sort button ---
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".sort-btn[data-sort]");
    if (!btn) return;
    if (sortHiddenInput) sortHiddenInput.value = btn.dataset.sort || "";
    const menu = btn.closest(".menu");
    menu?.querySelectorAll(".sort-btn[data-sort]").forEach((b) => {
      const active = b === btn;
      b.classList.toggle("is-selected", active);
      b.setAttribute("aria-pressed", active ? "true" : "false");
    });
    updateFilterLabelForDropdown(btn.closest("[data-dropdown]"));
    closeDropdown(btn.closest("[data-dropdown]"));
    applyFiltersFromDom();
  });

  // --- Build query & reload ---
  function applyFiltersFromDom() {
    const params = new URLSearchParams(location.search);
    ["district", "table_type", "rating_band", "price_band", "sort", "page"].forEach((k) => params.delete(k));

    document.querySelectorAll('input[name="district"]:checked').forEach((el) => params.append("district", el.value));
    document.querySelectorAll('input[name="table_type"]:checked').forEach((el) => params.append("table_type", el.value));
    const r = document.querySelector('input[name="rating_band"]:checked'); if (r) params.set("rating_band", r.value);
    if (priceBandHiddenInput?.value) params.set("price_band", priceBandHiddenInput.value);
    if (sortHiddenInput?.value) params.set("sort", sortHiddenInput.value);

    const next = window.location.pathname + (params.toString() ? `?${params.toString()}` : "");
    window.location.assign(next);
  }
});
