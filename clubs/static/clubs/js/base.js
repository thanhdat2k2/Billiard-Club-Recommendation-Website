document.addEventListener("DOMContentLoaded", () => {
  const menuIcon = document.getElementById("menu-icon");
  const navbar = document.getElementById("navbar");
  if (!menuIcon || !navbar) return;

  menuIcon.addEventListener("click", () => {
    navbar.classList.toggle("active");
  });
});
