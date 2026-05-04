const state = {
  selectedProjectId: 1,
  activeTab: "overview",
  role: "owner",
  locationView: "projects",
  projects: [
    {
      id: 1,
      title: "Коттедж, КП Лесной берег",
      customer: "Иванов Сергей",
      status: "В работе",
      manager: "Артем",
      foreman: "Андрей",
      estimator: "Ксения",
      procurement: "Анастасия",
      address: "Московская область, КП Лесной берег",
      navigator: "https://yandex.ru/maps",
      bitrix: "BITRIX-2841",
      smetter: "SMT-1558",
      deadline: "18.06.2026",
      risk: "Сверхбюджет 184 000 ₽",
      riskLevel: "danger",
      budget: "12 450 000 ₽",
      extras: "284 000 ₽",
      openTasks: 12,
      openRequests: 5
    },
    {
      id: 2,
      title: "Таунхаус, Новая Рига",
      customer: "Петрова Анна",
      status: "Подготовка",
      manager: "Артем",
      foreman: "Сергей",
      estimator: "Илья",
      procurement: "Анастасия",
      address: "Новая Рига, участок 42",
      navigator: "https://yandex.ru/maps",
      bitrix: "BITRIX-2917",
      smetter: "SMT-1610",
      deadline: "07.07.2026",
      risk: "Договор через 6 дней",
      riskLevel: "warning",
      budget: "8 900 000 ₽",
      extras: "0 ₽",
      openTasks: 6,
      openRequests: 2
    },
    {
      id: 3,
      title: "Дом, Истра",
      customer: "ООО Альта",
      status: "Приемка",
      manager: "Артем",
      foreman: "Андрей",
      estimator: "Ксения",
      procurement: "Анастасия",
      address: "Истринский район",
      navigator: "https://yandex.ru/maps",
      bitrix: "BITRIX-2633",
      smetter: "SMT-1492",
      deadline: "12.05.2026",
      risk: "Акт по допработам",
      riskLevel: "blue",
      budget: "15 300 000 ₽",
      extras: "620 000 ₽",
      openTasks: 4,
      openRequests: 1
    },
    {
      id: 4,
      title: "Реконструкция, Снегири",
      customer: "Смирнов Игорь",
      status: "В работе",
      manager: "Артем",
      foreman: "Сергей",
      estimator: "Илья",
      procurement: "Анастасия",
      address: "Снегири, ул. Центральная",
      navigator: "https://yandex.ru/maps",
      bitrix: "BITRIX-2762",
      smetter: "SMT-1530",
      deadline: "30.06.2026",
      risk: "Заявка с задержкой",
      riskLevel: "warning",
      budget: "6 780 000 ₽",
      extras: "96 000 ₽",
      openTasks: 8,
      openRequests: 4
    }
  ],
  materials: [
    {
      id: 101,
      projectId: 1,
      title: "Утеплитель кровли, мембрана, крепеж",
      basis: "Перерасход по основной смете",
      due: "30.04.2026",
      status: "Согласование",
      smetter: "Ждет внесения",
      level: "warning"
    },
    {
      id: 102,
      projectId: 2,
      title: "Арматура A500, фиксаторы, проволока",
      basis: "Основная смета",
      due: "29.04.2026",
      status: "Заказано",
      smetter: "Не требуется",
      level: "success"
    },
    {
      id: 103,
      projectId: 1,
      title: "Дренажные лотки и геотекстиль",
      basis: "Допработа / допник",
      due: "03.05.2026",
      status: "На уточнении",
      smetter: "Требует проверки",
      level: "danger"
    },
    {
      id: 104,
      projectId: 4,
      title: "Пиломатериал для временного усиления",
      basis: "Скрытые работы",
      due: "28.04.2026",
      status: "В доставке",
      smetter: "Ждет внесения",
      level: "blue"
    }
  ],
  tasks: [
    {
      id: 701,
      projectId: 1,
      title: "Проверить узел примыкания кровли",
      assignee: "Андрей",
      due: "29.04.2026",
      status: "В работе",
      related: "Документ / узел",
      level: "warning"
    },
    {
      id: 702,
      projectId: 1,
      title: "Подготовить обоснование по дренажу",
      assignee: "Ксения",
      due: "30.04.2026",
      status: "На проверке",
      related: "Допработа",
      level: "blue"
    },
    {
      id: 703,
      projectId: 4,
      title: "Уточнить основание перерасхода пиломатериала",
      assignee: "Сергей",
      due: "28.04.2026",
      status: "Просрочена",
      related: "Сверхбюджет",
      level: "danger"
    },
    {
      id: 704,
      projectId: 2,
      title: "Прикрепить подписанный договор и смету",
      assignee: "Артем",
      due: "30.04.2026",
      status: "Новая",
      related: "Договор",
      level: "warning"
    }
  ],
  photoReports: [
    {
      id: 801,
      projectId: 1,
      title: "Кровля, примыкания и мембрана",
      author: "Андрей",
      date: "27.04.2026",
      stage: "Кровля",
      zone: "2 этаж / терраса",
      count: 18,
      visibility: "Можно заказчику",
      related: "Задача по узлу",
      level: "success"
    },
    {
      id: 802,
      projectId: 1,
      title: "Скрытые работы по дренажу",
      author: "Андрей",
      date: "27.04.2026",
      stage: "Дренаж",
      zone: "Подпорная стена",
      count: 9,
      visibility: "Только внутреннее",
      related: "Допработа",
      level: "warning"
    },
    {
      id: 803,
      projectId: 4,
      title: "Временное усиление основания",
      author: "Сергей",
      date: "26.04.2026",
      stage: "Конструктив",
      zone: "1 этаж",
      count: 12,
      visibility: "Только внутреннее",
      related: "Сверхбюджет",
      level: "danger"
    }
  ],
  events: [
    {
      id: 901,
      projectId: 1,
      type: "Решение",
      text: "Дополнительный дренаж вынести в отдельную допработу и подготовить обоснование для заказчика.",
      author: "Руководитель",
      date: "27.04.2026 16:40",
      related: "Допработа",
      visibility: "Только внутреннее",
      level: "warning"
    },
    {
      id: 902,
      projectId: 1,
      type: "Документ",
      text: "Ксения обновила смету по кровле, версия 4 считается актуальной для закупок.",
      author: "Ксения",
      date: "27.04.2026 14:15",
      related: "Смета",
      visibility: "Только внутреннее",
      level: "blue"
    },
    {
      id: 903,
      projectId: 4,
      type: "Проблема",
      text: "По пиломатериалу нет решения: предъявляем заказчику или списываем за счет компании.",
      author: "Артем",
      date: "27.04.2026 12:10",
      related: "Сверхбюджет",
      visibility: "Только внутреннее",
      level: "danger"
    },
    {
      id: 904,
      projectId: 3,
      type: "Согласование с заказчиком",
      text: "Фото усиления узла можно отправлять заказчику вместе с отдельным актом.",
      author: "Илья",
      date: "26.04.2026 18:05",
      related: "Акт",
      visibility: "Можно заказчику",
      level: "success"
    }
  ],
  variations: [
    {
      id: 201,
      projectId: 1,
      title: "Дополнительный дренаж вдоль подпорной стены",
      type: "Дополнительная работа",
      amount: 184000,
      status: "На согласовании",
      decision: "Предъявить заказчику",
      due: "02.05.2026",
      level: "warning"
    },
    {
      id: 202,
      projectId: 3,
      title: "Усиление узла примыкания террасы",
      type: "Скрытые работы",
      amount: 156000,
      status: "Смета готова",
      decision: "Оформить отдельным актом",
      due: "01.05.2026",
      level: "blue"
    },
    {
      id: 203,
      projectId: 4,
      title: "Перерасход пиломатериала из-за дефекта основания",
      type: "Перерасход материала",
      amount: 72000,
      status: "Требуется решение",
      decision: "Не решено",
      due: "29.04.2026",
      level: "danger"
    },
    {
      id: 204,
      projectId: 1,
      title: "Замена финишного покрытия в санузлах",
      type: "Замена материала",
      amount: 100000,
      status: "В работе",
      decision: "Предъявить заказчику",
      due: "06.05.2026",
      level: "success"
    }
  ],
  contracts: [
    {
      id: 301,
      title: "Договор подряда N 14/26",
      projectId: 2,
      responsible: "Артем",
      ends: "03.05.2026",
      status: "Скоро истекает",
      level: "warning"
    },
    {
      id: 302,
      title: "Поставка ЖБИ N 47",
      projectId: 1,
      responsible: "Анастасия",
      ends: "09.05.2026",
      status: "Скоро истекает",
      level: "warning"
    },
    {
      id: 303,
      title: "Допсоглашение N 2",
      projectId: 3,
      responsible: "Ксения",
      ends: "27.04.2026",
      status: "Сегодня",
      level: "danger"
    },
    {
      id: 304,
      title: "Аренда техники N 8",
      projectId: 4,
      responsible: "Анастасия",
      ends: "18.05.2026",
      status: "Активен",
      level: "success"
    }
  ],
  documents: [
    { type: "Договор", title: "Основной договор подряда", projectId: 1, status: "Действует", owner: "Артем" },
    { type: "Смета", title: "Основная смета, версия 4", projectId: 1, status: "Актуальна", owner: "Ксения" },
    { type: "Узел", title: "Узел примыкания кровли", projectId: 1, status: "В работе", owner: "Андрей" },
    { type: "Акт", title: "Акт по допработам, апрель", projectId: 3, status: "На проверке", owner: "Илья" },
    { type: "КС-2", title: "КС-2 за март", projectId: 3, status: "Подписан", owner: "Ксения" },
    { type: "Счет", title: "Счет поставщика ЖБИ", projectId: 1, status: "Оплачен", owner: "Анастасия" }
  ],
  smetterQueue: [
    {
      id: 501,
      projectId: 1,
      title: "Материалы по перерасходу кровли",
      type: "Материалы",
      owner: "Анастасия",
      status: "Ждет внесения",
      level: "warning"
    },
    {
      id: 502,
      projectId: 3,
      title: "Выполнение по усилению узла террасы",
      type: "Выполнение",
      owner: "Илья",
      status: "Проверка перед актом",
      level: "blue"
    },
    {
      id: 503,
      projectId: 4,
      title: "Пиломатериал сверх сметы",
      type: "Материалы",
      owner: "Анастасия",
      status: "Нет решения по основанию",
      level: "danger"
    },
    {
      id: 504,
      projectId: 1,
      title: "Дренажные лотки по допработе",
      type: "Материалы",
      owner: "Анастасия",
      status: "Требует проверки",
      level: "danger"
    }
  ],
  suppliers: [
    {
      id: 601,
      name: "БетонПрофи",
      category: "Бетон / ЖБИ",
      address: "Истра, промзона Северная",
      contact: "+7 900 000-00-01",
      terms: "Доставка день в день до 14:00",
      navigator: "https://yandex.ru/maps",
      note: "Хорошо работают по срочным заливкам"
    },
    {
      id: 602,
      name: "Кровля Склад",
      category: "Кровля",
      address: "Новая Рига, 23 км",
      contact: "+7 900 000-00-02",
      terms: "Резерв 3 дня, оплата по счету",
      navigator: "https://yandex.ru/maps",
      note: "Проверять остатки мембраны до оплаты"
    },
    {
      id: 603,
      name: "Инженерные системы МСК",
      category: "Инженерия",
      address: "Москва, ул. Производственная",
      contact: "+7 900 000-00-03",
      terms: "Доставка на следующий день",
      navigator: "https://yandex.ru/maps",
      note: "Нужны точные спецификации"
    }
  ],
  approvals: [
    {
      id: 401,
      projectId: 1,
      title: "Дополнительный дренаж вдоль подпорной стены",
      kind: "Допработа",
      amount: "184 000 ₽",
      owner: "Артем",
      next: "Решение руководителя",
      due: "02.05.2026",
      stage: "internal",
      level: "warning"
    },
    {
      id: 402,
      projectId: 4,
      title: "Перерасход пиломатериала",
      kind: "Сверхбюджет",
      amount: "72 000 ₽",
      owner: "Руководитель",
      next: "Определить: заказчик или компания",
      due: "29.04.2026",
      stage: "decision",
      level: "danger"
    },
    {
      id: 403,
      projectId: 3,
      title: "Акт по усилению узла террасы",
      kind: "Отдельный акт",
      amount: "156 000 ₽",
      owner: "Илья",
      next: "Проверка сметчиком",
      due: "01.05.2026",
      stage: "documents",
      level: "blue"
    },
    {
      id: 404,
      projectId: 2,
      title: "Продление договора подряда N 14/26",
      kind: "Договор",
      amount: "срок до 03.05.2026",
      owner: "Артем",
      next: "Подготовить допсоглашение",
      due: "30.04.2026",
      stage: "documents",
      level: "warning"
    }
  ]
};

