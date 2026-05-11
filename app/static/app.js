const state = {
  view: localStorage.getItem("currentView") || "dashboard",
  currentRole: "owner",
  users: [],
  projects: [],
  archivedProjects: [],
  materialRequests: [],
  estimateMaterials: [],
  estimatePreviewRows: [],
  showEstimateMaterials: false,
  selectedProjectId: null,
  selectedProjectTab: "overview",
  projectListMode: "active",
  materialListMode: "active",
  taskFilter: "all",
  selectedTaskProjectId: null,
  selectedWorkProjectId: null,
  openWorkStages: {},
};

const viewTitles = {
  dashboard: "Рабочий стол",
  projects: "Объекты",
  tasks: "Задачи",
  works: "Работы",
  materials: "Материалы",
  variations: "Допработы и отклонения",
  locations: "Локации",
  documents: "Документы",
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
  decision_required: "Нужно решение",
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
  return ["owner", "sales_manager", "construction_manager"].includes(currentRoleBase());
}

function canDeleteForever() {
  return currentRoleBase() === "owner";
}

function roleLabel(role) {
  if (String(role || "").startsWith("foreman:")) {
    const user = state.users.find((item) => item.id === Number(String(role).split(":")[1]));
    return `Прораб ${user?.name || ""}`.trim();
  }
  return {
    owner: "Ген.директор",
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

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
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
  return `https://yandex.ru/maps/?text=${encodeURIComponent(text)}`;
}

function addressLink(address, className = "") {
  const text = String(address || "").trim();
  if (!text) return `<span class="muted">Адрес не указан</span>`;
  return `<a class="address-link ${className}" href="${escapeAttr(yandexMapsUrl(text))}" target="_blank" rel="noopener noreferrer">${text}</a>`;
}

function mapLink(address, mapsUrl, label = "Открыть в Яндекс.Картах") {
  const url = String(mapsUrl || "").trim();
  const addressText = String(address || "").trim();
  const href = /^https?:\/\//i.test(url) && !/^https?:\/\/yandex\.ru\/maps\/?$/i.test(url) ? url : yandexMapsUrl(addressText);
  if (!href) return `<span class="muted">Локация не указана</span>`;
  return `<a class="link-button inline-link" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
}

function documentType(type) {
  return {
    contract: "Договор",
    main_estimate: "Основная смета",
    smetter_materials: "Файл материалов из Сметтера",
    smetter_work_task: "Задание на работы из Сметтера",
    payment_schedule: "График платежей",
    project_documentation: "Проектная документация",
    variation_estimate: "Смета допработ",
    act: "Акт",
    ks_2: "КС-2",
    ks_3: "КС-3",
    detail_node: "Узел",
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
      <span>${type}${file ? ` · ${file}` : ""}</span>
    </a>`;
}

function renderDocumentSummary(docs) {
  return `
    <section class="workflow-panel document-summary">
      <div class="stack-line">
        <h3>Документы объекта</h3>
        ${pill(`${docs.length} шт.`, docs.length ? "blue" : "")}
      </div>
      ${
        docs.length
          ? `<div class="document-list">${docs.map((doc) => `<div class="document-row">${documentFileLink(doc)}</div>`).join("")}</div>`
          : `<p class="muted">Документы пока не загружены. Добавить договор, смету, график платежей или проект можно через кнопку “Редактировать”.</p>`
      }
    </section>`;
}

function showToast(message) {
  const toast = qs("#toast");
  toast.textContent = message;
  toast.classList.add("active");
  setTimeout(() => toast.classList.remove("active"), 2200);
}

function switchView(view) {
  if (!viewTitles[view]) view = "dashboard";
  state.view = view;
  localStorage.setItem("currentView", view);
  qsa(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  qsa(".view").forEach((node) => node.classList.remove("active"));
  qs(`#${view}View`).classList.add("active");
  qs("#pageTitle").textContent = viewTitles[view];
}

async function loadAll() {
  const [users, projects, archivedProjects] = await Promise.all([api("/api/users"), api("/api/projects"), api("/api/projects/archive")]);
  state.users = users;
  state.projects = projects;
  state.archivedProjects = archivedProjects;
  if (!state.selectedProjectId && projects.length) state.selectedProjectId = projects[0].id;
  fillSelects();
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
    renderEvents(),
  ]);
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
  const options = [
    ["owner", "Ген.директор"],
    ["sales_manager", "Менеджер"],
    ["construction_manager", "Рук. строительства"],
    ...usersByRole("foreman").map((user) => [`foreman:${user.id}`, `Прораб ${user.name}`]),
    ["procurement_manager", "Снабжение"],
    ["estimator", "Сметчик"],
    ["technical_supervisor", "Технадзор"],
  ];
  select.innerHTML = options.map(([value, title]) => `<option value="${value}">${title}</option>`).join("");
  select.value = options.some(([value]) => value === selected) ? selected : "owner";
  state.currentRole = select.value;
}

