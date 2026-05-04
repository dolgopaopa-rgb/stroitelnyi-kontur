const state = {
  view: "dashboard",
  users: [],
  projects: [],
  estimateMaterials: [],
  estimatePreviewRows: [],
  selectedProjectId: null,
  selectedProjectTab: "overview",
};

const viewTitles = {
  dashboard: "Рабочий стол",
  projects: "Объекты",
  tasks: "Задачи",
  materials: "Материалы",
  variations: "Допработы и отклонения",
  contracts: "Договоры и сроки",
  documents: "Документы",
  events: "Журнал событий",
};

const statusLabels = {
  transferred_to_construction: "Передан",
  preparation: "Подготовка",
  in_progress: "В работе",
  paused: "Пауза",
  acceptance: "Приемка",
  document_closing: "Документы",
  completed: "Завершен",
  new: "Новая",
  in_progress_task: "В работе",
  review: "На проверке",
  approval: "Согласование",
  ordered: "Заказано",
  delivery: "Доставка",
  active: "Активен",
  signed: "Подписан",
};

function qs(selector) {
  return document.querySelector(selector);
}

function qsa(selector) {
  return [...document.querySelectorAll(selector)];
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Ошибка ${response.status}`);
  }
  return response.json();
}

function money(value) {
  return new Intl.NumberFormat("ru-RU").format(Number(value || 0)) + " ₽";
}

function pill(text, level = "") {
  return `<span class="pill ${level}">${text}</span>`;
}

function levelByDate(date) {
  if (!date) return "";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.ceil((new Date(`${date}T00:00:00`) - today) / 86400000);
  if (diff < 0) return "danger";
  if (diff <= 7) return "warning";
  return "blue";
}

function levelByMoney(value) {
  return Number(value || 0) > 0 ? "danger" : "success";
}

function label(value) {
  return statusLabels[value] || value || "Не задано";
}

function showToast(message) {
  const toast = qs("#toast");
  toast.textContent = message;
  toast.classList.add("active");
  setTimeout(() => toast.classList.remove("active"), 2200);
}

function switchView(view) {
  state.view = view;
  qsa(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  qsa(".view").forEach((node) => node.classList.remove("active"));
  qs(`#${view}View`).classList.add("active");
  qs("#pageTitle").textContent = viewTitles[view];
}

async function loadAll() {
  const [users, projects] = await Promise.all([api("/api/users"), api("/api/projects")]);
  state.users = users;
  state.projects = projects;
  if (!state.selectedProjectId && projects.length) state.selectedProjectId = projects[0].id;
  fillSelects();
  await Promise.all([
    renderDashboard(),
    renderProjects(),
    renderTasks(),
    renderMaterials(),
    renderEstimateMaterials(),
    renderVariations(),
    renderContracts(),
    renderDocuments(),
    renderEvents(),
  ]);
}

function fillSelects() {
  const projectOptions = state.projects.map((project) => `<option value="${project.id}">${project.title}</option>`).join("");
  const userOptions = state.users.map((user) => `<option value="${user.id}">${user.name}</option>`).join("");
  qsa('select[name="project_id"]').forEach((select) => (select.innerHTML = projectOptions));
  qsa('select[name="assignee_id"], select[name="owner_id"], select[name="responsible_id"]').forEach((select) => (select.innerHTML = userOptions));
  updateEstimateMaterialSelect();
}

async function updateEstimateMaterialSelect() {
  const projectSelect = qs('#materialForm select[name="project_id"]');
  const materialSelect = qs("#estimateMaterialSelect");
  if (!projectSelect || !materialSelect || !projectSelect.value) return;
  state.estimateMaterials = await api(`/api/estimate-materials?project_id=${projectSelect.value}`);
  materialSelect.innerHTML = [
    `<option value="">Выбрать из списка сметы</option>`,
    ...state.estimateMaterials.map(
      (item) =>
        `<option value="${item.id}" data-section="${item.section || ""}" data-name="${item.name}" data-total="${item.total_price || 0}">
          ${item.section || "Без раздела"} · ${item.name} · ${item.estimated_quantity || 0} ${item.unit || ""}
        </option>`
    ),
  ].join("");
}