const sectionTitles = {
  dashboard: "Рабочий стол",
  projects: "Объекты",
  tasks: "Задачи",
  materials: "Материалы",
  variations: "Допработы и отклонения",
  approvals: "Согласования",
  events: "Журнал событий",
  contracts: "Договоры и сроки",
  deadlines: "Контроль сроков",
  smetter: "Очередь Сметтера",
  suppliers: "Локации",
  photos: "Фотоотчеты",
  documents: "Документы и архив"
};

const projectTabs = {
  overview: "Обзор",
  control: "Контроль",
  tasks: "Задачи",
  materials: "Материалы",
  variations: "Допработы",
  documents: "Документы",
  photos: "Фото",
  history: "История"
};

const roleProfiles = {
  owner: {
    title: "Руководитель",
    focus: "Видит все объекты, сроки договоров, сверхбюджет и решения, которые нельзя оставлять в чатах.",
    actions: ["Принять решение по сверхбюджету", "Проверить договоры на 30 дней", "Открыть спорные позиции"]
  },
  construction: {
    title: "Артем",
    focus: "Фокус на объектах в работе, прорабах, допработах, заявках и передаче фактов в Сметтер.",
    actions: ["Назначить ответственного", "Отправить сметчику", "Проверить фотоотчет"]
  },
  procurement: {
    title: "Анастасия",
    focus: "Фокус на заявках, поставщиках, доставках и статусах внесения материалов в Сметтер.",
    actions: ["Взять заявку в работу", "Отметить доставку", "Проверить основание закупки"]
  },
  foreman: {
    title: "Прораб",
    focus: "Фокус на своих объектах: задачи, фото, заявки, скрытые работы и допработы с места.",
    actions: ["Создать заявку", "Добавить фотоотчет", "Зафиксировать отклонение"]
  }
};

