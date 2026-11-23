"use strict";

const screen = document.querySelector("#screen");
const themeButton = document.querySelector(".theme-button");
const sectionLinks = document.querySelectorAll("[data-section]");

const TABLES = {
  exam: {
    number: 15,
    title: "Экзаменационные вопросы",
    description: "Вопросы и задачи, по которым составляют экзаменационные билеты.",
    pages: "8–9",
    items: EXAM_SOURCE.map((item) => ({ ...item, study: EXAM_STUDY[item.id] })),
  },
  test: {
    number: 18,
    title: "Примеры тестовых заданий",
    description: "Выбор ответов, сопоставление, последовательности и развёрнутые ответы.",
    pages: "9–11",
    items: TEST_SOURCE.map((item) => ({ ...item, study: TEST_STUDY[item.id] })),
  },
};

const KINDS = {
  single: "Один ответ",
  multiple: "Несколько ответов",
  match: "Сопоставление",
  order: "Последовательность",
  open: "Развёрнутый ответ",
};

const assignmentWord = new Intl.PluralRules("ru");
let currentRoute;
let searchText = "";
let quizSession;
let quizSize = 10;
let shuffleQuiz = true;

function escapeHTML(value) {
  const symbols = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value).replace(/[&<>"']/g, (symbol) => symbols[symbol]);
}

function markup(text) {
  return text.split("§").map((part, index) =>
    index % 2 ? `<code>${escapeHTML(part)}</code>` : escapeHTML(part),
  ).join("");
}

function countLabel(count, endings = ["задание", "задания", "заданий"]) {
  const category = assignmentWord.select(count);
  return `${count} ${endings[category === "one" ? 0 : category === "few" ? 1 : 2]}`;
}

function readRoute() {
  const [page, table, number] = location.hash.slice(1).split("/");
  if (page === "topics" || page === "quiz") return { page };
  if (page !== "questions" && page !== "review") return { page: "questions" };
  if (!Object.hasOwn(TABLES, table)) return { page };
  const id = /^\d+$/.test(number || "") ? Number(number) : undefined;
  return { page, table, id: TABLES[table].items.some((item) => item.id === id) ? id : undefined };
}

function catalogLink(page, table, id) {
  return `#${[page, table, id].filter(Boolean).join("/")}`;
}

function rowId(table, id) {
  return `row-${table}-${id}`;
}

function heading(title, description) {
  return `<header class="page-intro">
    <h1 id="page-title" tabindex="-1">${title}</h1>
    <p>${description}</p>
  </header>`;
}

function renderHero() {
  return `<section class="hero" aria-labelledby="page-title">
    <div class="hero-content">
      <p class="hero-context">ГУАП <span aria-hidden="true">·</span> 1-й семестр</p>
      <h1 id="page-title" tabindex="-1">Подготовка к экзамену по информатике</h1>
      <p class="hero-description">Вопросы из рабочей программы, разборы и тренажёр для самостоятельной подготовки.</p>
      <a class="button button-primary" href="#quiz">Начать тренировку</a>
    </div>
    <img class="hero-image" src="./assets/study-books.webp" width="960" height="640" alt="">
  </section>`;
}

function normalize(text) {
  return text.toLocaleLowerCase("ru").replace(/ё/g, "е").trim();
}

function filterItems(table, query) {
  const value = normalize(query);
  if (!value) return table.items;
  const number = /^№?\s*(\d+)$/.exec(value);
  if (number) return table.items.filter((item) => item.id === Number(number[1]));
  const words = value.split(/\s+/);
  return table.items.filter((item) => {
    const text = normalize([
      item.study.title, item.question, item.study.question,
      ...(item.originalOptions ?? []), ...(item.pairs?.flat() ?? []),
    ].filter(Boolean).join(" "));
    return words.every((word) => text.includes(word));
  });
}

function originalOptions(item) {
  if (!item.pairs && !item.originalOptions?.length) return "";
  const renderList = (lines) => `<ul class="original-list">${lines.map((line) =>
    `<li>${escapeHTML(line)}</li>`,
  ).join("")}</ul>`;
  const list = item.pairs
    ? `<div class="matching-columns">
      <div><span class="meta">Позиции</span>${renderList(item.pairs[0])}</div>
      <div><span class="meta">Соответствия</span>${renderList(item.pairs[1])}</div>
    </div>`
    : renderList(item.originalOptions);
  return `<details class="original-options">
    <summary>${item.kind === "order" ? "Этапы из РПД" : "Варианты из РПД"}</summary>
    ${list}
  </details>`;
}

function codeExample(study) {
  if (!study.code) return "";
  return `<figure class="code-example">
    <figcaption>${escapeHTML(study.codeLabel)}</figcaption>
    <pre tabindex="0"><code>${escapeHTML(study.code)}</code></pre>
  </figure>`;
}

function numberTile(item) {
  return `<span class="row-number" aria-label="Номер ${item.id}">${item.id}</span>`;
}

function renderQuestion(tableKey, item) {
  return `<article class="question-row" id="${rowId(tableKey, item.id)}" tabindex="-1">
    ${numberTile(item)}
    <div class="row-body">
      <div class="row-heading">
        <h3>${escapeHTML(item.study.title)}</h3>
        <a class="row-link" href="${catalogLink("review", tableKey, item.id)}" aria-label="Разбор. ${escapeHTML(item.study.title)}">Разбор</a>
      </div>
      ${item.kind ? `<p class="meta row-kind">${KINDS[item.kind]}</p>` : ""}
      <p class="original-text">${escapeHTML(item.question)}</p>
      ${originalOptions(item)}
    </div>
  </article>`;
}

function renderReview(tableKey, item, open) {
  const study = item.study;
  const answer = tableKey === "exam"
    ? study.paragraphs.map((paragraph) => `<p>${markup(paragraph)}</p>`).join("")
    : `<p>${markup(study.explanation)}</p>`;
  const note = study.sourceNote
    ? `<p class="source-note"><strong>Уточнение к РПД.</strong> ${markup(study.sourceNote)}</p>`
    : "";
  const adapted = tableKey === "test"
    ? `<details class="original-options adapted-review">
      <summary>Учебная формулировка из тренажёра</summary>
      <p>${escapeHTML(study.question)}</p>
      <p><strong>${study.correct.length > 1 ? "Верные варианты" : "Верный вариант"}.</strong> ${study.correct.map((index) => escapeHTML(study.options[index])).join(" · ")}</p>
    </details>`
    : "";
  return `<details class="review-row" id="${rowId(tableKey, item.id)}"${open ? " open" : ""}>
    <summary>
      ${numberTile(item)}
      <span class="review-title">${escapeHTML(study.title)}</span>
      <span class="chevron" aria-hidden="true"></span>
    </summary>
    <div class="review-content">
      <p class="meta">РПД · таблица ${TABLES[tableKey].number} · стр. ${item.page}</p>
      <p class="review-source">${escapeHTML(item.question)}</p>
      ${originalOptions(item)}
      <h3>Разбор</h3>
      ${answer}
      ${codeExample(study)}
      ${note}
      ${study.practice ? `<details class="original-options adapted-review"><summary>Задание для самопроверки</summary><p>${markup(study.practice)}</p></details>` : ""}
      ${adapted}
      <a class="text-link" href="${catalogLink("questions", tableKey, item.id)}">К вопросу в перечне</a>
    </div>
  </details>`;
}

function renderCatalogResults(route) {
  const keys = route.table ? [route.table] : Object.keys(TABLES);
  const groups = keys.map((key) => ({ key, items: filterItems(TABLES[key], searchText) }));
  const count = groups.reduce((sum, group) => sum + group.items.length, 0);
  const countStatus = document.querySelector("#count-status");
  countStatus.textContent = searchText.trim() ? `Найдено ${countLabel(count)}` : "";
  countStatus.hidden = !searchText.trim();

  document.querySelector("#results").innerHTML = count
    ? groups.filter(({ items }) => items.length).map(({ key, items }) => {
      const table = TABLES[key];
      return `<section class="table-card" aria-labelledby="label-${key}">
        <header class="table-heading">
          <div class="table-heading-top">
            <span class="tag">Таблица ${table.number}</span>
            <span class="meta">${countLabel(items.length, key === "exam" ? ["вопрос", "вопроса", "вопросов"] : undefined)}</span>
          </div>
          <h2 id="label-${key}">${table.title}</h2>
          <p>${table.description}</p>
        </header>
        ${items.map((item) => route.page === "review"
          ? renderReview(key, item, route.id === item.id)
          : renderQuestion(key, item),
        ).join("")}
      </section>`;
    }).join("")
    : `<section class="empty-state">
      <h2>Ничего не найдено</h2>
      <p>Попробуйте другой номер или название темы.</p>
      <button class="button button-secondary" type="button" data-action="clear-search">Очистить поиск</button>
    </section>`;
}

function renderTablePicker(route) {
  return `<nav class="table-picker" aria-label="Фильтр по таблицам">
    ${[[undefined, "Все"], ["exam", "Таблица 15"], ["test", "Таблица 18"]].map(([table, label]) =>
      `<a href="${catalogLink(route.page, table)}"${route.table === table ? ' aria-current="page"' : ""}>${label}</a>`,
    ).join("")}
  </nav>`;
}

function renderCatalog(route) {
  const isReview = route.page === "review";
  return `${isReview
    ? heading("Разборы заданий", "Краткие ответы, примеры и код к каждому вопросу из перечня.")
    : renderHero()}
    <div class="catalog-layout" id="catalog-top">
      <section class="catalog-main" aria-label="Материалы из рабочей программы">
        <div class="catalog-toolbar">
          <nav class="mode-picker" aria-label="Режим просмотра">
            <a href="${catalogLink("questions", route.table)}"${isReview ? "" : ' aria-current="page"'}>Перечень</a>
            <a href="${catalogLink("review", route.table)}"${isReview ? ' aria-current="page"' : ""}>Разборы</a>
          </nav>
          <form class="search-form" id="question-search" role="search">
            <label class="sr-only" for="search-questions">Поиск по вопросу или номеру</label>
            <span class="search-icon" aria-hidden="true"></span>
            <input type="search" id="search-questions" placeholder="Тема или номер" value="${escapeHTML(searchText)}" autocomplete="off">
          </form>
        </div>
        ${renderTablePicker(route)}
        <p class="search-status meta" id="count-status" role="status" hidden></p>
        <div id="results" class="catalog-results"></div>
      </section>
      <aside class="catalog-aside" aria-label="Навигация и источник">
        <section class="side-card">
          <h2>В рабочей программе</h2>
          ${Object.entries(TABLES).map(([key, table]) => `<a class="side-table" href="${catalogLink(route.page, key)}">
            <span class="side-number" aria-hidden="true">${table.number}</span>
            <span><strong>Таблица ${table.number}</strong><small>${key === "exam" ? "43 вопроса к экзамену" : "33 примера для тестов"}</small></span>
          </a>`).join("")}
        </section>
        <section class="side-card source-card">
          <h2>Источник</h2>
          <p>Рабочая программа «Информатика», ГУАП, 2026. Направление 09.03.02 «Информационные системы и технологии».</p>
          <p class="meta">Таблица 15 — стр. 8–9 PDF<br>Таблица 18 — стр. 9–11 PDF</p>
          <p class="meta">Номера заданий таблицы 18 добавлены по порядку в PDF.</p>
        </section>
      </aside>
    </div>`;
}

function numberLinks(tableKey, ids) {
  return `<div class="number-links">${ids.map((id) => {
    const item = TABLES[tableKey].items[id - 1];
    return `<a href="${catalogLink("review", tableKey, id)}" aria-label="${id}. ${escapeHTML(item.study.title)}">${id}</a>`;
  }).join("")}</div>`;
}

function renderTopics() {
  return `${heading("Темы и навыки", "Что нужно знать и уметь, чтобы ответить на вопросы из РПД. Откройте номер, чтобы перейти к разбору.")}
    <section class="topic-section" aria-labelledby="exam-topics">
      <div class="section-label">
        <span class="tag">Таблица 15</span>
        <h2 id="exam-topics">Экзаменационные темы</h2>
      </div>
      <div class="topic-grid">
        ${TOPIC_GROUPS.map((topic) => `<article class="topic-card">
          <p class="topic-range">${topic.range}</p>
          <h3>${topic.title}</h3>
          <ul>${topic.skills.map((skill) => `<li>${skill}</li>`).join("")}</ul>
          <p class="topic-exercise"><strong>Для самопроверки.</strong> ${topic.exercise}</p>
          ${numberLinks("exam", topic.ids)}
        </article>`).join("")}
      </div>
    </section>
    <section class="topic-section" aria-labelledby="test-topics">
      <div class="section-label">
        <span class="tag">Таблица 18</span>
        <h2 id="test-topics">Темы тестовых заданий</h2>
      </div>
      <div class="topic-grid topic-grid-tests">
        ${TEST_TOPICS.map((topic) => `<article class="topic-card">
          <h3>${topic.title}</h3>
          <p>${topic.description}</p>
          ${numberLinks("test", topic.ids)}
        </article>`).join("")}
      </div>
    </section>`;
}

function shuffled(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function startQuiz(ids, limit = ids.length) {
  const queue = (shuffleQuiz ? shuffled(ids) : ids).slice(0, limit).map((id) => {
    const order = TEST_STUDY[id].options.map((_, index) => index);
    return { id, order: shuffleQuiz ? shuffled(order) : order };
  });
  quizSession = { queue, index: 0, draft: [], answers: [] };
  refreshQuiz("#quiz-question");
}

function renderQuizSetup() {
  const total = TABLES.test.items.length;
  return `<section class="quiz-card" aria-labelledby="quiz-setup-title">
    <div class="quiz-setup-heading">
      <span class="tag">Таблица 18</span>
      <h2 id="quiz-setup-title">Новая тренировка</h2>
      <p>${countLabel(total)} с выбором вариантов. После проверки вы увидите ответ и объяснение.</p>
    </div>
    <form id="quiz-setup">
      <fieldset>
        <legend>Сколько заданий пройти?</legend>
        <div class="length-options">
          ${[10, 20, total].map((size) => `<label class="length-option">
            <input type="radio" name="size" value="${size}"${size === quizSize ? " checked" : ""}>
            <span>${size === total ? `Все ${total}` : size}</span>
          </label>`).join("")}
        </div>
      </fieldset>
      <label class="shuffle-control"><input type="checkbox" name="shuffle"${shuffleQuiz ? " checked" : ""}> Перемешать задания и варианты</label>
      <button class="button button-primary" type="submit">Начать тренировку</button>
    </form>
  </section>`;
}

function renderQuizQuestion() {
  const { queue, index, draft, answers } = quizSession;
  const { id, order } = queue[index];
  const task = TEST_STUDY[id];
  const result = answers[index];
  const multiple = task.correct.length > 1;

  return `<section class="quiz-card" aria-labelledby="quiz-question">
    <div class="quiz-progress-heading">
      <span class="meta">Задание ${index + 1} из ${queue.length}</span>
      <span class="tag">${KINDS[multiple ? "multiple" : "single"]}</span>
    </div>
    <progress class="quiz-progress" max="${queue.length}" value="${answers.length}" aria-label="Проверено заданий"></progress>
    <h2 class="quiz-question" id="quiz-question" tabindex="-1">${escapeHTML(task.question)}</h2>
    <form id="quiz-answer">
      <fieldset class="answers" ${result ? "disabled" : ""}>
        <legend class="sr-only">${multiple ? "Выберите все подходящие ответы" : "Выберите один ответ"}</legend>
        ${order.map((optionId, position) => {
          const chosen = (result ? result.selected : draft).includes(optionId);
          const correct = task.correct.includes(optionId);
          const status = result
            ? correct ? " correct-option" : chosen ? " wrong-option" : ""
            : "";
          const statusText = result
            ? correct ? "Верный вариант" : chosen ? "Неверный вариант" : ""
            : "";
          return `<label class="answer-option${status}">
            <input name="option" type="${multiple ? "checkbox" : "radio"}" value="${optionId}"${chosen ? " checked" : ""}>
            <span class="answer-letter" aria-hidden="true">${"АБВГДЕ"[position]}</span>
            <span class="answer-text">${escapeHTML(task.options[optionId])}</span>
            ${statusText ? `<span class="answer-status">${statusText}</span>` : ""}
          </label>`;
        }).join("")}
      </fieldset>
      ${result ? "" : `<button class="button button-primary quiz-check" type="submit"${draft.length ? "" : " disabled"}>Проверить ответ</button>`}
    </form>
    ${result ? `<section class="quiz-feedback ${result.correct ? "is-correct" : "is-incorrect"}" id="quiz-feedback" tabindex="-1" aria-labelledby="feedback-title">
      <h3 id="feedback-title">${result.correct ? "Верно" : "Неверно"}</h3>
      <p>${markup(task.explanation)}</p>
      <a class="text-link" href="${catalogLink("review", "test", id)}">Разбор задания</a>
    </section>
    <button class="button button-primary quiz-check" type="button" data-action="quiz-next">${index + 1 === queue.length ? "Посмотреть результат" : "Следующее задание"}</button>` : ""}
  </section>`;
}

function renderQuizResult() {
  const { queue, answers } = quizSession;
  const errors = answers.filter((answer) => !answer.correct);
  const score = answers.length - errors.length;
  return `<section class="quiz-card" aria-labelledby="quiz-result">
    <h2 id="quiz-result" tabindex="-1">Результат тренировки</h2>
    <p class="score"><strong>${score} / ${queue.length}</strong> <span>верных ответов</span></p>
    ${errors.length
      ? `<h3>Вопросы для повторения</h3>
        <ul class="review-links">${errors.map(({ id }) => `<li><a href="${catalogLink("review", "test", id)}">${escapeHTML(TEST_STUDY[id].title)}</a></li>`).join("")}</ul>`
      : '<p>Все задания решены верно.</p>'}
    <div class="quiz-actions">
      ${errors.length ? '<button class="button button-primary" type="button" data-action="quiz-retry">Повторить ошибки</button>' : ""}
      <button class="button ${errors.length ? "button-secondary" : "button-primary"}" type="button" data-action="quiz-reset">Новая тренировка</button>
    </div>
  </section>`;
}

function quizBody() {
  if (!quizSession) return renderQuizSetup();
  return quizSession.index === quizSession.queue.length ? renderQuizResult() : renderQuizQuestion();
}

function renderQuiz() {
  return `${heading("Тренажёр", "Учебные варианты заданий таблицы 18. Для каждого ответа есть пояснение.")}
    <div class="quiz-layout">
      <div id="quiz-body">${quizBody()}</div>
      <aside class="quiz-aside side-card">
        <h2>Перед тренировкой</h2>
        <p>В заданиях с несколькими ответами выберите все верные варианты.</p>
        <a class="text-link" href="#review/test">Разборы таблицы 18</a>
      </aside>
    </div>`;
}

function refreshQuiz(focusTarget) {
  document.querySelector("#quiz-body").innerHTML = quizBody();
  const target = document.querySelector(focusTarget);
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ block: "nearest" });
}

