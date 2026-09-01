"use strict";

const state = { level: "A1", path: "conversation" };
const levels = [...document.querySelectorAll(".level")];
const topicList = document.querySelector("#topicList");
const bookList = document.querySelector("#bookList");

const topics = Object.freeze([
  "Travel", "Work", "School", "Daily Life", "Shopping",
  "Food & Dining", "Friends & Family", "Health", "Hobbies", "Emergencies", "Random",
]);

const books = Object.freeze({
  A1: [
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

const coverArt = Object.freeze({
  "The Tale of Peter Rabbit": `<svg viewBox="0 0 38 52"><path d="M0 34Q10 25 19 34T38 31v21H0z" fill="#315f35"/><path d="M18 31c-7-6-4-14 1-12-1-9 2-13 5-4 3-8 6-5 2 7-2 10 6 3 5 11-1 15H17c-3-6-2-9 1-11z" fill="#e7dfcf"/><circle cx="27" cy="22" r="1" fill="#222"/></svg>`,
  "The Adventures of Pinocchio": `<svg viewBox="0 0 38 52"><path d="M8 42l8-23 12 2 4 22z" fill="#6c301d"/><circle cx="21" cy="16" r="8" fill="#e8b875"/><path d="M21 16h15l-15 3z" fill="#8f3b25"/><path d="M12 10h18l-4-6H15z" fill="#2c483b"/></svg>`,
  "Aesop’s Fables": `<svg viewBox="0 0 38 52"><circle cx="19" cy="25" r="15" fill="#efd694"/><path d="m8 17 7 2 4-8 4 8 8-2-4 8 3 10-11 6-11-6 3-10z" fill="#9a4b27"/><path d="m15 28 4 3 5-3" fill="none" stroke="#261b17" stroke-width="2"/></svg>`,
  "The Story of Doctor Dolittle": `<svg viewBox="0 0 38 52"><path d="M0 38Q9 30 18 38T38 36v16H0z" fill="#17586a"/><circle cx="19" cy="21" r="10" fill="#f0d7af"/><path d="M10 18Q19 4 28 18" fill="#f4f0df"/><path d="M5 41q8-18 14 0M33 41q-8-18-14 0" fill="#286d47"/></svg>`,
  "The Wonderful Wizard of Oz": `<svg viewBox="0 0 38 52"><path d="M13 52 18 25h5l5 27z" fill="#f2d34f"/><path d="M8 26h22L27 12l-4 5-4-10-4 10-4-5z" fill="#0d7e69"/><path d="M4 8q13 3 6 16" fill="none" stroke="#eef4df" stroke-width="3"/></svg>`,
  "Alice’s Adventures in Wonderland": `<svg viewBox="0 0 38 52"><circle cx="19" cy="29" r="14" fill="#e9e4d4"/><circle cx="19" cy="29" r="10" fill="none" stroke="#33445d" stroke-width="2"/><path d="M19 29V21m0 8 6 4M10 14l4-11 5 12M23 15l4-12 4 13" fill="none" stroke="#f7f3e8" stroke-width="4"/></svg>`,
  "Heidi": `<svg viewBox="0 0 38 52"><circle cx="29" cy="10" r="5" fill="#ffe18a"/><path d="m0 39 12-20 6 9 7-15 13 26v13H0z" fill="#e9f0e7"/><path d="M0 42q12-9 38 0v10H0z" fill="#397853"/><path d="M16 38h10v9H16z" fill="#7b4227"/></svg>`,
  "Black Beauty": `<svg viewBox="0 0 38 52"><circle cx="25" cy="13" r="7" fill="#d9c49b"/><path d="M7 42q4-23 14-25 12 8 9 27H18l-3-9-3 9z" fill="#151a1d"/><path d="m20 19 10-9-3 13" fill="#151a1d"/><circle cx="25" cy="19" r="1" fill="#fff"/></svg>`,
  "The Secret Garden": `<svg viewBox="0 0 38 52"><path d="M7 52V19h24v33" fill="#173f2d"/><path d="M11 52V25h16v27" fill="#101d18"/><path d="M19 31v12m-6-6h12" stroke="#b88b43" stroke-width="2"/><path d="M3 20q7-13 13 0M22 18q8-14 14 1" fill="none" stroke="#d8899a" stroke-width="3"/></svg>`,
  "Anne of Green Gables": `<svg viewBox="0 0 38 52"><path d="M0 38q18-10 38 0v14H0z" fill="#5f8a53"/><path d="M9 28h21v15H9z" fill="#eee5cf"/><path d="m6 29 13-11 14 11z" fill="#244d36"/><path d="M8 14q10-9 22 0" fill="none" stroke="#c66c38" stroke-width="4"/></svg>`,
  "The Jungle Book": `<svg viewBox="0 0 38 52"><circle cx="28" cy="10" r="6" fill="#f0bd4b"/><path d="M0 20q8-8 12 0 7-13 14 0 8-8 12 0v32H0z" fill="#174c35"/><path d="M8 43q5-18 12-13 8-3 11 13" fill="#d87631"/><path d="m15 33 3 8m6-9-2 9" stroke="#29251e" stroke-width="2"/></svg>`,
  "Treasure Island": `<svg viewBox="0 0 38 52"><path d="M0 34q9-7 19 0t19 0v18H0z" fill="#176784"/><path d="m5 31 11-17 13 17z" fill="#d7c188"/><path d="M16 14v25" stroke="#57351f" stroke-width="2"/><path d="M18 10h13v9H18z" fill="#251d1b"/><path d="m27 40 7 7m0-7-7 7" stroke="#e3b64e" stroke-width="2"/></svg>`,
  "The Adventures of Sherlock Holmes": `<svg viewBox="0 0 38 52"><circle cx="17" cy="22" r="10" fill="none" stroke="#d6b06e" stroke-width="4"/><path d="m24 30 10 13" stroke="#d6b06e" stroke-width="4"/><path d="M5 12q12-10 24 0l-4 4H9z" fill="#292722"/><path d="M0 48q8-14 16 0" fill="#20282b"/></svg>`,
  "Dr. Jekyll and Mr. Hyde": `<svg viewBox="0 0 38 52"><path d="M19 0v52H0V0z" fill="#d7d1bf"/><path d="M19 0h19v52H19z" fill="#192229"/><path d="M9 38q-2-17 10-23 12 6 10 23l-5 8H14z" fill="#64715f"/><path d="M19 15v31" stroke="#111"/></svg>`,
  "Frankenstein": `<svg viewBox="0 0 38 52"><path d="m24 2-9 17h7l-7 17 16-22h-8l6-12z" fill="#d8ee50"/><path d="M8 47V25l6-8h10l6 8v22z" fill="#284c3d"/><path d="M7 29h6m12 0h7" stroke="#b8c7a8" stroke-width="3"/><path d="M14 36h10" stroke="#17251e" stroke-width="2"/></svg>`,
  "A Christmas Carol": `<svg viewBox="0 0 38 52"><circle cx="19" cy="18" r="10" fill="#f4d46b"/><path d="M14 20q5-8 10 0v12H14z" fill="#8d2431"/><path d="M4 43h30" stroke="#eef2e2" stroke-width="3"/><circle cx="8" cy="8" r="1" fill="#fff"/><circle cx="31" cy="12" r="1.5" fill="#fff"/><path d="M9 52q3-17 10-15 8-2 11 15" fill="#253d32"/></svg>`,
  "Pride and Prejudice": `<svg viewBox="0 0 38 52"><path d="M4 45q4-17 15-17t15 17" fill="#302a33"/><path d="M7 20q12-15 24 0-2 7-12 8Q9 27 7 20" fill="#ead8c6"/><path d="M8 16q11-12 22 0" fill="none" stroke="#6b3e45" stroke-width="5"/><path d="M19 38q5-8 10 0-5 8-10 11-5-3-10-11 5-8 10 0" fill="#b66b75"/></svg>`,
  "Wuthering Heights": `<svg viewBox="0 0 38 52"><path d="M0 39 9 26l6 8 8-17 15 22v13H0z" fill="#354651"/><path d="M11 40h17v12H11z" fill="#182326"/><path d="M4 12h30M0 18h27M9 7h29" stroke="#c7d0ce" stroke-width="2" opacity=".65"/><path d="m27 3-4 8h5l-4 8" fill="none" stroke="#e8d77c" stroke-width="2"/></svg>`,
  "Jane Eyre": `<svg viewBox="0 0 38 52"><path d="M11 52q0-23 8-31 9 8 8 31z" fill="#202433"/><path d="M15 18q4-10 8 0l-4 8z" fill="#f2d5b5"/><path d="M27 37h6v15h-6z" fill="#4b2e35"/><path d="M30 37q-6-9 0-16 7 8 0 16" fill="#f1b24a"/><path d="M5 9h7v29H5z" fill="#382d36"/></svg>`,
  "Moby-Dick": `<svg viewBox="0 0 38 52"><path d="M0 31q8-8 19 0t19 0v21H0z" fill="#145b79"/><path d="M5 29q8-14 23-4 3 2 7-2-1 8-9 9H9z" fill="#edf0e8"/><circle cx="25" cy="27" r="1" fill="#17242b"/><path d="M14 23q-2-10 4-13m0 7q4-8 8-8" fill="none" stroke="#dcecf0" stroke-width="2"/></svg>`,
});

function bookCard(book, index) {
  const tag = book.href ? "a" : "button";
  const action = book.href ? `href="${book.href}"` : `type="button" aria-disabled="true"`;
  return `
    <${tag} class="book-card" ${action} aria-label="${book.title}" style="--row:${index}">
      <span class="book-cover" style="--cover:${book.color}" aria-hidden="true"><i class="cover-art">${coverArt[book.title]}</i></span>
      <span class="book-name">${book.title}</span>
    </${tag}>`;
}

function topicCard(topic, index) {
  return `<button class="topic-card" type="button" aria-disabled="true" style="--row:${index}">
    <span class="topic-number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
    <span>${topic}</span>
  </button>`;
}

function render() {
  document.body.dataset.level = state.level;
  levels.forEach((button) => {
    const active = button.dataset.level === state.level;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-checked", String(active));
  });
  topicList.innerHTML = topics.map(topicCard).join("");
  bookList.innerHTML = books[state.level].map(bookCard).join("");
}

levels.forEach((button) => button.addEventListener("click", () => {
  state.level = button.dataset.level;
  render();
}));
render();
