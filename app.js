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
    { title: "The Tale of Peter Rabbit", note: "Gutenberg", mark: "🐇", color: "#6a994e" },
    { title: "The Adventures of Pinocchio", note: "Gutenberg", mark: "🤥", color: "#bc6c25" },
    { title: "Aesop’s Fables", note: "Gutenberg", mark: "🦊", color: "#588157" },
    { title: "The Story of Doctor Dolittle", note: "Gutenberg", mark: "🦜", color: "#457b9d" },
  ],
  A2: [
    { title: "The Wonderful Wizard of Oz", note: "Gutenberg", mark: "🌪️", color: "#4d908e" },
    { title: "Alice’s Adventures in Wonderland", note: "Gutenberg", mark: "🐰", color: "#577590" },
    { title: "Heidi", note: "Gutenberg", mark: "🏔️", color: "#43aa8b" },
    { title: "Black Beauty", note: "Gutenberg", mark: "🐎", color: "#495057" },
  ],
  B1: [
    { title: "The Secret Garden", note: "Gutenberg", mark: "🌹", color: "#588157" },
    { title: "Anne of Green Gables", note: "Gutenberg", mark: "🏡", color: "#bc6c25" },
    { title: "The Jungle Book", note: "Gutenberg", mark: "🐅", color: "#386641" },
    { title: "Treasure Island", note: "Gutenberg", mark: "🏴‍☠️", color: "#277da1" },
  ],
  B2: [
    { title: "The Adventures of Sherlock Holmes", note: "Gutenberg", mark: "🔍", color: "#6c584c" },
    { title: "Dr. Jekyll and Mr. Hyde", note: "Gutenberg", mark: "⚗️", color: "#495057" },
    { title: "Frankenstein", note: "Coming soon", mark: "⚗️", color: "#386641" },
    { title: "A Christmas Carol", note: "Gutenberg", mark: "🔔", color: "#bc4749" },
  ],
  C1: [
    { title: "Pride and Prejudice", note: "Coming soon", mark: "💌", color: "#9c6644" },
    { title: "Wuthering Heights", note: "Coming soon", mark: "🌫️", color: "#577590" },
    { title: "Jane Eyre", note: "Gutenberg", mark: "🕯️", color: "#9d4edd" },
    { title: "Moby-Dick", note: "Gutenberg", mark: "🐋", color: "#277da1" },
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