function renderRoute() {
  if (location.hash === "#main" && currentRoute) return;
  const previous = currentRoute;
  const route = readRoute();
  currentRoute = route;
  if (route.id) searchText = "";

  const catalog = route.page === "questions" || route.page === "review";
  const selected = catalog ? "questions" : route.page;
  sectionLinks.forEach((link) => {
    if (link.dataset.section === selected) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  screen.innerHTML = catalog ? renderCatalog(route) : route.page === "topics" ? renderTopics() : renderQuiz();
  if (catalog) renderCatalogResults(route);

  const titles = { questions: "Подготовка к экзамену ГУАП", review: "Разборы", topics: "Темы и навыки", quiz: "Тренажёр" };
  document.title = `${titles[route.page]} · Информатика`;

  if (route.id) {
    const row = document.getElementById(rowId(route.table, route.id));
    row?.scrollIntoView({ block: "start" });
    (row?.querySelector("summary") ?? row)?.focus({ preventScroll: true });
  } else if (previous) {
    if (catalog && previous.page === route.page) {
      document.querySelector("#catalog-top").scrollIntoView({ block: "start" });
      document.querySelector('.table-picker [aria-current]').focus({ preventScroll: true });
    } else {
      window.scrollTo(0, 0);
      document.querySelector("#page-title").focus({ preventScroll: true });
    }
  }
}

function setTheme(theme) {
  const dark = theme === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]').content = dark ? "#0f1828" : "#f4f7fc";
  themeButton.setAttribute("aria-pressed", String(dark));
}

try {
  setTheme(localStorage.getItem("informatika-theme"));
} catch {
  setTheme("light");
}

themeButton.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  setTheme(next);
  try {
    localStorage.setItem("informatika-theme", next);
  } catch {
    // Theme still applies for the current page when storage is unavailable.
  }
});