async function renderEstimateMaterials() {
  const projectSelect = qs('#estimateImportForm select[name="project_id"]');
  const projectId = projectSelect?.value || state.selectedProjectId || state.projects[0]?.id;
  if (!projectId) return;
  const rows = await api(`/api/estimate-materials?project_id=${projectId}`);
  qs("#estimateMaterialRows").innerHTML = rows.length
    ? rows
        .map(
          (row) => `
          <div class="row">
            <div class="row-grid">
              <div><strong>${row.name}</strong><div class="muted">${row.section || "Без раздела"}</div></div>
              ${pill(`${row.estimated_quantity || 0} ${row.unit || ""}`, "blue")}
              <div>${money(row.unit_price)}</div>
              ${pill(money(row.total_price), "success")}
            </div>
          </div>`
        )
        .join("")
    : `<p class="muted">По этому объекту материалы сметы еще не загружены.</p>`;
}

function applySelectedEstimateMaterial() {
  const selected = qs("#estimateMaterialSelect").selectedOptions[0];
  if (!selected || !selected.value) return;
  qs('#materialForm input[name="title"]').value = selected.dataset.name || "";
  qs('#materialForm input[name="estimate_section"]').value = selected.dataset.section || "";
  qs('#materialForm input[name="total_amount"]').value = selected.dataset.total || "";
}

async function renderDashboard() {
  const [summary, tasks] = await Promise.all([api("/api/summary"), api("/api/tasks")]);
  qs("#summaryCards").innerHTML = `
    <div class="metric"><span class="muted">Объекты</span><strong>${summary.projects}</strong><span>В базе MVP</span></div>
    <div class="metric"><span class="muted">Открытые задачи</span><strong>${summary.open_tasks}</strong><span>Нужен контроль</span></div>
    <div class="metric"><span class="muted">Заявки</span><strong>${summary.material_requests}</strong><span>Не закрыты</span></div>
    <div class="metric"><span class="muted">Сверхбюджет без решения</span><strong>${money(summary.unresolved_overbudget)}</strong><span>Риск</span></div>
  `;
  qs("#dashboardProjects").innerHTML = state.projects
    .slice(0, 4)
    .map(
      (project) => `
      <button class="row clickable" data-open-project="${project.id}">
        <div class="stack-line"><strong>${project.title}</strong>${pill(label(project.status), "blue")}</div>
        <div class="muted">${project.customer_name || "Заказчик не указан"} · ${project.foreman_name || "Прораб не назначен"}</div>
      </button>`
    )
    .join("");
  qs("#dashboardTasks").innerHTML = tasks
    .slice(0, 4)
    .map(
      (task) => `
      <div class="row">
        <div class="stack-line"><strong>${task.title}</strong>${pill(task.due_date || "без срока", levelByDate(task.due_date))}</div>
        <div class="muted">${task.project_title} · ${task.assignee_name || "не назначен"}</div>
      </div>`
    )
    .join("");
}

async function renderProjects() {
  qs("#projectRows").innerHTML = state.projects
    .map(
      (project) => `
      <button class="row clickable" data-open-project="${project.id}">
        <div class="row-grid">
          <div><strong>${project.title}</strong><div class="muted">${project.customer_name || ""}</div></div>
          ${pill(label(project.status), "blue")}
          <div>${project.foreman_name || "не назначен"}</div>
          ${pill(money(project.unresolved_overbudget_amount), levelByMoney(project.unresolved_overbudget_amount))}
        </div>
      </button>`
    )
    .join("");
  if (state.selectedProjectId) await renderProjectDetail(state.selectedProjectId);
}