function qs(selector) {
  return document.querySelector(selector);
}

function qsa(selector) {
  return [...document.querySelectorAll(selector)];
}

function projectName(projectId) {
  return state.projects.find((project) => project.id === projectId)?.title || "Без объекта";
}

function pill(text, level = "") {
  return `<span class="status-pill ${level}">${text}</span>`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("ru-RU").format(value) + " ₽";
}

function formatDateFromInput(value) {
  return value ? value.split("-").reverse().join(".") : "";
}

function parseRuDate(value) {
  if (!value) return new Date("2099-12-31");
  const [day, month, year] = value.split(".");
  return new Date(`${year}-${month}-${day}T00:00:00`);
}

function deadlineLevel(date, baseLevel = "blue") {
  const today = new Date("2026-04-27T00:00:00");
  const diffDays = Math.ceil((parseRuDate(date) - today) / 86400000);
  if (diffDays < 0) return "danger";
  if (diffDays <= 7) return "warning";
  return baseLevel;
}

function deadlineStatus(date) {
  const today = new Date("2026-04-27T00:00:00");
  const diffDays = Math.ceil((parseRuDate(date) - today) / 86400000);
  if (diffDays < 0) return "Просрочено";
  if (diffDays === 0) return "Сегодня";
  if (diffDays <= 7) return `${diffDays} дн.`;
  return "Планово";
}

function setSection(section) {
  qsa(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.section === section);
  });
  qsa(".section").forEach((sectionNode) => sectionNode.classList.remove("active"));
  qs(`#${section}Section`).classList.add("active");
  qs("#pageTitle").textContent = sectionTitles[section];
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderRoleContext() {
  const profile = roleProfiles[state.role];
  qs("#roleContext").innerHTML = `
    <div>
      <div class="eyebrow">Сейчас выбран сценарий</div>
      <strong>${profile.title}</strong>
      <p>${profile.focus}</p>
    </div>
    <div class="quick-actions">
      ${profile.actions.map((action) => `<button class="mini-action" type="button">${action}</button>`).join("")}
    </div>
  `;
}

function renderDashboard() {
  const riskProjects = state.projects.filter((project) => project.riskLevel !== "success").slice(0, 3);
  qs("#riskProjects").innerHTML = riskProjects
    .map(
      (project) => `
        <button class="project-card" type="button" data-project-open="${project.id}">
          <div>
            <h3>${project.title}</h3>
            <div class="muted">${project.customer}</div>
          </div>
          ${pill(project.status, project.riskLevel === "danger" ? "danger" : "blue")}
          <div class="muted">${project.foreman}</div>
          ${pill(project.risk, project.riskLevel)}
        </button>
      `
    )
    .join("");

  qs("#reminderList").innerHTML = state.contracts
    .slice(0, 4)
    .map(
      (contract) => `
        <div class="stack-item">
          <div class="stack-line">
            <strong>${contract.title}</strong>
            ${pill(contract.status, contract.level)}
          </div>
          <div class="muted">${projectName(contract.projectId)} · ответственный: ${contract.responsible}</div>
          <div class="muted">Окончание: ${contract.ends}</div>
        </div>
      `
    )
    .join("");

  qs("#materialShortList").innerHTML = state.materials
    .slice(0, 3)
    .map(
      (request) => `
        <div class="stack-item">
          <div class="stack-line">
            <strong>${request.title}</strong>
            ${pill(request.status, request.level)}
          </div>
          <div class="muted">${projectName(request.projectId)}</div>
          <div class="status-row">${pill(request.basis)} ${pill(request.smetter, request.level)}</div>
        </div>
      `
    )
    .join("");

  qs("#variationShortList").innerHTML = state.variations
    .slice(0, 3)
    .map(
      (variation) => `
        <div class="stack-item">
          <div class="stack-line">
            <strong>${variation.title}</strong>
            ${pill(variation.status, variation.level)}
          </div>
          <div class="muted">${projectName(variation.projectId)} · ${variation.type}</div>
          <div class="status-row">
            <span class="amount">${formatMoney(variation.amount)}</span>
            ${pill(variation.decision, variation.level)}
          </div>
        </div>
      `
    )
    .join("");
}

