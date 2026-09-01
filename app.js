"use strict";

const state = { level: "A1", path: "conversation" };
const levels = [...document.querySelectorAll(".level")];
const topicList = document.querySelector("#topicList");
const bookList = document.querySelector("#bookList");

const topics = Object.freeze({
  A1: [
    ["Greetings", "chat"], ["Daily Life", "sun"], ["Family", "people"], ["Food", "food"],
    ["Shopping", "bag"], ["School", "school"], ["Home", "home"], ["Transport", "bus"],
    ["Weather", "cloud"], ["Health Basics", "health"], ["Random", "shuffle"],
  ],
  A2: [
    ["Travel", "plane"], ["Work Basics", "work"], ["Restaurants", "food"], ["Shopping", "bag"],
    ["Friends", "people"], ["Hobbies", "star"], ["Directions", "map"], ["Appointments", "calendar"],
    ["Phone & Messages", "phone"], ["Problems & Help", "help"], ["Random", "shuffle"],
  ],
  B1: [
    ["Travel Experiences", "plane"], ["Workplace", "work"], ["Education", "school"], ["Relationships", "people"],
    ["Health & Fitness", "health"], ["Entertainment", "play"], ["Technology", "tech"], ["Money", "money"],
    ["Housing", "home"], ["News & Events", "news"], ["Random", "shuffle"],
  ],
  B2: [
    ["Career", "work"], ["Academic Life", "school"], ["Culture", "culture"], ["Social Issues", "people"],
    ["Media", "news"], ["Business", "money"], ["Environment", "leaf"], ["Science & Tech", "tech"],
    ["Personal Growth", "growth"], ["Discussion", "debate"], ["Random", "shuffle"],
  ],
  C1: [
    ["Professional Communication", "work"], ["Higher Education", "school"], ["Society & Policy", "policy"], ["Economics", "money"],
    ["Arts & Literature", "culture"], ["Ethics", "balance"], ["Science", "science"], ["Global Affairs", "globe"],
    ["Psychology", "mind"], ["Argument & Debate", "debate"], ["Random", "shuffle"],
  ],
  C2: [
    ["Diplomacy & Geopolitics", "globe"], ["Law & Governance", "policy"], ["Economic Theory", "money"], ["Philosophy", "mind"],
    ["Literary Criticism", "culture"], ["Ethics & Ideology", "balance"], ["Scientific Discourse", "science"], ["Corporate Strategy", "work"],
    ["Rhetoric & Persuasion", "debate"], ["Abstract Concepts", "growth"], ["Random", "shuffle"],
  ],
});

