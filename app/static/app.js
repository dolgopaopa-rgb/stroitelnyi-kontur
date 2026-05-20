const initialRoute = new URLSearchParams(window.location.search);
const initialProjectId = Number(initialRoute.get("project") || 0) || null;

const state = {
  view: initialRoute.get("view") || localStorage.getItem("currentView") || "dashboard",
  currentRole: localStorage.getItem("currentRole") || "owner",
  session: null,
  canSwitchRole: true,
  users: [],
  projects: [],
  archivedProjects: [],
  materialRequests: [],
  estimateMaterials: [],
  estimatePreviewRows: [],
  showEstimateMaterials: false,
  selectedProjectId: initialProjectId,
  selectedProjectTab: "overview",
  projectListMode: "active",
  materialListMode: "active",
  taskFilter: "all",
  feedbackFilter: "all",
  selectedFeedbackIds: new Set(),
  maxChatDrafts: {},
  selectedTaskProjectId: initialProjectId,
  lastTasks: [],
  notificationsOpen: false,
  expandedLists: {},
  selectedWorkProjectId: initialProjectId,
  openWorkStages: {},
};

let sortableDragSource = null;

const viewTitles = {
  dashboard: "Рабочий стол",
  projects: "Объекты",
  tasks: "Задачи",
  works: "Работы",
  materials: "Материалы",
  variations: "Допработы и отклонения",
  locations: "Локации",
  documents: "База знаний",
  feedback: "Обратная связь",
  events: "Журнал событий",
};

