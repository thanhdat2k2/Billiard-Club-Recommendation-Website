document.addEventListener("DOMContentLoaded", () => {
  const menuIcon = document.getElementById("menu-icon");
  const navbar = document.getElementById("navbar");
  if (!menuIcon || !navbar) return;

  menuIcon.addEventListener("click", () => {
    navbar.classList.toggle("active");
  });
});

document.addEventListener("DOMContentLoaded", function () {
  const toasts = document.querySelectorAll(".toast");
  toasts.forEach((toast, index) => {
    // hiệu ứng show
    setTimeout(() => {
      toast.classList.add("show");
    }, 50 + index * 100);

    // auto ẩn sau 4s
    setTimeout(() => {
      toast.classList.remove("show");
    }, 4000 + index * 200);

    // nút X
    toast.querySelector(".toast-close").addEventListener("click", () => {
      toast.classList.remove("show");
    });
  });
});