async function renderProjectDetail(projectId) {
  const project = await api(`/api/projects/${projectId}`);
  state.selectedProjectId = project.id;
  const tabData = {
    overview: `
      <div class="detail-grid">
        <div class="info"><span>Основная смета</span><strong>${money(project.main_estimate_amount)}</strong></div>
        <div class="info"><span>Допработы</span><strong>${money(project.approved_variations_amount)}</strong></div>
        <div class="info"><span>Сверхбюджет без решения</span><strong>${money(project.unresolved_overbudget_amount)}</strong></div>
        <div class="info"><span>Срок</span><strong>${project.planned_end_date || "не задан"}</strong></div>
      </div>`,
    tasks: renderSmallList(project.tasks, (task) => `${task.title} · ${task.due_date || "без срока"}`),
    materials: renderSmallList(project.materials, (item) => `${item.title} · ${label(item.procurement_status)} · ${item.basis_type}`),
    variations: renderSmallList(project.variations, (item) => `${item.title} · ${variationType(item.type)} · ${money(item.amount)} · ${moneyDecision(item.financial_decision)}`),
    contracts: renderSmallList(project.contracts, (item) => `${item.title} · ${contractType(item.type)} · ${item.ends_at || "без даты окончания"}`),
    documents: renderSmallList(project.documents, (doc) => `${doc.title} · ${doc.type} · ${label(doc.status)}`),
    events: renderSmallList(project.events, (event) => `${event.text}`),
  };
  qs("#projectDetail").innerHTML = `
    <div class="stack-line"><h2>${project.title}</h2>${pill(label(project.status), "blue")}</div>
    <p class="muted">${project.address || "Адрес не указан"}</p>
    <div class="stack-line">
      ${pill(`Прораб: ${project.foreman_name || "не назначен"}`)}
      ${pill(`Сметчик: ${project.estimator_name || "не назначен"}`)}
      ${pill(project.bitrix_ref || "Bitrix не указан", "blue")}
      ${pill(project.smetter_ref || "Сметтер не указан", "success")}
    </div>
    <div class="tabs">
      ${["overview", "tasks", "materials", "variations", "contracts", "documents", "events"]
        .map((tab) => `<button class="tab ${state.selectedProjectTab === tab ? "active" : ""}" data-project-tab="${tab}">${tabTitle(tab)}</button>`)
        .join("")}
    </div>
    <div>${tabData[state.selectedProjectTab]}</div>
  `;
}

function renderSmallList(items, getText) {
  if (!items.length) return `<p class="muted">Пока пусто.</p>`;
  return `<div class="list">${items.map((item) => `<div class="row">${getText(item)}</div>`).join("")}</div>`;
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || "";
  return firstLine.includes(";") ? ";" : ",";
}

function parseCsvLine(line, delimiter) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function numberFromCell(value) {
  if (!value) return 0;
  return Number(String(value).replace(/\s/g, "").replace(",", ".")) || 0;
}

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/\s/g, "");
}

function readEstimateRows(text) {
  const delimiter = detectDelimiter(text);
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0], delimiter).map(normalizeHeader);
  const findIndex = (names, fallback) => {
    const found = headers.findIndex((header) => names.includes(header));
    return found >= 0 ? found : fallback;
  };
  const sectionIndex = findIndex(["раздел", "section", "группа"], 0);
  const nameIndex = findIndex(["наименование", "материал", "название", "name"], 1);
  const unitIndex = findIndex(["ед", "ед.", "единица", "единицаизмерения", "unit"], 2);
  const quantityIndex = findIndex(["количество", "кол-во", "колво", "quantity", "qty"], 3);
  const priceIndex = findIndex(["цена", "price", "стоимостьзаед"], 4);
  const totalIndex = findIndex(["сумма", "итого", "total"], 5);

  return lines
    .slice(1)
    .map((line) => {
      const cells = parseCsvLine(line, delimiter);
      return {
        section: cells[sectionIndex] || "",
        name: cells[nameIndex] || "",
        unit: cells[unitIndex] || "",
        estimated_quantity: numberFromCell(cells[quantityIndex]),
        unit_price: numberFromCell(cells[priceIndex]),
        total_price: numberFromCell(cells[totalIndex]),
      };
    })
    .filter((row) => row.name);
}