const statusLabels = {
  draft: "Черновик менеджера",
  submitted_to_construction: "На проверке строительства",
  revision_requested: "Возвращена на доработку",
  transferred_to_construction: "Передан",
  preparation: "Подготовка",
  in_progress: "В работе",
  paused: "Пауза",
  acceptance: "Приемка",
  document_closing: "Документы",
  completed: "Завершен",
  archived: "Архив",
  new: "Новая",
  returned: "Возвращена на доработку",
  in_progress_task: "В работе",
  review: "На проверке",
  completed_pending_acceptance: "Выполнена, ждет приемки",
  accepted: "Выполнение принято",
  approval: "Согласование",
  ordered: "Заказано",
  delivery: "Доставка",
  delivery_confirmed: "Доставка обработана",
  delivery_scheduled: "Доставка назначена",
  received: "Получено",
  receipt_issue: "Проблема при приемке",
  in_work: "Принята в работу",
  active: "Активен",
  signed: "Подписан",
  waiting_to_enter: "Внести в Сметтер",
  not_required: "Не требуется",
  no_basis_decision: "Нет решения",
  decision_required: "Требует решения",
  in_review: "На согласовании",
  approved: "Согласовано",
  rejected: "Отклонено",
  feedback_new: "Новое",
  feedback_in_work: "В работе",
  feedback_done: "Обработано",
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
    let message = text;
    try {
      message = JSON.parse(text).error || text;
    } catch (error) {
      message = text;
    }
    if (/^\s*</.test(String(message))) {
      message = `Ошибка ${response.status}`;
    }
    throw new Error(message || `Ошибка ${response.status}`);
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

function formatDateRu(value) {
  if (!value) return "";
  const datePart = String(value).slice(0, 10);
  const parts = datePart.split("-");
  if (parts.length !== 3) return value;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function levelByMoney(value) {
  return Number(value || 0) > 0 ? "danger" : "success";
}

function label(value) {
  return statusLabels[value] || value || "Не задано";
}

function materialBasisLabel(value) {
  return {
    main_estimate: "По смете",
    main_estimate_overspend: "Перерасход по смете",
    additional_work: "Допработа",
    material_replacement: "Замена материала",
    over_budget_cost: "Сверхбюджет",
    internal_error_or_loss: "За счет компании",
  }[value] || value || "Основание не указано";
}

function materialBasisLevel(value) {
  return value === "main_estimate" ? "success" : "warning";
}

function urgencyLabel(value) {
  return value === "urgent" ? "Срочно" : "Стандартная";
}

function urgencyLevel(value) {
  return value === "urgent" ? "danger" : "blue";
}

function workReasonLabel(value) {
  return {
    additional_work: "Доп",
    main_estimate_overspend: "Превышение",
    company_cost: "Расходы компании",
    rework: "Переделка",
  }[value] || value || "Не указано";
}

function canEditProject() {
  return ["owner", "sales_manager", "construction_manager", "finance_director"].includes(currentRoleBase());
}

function canSubmitProject() {
  return ["owner", "sales_manager", "finance_director"].includes(currentRoleBase());
}

function canAcceptProject() {
  return ["owner", "construction_manager", "finance_director"].includes(currentRoleBase());
}

function canArchiveProject() {
  return ["owner", "construction_manager", "finance_director"].includes(currentRoleBase());
}

function canDeleteForever() {
  return currentRoleBase() === "owner";
}

function canManageKnowledgeBase() {
  return ["owner", "construction_manager", "finance_director"].includes(currentRoleBase());
}

function canDeleteKnowledgeBase() {
  return ["owner", "construction_manager"].includes(currentRoleBase());
}

function canDeleteFeedback() {
  return ["owner", "construction_manager", "sales_manager"].includes(currentRoleBase());
}

function canManageSystemSettings() {
  return ["owner", "construction_manager", "finance_director"].includes(currentRoleBase());
}

const viewAccess = {
  owner: ["dashboard", "projects", "tasks", "works", "materials", "variations", "locations", "documents", "feedback", "events"],
  construction_manager: ["dashboard", "projects", "tasks", "works", "materials", "variations", "locations", "documents", "feedback", "events"],
  finance_director: ["dashboard", "projects", "tasks", "works", "materials", "variations", "locations", "documents", "feedback", "events"],
  accountant: ["dashboard", "projects", "materials", "variations", "locations", "documents", "events"],
  sales_manager: ["dashboard", "projects", "locations", "documents", "feedback"],
  foreman: ["dashboard", "projects", "tasks", "works", "materials", "locations", "documents"],
  procurement_manager: ["dashboard", "projects", "materials", "locations", "documents"],
  estimator: ["dashboard", "projects", "tasks", "works", "materials", "variations", "documents"],
  technical_supervisor: ["dashboard", "projects", "tasks", "works", "materials", "locations", "documents"],
};

function allowedViews() {
  return viewAccess[currentRoleBase()] || viewAccess.owner;
}

function canView(view) {
  return allowedViews().includes(view);
}

function syncNavigationAccess() {
  const allowed = allowedViews();
  qsa("[data-view]").forEach((button) => {
    button.hidden = !allowed.includes(button.dataset.view);
  });
  const newProjectButton = qs("#newProjectButton");
  if (newProjectButton) newProjectButton.hidden = !canEditProject();
  if (!allowed.includes(state.view)) {
    switchView(allowed[0] || "dashboard");
  }
}

function canViewFinancials() {
  return ["owner", "construction_manager", "finance_director", "accountant", "sales_manager", "estimator"].includes(currentRoleBase());
}

function canViewExternalRefs() {
  return ["owner", "construction_manager", "finance_director", "accountant", "sales_manager", "estimator"].includes(currentRoleBase());
}

const documentAccess = {
  owner: null,
  construction_manager: null,
  finance_director: null,
  sales_manager: null,
  accountant: new Set(["main_estimate", "smetter_materials", "smetter_work_task", "contract", "variation_estimate", "act", "ks_2", "ks_3", "other"]),
  estimator: new Set(["main_estimate", "smetter_materials", "smetter_work_task", "project_documentation", "variation_estimate", "act", "ks_2", "ks_3", "other"]),
  foreman: new Set(["smetter_materials", "smetter_work_task", "project_documentation", "detail_node", "regulation", "standard", "instruction", "other"]),
  procurement_manager: new Set(["smetter_materials", "project_documentation", "detail_node", "regulation", "standard", "instruction", "other"]),
  technical_supervisor: new Set(["smetter_materials", "smetter_work_task", "project_documentation", "detail_node", "regulation", "standard", "instruction", "other"]),
};

function visibleDocuments(docs = []) {
  const allowed = documentAccess[currentRoleBase()];
  if (!allowed) return docs;
  return docs.filter((doc) => allowed.has(doc.type || "other"));
}

function projectTabs() {
  const base = currentRoleBase();
  const tabs = {
    owner: ["overview", "tasks", "works", "materials", "variations", "documents", "events"],
    construction_manager: ["overview", "tasks", "works", "materials", "variations", "documents", "events"],
    finance_director: ["overview", "tasks", "works", "materials", "variations", "documents", "events"],
    accountant: ["overview", "materials", "variations", "documents", "events"],
    sales_manager: ["overview", "documents", "events"],
    foreman: ["overview", "tasks", "works", "materials", "documents"],
    procurement_manager: ["overview", "materials", "documents"],
    estimator: ["overview", "works", "materials", "variations", "documents"],
    technical_supervisor: ["overview", "tasks", "works", "materials", "documents"],
  }[base];
  return tabs || ["overview"];
}

function roleLabel(role) {
  if (String(role || "").startsWith("foreman:")) {
    const user = state.users.find((item) => item.id === Number(String(role).split(":")[1]));
    return `Прораб ${user?.name || ""}`.trim();
  }
  return {
    owner: "Ген.директор",
    finance_director: "Фин.директор",
    accountant: "Бухгалтер",
    sales_manager: "Менеджер",
    construction_manager: "Рук. строительства",
    foreman: "Прораб",
    procurement_manager: "Снабжение",
    estimator: "Сметчик",
    technical_supervisor: "Технадзор",
  }[role] || role;
}

function currentRoleBase() {
  return String(state.currentRole || "").split(":")[0];
}

function currentUserId() {
  if (String(state.currentRole || "").includes(":")) return Number(String(state.currentRole).split(":")[1]);
  return state.users.find((user) => user.role === currentRoleBase())?.id || null;
}

function roleValueForUser(user, fallbackRole = "owner") {
  if (!user) return fallbackRole || "owner";
  return user.role === "foreman" ? `foreman:${user.id}` : user.role;
}

function availableRoleOptions() {
  const options = [
    ["finance_director", "Фин.директор"],
    ["accountant", "Бухгалтер"],
    ["sales_manager", "Менеджер"],
    ["construction_manager", "Рук. строительства"],
    ...usersByRole("foreman").map((user) => [`foreman:${user.id}`, `Прораб ${user.name}`]),
    ["procurement_manager", "Снабжение"],
    ["estimator", "Сметчик"],
    ["technical_supervisor", "Технадзор"],
  ];
  if (state.session?.role === "owner") {
    return [["owner", "Ген.директор"], ...options];
  }
  return options;
}

async function loadSession() {
  const session = await api("/api/session");
  state.session = session;
  state.canSwitchRole = Boolean(session.can_switch_role);
  state.currentRole = roleValueForUser(session.user, session.role);
}

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function externalRefLink(value, fallbackText, level = "") {
  const text = String(value || "").trim();
  if (!text) return pill(fallbackText, level);
  const isUrl = /^https?:\/\//i.test(text);
  const looksLikeDomain = /^(www\.|[a-z0-9-]+\.[a-z0-9.-]+\/?)/i.test(text) && !/\s/.test(text);
  if (!isUrl && !looksLikeDomain) return pill(text, level);
  const href = isUrl ? text : `https://${text}`;
  return `<a class="pill link-pill ${level}" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${fallbackText}</a>`;
}

function yandexMapsUrl(address) {
  const text = String(address || "").trim();
  if (!text) return "";
  return `https://yandex.ru/maps/?rtext=~${encodeURIComponent(text)}&rtt=auto`;
}

function addressLink(address, className = "") {
  const text = String(address || "").trim();
  if (!text) return `<span class="muted">Адрес не указан</span>`;
  return `<a class="address-link ${className}" href="${escapeAttr(yandexMapsUrl(text))}" target="_blank" rel="noopener noreferrer">${text}</a>`;
}

function mapLink(address, mapsUrl, label = "Открыть в Яндекс.Картах") {
  const url = String(mapsUrl || "").trim();
  const addressText = String(address || "").trim();
  const href = addressText ? yandexMapsUrl(addressText) : url;
  if (!href) return `<span class="muted">Локация не указана</span>`;
  return `<a class="link-button inline-link" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
}

function documentType(type) {
  return {
    contract: "Договор",
    main_estimate: "Основная смета",
    smetter_materials: "Файл материалов из Сметтера",
    smetter_work_task: "Задание на работы из Сметтера",
    project_documentation: "Проектная документация",
    variation_estimate: "Смета допработ",
    act: "Акт",
    ks_2: "КС-2",
    ks_3: "КС-3",
    detail_node: "Узел",
    regulation: "Регламент",
    standard: "Стандарт компании",
    instruction: "Инструкция",
    invoice: "Счет",
    other: "Документ",
  }[type] || type || "Документ";
}

function isBrokenText(value) {
  const text = String(value || "").trim();
  return Boolean(text) && /^[?\s.,:;!()[\]-]+$/.test(text);
}

function documentTitle(doc) {
  const title = String(doc.title || "").trim();
  if (title && !isBrokenText(title)) return title;
  return documentType(doc.type) || doc.file_name || "Документ";
}

function documentFileLink(doc) {
  const type = documentType(doc.type);
  const title = documentTitle(doc);
  const file = doc.file_name || "";
  if (!doc.file_path) {
    return `
      <div>
        <strong>${title}</strong>
        <div class="muted">${type} · файл не загружен</div>
      </div>`;
  }
  return `
    <a class="document-link" href="/api/documents/${doc.id}/download" target="_blank" rel="noopener noreferrer">
      <strong>${title}</strong>
      <span>${[type, doc.status === "archived" ? "архивная версия" : "", doc.related_section, doc.process_type, file].filter(Boolean).join(" · ")}</span>
    </a>`;
}

function contractTitleById(contracts = []) {
  return contracts.reduce((acc, contract) => {
    acc[Number(contract.id)] = `${contractType(contract.type)}: ${contract.title}`;
    return acc;
  }, {});
}

function renderGroupedProjectDocuments(docs, contracts = []) {
  const byContract = contractTitleById(contracts);
  const activeDocs = docs.filter((doc) => doc.status !== "archived");
  const archivedDocs = docs.filter((doc) => doc.status === "archived");
  const groups = activeDocs.reduce((acc, doc) => {
    const key = doc.contract_id ? byContract[Number(doc.contract_id)] || "Договор / допник" : "Общие документы объекта";
    acc[key] = acc[key] || [];
    acc[key].push(doc);
    return acc;
  }, {});
  const activeHtml = Object.entries(groups)
    .map(
      ([title, items]) => `
        <details class="document-contract-group" open>
          <summary>${title} ${pill(`${items.length} шт.`, "blue")}</summary>
          <div class="document-list">${items.map((doc) => `<div class="document-row">${documentFileLink(doc)}</div>`).join("")}</div>
        </details>`
    )
    .join("");
  const archiveHtml = archivedDocs.length
    ? `
      <details class="document-contract-group">
        <summary>Архив замененных файлов ${pill(`${archivedDocs.length} шт.`, "warning")}</summary>
        <div class="document-list">${archivedDocs.map((doc) => `<div class="document-row">${documentFileLink(doc)}</div>`).join("")}</div>
      </details>`
    : "";
  return (activeHtml || archiveHtml)
    ? `${activeHtml}${archiveHtml}`
    : `<p class="muted">Документы пока не загружены. Добавить договор, смету или проект можно через кнопку “Редактировать”.</p>`;
}

function renderDocumentSummary(docs, contracts = []) {
  return `
    <section class="workflow-panel document-summary compact-collapsible">
      <details>
        <summary>
          <span>Документы объекта</span>
          ${pill(`${docs.length} шт.`, docs.length ? "blue" : "")}
        </summary>
        <div class="form-actions">
          ${canEditProject() ? `<button class="secondary tiny" type="button" data-add-contract="${state.selectedProjectId || ""}">Добавить договор / допник</button>` : ""}
        </div>
        ${renderGroupedProjectDocuments(docs, contracts)}
      </details>
    </section>`;
}

function renderCollapsibleList({ items, visibleCount = 3, emptyText = "Пока пусто.", renderItem, moreLabel = "Показать еще", key = "" }) {
  if (!items.length) return `<p class="muted">${emptyText}</p>`;
  const visible = items.slice(0, visibleCount).map(renderItem).join("");
  const hidden = items.slice(visibleCount);
  if (!hidden.length) return visible;
  return `
    ${visible}
    <details class="inline-collapsible" ${key ? `data-collapsible-key="${key}" ${state.expandedLists[key] ? "open" : ""}` : ""}>
      <summary>${moreLabel}: ${hidden.length}</summary>
      <div class="list compact-hidden-list">
        ${hidden.map(renderItem).join("")}
      </div>
    </details>`;
}

function renderDashboardTaskRow(task) {
  return `
    <div class="row dashboard-task-row">
      <div class="stack-line"><strong>${task.title}</strong>${pill(label(task.status), taskStatusLevel(task.status))}${pill(task.due_date || "без срока", levelByDate(task.due_date))}</div>
      <div class="muted">${task.project_title} · ответственный: ${task.assignee_name || "не назначен"} · принимает: ${task.reviewer_name || task.creator_name || "не назначен"}</div>
    </div>`;
}

function showToast(message) {
  const toast = qs("#toast");
  toast.textContent = message;
  toast.classList.add("active");
  setTimeout(() => toast.classList.remove("active"), 2200);
}

function switchView(view) {
  if (!viewTitles[view]) view = "dashboard";
  if (!canView(view)) view = allowedViews()[0] || "dashboard";
  state.view = view;
  localStorage.setItem("currentView", view);
  qsa(".nav-button").forEach((button) => {
    button.hidden = !canView(button.dataset.view);
    button.classList.toggle("active", button.dataset.view === view);
  });
  qsa(".view").forEach((node) => node.classList.remove("active"));
  qs(`#${view}View`).classList.add("active");
  qs("#pageTitle").textContent = viewTitles[view];
  initSortableZones();
}

function sortableOrderKey(zoneId) {
  return `sortable-order:${zoneId}`;
}

function storedSortableOrder(zoneId) {
  try {
    const order = JSON.parse(localStorage.getItem(sortableOrderKey(zoneId)) || "[]");
    return Array.isArray(order) ? order : [];
  } catch (error) {
    return [];
  }
}

function saveSortableOrder(zone) {
  const zoneId = zone.dataset.sortableZone;
  if (!zoneId) return;
  const order = [...zone.querySelectorAll(":scope > [data-sortable-block]")].map((block) => block.dataset.sortableBlock);
  localStorage.setItem(sortableOrderKey(zoneId), JSON.stringify(order));
}

function applySortableOrder(zone) {
  const order = storedSortableOrder(zone.dataset.sortableZone);
  if (!order.length) return;
  const blocks = new Map([...zone.querySelectorAll(":scope > [data-sortable-block]")].map((block) => [block.dataset.sortableBlock, block]));
  const placed = new Set();
  order.forEach((key) => {
    const block = blocks.get(key);
    if (block) {
      zone.appendChild(block);
      placed.add(key);
    }
  });
  blocks.forEach((block, key) => {
    if (!placed.has(key)) zone.appendChild(block);
  });
}

function sortableAfterElement(zone, x, y) {
  const blocks = [...zone.querySelectorAll(":scope > [data-sortable-block]:not(.dragging)")];
  return blocks.reduce(
    (closest, block) => {
      const box = block.getBoundingClientRect();
      const offset = (y - box.top - box.height / 2) * 10000 + (x - box.left - box.width / 2);
      if (offset < 0 && offset > closest.offset) return { offset, element: block };
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

function ensureDragHandle(block) {
  if (block.querySelector(":scope > .drag-handle")) return;
  const handle = document.createElement("button");
  handle.className = "drag-handle";
  handle.type = "button";
  handle.title = "Переместить блок";
  handle.setAttribute("aria-label", "Переместить блок");
  handle.textContent = "↕";
  block.prepend(handle);
}

function initSortableZones(scope = document) {
  const zones = [...scope.querySelectorAll("[data-sortable-zone]")];
  zones.forEach((zone) => {
    applySortableOrder(zone);
    zone.querySelectorAll(":scope > [data-sortable-block]").forEach((block) => {
      block.classList.add("sortable-block");
      block.draggable = true;
      ensureDragHandle(block);
      if (block.dataset.sortableBound) return;
      block.dataset.sortableBound = "1";
      block.addEventListener("dragstart", (event) => {
        const interactive = event.target.closest("a, button, input, select, textarea, label, summary");
        if (interactive && !event.target.closest(".drag-handle")) {
          event.preventDefault();
          return;
        }
        sortableDragSource = block;
        block.classList.add("dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", block.dataset.sortableBlock || "");
      });
      block.addEventListener("dragend", () => {
        block.classList.remove("dragging");
        if (block.parentElement?.dataset.sortableZone) saveSortableOrder(block.parentElement);
        sortableDragSource = null;
      });
    });
    if (zone.dataset.sortableZoneBound) return;
    zone.dataset.sortableZoneBound = "1";
    zone.addEventListener("dragover", (event) => {
      if (!sortableDragSource || sortableDragSource.parentElement !== zone) return;
      event.preventDefault();
      const after = sortableAfterElement(zone, event.clientX, event.clientY);
      if (!after) {
        zone.appendChild(sortableDragSource);
      } else if (after !== sortableDragSource.nextElementSibling) {
        zone.insertBefore(sortableDragSource, after);
      }
    });
    zone.addEventListener("drop", (event) => {
      if (!sortableDragSource || sortableDragSource.parentElement !== zone) return;
      event.preventDefault();
      saveSortableOrder(zone);
    });
  });
}

async function loadCoreData() {
  const [users, projects, archivedProjects] = await Promise.all([api("/api/users"), api("/api/projects"), api("/api/projects/archive")]);
  state.users = users;
  state.projects = projects;
  state.archivedProjects = archivedProjects;
  const availableProjects = state.projectListMode === "archive" ? archivedProjects : projects;
  if (state.selectedProjectId && !availableProjects.some((project) => Number(project.id) === Number(state.selectedProjectId))) {
    state.selectedProjectId = availableProjects[0]?.id || projects[0]?.id || null;
  }
  if (!state.selectedProjectId && projects.length) state.selectedProjectId = projects[0].id;
  fillSelects();
  syncNavigationAccess();
}

async function loadAll() {
  await loadCoreData();
  await Promise.all([
    renderDashboard(),
    renderNotifications(),
    renderProjects(),
    renderTasks(),
    renderWorks(),
    renderMaterials(),
    renderLocations(),
    renderEstimateMaterials(),
    renderVariations(),
    renderDocuments(),
    renderFeedback(),
    renderEvents(),
  ]);
  initSortableZones();
}

function fillSelects() {
  const projectOptions = state.projects.map((project) => `<option value="${project.id}">${project.title}</option>`).join("");
  const userOptions = state.users.map((user) => `<option value="${user.id}">${user.name}</option>`).join("");
  const taskUserOptions = taskParticipantOptions();
  qsa('select[name="project_id"]').forEach((select) => (select.innerHTML = projectOptions));
  const workProject = workProjectId();
  qsa('#workProjectForm select[name="project_id"], #workExtraForm select[name="project_id"]').forEach((select) => {
    if (workProject) select.value = String(workProject);
  });
  qsa('select[name="owner_id"], select[name="responsible_id"]').forEach((select) => (select.innerHTML = userOptions));
  qsa('#taskForm select[name="assignee_id"], #taskForm select[name="reviewer_id"]').forEach((select) => (select.innerHTML = taskUserOptions));
  updateEstimateMaterialSelect();
  fillRoleSwitcher();
  fillMaterialProjectSelect();
  updateMaterialActorHint();
}

function fillRoleSwitcher() {
  const select = qs("#currentRoleSelect");
  if (!select) return;
  const selected = state.currentRole;
  if (!state.canSwitchRole) {
    const sessionUser = state.session?.user || state.users.find((user) => user.id === Number(state.session?.user_id));
    const value = roleValueForUser(sessionUser, state.session?.role);
    const title = roleLabel(value);
    select.innerHTML = `<option value="${value}">${title}</option>`;
    select.value = value;
    select.disabled = true;
    select.closest(".role-switcher")?.classList.add("locked");
    state.currentRole = value;
    syncNavigationAccess();
    return;
  }
  select.disabled = false;
  select.closest(".role-switcher")?.classList.remove("locked");
  const options = availableRoleOptions();
  select.innerHTML = options.map(([value, title]) => `<option value="${value}">${title}</option>`).join("");
  const ownRole = roleValueForUser(state.session?.user, state.session?.role);
  select.value = options.some(([value]) => value === selected)
    ? selected
    : options.some(([value]) => value === ownRole)
      ? ownRole
      : options[0]?.[0] || ownRole || "construction_manager";
  state.currentRole = select.value;
  localStorage.setItem("currentRole", state.currentRole);
  syncNavigationAccess();
}

function usersByRole(role) {
  return state.users.filter((user) => user.role === role);
}

function userOptionsByRole(role, { includeEmpty = false, selectedId = "" } = {}) {
  const empty = includeEmpty ? `<option value="">Не назначен</option>` : "";
  return (
    empty +
    usersByRole(role)
      .map((user) => `<option value="${user.id}" ${Number(selectedId) === Number(user.id) ? "selected" : ""}>${user.name}</option>`)
      .join("")
  );
}

function taskParticipantLabel(user) {
  if (user.role === "owner") return "Ген.директор";
  if (user.role === "finance_director") return "Фин.директор";
  if (user.role === "accountant") return "Бухгалтер";
  if (user.role === "construction_manager") return "Рук.по строительству";
  if (user.role === "technical_supervisor") return "Технадзор";
  if (user.role === "foreman") return `Прораб ${user.name}`;
  if (user.role === "estimator") return `Сметчик ${user.name}`;
  return user.name;
}

function taskParticipantOptions() {
  const order = { technical_supervisor: 1, foreman: 2, estimator: 3, construction_manager: 4, finance_director: 5, accountant: 6, owner: 7 };
  return state.users
    .filter((user) => ["technical_supervisor", "foreman", "estimator", "construction_manager", "finance_director", "accountant", "owner"].includes(user.role))
    .sort((a, b) => (order[a.role] || 99) - (order[b.role] || 99) || a.name.localeCompare(b.name, "ru"))
    .map((user) => `<option value="${user.id}">${taskParticipantLabel(user)}</option>`)
    .join("");
}

function materialProjectsForRole() {
  if (currentRoleBase() !== "foreman") return state.projects;
  const userId = currentUserId();
  return state.projects.filter((project) => Number(project.foreman_id) === Number(userId));
}

function fillMaterialProjectSelect(preferredProjectId = state.selectedProjectId) {
  const select = qs('#materialForm select[name="project_id"]');
  if (!select) return null;
  const projects = materialProjectsForRole();
  if (!projects.length) {
    select.innerHTML = `<option value="">Нет объектов, закрепленных за этой ролью</option>`;
    select.disabled = true;
    return null;
  }
  select.disabled = false;
  select.innerHTML = projects.map((project) => `<option value="${project.id}">${project.title}</option>`).join("");
  const preferred = projects.find((project) => Number(project.id) === Number(preferredProjectId));
  select.value = String((preferred || projects[0]).id);
  return Number(select.value);
}

function updateMaterialActorHint() {
  const hint = qs("#materialActorHint");
  if (!hint) return;
  const role = roleLabel(state.currentRole);
  if (currentRoleBase() === "foreman") {
    hint.textContent = `Заявка уйдет от роли: ${role}. В списке доступны только объекты, закрепленные за этим прорабом.`;
    return;
  }
  hint.textContent = `Заявка уйдет от роли: ${role}.`;
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

function groupBySection(rows) {
  return rows.reduce((acc, row) => {
    const section = row.section || "Без раздела";
    acc[section] = acc[section] || [];
    acc[section].push(row);
    return acc;
  }, {});
}

async function renderEstimateMaterials() {
  const projectSelect = qs('#estimateImportForm select[name="project_id"]');
  const projectId = projectSelect?.value || state.selectedProjectId || state.projects[0]?.id;
  if (!projectId) return;
  const rows = await api(`/api/estimate-materials?project_id=${projectId}`);
  qs("#toggleEstimateMaterialsButton").textContent = state.showEstimateMaterials ? "Скрыть материалы" : "Материалы по смете";
  if (!rows.length) {
    qs("#estimateMaterialRows").innerHTML = `<p class="muted">По этому объекту материалы сметы еще не загружены.</p>`;
    return;
  }
  if (!state.showEstimateMaterials) {
    const sections = Object.keys(groupBySection(rows)).length;
    qs("#estimateMaterialRows").innerHTML = `<p class="muted">Загружено ${rows.length} позиций в ${sections} разделах. Нажмите “Материалы по смете”, чтобы открыть список по разделам.</p>`;
    return;
  }
  const grouped = groupBySection(rows);
  qs("#estimateMaterialRows").innerHTML = Object.entries(grouped)
    .map(
      ([section, sectionRows]) => `
      <details class="estimate-section">
        <summary>${section} <span>${sectionRows.length} позиций</span></summary>
        <div class="table">
          ${sectionRows
            .map(
              (row) => `
              <div class="row estimate-material-row">
                <div class="material-main">
                  <strong>${row.name}</strong>
                  <div class="muted">${row.section || "Без раздела"}</div>
                </div>
                <div class="stack-line">
                  ${pill(`${row.estimated_quantity || 0} ${row.unit || ""}`, "blue")}
                  ${pill(money(row.total_price), "success")}
                  <span class="muted">Цена: ${money(row.unit_price)}</span>
                </div>
              </div>`
            )
            .join("")}
        </div>
      </details>`
    )
    .join("");
}

function applySelectedEstimateMaterial() {
  const selected = qs("#estimateMaterialSelect").selectedOptions[0];
  if (!selected || !selected.value) return;
  qs('#materialForm input[name="title"]').value = selected.dataset.name || "";
  qs('#materialForm input[name="estimate_section"]').value = selected.dataset.section || "";
  qs('#materialForm input[name="total_amount"]').value = selected.dataset.total || "";
}

function materialRowTone(quantity, estimated) {
  const qty = Number(quantity || 0);
  const est = Number(estimated || 0);
  if (!qty) return "";
  if (est && qty > est) return "danger";
  if (est && qty < est) return "warning";
  return "success";
}

function updateMaterialEstimateRow(row) {
  const checkbox = row.querySelector('[data-material-check]');
  const quantityInput = row.querySelector('[data-material-quantity]');
  const reason = row.querySelector('[data-material-reason]');
  const estimated = Number(row.dataset.estimated || 0);
  const quantity = Number(quantityInput.value || 0);
  quantityInput.disabled = !checkbox.checked;
  reason.hidden = !(checkbox.checked && estimated && quantity > estimated);
  reason.querySelector("textarea").required = checkbox.checked && estimated && quantity > estimated;
  row.classList.remove("success", "warning", "danger");
  if (checkbox.checked) row.classList.add(materialRowTone(quantity, estimated));
}

function renderExtraMaterialRow() {
  return `
    <div class="row extra-material-row">
      <label>Материал <input data-extra-material-field="material" placeholder="Например: плиточный клей" /></label>
      <label>Наименование <input data-extra-material-field="name" placeholder="Марка, размер, артикул" /></label>
      <label>Количество <input data-extra-material-field="quantity" type="number" min="0" step="0.001" placeholder="0" /></label>
      <label>
        Причина
        <select data-extra-material-field="reason">
          <option value="additional_work">Доп</option>
          <option value="material_replacement">Замена</option>
          <option value="main_estimate_overspend">Превышение</option>
        </select>
      </label>
      <button class="icon" type="button" data-remove-extra-material>×</button>
    </div>`;
}

function addExtraMaterialRow(containerSelector = "#extraMaterialRows") {
  if (typeof containerSelector !== "string") containerSelector = "#extraMaterialRows";
  qs(containerSelector)?.insertAdjacentHTML("beforeend", renderExtraMaterialRow());
}

function resetExtraMaterials() {
  qs("#extraMaterialRows").innerHTML = "";
}

function collectExtraMaterials(containerSelector = "#extraMaterialRows") {
  return qsa(`${containerSelector} .extra-material-row`)
    .map((row) => ({
      material: row.querySelector('[data-extra-material-field="material"]').value.trim(),
      name: row.querySelector('[data-extra-material-field="name"]').value.trim(),
      quantity: row.querySelector('[data-extra-material-field="quantity"]').value,
      reason: row.querySelector('[data-extra-material-field="reason"]').value,
    }))
    .filter((item) => item.material || item.name || Number(item.quantity || 0) > 0);
}

async function loadMaterialEstimatePicker() {
  const form = qs("#materialForm");
  const projectId = form.elements.project_id.value;
  const target = qs("#materialEstimatePicker");
  updateMaterialActorHint();
  if (!projectId) {
    target.innerHTML = `<p class="muted">У выбранной роли нет объектов для заявки.</p>`;
    return;
  }
  const rows = await api(`/api/estimate-materials?project_id=${projectId}`);
  if (!rows.length) {
    target.innerHTML = `<p class="muted">По этому объекту нет загруженных материалов сметы.</p>`;
    return;
  }
  const grouped = groupBySection(rows);
  target.innerHTML = Object.entries(grouped)
    .map(
      ([section, sectionRows]) => `
      <details class="estimate-section">
        <summary>${section} <span>${sectionRows.length} позиций</span></summary>
        <div class="table">
          ${sectionRows
            .map(
              (row) => `
              <div class="row estimate-choice-row" data-estimate-id="${row.id}" data-estimated="${row.estimated_quantity || 0}">
                <label class="estimate-choice-title">
                  <input type="checkbox" data-material-check />
                  <span><strong>${row.name}</strong><small>${row.estimated_quantity || 0} ${row.unit || ""} по смете · ${money(row.total_price)}</small></span>
                </label>
                <label>Количество к заказу <input data-material-quantity type="number" min="0" step="0.001" value="${row.estimated_quantity || 0}" disabled /></label>
                <div class="estimate-over-reason" data-material-reason hidden>
                  <label>Причина превышения <textarea rows="2" placeholder="Почему заказываем сверх сметы"></textarea></label>
                </div>
              </div>`
            )
            .join("")}
        </div>
      </details>`
    )
    .join("");
}

function materialBatchKey(item) {
  return item.batch_id ? `batch-${item.batch_id}` : `item-${item.id}`;
}

function buildMaterialBatches(items) {
  const map = new Map();
  items.forEach((item) => {
    const key = materialBatchKey(item);
    if (!map.has(key)) {
      map.set(key, {
        key,
        id: item.batch_id,
        project_id: item.project_id,
        project_title: item.project_title,
        project_foreman_id: item.project_foreman_id,
        creator_id: item.creator_id,
        creator_name: item.creator_name,
        created_at: item.batch_created_at || item.created_at,
        needed_at: item.needed_at,
        delivery_urgency: item.batch_delivery_urgency || item.delivery_urgency,
        status: item.batch_status || item.procurement_status,
        comment: item.batch_comment || item.comment || "",
        revision_comment: item.batch_revision_comment || "",
        foreman_response: item.batch_foreman_response || "",
        scheduled_delivery_date: item.batch_scheduled_delivery_date || "",
        procurement_comment: item.batch_procurement_comment || "",
        received_at: item.batch_received_at || "",
        receipt_status: item.batch_receipt_status || "",
        receipt_comment: item.batch_receipt_comment || "",
        receipt_document_id: item.batch_receipt_document_id || "",
        receipt_document_file_name: item.batch_receipt_document_file_name || "",
        receipt_document_title: item.batch_receipt_document_title || "",
        receipt_document_mime_type: item.batch_receipt_document_mime_type || "",
        variation_id: item.batch_variation_id || "",
        variation_title: item.batch_variation_title || "",
        variation_status: item.batch_variation_status || "",
        archived_at: item.batch_archived_at || "",
        items: [],
        total_amount: 0,
      });
    }
    const batch = map.get(key);
    batch.items.push(item);
    batch.total_amount += Number(item.total_amount || 0);
  });
  return [...map.values()].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

function materialBatchTitle(batch, received = false) {
  const title = batch.delivery_urgency === "urgent" ? "срочная заявка" : "заявка";
  const prefix = received ? `Получена ${title}` : title[0].toUpperCase() + title.slice(1);
  return `${prefix} на материалы от ${formatDateRu(batch.created_at) || "без даты"}`;
}

function materialBatchLevel(status) {
  return {
    new: "warning",
    in_work: "blue",
    revision_requested: "danger",
    delivery_confirmed: "success",
    delivery_scheduled: "blue",
    received: "success",
    receipt_issue: "danger",
  }[status] || "";
}

function materialReceiptAttachment(batch) {
  if (!batch.receipt_document_id) return "";
  const fileName = batch.receipt_document_file_name || batch.receipt_document_title || "Файл приемки";
  const href = `/api/documents/${batch.receipt_document_id}/download`;
  const isImage = String(batch.receipt_document_mime_type || "").startsWith("image/");
  return `
    <div class="receipt-attachment">
      <a href="${href}" target="_blank" rel="noopener">${fileName}</a>
      ${isImage ? `<a href="${href}" target="_blank" rel="noopener"><img src="${href}" alt="${escapeAttr(fileName)}" /></a>` : ""}
    </div>`;
}

function materialBatchHasDeviation(batch) {
  return batch.items.some((item) => item.basis_type && item.basis_type !== "main_estimate");
}

function canCreateVariationFromBatch(batch) {
  if (!batch.id || !materialBatchHasDeviation(batch) || batch.variation_id) return false;
  if (["owner", "construction_manager", "finance_director"].includes(currentRoleBase())) return true;
  return currentRoleBase() === "foreman" && [Number(batch.project_foreman_id), Number(batch.creator_id)].includes(Number(currentUserId()));
}

function canEditMaterialBatch(batch) {
  if (!batch.id || !["new", "revision_requested"].includes(batch.status)) return false;
  if (["owner", "construction_manager"].includes(currentRoleBase())) return true;
  return currentRoleBase() === "foreman" && [Number(batch.project_foreman_id), Number(batch.creator_id)].includes(Number(currentUserId()));
}

function renderMaterialBatchEditSection(batch) {
  return `
    <section class="workflow-panel material-batch-edit-panel">
      <h3>Исправление заявки</h3>
      <p class="muted">Пока снабжение не взяло заявку в работу, ее можно изменить или удалить. После принятия в работу правки блокируются.</p>
      <div class="table material-batch-edit-list" id="materialBatchEditRows">
        ${batch.items
          .map(
            (item) => `
            <div class="row material-batch-edit-row" data-edit-item-id="${item.id}">
              <div class="material-main">
                <strong>${item.title}</strong>
                <div class="muted">${item.estimate_section || "без раздела"}</div>
                ${!item.estimate_material_id ? `<label>Наименование <input data-edit-item-title value="${escapeAttr(item.title)}" /></label>` : ""}
              </div>
              <label>Количество <input data-edit-item-quantity type="number" min="0" step="0.001" value="${item.requested_quantity || item.estimated_quantity || 0}" /></label>
              ${
                !item.estimate_material_id
                  ? `<label>Причина
                      <select data-edit-item-basis>
                        <option value="additional_work" ${item.basis_type === "additional_work" ? "selected" : ""}>Доп</option>
                        <option value="material_replacement" ${item.basis_type === "material_replacement" ? "selected" : ""}>Замена</option>
                        <option value="main_estimate_overspend" ${item.basis_type === "main_estimate_overspend" ? "selected" : ""}>Превышение</option>
                        <option value="over_budget_cost" ${item.basis_type === "over_budget_cost" ? "selected" : ""}>Сверх бюджета</option>
                      </select>
                    </label>`
                  : `<div>${pill(materialBasisLabel(item.basis_type), materialBasisLevel(item.basis_type))}</div>`
              }
              <label class="wide-field">Комментарий <textarea data-edit-item-comment rows="2">${item.comment || ""}</textarea></label>
              <label class="check-line"><input data-edit-item-remove type="checkbox" /> Удалить позицию</label>
            </div>`
          )
          .join("")}
      </div>
      <div class="stack-line material-extra-head">
        <h4>Добавить новые материалы</h4>
        <button class="secondary" type="button" data-add-batch-extra-material>Добавить строку</button>
      </div>
      <div class="table" id="batchExtraMaterialRows"></div>
      <label>Желаемая дата доставки <input id="materialBatchUpdateNeededAt" type="date" value="${batch.needed_at || ""}" /></label>
      <label>Комментарий к исправлению <textarea id="materialBatchUpdateComment" rows="3" placeholder="Например: уточнил длину арматуры, добавил замену"></textarea></label>
      <div class="form-actions">
        <button class="primary" type="button" data-material-batch-action="update" data-material-batch-id="${batch.id}">Сохранить и отправить снова</button>
        <button class="danger-button" type="button" data-material-batch-action="delete" data-material-batch-id="${batch.id}">Удалить заявку</button>
      </div>
    </section>`;
}

function collectMaterialBatchEdits() {
  return qsa("#materialBatchEditRows .material-batch-edit-row").map((row) => ({
    id: row.dataset.editItemId,
    title: row.querySelector("[data-edit-item-title]")?.value.trim(),
    quantity: row.querySelector("[data-edit-item-quantity]")?.value,
    basis_type: row.querySelector("[data-edit-item-basis]")?.value,
    comment: row.querySelector("[data-edit-item-comment]")?.value.trim(),
    remove: row.querySelector("[data-edit-item-remove]")?.checked || false,
  }));
}

function taskStats(tasks) {
  return {
    active: tasks.filter((task) => ["new", "in_progress_task", "review"].includes(task.status)).length,
    returned: tasks.filter((task) => task.status === "returned").length,
    waiting: tasks.filter((task) => task.status === "completed_pending_acceptance").length,
    accepted: tasks.filter((task) => task.status === "accepted").length,
    overdue: tasks.filter((task) => task.status !== "accepted" && levelByDate(task.due_date) === "danger").length,
  };
}

function taskMatchesFilter(task, filter) {
  if (filter === "active") return ["new", "in_progress_task", "review"].includes(task.status);
  if (filter === "returned") return task.status === "returned";
  if (filter === "waiting") return task.status === "completed_pending_acceptance";
  if (filter === "accepted") return task.status === "accepted";
  if (filter === "overdue") return task.status !== "accepted" && levelByDate(task.due_date) === "danger";
  return true;
}

function visibleTasksForRole(tasks) {
  if (currentRoleBase() !== "foreman") return tasks;
  const userId = currentUserId();
  return tasks.filter((task) => task.project_foreman_id === userId || task.assignee_id === userId || task.reviewer_id === userId);
}

function renderTaskStats(tasks, activeFilter = state.taskFilter) {
  const stats = taskStats(tasks);
  const total = Math.max(tasks.length, 1);
  const segments = [
    ["all", "Все", tasks.length, ""],
    ["active", "В работе", stats.active, "warning"],
    ["returned", "На доработке", stats.returned, "danger"],
    ["waiting", "Ждет приемки", stats.waiting, "blue"],
    ["accepted", "Принято", stats.accepted, "success"],
    ["overdue", "Просрочено", stats.overdue, "danger"],
  ];
  return `
    <div class="task-stats">
      ${segments
        .map(
          ([key, title, count, level]) => `
          <button class="task-stat ${level} ${activeFilter === key ? "active" : ""}" data-task-filter="${key}" type="button">
            <span>${title}</span>
            <strong>${count}</strong>
            <div class="stat-bar"><i style="width: ${(count / total) * 100}%"></i></div>
          </button>`
        )
        .join("")}
    </div>`;
}

function taskStatusLevel(status) {
  return {
    completed_pending_acceptance: "blue",
    accepted: "success",
    returned: "danger",
    new: "warning",
    in_progress_task: "warning",
    review: "blue",
  }[status] || "";
}

function uniqueMaterialBatches(materialRows = []) {
  const batches = new Map();
  materialRows.forEach((item) => {
    const key = item.batch_id || `material-${item.id}`;
    if (!batches.has(key)) batches.set(key, item);
  });
  return [...batches.values()];
}

function attentionItem(title, count, details, level, action) {
  return { title, count, details, level, action };
}

function buildDashboardAttention(summary, tasks, materialRows) {
  const items = [];
  const stats = taskStats(tasks);
  const activeProjects = state.projects.filter((project) => project.status !== "archived");
  const materialBatches = uniqueMaterialBatches(materialRows);

  if (stats.overdue) {
    items.push(attentionItem("Просроченные задачи", stats.overdue, "Нужно открыть задачи и решить: принять, вернуть или перенести срок.", "danger", { taskFilter: "overdue" }));
  }
  if (stats.waiting) {
    items.push(attentionItem("Ждут приемки", stats.waiting, "Исполнители отметили выполнение, но принимающий еще не закрыл результат.", "blue", { taskFilter: "waiting" }));
  }
  if (stats.returned) {
    items.push(attentionItem("На доработке", stats.returned, "Есть задачи, которые вернули исполнителям с комментариями.", "warning", { taskFilter: "returned" }));
  }

  const reviewProjects = activeProjects.filter((project) => project.status === "submitted_to_construction").length;
  if (reviewProjects) {
    items.push(attentionItem("Объекты на проверке", reviewProjects, "Руководителю строительства нужно принять объект в работу или вернуть менеджеру.", "warning", { view: "projects" }));
  }

  const unassignedProjects = activeProjects.filter(
    (project) => project.status === "in_progress" && (!project.foreman_id || !project.estimator_id || !project.procurement_manager_id || !project.tech_supervisor_id)
  ).length;
  if (["owner", "construction_manager", "finance_director"].includes(currentRoleBase()) && unassignedProjects) {
    items.push(attentionItem("Не все ответственные назначены", unassignedProjects, "По объектам в работе должны быть понятны прораб, сметчик, снабжение и технадзор.", "warning", { view: "projects" }));
  }

  const returnedMaterials = materialBatches.filter((batch) => batch.batch_status === "returned").length;
  if (returnedMaterials) {
    items.push(attentionItem("Заявки вернули на доработку", returnedMaterials, "Прорабу нужно открыть заявку, исправить и отправить снабжению повторно.", "warning", { view: "materials" }));
  }

  const receiptIssues = materialBatches.filter((batch) => batch.batch_status === "receipt_issue").length;
  if (receiptIssues) {
    items.push(attentionItem("Проблемы при приемке материалов", receiptIssues, "Снабжению нужно закрыть проблему по заявке и уведомить участников.", "danger", { view: "materials" }));
  }

  const urgentMaterials = materialBatches.filter((batch) => batch.batch_delivery_urgency === "urgent" && !["received", "archived"].includes(batch.batch_status)).length;
  if (urgentMaterials) {
    items.push(attentionItem("Срочные материалы", urgentMaterials, "Заявки с доставкой сегодня или завтра лучше держать на виду.", "danger", { view: "materials" }));
  }

  if (canViewFinancials() && Number(summary.unresolved_overbudget || 0) > 0) {
    items.push(attentionItem("Сверхбюджет без решения", money(summary.unresolved_overbudget), "Нужно решить, что идет в допработы, что остается расходом компании.", "danger", { view: "variations" }));
  }

  if (["owner", "construction_manager", "finance_director"].includes(currentRoleBase())) {
    const unboundMaxUsers = state.users.filter((user) => user.is_active && ["owner", "construction_manager", "finance_director", "accountant", "foreman", "procurement_manager", "technical_supervisor", "estimator"].includes(user.role) && !user.max_chat_id).length;
    if (unboundMaxUsers) {
      items.push(attentionItem("MAX не привязан", unboundMaxUsers, "Личные уведомления не будут доходить до всех участников процесса.", "blue", { view: "feedback" }));
    }
  }

  return items.slice(0, 6);
}

function renderDashboardAttention(items) {
  if (!items.length) {
    return `
      <div class="attention-empty">
        <strong>Критичных сигналов нет</strong>
        <span>Агент не нашел просрочек, зависших приемок или проблемных заявок по текущей роли.</span>
      </div>`;
  }
  return `
    <div class="attention-list">
      ${items
        .map((item) => {
          const attrs = item.action?.taskFilter ? `data-task-filter="${item.action.taskFilter}"` : `data-view-target="${item.action?.view || "dashboard"}"`;
          return `
            <button class="attention-item ${item.level}" type="button" ${attrs}>
              <span class="attention-count">${escapeHtml(String(item.count))}</span>
              <span class="attention-body">
                <strong>${escapeHtml(item.title)}</strong>
                <small>${escapeHtml(item.details)}</small>
              </span>
            </button>`;
        })
        .join("")}
    </div>`;
}

function canActAsTaskUser(task, kind) {
  const userId = currentUserId();
  const idKey = `${kind}_id`;
  const roleKey = `${kind}_role`;
  return task[idKey] === userId || task[roleKey] === currentRoleBase();
}

function canDeleteTask(task) {
  return ["owner", "construction_manager"].includes(currentRoleBase());
}

async function renderDashboard() {
  const [summary, tasks, materialRows] = await Promise.all([api("/api/summary"), api("/api/tasks"), api("/api/material-requests")]);
  const roleTasks = visibleTasksForRole(tasks);
  qs("#summaryCards").innerHTML = `
    <button class="metric clickable" data-view-target="projects" type="button"><span class="muted">Объекты</span><strong>${summary.projects}</strong><span>В базе MVP</span></button>
    <button class="metric clickable" data-view-target="projects" type="button"><span class="muted">У менеджера</span><strong>${summary.pending_handover}</strong><span>Черновики и доработки</span></button>
    <button class="metric clickable" data-view-target="projects" type="button"><span class="muted">На передаче</span><strong>${summary.construction_review || 0}</strong><span>Ждут решения строительства</span></button>
    <button class="metric clickable" data-task-filter="waiting" type="button"><span class="muted">Задачи к приемке</span><strong>${summary.task_done_waiting || 0}</strong><span>Выполнены, но не приняты</span></button>
    <button class="metric clickable" data-task-filter="overdue" type="button"><span class="muted">Просрочено</span><strong>${taskStats(roleTasks).overdue}</strong><span>По открытым задачам</span></button>
  `;
  qs("#dashboardAttention").innerHTML = renderDashboardAttention(buildDashboardAttention(summary, roleTasks, materialRows));
  qs("#dashboardTaskStats").innerHTML = renderTaskStats(roleTasks);
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
  qs("#dashboardTasks").innerHTML = renderCollapsibleList({
    items: roleTasks,
    visibleCount: 3,
    emptyText: "Задач пока нет.",
    renderItem: renderDashboardTaskRow,
    moreLabel: "Остальные задачи",
    key: "dashboardTasks",
  });
  initSortableZones(qs("#dashboardView"));
}

async function renderNotifications() {
  const rows = await api("/api/notifications");
  qs("#notificationRows").innerHTML = rows.length
    ? `<details class="inline-collapsible notification-collapsible" ${state.notificationsOpen ? "open" : ""}>
        <summary>Показать уведомления: ${rows.length}</summary>
        <div class="list compact-hidden-list">
          ${rows
            .map(
              (row) => {
                const target =
                  row.related_type === "material_request_batch" && row.related_id
                    ? `data-open-material-batch="batch-${row.related_id}"`
                    : `data-open-project="${row.project_id}"`;
                return `
              <button class="row clickable notification-row" ${target}>
                <div class="stack-line"><strong>${row.title}</strong>${pill(row.user_name || row.role, row.is_read ? "" : "warning")}</div>
                <div class="notification-text">${row.text}</div>
                <div class="muted">${row.project_title || "Без объекта"} · ${row.created_at}</div>
              </button>`;
              }
            )
            .join("")}
        </div>
      </details>`
    : `<p class="muted">Уведомлений пока нет.</p>`;
  qs(".notification-collapsible")?.addEventListener("toggle", (event) => {
    state.notificationsOpen = event.currentTarget.open;
  });
}

async function renderProjects() {
  const projects = state.projectListMode === "archive" ? state.archivedProjects : state.projects;
  qs("#projectListTitle").textContent = state.projectListMode === "archive" ? "Архив объектов" : "Список объектов";
  qsa("[data-project-list]").forEach((button) => button.classList.toggle("active", button.dataset.projectList === state.projectListMode));
  qs("#projectRows").innerHTML = projects.length
    ? projects
        .map(
          (project) => `
          <div class="row clickable" data-open-project="${project.id}">
            <div class="row-grid project-list-card">
              <div class="project-card-main">
                <strong>${project.title}</strong>
                <div class="muted">${project.customer_name || ""}</div>
              </div>
              <div class="project-card-badges">
                ${pill(label(project.status), project.status === "revision_requested" ? "danger" : project.status === "submitted_to_construction" ? "warning" : "blue")}
                ${state.projectListMode === "archive" ? pill(project.archive_reason || "архив", "success") : canViewFinancials() ? pill(`Смета: ${money(project.main_estimate_amount)}`, "success") : ""}
              </div>
              <div class="project-meta-line">
                <span>${state.projectListMode === "archive" ? project.archived_at || "без даты" : `Прораб: ${project.foreman_name || "не назначен"}`}</span>
                ${mapLink(project.address, project.navigator_url, "Я.Карты")}
              </div>
            </div>
          </div>`
        )
        .join("")
    : `<p class="muted">${state.projectListMode === "archive" ? "В архиве пока пусто." : "Объектов пока нет."}</p>`;
  if (state.selectedProjectId) await renderProjectDetail(state.selectedProjectId);
}

async function renderProjectDetail(projectId) {
  const project = await api(`/api/projects/${projectId}`);
  state.selectedProjectId = project.id;
  const docs = visibleDocuments(project.documents || []);
  const tabs = projectTabs();
  if (!tabs.includes(state.selectedProjectTab)) state.selectedProjectTab = tabs[0] || "overview";
  const overviewHtml = canViewFinancials()
    ? `
      <div class="detail-grid">
        <div class="info"><span>Основная смета</span><strong>${money(project.main_estimate_amount)}</strong></div>
        <div class="info"><span>Допработы</span><strong>${money(project.approved_variations_amount)}</strong></div>
        <div class="info"><span>Сверхбюджет без решения</span><strong>${money(project.unresolved_overbudget_amount)}</strong></div>
        <div class="info"><span>Срок</span><strong>${project.planned_end_date || "не задан"}</strong></div>
      </div>`
    : `
      <div class="detail-grid">
        <div class="info"><span>Статус</span><strong>${label(project.status)}</strong></div>
        <div class="info"><span>Срок</span><strong>${project.planned_end_date || "не задан"}</strong></div>
        <div class="info"><span>Прораб</span><strong>${project.foreman_name || "не назначен"}</strong></div>
        <div class="info"><span>Технадзор</span><strong>${project.tech_supervisor_name || "не назначен"}</strong></div>
      </div>`;
  const tabData = {
    overview: overviewHtml,
    tasks: renderSmallList(project.tasks, (task) => `${task.title} · ${label(task.status)} · ${task.due_date || "без срока"}`),
    materials: `<p class="muted compact-note">Материалы здесь берутся только из файла материалов Сметтера и заявок. Файл “Задание на работы” сюда не попадает.</p>` + renderSmallList(
      project.materials,
      (item) =>
        `${item.title} · ${item.requested_quantity || item.estimated_quantity || 0} ${item.requested_unit || item.estimate_material_unit || ""} · ${label(item.procurement_status)} · желаемая доставка: ${item.needed_at || "не указана"}${
          item.actual_delivery_date ? ` · фактическая: ${item.actual_delivery_date}` : ""
        }${item.procurement_comment ? ` · комментарий снабжения: ${item.procurement_comment}` : ""}`
    ),
    works: `<p class="muted compact-note">Работы здесь берутся только из файла “Задание на работы”. Материалы из нижней части этого файла игнорируются.</p>` + renderSmallList(
      [...(project.works || []).map((item) => ({ ...item, kind: "plan" })), ...(project.extra_works || []).map((item) => ({ ...item, kind: "extra" }))],
      (item) =>
        item.kind === "extra"
          ? `${item.title} · ${item.quantity || 0} ${item.unit || ""} · ${workReasonLabel(item.reason)}`
          : `${item.title} · ${item.estimated_quantity || 0} ${item.unit || ""} · ${money(item.total_price)}`
    ),
    variations: canViewFinancials() ? renderSmallList(project.variations, (item) => `${item.title} · ${variationType(item.type)} · ${money(item.amount)} · ${moneyDecision(item.financial_decision)}`) : `<p class="muted">Финансовые отклонения доступны руководителям и сметчикам.</p>`,
    documents: renderGroupedProjectDocuments(docs, project.contracts || []),
    events: renderSmallList(project.events, (event) => `${event.text}`),
  };
  const detailBlocks = [
    [
      "sections",
      `<div class="tabs">
        ${tabs
          .map((tab) => `<button class="tab ${state.selectedProjectTab === tab ? "active" : ""}" data-project-tab="${tab}">${tabTitle(tab)}</button>`)
          .join("")}
      </div>
      <div>${tabData[state.selectedProjectTab]}</div>`,
    ],
    ["edit", renderProjectEditPanel(project)],
    ["workflow", renderProjectWorkflow(project)],
    ["documents", renderDocumentSummary(docs, project.contracts || [])],
  ];
  qs("#projectDetail").innerHTML = `
    <div class="stack-line"><h2>${project.title}</h2>${pill(label(project.status), "blue")}</div>
    <div class="muted">Клиент: ${project.customer_name || "не указан"} · договоров/объектов в истории: ${project.customer_projects_count || 1}</div>
    <div class="project-detail-map">${mapLink(project.address, project.navigator_url, "Я.Карты")}<span class="muted">${project.address ? "Адрес объекта" : "Адрес не указан"}</span></div>
    <div class="stack-line">
      ${pill(`Прораб: ${project.foreman_name || "не назначен"}`)}
      ${pill(`Сметчик: ${project.estimator_name || "не назначен"}`)}
      ${pill(`Снабжение: ${project.procurement_name || "не назначено"}`)}
      ${pill(`Технадзор: ${project.tech_supervisor_name || "не назначен"}`)}
      ${canViewExternalRefs() ? externalRefLink(project.smetter_ref, project.smetter_ref ? "Открыть Сметтер" : "Сметтер не указан", "success") : ""}
    </div>
    <div class="project-detail-blocks sortable-zone" data-sortable-zone="project-detail-v2">
      ${detailBlocks.map(([key, html]) => `<div class="project-detail-block" data-sortable-block="${key}">${html}</div>`).join("")}
    </div>
  `;
  initSortableZones(qs("#projectDetail"));
}

function renderProjectEditPanel(project) {
  if (!canEditProject()) {
    return `<section class="workflow-panel subtle"><p class="muted">Текущая роль: ${roleLabel(state.currentRole)}. Редактирование карточки доступно ген.директору, менеджеру и руководителю строительства.</p></section>`;
  }
  return `
    <section class="workflow-panel compact-workflow">
      <div class="stack-line">
        <h3>Карточка объекта</h3>
        ${pill(`Доступ: ${roleLabel(state.currentRole)}`, "success")}
      </div>
      <div class="form-actions">
        <span class="muted">Основные данные и файлы меняются в отдельном окне.</span>
        <button class="secondary" data-edit-project="${project.id}">Редактировать</button>
      </div>
    </section>`;
}

function renderProjectWorkflow(project) {
  if (project.status === "archived") {
    const restoreButton = canArchiveProject()
      ? `<button class="primary" data-project-action="restore" data-project-id="${project.id}">Вернуть в работу</button>`
      : "";
    const deleteButton = canDeleteForever()
      ? `<button class="danger-button" data-project-action="delete" data-project-id="${project.id}">Удалить навсегда</button>`
      : "";
    return `
      <section class="workflow-panel">
        <div class="stack-line"><h3>Архив</h3>${pill("Объект скрыт из работы", "blue")}</div>
        <p class="muted">Причина: ${project.archive_reason || "не указана"}</p>
        <div class="form-actions">
          ${restoreButton}
          ${deleteButton}
        </div>
        ${canDeleteForever() ? `<p class="muted">Полное удаление доступно только роли “Ген.директор” и только из архива.</p>` : ""}
      </section>`;
  }

  if (project.status === "draft" || project.status === "revision_requested") {
    return `
      <section class="workflow-panel">
        <div class="stack-line"><h3>Передача объекта</h3>${pill(project.status === "revision_requested" ? "Нужна доработка" : "Черновик", project.status === "revision_requested" ? "danger" : "warning")}</div>
        ${project.workflow_comment ? `<p class="muted">Комментарий руководителя строительства: ${project.workflow_comment}</p>` : ""}
        ${project.status === "revision_requested" ? `<label>Что исправлено перед повторной передачей <textarea id="submitFixComment" rows="2" placeholder="Например: добавил договор и проектную документацию"></textarea></label>` : ""}
        <div class="form-actions">
          <span class="muted">После проверки заполнения менеджер передает объект руководителю строительства.</span>
          ${canSubmitProject() ? `<button class="primary" data-project-action="submit" data-project-id="${project.id}">Передать в работу</button>` : `<span class="muted">Передать объект может менеджер или ген.директор.</span>`}
        </div>
      </section>`;
  }

  if (project.status === "submitted_to_construction") {
    if (!canAcceptProject()) {
      return `
        <section class="workflow-panel">
          <div class="stack-line"><h3>Проверка руководителем строительства</h3>${pill("Ожидает решения", "warning")}</div>
          <p class="muted">Принять объект в работу или вернуть менеджеру может только руководитель строительства или ген.директор.</p>
        </section>`;
    }
    return `
      <section class="workflow-panel">
        <div class="stack-line"><h3>Проверка руководителем строительства</h3>${pill("Ожидает решения", "warning")}</div>
        <div class="grid-2">
          <label>Прораб <select id="acceptForeman">${userOptionsByRole("foreman")}</select></label>
          <label>Сметчик <select id="acceptEstimator">${userOptionsByRole("estimator")}</select></label>
        </div>
        <div class="grid-2">
          <label>Снабжение <select id="acceptProcurement">${userOptionsByRole("procurement_manager")}</select></label>
          <label>Технадзор <select id="acceptTech">${userOptionsByRole("technical_supervisor")}</select></label>
        </div>
        <label>Комментарий при возврате <textarea id="returnComment" rows="2" placeholder="Что менеджеру нужно исправить"></textarea></label>
        <div class="form-actions">
          <button class="secondary" data-project-action="return" data-project-id="${project.id}">Вернуть на доработку</button>
          <button class="primary" data-project-action="accept" data-project-id="${project.id}">Принять в работу</button>
        </div>
      </section>`;
  }

  return `
    <section class="workflow-panel">
      <div class="stack-line"><h3>Объект в работе</h3>${pill("Ответственные назначены", "success")}</div>
      <p class="muted">После принятия уведомления получают прораб, снабжение, сметчик и технадзор.</p>
      ${
        canAcceptProject()
          ? `<div class="grid-2">
              <label>Прораб <select id="assignForeman">${userOptionsByRole("foreman", { includeEmpty: true, selectedId: project.foreman_id })}</select></label>
              <label>Сметчик <select id="assignEstimator">${userOptionsByRole("estimator", { includeEmpty: true, selectedId: project.estimator_id })}</select></label>
            </div>
            <div class="grid-2">
              <label>Снабжение <select id="assignProcurement">${userOptionsByRole("procurement_manager", { includeEmpty: true, selectedId: project.procurement_manager_id })}</select></label>
              <label>Технадзор <select id="assignTech">${userOptionsByRole("technical_supervisor", { includeEmpty: true, selectedId: project.tech_supervisor_id })}</select></label>
            </div>
            <button class="secondary" data-project-action="assign" data-project-id="${project.id}">Сохранить ответственных</button>`
          : ""
      }
      ${canArchiveProject() ? `<button class="secondary" data-project-action="archive" data-project-id="${project.id}">Отправить в архив</button>` : ""}
    </section>`;
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
  const cleaned = String(value)
    .replace(/\s/g, "")
    .replace(/₽|руб\.?/gi, "")
    .replace(/[^0-9,.-]/g, "");
  if (cleaned.includes(",") && cleaned.includes(".")) {
    return Number(cleaned.replace(/\./g, "").replace(",", ".")) || 0;
  }
  return Number(cleaned.replace(",", ".")) || 0;
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

async function fileDocumentPayload(file, title, type, relatedType = "handover") {
  if (!file) return null;
  return {
    title,
    type,
    related_type: relatedType,
    file_name: file.name,
    mime_type: file.type || "",
    file_base64: await fileToBase64(file),
  };
}

async function projectFormToJson(form) {
  const data = formToJson(form);
  const files = form.elements;
  const materialFile = files.estimate_file_name.files[0];
  const workTaskFile = files.work_task_file.files[0];
  data.estimate_file_name = materialFile?.name || form.dataset.existingEstimateFileName || "";
  data.work_task_file_name = workTaskFile?.name || form.dataset.existingWorkTaskFileName || "";
  data.initial_documents = (
    await Promise.all([
      fileDocumentPayload(materialFile, "Файл материалов из Сметтера", "smetter_materials"),
      fileDocumentPayload(workTaskFile, "Задание на работы из Сметтера", "smetter_work_task"),
      fileDocumentPayload(files.contract_file.files[0], "Договор", "contract"),
      fileDocumentPayload(files.estimate_doc_file.files[0], "Смета", "main_estimate"),
      fileDocumentPayload(files.project_docs_file.files[0], "Проектная документация", "project_documentation"),
    ])
  ).filter(Boolean);
  return data;
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
    works: "Работы",
    materials: "Материалы",
    variations: "Допработы",
    documents: "Документы",
    events: "История",
  }[tab];
}

async function renderTasks() {
  const allTasks = visibleTasksForRole(await api("/api/tasks"));
  state.lastTasks = allTasks;
  const grouped = allTasks.reduce((acc, task) => {
    acc[task.project_id] = acc[task.project_id] || {
      id: task.project_id,
      title: task.project_title,
      foremanId: task.project_foreman_id,
      tasks: [],
    };
    acc[task.project_id].tasks.push(task);
    return acc;
  }, {});
  if (currentRoleBase() === "foreman") {
    const userId = currentUserId();
    state.projects
      .filter((project) => project.foreman_id === userId)
      .forEach((project) => {
        grouped[project.id] = grouped[project.id] || {
          id: project.id,
          title: project.title,
          foremanId: project.foreman_id,
          tasks: [],
        };
      });
  }
  const taskProjects = Object.values(grouped).sort((a, b) => a.title.localeCompare(b.title, "ru"));
  if (!state.selectedTaskProjectId && taskProjects.length) state.selectedTaskProjectId = taskProjects[0].id;
  if (state.selectedTaskProjectId && !grouped[state.selectedTaskProjectId] && taskProjects.length) state.selectedTaskProjectId = taskProjects[0].id;
  if (!taskProjects.length) state.selectedTaskProjectId = null;
  const selectedGroup = grouped[state.selectedTaskProjectId] || null;
  const tasks = selectedGroup ? selectedGroup.tasks : [];
  qs("#taskProjectRows").innerHTML = taskProjects.length
    ? taskProjects
        .map((project) => {
          const stats = taskStats(project.tasks);
          const newCount = project.tasks.filter((task) => ["new", "returned", "completed_pending_acceptance"].includes(task.status)).length;
          return `
            <button class="row clickable task-project-row ${state.selectedTaskProjectId === project.id ? "active" : ""}" data-task-project="${project.id}">
              <div class="stack-line"><strong>${project.title}</strong>${newCount ? pill(`${newCount} требует внимания`, "warning") : ""}</div>
              <div class="muted">Задач: ${project.tasks.length} · в работе: ${stats.active} · на доработке: ${stats.returned} · не принято: ${stats.waiting}</div>
            </button>`;
        })
        .join("")
    : `<p class="muted">${currentRoleBase() === "foreman" ? "За этим прорабом пока нет объектов с задачами." : "Задач пока нет."}</p>`;
  qs("#taskStats").innerHTML =
    renderTaskStats(tasks) +
    `<p class="muted task-status-help">Не принято / ждет приемки — исполнитель отметил выполнение, но проверяющий еще не принял. На доработке — проверяющий вернул задачу исполнителю с комментарием и новым сроком.</p>`;
  const visibleTasks = tasks.filter((task) => taskMatchesFilter(task, state.taskFilter));
  qs("#taskRows").innerHTML = visibleTasks.length
    ? visibleTasks
        .map((task) => {
          const canComplete = task.status !== "accepted" && task.status !== "completed_pending_acceptance" && (canActAsTaskUser(task, "assignee") || ["owner", "construction_manager", "finance_director"].includes(currentRoleBase()));
          const canReview = task.status === "completed_pending_acceptance" && (["owner", "construction_manager", "finance_director"].includes(currentRoleBase()) || canActAsTaskUser(task, "reviewer"));
          return `
            <article class="row task-row">
              <div class="row-grid">
                <div class="task-main">
                  <button class="link-button task-title-button" type="button" data-open-task="${task.id}">${task.title}</button>
                  <div class="stack-line">${pill(label(task.status), taskStatusLevel(task.status))}${pill(task.due_date || "без срока", levelByDate(task.due_date))}</div>
                  <div class="muted">${task.project_title} · поставил: ${task.creator_name || "не указано"} · создана: ${formatDateRu(task.created_at)}</div>
                  ${task.description ? `<div>${task.description}</div>` : ""}
                  ${task.rejection_comment ? `<div class="muted">Комментарий по возврату: ${task.rejection_comment}</div>` : ""}
                </div>
                <div class="task-people">Ответственный: ${task.assignee_name || "не назначен"}<br /><span class="muted">Принимает: ${task.reviewer_name || task.creator_name || "не назначен"}</span></div>
              </div>
              <div class="task-actions">
                ${canComplete ? `<button class="secondary" data-task-action="complete" data-task-id="${task.id}">Выполнено</button>` : ""}
                ${canReview ? `<button class="primary" data-task-action="accept" data-task-id="${task.id}">Принять</button><button class="secondary" data-task-action="return" data-task-id="${task.id}">Вернуть</button>` : ""}
                ${canDeleteTask(task) ? `<button class="danger-button" data-task-action="delete" data-task-id="${task.id}">Удалить</button>` : ""}
              </div>
            </article>`;
        })
        .join("")
    : `<p class="muted">${tasks.length ? "В этом фильтре задач нет." : "Задач пока нет."}</p>`;
}

function workProjectId() {
  const selected = state.selectedWorkProjectId || qs('#workProjectForm select[name="project_id"]')?.value || state.selectedProjectId || state.projects[0]?.id || "";
  if (!selected) return "";
  const exists = state.projects.some((project) => Number(project.id) === Number(selected));
  return exists ? selected : state.projects[0]?.id || "";
}

function buildWorkTree(works) {
  return works.reduce((acc, row) => {
    const parts = String(row.section || "Без раздела").split(" / ").filter(Boolean);
    const stage = parts[0] || "Без раздела";
    const group = parts.slice(1).join(" / ") || "Работы";
    acc[stage] = acc[stage] || { total: 0, groups: {} };
    acc[stage].total += 1;
    acc[stage].groups[group] = acc[stage].groups[group] || [];
    acc[stage].groups[group].push(row);
    return acc;
  }, {});
}

function fillWorkExtraSectionSelect(works) {
  const select = qs('#workExtraForm select[name="estimate_section"]');
  if (!select) return;
  const sections = [...new Set(works.map((row) => row.section).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  const current = select.value;
  select.innerHTML =
    `<option value="">Без привязки к разделу</option>` +
    sections.map((section) => `<option value="${escapeAttr(section)}">${section}</option>`).join("");
  if (sections.includes(current)) select.value = current;
}

function taskTimeline(task) {
  const actionTitle = {
    create: "Поставлена",
    complete: "Выполнена исполнителем",
    accept: "Принята",
    return: "Возвращена на доработку",
    delete: "Удалена",
  };
  const rows = task.events?.length
    ? task.events.map((event) => [
        actionTitle[event.action] || event.action,
        event.created_at,
        [event.actor_name, event.comment, event.due_date ? `срок: ${formatDateRu(event.due_date)}` : ""].filter(Boolean).join(" · "),
      ])
    : [
        ["Поставлена", task.created_at, task.creator_name || "автор не указан"],
        ["Выполнена исполнителем", task.completed_at, task.assignee_name || "исполнитель не указан"],
        ["Принята", task.accepted_at, task.reviewer_name || task.creator_name || "принимающий не указан"],
      ].filter(([, date]) => date);
  if (!task.events?.length && task.status === "returned" && task.rejection_comment) {
    rows.push(["Возвращена на доработку", task.updated_at, task.rejection_comment]);
  }
  return rows.length
    ? `<div class="task-timeline">${rows
        .map(
          ([title, date, note]) => `
          <div class="task-timeline-item">
            <strong>${title}</strong>
            <span>${formatDateRu(date)}</span>
            <p class="muted">${note}</p>
          </div>`
        )
        .join("")}</div>`
    : `<p class="muted">Истории по задаче пока нет.</p>`;
}

function openTaskDetail(taskId) {
  const task = state.lastTasks.find((item) => Number(item.id) === Number(taskId));
  if (!task) {
    showToast("Задача не найдена");
    return;
  }
  qs("#taskDetailTitle").textContent = task.title || "Задача";
  qs("#taskDetailContent").innerHTML = `
    <section class="workflow-panel compact-workflow">
      <div class="stack-line">
        <h3>${task.project_title || "Объект не указан"}</h3>
        ${pill(label(task.status), taskStatusLevel(task.status))}
        ${pill(task.due_date || "без срока", levelByDate(task.due_date))}
      </div>
      <div class="task-detail-grid">
        <div><span class="muted">Поставил</span><strong>${task.creator_name || "не указано"}</strong></div>
        <div><span class="muted">Исполнитель</span><strong>${task.assignee_name || "не назначен"}</strong></div>
        <div><span class="muted">Принимает</span><strong>${task.reviewer_name || task.creator_name || "не назначен"}</strong></div>
        <div><span class="muted">Дата постановки</span><strong>${formatDateRu(task.created_at)}</strong></div>
      </div>
      ${task.description ? `<p class="preserve-lines">${task.description}</p>` : ""}
      ${task.rejection_comment ? `<div class="hint-box warning"><strong>Причина возврата / непринятия</strong><p>${task.rejection_comment}</p></div>` : ""}
    </section>
    <section class="workflow-panel">
      <h3>История задачи</h3>
      ${taskTimeline(task)}
    </section>`;
  qs("#taskDetailDialog").showModal();
}

function isWorkStageOpen(projectId, stage) {
  return Boolean(state.openWorkStages[String(projectId)]?.[stage]);
}

function setWorkStageOpen(projectId, stage, isOpen) {
  const projectKey = String(projectId);
  state.openWorkStages[projectKey] = state.openWorkStages[projectKey] || {};
  if (isOpen) {
    state.openWorkStages[projectKey][stage] = true;
  } else {
    delete state.openWorkStages[projectKey][stage];
  }
}

async function renderWorks() {
  const projectId = workProjectId();
  if (projectId) state.selectedWorkProjectId = Number(projectId);
  const workSelect = qs('#workProjectForm select[name="project_id"]');
  if (workSelect && projectId) workSelect.value = String(projectId);
  const extraSelect = qs('#workExtraForm select[name="project_id"]');
  if (extraSelect && projectId) extraSelect.value = String(projectId);
  if (!projectId) {
    qs("#workRows").innerHTML = `<p class="muted">Сначала создайте объект.</p>`;
    qs("#workExtraRows").innerHTML = "";
    return;
  }
  const [works, extraWorks] = await Promise.all([
    api(`/api/work-items?project_id=${projectId}`),
    api(`/api/work-extra-items?project_id=${projectId}`),
  ]);
  fillWorkExtraSectionSelect(works);
  const project = state.projects.find((item) => Number(item.id) === Number(projectId));
  const fileNote = project?.work_task_file_name
    ? `<p class="muted">Файл задания: ${project.work_task_file_name} · загружено работ: ${works.length}</p>`
    : `<p class="muted">Файл задания на работы по этому объекту еще не загружен.</p>`;
  const workTree = buildWorkTree(works);
  qs("#workRows").innerHTML =
    `<div class="work-file-note">${fileNote}</div>` +
    (works.length
      ? Object.entries(workTree)
        .map(
          ([stage, stageData]) => `
          <details class="estimate-section work-stage" data-work-stage="${escapeAttr(stage)}" ${isWorkStageOpen(projectId, stage) ? "open" : ""}>
            <summary>
              <span class="work-section-title">
                <strong>${stage}</strong>
              </span>
              <span class="work-section-count">${stageData.total}</span>
            </summary>
            <div class="work-groups">
              ${Object.entries(stageData.groups)
                .map(([group, rows]) => `
                  <section class="work-group">
                    <div class="work-group-head">
                      <strong>${group}</strong>
                      <span>${rows.length}</span>
                    </div>
                    <div class="table work-items">
                      ${rows
                        .map(
                          (row) => `
                          <div class="row estimate-material-row work-row">
                            <div class="material-main">
                              <strong>${row.title}</strong>
                            </div>
                            <div class="work-row-meta">
                              <span>${row.estimated_quantity || 0} ${row.unit || ""}</span>
                              <span>${money(row.unit_price)}</span>
                              <strong>${money(row.total_price)}</strong>
                            </div>
                          </div>`
                        )
                        .join("")}
                    </div>
                  </section>`
                )
                .join("")}
            </div>
          </details>`
        )
        .join("")
      : `<p class="muted">Список работ пока пуст. Если файл уже выбран и сохранен, значит программа не распознала строки в этой выгрузке.</p>`);

  qs("#workExtraRows").innerHTML = extraWorks.length
    ? extraWorks
        .map(
          (row) => `
          <div class="row estimate-material-row">
            <div class="material-main">
              <strong>${row.title}</strong>
              <div class="muted">${row.project_title || ""} · ${row.estimate_section || "без раздела"} · ${row.creator_name || "автор не указан"}</div>
              ${row.comment ? `<div class="muted">${row.comment}</div>` : ""}
            </div>
            <div class="stack-line">
              ${pill(`${row.quantity || 0} ${row.unit || ""}`, "blue")}
              ${pill(workReasonLabel(row.reason), row.reason === "company_cost" || row.reason === "rework" ? "danger" : "warning")}
            </div>
          </div>`
        )
        .join("")
    : `<p class="muted">Появившихся работ по объекту пока нет.</p>`;
}

async function renderLocations() {
  const payload = await api("/api/locations");
  const projects = payload.projects || [];
  const suppliers = payload.suppliers || [];
  qs("#objectLocationRows").innerHTML = projects.length
    ? projects
        .map(
          (project) => `
          <div class="row location-row">
            <div>
              <strong>${project.title}</strong>
              <div class="muted">${project.customer_name || ""}</div>
              <div class="muted">${project.address || "Адрес не указан"}</div>
            </div>
            ${mapLink(project.address, project.navigator_url)}
          </div>`
        )
        .join("")
    : `<p class="muted">Активных объектов пока нет.</p>`;

  qs("#supplierLocationRows").innerHTML = suppliers.length
    ? suppliers
        .map(
          (supplier) => `
          <div class="row location-row">
            <div>
              <strong>${supplier.title}</strong>
              <div class="muted">${supplier.address || "Адрес не указан"}</div>
              ${supplier.comment ? `<div class="muted">${supplier.comment}</div>` : ""}
            </div>
            ${mapLink(supplier.address, supplier.maps_url)}
          </div>`
        )
        .join("")
    : `<p class="muted">Локации поставщиков пока не добавлены.</p>`;
}

async function renderMaterials() {
  qsa("[data-material-list-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.materialListMode === state.materialListMode);
  });
  const exportButton = qs("#exportCompletedMaterialsButton");
  if (exportButton) exportButton.hidden = !["owner", "construction_manager", "finance_director", "accountant", "procurement_manager"].includes(currentRoleBase());
  const items = await api(`/api/material-requests?archive=${state.materialListMode === "archive" ? "1" : "0"}`);
  state.materialRequests = items;
  const visibleItems =
    currentRoleBase() === "foreman"
      ? items.filter((item) => Number(item.project_foreman_id) === Number(currentUserId()) || Number(item.creator_id) === Number(currentUserId()))
      : items;
  const batches = buildMaterialBatches(visibleItems);
  const renderBatchCard = (batch) => `
      <button class="row clickable material-request-row material-batch-row" type="button" data-open-material-batch="${batch.key}">
        <div class="material-main">
          <strong>${materialBatchTitle(batch, currentRoleBase() === "procurement_manager")}</strong>
          <div class="muted">Объект: ${batch.project_title || "не указан"} · создал: ${batch.creator_name || "не указано"}</div>
          <div class="muted">Позиций: ${batch.items.length} · желаемая доставка: ${batch.needed_at || "не указана"} · сумма: ${money(batch.total_amount)}</div>
          ${batch.revision_comment ? `<div class="muted">Комментарий по доработке: ${batch.revision_comment}</div>` : ""}
          ${state.materialListMode === "archive" && batch.archived_at ? `<div class="muted">В архиве с ${formatDateRu(batch.archived_at)}</div>` : ""}
        </div>
        <div class="stack-line">
          ${pill(urgencyLabel(batch.delivery_urgency), urgencyLevel(batch.delivery_urgency))}
          ${pill(label(batch.status), materialBatchLevel(batch.status))}
        </div>
      </button>`;
  if (!batches.length) {
    qs("#materialRows").innerHTML = `<p class="muted">${state.materialListMode === "archive" ? "В архиве заявок пока нет." : currentRoleBase() === "foreman" ? "По объектам этого прораба заявок пока нет. Нажмите “Добавить заявку”, чтобы заказать материалы." : "Заявок на материалы пока нет."}</p>`;
    return;
  }
  if (state.materialListMode === "archive") {
    const grouped = batches.reduce((acc, batch) => {
      const title = batch.project_title || "Объект не указан";
      acc[title] = acc[title] || [];
      acc[title].push(batch);
      return acc;
    }, {});
    qs("#materialRows").innerHTML = Object.entries(grouped)
      .map(
        ([projectTitle, projectBatches]) => `
        <section class="material-archive-group">
          <h3>${projectTitle}</h3>
          <div class="table">${projectBatches.map(renderBatchCard).join("")}</div>
        </section>`
      )
      .join("");
    return;
  }
  qs("#materialRows").innerHTML = batches.map(renderBatchCard).join("");
}

function findMaterialBatch(batchKey) {
  return buildMaterialBatches(state.materialRequests).find((batch) => batch.key === batchKey);
}

async function openMaterialBatchDialog(batchKey) {
  if (!state.materialRequests.length) {
    state.materialRequests = await api(`/api/material-requests?archive=${state.materialListMode === "archive" ? "1" : "0"}`);
  }
  const batch = findMaterialBatch(batchKey);
  if (!batch) {
    showToast("Заявка не найдена");
    return;
  }
  qs("#materialReviewTitle").textContent = materialBatchTitle(batch, currentRoleBase() === "procurement_manager");
  const canReview = currentRoleBase() === "procurement_manager" && batch.id && ["new", "revision_requested"].includes(batch.status);
  const canSchedule = currentRoleBase() === "procurement_manager" && batch.id && ["in_work", "delivery_scheduled"].includes(batch.status);
  const canResolveIssue = currentRoleBase() === "procurement_manager" && batch.id && batch.status === "receipt_issue";
  const canEdit = canEditMaterialBatch(batch);
  const canCreateVariation = canCreateVariationFromBatch(batch);
  const canReceive = currentRoleBase() === "foreman" && batch.id && batch.status === "delivery_scheduled" && Number(batch.project_foreman_id) === Number(currentUserId());
  qs("#materialReviewContent").innerHTML = `
    <section class="workflow-panel compact-workflow">
      <div class="stack-line">
        <h3>${batch.project_title || "Объект не указан"}</h3>
        ${pill(urgencyLabel(batch.delivery_urgency), urgencyLevel(batch.delivery_urgency))}
        ${pill(label(batch.status), materialBatchLevel(batch.status))}
      </div>
      <p class="muted">Создал: ${batch.creator_name || "не указано"} · желаемая доставка: ${batch.needed_at || "не указана"} · позиций: ${batch.items.length}</p>
      ${batch.comment ? `<p>${batch.comment}</p>` : ""}
      ${batch.revision_comment ? `<p class="muted">Комментарий по доработке: ${batch.revision_comment}</p>` : ""}
      ${batch.foreman_response ? `<p class="muted">Ответ прораба: ${batch.foreman_response}</p>` : ""}
      ${batch.scheduled_delivery_date ? `<p class="muted">Назначенная доставка: ${formatDateRu(batch.scheduled_delivery_date)}</p>` : ""}
      ${batch.procurement_comment ? `<p class="muted">Комментарий снабжения: ${batch.procurement_comment}</p>` : ""}
      ${batch.receipt_comment ? `<p class="muted">Приемка: ${batch.receipt_comment}</p>` : ""}
      ${batch.variation_id ? `<p class="muted">Связана с допработой: ${batch.variation_title || `#${batch.variation_id}`} · ${label(batch.variation_status)}</p>` : ""}
      ${materialReceiptAttachment(batch)}
    </section>
    <div class="table material-review-items">
      ${batch.items
        .map(
          (item) => `
          <div class="row estimate-material-row">
            <div class="material-main">
              <strong>${item.title}</strong>
              <div class="muted">${item.estimate_section || "без раздела"}</div>
              ${item.comment ? `<div class="muted">${item.comment}</div>` : ""}
            </div>
            <div class="stack-line">
              ${pill(`${item.requested_quantity || item.estimated_quantity || 0} ${item.requested_unit || item.estimate_material_unit || ""}`, "blue")}
              ${pill(materialBasisLabel(item.basis_type), materialBasisLevel(item.basis_type))}
              ${pill(money(item.total_amount), "success")}
            </div>
          </div>`
        )
        .join("")}
    </div>
    ${
      canCreateVariation
        ? `<section class="workflow-panel">
            <h3>Допработа / отклонение</h3>
            <p class="muted">В заявке есть позиции сверх основной сметы. Можно создать связанную запись в разделе “Допработы”, чтобы решить, кто оплачивает и как оформляем.</p>
            <div class="form-actions">
              <button class="primary" type="button" data-material-batch-action="create_variation" data-material-batch-id="${batch.id}">Создать допработу</button>
            </div>
          </section>`
        : ""
    }
    ${
      canReview
        ? `<section class="workflow-panel">
            <h3>Решение снабжения</h3>
            <label>Комментарий при возврате <textarea id="materialBatchReturnComment" rows="3" placeholder="Например: не понятно количество, уточните позицию"></textarea></label>
            <div class="form-actions">
              <button class="primary" type="button" data-material-batch-action="accept" data-material-batch-id="${batch.id}">Принять в работу</button>
              <button class="secondary" type="button" data-material-batch-action="return" data-material-batch-id="${batch.id}">Вернуть на доработку</button>
            </div>
          </section>`
        : ""
    }
    ${
      canSchedule
        ? `<section class="workflow-panel">
            <h3>Доставка</h3>
            <label>Дата доставки <input id="materialBatchDeliveryDate" type="date" value="${batch.scheduled_delivery_date || batch.needed_at || ""}" /></label>
            <label>Комментарий снабжения <textarea id="materialBatchScheduleComment" rows="3" placeholder="Например: нужна доверенность или кран">${batch.procurement_comment || ""}</textarea></label>
            <div class="form-actions">
              <button class="primary" type="button" data-material-batch-action="schedule" data-material-batch-id="${batch.id}">Уведомить о доставке</button>
            </div>
          </section>`
        : ""
    }
    ${
      canResolveIssue
        ? `<section class="workflow-panel">
            <h3>Исправление проблемы</h3>
            <p class="muted">Укажите, когда будет повторная доставка, замена или довоз материала. Прораб и руководители получат уведомление.</p>
            <label>Дата повторной доставки <input id="materialBatchResolveDate" type="date" value="${batch.scheduled_delivery_date || ""}" /></label>
            <label>Комментарий снабжения <textarea id="materialBatchResolveComment" rows="3" placeholder="Например: заменили позицию, довезем недостающий материал, поставщик подтвердил замену"></textarea></label>
            <div class="form-actions">
              <button class="primary" type="button" data-material-batch-action="resolve_issue" data-material-batch-id="${batch.id}">Уведомить о повторной доставке</button>
            </div>
          </section>`
        : ""
    }
    ${
      canEdit
        ? renderMaterialBatchEditSection(batch)
        : ""
    }
    ${
      canReceive
        ? `<section class="workflow-panel">
            <h3>Приемка материалов</h3>
            <label>Если есть проблема <textarea id="materialBatchReceiptComment" rows="3" placeholder="Что именно не так: не довезли, повреждено, не тот материал"></textarea></label>
            <label>Фото или видео <input id="materialBatchReceiptFile" type="file" accept="image/*,video/*" /></label>
            <div class="form-actions">
              <button class="primary" type="button" data-material-batch-action="receive" data-receipt-status="received" data-material-batch-id="${batch.id}">Материал получен по списку</button>
              <button class="secondary" type="button" data-material-batch-action="receive" data-receipt-status="issue" data-material-batch-id="${batch.id}">Есть проблема</button>
            </div>
          </section>`
        : ""
    }
  `;
  qs("#materialReviewDialog").showModal();
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

function variationStatusLevel(status) {
  return {
    decision_required: "danger",
    in_review: "warning",
    approved: "success",
    rejected: "",
  }[status] || "blue";
}

async function renderVariations() {
  const rows = await api("/api/variations");
  qs("#variationRows").innerHTML = rows.length
    ? rows
        .map(
          (row) => `
          <button class="row clickable variation-row" type="button" data-open-variation="${row.id}">
            <div class="row-grid">
              <div>
                <strong>${row.title}</strong>
                <div class="muted">${row.project_title} · ${variationType(row.type)}${row.estimate_section ? ` · ${row.estimate_section}` : ""}${row.source_type === "material_request_batch" ? ` · из заявки материалов #${row.source_id}` : ""}</div>
              </div>
              ${pill(label(row.status), variationStatusLevel(row.status))}
              ${pill(money(row.amount), row.financial_decision === "not_decided" ? "danger" : "warning")}
              <div>${moneyDecision(row.financial_decision)}</div>
              ${pill(row.due_date || "без срока", levelByDate(row.due_date))}
            </div>
          </button>`
        )
        .join("")
    : `<p class="muted">Допработ и отклонений пока нет.</p>`;
}

async function openVariationDialog(variationId) {
  const variation = await api(`/api/variations/${variationId}`);
  qs("#variationDetailTitle").textContent = variation.title || "Допработа";
  const materials = variation.materials || [];
  qs("#variationDetailContent").innerHTML = `
    <section class="workflow-panel compact-workflow">
      <div class="stack-line">
        <h3>${variation.project_title || "Объект не указан"}</h3>
        ${pill(variationType(variation.type), "blue")}
        ${pill(moneyDecision(variation.financial_decision), variation.financial_decision === "not_decided" ? "danger" : "warning")}
      </div>
      <p class="muted">Сумма: ${money(variation.amount)} · срок решения: ${variation.due_date || "не указан"}</p>
      ${variation.estimate_section ? `<p class="muted">Раздел / этап сметы: ${variation.estimate_section}</p>` : ""}
      <p class="muted">Статус: ${label(variation.status)} · инициатор: ${variation.requester_name || "не указан"}${variation.approver_name ? ` · решение: ${variation.approver_name}` : ""}</p>
      ${variation.source_type === "material_request_batch" ? `<p class="muted">Источник: заявка материалов #${variation.source_id}</p>` : ""}
      ${variation.description ? `<p class="preserve-lines">${variation.description}</p>` : ""}
      <div class="form-actions">
        <button class="secondary" type="button" data-export-variation="${variation.id}" ${materials.length ? "" : "disabled"}>Выгрузить Excel</button>
        ${["owner", "construction_manager", "finance_director"].includes(currentRoleBase()) && !["approved", "rejected"].includes(variation.status) ? `<button class="primary" type="button" data-variation-action="approve" data-variation-id="${variation.id}">Согласовать</button><button class="secondary" type="button" data-variation-action="reject" data-variation-id="${variation.id}">Отклонить</button>` : ""}
      </div>
    </section>
    <section class="workflow-panel">
      <h3>Материалы</h3>
      ${
        materials.length
          ? `<div class="table variation-materials">
              ${materials
                .map(
                  (item) => `
                  <div class="row estimate-material-row">
                    <div class="material-main">
                      <strong>${item.title}</strong>
                      <div class="muted">${item.estimate_section || "без раздела"}</div>
                      ${item.comment ? `<div class="muted">${item.comment}</div>` : ""}
                    </div>
                    <div class="stack-line">
                      ${pill(materialBasisLabel(item.basis_type), materialBasisLevel(item.basis_type))}
                      ${pill(`${item.requested_quantity || 0} ${item.requested_unit || item.estimate_material_unit || ""}`, "blue")}
                      ${pill(money(item.total_amount), "success")}
                    </div>
                  </div>`
                )
                .join("")}
            </div>`
          : `<p class="muted">К этой допработе пока не привязан список материалов.</p>`
      }
    </section>`;
  qs("#variationDetailDialog").showModal();
}

async function handleVariationAction(button) {
  const variationId = button.dataset.variationId;
  const action = button.dataset.variationAction;
  let payload = { actor_id: currentUserId(), actor_role: currentRoleBase() };
  if (action === "approve") {
    const decision = window.prompt("Кто оплачивает? customer / company / contractor / disputed", "customer");
    if (decision === null) return;
    const comment = window.prompt("Комментарий к решению", "Согласовано");
    if (comment === null) return;
    payload = { ...payload, financial_decision: decision.trim() || "customer", comment };
  }
  if (action === "reject") {
    const comment = window.prompt("Почему отклоняем?");
    if (comment === null) return;
    payload = { ...payload, financial_decision: "company", comment };
  }
  await api(`/api/variations/${variationId}/${action}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  await renderVariations();
  await openVariationDialog(variationId);
  showToast(action === "approve" ? "Допработа согласована" : "Допработа отклонена");
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
  const newDocumentButton = qs("#newDocumentButton");
  if (newDocumentButton) newDocumentButton.hidden = !canManageKnowledgeBase();
  const docs = await api("/api/documents?related_type=knowledge_base");
  qs("#documentCards").innerHTML = docs.length
    ? docs
        .map(
          (doc) => `
          <article class="card">
            <div class="document-card-head">
              <div class="stack-line"><strong>${documentTitle(doc)}</strong>${pill(documentType(doc.type), "blue")}${pill(label(doc.status))}</div>
              ${canDeleteKnowledgeBase() ? `<button class="danger-button tiny" type="button" data-document-action="delete" data-document-id="${doc.id}">Удалить</button>` : ""}
            </div>
            ${doc.file_path ? documentFileLink(doc) : `<div class="muted">${doc.file_name || "Файл не загружен"}</div>`}
          </article>`
        )
        .join("")
    : `<p class="muted">База знаний пока пустая. Загружайте сюда регламенты, проектные решения, узлы и общую документацию.</p>`;
}

function feedbackStatusLabel(status) {
  return {
    new: "Новое",
    in_work: "В работе",
    done: "Обработано",
  }[status] || status || "Новое";
}

function feedbackStatusLevel(status) {
  return {
    new: "warning",
    in_work: "blue",
    done: "success",
  }[status] || "";
}

function renderFeedbackAttachments(attachments = []) {
  if (!Array.isArray(attachments) || !attachments.length) return "";
  return `
    <div class="feedback-attachments">
      ${attachments
        .map((attachment, index) => {
          const url = attachment.url || attachment.payload?.url || "";
          const type = attachment.type || "file";
          const title = attachment.name || `${type} ${index + 1}`;
          if (url && type === "image") {
            return `
              <a class="feedback-attachment image" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">
                <img src="${escapeAttr(url)}" alt="${escapeAttr(title)}" loading="lazy" />
                <span>Открыть скриншот</span>
              </a>`;
          }
          if (url && type === "video") {
            const thumbnail = attachment.thumbnail_url || attachment.thumbnail?.url || "";
            return `
              <a class="feedback-attachment image" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">
                ${thumbnail ? `<img src="${escapeAttr(thumbnail)}" alt="${escapeAttr(title)}" loading="lazy" />` : ""}
                <span>Открыть видео${attachment.duration ? ` · ${attachment.duration} сек.` : ""}</span>
              </a>`;
          }
          if (url) {
            return `<a class="feedback-attachment" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>`;
          }
          return `<span class="feedback-attachment muted">${escapeHtml(title)}</span>`;
        })
        .join("")}
    </div>`;
}

async function renderFeedback() {
  const rowsNode = qs("#feedbackRows");
  const statsNode = qs("#feedbackStats");
  const bindingsPanel = qs("#maxBindingsPanel");
  const bindingsRows = qs("#maxBindingRows");
  const deleteSelectedButton = qs("#deleteSelectedFeedbackButton");
  if (!rowsNode || !statsNode) return;
  if (!canView("feedback")) {
    rowsNode.innerHTML = "";
    statsNode.innerHTML = "";
    if (bindingsPanel) bindingsPanel.hidden = true;
    if (deleteSelectedButton) deleteSelectedButton.hidden = true;
    return;
  }
  if (deleteSelectedButton) deleteSelectedButton.hidden = !canDeleteFeedback();
  renderMaxBindings(bindingsPanel, bindingsRows);
  const items = await api("/api/feedback");
  const counts = items.reduce(
    (acc, item) => {
      acc.all += 1;
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    },
    { all: 0, new: 0, in_work: 0, done: 0 }
  );
  const statItems = [
    ["all", "Все"],
    ["new", "Новые"],
    ["in_work", "В работе"],
    ["done", "Обработано"],
  ];
  statsNode.innerHTML = statItems
    .map(
      ([key, title]) => `
      <button class="task-stat ${state.feedbackFilter === key ? "active" : ""}" type="button" data-feedback-filter="${key}">
        <span>${title}</span>
        <strong>${counts[key] || 0}</strong>
      </button>`
    )
    .join("");
  const filtered = state.feedbackFilter === "all" ? items : items.filter((item) => item.status === state.feedbackFilter);
  rowsNode.innerHTML = filtered.length
    ? filtered
        .map((item) => {
          const attachments = Array.isArray(item.attachments) ? item.attachments : [];
          return `
          <article class="row feedback-row">
            <label class="feedback-select">
              <input type="checkbox" data-feedback-check="${item.id}" ${state.selectedFeedbackIds.has(Number(item.id)) ? "checked" : ""} />
            </label>
            <div class="feedback-main">
              <div class="stack-line">
                <strong>${escapeHtml(item.sender_name || item.sender_id || "MAX")}</strong>
                ${pill(feedbackStatusLabel(item.status), feedbackStatusLevel(item.status))}
              </div>
              <div class="muted">${escapeHtml(item.chat_title || item.chat_id || "Чат MAX")} · ${formatDateRu(item.created_at)}</div>
              <p>${escapeHtml(item.text || "Без текста").replace(/\n/g, "<br>")}</p>
              ${renderFeedbackAttachments(attachments)}
              ${item.decision_comment ? `<div class="muted">Комментарий: ${escapeHtml(item.decision_comment)}</div>` : ""}
            </div>
            <div class="feedback-actions">
              <button class="secondary tiny" type="button" data-feedback-status="in_work" data-feedback-id="${item.id}">В работу</button>
              <button class="secondary tiny" type="button" data-feedback-status="done" data-feedback-id="${item.id}">Готово</button>
              ${canDeleteFeedback() ? `<button class="danger-button tiny" type="button" data-feedback-delete="${item.id}">Удалить</button>` : ""}
            </div>
          </article>`;
        })
        .join("")
    : `<p class="muted">Сообщений из MAX пока нет.</p>`;
}

function renderMaxBindings(panel, rowsNode) {
  if (!panel || !rowsNode) return;
  const canManage = canManageSystemSettings();
  panel.hidden = !canManage;
  if (!canManage) return;
  rememberMaxBindingDrafts(rowsNode);
  rowsNode.innerHTML = state.users
    .map(
      (user) => {
        const draft = state.maxChatDrafts[String(user.id)] || {};
        const maxChatId = draft.max_chat_id ?? user.max_chat_id ?? "";
        const maxEnabled = draft.enabled ?? Boolean(user.max_notifications_enabled);
        return `
      <article class="row max-binding-row" data-max-user-row="${user.id}">
        <div>
          <strong>${taskParticipantLabel(user)}</strong>
          <div class="muted">${maxEnabled ? "Личные уведомления включены" : "Личные уведомления выключены"}</div>
        </div>
        <input name="max_chat_id" value="${escapeAttr(maxChatId)}" placeholder="Личный chat_id из MAX" />
        <label class="checkbox-line">
          <input name="max_enabled" type="checkbox" ${maxEnabled ? "checked" : ""} />
          Включить
        </label>
        <button class="secondary tiny" type="button" data-save-max-chat="${user.id}">Сохранить</button>
      </article>`;
      }
    )
    .join("");
}

function rememberMaxBindingDrafts(rowsNode) {
  if (!rowsNode) return;
  rowsNode.querySelectorAll("[data-max-user-row]").forEach((row) => {
    const input = row.querySelector('input[name="max_chat_id"]');
    const checkbox = row.querySelector('input[name="max_enabled"]');
    if (!input || !checkbox) return;
    saveMaxBindingDraft(row);
  });
}

function saveMaxBindingDraft(row) {
  const userId = row?.dataset?.maxUserRow;
  if (!userId) return;
  const input = row.querySelector('input[name="max_chat_id"]');
  const checkbox = row.querySelector('input[name="max_enabled"]');
  if (!input || !checkbox) return;
  state.maxChatDrafts[String(userId)] = {
    max_chat_id: input.value,
    enabled: checkbox.checked,
  };
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

function hasOpenDialog() {
  return Boolean(document.querySelector("dialog[open]"));
}

async function refreshLiveData() {
  if (hasOpenDialog()) return;
  const selectedProjectId = state.selectedProjectId;
  const selectedTaskProjectId = state.selectedTaskProjectId;
  await loadCoreData();
  state.selectedProjectId = selectedProjectId;
  state.selectedTaskProjectId = selectedTaskProjectId;
  await renderNotifications();
  if (state.view === "dashboard") {
    await renderDashboard();
  } else if (state.view === "feedback") {
    await renderFeedback();
  }
}

function setProjectFileFieldsRequired(required) {
  ["estimate_file_name", "work_task_file", "contract_file", "estimate_doc_file", "project_docs_file"].forEach((name) => {
    const input = qs(`#projectForm input[name="${name}"]`);
    if (input) input.required = required;
  });
}

function resetProjectDialog() {
  const form = qs("#projectForm");
  form.reset();
  form.dataset.mode = "create";
  form.dataset.projectId = "";
  form.dataset.existingEstimateFileName = "";
  form.dataset.existingWorkTaskFileName = "";
  qs("#projectDialogTitle").textContent = "Новый объект";
  qs("#projectSubmitButton").textContent = "Создать";
  setProjectFileFieldsRequired(true);
}

async function openProjectEditDialog(projectId) {
  const project = await api(`/api/projects/${projectId}`);
  const form = qs("#projectForm");
  form.reset();
  form.dataset.mode = "edit";
  form.dataset.projectId = project.id;
  form.dataset.existingEstimateFileName = project.estimate_file_name || "";
  form.dataset.existingWorkTaskFileName = project.work_task_file_name || "";
  qs("#projectDialogTitle").textContent = "Редактирование объекта";
  qs("#projectSubmitButton").textContent = "Сохранить";
  setProjectFileFieldsRequired(false);
  form.elements.title.value = project.title || "";
  form.elements.customer_name.value = project.customer_name || "";
  form.elements.address.value = project.address || "";
  form.elements.smetter_ref.value = project.smetter_ref || "";
  form.elements.planned_end_date.value = project.planned_end_date || "";
  form.elements.main_estimate_amount.value = project.main_estimate_amount || "";
  qs("#projectDialog").showModal();
}

function openContractDialog(projectId = "") {
  const form = qs("#contractForm");
  form.reset();
  if (projectId) form.elements.project_id.value = String(projectId);
  form.elements.responsible_id.value = currentUserId() || state.users.find((user) => user.role === "construction_manager")?.id || "";
  qs("#contractDialog").showModal();
}

async function handleProjectAction(button) {
  const projectId = button.dataset.projectId;
  const action = button.dataset.projectAction;
  let payload = { actor_id: currentUserId(), actor_role: currentRoleBase() };
  let message = "Объект обновлен";

  if (action === "return") {
    payload = { comment: qs("#returnComment")?.value || "" };
    message = "Объект возвращен менеджеру";
  }

  if (action === "archive") {
    const confirmed = window.confirm("Отправить объект в архив? Активные задачи и заявки по объекту будут скрыты из рабочих реестров. Вернуть объект сможет ген.директор или руководитель строительства.");
    if (!confirmed) return;
    payload = { reason: qs("#archiveReason")?.value || "" };
    message = "Объект отправлен в архив";
  }

  if (action === "restore") {
    message = "Объект возвращен в работу";
  }

  if (action === "delete") {
    const confirmed = window.confirm("Удалить объект навсегда? Это действие нельзя отменить.");
    if (!confirmed) return;
    message = "Объект удален навсегда";
  }

  if (action === "update") {
    payload = {
      title: qs("#projectEditTitle")?.value,
      customer_name: qs("#projectEditCustomer")?.value,
      address: qs("#projectEditAddress")?.value,
      smetter_ref: qs("#projectEditSmetter")?.value,
      planned_end_date: qs("#projectEditEndDate")?.value,
      main_estimate_amount: qs("#projectEditEstimate")?.value,
      estimate_file_name: qs("#projectEditFileName")?.value,
    };
    message = "Карточка объекта сохранена";
  }

  if (action === "accept") {
    payload = {
      foreman_id: qs("#acceptForeman")?.value,
      estimator_id: qs("#acceptEstimator")?.value,
      procurement_manager_id: qs("#acceptProcurement")?.value,
      tech_supervisor_id: qs("#acceptTech")?.value,
    };
    message = "Объект принят в работу";
  }

  if (action === "assign") {
    payload = {
      actor_id: currentUserId(),
      actor_role: currentRoleBase(),
      foreman_id: qs("#assignForeman")?.value,
      estimator_id: qs("#assignEstimator")?.value,
      procurement_manager_id: qs("#assignProcurement")?.value,
      tech_supervisor_id: qs("#assignTech")?.value,
    };
    message = "Ответственные по объекту обновлены";
  }

  if (action === "submit") {
    payload.comment = qs("#submitFixComment")?.value || "";
    message = "Объект передан руководителю строительства";
  }

  await api(`/api/projects/${projectId}/${action}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const numericProjectId = Number(projectId);
  if (action === "delete") {
    state.selectedProjectId = null;
    state.projectListMode = "archive";
    await loadAll();
    switchView("projects");
    qs("#projectDetail").innerHTML = `<p class="muted">Объект удален из архива навсегда.</p>`;
    showToast(message);
    return;
  }
  if (action === "restore") {
    state.projectListMode = "active";
  }
  state.selectedProjectId = numericProjectId;
  await loadAll();
  state.selectedProjectId = numericProjectId;
  switchView("projects");
  await renderProjects();
  await renderProjectDetail(state.selectedProjectId);
  showToast(message);
}

async function handleTaskAction(button) {
  const taskId = button.dataset.taskId;
  const action = button.dataset.taskAction;
  let payload = {};
  let message = "Задача обновлена";
  if (action === "complete") {
    message = "Задача отмечена выполненной";
  }
  if (action === "accept") {
    message = "Выполнение принято";
  }
  if (action === "return") {
    const comment = window.prompt("Что нужно доработать?");
    if (comment === null) return;
    const dueDate = window.prompt("Новый срок выполнения в формате ГГГГ-ММ-ДД. Можно оставить пустым.");
    if (dueDate === null) return;
    payload = { ...payload, comment, due_date: dueDate.trim() };
    message = "Задача возвращена на доработку";
  }
  if (action === "delete") {
    const confirmed = window.confirm("Удалить задачу? Это действие нельзя отменить.");
    if (!confirmed) return;
    message = "Задача удалена";
    payload = { ...payload, comment: "Удалено из интерфейса задач." };
  }
  await api(`/api/tasks/${taskId}/${action}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const selectedProjectId = state.selectedProjectId;
  const selectedTaskProjectId = state.selectedTaskProjectId;
  state.selectedProjectId = selectedProjectId;
  state.selectedTaskProjectId = selectedTaskProjectId;
  await loadAll();
  state.selectedProjectId = selectedProjectId;
  state.selectedTaskProjectId = selectedTaskProjectId;
  if (state.view === "tasks") await renderTasks();
  if (state.selectedProjectId) await renderProjectDetail(state.selectedProjectId);
  showToast(message);
}

function bindEvents() {
  qsa("[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  qsa("[data-view-target]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.viewTarget)));
  qs("#refreshButton").addEventListener("click", () => loadAll().then(() => showToast("Данные обновлены")));
  qs("#logoutButton")?.addEventListener("click", () => {
    localStorage.removeItem("currentRole");
    window.location.href = "/logout";
  });
  qs("#currentRoleSelect").addEventListener("change", async (event) => {
    state.currentRole = event.target.value;
    localStorage.setItem("currentRole", state.currentRole);
    syncNavigationAccess();
    if (state.selectedProjectId) await renderProjectDetail(state.selectedProjectId);
    state.selectedTaskProjectId = null;
    await renderTasks();
    await renderDashboard();
    await renderMaterials();
    fillMaterialProjectSelect();
    updateMaterialActorHint();
    showToast(`Роль: ${roleLabel(state.currentRole)}`);
  });

  qs("#newProjectButton").addEventListener("click", () => {
    resetProjectDialog();
    qs("#projectDialog").showModal();
  });
  qs("#newContractButton")?.addEventListener("click", () => openContractDialog(state.selectedProjectId || ""));
  qs("#newTaskButton").addEventListener("click", () => {
    const form = qs("#taskForm");
    form.reset();
    form.elements.creator_role.value = currentRoleBase();
    const userId = currentUserId();
    form.elements.creator_id.value = userId || "";
    if (userId && form.elements.reviewer_id) form.elements.reviewer_id.value = String(userId);
    qs("#taskDialog").showModal();
  });
  qs("#newMaterialButton").addEventListener("click", async () => {
    const form = qs("#materialForm");
    form.reset();
    resetExtraMaterials();
    qs("#materialEstimatePicker").innerHTML = `<p class="muted">Выберите объект и нажмите “Материалы по смете”.</p>`;
    fillMaterialProjectSelect(state.selectedProjectId);
    updateMaterialActorHint();
    await loadMaterialEstimatePicker();
    qs("#materialDialog").showModal();
  });
  qs("#newVariationButton").addEventListener("click", () => qs("#variationDialog").showModal());
  qs("#newDocumentButton").addEventListener("click", () => qs("#documentDialog").showModal());
  qs("#newEventButton").addEventListener("click", () => qs("#eventDialog").showModal());
  qs("#refreshFeedbackButton")?.addEventListener("click", () => renderFeedback().then(() => showToast("Обратная связь обновлена")));
  qs("#deleteSelectedFeedbackButton")?.addEventListener("click", async () => {
    if (!canDeleteFeedback()) {
      showToast("Удаление сообщений недоступно для текущей роли");
      return;
    }
    const ids = [...state.selectedFeedbackIds].filter(Boolean);
    if (!ids.length) {
      showToast("Выберите сообщения для удаления");
      return;
    }
    const confirmed = confirm(`Удалить выбранные сообщения: ${ids.length}?`);
    if (!confirmed) return;
    const result = await api("/api/feedback/delete-bulk", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    ids.forEach((id) => state.selectedFeedbackIds.delete(Number(id)));
    await renderFeedback();
    showToast(`Удалено сообщений: ${result.deleted || ids.length}`);
  });

  qsa("[data-close]").forEach((button) => button.addEventListener("click", () => qs(`#${button.dataset.close}`).close()));

  qs('#materialForm select[name="project_id"]').addEventListener("change", loadMaterialEstimatePicker);
  qs("#loadMaterialEstimateButton").addEventListener("click", loadMaterialEstimatePicker);
  qs("#addExtraMaterialButton").addEventListener("click", () => addExtraMaterialRow());
  qs("#materialEstimatePicker").addEventListener("input", (event) => {
    const row = event.target.closest(".estimate-choice-row");
    if (row) updateMaterialEstimateRow(row);
  });
  qs("#materialEstimatePicker").addEventListener("change", (event) => {
    const row = event.target.closest(".estimate-choice-row");
    if (row) updateMaterialEstimateRow(row);
  });
  qs("#toggleEstimateMaterialsButton").addEventListener("click", async () => {
    state.showEstimateMaterials = !state.showEstimateMaterials;
    await renderEstimateMaterials();
  });
  qsa("[data-material-list-mode]").forEach((button) =>
    button.addEventListener("click", async () => {
      state.materialListMode = button.dataset.materialListMode;
      await renderMaterials();
    })
  );
  qs("#exportCompletedMaterialsButton").addEventListener("click", () => {
    const projectId = qs('#estimateImportForm select[name="project_id"]')?.value || "";
    const suffix = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
    window.open(`/api/material-requests/export${suffix}`, "_blank", "noopener");
  });
  qs('#estimateImportForm select[name="project_id"]').addEventListener("change", renderEstimateMaterials);
  qs("#refreshEstimateButton").addEventListener("click", renderEstimateMaterials);
  qs("#previewEstimateButton").addEventListener("click", loadEstimatePreview);
  qs('#workProjectForm select[name="project_id"]').addEventListener("change", async (event) => {
    state.selectedWorkProjectId = Number(event.target.value);
    qs('#workExtraForm select[name="project_id"]').value = event.target.value;
    await renderWorks();
  });
  qs('#workExtraForm select[name="project_id"]').addEventListener("change", async (event) => {
    state.selectedWorkProjectId = Number(event.target.value);
    qs('#workProjectForm select[name="project_id"]').value = event.target.value;
    await renderWorks();
  });
  qs("#printWorksButton").addEventListener("click", () => {
    const projectId = workProjectId();
    if (projectId) window.open(`/api/work-items/print?project_id=${encodeURIComponent(projectId)}`, "_blank", "noopener");
  });
  qs("#workRows").addEventListener(
    "toggle",
    (event) => {
      const stage = event.target.closest?.(".work-stage");
      if (!stage) return;
      const projectId = workProjectId();
      if (!projectId) return;
      setWorkStageOpen(projectId, stage.dataset.workStage || "", stage.open);
    },
    true
  );

  document.addEventListener("click", async (event) => {
    const viewTargetButton = event.target.closest("[data-view-target]");
    if (viewTargetButton) {
      switchView(viewTargetButton.dataset.viewTarget);
      return;
    }

    const taskFilterButton = event.target.closest("[data-task-filter]");
    if (taskFilterButton) {
      state.taskFilter = taskFilterButton.dataset.taskFilter;
      switchView("tasks");
      await renderTasks();
      return;
    }

    const taskProjectButton = event.target.closest("[data-task-project]");
    if (taskProjectButton) {
      state.selectedTaskProjectId = Number(taskProjectButton.dataset.taskProject);
      state.taskFilter = "all";
      await renderTasks();
      return;
    }

    const openTaskButton = event.target.closest("[data-open-task]");
    if (openTaskButton) {
      openTaskDetail(openTaskButton.dataset.openTask);
      return;
    }

    const feedbackFilterButton = event.target.closest("[data-feedback-filter]");
    if (feedbackFilterButton) {
      state.feedbackFilter = feedbackFilterButton.dataset.feedbackFilter;
      await renderFeedback();
      return;
    }

    const saveMaxChatButton = event.target.closest("[data-save-max-chat]");
    if (saveMaxChatButton) {
      const row = saveMaxChatButton.closest("[data-max-user-row]");
      const userId = Number(saveMaxChatButton.dataset.saveMaxChat);
      await api(`/api/users/${userId}/max-chat`, {
        method: "POST",
        body: JSON.stringify({
          max_chat_id: row.querySelector('input[name="max_chat_id"]').value.trim(),
          enabled: row.querySelector('input[name="max_enabled"]').checked,
        }),
      });
      delete state.maxChatDrafts[String(userId)];
      state.users = await api("/api/users");
      await renderFeedback();
      showToast("MAX-уведомления для сотрудника обновлены");
      return;
    }

    const feedbackCheck = event.target.closest("[data-feedback-check]");
    if (feedbackCheck) {
      const id = Number(feedbackCheck.dataset.feedbackCheck);
      if (feedbackCheck.checked) {
        state.selectedFeedbackIds.add(id);
      } else {
        state.selectedFeedbackIds.delete(id);
      }
      return;
    }

    const feedbackStatusButton = event.target.closest("[data-feedback-status]");
    if (feedbackStatusButton) {
      await api(`/api/feedback/${feedbackStatusButton.dataset.feedbackId}/status`, {
        method: "POST",
        body: JSON.stringify({ status: feedbackStatusButton.dataset.feedbackStatus, comment: "" }),
      });
      await renderFeedback();
      showToast("Статус обратной связи обновлен");
      return;
    }

    const feedbackDeleteButton = event.target.closest("[data-feedback-delete]");
    if (feedbackDeleteButton) {
      const confirmed = confirm("Удалить это сообщение из обратной связи?");
      if (!confirmed) return;
      await api(`/api/feedback/${feedbackDeleteButton.dataset.feedbackDelete}/delete`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await renderFeedback();
      showToast("Сообщение удалено");
      return;
    }

    const projectListButton = event.target.closest("[data-project-list]");
    if (projectListButton) {
      state.projectListMode = projectListButton.dataset.projectList;
      await renderProjects();
      return;
    }

    const removeExtraMaterial = event.target.closest("[data-remove-extra-material]");
    if (removeExtraMaterial) {
      removeExtraMaterial.closest(".extra-material-row")?.remove();
      return;
    }

    const addBatchExtraMaterial = event.target.closest("[data-add-batch-extra-material]");
    if (addBatchExtraMaterial) {
      addExtraMaterialRow("#batchExtraMaterialRows");
      return;
    }

    const actionButton = event.target.closest("[data-project-action]");
    if (actionButton) {
      await handleProjectAction(actionButton);
      return;
    }

    const taskActionButton = event.target.closest("[data-task-action]");
    if (taskActionButton) {
      await handleTaskAction(taskActionButton);
      return;
    }

    const materialBatchButton = event.target.closest("[data-open-material-batch]");
    if (materialBatchButton) {
      await openMaterialBatchDialog(materialBatchButton.dataset.openMaterialBatch);
      return;
    }

    const variationButton = event.target.closest("[data-open-variation]");
    if (variationButton) {
      await openVariationDialog(variationButton.dataset.openVariation);
      return;
    }

    const variationActionButton = event.target.closest("[data-variation-action]");
    if (variationActionButton) {
      await handleVariationAction(variationActionButton);
      return;
    }

    const variationExportButton = event.target.closest("[data-export-variation]");
    if (variationExportButton) {
      window.open(`/api/variations/${variationExportButton.dataset.exportVariation}/export`, "_blank", "noopener");
      return;
    }

    const documentActionButton = event.target.closest("[data-document-action]");
    if (documentActionButton) {
      const action = documentActionButton.dataset.documentAction;
      const id = documentActionButton.dataset.documentId;
      if (action === "delete") {
        const confirmed = confirm("Удалить материал из базы знаний? Файл также будет удалён из хранилища.");
        if (!confirmed) return;
        try {
          await api(`/api/documents/${id}/delete`, {
            method: "POST",
            body: JSON.stringify({ actor_role: currentRoleBase() }),
          });
          await renderDocuments();
          showToast("Материал удалён из базы знаний");
        } catch (error) {
          showToast(error.message || "Не удалось удалить материал");
        }
        return;
      }
    }

    const materialBatchAction = event.target.closest("[data-material-batch-action]");
    if (materialBatchAction) {
      const id = materialBatchAction.dataset.materialBatchId;
      const action = materialBatchAction.dataset.materialBatchAction;
      let body = {};
      if (action === "delete" && !confirm("Удалить заявку на материалы? Это можно сделать только до принятия снабжением в работу.")) return;
      if (action === "return") {
        body = { comment: qs("#materialBatchReturnComment")?.value || "" };
      }
      if (action === "resubmit") {
        body = { comment: qs("#materialBatchResubmitComment")?.value || "" };
      }
      if (action === "update") {
        body = {
          comment: qs("#materialBatchUpdateComment")?.value || "",
          needed_at: qs("#materialBatchUpdateNeededAt")?.value || "",
          items: collectMaterialBatchEdits(),
          extra_items: collectExtraMaterials("#batchExtraMaterialRows"),
        };
      }
      if (action === "schedule") {
        body = {
          scheduled_delivery_date: qs("#materialBatchDeliveryDate")?.value || "",
          comment: qs("#materialBatchScheduleComment")?.value || "",
        };
      }
      if (action === "resolve_issue") {
        body = {
          scheduled_delivery_date: qs("#materialBatchResolveDate")?.value || "",
          comment: qs("#materialBatchResolveComment")?.value || "",
        };
      }
      if (action === "receive") {
        const file = qs("#materialBatchReceiptFile")?.files?.[0];
        body = {
          receipt_status: materialBatchAction.dataset.receiptStatus || "received",
          comment: qs("#materialBatchReceiptComment")?.value || "",
          receipt_file: file
            ? {
                title: file.name,
                type: "other",
                file_name: file.name,
                mime_type: file.type,
                file_base64: await fileToBase64(file),
              }
            : null,
        };
      }
      body.actor_role = currentRoleBase();
      body.actor_id = currentUserId();
      try {
        await api(`/api/material-request-batches/${id}/${action}`, {
          method: "POST",
          body: JSON.stringify(body),
        });
      } catch (error) {
        showToast(error.message || "Не удалось обновить заявку");
        return;
      }
      qs("#materialReviewDialog").close();
      await loadAll();
      showToast(
        {
          accept: "Заявка принята в работу",
          return: "Заявка возвращена на доработку",
          resubmit: "Заявка повторно отправлена снабжению",
          schedule: "Прораб уведомлен о доставке",
          resolve_issue: "Прораб уведомлен о повторной доставке",
          receive: "Приемка по заявке отправлена",
          update: "Заявка исправлена и отправлена снабжению",
          delete: "Заявка удалена",
          create_variation: "Допработа создана и связана с заявкой",
        }[action] || "Заявка обновлена"
      );
      return;
    }

    const materialDeliverButton = event.target.closest("[data-material-deliver]");
    if (materialDeliverButton) {
      const id = materialDeliverButton.dataset.materialDeliver;
      await api(`/api/material-requests/${id}/deliver`, {
        method: "POST",
        body: JSON.stringify({
          actual_delivery_date: qs(`[data-material-actual="${id}"]`)?.value || "",
          procurement_comment: qs(`[data-material-comment="${id}"]`)?.value || "",
        }),
      });
      await loadAll();
      showToast("Доставка материалов отправлена");
      return;
    }

    const editProjectButton = event.target.closest("[data-edit-project]");
    if (editProjectButton) {
      await openProjectEditDialog(Number(editProjectButton.dataset.editProject));
      return;
    }

    const addContractButton = event.target.closest("[data-add-contract]");
    if (addContractButton) {
      openContractDialog(Number(addContractButton.dataset.addContract));
      return;
    }

    if (event.target.closest("a")) return;

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

  document.addEventListener(
    "toggle",
    (event) => {
      const details = event.target.closest?.("[data-collapsible-key]");
      if (!details) return;
      state.expandedLists[details.dataset.collapsibleKey] = details.open;
    },
    true
  );

  document.addEventListener("input", (event) => {
    const maxChatInput = event.target.closest?.('[data-max-user-row] input[name="max_chat_id"]');
    if (!maxChatInput) return;
    saveMaxBindingDraft(maxChatInput.closest("[data-max-user-row]"));
  });

  document.addEventListener("change", (event) => {
    const maxEnabledInput = event.target.closest?.('[data-max-user-row] input[name="max_enabled"]');
    if (!maxEnabledInput) return;
    saveMaxBindingDraft(maxEnabledInput.closest("[data-max-user-row]"));
  });

  qs("#projectForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = qs("#projectForm");
    const saveMode = event.submitter?.dataset.saveMode === "draft" ? "draft" : "complete";
    try {
      const payload = await projectFormToJson(form);
      payload.save_mode = saveMode;
      const isEdit = form.dataset.mode === "edit";
      const projectId = form.dataset.projectId;
      const hasWorkTaskUpload = payload.initial_documents.some((doc) => doc.type === "smetter_work_task");
      const savedProject = await api(isEdit ? `/api/projects/${projectId}/update` : "/api/projects", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      qs("#projectDialog").close();
      form.reset();
      await loadAll();
      const savedProjectId = Number(isEdit ? projectId : savedProject.id);
      if (isEdit) {
        state.selectedProjectId = savedProjectId;
        await renderProjectDetail(state.selectedProjectId);
      }
      if (hasWorkTaskUpload) {
        state.selectedProjectId = savedProjectId;
        state.selectedWorkProjectId = savedProjectId;
        switchView("works");
        const worksSelect = qs('#workProjectForm select[name="project_id"]');
        if (worksSelect) worksSelect.value = String(savedProjectId);
        await renderWorks();
        const count = Number(savedProject.imported_works_count || 0);
        showToast(count ? `Задание на работы загружено: ${count} строк` : "Файл сохранен, но работы не распознаны");
        return;
      }
      showToast(isEdit ? "Карточка объекта сохранена" : "Объект создан как черновик");
    } catch (error) {
      showToast(error.message || "Не удалось сохранить карточку объекта");
    }
  });
  qs("#taskForm").addEventListener("submit", (event) => {
    event.preventDefault();
    qs('#taskForm input[name="creator_role"]').value = currentRoleBase();
    qs('#taskForm input[name="creator_id"]').value = currentUserId() || "";
    submitForm("taskDialog", "taskForm", "/api/tasks", "Задача создана");
  });
  qs("#materialForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = qs("#materialForm");
    const selectedRows = qsa("#materialEstimatePicker .estimate-choice-row").filter((row) => row.querySelector("[data-material-check]").checked);
    const items = selectedRows.map((row) => ({
      estimate_material_id: row.dataset.estimateId,
      quantity: row.querySelector("[data-material-quantity]").value,
      reason: row.querySelector("[data-material-reason] textarea").value,
    }));
    const extra_items = collectExtraMaterials();
    const incompleteExtra = extra_items.some((item) => !item.material || !item.name || Number(item.quantity || 0) <= 0 || !item.reason);
    if (incompleteExtra) {
      showToast("Заполните все 4 поля в дополнительных материалах");
      return;
    }
    if (!items.length && !extra_items.length) {
      showToast("Выберите материалы по смете или добавьте дополнительный материал");
      return;
    }
    api("/api/material-requests/bulk", {
      method: "POST",
      body: JSON.stringify({
        project_id: form.elements.project_id.value,
        needed_at: form.elements.needed_at.value,
        comment: form.elements.comment.value,
        creator_role: currentRoleBase(),
        creator_id: currentUserId(),
        items,
        extra_items,
      }),
    })
      .then(async () => {
        qs("#materialDialog").close();
        form.reset();
        await loadAll();
        showToast("Заявка на материалы отправлена снабжению");
      })
      .catch((error) => showToast(error.message));
  });
  qs("#variationForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = qs("#variationForm");
    const payload = formToJson(form);
    payload.actor_id = currentUserId();
    payload.requester_id = currentUserId();
    await api("/api/variations", { method: "POST", body: JSON.stringify(payload) });
    qs("#variationDialog").close();
    form.reset();
    await loadAll();
    showToast("Допработа добавлена и отправлена на решение");
  });

  qs("#workExtraForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = qs("#workExtraForm");
    const payload = formToJson(form);
    payload.creator_id = currentUserId();
    await api("/api/work-extra-items", { method: "POST", body: JSON.stringify(payload) });
    form.reset();
    state.selectedWorkProjectId = Number(qs('#workProjectForm select[name="project_id"]').value);
    form.elements.project_id.value = state.selectedWorkProjectId;
    await loadAll();
    showToast("Работа добавлена и отправлена в допработы на решение");
  });
  qs("#supplierLocationForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = qs("#supplierLocationForm");
    await api("/api/supplier-locations", { method: "POST", body: JSON.stringify(formToJson(form)) });
    form.reset();
    await renderLocations();
    showToast("Локация поставщика добавлена");
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
        mime_type: file?.type || "",
        file_base64: file ? await fileToBase64(file) : "",
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
  qs("#documentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = qs("#documentForm");
    try {
      const data = formToJson(form);
      data.related_type = "knowledge_base";
      delete data.project_id;
      const file = form.elements.document_file.files[0];
      if (file) {
        data.document_file = await fileDocumentPayload(file, data.title || file.name, data.type || "other", "knowledge_base");
      }
      await api("/api/documents", { method: "POST", body: JSON.stringify(data) });
      qs("#documentDialog").close();
      form.reset();
      await loadAll();
      showToast("Материал добавлен в базу знаний");
    } catch (error) {
      showToast(error.message || "Не удалось сохранить материал");
    }
  });
  qs("#contractForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = qs("#contractForm");
    try {
      const payload = formToJson(form);
      const file = form.elements.contract_document_file.files[0];
      if (file) {
        payload.document_file = await fileDocumentPayload(file, payload.title || file.name, "contract", "contract");
      }
      await api("/api/contracts", { method: "POST", body: JSON.stringify(payload) });
      qs("#contractDialog").close();
      form.reset();
      await loadAll();
      if (payload.project_id) {
        state.selectedProjectId = Number(payload.project_id);
        switchView("projects");
        await renderProjectDetail(state.selectedProjectId);
      }
      showToast("Договор или допник добавлен в карточку объекта");
    } catch (error) {
      showToast(error.message || "Не удалось сохранить договор");
    }
  });
  qs("#eventForm").addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm("eventDialog", "eventForm", "/api/events", "Событие сохранено");
  });
}

async function boot() {
  await loadSession();
  bindEvents();
  switchView(state.view);
  await loadAll();
  registerServiceWorker();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.register("/sw.js").catch(() => undefined);
}

boot().catch((error) => showToast(error.message));
setInterval(() => {
  if (document.hidden) return;
  refreshLiveData().catch((error) => showToast(error.message));
}, 10000);