function usersByRole(role) {
  return state.users.filter((user) => user.role === role);
}

function userOptionsByRole(role) {
  return usersByRole(role).map((user) => `<option value="${user.id}">${user.name}</option>`).join("");
}

function taskParticipantLabel(user) {
  if (user.role === "owner") return "Ген.директор";
  if (user.role === "construction_manager") return "Рук.по строительству";
  if (user.role === "technical_supervisor") return "Технадзор";
  if (user.role === "foreman") return `Прораб ${user.name}`;
  return user.name;
}

function taskParticipantOptions() {
  const order = { technical_supervisor: 1, foreman: 2, construction_manager: 3, owner: 4 };
  return state.users
    .filter((user) => ["technical_supervisor", "foreman", "construction_manager", "owner"].includes(user.role))
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
  if (["owner", "construction_manager"].includes(currentRoleBase())) return true;
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
    ["waiting", "Не принято", stats.waiting, "blue"],
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
  const [summary, tasks] = await Promise.all([api("/api/summary"), api("/api/tasks")]);
  const roleTasks = visibleTasksForRole(tasks);
  qs("#summaryCards").innerHTML = `
    <button class="metric clickable" data-view-target="projects" type="button"><span class="muted">Объекты</span><strong>${summary.projects}</strong><span>В базе MVP</span></button>
    <button class="metric clickable" data-view-target="projects" type="button"><span class="muted">У менеджера</span><strong>${summary.pending_handover}</strong><span>Черновики и доработки</span></button>
    <button class="metric clickable" data-task-filter="waiting" type="button"><span class="muted">Задачи к приемке</span><strong>${summary.task_done_waiting || 0}</strong><span>Выполнены, но не приняты</span></button>
    <button class="metric clickable" data-task-filter="overdue" type="button"><span class="muted">Просрочено</span><strong>${taskStats(roleTasks).overdue}</strong><span>По открытым задачам</span></button>
  `;
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
  qs("#dashboardTasks").innerHTML = roleTasks
    .slice(0, 4)
    .map(
      (task) => `
      <div class="row">
        <div class="stack-line"><strong>${task.title}</strong>${pill(label(task.status), taskStatusLevel(task.status))}${pill(task.due_date || "без срока", levelByDate(task.due_date))}</div>
        <div class="muted">${task.project_title} · ответственный: ${task.assignee_name || "не назначен"} · принимает: ${task.reviewer_name || task.creator_name || "не назначен"}</div>
      </div>`
    )
    .join("");
}