screen.addEventListener("input", (event) => {
  const field = event.target;
  if (field.id === "search-questions") {
    searchText = field.value;
    renderCatalogResults(currentRoute);
  }
  if (field.name === "option" && quizSession && !quizSession.answers[quizSession.index]) {
    quizSession.draft = new FormData(field.form).getAll("option").map(Number);
    field.form.querySelector('button[type="submit"]').disabled = !quizSession.draft.length;
  }
});

screen.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.id === "quiz-setup") {
    const data = new FormData(form);
    quizSize = Number(data.get("size"));
    shuffleQuiz = data.has("shuffle");
    const ids = TABLES.test.items.map((task) => task.id);
    startQuiz(ids, quizSize);
  } else if (form.id === "quiz-answer" && quizSession && !quizSession.answers[quizSession.index]) {
    const { id } = quizSession.queue[quizSession.index];
    const selected = new FormData(form).getAll("option").map(Number);
    if (!selected.length) return;
    const correct = TEST_STUDY[id].correct;
    quizSession.answers.push({
      id,
      selected,
      correct: correct.length === selected.length && correct.every((index) => selected.includes(index)),
    });
    refreshQuiz("#quiz-feedback");
  }
});

screen.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  switch (button.dataset.action) {
    case "clear-search": {
      const field = document.querySelector("#search-questions");
      searchText = "";
      field.value = "";
      renderCatalogResults(currentRoute);
      field.focus();
      break;
    }
    case "quiz-next":
      quizSession.index += 1;
      quizSession.draft = [];
      refreshQuiz(quizSession.index === quizSession.queue.length ? "#quiz-result" : "#quiz-question");
      break;
    case "quiz-retry":
      startQuiz(quizSession.answers.filter((answer) => !answer.correct).map((answer) => answer.id));
      break;
    case "quiz-reset":
      quizSession = undefined;
      refreshQuiz("#quiz-setup input:checked");
      break;
  }
});

window.addEventListener("hashchange", renderRoute);
renderRoute();