function renderSmetter() {
  const waiting = state.smetterQueue.filter((item) => item.status.includes("Ждет")).length;
  const issues = state.smetterQueue.filter((item) => item.level === "danger").length;
  const checks = state.smetterQueue.filter((item) => item.status.includes("провер") || item.status.includes("Провер")).length;

  qs("#smetterSummary").innerHTML = `
    <div class="info-block"><span>Ждет внесения</span><strong>${waiting}</strong></div>
    <div class="info-block"><span>Требует проверки</span><strong>${checks}</strong></div>
    <div class="info-block"><span>Без решения по основанию</span><strong>${issues}</strong></div>
    <div class="info-block"><span>Цель</span><strong>без двойного ввода</strong></div>
  `;

  qs("#smetterRows").innerHTML = state.smetterQueue
    .map(
      (item) => `
        <div class="table-row smetter-row">
          <div><strong>${item.title}</strong></div>
          <div>${projectName(item.projectId)}</div>
          ${pill(item.type)}
          <div>${item.owner}</div>
          ${pill(item.status, item.level)}
        </div>
      `
    )
    .join("");
}

function renderLocations() {
  qsa("[data-location-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.locationView === state.locationView);
  });

  if (state.locationView === "projects") {
    qs("#locationGrid").innerHTML = state.projects
      .map(
        (project) => `
          <article class="supplier-card">
            <div class="stack-line">
              <h3>${project.title}</h3>
              ${pill(project.status, project.riskLevel === "danger" ? "danger" : "blue")}
            </div>
            <div class="muted">${project.address}</div>
            <div class="status-row">
              ${pill(`Прораб: ${project.foreman}`)}
              ${pill(`Заказчик: ${project.customer}`)}
            </div>
            <div class="status-row">
              ${pill(`Срок: ${project.deadline}`, project.riskLevel)}
              ${pill(project.risk, project.riskLevel)}
            </div>
            <p>Доступ и особенности объекта фиксируются здесь, чтобы не искать ссылку на адрес в отдельном чате.</p>
            <a class="text-action" href="${project.navigator}" target="_blank" rel="noreferrer">Открыть в навигаторе</a>
          </article>
        `
      )
      .join("");
    return;
  }

  qs("#locationGrid").innerHTML = state.suppliers
    .map(
      (supplier) => `
        <article class="supplier-card">
          <div class="stack-line">
            <h3>${supplier.name}</h3>
            ${pill(supplier.category, "blue")}
          </div>
          <div class="muted">${supplier.address}</div>
          <div class="status-row">
            ${pill(supplier.contact)}
            ${pill(supplier.terms, "success")}
          </div>
          <p>${supplier.note}</p>
          <a class="text-action" href="${supplier.navigator}" target="_blank" rel="noreferrer">Открыть в навигаторе</a>
        </article>
      `
    )
    .join("");
}

function renderProjects() {
  qs("#projectRows").innerHTML = state.projects
    .map(
      (project) => `
        <button class="table-row project-row" type="button" data-project-select="${project.id}">
          <div>
            <strong>${project.title}</strong>
            <div class="muted">${project.customer}</div>
          </div>
          ${pill(project.status, project.riskLevel === "danger" ? "danger" : "")}
          <div>${project.foreman}</div>
          ${pill(project.risk, project.riskLevel)}
        </button>
      `
    )
    .join("");
  renderProjectDetail();
}

