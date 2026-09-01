"use strict";

const state = { level: "A1", path: "conversation" };
const levels = [...document.querySelectorAll(".level")];
const paths = [...document.querySelectorAll(".path")];
const currentLevel = document.querySelector("#currentLevel");
const currentPath = document.querySelector("#currentPath");
const itemCount = document.querySelector("#itemCount");
const courseList = document.querySelector("#courseList");

function render() {
  levels.forEach((button) => {
    const active = button.dataset.level === state.level;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-checked", String(active));
  });
  paths.forEach((button) => {
    const active = button.dataset.path === state.path;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  currentLevel.textContent = state.level;
  currentPath.textContent = state.path === "book" ? "Book" : "Conversation";

  if (state.level === "A1" && state.path === "book") {
    itemCount.textContent = "1 course";
    courseList.innerHTML = `
      <article class="course">
        <div class="course-copy">
          <small>BOOK · A1</small>
          <strong>Harry Potter</strong>
          <span>Chapter 3 · 641 sentences</span>
        </div>
        <a class="open-course" href="https://192.168.0.68:8771/">Open →</a>
      </article>`;
  } else {
    itemCount.textContent = "Coming soon";
    courseList.innerHTML = `<div class="empty">No courses yet.</div>`;
  }
}

levels.forEach((button) => button.addEventListener("click", () => {
  state.level = button.dataset.level;
  render();
}));
paths.forEach((button) => button.addEventListener("click", () => {
  state.path = button.dataset.path;
  render();
}));

render();