function renderEstimatePreview() {
  qs("#estimatePreviewRows").innerHTML = state.estimatePreviewRows.length
    ? state.estimatePreviewRows
        .slice(0, 20)
        .map(
          (row) => `
          <div class="row">
            <div class="row-grid">
              <div><strong>${row.name}</strong><div class="muted">${row.section || "Без раздела"}</div></div>
              ${pill(`${row.estimated_quantity || 0} ${row.unit || ""}`, "blue")}
              <div>${money(row.unit_price)}</div>
              ${pill(money(row.total_price), "success")}
            </div>
          </div>`
        )
        .join("")
    : `<p class="muted">В файле не найдено строк материалов.</p>`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result).split(",", 2)[1] || ""));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

async function loadEstimatePreview() {
  const file = qs('#estimateImportForm input[name="estimate_file"]').files[0];
  if (!file) {
    showToast("Выберите файл .xlsx или CSV");
    return;
  }
  if (file.name.toLowerCase().endsWith(".xlsx")) {
    const result = await api("/api/estimate-materials/preview-file", {
      method: "POST",
      body: JSON.stringify({
        file_name: file.name,
        file_base64: await fileToBase64(file),
      }),
    });
    state.estimatePreviewRows = result.rows || [];
  } else {
    const text = await file.text();
    state.estimatePreviewRows = readEstimateRows(text);
  }
  renderEstimatePreview();
  showToast(`Найдено строк: ${state.estimatePreviewRows.length}`);
}

function tabTitle(tab) {
  return {
    overview: "Обзор",
    tasks: "Задачи",
    materials: "Материалы",
    variations: "Допработы",
    contracts: "Договоры",
    documents: "Документы",
    events: "История",
  }[tab];
}

async function renderTasks() {
  const tasks = await api("/api/tasks");
  qs("#taskRows").innerHTML = tasks.map((task) => `
    <div class="row">
      <div class="row-grid">
        <div><strong>${task.title}</strong><div class="muted">${task.project_title}</div></div>
        ${pill(label(task.status), task.status === "review" ? "blue" : "warning")}
        <div>${task.assignee_name || "не назначен"}</div>
        ${pill(task.due_date || "без срока", levelByDate(task.due_date))}
      </div>
    </div>`).join("");
}

async function renderMaterials() {
  const items = await api("/api/material-requests");
  qs("#materialRows").innerHTML = items.map((item) => `
    <div class="row">
      <div class="row-grid">
        <div><strong>${item.title}</strong><div class="muted">${item.project_title} · ${item.estimate_section || "без раздела"}${item.estimate_material_name ? " · из сметы" : ""}</div></div>
        ${pill(item.basis_type, item.basis_type === "main_estimate" ? "success" : "warning")}
        <div>${label(item.procurement_status)}</div>
        ${pill(item.smetter_status, item.smetter_status === "not_required" ? "success" : "blue")}
      </div>
    </div>`).join("");
}

function variationType(type) {
  return {
    additional_work: "Допработа",
    material_overspend: "Перерасход",
    material_replacement: "Замена",
    hidden_work: "Скрытые работы",
    estimate_error: "Ошибка сметы",
    company_cost: "За счет компании",
    disputed_position: "Спорно",
  }[type] || type;
}

function moneyDecision(value) {
  return {
    not_decided: "Не решено",
    customer: "Заказчик",
    company: "Компания",
    contractor: "Подрядчик",
    disputed: "Спорно",
  }[value] || value;
}

async function renderVariations() {
  const rows = await api("/api/variations");
  qs("#variationRows").innerHTML = rows.length
    ? rows
        .map(
          (row) => `
          <div class="row">
            <div class="row-grid">
              <div><strong>${row.title}</strong><div class="muted">${row.project_title} · ${variationType(row.type)}</div></div>
              ${pill(money(row.amount), row.financial_decision === "not_decided" ? "danger" : "warning")}
              <div>${moneyDecision(row.financial_decision)}</div>
              ${pill(row.due_date || "без срока", levelByDate(row.due_date))}
            </div>
          </div>`
        )
        .join("")
    : `<p class="muted">Допработ и отклонений пока нет.</p>`;
}