function renderProjectDetail() {
  const project = state.projects.find((item) => item.id === state.selectedProjectId) || state.projects[0];
  const materials = state.materials.filter((item) => item.projectId === project.id);
  const variations = state.variations.filter((item) => item.projectId === project.id);
  const contracts = state.contracts.filter((item) => item.projectId === project.id);
  const documents = state.documents.filter((item) => item.projectId === project.id);

  const tabContent = {
    overview: `
      <div class="detail-grid">
        <div class="info-block"><span>Бюджет по основной смете</span><strong>${project.budget}</strong></div>
        <div class="info-block"><span>Допработы / сверхбюджет</span><strong>${project.extras}</strong></div>
        <div class="info-block"><span>Открытые задачи</span><strong>${project.openTasks}</strong></div>
        <div class="info-block"><span>Открытые заявки</span><strong>${project.openRequests}</strong></div>
      </div>
    `,
    control: `
      <div class="control-layout">
        <section class="control-card">
          <h3>Что мешает закрыть объект</h3>
          <div class="check-list">
            <div class="check-item danger"><i data-lucide="circle-alert"></i><span>Есть сверхбюджет без окончательного решения</span></div>
            <div class="check-item warning"><i data-lucide="clock"></i><span>Есть заявки, ожидающие внесения в Сметтер</span></div>
            <div class="check-item warning"><i data-lucide="file-clock"></i><span>Проверить сроки связанных договоров</span></div>
            <div class="check-item success"><i data-lucide="check-circle-2"></i><span>Основная смета прикреплена и актуальна</span></div>
          </div>
        </section>
        <section class="control-card">
          <h3>Финансовая картина</h3>
          <div class="detail-grid compact">
            <div class="info-block"><span>Основная смета</span><strong>${project.budget}</strong></div>
            <div class="info-block"><span>Допработы</span><strong>${project.extras}</strong></div>
            <div class="info-block"><span>На решении</span><strong>${variations.filter((item) => item.status.includes("решение") || item.status.includes("соглас")).length}</strong></div>
            <div class="info-block"><span>Договоры</span><strong>${contracts.length}</strong></div>
          </div>
        </section>
      </div>
    `,
    tasks: `
      ${renderProjectTasks(project.id)}
    `,
    materials: materials.length
      ? `<div class="stack-list">${materials
          .map((item) => `<div class="stack-item"><strong>${item.title}</strong><div class="status-row">${pill(item.basis)} ${pill(item.status, item.level)} ${pill(item.smetter, item.level)}</div></div>`)
          .join("")}</div>`
      : `<p class="muted">Заявок по объекту пока нет.</p>`,
    variations: variations.length
      ? `<div class="stack-list">${variations
          .map((item) => `<div class="stack-item"><strong>${item.title}</strong><div class="status-row"><span class="amount">${formatMoney(item.amount)}</span>${pill(item.status, item.level)}${pill(item.decision, item.level)}</div></div>`)
          .join("")}</div>`
      : `<p class="muted">Допработ и отклонений пока нет.</p>`,
    documents: documents.length
      ? `<div class="stack-list">${documents
          .map((item) => `<div class="stack-item"><strong>${item.title}</strong><div class="status-row">${pill(item.type)}${pill(item.status, "blue")}</div></div>`)
          .join("")}</div>`
      : `<p class="muted">Документы еще не добавлены.</p>`,
    photos: `
      ${renderProjectPhotos(project.id)}
    `,
    history: `
      ${renderProjectEvents(project.id)}
    `
  };

  qs("#projectDetail").innerHTML = `
    <div class="detail-head">
      <div class="detail-title-row">
        <div>
          <h2>${project.title}</h2>
          <div class="muted">${project.address}</div>
        </div>
        ${pill(project.status, project.riskLevel === "danger" ? "danger" : "blue")}
      </div>
      <div class="meta-row">
        ${pill(`Прораб: ${project.foreman}`)}
        ${pill(`Сметчик: ${project.estimator}`)}
        ${pill(`Снабжение: ${project.procurement}`)}
        ${pill(`Срок: ${project.deadline}`, project.riskLevel)}
      </div>
      <div class="meta-row">
        ${pill(project.bitrix, "blue")}
        ${pill(project.smetter, "success")}
        <a class="text-action" href="${project.navigator}" target="_blank" rel="noreferrer">Навигатор</a>
      </div>
    </div>
    <div class="tab-list">
      ${Object.entries(projectTabs)
        .map(([key, title]) => `<button class="tab-button ${state.activeTab === key ? "active" : ""}" data-project-tab="${key}" type="button">${title}</button>`)
        .join("")}
    </div>
    <div>${tabContent[state.activeTab]}</div>
  `;
}

function renderMaterials() {
  qs("#materialRows").innerHTML = state.materials
    .map(
      (request) => `
        <div class="table-row material-row">
          <div>
            <strong>${request.title}</strong>
            <div class="muted">${projectName(request.projectId)}</div>
          </div>
          ${pill(request.basis, request.level === "danger" ? "danger" : "")}
          <div>${request.due}</div>
          ${pill(request.status, request.level)}
          ${pill(request.smetter, request.level)}
        </div>
      `
    )
    .join("");
}