const topicIcons = Object.freeze({
  chat: `<path d="M4 5h16v11H9l-5 4z"/>`, sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>`,
  people: `<circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 20c0-4 2-6 6-6s6 2 6 6m0-5c4 0 6 2 6 5"/>`, food: `<path d="M7 3v8m-3-8v5c0 2 6 2 6 0V3M7 11v10M17 3c4 3 3 9 0 11v7"/>`,
  bag: `<path d="M5 8h14l1 13H4zM9 8a3 3 0 0 1 6 0"/>`, school: `<path d="m3 9 9-5 9 5-9 5zM6 12v6h12v-6M3 21h18"/>`,
  home: `<path d="m3 11 9-8 9 8v10H7V11m4 10v-6h4v6"/>`, bus: `<rect x="4" y="3" width="16" height="16" rx="3"/><path d="M4 11h16M8 19v2m8-2v2M8 7h8"/>`,
  cloud: `<path d="M6 18h12a4 4 0 0 0 0-8 6 6 0 0 0-11-2A5 5 0 0 0 6 18z"/>`, health: `<path d="M12 21S4 16 4 9a4 4 0 0 1 7-3l1 1 1-1a4 4 0 0 1 7 3c0 7-8 12-8 12z"/>`,
  shuffle: `<path d="M4 7h3c5 0 5 10 10 10h3m-3-3 3 3-3 3M4 17h3c2 0 3-2 4-4m3-4c1-1 2-2 3-2h3m-3-3 3 3-3 3"/>`, plane: `<path d="m3 11 18-8-7 18-3-7zM11 14l4-4"/>`,
  work: `<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3m-12 5h18M10 12v2h4v-2"/>`, star: `<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>`,
  map: `<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15"/>`, calendar: `<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 10h18"/>`,
  phone: `<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/>`, help: `<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-1 .5-1 1.2-1 2.2M12 18h.01"/>`,
  play: `<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>`, tech: `<rect x="4" y="4" width="16" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>`,
  money: `<circle cx="12" cy="12" r="9"/><path d="M15 8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9m3-10v12"/>`, news: `<path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5"/>`,
  culture: `<path d="M4 20h16M6 20v-8h12v8M4 9l8-5 8 5zM9 12v8m6-8v8"/>`, leaf: `<path d="M20 4C10 4 5 9 5 16c4 3 12 1 15-12zM5 20c2-5 6-8 11-11"/>`,
  growth: `<path d="M4 20V9m6 11V4m6 16v-7m4 7V7"/>`, debate: `<path d="M3 5h13v10H8l-5 4zM18 8h3v10l-3-2"/>`,
  policy: `<path d="M12 3 4 7v5c0 5 3 8 8 10 5-2 8-5 8-10V7zM9 12l2 2 4-5"/>`, balance: `<path d="M12 3v18M5 6h14M7 6l-4 8h8zm10 0-4 8h8z"/>`,
  science: `<path d="M9 3h6m-5 0v6L5 19c-.5 1 0 2 2 2h10c2 0 2.5-1 2-2L14 9V3M8 15h8"/>`, globe: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>`,
  mind: `<path d="M9 19H7a4 4 0 0 1-2-7 5 5 0 0 1 8-6 4 4 0 0 1 6 5c3 3 1 8-3 8h-2v3H9zM9 9v10m5-11v11"/>`,
});

const books = Object.freeze({
  A1: [
    { title: "The Tale of Peter Rabbit", note: "Gutenberg", mark: "🐇", color: "#6a994e" },
    { title: "The Adventures of Pinocchio", note: "Gutenberg", mark: "🤥", color: "#bc6c25" },
    { title: "Aesop’s Fables", note: "Gutenberg", mark: "🦊", color: "#588157" },
    { title: "The Story of Doctor Dolittle", note: "Gutenberg", mark: "🦜", color: "#457b9d" },
    { title: "The Velveteen Rabbit", note: "Gutenberg", color: "#9b6b76" },
  ],
  A2: [
    { title: "The Wonderful Wizard of Oz", note: "Gutenberg", mark: "🌪️", color: "#4d908e" },
    { title: "Alice’s Adventures in Wonderland", note: "Gutenberg", mark: "🐰", color: "#577590" },
    { title: "Heidi", note: "Gutenberg", mark: "🏔️", color: "#43aa8b" },
    { title: "Black Beauty", note: "Gutenberg", mark: "🐎", color: "#495057" },
    { title: "Little Women", note: "Gutenberg", color: "#8f5d67" },
  ],
  B1: [
    { title: "The Secret Garden", note: "Gutenberg", mark: "🌹", color: "#588157" },
    { title: "Anne of Green Gables", note: "Gutenberg", mark: "🏡", color: "#bc6c25" },
    { title: "The Jungle Book", note: "Gutenberg", mark: "🐅", color: "#386641" },
    { title: "Treasure Island", note: "Gutenberg", mark: "🏴‍☠️", color: "#277da1" },
    { title: "Kidnapped", note: "Gutenberg", color: "#596b48" },
  ],
  B2: [
    { title: "The Adventures of Sherlock Holmes", note: "Gutenberg", mark: "🔍", color: "#6c584c" },
    { title: "Dr. Jekyll and Mr. Hyde", note: "Gutenberg", mark: "⚗️", color: "#495057" },
    { title: "Frankenstein", note: "Coming soon", mark: "⚗️", color: "#386641" },
    { title: "A Christmas Carol", note: "Gutenberg", mark: "🔔", color: "#bc4749" },
    { title: "Dracula", note: "Gutenberg", color: "#4b1f2b" },
  ],
  C1: [
    { title: "Pride and Prejudice", note: "Coming soon", mark: "💌", color: "#9c6644" },
    { title: "Wuthering Heights", note: "Coming soon", mark: "🌫️", color: "#577590" },
    { title: "Jane Eyre", note: "Gutenberg", mark: "🕯️", color: "#9d4edd" },
    { title: "Moby-Dick", note: "Gutenberg", mark: "🐋", color: "#277da1" },
    { title: "Middlemarch", note: "Gutenberg", color: "#78604a" },
  ],
  C2: [
    { title: "Ulysses", note: "Gutenberg", color: "#26355d" },
    { title: "The Brothers Karamazov", note: "Gutenberg", color: "#6b302f" },
    { title: "The Republic", note: "Gutenberg", color: "#66553b" },
    { title: "Thus Spake Zarathustra", note: "Gutenberg", color: "#403557" },
    { title: "Critique of Pure Reason", note: "Gutenberg", color: "#3d4658" },
  ],
});

const coverArt = Object.freeze({
  "The Velveteen Rabbit": `<svg viewBox="0 0 38 52"><circle cx="27" cy="10" r="6" fill="#f1d9a5"/><path d="M14 42c-7-7-3-15 2-14-2-11 2-17 6-5 3-11 7-7 2 9-2 13 7 5 4 14-2 15z" fill="#d8b39c"/><path d="M0 45q18-8 38 0v7H0z" fill="#495c48"/></svg>`,
  "Little Women": `<svg viewBox="0 0 38 52"><path d="M5 43q2-18 7-22 5 4 7 22m0 0q2-22 7-25 6 5 7 25" fill="#412f3b"/><path d="M8 17q4-8 8 0m6-3q4-8 8 0" fill="none" stroke="#e5c5a7" stroke-width="5"/><path d="M4 46h30" stroke="#d69b88" stroke-width="3"/></svg>`,
  "Kidnapped": `<svg viewBox="0 0 38 52"><path d="M0 35q9-7 19 0t19 0v17H0z" fill="#244d60"/><path d="M9 33V13h2v20m0-17 16 11H11z" fill="#d4c6a1"/><path d="M5 39q10-6 27 0" fill="none" stroke="#e6d9b4" stroke-width="2"/></svg>`,
  "Dracula": `<svg viewBox="0 0 38 52"><circle cx="27" cy="10" r="7" fill="#d8cfb8"/><path d="M0 43 8 30l5 6 8-20 17 27v9H0z" fill="#171922"/><path d="M15 31h12v14H15z" fill="#2d2026"/><path d="m18 37 2 5 2-5 2 5" fill="none" stroke="#a33a42" stroke-width="2"/></svg>`,
  "Middlemarch": `<svg viewBox="0 0 38 52"><path d="M8 43V22h22v21z" fill="#d8c7a7"/><path d="m5 23 14-12 14 12z" fill="#384936"/><path d="M12 29h5v8h-5zm10 0h5v8h-5z" fill="#66503c"/><path d="M3 46h32" stroke="#b98a58" stroke-width="3"/></svg>`,
  "Critique of Pure Reason": `<svg viewBox="0 0 38 52"><circle cx="19" cy="22" r="13" fill="none" stroke="#c4b47d" stroke-width="2"/><circle cx="19" cy="22" r="6" fill="none" stroke="#c4b47d" stroke-width="2"/><path d="M19 4v36M2 22h34m-8-13L10 35M10 9l18 26" stroke="#c4b47d" stroke-width="1"/><path d="M7 46h24" stroke="#e1d7b5" stroke-width="3"/></svg>`,
  "Ulysses": `<svg viewBox="0 0 38 52"><path d="M0 35q9-8 19 0t19 0v17H0z" fill="#172c4c"/><path d="m8 32 10-19 11 19z" fill="#d0b36d"/><circle cx="28" cy="10" r="5" fill="#eee4b8"/></svg>`,
  "The Brothers Karamazov": `<svg viewBox="0 0 38 52"><path d="M7 44q2-24 12-28 11 5 12 28z" fill="#211c20"/><path d="M11 16h16l-3-8H14z" fill="#d3b37a"/><path d="M5 45h28" stroke="#c69b55" stroke-width="3"/></svg>`,
  "The Republic": `<svg viewBox="0 0 38 52"><path d="M5 43h28M8 40V18h22v22M5 18l14-10 14 10z" fill="none" stroke="#e0c578" stroke-width="3"/><path d="M13 21v16m6-16v16m6-16v16" stroke="#e0c578" stroke-width="2"/></svg>`,
  "Thus Spake Zarathustra": `<svg viewBox="0 0 38 52"><circle cx="27" cy="11" r="7" fill="#d9b456"/><path d="m0 42 13-20 6 9 7-17 12 28v10H0z" fill="#1b2634"/><path d="M7 47q8-14 15 0" fill="#b68a50"/></svg>`,
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

function topicCard([topic, icon], index) {
  return `<button class="topic-card" type="button" aria-disabled="true" style="--row:${index}">
    <span class="topic-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${topicIcons[icon]}</svg></span>
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
  topicList.innerHTML = topics[state.level].map(topicCard).join("");
  bookList.innerHTML = books[state.level].map(bookCard).join("");
}

levels.forEach((button) => button.addEventListener("click", () => {
  state.level = button.dataset.level;
  render();
}));
render();
