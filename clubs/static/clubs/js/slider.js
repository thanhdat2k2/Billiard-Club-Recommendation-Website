document.addEventListener("DOMContentLoaded", () => {
  const SLIDER_SELECTOR = "[data-slider]"; // Container slider
  const TRACK_SELECTOR = "[data-track]"; // Phần cuộn ngang chứa các slide

  document.querySelectorAll(SLIDER_SELECTOR).forEach((containerElement) => {
    const trackElement =
      containerElement.querySelector(TRACK_SELECTOR) ||
      containerElement.firstElementChild;
    if (!trackElement) return;

    const totalSlides = trackElement.children.length;
    if (totalSlides < 2) return; // chỉ 1 ảnh thì không cần autoplay

    // (Tuỳ chọn) điều hướng chấm
    const navigationContainer = containerElement.querySelector("[data-nav]");
    const navigationButtons = navigationContainer
      ? Array.from(navigationContainer.querySelectorAll(".nav-dot"))
      : [];

    const autoplayDelayMilliseconds = Number(containerElement.dataset.interval);

    // Trạng thái chạy
    let currentSlideIndex = Math.round(
      trackElement.scrollLeft / trackElement.clientWidth
    );
    let autoplayIntervalId = null;
    let scrollIdleTimerId = null; // dùng để phát hiện "đã ngừng vuốt" (debounce)

    function updateNavigationDots() {
      if (!navigationButtons.length) return;
      navigationButtons.forEach((buttonElement, index) =>
        buttonElement.classList.toggle("is-active", index === currentSlideIndex)
      );
    }

    function goToSlide(targetIndex, initiatedByUser = false) {
      // Vòng về đầu/cuối bằng modulo
      const boundedIndex = (targetIndex + totalSlides) % totalSlides;
      currentSlideIndex = boundedIndex;

      // Cuộn tới đúng biên slide theo bề rộng khung
      trackElement.scrollTo({
        left: boundedIndex * trackElement.clientWidth,
        behavior: "smooth",
      });

      updateNavigationDots();

      // Giữ nhịp autoplay ổn định (reset interval) nếu không phải do người dùng
      if (!initiatedByUser) startAutoplay();
    }

    function startAutoplay() {
      stopAutoplay(); // tránh tạo nhiều interval
      autoplayIntervalId = setInterval(
        () => goToSlide(currentSlideIndex + 1),
        autoplayDelayMilliseconds
      );
    }

    function stopAutoplay() {
      if (autoplayIntervalId) {
        clearInterval(autoplayIntervalId);
        autoplayIntervalId = null;
      }
    }

    // Click chấm để nhảy tới slide (nếu có chấm)
    navigationButtons.forEach((buttonElement) => {
      buttonElement.addEventListener("click", () => {
        const index =
          Number(buttonElement.dataset.index) ||
          navigationButtons.indexOf(buttonElement);
        goToSlide(index, true);
        // Người dùng vừa thao tác → khởi động lại nhịp tự chạy
        startAutoplay();
      });
    });

    // ====== TẠM DỪNG KHI NGƯỜI DÙNG VUỐT/SCROLL ======
    // Khi bắt đầu vuốt/chạm: dừng autoplay ngay
    trackElement.addEventListener("touchstart", stopAutoplay, {
      passive: true,
    });
    trackElement.addEventListener("pointerdown", stopAutoplay); // cho chuột/pen

    // Khi kết thúc chạm/nhả chuột: đợi 1 chút cho scroll-snap ổn định rồi chạy lại
    trackElement.addEventListener("touchend", () =>
      setTimeout(startAutoplay, 200)
    );
    trackElement.addEventListener("pointerup", () =>
      setTimeout(startAutoplay, 200)
    );

    // Khi cuộn (bằng bánh xe/trackpad/drag scrollbar): dừng, cập nhật index, đợi "idle" rồi chạy lại
    trackElement.addEventListener("wheel", stopAutoplay, { passive: true });
    trackElement.addEventListener("scroll", () => {
      // Cập nhật slide hiện tại theo vị trí cuộn
      currentSlideIndex = Math.round(
        trackElement.scrollLeft / trackElement.clientWidth
      );
      updateNavigationDots();

      // Debounce: mỗi lần còn cuộn thì huỷ timer; chỉ khi ngừng cuộn ~500ms mới chạy lại
      if (scrollIdleTimerId) clearTimeout(scrollIdleTimerId);
      scrollIdleTimerId = setTimeout(startAutoplay, 300);
    });

    // Tiết kiệm tài nguyên: tab ẩn thì dừng, quay lại thì chạy tiếp
    document.addEventListener("visibilitychange", () =>
      document.hidden ? stopAutoplay() : startAutoplay()
    );

    // Khi thay đổi kích thước màn hình, căn lại đúng mép slide hiện tại
    window.addEventListener("resize", () => goToSlide(currentSlideIndex, true));

    // Khởi động
    updateNavigationDots();
    startAutoplay();
  });
});