function contractType(type) {
  return {
    customer_contract: "Заказчик",
    additional_agreement: "Допник",
    supplier_contract: "Поставщик",
    contractor_contract: "Подрядчик",
    equipment_rent: "Аренда",
  }[type] || type;
}

async function renderContracts() {
  const [contracts, tasks, materials] = await Promise.all([
    api("/api/contracts"),
    api("/api/tasks"),
    api("/api/material-requests"),
  ]);

  qs("#contractRows").innerHTML = contracts.length
    ? contracts
        .map(
          (contract) => `
          <div class="row">
            <div class="row-grid">
              <div><strong>${contract.title}</strong><div class="muted">${contract.project_title} · ${contract.counterparty || "контрагент не указан"}</div></div>
              ${pill(contractType(contract.type), "blue")}
              <div>${contract.responsible_name || "не назначен"}</div>
              ${pill(contract.ends_at || "без даты", levelByDate(contract.ends_at))}
            </div>
          </div>`
        )
        .join("")
    : `<p class="muted">Договоров пока нет.</p>`;

  const deadlineRows = [
    ...contracts.map((item) => ({
      title: item.title,
      project: item.project_title,
      type: "Договор",
      date: item.ends_at,
      owner: item.responsible_name,
    })),
    ...tasks.map((item) => ({
      title: item.title,
      project: item.project_title,
      type: "Задача",
      date: item.due_date,
      owner: item.assignee_name,
    })),
    ...materials.map((item) => ({
      title: item.title,
      project: item.project_title,
      type: "Материалы",
      date: item.needed_at,
      owner: "Анастасия",
    })),
  ]
    .filter((item) => item.date)
    .sort((a, b) => new Date(`${a.date}T00:00:00`) - new Date(`${b.date}T00:00:00`));

  qs("#deadlineRows").innerHTML = deadlineRows.length
    ? deadlineRows
        .map(
          (item) => `
          <div class="row">
            <div class="stack-line"><strong>${item.title}</strong>${pill(item.type, "blue")}${pill(item.date, levelByDate(item.date))}</div>
            <div class="muted">${item.project} · ответственный: ${item.owner || "не назначен"}</div>
          </div>`
        )
        .join("")
    : `<p class="muted">Контрольных сроков пока нет.</p>`;
}

async function renderDocuments() {
  const docs = await api("/api/documents");
  qs("#documentCards").innerHTML = docs.map((doc) => `
    <article class="card">
      <div class="stack-line"><strong>${doc.title}</strong>${pill(doc.type, "blue")}${pill(label(doc.status))}</div>
      <div class="muted">${doc.project_title} · ответственный: ${doc.owner_name || "не назначен"}</div>
      <div class="stack-line">${doc.version ? pill(`Версия: ${doc.version}`) : ""}${doc.due_date ? pill(`Срок: ${doc.due_date}`, levelByDate(doc.due_date)) : ""}</div>
    </article>`).join("");
}

async function renderEvents() {
  const events = await api("/api/events");
  qs("#eventTimeline").innerHTML = events.map((event) => `
    <article class="timeline-item">
      <div class="stack-line"><strong>${eventType(event.type)}</strong>${pill(event.visibility === "customer_allowed" ? "Можно заказчику" : "Внутреннее", event.visibility === "customer_allowed" ? "success" : "")}</div>
      <p>${event.text}</p>
      <div class="muted">${event.project_title} · ${event.author_name || "автор не указан"} · ${event.created_at}</div>
    </article>`).join("");
}

function eventType(type) {
  return {
    decision: "Решение",
    comment: "Комментарий",
    document: "Документ",
    problem: "Проблема",
    customer_approval: "Согласование",
  }[type] || type;
}

function formToJson(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof File) {
      data[key] = value.name;
    }
  }
  return data;
}

