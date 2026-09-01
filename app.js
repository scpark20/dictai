"use strict";

const state = { level: "A1", path: "conversation" };
const levels = [...document.querySelectorAll(".level")];
const paths = [...document.querySelectorAll(".path")];
const currentLevel = document.querySelector("#currentLevel");
const currentPath = document.querySelector("#currentPath");
const itemCount = document.querySelector("#itemCount");
const courseList = document.querySelector("#courseList");

const books = Object.freeze({
  A1: [
    { title: "Harry Potter", note: "Chapter 3 · 641 sentences", mark: "⚡", color: "#365486", href: "https://192.168.0.68:8771/" },
    { title: "Wonder", note: "Coming soon", mark: "✨", color: "#e6953b" },
    { title: "Matilda", note: "Coming soon", mark: "📚", color: "#a95183" },
    { title: "The Little Prince", note: "Coming soon", mark: "🌟", color: "#4b91a8" },
  ],
  A2: [
    { title: "Charlotte’s Web", note: "Coming soon", mark: "🕸️", color: "#588157" },
    { title: "Coraline", note: "Coming soon", mark: "🔘", color: "#645985" },
    { title: "The Giver", note: "Coming soon", mark: "🎁", color: "#457b9d" },
    { title: "Holes", note: "Coming soon", mark: "🕳️", color: "#bc6c25" },
  ],
  B1: [
    { title: "Percy Jackson", note: "Coming soon", mark: "🔱", color: "#277da1" },
    { title: "The Hobbit", note: "Coming soon", mark: "💍", color: "#6a994e" },
    { title: "The Book Thief", note: "Coming soon", mark: "📖", color: "#6c584c" },
    { title: "Animal Farm", note: "Coming soon", mark: "🐷", color: "#bc4749" },
  ],
  B2: [
    { title: "1984", note: "Coming soon", mark: "👁️", color: "#495057" },
    { title: "The Great Gatsby", note: "Coming soon", mark: "🥂", color: "#007f5f" },
    { title: "Jane Eyre", note: "Coming soon", mark: "🕯️", color: "#9d4edd" },
    { title: "Frankenstein", note: "Coming soon", mark: "⚗️", color: "#386641" },
  ],
  C1: [
    { title: "Pride and Prejudice", note: "Coming soon", mark: "💌", color: "#9c6644" },
    { title: "Wuthering Heights", note: "Coming soon", mark: "🌫️", color: "#577590" },
    { title: "Crime and Punishment", note: "Coming soon", mark: "⚖️", color: "#8d0801" },
    { title: "The Picture of Dorian Gray", note: "Coming soon", mark: "🖼️", color: "#7b2cbf" },
  ],
});

function bookCard(book, index) {
  const tag = book.href ? "a" : "button";
  const action = book.href ? `href="${book.href}"` : `type="button" aria-disabled="true"`;
  return `
    <${tag} class="book-card" ${action} aria-label="${book.title}" style="--row:${index}">
      <span class="book-cover" style="--cover:${book.color}" aria-hidden="true">${book.mark}</span>
      <span class="book-name">${book.title}</span>
    </${tag}>`;
}

function render() {
  document.body.dataset.level = state.level;
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
  document.querySelector(".content").classList.toggle("is-book", state.path === "book");

  if (state.path === "book") {
    const list = books[state.level];
    itemCount.textContent = `${list.length} books`;
    courseList.innerHTML = list.map(bookCard).join("");
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
  const openingBook = button.dataset.path === "book" && state.path !== "book";
  state.path = button.dataset.path;
  render();
  if (openingBook) {
    const content = document.querySelector(".content");
    content.classList.remove("is-opening");
    void content.offsetWidth;
    content.classList.add("is-opening");
  }
}));

render();