async function renderNotifications() {
  const rows = await api("/api/notifications");
  qs("#notificationRows").innerHTML = rows.length
    ? rows
        .map(
          (row) => {
            const target =
              row.related_type === "material_request_batch" && row.related_id
                ? `data-open-material-batch="batch-${row.related_id}"`
                : `data-open-project="${row.project_id}"`;
            return `
          <button class="row clickable" ${target}>
            <div class="stack-line"><strong>${row.title}</strong>${pill(row.user_name || row.role, row.is_read ? "" : "warning")}</div>
            <div>${row.text}</div>
            <div class="muted">${row.project_title || "Без объекта"} · ${row.created_at}</div>
          </button>`;
          }
        )
        .join("")
    : `<p class="muted">Уведомлений пока нет.</p>`;
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
                ${state.projectListMode === "archive" ? pill(project.archive_reason || "архив", "success") : pill(`Смета: ${money(project.main_estimate_amount)}`, "success")}
              </div>
              <div class="project-meta-line">
                <span>${state.projectListMode === "archive" ? project.archived_at || "без даты" : project.foreman_name || "прораб не назначен"}</span>
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
  const tabData = {
    overview: `
      <div class="detail-grid">
        <div class="info"><span>Основная смета</span><strong>${money(project.main_estimate_amount)}</strong></div>
        <div class="info"><span>Допработы</span><strong>${money(project.approved_variations_amount)}</strong></div>
        <div class="info"><span>Сверхбюджет без решения</span><strong>${money(project.unresolved_overbudget_amount)}</strong></div>
        <div class="info"><span>Срок</span><strong>${project.planned_end_date || "не задан"}</strong></div>
      </div>`,
    tasks: renderSmallList(project.tasks, (task) => `${task.title} · ${label(task.status)} · ${task.due_date || "без срока"}`),
    materials: renderSmallList(
      project.materials,
      (item) =>
        `${item.title} · ${item.requested_quantity || item.estimated_quantity || 0} ${item.requested_unit || item.estimate_material_unit || ""} · ${label(item.procurement_status)} · желаемая доставка: ${item.needed_at || "не указана"}${
          item.actual_delivery_date ? ` · фактическая: ${item.actual_delivery_date}` : ""
        }${item.procurement_comment ? ` · комментарий снабжения: ${item.procurement_comment}` : ""}`
    ),
    works: renderSmallList(
      [...(project.works || []).map((item) => ({ ...item, kind: "plan" })), ...(project.extra_works || []).map((item) => ({ ...item, kind: "extra" }))],
      (item) =>
        item.kind === "extra"
          ? `${item.title} · ${item.quantity || 0} ${item.unit || ""} · ${workReasonLabel(item.reason)}`
          : `${item.title} · ${item.estimated_quantity || 0} ${item.unit || ""} · ${money(item.total_price)}`
    ),
    variations: renderSmallList(project.variations, (item) => `${item.title} · ${variationType(item.type)} · ${money(item.amount)} · ${moneyDecision(item.financial_decision)}`),
    documents: renderSmallList(project.documents, (doc) => documentFileLink(doc)),
    events: renderSmallList(project.events, (event) => `${event.text}`),
  };
  qs("#projectDetail").innerHTML = `
    <div class="stack-line"><h2>${project.title}</h2>${pill(label(project.status), "blue")}</div>
    <div class="project-detail-map">${mapLink(project.address, project.navigator_url, "Я.Карты")}<span class="muted">${project.address ? "Адрес объекта" : "Адрес не указан"}</span></div>
    <div class="stack-line">
      ${pill(`Прораб: ${project.foreman_name || "не назначен"}`)}
      ${pill(`Сметчик: ${project.estimator_name || "не назначен"}`)}
      ${pill(`Снабжение: ${project.procurement_name || "не назначено"}`)}
      ${pill(`Технадзор: ${project.tech_supervisor_name || "не назначен"}`)}
      ${externalRefLink(project.bitrix_ref, project.bitrix_ref ? "Открыть Bitrix" : "Bitrix не указан", "blue")}
      ${externalRefLink(project.smetter_ref, project.smetter_ref ? "Открыть Сметтер" : "Сметтер не указан", "success")}
    </div>
    ${renderProjectEditPanel(project)}
    ${renderProjectWorkflow(project)}
    ${renderDocumentSummary(project.documents)}
    <div class="tabs">
      ${["overview", "tasks", "works", "materials", "variations", "documents", "events"]
        .map((tab) => `<button class="tab ${state.selectedProjectTab === tab ? "active" : ""}" data-project-tab="${tab}">${tabTitle(tab)}</button>`)
        .join("")}
    </div>
    <div>${tabData[state.selectedProjectTab]}</div>
  `;
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
    const deleteButton = canDeleteForever()
      ? `<button class="danger-button" data-project-action="delete" data-project-id="${project.id}">Удалить навсегда</button>`
      : "";
    return `
      <section class="workflow-panel">
        <div class="stack-line"><h3>Архив</h3>${pill("Объект скрыт из работы", "blue")}</div>
        <p class="muted">Причина: ${project.archive_reason || "не указана"}</p>
        <div class="form-actions">
          <button class="primary" data-project-action="restore" data-project-id="${project.id}">Вернуть в работу</button>
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
        <div class="form-actions">
          <span class="muted">После проверки заполнения менеджер передает объект руководителю строительства.</span>
          <button class="primary" data-project-action="submit" data-project-id="${project.id}">Передать в работу</button>
        </div>
      </section>`;
  }

  if (project.status === "submitted_to_construction") {
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
      <label>Причина архивации <textarea id="archiveReason" rows="2" placeholder="Например: работы завершены, документы закрыты"></textarea></label>
      <button class="secondary" data-project-action="archive" data-project-id="${project.id}">Отправить в архив</button>
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
      fileDocumentPayload(files.payment_schedule_file.files[0], "График платежей", "payment_schedule"),
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
  qs("#taskStats").innerHTML = renderTaskStats(tasks);
  const visibleTasks = tasks.filter((task) => taskMatchesFilter(task, state.taskFilter));
  qs("#taskRows").innerHTML = visibleTasks.length
    ? visibleTasks
        .map((task) => {
          const canComplete = task.status !== "accepted" && task.status !== "completed_pending_acceptance" && (canActAsTaskUser(task, "assignee") || ["owner", "construction_manager"].includes(currentRoleBase()));
          const canReview = task.status === "completed_pending_acceptance" && (["owner", "construction_manager"].includes(currentRoleBase()) || canActAsTaskUser(task, "reviewer"));
          return `
            <div class="row task-row">
              <div class="row-grid">
                <div class="task-main">
                  <strong>${task.title}</strong>
                  <div class="stack-line">${pill(label(task.status), taskStatusLevel(task.status))}${pill(task.due_date || "без срока", levelByDate(task.due_date))}</div>
                  <div class="muted">${task.project_title} · поставил: ${task.creator_name || "не указано"}</div>
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
            </div>`;
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
              <div class="muted">${row.project_title || ""} · ${row.creator_name || "автор не указан"}</div>
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
  if (exportButton) exportButton.hidden = !["owner", "construction_manager", "procurement_manager"].includes(currentRoleBase());
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
                <div class="muted">${row.project_title} · ${variationType(row.type)}${row.source_type === "material_request_batch" ? ` · из заявки материалов #${row.source_id}` : ""}</div>
              </div>
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
      ${variation.source_type === "material_request_batch" ? `<p class="muted">Источник: заявка материалов #${variation.source_id}</p>` : ""}
      ${variation.description ? `<p class="preserve-lines">${variation.description}</p>` : ""}
      <div class="form-actions">
        <button class="secondary" type="button" data-export-variation="${variation.id}" ${materials.length ? "" : "disabled"}>Выгрузить Excel</button>
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
      <div class="stack-line"><strong>${documentTitle(doc)}</strong>${pill(documentType(doc.type), "blue")}${pill(label(doc.status))}</div>
      <div class="muted">${doc.project_title} · ответственный: ${doc.owner_name || "не назначен"}</div>
      ${doc.file_path ? documentFileLink(doc) : `<div class="muted">${doc.file_name || "Файл не загружен"}</div>`}
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

function hasOpenDialog() {
  return Boolean(document.querySelector("dialog[open]"));
}

async function refreshLiveData() {
  if (hasOpenDialog()) return;
  const selectedProjectId = state.selectedProjectId;
  const selectedTaskProjectId = state.selectedTaskProjectId;
  await loadAll();
  state.selectedProjectId = selectedProjectId;
  state.selectedTaskProjectId = selectedTaskProjectId;
  if (selectedProjectId) await renderProjectDetail(selectedProjectId);
  if (state.view === "tasks") await renderTasks();
}

function setProjectFileFieldsRequired(required) {
  ["estimate_file_name", "work_task_file", "contract_file", "estimate_doc_file", "payment_schedule_file", "project_docs_file"].forEach((name) => {
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
  form.elements.bitrix_ref.value = project.bitrix_ref || "";
  form.elements.smetter_ref.value = project.smetter_ref || "";
  form.elements.planned_end_date.value = project.planned_end_date || "";
  form.elements.main_estimate_amount.value = project.main_estimate_amount || "";
  qs("#projectDialog").showModal();
}

async function handleProjectAction(button) {
  const projectId = button.dataset.projectId;
  const action = button.dataset.projectAction;
  let payload = {};
  let message = "Объект обновлен";

  if (action === "return") {
    payload = { comment: qs("#returnComment")?.value || "" };
    message = "Объект возвращен менеджеру";
  }

  if (action === "archive") {
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
      bitrix_ref: qs("#projectEditBitrix")?.value,
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

  if (action === "submit") {
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
    payload = { comment, due_date: dueDate.trim() };
    message = "Задача возвращена на доработку";
  }
  if (action === "delete") {
    const confirmed = window.confirm("Удалить задачу? Это действие нельзя отменить.");
    if (!confirmed) return;
    message = "Задача удалена";
    payload = { actor_role: currentRoleBase() };
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
  qs("#currentRoleSelect").addEventListener("change", async (event) => {
    state.currentRole = event.target.value;
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

    const variationExportButton = event.target.closest("[data-export-variation]");
    if (variationExportButton) {
      window.open(`/api/variations/${variationExportButton.dataset.exportVariation}/export`, "_blank", "noopener");
      return;
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

  qs("#projectForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = qs("#projectForm");
    try {
      const payload = await projectFormToJson(form);
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
  qs("#variationForm").addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm("variationDialog", "variationForm", "/api/variations", "Допработа добавлена");
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
    showToast("Работа добавлена");
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
    const data = formToJson(form);
    const file = form.elements.document_file.files[0];
    if (file) {
      data.document_file = await fileDocumentPayload(file, data.title || file.name, data.type || "other", "project");
    }
    await api("/api/documents", { method: "POST", body: JSON.stringify(data) });
    qs("#documentDialog").close();
    form.reset();
    await loadAll();
    showToast("Документ добавлен");
  });
  qs("#eventForm").addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm("eventDialog", "eventForm", "/api/events", "Событие сохранено");
  });
}

bindEvents();
switchView(state.view);
loadAll().catch((error) => showToast(error.message));
setInterval(() => {
  if (document.hidden) return;
  refreshLiveData().catch((error) => showToast(error.message));
}, 10000);