async function submitForm(dialogId, formId, endpoint, successMessage) {
  const form = qs(`#${formId}`);
  await api(endpoint, { method: "POST", body: JSON.stringify(formToJson(form)) });
  qs(`#${dialogId}`).close();
  form.reset();
  await loadAll();
  showToast(successMessage);
}

function bindEvents() {
  qsa("[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  qsa("[data-view-target]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.viewTarget)));
  qs("#refreshButton").addEventListener("click", () => loadAll().then(() => showToast("Данные обновлены")));

  qs("#newProjectButton").addEventListener("click", () => qs("#projectDialog").showModal());
  qs("#newTaskButton").addEventListener("click", () => qs("#taskDialog").showModal());
  qs("#newMaterialButton").addEventListener("click", () => qs("#materialDialog").showModal());
  qs("#newVariationButton").addEventListener("click", () => qs("#variationDialog").showModal());
  qs("#newContractButton").addEventListener("click", () => qs("#contractDialog").showModal());
  qs("#newDocumentButton").addEventListener("click", () => qs("#documentDialog").showModal());
  qs("#newEventButton").addEventListener("click", () => qs("#eventDialog").showModal());

  qsa("[data-close]").forEach((button) => button.addEventListener("click", () => qs(`#${button.dataset.close}`).close()));

  qs('#materialForm select[name="project_id"]').addEventListener("change", updateEstimateMaterialSelect);
  qs("#estimateMaterialSelect").addEventListener("change", applySelectedEstimateMaterial);
  qs('#estimateImportForm select[name="project_id"]').addEventListener("change", renderEstimateMaterials);
  qs("#refreshEstimateButton").addEventListener("click", renderEstimateMaterials);
  qs("#previewEstimateButton").addEventListener("click", loadEstimatePreview);

  document.addEventListener("click", async (event) => {
    const projectButton = event.target.closest("[data-open-project]");
    if (projectButton) {
      state.selectedProjectId = Number(projectButton.dataset.openProject);
      state.selectedProjectTab = "overview";
      switchView("projects");
      await renderProjectDetail(state.selectedProjectId);
    }
    const tabButton = event.target.closest("[data-project-tab]");
    if (tabButton) {
      state.selectedProjectTab = tabButton.dataset.projectTab;
      await renderProjectDetail(state.selectedProjectId);
    }
  });

  qs("#projectForm").addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm("projectDialog", "projectForm", "/api/projects", "Объект создан");
  });
  qs("#taskForm").addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm("taskDialog", "taskForm", "/api/tasks", "Задача создана");
  });
  qs("#materialForm").addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm("materialDialog", "materialForm", "/api/material-requests", "Заявка создана");
  });
  qs("#variationForm").addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm("variationDialog", "variationForm", "/api/variations", "Допработа добавлена");
  });
  qs("#contractForm").addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm("contractDialog", "contractForm", "/api/contracts", "Договор сохранен");
  });
  qs("#estimateImportForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.estimatePreviewRows.length) {
      await loadEstimatePreview();
    }
    if (!state.estimatePreviewRows.length) return;
    const form = qs("#estimateImportForm");
    const file = form.elements.estimate_file.files[0];
    await api("/api/estimate-materials/import", {
      method: "POST",
      body: JSON.stringify({
        project_id: form.elements.project_id.value,
        estimate_version: form.elements.estimate_version.value,
        file_name: file?.name || "",
        replace: true,
        rows: state.estimatePreviewRows,
      }),
    });
    state.estimatePreviewRows = [];
    qs("#estimatePreviewRows").innerHTML = `<p class="muted">Файл загружен. Можно выбрать другой файл.</p>`;
    await loadAll();
    switchView("materials");
    showToast("Материалы сметы загружены в объект");
  });
  qs("#documentForm").addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm("documentDialog", "documentForm", "/api/documents", "Документ добавлен");
  });
  qs("#eventForm").addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm("eventDialog", "eventForm", "/api/events", "Событие сохранено");
  });
}

bindEvents();
loadAll().catch((error) => showToast(error.message));