function renderProjectTasks(projectId) {
  const items = state.tasks.filter((task) => task.projectId === projectId);
  if (!items.length) return `<p class="muted">Задач по объекту пока нет.</p>`;
  return `
    <div class="stack-list">
      ${items
        .map(
          (task) => `
            <div class="stack-item">
              <div class="stack-line">
                <strong>${task.title}</strong>
                ${pill(task.status, task.level)}
              </div>
              <div class="muted">${task.assignee} · срок ${task.due}</div>
              <div class="status-row">${pill(task.related)}</div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderProjectPhotos(projectId) {
  const items = state.photoReports.filter((report) => report.projectId === projectId);
  if (!items.length) return `<p class="muted">Фотоотчетов по объекту пока нет.</p>`;
  return `
    <div class="stack-list">
      ${items
        .map(
          (report) => `
            <div class="stack-item">
              <div class="stack-line">
                <strong>${report.title}</strong>
                ${pill(`${report.count} фото`, report.level)}
              </div>
              <div class="muted">${report.stage} · ${report.zone} · ${report.author} · ${report.date}</div>
              <div class="status-row">${pill(report.visibility, report.level)} ${pill(report.related)}</div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderProjectEvents(projectId) {
  const items = state.events.filter((eventItem) => eventItem.projectId === projectId);
  if (!items.length) return `<p class="muted">История по объекту пока пустая.</p>`;
  return `
    <div class="timeline compact-timeline">
      ${items.map(renderEventItem).join("")}
    </div>
  `;
}

function renderTasks() {
  const columns = [
    { title: "Новые", statuses: ["Новая"] },
    { title: "В работе", statuses: ["В работе"] },
    { title: "Проверка / просрочки", statuses: ["На проверке", "Просрочена"] }
  ];

  qs("#taskBoard").innerHTML = columns
    .map((column) => {
      const items = state.tasks.filter((task) => column.statuses.includes(task.status));
      return `
        <section class="workflow-column">
          <div class="workflow-title">
            <h2>${column.title}</h2>
            ${pill(items.length)}
          </div>
          <div class="stack-list">
            ${items
              .map(
                (task) => `
                  <article class="approval-card">
                    <div class="stack-line">
                      <strong>${task.title}</strong>
                      ${pill(task.status, task.level)}
                    </div>
                    <div class="muted">${projectName(task.projectId)}</div>
                    <div class="status-row">
                      ${pill(`Исполнитель: ${task.assignee}`)}
                      ${pill(task.related, "blue")}
                    </div>
                    <div class="approval-next">
                      <span>Срок</span>
                      <strong>${task.due}</strong>
                    </div>
                  </article>
                `
              )
              .join("")}
          </div>
        </section>
      `;
    })
    .join("");
}

function renderVariations() {
  qs("#variationGrid").innerHTML = state.variations
    .map(
      (variation) => `
        <article class="variation-card">
          <div class="stack-line">
            <h3>${variation.title}</h3>
            ${pill(variation.status, variation.level)}
          </div>
          <div class="muted">${projectName(variation.projectId)} · ${variation.type}</div>
          <div class="amount">${formatMoney(variation.amount)}</div>
          <div class="status-row">
            ${pill(variation.decision, variation.level)}
            ${pill(`Решить до ${variation.due}`)}
          </div>
        </article>
      `
    )
    .join("");
}

function renderContracts() {
  qs("#contractRows").innerHTML = state.contracts
    .map(
      (contract) => `
        <div class="table-row contract-row">
          <div><strong>${contract.title}</strong></div>
          <div>${projectName(contract.projectId)}</div>
          <div>${contract.responsible}</div>
          <div>${contract.ends}</div>
          ${pill(contract.status, contract.level)}
        </div>
      `
    )
    .join("");
}

function collectDeadlines() {
  const contractItems = state.contracts.map((contract) => ({
    title: contract.title,
    projectId: contract.projectId,
    type: "Договор",
    date: contract.ends,
    owner: contract.responsible,
    level: deadlineLevel(contract.ends, contract.level)
  }));

  const taskItems = state.tasks.map((task) => ({
    title: task.title,
    projectId: task.projectId,
    type: "Задача",
    date: task.due,
    owner: task.assignee,
    level: deadlineLevel(task.due, task.level)
  }));

  const materialItems = state.materials.map((request) => ({
    title: request.title,
    projectId: request.projectId,
    type: "Материалы",
    date: request.due,
    owner: "Анастасия",
    level: deadlineLevel(request.due, request.level)
  }));

  const approvalItems = state.approvals.map((approval) => ({
    title: approval.title,
    projectId: approval.projectId,
    type: approval.kind,
    date: approval.due,
    owner: approval.owner,
    level: deadlineLevel(approval.due, approval.level)
  }));

  const documentItems = state.documents
    .filter((documentItem) => documentItem.due)
    .map((documentItem) => ({
      title: documentItem.title,
      projectId: documentItem.projectId,
      type: documentItem.type,
      date: documentItem.due,
      owner: documentItem.owner,
      level: deadlineLevel(documentItem.due, "blue")
    }));

  return [...contractItems, ...taskItems, ...materialItems, ...approvalItems, ...documentItems].sort(
    (a, b) => parseRuDate(a.date) - parseRuDate(b.date)
  );
}

function renderDeadlines() {
  const items = collectDeadlines();
  const overdue = items.filter((item) => deadlineStatus(item.date) === "Просрочено").length;
  const today = items.filter((item) => deadlineStatus(item.date) === "Сегодня").length;
  const week = items.filter((item) => {
    const status = deadlineStatus(item.date);
    return status.endsWith("дн.") || status === "Сегодня";
  }).length;

  qs("#deadlineSummary").innerHTML = `
    <div class="info-block"><span>Всего контрольных сроков</span><strong>${items.length}</strong></div>
    <div class="info-block"><span>Просрочено</span><strong>${overdue}</strong></div>
    <div class="info-block"><span>Сегодня</span><strong>${today}</strong></div>
    <div class="info-block"><span>В ближайшие 7 дней</span><strong>${week}</strong></div>
  `;

  qs("#deadlineRows").innerHTML = items
    .map(
      (item) => `
        <div class="table-row deadline-row">
          <div><strong>${item.title}</strong></div>
          <div>${projectName(item.projectId)}</div>
          ${pill(item.type, item.level)}
          <div>${item.date}</div>
          <div>${item.owner}</div>
          ${pill(deadlineStatus(item.date), item.level)}
        </div>
      `
    )
    .join("");
}

function renderDocuments() {
  qs("#documentGrid").innerHTML = state.documents
    .map(
      (documentItem) => `
        <article class="document-card">
          <div class="stack-line">
            <h3>${documentItem.title}</h3>
            ${pill(documentItem.type)}
          </div>
          <div class="muted">${projectName(documentItem.projectId)}</div>
          <div class="status-row">${pill(documentItem.status, "blue")} ${pill(`Ответственный: ${documentItem.owner}`)}</div>
          ${documentItem.version ? `<div class="muted">Версия: ${documentItem.version}</div>` : ""}
          ${documentItem.due ? `<div class="status-row">${pill(`Срок: ${documentItem.due}`, deadlineLevel(documentItem.due))}</div>` : ""}
        </article>
      `
    )
    .join("");
}

function renderPhotos() {
  qs("#photoGrid").innerHTML = state.photoReports
    .map(
      (report) => `
        <article class="photo-card">
          <div class="photo-thumb">
            <i data-lucide="image"></i>
            <strong>${report.count}</strong>
          </div>
          <div class="photo-body">
            <div class="stack-line">
              <h3>${report.title}</h3>
              ${pill(report.visibility, report.level)}
            </div>
            <div class="muted">${projectName(report.projectId)}</div>
            <div class="status-row">
              ${pill(report.stage, "blue")}
              ${pill(report.zone)}
              ${pill(report.related, report.level)}
            </div>
            <div class="muted">${report.author} · ${report.date}</div>
          </div>
        </article>
      `
    )
    .join("");
}

function renderApprovals() {
  const columns = [
    { key: "decision", title: "Требует решения" },
    { key: "internal", title: "Внутреннее согласование" },
    { key: "documents", title: "Документы и акты" }
  ];

  qs("#approvalBoard").innerHTML = columns
    .map((column) => {
      const items = state.approvals.filter((approval) => approval.stage === column.key);
      return `
        <section class="workflow-column">
          <div class="workflow-title">
            <h2>${column.title}</h2>
            ${pill(items.length)}
          </div>
          <div class="stack-list">
            ${items
              .map(
                (approval) => `
                  <article class="approval-card">
                    <div class="stack-line">
                      <strong>${approval.title}</strong>
                      ${pill(approval.kind, approval.level)}
                    </div>
                    <div class="muted">${projectName(approval.projectId)}</div>
                    <div class="status-row">
                      ${pill(approval.amount, approval.level)}
                      ${pill(`Ответственный: ${approval.owner}`)}
                    </div>
                    <div class="approval-next">
                      <span>${approval.next}</span>
                      <strong>${approval.due}</strong>
                    </div>
                  </article>
                `
              )
              .join("")}
          </div>
        </section>
      `;
    })
    .join("");
}

function eventIcon(type) {
  const icons = {
    "Решение": "check-circle-2",
    "Комментарий": "message-square",
    "Изменение срока": "clock",
    "Документ": "file-text",
    "Проблема": "circle-alert",
    "Согласование с заказчиком": "badge-check"
  };
  return icons[type] || "message-square";
}

function renderEventItem(eventItem) {
  return `
    <article class="timeline-item">
      <div class="timeline-icon ${eventItem.level}">
        <i data-lucide="${eventIcon(eventItem.type)}"></i>
      </div>
      <div class="timeline-body">
        <div class="stack-line">
          <strong>${eventItem.type}</strong>
          ${pill(eventItem.related, eventItem.level)}
          ${pill(eventItem.visibility, eventItem.visibility === "Можно заказчику" ? "success" : "")}
        </div>
        <p>${eventItem.text}</p>
        <div class="muted">${projectName(eventItem.projectId)} · ${eventItem.author} · ${eventItem.date}</div>
      </div>
    </article>
  `;
}

function renderEvents() {
  qs("#eventTimeline").innerHTML = state.events.map(renderEventItem).join("");
}

function fillProjectSelects() {
  const options = state.projects.map((project) => `<option value="${project.id}">${project.title}</option>`).join("");
  qs("#materialProject").innerHTML = options;
  qs("#variationProject").innerHTML = options;
  qs("#contractProject").innerHTML = options;
  qs("#taskProject").innerHTML = options;
  qs("#photoProject").innerHTML = options;
  qs("#eventProject").innerHTML = options;
  qs("#documentProject").innerHTML = options;
}

function openModal(id) {
  qs(`#${id}`).classList.add("active");
  qs(`#${id}`).setAttribute("aria-hidden", "false");
}

function closeModal(id) {
  qs(`#${id}`).classList.remove("active");
  qs(`#${id}`).setAttribute("aria-hidden", "true");
}

function showToast(message) {
  const toast = qs("#toast");
  toast.textContent = message;
  toast.classList.add("active");
  setTimeout(() => toast.classList.remove("active"), 2600);
}

function bindEvents() {
  qs("#roleSelect").addEventListener("change", (event) => {
    state.role = event.target.value;
    renderRoleContext();
    showToast(`Сценарий переключен: ${roleProfiles[state.role].title}`);
  });

  qsa("[data-section]").forEach((button) => {
    button.addEventListener("click", () => setSection(button.dataset.section));
  });

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-section-target]");
    if (target) setSection(target.dataset.sectionTarget);

    const projectOpen = event.target.closest("[data-project-open]");
    if (projectOpen) {
      state.selectedProjectId = Number(projectOpen.dataset.projectOpen);
      state.activeTab = "overview";
      setSection("projects");
      renderProjectDetail();
    }

    const projectSelect = event.target.closest("[data-project-select]");
    if (projectSelect) {
      state.selectedProjectId = Number(projectSelect.dataset.projectSelect);
      state.activeTab = "overview";
      renderProjectDetail();
    }

    const tab = event.target.closest("[data-project-tab]");
    if (tab) {
      state.activeTab = tab.dataset.projectTab;
      renderProjectDetail();
    }

    const locationView = event.target.closest("[data-location-view]");
    if (locationView) {
      state.locationView = locationView.dataset.locationView;
      renderLocations();
    }
  });

  qs("#newMaterialButton").addEventListener("click", () => openModal("materialModal"));
  qs("#newMaterialButtonSecondary").addEventListener("click", () => openModal("materialModal"));
  qs("#newVariationButton").addEventListener("click", () => openModal("variationModal"));
  qs("#newProjectButton").addEventListener("click", () => openModal("projectModal"));
  qs("#newContractButton").addEventListener("click", () => openModal("contractModal"));
  qs("#newTaskButton").addEventListener("click", () => openModal("taskModal"));
  qs("#newEventButton").addEventListener("click", () => openModal("eventModal"));
  qs("#newPhotoButton").addEventListener("click", () => openModal("photoModal"));
  qs("#newDocumentButton").addEventListener("click", () => openModal("documentModal"));

  qsa("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => closeModal(button.dataset.closeModal));
  });

  qsa(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeModal(backdrop.id);
    });
  });

  qs("#materialBasis").addEventListener("change", (event) => {
    qs("#basisWarning").classList.toggle("hidden", event.target.value === "main");
  });

  qs("#materialForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const projectId = Number(qs("#materialProject").value);
    const basisLabel = qs("#materialBasis").selectedOptions[0].textContent;
    const title = qs("#materialItems").value.trim() || "Новая заявка на материалы";
    const level = qs("#materialBasis").value === "main" ? "success" : "warning";
    state.materials.unshift({
      id: Date.now(),
      projectId,
      title,
      basis: basisLabel,
      due: qs("#materialDue").value.split("-").reverse().join("."),
      status: "Новая",
      smetter: qs("#materialBasis").value === "main" ? "Не требуется" : "Ждет решения",
      level
    });
    renderAll();
    closeModal("materialModal");
    showToast("Заявка создана и привязана к объекту");
    event.target.reset();
    qs("#basisWarning").classList.add("hidden");
  });

  qs("#taskForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.tasks.unshift({
      id: Date.now(),
      projectId: Number(qs("#taskProject").value),
      title: qs("#taskTitleInput").value.trim() || "Новая задача",
      assignee: qs("#taskAssignee").value,
      due: formatDateFromInput(qs("#taskDueInput").value),
      status: "Новая",
      related: qs("#taskRelatedInput").value,
      level: "warning"
    });
    renderAll();
    closeModal("taskModal");
    setSection("tasks");
    showToast("Задача создана и привязана к объекту");
    event.target.reset();
  });

  qs("#eventForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const type = qs("#eventTypeInput").value;
    const visibility = qs("#eventVisibilityInput").value;
    const level = type === "Проблема" ? "danger" : visibility === "Можно заказчику" ? "success" : "blue";
    state.events.unshift({
      id: Date.now(),
      projectId: Number(qs("#eventProject").value),
      type,
      text: qs("#eventTextInput").value.trim() || "Событие без описания",
      author: roleProfiles[state.role].title,
      date: "27.04.2026 17:45",
      related: qs("#eventRelatedInput").value,
      visibility,
      level
    });
    renderAll();
    closeModal("eventModal");
    setSection("events");
    showToast("Событие сохранено в журнале объекта");
    event.target.reset();
  });

  qs("#documentForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const projectId = Number(qs("#documentProject").value);
    const type = qs("#documentTypeInput").value;
    const title = qs("#documentTitleInput").value.trim() || "Новый документ";
    const owner = qs("#documentOwnerInput").value;
    const due = formatDateFromInput(qs("#documentDueInput").value);
    state.documents.unshift({
      type,
      title,
      projectId,
      status: qs("#documentStatusInput").value,
      owner,
      version: qs("#documentVersionInput").value.trim(),
      due,
      related: qs("#documentRelatedInput").value
    });
    state.events.unshift({
      id: Date.now(),
      projectId,
      type: "Документ",
      text: `${type}: ${title}. Ответственный: ${owner}. Срок: ${due}.`,
      author: roleProfiles[state.role].title,
      date: "27.04.2026 18:05",
      related: qs("#documentRelatedInput").value,
      visibility: "Только внутреннее",
      level: "blue"
    });
    renderAll();
    closeModal("documentModal");
    setSection("documents");
    showToast("Документ добавлен в архив и журнал объекта");
    event.target.reset();
  });

  qs("#photoForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const visibility = qs("#photoCustomerVisibleInput").value;
    state.photoReports.unshift({
      id: Date.now(),
      projectId: Number(qs("#photoProject").value),
      title: qs("#photoCommentInput").value.trim() || "Новый фотоотчет",
      author: qs("#photoAuthorInput").value,
      date: "27.04.2026",
      stage: qs("#photoStageInput").value.trim() || "Этап не указан",
      zone: qs("#photoZoneInput").value.trim() || "Зона не указана",
      count: Number(qs("#photoCountInput").value || 1),
      visibility,
      related: visibility === "Можно заказчику" ? "Публичный отчет" : "Внутренний контекст",
      level: visibility === "Можно заказчику" ? "success" : "warning"
    });
    renderAll();
    closeModal("photoModal");
    setSection("photos");
    showToast("Фотоотчет создан и привязан к объекту");
    event.target.reset();
  });

  qs("#projectForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const id = Date.now();
    const budget = Number(qs("#projectBudgetInput").value || 0);
    state.projects.unshift({
      id,
      title: qs("#projectTitleInput").value.trim() || "Новый объект",
      customer: qs("#projectCustomerInput").value.trim() || "Заказчик не указан",
      status: "Передан в строительство",
      manager: "Артем",
      foreman: qs("#projectForemanInput").value,
      estimator: qs("#projectEstimatorInput").value,
      procurement: "Анастасия",
      address: qs("#projectAddressInput").value.trim() || "Адрес не указан",
      navigator: "https://yandex.ru/maps",
      bitrix: qs("#projectBitrixInput").value.trim() || "BITRIX",
      smetter: qs("#projectSmetterInput").value.trim() || "SMT",
      deadline: formatDateFromInput(qs("#projectDeadlineInput").value),
      risk: "Нужно прикрепить документы",
      riskLevel: "warning",
      budget: budget ? formatMoney(budget) : "0 ₽",
      extras: "0 ₽",
      openTasks: 0,
      openRequests: 0
    });
    state.selectedProjectId = id;
    state.activeTab = "control";
    renderAll();
    closeModal("projectModal");
    setSection("projects");
    showToast("Объект создан и передан в строительство");
    event.target.reset();
  });

  qs("#contractForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const projectId = Number(qs("#contractProject").value);
    const number = qs("#contractNumberInput").value.trim() || "без номера";
    const type = qs("#contractTypeInput").value;
    const responsible = qs("#contractResponsibleInput").value;
    const ends = formatDateFromInput(qs("#contractEndsInput").value);
    const title = `${type} ${number}`;
    state.contracts.unshift({
      id: Date.now(),
      title,
      projectId,
      responsible,
      ends,
      status: "Активен",
      level: "success"
    });
    state.approvals.unshift({
      id: Date.now() + 1,
      projectId,
      title: `Контроль срока: ${title}`,
      kind: "Договор",
      amount: `срок до ${ends}`,
      owner: responsible,
      next: qs("#contractReminderInput").value,
      due: ends,
      stage: "documents",
      level: "blue"
    });
    renderAll();
    closeModal("contractModal");
    setSection("contracts");
    showToast("Договор сохранен, напоминания поставлены");
    event.target.reset();
  });

  qs("#variationForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const projectId = Number(qs("#variationProject").value);
    const amount = Number(qs("#variationAmount").value || 0);
    state.variations.unshift({
      id: Date.now(),
      projectId,
      title: qs("#variationDescription").value.trim() || "Новая допработа",
      type: qs("#variationType").value,
      amount,
      status: "Требуется решение",
      decision: qs("#variationDecision").value,
      due: qs("#variationDue").value.split("-").reverse().join("."),
      level: "warning"
    });
    renderAll();
    closeModal("variationModal");
    showToast("Допработа добавлена в контроль отклонений");
    event.target.reset();
  });
}

function renderAll() {
  fillProjectSelects();
  renderRoleContext();
  renderDashboard();
  renderProjects();
  renderTasks();
  renderMaterials();
  renderVariations();
  renderApprovals();
  renderEvents();
  renderContracts();
  renderDeadlines();
  renderSmetter();
  renderLocations();
  renderPhotos();
  renderDocuments();
  if (window.lucide) window.lucide.createIcons();
}

bindEvents();
renderAll();
