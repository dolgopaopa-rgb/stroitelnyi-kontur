(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : /* @__PURE__ */ Symbol.for("Symbol." + name);
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __objRest = (source, exclude) => {
    var target = {};
    for (var prop in source)
      if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
        target[prop] = source[prop];
    if (source != null && __getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(source)) {
        if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
          target[prop] = source[prop];
      }
    return target;
  };
  var __forAwait = (obj, it, method) => (it = obj[__knownSymbol("asyncIterator")]) ? it.call(obj) : (obj = obj[__knownSymbol("iterator")](), it = {}, method = (key, fn) => (fn = obj[key]) && (it[key] = (arg) => new Promise((yes, no, done) => (arg = fn.call(obj, arg), done = arg.done, Promise.resolve(arg.value).then((value) => yes({ value, done }), no)))), method("next"), method("return"), it);

  // app/static/app.js
  var initialRoute = new URLSearchParams(window.location.search);
  var initialProjectId = Number(initialRoute.get("project") || 0) || null;
  var state = {
    view: initialRoute.get("view") || localStorage.getItem("currentView") || "dashboard",
    currentRole: localStorage.getItem("currentRole") || "owner",
    session: null,
    canSwitchRole: true,
    users: [],
    projects: [],
    archivedProjects: [],
    materialRequests: [],
    estimateJobs: [],
    estimateMaterials: [],
    estimatePreviewRows: [],
    showEstimateMaterials: false,
    selectedProjectId: initialProjectId,
    selectedProjectTab: "overview",
    projectListMode: "active",
    materialListMode: "active",
    taskFilter: "all",
    feedbackFilter: "all",
    selectedFeedbackIds: /* @__PURE__ */ new Set(),
    feedbackRefreshing: false,
    feedbackLastUpdatedAt: "",
    maxChatDrafts: {},
    selectedTaskProjectId: initialProjectId,
    lastTasks: [],
    notificationsOpen: false,
    notificationGroupsOpen: {},
    expandedLists: {},
    selectedWorkProjectId: initialProjectId,
    openWorkStages: {},
    estimateGallery: { jobId: null, files: [], index: 0 },
    knowledgeFolders: [],
    knowledgeCurrentFolderId: localStorage.getItem("knowledgeCurrentFolderId") || "",
    knowledgeUploading: false,
    knowledgeUploadMessage: "",
    installPromptEvent: null,
    installPromptReady: false,
    loadingKeys: /* @__PURE__ */ new Set(),
    pullRefresh: { tracking: false, startY: 0, distance: 0, ready: false, refreshing: false }
  };
  var PROJECT_FORM_DRAFT_KEY = "projectFormDraft:v1";
  var PROJECT_TEXT_DRAFT_FIELDS = [
    "title",
    "customer_name",
    "customer_phone",
    "customer_email",
    "address",
    "navigator_url",
    "manager_note",
    "smetter_ref",
    "planned_end_date",
    "main_estimate_amount"
  ];
  var PROJECT_REQUIRED_FIELDS = [
    ["title", "Название"],
    ["customer_name", "Заказчик"],
    ["customer_phone", "Телефон заказчика"],
    ["customer_email", "E-mail заказчика"],
    ["address", "Адрес"],
    ["navigator_url", "Ссылка на локацию объекта из Яндекса"],
    ["smetter_ref", "Сметтер"],
    ["planned_end_date", "Плановый срок окончания работ по договору"],
    ["main_estimate_amount", "Смета"],
    ["estimate_file_name", "Файл материалов из Сметтера"],
    ["work_task_file", "Задание на работы из Сметтера"],
    ["contract_file", "Первичный договор"],
    ["estimate_doc_file", "Смета"],
    ["project_docs_file", "Проектная документация"]
  ];
  var sortableDragSource = null;
  var viewTitles = {
    dashboard: "Рабочий стол",
    projects: "Объекты",
    estimates: "Сметы",
    tasks: "Задачи",
    works: "Работы",
    materials: "Материалы",
    variations: "Допработы и отклонения",
    locations: "Локации",
    documents: "База знаний",
    feedback: "Обратная связь",
    events: "Журнал событий"
  };
  var statusLabels = {
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
    estimate_new: "Новое задание",
    estimate_in_work: "В расчете",
    estimate_done: "Смета сдана",
    estimate_hold: "Пауза",
    estimate_returned: "Возвращено менеджеру",
    estimate_question: "Нужно уточнение"
  };
  function qs(selector) {
    return document.querySelector(selector);
  }
  function qsa(selector) {
    return [...document.querySelectorAll(selector)];
  }
  async function api(path, options = {}) {
    const _a = options, { loadingMessage = "Сохраняем данные", silentLoading = false, showLoading = false } = _a, fetchOptions = __objRest(_a, ["loadingMessage", "silentLoading", "showLoading"]);
    const method = String(fetchOptions.method || "GET").toUpperCase();
    const shouldShowLoading = showLoading || !silentLoading && method !== "GET";
    const loadingKey = "api-".concat(method, "-").concat(path, "-").concat(Date.now(), "-").concat(Math.random());
    let loadingTimer = null;
    let loadingStarted = false;
    if (shouldShowLoading) {
      loadingTimer = window.setTimeout(() => {
        loadingStarted = true;
        setAppLoading(true, loadingMessage, loadingKey);
      }, 220);
    }
    let response;
    try {
      response = await fetch(path, __spreadProps(__spreadValues({}, fetchOptions), {
        headers: __spreadValues({ "Content-Type": "application/json" }, fetchOptions.headers || {})
      }));
    } finally {
      if (loadingTimer) window.clearTimeout(loadingTimer);
      if (loadingStarted) setAppLoading(false, "", loadingKey);
    }
    if (!response.ok) {
      const text = await response.text();
      let message = text;
      try {
        message = JSON.parse(text).error || text;
      } catch (error) {
        message = text;
      }
      if (/^\s*</.test(String(message))) {
        message = "Ошибка ".concat(response.status);
      }
      if (response.status === 401) {
        const next = "".concat(window.location.pathname).concat(window.location.search);
        window.location.href = "/login?next=".concat(encodeURIComponent(next));
        throw new Error("Требуется вход");
      }
      throw new Error(message || "Ошибка ".concat(response.status));
    }
    return response.json();
  }
  function money(value) {
    return new Intl.NumberFormat("ru-RU").format(Number(value || 0)) + " ₽";
  }
  function pill(text, level = "") {
    return '<span class="pill '.concat(level, '">').concat(text, "</span>");
  }
  function levelByDate(date) {
    if (!date) return "";
    const now = /* @__PURE__ */ new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.ceil((new Date("".concat(date, "T00:00:00")) - today) / 864e5);
    if (diff < 0) return "danger";
    if (diff <= 7) return "warning";
    return "blue";
  }
  function formatDateRu(value) {
    if (!value) return "";
    const datePart = String(value).slice(0, 10);
    const parts = datePart.split("-");
    if (parts.length !== 3) return value;
    return "".concat(parts[2], ".").concat(parts[1], ".").concat(parts[0]);
  }
  function label(value) {
    return statusLabels[value] || value || "Не задано";
  }
  function materialBasisLabel(value) {
    return {
      main_estimate: "По смете",
      main_estimate_overspend: "Перерасход по смете",
      additional_work: "Допработа",
      additional_agreement: "Доп. соглашение",
      material_replacement: "Замена материала",
      over_budget_cost: "Сверхбюджет",
      internal_error_or_loss: "За счет компании"
    }[value] || value || "Основание не указано";
  }
  function materialBasisLevel(value) {
    return value === "main_estimate" ? "success" : "warning";
  }
  function moneyDecisionLabel(value) {
    return {
      not_decided: "Решение не принято",
      customer: "Оплата: заказчик",
      company: "Оплата: компания",
      contractor: "Оплата: подрядчик",
      disputed: "Требуется разбор"
    }[value] || value || "Решение не принято";
  }
  function variationAmountLabel(row) {
    const amount = Number((row == null ? void 0 : row.amount) || 0);
    return amount > 0 ? money(amount) : "сумма не задана";
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
      rework: "Переделка"
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
    return ["owner", "construction_manager"].includes(currentRoleBase());
  }
  function canManageSystemSettings() {
    return ["owner", "construction_manager", "finance_director"].includes(currentRoleBase());
  }
  function canDeleteEstimateJob(job) {
    const role = currentRoleBase();
    if (["owner", "construction_manager"].includes(role)) return true;
    if (role === "sales_manager" && isOwnEstimateJob(job, "manager_id")) {
      return ["estimate_new", "estimate_returned", "estimate_question", "estimate_hold"].includes(job.status);
    }
    return false;
  }
  function isOwnEstimateJob(job, field) {
    const userId = currentUserId();
    return Boolean(userId && Number((job == null ? void 0 : job[field]) || 0) === Number(userId));
  }
  function isPartnerEstimateJob(job) {
    return String((job == null ? void 0 : job.estimator_email) || "") === "estimate-partner@example.local";
  }
  function managerControlsPartnerEstimateJob(job) {
    return currentRoleBase() === "sales_manager" && isOwnEstimateJob(job, "manager_id") && isPartnerEstimateJob(job);
  }
  function canEditEstimateJob(job) {
    const role = currentRoleBase();
    if (["owner", "construction_manager"].includes(role)) return true;
    if (role === "sales_manager") return isOwnEstimateJob(job, "manager_id");
    if (role === "estimator") return isOwnEstimateJob(job, "estimator_id") && !["estimate_done", "estimate_returned"].includes(job.status);
    return false;
  }
  function canStartEstimateJob(job) {
    const role = currentRoleBase();
    if (!["estimate_new", "estimate_hold"].includes(job.status)) return false;
    return ["owner", "construction_manager"].includes(role) || role === "estimator" && isOwnEstimateJob(job, "estimator_id") || managerControlsPartnerEstimateJob(job);
  }
  function canFinishEstimateJob(job) {
    const role = currentRoleBase();
    if (!["estimate_in_work", "estimate_question"].includes(job.status)) return false;
    return ["owner", "construction_manager"].includes(role) || role === "estimator" && isOwnEstimateJob(job, "estimator_id") || managerControlsPartnerEstimateJob(job);
  }
  function canManageEstimateJobFiles(job) {
    const role = currentRoleBase();
    if (job.status !== "estimate_done") return false;
    if (["owner", "construction_manager"].includes(role)) return true;
    if (role === "sales_manager") return isOwnEstimateJob(job, "manager_id");
    if (role === "estimator") return isOwnEstimateJob(job, "estimator_id");
    return false;
  }
  function canReturnEstimateJob(job) {
    const role = currentRoleBase();
    if (["estimate_done", "estimate_returned"].includes(job.status)) return false;
    return ["owner", "construction_manager"].includes(role) || role === "estimator" && isOwnEstimateJob(job, "estimator_id");
  }
  function canQuestionEstimateJob(job) {
    const role = currentRoleBase();
    if (["estimate_done", "estimate_returned", "estimate_question"].includes(job.status)) return false;
    return ["owner", "construction_manager"].includes(role) || role === "estimator" && isOwnEstimateJob(job, "estimator_id");
  }
  var viewAccess = {
    owner: ["dashboard", "projects", "estimates", "tasks", "works", "materials", "variations", "locations", "documents", "feedback", "events"],
    construction_manager: ["dashboard", "projects", "estimates", "tasks", "works", "materials", "variations", "locations", "documents", "feedback", "events"],
    finance_director: ["dashboard", "projects", "tasks", "works", "materials", "variations", "locations", "documents", "feedback", "events"],
    accountant: ["dashboard", "projects", "materials", "variations", "locations", "documents", "events"],
    sales_manager: ["dashboard", "projects", "estimates", "documents"],
    foreman: ["dashboard", "tasks", "works", "materials", "variations", "locations", "documents"],
    procurement_manager: ["dashboard", "projects", "materials", "locations", "documents"],
    estimator: ["dashboard", "projects", "estimates", "tasks", "works", "materials", "variations", "documents"],
    technical_supervisor: ["dashboard", "projects", "tasks", "works", "materials", "locations", "documents"]
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
    qsa("[data-view-target]").forEach((button) => {
      button.hidden = !allowed.includes(button.dataset.viewTarget);
    });
    qsa("[data-requires-view]").forEach((node) => {
      node.hidden = !allowed.includes(node.dataset.requiresView);
    });
    syncTopbarAccess();
    if (!allowed.includes(state.view)) {
      switchView(allowed[0] || "dashboard");
    }
  }
  function syncTopbarAccess() {
    const canUseRoleTools = Boolean(state.canSwitchRole);
    const ownerOnlyPageActions = state.view === "estimates" && currentRoleBase() !== "owner";
    const roleSwitcher = qs(".role-switcher");
    const refreshButton = qs("#refreshButton");
    const logoutButton = qs("#logoutButton");
    const newProjectButton = qs("#newProjectButton");
    const actions = qs(".topbar .actions");
    if (roleSwitcher) roleSwitcher.hidden = !canUseRoleTools;
    if (refreshButton) refreshButton.hidden = !canUseRoleTools || ownerOnlyPageActions;
    if (logoutButton) logoutButton.hidden = false;
    if (newProjectButton) newProjectButton.hidden = !canEditProject() || ownerOnlyPageActions;
    syncInstallButton();
    if (actions) {
      actions.classList.toggle("role-tools-hidden", !canUseRoleTools);
      actions.classList.toggle("manager-actions", currentRoleBase() === "sales_manager" && !canUseRoleTools);
    }
  }
  function isAndroidDevice() {
    return /Android/i.test(navigator.userAgent || "");
  }
  function isStandaloneApp() {
    var _a, _b;
    return ((_b = (_a = window.matchMedia) == null ? void 0 : _a.call(window, "(display-mode: standalone)")) == null ? void 0 : _b.matches) || window.navigator.standalone === true;
  }
  function canShowInstallButton() {
    return !isStandaloneApp() && (state.installPromptReady || isAndroidDevice());
  }
  function syncInstallButton() {
    const button = qs("#installAppButton");
    if (!button) return;
    button.hidden = !canShowInstallButton();
    button.textContent = state.installPromptReady ? "Установить" : "На главный экран";
  }
  async function installAndroidApp() {
    const promptEvent = state.installPromptEvent;
    if (!promptEvent) {
      showToast("На Android откройте меню Chrome ⋮ и выберите «Установить приложение» или «Добавить на главный экран».");
      return;
    }
    promptEvent.prompt();
    const choice = await promptEvent.userChoice.catch(() => null);
    state.installPromptEvent = null;
    state.installPromptReady = false;
    syncInstallButton();
    if ((choice == null ? void 0 : choice.outcome) === "accepted") {
      showToast("Контур устанавливается на главный экран.");
    }
  }
  function canViewFinancials() {
    return ["owner", "construction_manager", "finance_director", "accountant", "sales_manager", "estimator"].includes(currentRoleBase());
  }
  function canViewExternalRefs() {
    return ["owner", "construction_manager", "finance_director", "accountant", "sales_manager", "estimator"].includes(currentRoleBase());
  }
  var documentAccess = {
    owner: null,
    construction_manager: null,
    finance_director: null,
    sales_manager: null,
    accountant: /* @__PURE__ */ new Set(["main_estimate", "smetter_materials", "smetter_work_task", "contract", "variation_estimate", "act", "ks_2", "ks_3", "other"]),
    estimator: /* @__PURE__ */ new Set(["main_estimate", "smetter_materials", "smetter_work_task", "project_documentation", "variation_estimate", "act", "ks_2", "ks_3", "other"]),
    foreman: /* @__PURE__ */ new Set(["smetter_materials", "smetter_work_task", "project_documentation", "detail_node", "regulation", "standard", "instruction", "other"]),
    procurement_manager: /* @__PURE__ */ new Set(["smetter_materials", "project_documentation", "detail_node", "regulation", "standard", "instruction", "other"]),
    technical_supervisor: /* @__PURE__ */ new Set(["smetter_materials", "smetter_work_task", "project_documentation", "detail_node", "regulation", "standard", "instruction", "other"])
  };
  function isProjectDocument(doc) {
    const relatedType = String(doc.related_type || "project");
    return !["task", "material_request", "material_request_batch", "variation"].includes(relatedType);
  }
  function visibleDocuments(docs = []) {
    const projectDocs = docs.filter(isProjectDocument);
    const allowed = documentAccess[currentRoleBase()];
    if (!allowed) return projectDocs;
    return projectDocs.filter((doc) => allowed.has(doc.type || "other"));
  }
  function projectTabs() {
    const base = currentRoleBase();
    const tabs = {
      owner: ["overview", "tasks", "works", "materials", "variations", "documents", "events"],
      construction_manager: ["overview", "tasks", "works", "materials", "variations", "documents", "events"],
      finance_director: ["overview", "tasks", "works", "materials", "variations", "documents", "events"],
      accountant: ["overview", "materials", "variations", "documents", "events"],
      sales_manager: ["overview", "documents"],
      foreman: ["overview", "tasks", "works", "materials", "documents"],
      procurement_manager: ["overview", "materials", "documents"],
      estimator: ["overview", "works", "materials", "variations", "documents"],
      technical_supervisor: ["overview", "tasks", "works", "materials", "documents"]
    }[base];
    return tabs || ["overview"];
  }
  function roleLabel(role) {
    if (String(role || "").startsWith("foreman:")) {
      const user = state.users.find((item) => item.id === Number(String(role).split(":")[1]));
      return "Прораб ".concat((user == null ? void 0 : user.name) || "").trim();
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
      technical_supervisor: "Технадзор"
    }[role] || role;
  }
  function currentRoleBase() {
    return String(state.currentRole || "").split(":")[0];
  }
  function currentUserId() {
    var _a, _b, _c;
    if (String(state.currentRole || "").includes(":")) return Number(String(state.currentRole).split(":")[1]);
    if (((_b = (_a = state.session) == null ? void 0 : _a.user) == null ? void 0 : _b.role) === currentRoleBase()) return Number(state.session.user.id || 0) || null;
    return ((_c = state.users.find((user) => user.role === currentRoleBase())) == null ? void 0 : _c.id) || null;
  }
  function roleValueForUser(user, fallbackRole = "owner") {
    if (!user) return fallbackRole || "owner";
    return user.role === "foreman" ? "foreman:".concat(user.id) : user.role;
  }
  function availableRoleOptions() {
    var _a;
    const options = [
      ["finance_director", "Фин.директор"],
      ["accountant", "Бухгалтер"],
      ["sales_manager", "Менеджер"],
      ["construction_manager", "Рук. строительства"],
      ...usersByRole("foreman").map((user) => ["foreman:".concat(user.id), "Прораб ".concat(user.name)]),
      ["procurement_manager", "Снабжение"],
      ["estimator", "Сметчик"],
      ["technical_supervisor", "Технадзор"]
    ];
    if (((_a = state.session) == null ? void 0 : _a.role) === "owner") {
      return [["owner", "Ген.директор"], ...options];
    }
    return options;
  }
  async function loadSession() {
    const savedRole = localStorage.getItem("currentRole");
    const session = await api("/api/session");
    state.session = session;
    state.canSwitchRole = Boolean(session.can_switch_role);
    const ownRole = roleValueForUser(session.user, session.role);
    state.currentRole = state.canSwitchRole && savedRole ? savedRole : ownRole;
  }
  function escapeAttr(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function linkifyText(value) {
    const text = String(value != null ? value : "");
    const urlRegex = /https?:\/\/[^\s<]+/g;
    let result = "";
    let lastIndex = 0;
    let match;
    while (match = urlRegex.exec(text)) {
      const url = match[0];
      result += escapeHtml(text.slice(lastIndex, match.index)).replace(/\n/g, "<br>");
      result += '<a href="'.concat(escapeAttr(url), '" target="_blank" rel="noopener noreferrer">').concat(escapeHtml(url), "</a>");
      lastIndex = match.index + url.length;
    }
    result += escapeHtml(text.slice(lastIndex)).replace(/\n/g, "<br>");
    return result;
  }
  function firstUrlFromText(value) {
    const match = String(value != null ? value : "").match(/https?:\/\/[^\s<>"']+/i);
    if (!match) return "";
    return match[0].replace(/[),.;]+$/, "");
  }
  function phoneDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }
  function formatRuPhone(value) {
    const rawDigits = phoneDigits(value);
    if (!rawDigits) return "";
    let rest = rawDigits;
    if (rawDigits[0] === "7" || rawDigits[0] === "8") {
      rest = rawDigits.slice(1);
    }
    rest = rest.slice(0, 10);
    const groups = [rest.slice(0, 3), rest.slice(3, 6), rest.slice(6, 8), rest.slice(8, 10)].filter(Boolean);
    return groups.length ? "+7-".concat(groups.join("-")) : "+7";
  }
  function phoneHref(value) {
    const formatted = formatRuPhone(value);
    const digits = phoneDigits(formatted);
    return digits.length === 11 ? "tel:+".concat(digits) : "";
  }
  function yandexCoordinateDestination(mapsUrl) {
    const text = String(mapsUrl || "").trim();
    if (!text) return "";
    const parsePair = (value) => {
      const match = String(value || "").match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
      return match ? "".concat(match[2], ",").concat(match[1]) : "";
    };
    try {
      const url = new URL(/^https?:\/\//i.test(text) ? text : "https://".concat(text));
      for (const key of ["pt", "ll", "whatshere[point]"]) {
        const destination = parsePair(url.searchParams.get(key));
        if (destination) return destination;
      }
    } catch (e) {
    }
    const rawMatch = text.match(/(?:pt|ll|whatshere(?:%5B|\[)point(?:%5D|\]))=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i);
    return rawMatch ? "".concat(rawMatch[2], ",").concat(rawMatch[1]) : "";
  }
  function yandexMapsUrl(address, mapsUrl = "") {
    const destination = yandexCoordinateDestination(mapsUrl) || String(address || "").trim();
    if (!destination) return "";
    return "https://yandex.ru/maps/?mode=routes&rtext=~".concat(encodeURIComponent(destination), "&rtt=auto");
  }
  function mapLink(address, mapsUrl, label2 = "Открыть в Яндекс.Картах") {
    const url = String(mapsUrl || "").trim();
    const addressText = String(address || "").trim();
    const href = yandexMapsUrl(addressText, url) || url;
    if (!href) return '<span class="muted">Локация не указана</span>';
    return '<a class="link-button inline-link" href="'.concat(escapeAttr(href), '" target="_blank" rel="noopener noreferrer">').concat(label2, "</a>");
  }
  function documentType(type) {
    return {
      contract: "Договор",
      main_estimate: "Основная смета",
      smetter_materials: "Файл материалов из Сметтера",
      smetter_work_task: "Задание на работы из Сметтера",
      project_documentation: "Проектная документация",
      variation_attachment: "Вложение к допработе",
      variation_estimate: "Смета допработ",
      act: "Акт",
      ks_2: "КС-2",
      ks_3: "КС-3",
      detail_node: "Узел",
      regulation: "Регламент",
      standard: "Стандарт компании",
      instruction: "Инструкция",
      invoice: "Счет",
      other: "Документ"
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
      return "\n      <div>\n        <strong>".concat(title, '</strong>\n        <div class="muted">').concat(type, " · файл не загружен</div>\n      </div>");
    }
    const processLabel = String(doc.process_type || "").startsWith("variation:") ? "" : doc.process_type;
    return '\n    <a class="document-link" href="/api/documents/'.concat(doc.id, '/download" target="_blank" rel="noopener noreferrer">\n      <strong>').concat(title, "</strong>\n      <span>").concat([type, doc.status === "archived" ? "архивная версия" : "", doc.related_section, processLabel, file].filter(Boolean).join(" · "), "</span>\n    </a>");
  }
  function contractTitleById(contracts = []) {
    return contracts.reduce((acc, contract) => {
      acc[Number(contract.id)] = "".concat(contractType(contract.type), ": ").concat(contract.title);
      return acc;
    }, {});
  }
  function renderGroupedProjectDocuments(docs, contracts = []) {
    const byContract = contractTitleById(contracts);
    const activeDocs = docs.filter((doc) => doc.status !== "archived");
    const archivedDocs = docs.filter((doc) => doc.status === "archived");
    const groups = activeDocs.reduce((acc, doc) => {
      const key = doc.contract_id ? byContract[Number(doc.contract_id)] || "Договор / доп. соглашение" : "Общие документы объекта";
      acc[key] = acc[key] || [];
      acc[key].push(doc);
      return acc;
    }, {});
    const activeHtml = Object.entries(groups).map(
      ([title, items]) => '\n        <details class="document-contract-group" open>\n          <summary>'.concat(title, " ").concat(pill("".concat(items.length, " шт."), "blue"), '</summary>\n          <div class="document-list">').concat(items.map((doc) => '<div class="document-row">'.concat(documentFileLink(doc), "</div>")).join(""), "</div>\n        </details>")
    ).join("");
    const archiveHtml = archivedDocs.length ? '\n      <details class="document-contract-group">\n        <summary>Архив замененных файлов '.concat(pill("".concat(archivedDocs.length, " шт."), "warning"), '</summary>\n        <div class="document-list">').concat(archivedDocs.map((doc) => '<div class="document-row">'.concat(documentFileLink(doc), "</div>")).join(""), "</div>\n      </details>") : "";
    return activeHtml || archiveHtml ? "".concat(activeHtml).concat(archiveHtml) : '<p class="muted">Документы пока не загружены. Добавить договор, смету или проект можно через кнопку “Редактировать”.</p>';
  }
  function renderDocumentSummary(docs, contracts = []) {
    return '\n    <section class="workflow-panel document-summary compact-collapsible">\n      <details>\n        <summary>\n          <span>Документы объекта</span>\n          '.concat(pill("".concat(docs.length, " шт."), docs.length ? "blue" : ""), "\n        </summary>\n        ").concat(renderGroupedProjectDocuments(docs, contracts), "\n      </details>\n    </section>");
  }
  function renderCollapsibleList({ items, visibleCount = 3, emptyText = "Пока пусто.", renderItem, moreLabel = "Показать еще", key = "" }) {
    if (!items.length) return '<p class="muted">'.concat(emptyText, "</p>");
    const visible = items.slice(0, visibleCount).map(renderItem).join("");
    const hidden = items.slice(visibleCount);
    if (!hidden.length) return visible;
    return "\n    ".concat(visible, '\n    <details class="inline-collapsible" ').concat(key ? 'data-collapsible-key="'.concat(key, '" ').concat(state.expandedLists[key] ? "open" : "") : "", ">\n      <summary>").concat(moreLabel, ": ").concat(hidden.length, '</summary>\n      <div class="list compact-hidden-list">\n        ').concat(hidden.map(renderItem).join(""), "\n      </div>\n    </details>");
  }
  function renderDashboardTaskRow(task) {
    return '\n    <button class="row clickable dashboard-task-row" type="button" data-open-task="'.concat(task.id, '">\n      <div class="stack-line"><strong>').concat(task.title, "</strong>").concat(pill(label(task.status), taskStatusLevel(task.status))).concat(pill(task.due_date || "без срока", levelByDate(task.due_date)), '</div>\n      <div class="muted">').concat(task.project_title, " · ответственный: ").concat(task.assignee_name || "не назначен", " · принимает: ").concat(task.reviewer_name || task.creator_name || "не назначен", "</div>\n    </button>");
  }
  function showToast(message) {
    const toast = qs("#toast");
    toast.textContent = message;
    toast.classList.add("active");
    setTimeout(() => toast.classList.remove("active"), 2200);
  }
  function setAppLoading(isLoading, message = "", key = "global") {
    if (isLoading) state.loadingKeys.add(key);
    else state.loadingKeys.delete(key);
    const overlay = qs("#appLoadingOverlay");
    if (!overlay) return;
    const active = state.loadingKeys.size > 0;
    overlay.hidden = !active;
    overlay.classList.toggle("is-active", active);
    document.body.classList.toggle("app-is-loading", active);
    if (message) {
      const messageNode = overlay.querySelector("[data-app-loading-message]");
      if (messageNode) messageNode.textContent = message;
    }
  }
  async function withAppLoading(message, task, key = "manual-".concat(Date.now())) {
    setAppLoading(true, message, key);
    try {
      return await task();
    } finally {
      setAppLoading(false, "", key);
    }
  }
  async function refreshAppFromUser(message = "Обновляем данные") {
    await withAppLoading(message, async () => {
      await loadAll();
      showToast("Данные обновлены");
    }, "user-refresh");
  }
  function setProjectFormStatus(message = "", level = "pending") {
    const status = qs("#projectFormStatus");
    if (!status) return;
    status.textContent = message;
    status.hidden = !message;
    status.className = "form-status ".concat(level || "").trim();
  }
  function setProjectFileStatus(message = "", level = "pending") {
    const status = qs("#projectFileStatus");
    if (!status) return;
    status.textContent = message;
    status.hidden = !message;
    status.className = "form-status file-status ".concat(level || "").trim();
  }
  function setProjectExistingFiles(project = null) {
    const node = qs("#projectExistingFiles");
    if (!node) return;
    if (!project) {
      node.hidden = true;
      node.innerHTML = "";
      return;
    }
    const docs = Array.isArray(project.documents) ? project.documents.filter((doc) => doc.status !== "archived") : [];
    const requiredGroups = [
      ["smetter_materials", "Файл материалов из Сметтера"],
      ["smetter_work_task", "Задание на работы из Сметтера"],
      ["contract", "Первичный договор"],
      ["main_estimate", "Смета"],
      ["project_documentation", "Проектная документация"]
    ];
    const rows = requiredGroups.map(([type, title]) => {
      const groupDocs = docs.filter((doc) => doc.type === type);
      const files = groupDocs.length ? groupDocs.map((doc) => "<span>".concat(escapeHtml(doc.file_name || documentTitle(doc)), "</span>")).join("") : '<span class="muted">не прикреплено</span>';
      return '\n        <div class="attached-draft-files-row '.concat(groupDocs.length ? "is-present" : "is-missing", '">\n          <strong>').concat(escapeHtml(title), "</strong>\n          <div>").concat(files, "</div>\n        </div>");
    }).join("");
    node.hidden = false;
    node.innerHTML = '\n    <div class="attached-draft-files-head">\n      <strong>Уже сохранено в карточке объекта</strong>\n      <span>Поля выбора файлов выше остаются пустыми в браузере. Они нужны только для добавления новых файлов.</span>\n    </div>\n    '.concat(rows);
  }
  function projectFileSummary(form) {
    const fields = [
      ["estimate_file_name", "материалы"],
      ["work_task_file", "задание на работы"],
      ["contract_file", "договор"],
      ["estimate_doc_file", "смета"],
      ["project_docs_file", "проектная документация"]
    ];
    const selected = [];
    fields.forEach(([name, labelText]) => {
      const input = form.elements[name];
      const files = Array.from((input == null ? void 0 : input.files) || []);
      if (!files.length) return;
      selected.push(files.length === 1 ? "".concat(labelText, ": ").concat(files[0].name) : "".concat(labelText, ": ").concat(files.length, " файлов"));
    });
    return selected;
  }
  function updateProjectFileStatus(form) {
    if (!form || form.dataset.mode === "edit") {
      setProjectFileStatus("");
      return;
    }
    const selected = projectFileSummary(form);
    if (!selected.length) {
      setProjectFileStatus("");
      return;
    }
    setProjectFileStatus("Выбраны файлы для отправки на сервер: ".concat(selected.join("; "), ". Чтобы они попали в черновик, нажмите “Сохранить черновик”. После обновления страницы браузер сам не восстановит выбранные файлы."), "pending");
  }
  function projectDraftSnapshot(form) {
    const values = {};
    PROJECT_TEXT_DRAFT_FIELDS.forEach((name) => {
      var _a;
      values[name] = ((_a = form.elements[name]) == null ? void 0 : _a.value) || "";
    });
    const fileNames = {};
    PROJECT_REQUIRED_FIELDS.forEach(([name]) => {
      var _a;
      const input = form.elements[name];
      if ((input == null ? void 0 : input.type) === "file" && ((_a = input.files) == null ? void 0 : _a.length)) fileNames[name] = Array.from(input.files).map((file) => file.name);
    });
    return { values, fileNames, savedAt: (/* @__PURE__ */ new Date()).toISOString() };
  }
  function hasProjectDraft(snapshot) {
    return Boolean(
      snapshot && (Object.values(snapshot.values || {}).some((value) => String(value || "").trim()) || Object.values(snapshot.fileNames || {}).some(Boolean))
    );
  }
  function saveProjectFormDraft(form) {
    if (!form || form.dataset.mode === "edit") return;
    updateProjectFileStatus(form);
    const snapshot = projectDraftSnapshot(form);
    if (!hasProjectDraft(snapshot)) {
      localStorage.removeItem(PROJECT_FORM_DRAFT_KEY);
      return;
    }
    localStorage.setItem(PROJECT_FORM_DRAFT_KEY, JSON.stringify(snapshot));
  }
  function clearProjectFormDraft() {
    localStorage.removeItem(PROJECT_FORM_DRAFT_KEY);
  }
  function restoreProjectFormDraft(form) {
    if (!form || form.dataset.mode === "edit") return;
    let snapshot = null;
    try {
      snapshot = JSON.parse(localStorage.getItem(PROJECT_FORM_DRAFT_KEY) || "null");
    } catch (error) {
      snapshot = null;
    }
    if (!hasProjectDraft(snapshot)) {
      setProjectFormStatus("");
      updateProjectFileStatus(form);
      return;
    }
    PROJECT_TEXT_DRAFT_FIELDS.forEach((name) => {
      var _a;
      if (form.elements[name] && ((_a = snapshot.values) == null ? void 0 : _a[name])) form.elements[name].value = snapshot.values[name];
    });
    const fileNames = Object.values(snapshot.fileNames || {}).flat().filter(Boolean);
    const note = fileNames.length ? "Черновик текстовых полей восстановлен. Файлы браузер не восстанавливает после обновления, выберите их снова: ".concat(fileNames.join(", "), ".") : "Черновик текстовых полей восстановлен.";
    setProjectFormStatus(note, "pending");
    updateProjectFileStatus(form);
  }
  function setProjectSaving(isSaving, message = "") {
    setAppLoading(isSaving, message || "Сохраняем карточку", "project-form");
    const form = qs("#projectForm");
    if (form) {
      form.classList.toggle("is-saving", isSaving);
      form.setAttribute("aria-busy", isSaving ? "true" : "false");
    }
    qsa("#projectDraftButton, #projectSubmitButton").forEach((button) => {
      button.disabled = isSaving;
    });
    if (message) setProjectFormStatus(message, isSaving ? "pending" : "");
  }
  function missingProjectRequiredFields(form, saveMode) {
    if (saveMode === "draft") return [];
    const isEdit = form.dataset.mode === "edit";
    return PROJECT_REQUIRED_FIELDS.filter(([name]) => {
      var _a;
      const input = form.elements[name];
      if (!input) return false;
      if (input.type === "file") {
        if (isEdit) return false;
        return !((_a = input.files) == null ? void 0 : _a.length);
      }
      return !String(input.value || "").trim();
    });
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
    qs("#".concat(view, "View")).classList.add("active");
    qs("#pageTitle").textContent = viewTitles[view];
    syncTopbarAccess();
    initSortableZones();
  }
  function clearProjectDetail() {
    const detail = qs("#projectDetail");
    if (!detail) return;
    detail.innerHTML = '<p class="muted">&#1042;&#1099;&#1073;&#1077;&#1088;&#1080;&#1090;&#1077; &#1086;&#1073;&#1098;&#1077;&#1082;&#1090; &#1080;&#1079; &#1089;&#1087;&#1080;&#1089;&#1082;&#1072;.</p>';
  }
  function sortableOrderKey(zoneId) {
    return "sortable-order:".concat(zoneId);
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
    const placed = /* @__PURE__ */ new Set();
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
        const offset = (y - box.top - box.height / 2) * 1e4 + (x - box.left - box.width / 2);
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
          var _a;
          block.classList.remove("dragging");
          if ((_a = block.parentElement) == null ? void 0 : _a.dataset.sortableZone) saveSortableOrder(block.parentElement);
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
    const [users, projects, archivedProjects, estimateJobs] = await Promise.all([
      api("/api/users"),
      api("/api/projects"),
      api("/api/projects/archive"),
      canView("estimates") ? api("/api/estimate-jobs") : Promise.resolve([])
    ]);
    state.users = users;
    state.projects = projects;
    state.archivedProjects = archivedProjects;
    state.estimateJobs = estimateJobs;
    const availableProjects = state.projectListMode === "archive" ? archivedProjects : projects;
    if (state.selectedProjectId && !availableProjects.some((project) => Number(project.id) === Number(state.selectedProjectId))) {
      state.selectedProjectId = null;
    }
    fillSelects();
    syncNavigationAccess();
  }
  async function loadAll() {
    await loadCoreData();
    await Promise.all([
      renderDashboard(),
      renderNotifications(),
      renderProjects(),
      renderEstimateJobs(),
      renderTasks(),
      renderWorks(),
      renderMaterials(),
      renderLocations(),
      renderEstimateMaterials(),
      renderVariations(),
      renderDocuments(),
      renderFeedback(),
      renderEvents()
    ]);
    initSortableZones();
    syncNavigationAccess();
  }
  function isMobileTouchViewport() {
    return window.matchMedia("(max-width: 760px)").matches && "ontouchstart" in window;
  }
  function pageAtTop() {
    return window.scrollY <= 0 && document.documentElement.scrollTop <= 0 && document.body.scrollTop <= 0;
  }
  function updatePullRefreshIndicator(distance = 0, phase = "idle") {
    const indicator = qs("#pullRefreshIndicator");
    if (!indicator) return;
    const clamped = Math.max(0, Math.min(distance, 112));
    const ready = phase === "ready";
    const refreshing = phase === "refreshing";
    indicator.classList.toggle("is-visible", clamped > 10 || refreshing);
    indicator.classList.toggle("is-ready", ready);
    indicator.classList.toggle("is-refreshing", refreshing);
    indicator.style.setProperty("--pull-offset", "".concat(Math.max(-72, Math.round(clamped - 92)), "px"));
    indicator.style.setProperty("--pull-angle", "".concat(Math.max(32, Math.round(clamped / 92 * 360)), "deg"));
    const message = indicator.querySelector("[data-pull-refresh-message]");
    if (message) {
      message.textContent = refreshing ? "Обновляем Контур" : ready ? "Отпустите, чтобы обновить" : "Потяните вниз для обновления";
    }
  }
  function resetPullRefreshIndicator(delay = 0) {
    window.setTimeout(() => {
      state.pullRefresh = { tracking: false, startY: 0, distance: 0, ready: false, refreshing: false };
      updatePullRefreshIndicator(0, "idle");
      document.body.classList.remove("pull-refresh-active");
    }, delay);
  }
  async function triggerPullRefresh() {
    if (state.pullRefresh.refreshing) return;
    state.pullRefresh.refreshing = true;
    updatePullRefreshIndicator(96, "refreshing");
    try {
      await refreshAppFromUser("Обновляем Контур");
    } catch (error) {
      showToast(error.message || "Не удалось обновить данные");
    } finally {
      resetPullRefreshIndicator(450);
    }
  }
  function initPullToRefresh() {
    window.addEventListener(
      "touchstart",
      (event) => {
        var _a, _b;
        if (!isMobileTouchViewport() || hasOpenDialog() || state.pullRefresh.refreshing) return;
        if (event.touches.length !== 1 || !pageAtTop()) return;
        if ((_b = (_a = event.target).closest) == null ? void 0 : _b.call(_a, "input, textarea, select, button, a, .sidebar, dialog")) return;
        state.pullRefresh.tracking = true;
        state.pullRefresh.startY = event.touches[0].clientY;
        state.pullRefresh.distance = 0;
        state.pullRefresh.ready = false;
      },
      { passive: true }
    );
    window.addEventListener(
      "touchmove",
      (event) => {
        if (!state.pullRefresh.tracking || state.pullRefresh.refreshing || event.touches.length !== 1) return;
        const distance = event.touches[0].clientY - state.pullRefresh.startY;
        if (distance <= 0 || !pageAtTop()) {
          resetPullRefreshIndicator();
          return;
        }
        event.preventDefault();
        const eased = Math.min(120, Math.pow(distance, 0.86) * 2.25);
        state.pullRefresh.distance = eased;
        state.pullRefresh.ready = eased >= 88;
        document.body.classList.add("pull-refresh-active");
        updatePullRefreshIndicator(eased, state.pullRefresh.ready ? "ready" : "pulling");
      },
      { passive: false }
    );
    window.addEventListener(
      "touchend",
      () => {
        if (!state.pullRefresh.tracking || state.pullRefresh.refreshing) return;
        if (state.pullRefresh.ready) triggerPullRefresh();
        else resetPullRefreshIndicator();
      },
      { passive: true }
    );
    window.addEventListener(
      "touchcancel",
      () => {
        if (!state.pullRefresh.refreshing) resetPullRefreshIndicator();
      },
      { passive: true }
    );
  }
  function fillSelects() {
    const projectOptions = state.projects.map((project) => '<option value="'.concat(project.id, '">').concat(project.title, "</option>")).join("");
    const optionalProjectOptions = '<option value="">Без объекта</option>'.concat(projectOptions);
    const userOptions = state.users.map((user) => '<option value="'.concat(user.id, '">').concat(user.name, "</option>")).join("");
    const taskUserOptions = taskParticipantOptions();
    qsa('select[name="project_id"]').forEach((select) => select.innerHTML = projectOptions);
    const estimateProjectSelect = qs('#estimateJobForm select[name="project_id"]');
    if (estimateProjectSelect) estimateProjectSelect.innerHTML = optionalProjectOptions;
    const estimateManagerSelect = qs('#estimateJobForm select[name="manager_id"]');
    if (estimateManagerSelect) estimateManagerSelect.innerHTML = userOptionsByRole("sales_manager");
    const estimateEstimatorSelect = qs('#estimateJobForm select[name="estimator_id"]');
    if (estimateEstimatorSelect) estimateEstimatorSelect.innerHTML = userOptionsByRole("estimator");
    const workProject = workProjectId();
    qsa('#workProjectForm select[name="project_id"], #workExtraForm select[name="project_id"]').forEach((select) => {
      if (workProject) select.value = String(workProject);
    });
    qsa('select[name="owner_id"], select[name="responsible_id"]').forEach((select) => select.innerHTML = userOptions);
    qsa('#taskForm select[name="assignee_id"], #taskForm select[name="reviewer_id"]').forEach((select) => select.innerHTML = taskUserOptions);
    updateEstimateMaterialSelect();
    fillRoleSwitcher();
    fillMaterialProjectSelect();
    updateMaterialActorHint();
  }
  async function loadTaskContractOptions(projectId) {
    const select = qs('#taskForm select[name="contract_id"]');
    if (!select) return;
    select.innerHTML = '<option value="">Без привязки к договору</option>';
    if (!projectId) return;
    try {
      const project = await api("/api/projects/".concat(projectId));
      const contracts = Array.isArray(project.contracts) ? project.contracts : [];
      select.innerHTML = '<option value="">'.concat(contracts.length ? "Выберите договор / доп. соглашение" : "Без привязки к договору", "</option>") + contracts.map((contract) => '<option value="'.concat(contract.id, '">').concat(contractType(contract.type), ": ").concat(escapeHtml(contract.title || "документ"), "</option>")).join("");
      if (contracts.length) select.value = String(contracts[0].id);
    } catch (error) {
      select.innerHTML = '<option value="">Без привязки к договору</option>';
    }
  }
  function fillRoleSwitcher() {
    var _a, _b, _c, _d, _e, _f, _g;
    const select = qs("#currentRoleSelect");
    if (!select) return;
    const selected = state.currentRole;
    if (!state.canSwitchRole) {
      const sessionUser = ((_a = state.session) == null ? void 0 : _a.user) || state.users.find((user) => {
        var _a2;
        return user.id === Number((_a2 = state.session) == null ? void 0 : _a2.user_id);
      });
      const value = roleValueForUser(sessionUser, (_b = state.session) == null ? void 0 : _b.role);
      const title = roleLabel(value);
      select.innerHTML = '<option value="'.concat(value, '">').concat(title, "</option>");
      select.value = value;
      select.disabled = true;
      (_c = select.closest(".role-switcher")) == null ? void 0 : _c.classList.add("locked");
      state.currentRole = value;
      syncNavigationAccess();
      return;
    }
    select.disabled = false;
    (_d = select.closest(".role-switcher")) == null ? void 0 : _d.classList.remove("locked");
    const options = availableRoleOptions();
    select.innerHTML = options.map(([value, title]) => '<option value="'.concat(value, '">').concat(title, "</option>")).join("");
    const ownRole = roleValueForUser((_e = state.session) == null ? void 0 : _e.user, (_f = state.session) == null ? void 0 : _f.role);
    select.value = options.some(([value]) => value === selected) ? selected : options.some(([value]) => value === ownRole) ? ownRole : ((_g = options[0]) == null ? void 0 : _g[0]) || ownRole || "construction_manager";
    state.currentRole = select.value;
    localStorage.setItem("currentRole", state.currentRole);
    syncNavigationAccess();
  }
  function usersByRole(role) {
    return state.users.filter((user) => user.role === role);
  }
  function userOptionsByRole(role, { includeEmpty = false, selectedId = "" } = {}) {
    const empty = includeEmpty ? '<option value="">Не назначен</option>' : "";
    return empty + usersByRole(role).map((user) => '<option value="'.concat(user.id, '" ').concat(Number(selectedId) === Number(user.id) ? "selected" : "", ">").concat(user.name, "</option>")).join("");
  }
  function taskParticipantLabel(user) {
    if (user.role === "owner") return "Ген.директор";
    if (user.role === "finance_director") return "Фин.директор";
    if (user.role === "accountant") return "Бухгалтер";
    if (user.role === "construction_manager") return "Рук.по строительству";
    if (user.role === "technical_supervisor") return "Технадзор";
    if (user.role === "foreman") return "Прораб ".concat(user.name);
    if (user.role === "estimator") return "Сметчик ".concat(user.name);
    return user.name;
  }
  function taskParticipantOptions() {
    const order = { technical_supervisor: 1, foreman: 2, estimator: 3, construction_manager: 4, finance_director: 5, accountant: 6, owner: 7 };
    return state.users.filter((user) => ["technical_supervisor", "foreman", "estimator", "construction_manager", "finance_director", "accountant", "owner"].includes(user.role)).sort((a, b) => (order[a.role] || 99) - (order[b.role] || 99) || a.name.localeCompare(b.name, "ru")).map((user) => '<option value="'.concat(user.id, '">').concat(taskParticipantLabel(user), "</option>")).join("");
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
      select.innerHTML = '<option value="">Нет объектов, закрепленных за этой ролью</option>';
      select.disabled = true;
      return null;
    }
    select.disabled = false;
    select.innerHTML = projects.map((project) => '<option value="'.concat(project.id, '">').concat(project.title, "</option>")).join("");
    const preferred = projects.find((project) => Number(project.id) === Number(preferredProjectId));
    select.value = String((preferred || projects[0]).id);
    return Number(select.value);
  }
  function updateMaterialActorHint() {
    const hint = qs("#materialActorHint");
    if (!hint) return;
    const role = roleLabel(state.currentRole);
    if (currentRoleBase() === "foreman") {
      hint.textContent = "Заявка уйдет от роли: ".concat(role, ". В списке доступны только объекты, закрепленные за этим прорабом.");
      return;
    }
    hint.textContent = "Заявка уйдет от роли: ".concat(role, ".");
  }
  async function updateEstimateMaterialSelect() {
    const projectSelect = qs('#materialForm select[name="project_id"]');
    const materialSelect = qs("#estimateMaterialSelect");
    if (!projectSelect || !materialSelect || !projectSelect.value) return;
    state.estimateMaterials = await api("/api/estimate-materials?project_id=".concat(projectSelect.value));
    materialSelect.innerHTML = [
      '<option value="">Выбрать из списка сметы</option>',
      ...state.estimateMaterials.map(
        (item) => '<option value="'.concat(item.id, '" data-section="').concat(item.section || "", '" data-name="').concat(item.name, '" data-total="').concat(item.total_price || 0, '">\n          ').concat(item.section || "Без раздела", " · ").concat(item.name, " · ").concat(item.estimated_quantity || 0, " ").concat(item.unit || "", "\n        </option>")
      )
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
  function estimateSectionKey(scope, projectId, section) {
    return "".concat(scope, ":").concat(projectId || "none", ":").concat(section || "no-section");
  }
  function openAttrForKey(key) {
    return state.expandedLists[key] ? " open" : "";
  }
  async function renderEstimateMaterials() {
    var _a;
    const projectSelect = qs('#estimateImportForm select[name="project_id"]');
    const projectId = (projectSelect == null ? void 0 : projectSelect.value) || state.selectedProjectId || ((_a = state.projects[0]) == null ? void 0 : _a.id);
    if (!projectId) return;
    const rows = await api("/api/estimate-materials?project_id=".concat(projectId));
    qs("#toggleEstimateMaterialsButton").textContent = state.showEstimateMaterials ? "Скрыть материалы" : "Материалы по смете";
    if (!rows.length) {
      qs("#estimateMaterialRows").innerHTML = '<p class="muted">По этому объекту материалы сметы еще не загружены.</p>';
      return;
    }
    if (!state.showEstimateMaterials) {
      const sections = Object.keys(groupBySection(rows)).length;
      qs("#estimateMaterialRows").innerHTML = '<p class="muted">Загружено '.concat(rows.length, " позиций в ").concat(sections, " разделах. Нажмите “Материалы по смете”, чтобы открыть список по разделам.</p>");
      return;
    }
    const grouped = groupBySection(rows);
    qs("#estimateMaterialRows").innerHTML = Object.entries(grouped).map(([section, sectionRows]) => {
      const key = estimateSectionKey("estimate-materials", projectId, section);
      return '\n      <details class="estimate-section" data-collapsible-key="'.concat(escapeAttr(key), '"').concat(openAttrForKey(key), ">\n        <summary>").concat(section, " <span>").concat(sectionRows.length, ' позиций</span></summary>\n        <div class="table">\n          ').concat(sectionRows.map(
        (row) => '\n              <div class="row estimate-material-row">\n                <div class="material-main">\n                  <strong>'.concat(row.name, '</strong>\n                  <div class="muted">').concat(row.section || "Без раздела", '</div>\n                </div>\n                <div class="stack-line">\n                  ').concat(pill("".concat(row.estimated_quantity || 0, " ").concat(row.unit || ""), "blue"), "\n                  ").concat(pill(money(row.total_price), "success"), '\n                  <span class="muted">Цена: ').concat(money(row.unit_price), "</span>\n                </div>\n              </div>")
      ).join(""), "\n        </div>\n      </details>");
    }).join("");
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
    const checkbox = row.querySelector("[data-material-check]");
    const quantityInput = row.querySelector("[data-material-quantity]");
    const reason = row.querySelector("[data-material-reason]");
    const estimated = Number(row.dataset.estimated || 0);
    const quantity = Number(quantityInput.value || 0);
    quantityInput.disabled = !checkbox.checked;
    reason.hidden = !(checkbox.checked && estimated && quantity > estimated);
    reason.querySelector("textarea").required = checkbox.checked && estimated && quantity > estimated;
    row.classList.remove("success", "warning", "danger");
    if (checkbox.checked) row.classList.add(materialRowTone(quantity, estimated));
  }
  function renderExtraMaterialRow() {
    return '\n    <div class="row extra-material-row">\n      <label>Материал <input data-extra-material-field="material" placeholder="Например: плиточный клей" /></label>\n      <label>Наименование <input data-extra-material-field="name" placeholder="Марка, размер, артикул" /></label>\n      <label>Количество <input data-extra-material-field="quantity" type="number" min="0" step="0.001" placeholder="0" /></label>\n      <label>\n        Причина\n        <select data-extra-material-field="reason">\n          <option value="additional_work">Доп</option>\n          <option value="material_replacement">Замена</option>\n          <option value="main_estimate_overspend">Превышение</option>\n        </select>\n      </label>\n      <button class="icon" type="button" data-remove-extra-material>×</button>\n    </div>';
  }
  function addExtraMaterialRow(containerSelector = "#extraMaterialRows") {
    var _a;
    if (typeof containerSelector !== "string") containerSelector = "#extraMaterialRows";
    (_a = qs(containerSelector)) == null ? void 0 : _a.insertAdjacentHTML("beforeend", renderExtraMaterialRow());
  }
  function resetExtraMaterials() {
    qs("#extraMaterialRows").innerHTML = "";
  }
  function collectExtraMaterials(containerSelector = "#extraMaterialRows") {
    return qsa("".concat(containerSelector, " .extra-material-row")).map((row) => ({
      material: row.querySelector('[data-extra-material-field="material"]').value.trim(),
      name: row.querySelector('[data-extra-material-field="name"]').value.trim(),
      quantity: row.querySelector('[data-extra-material-field="quantity"]').value,
      reason: row.querySelector('[data-extra-material-field="reason"]').value
    })).filter((item) => item.material || item.name || Number(item.quantity || 0) > 0);
  }
  async function loadMaterialEstimatePicker() {
    const form = qs("#materialForm");
    const projectId = form.elements.project_id.value;
    const target = qs("#materialEstimatePicker");
    updateMaterialActorHint();
    if (!projectId) {
      target.innerHTML = '<p class="muted">У выбранной роли нет объектов для заявки.</p>';
      return;
    }
    const rows = await api("/api/estimate-materials?project_id=".concat(projectId));
    if (!rows.length) {
      target.innerHTML = '<p class="muted">По этому объекту нет загруженных материалов сметы.</p>';
      return;
    }
    const grouped = groupBySection(rows);
    target.innerHTML = Object.entries(grouped).map(([section, sectionRows]) => {
      const key = estimateSectionKey("material-picker", projectId, section);
      return '\n      <details class="estimate-section" data-collapsible-key="'.concat(escapeAttr(key), '"').concat(openAttrForKey(key), ">\n        <summary>").concat(section, " <span>").concat(sectionRows.length, ' позиций</span></summary>\n        <div class="table">\n          ').concat(sectionRows.map(
        (row) => '\n              <div class="row estimate-choice-row" data-estimate-id="'.concat(row.id, '" data-estimated="').concat(row.estimated_quantity || 0, '">\n                <label class="estimate-choice-title">\n                  <input type="checkbox" data-material-check />\n                  <span><strong>').concat(row.name, "</strong><small>").concat(row.estimated_quantity || 0, " ").concat(row.unit || "", " по смете · ").concat(money(row.total_price), '</small></span>\n                </label>\n                <label>Количество к заказу <input data-material-quantity type="number" min="0" step="0.001" value="').concat(row.estimated_quantity || 0, '" disabled /></label>\n                <div class="estimate-over-reason" data-material-reason hidden>\n                  <label>Причина превышения <textarea rows="2" placeholder="Почему заказываем сверх сметы"></textarea></label>\n                </div>\n              </div>')
      ).join(""), "\n        </div>\n      </details>");
    }).join("");
  }
  function materialBatchKey(item) {
    return item.batch_id ? "batch-".concat(item.batch_id) : "item-".concat(item.id);
  }
  function buildMaterialBatches(items) {
    const map = /* @__PURE__ */ new Map();
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
          actual_purchase_amount: Number(item.batch_actual_purchase_amount || 0),
          variation_id: item.batch_variation_id || "",
          variation_title: item.batch_variation_title || "",
          variation_status: item.batch_variation_status || "",
          archived_at: item.batch_archived_at || "",
          items: [],
          total_amount: 0
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
    const prefix = received ? "Получена ".concat(title) : title[0].toUpperCase() + title.slice(1);
    return "".concat(prefix, " на материалы от ").concat(formatDateRu(batch.created_at) || "без даты");
  }
  function materialBatchLevel(status) {
    return {
      new: "warning",
      in_work: "blue",
      revision_requested: "danger",
      delivery_confirmed: "success",
      delivery_scheduled: "blue",
      received: "success",
      receipt_issue: "danger"
    }[status] || "";
  }
  function materialReceiptAttachment(batch) {
    if (!batch.receipt_document_id) return "";
    const fileName = batch.receipt_document_file_name || batch.receipt_document_title || "Файл приемки";
    const href = "/api/documents/".concat(batch.receipt_document_id, "/download");
    const isImage = String(batch.receipt_document_mime_type || "").startsWith("image/");
    return '\n    <div class="receipt-attachment">\n      <a href="'.concat(href, '" target="_blank" rel="noopener">').concat(fileName, "</a>\n      ").concat(isImage ? '<a href="'.concat(href, '" target="_blank" rel="noopener"><img src="').concat(href, '" alt="').concat(escapeAttr(fileName), '" /></a>') : "", "\n    </div>");
  }
  function materialBatchHasDeviation(batch) {
    return batch.items.some((item) => item.basis_type && item.basis_type !== "main_estimate");
  }
  function materialActualTotal(item) {
    return Number(item.actual_total_amount || 0);
  }
  function materialActualOverrun(item) {
    const actual = materialActualTotal(item);
    const planned = Number(item.total_amount || 0);
    return actual > 0 && planned > 0 && actual > planned;
  }
  function materialBatchBasisSummary(batch) {
    const counts = (batch.items || []).reduce((acc, item) => {
      const key = item.basis_type || "main_estimate";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([type, count]) => "".concat(materialBasisLabel(type), ": ").concat(count)).join(" · ");
  }
  function materialBatchDestination(batch) {
    if (!materialBatchHasDeviation(batch)) return "Куда внесено: основная смета";
    if (batch.variation_id) {
      return "Куда внесено: Допработы и отклонения — ".concat(batch.variation_title || "#".concat(batch.variation_id), " (").concat(label(batch.variation_status), ")");
    }
    return "Куда внести: требуется создать связанную допработу/отклонение";
  }
  function collectMaterialActualItems(batch) {
    return (batch.items || []).map((item) => {
      var _a, _b;
      return {
        id: item.id,
        actual_unit_price: ((_a = qs('[data-material-actual-unit="'.concat(item.id, '"]'))) == null ? void 0 : _a.value) || "",
        actual_total_amount: ((_b = qs('[data-material-actual-total="'.concat(item.id, '"]'))) == null ? void 0 : _b.value) || ""
      };
    });
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
  function isCurrentForemanForMaterialBatch(batch) {
    return currentRoleBase() === "foreman" && [Number(batch.project_foreman_id), Number(batch.creator_id)].includes(Number(currentUserId()));
  }
  function canReceiveMaterialBatch(batch) {
    return Boolean(batch.id && batch.status === "delivery_scheduled" && isCurrentForemanForMaterialBatch(batch));
  }
  function materialReceiptActionNote(batch) {
    if (state.materialListMode === "archive" || currentRoleBase() !== "foreman") return "";
    if (canReceiveMaterialBatch(batch)) {
      return '<div class="material-receipt-note active">Доставка назначена'.concat(batch.scheduled_delivery_date ? " на ".concat(formatDateRu(batch.scheduled_delivery_date)) : "", ". Откройте заявку и подтвердите получение или проблему.</div>");
    }
    if (["new", "revision_requested"].includes(batch.status)) {
      return '<div class="muted">Приемка появится после того, как снабжение примет заявку и назначит доставку.</div>';
    }
    if (batch.status === "in_work") {
      return '<div class="muted">Заявка в работе у снабжения. Подтверждение получения появится после назначения даты доставки.</div>';
    }
    if (batch.status === "receipt_issue") {
      return '<div class="material-receipt-note danger">Проблема при приемке отправлена снабжению. Ожидается исправление или повторная доставка.</div>';
    }
    if (batch.status === "received") {
      return '<div class="material-receipt-note success">Получение по заявке подтверждено.</div>';
    }
    return "";
  }
  function renderMaterialBatchEditSection(batch) {
    return '\n    <section class="workflow-panel material-batch-edit-panel">\n      <h3>Исправление заявки</h3>\n      <p class="muted">Пока снабжение не взяло заявку в работу, ее можно изменить или удалить. После принятия в работу правки блокируются.</p>\n      <div class="table material-batch-edit-list" id="materialBatchEditRows">\n        '.concat(batch.items.map(
      (item) => '\n            <div class="row material-batch-edit-row" data-edit-item-id="'.concat(item.id, '">\n              <div class="material-main">\n                <strong>').concat(item.title, '</strong>\n                <div class="muted">').concat(item.estimate_section || "без раздела", "</div>\n                ").concat(!item.estimate_material_id ? '<label>Наименование <input data-edit-item-title value="'.concat(escapeAttr(item.title), '" /></label>') : "", '\n              </div>\n              <label>Количество <input data-edit-item-quantity type="number" min="0" step="0.001" value="').concat(item.requested_quantity || item.estimated_quantity || 0, '" /></label>\n              ').concat(!item.estimate_material_id ? '<label>Причина\n                      <select data-edit-item-basis>\n                        <option value="additional_work" '.concat(item.basis_type === "additional_work" ? "selected" : "", '>Доп</option>\n                        <option value="material_replacement" ').concat(item.basis_type === "material_replacement" ? "selected" : "", '>Замена</option>\n                        <option value="main_estimate_overspend" ').concat(item.basis_type === "main_estimate_overspend" ? "selected" : "", '>Превышение</option>\n                        <option value="over_budget_cost" ').concat(item.basis_type === "over_budget_cost" ? "selected" : "", ">Сверх бюджета</option>\n                      </select>\n                    </label>") : "<div>".concat(pill(materialBasisLabel(item.basis_type), materialBasisLevel(item.basis_type)), "</div>"), '\n              <label class="wide-field">Комментарий <textarea data-edit-item-comment rows="2">').concat(item.comment || "", '</textarea></label>\n              <label class="check-line"><input data-edit-item-remove type="checkbox" /> Удалить позицию</label>\n            </div>')
    ).join(""), '\n      </div>\n      <div class="stack-line material-extra-head">\n        <h4>Добавить новые материалы</h4>\n        <button class="secondary" type="button" data-add-batch-extra-material>Добавить строку</button>\n      </div>\n      <div class="table" id="batchExtraMaterialRows"></div>\n      <label>Желаемая дата доставки <input id="materialBatchUpdateNeededAt" type="date" value="').concat(batch.needed_at || "", '" /></label>\n      <label>Комментарий к исправлению <textarea id="materialBatchUpdateComment" rows="3" placeholder="Например: уточнил длину арматуры, добавил замену"></textarea></label>\n      <div class="form-actions">\n        <button class="primary" type="button" data-material-batch-action="update" data-material-batch-id="').concat(batch.id, '">Сохранить и отправить снова</button>\n        <button class="danger-button" type="button" data-material-batch-action="delete" data-material-batch-id="').concat(batch.id, '">Удалить заявку</button>\n      </div>\n    </section>');
  }
  function collectMaterialBatchEdits() {
    return qsa("#materialBatchEditRows .material-batch-edit-row").map((row) => {
      var _a, _b, _c, _d, _e;
      return {
        id: row.dataset.editItemId,
        title: (_a = row.querySelector("[data-edit-item-title]")) == null ? void 0 : _a.value.trim(),
        quantity: (_b = row.querySelector("[data-edit-item-quantity]")) == null ? void 0 : _b.value,
        basis_type: (_c = row.querySelector("[data-edit-item-basis]")) == null ? void 0 : _c.value,
        comment: (_d = row.querySelector("[data-edit-item-comment]")) == null ? void 0 : _d.value.trim(),
        remove: ((_e = row.querySelector("[data-edit-item-remove]")) == null ? void 0 : _e.checked) || false
      };
    });
  }
  function taskStats(tasks) {
    return {
      active: tasks.filter((task) => ["new", "in_progress_task", "review"].includes(task.status)).length,
      returned: tasks.filter((task) => task.status === "returned").length,
      waiting: tasks.filter((task) => task.status === "completed_pending_acceptance").length,
      accepted: tasks.filter((task) => task.status === "accepted").length,
      overdue: tasks.filter((task) => task.status !== "accepted" && levelByDate(task.due_date) === "danger").length
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
  function isOpenTask(task) {
    return task.status !== "accepted";
  }
  function visibleTasksForRole(tasks) {
    if (currentRoleBase() !== "foreman") return tasks;
    const userId = currentUserId();
    return tasks.filter((task) => task.project_foreman_id === userId || task.assignee_id === userId || task.reviewer_id === userId);
  }
  function renderTaskStats(tasks, activeFilter = state.taskFilter, options = {}) {
    const stats = taskStats(tasks);
    const total = Math.max(tasks.length, 1);
    const segments = [
      ["all", "Все", tasks.length, ""],
      ["active", "В работе", stats.active, "warning"],
      ["returned", "На доработке", stats.returned, "danger"],
      ["waiting", "Ждет приемки", stats.waiting, "blue"],
      ["accepted", "Принято", stats.accepted, "success"],
      ["overdue", "Просрочено", stats.overdue, "danger"]
    ];
    const visibleSegments = options.hideZero ? segments.filter(([, , count]) => Number(count || 0) > 0) : segments;
    if (!visibleSegments.length) {
      return '<div class="task-stats-empty">'.concat(escapeHtml(options.emptyText || "Активных задач пока нет."), "</div>");
    }
    return '\n    <div class="task-stats '.concat(options.hideZero ? "hide-zero" : "", " ").concat(options.compact ? "compact-tabs" : "", '">\n      ').concat(visibleSegments.map(
      ([key, title, count, level]) => '\n          <button class="task-stat '.concat(level, " ").concat(Number(count || 0) === 0 ? "is-zero" : "", " ").concat(activeFilter === key ? "active" : "", '" data-task-filter="').concat(key, '" type="button">\n            <span>').concat(title, "</span>\n            <strong>").concat(count, '</strong>\n            <div class="stat-bar"><i style="width: ').concat(count / total * 100, '%"></i></div>\n          </button>')
    ).join(""), "\n    </div>");
  }
  function taskProjectIndicatorPills(stats, openCount, newCount) {
    const items = [];
    if (newCount) items.push(pill("".concat(newCount, " требует внимания"), "warning"));
    if (stats.active) items.push(pill("В работе ".concat(stats.active), "warning"));
    if (stats.returned) items.push(pill("На доработке ".concat(stats.returned), "danger"));
    if (stats.waiting) items.push(pill("Ждет приемки ".concat(stats.waiting), "blue"));
    if (stats.accepted) items.push(pill("Принято ".concat(stats.accepted), "success"));
    if (!openCount && !newCount) items.push('<span class="muted">открытых задач нет</span>');
    return items.join("");
  }
  function taskStatusLevel(status) {
    return {
      completed_pending_acceptance: "blue",
      accepted: "success",
      returned: "danger",
      new: "warning",
      in_progress_task: "warning",
      review: "blue"
    }[status] || "";
  }
  function taskPriorityLabel(priority) {
    return {
      urgent: "Срочно",
      high: "Высокий",
      normal: "Обычный",
      low: "Низкий"
    }[priority] || "Обычный";
  }
  function taskPriorityLevel(priority) {
    return {
      urgent: "danger",
      high: "warning",
      normal: "",
      low: "success"
    }[priority] || "";
  }
  function estimateJobStatusLevel(job) {
    if (job.status === "estimate_done") return "success";
    if (levelByDate(job.due_date) === "danger") return "danger";
    return {
      estimate_new: "warning",
      estimate_in_work: "blue",
      estimate_hold: "warning",
      estimate_returned: "danger",
      estimate_question: "warning"
    }[job.status] || "";
  }
  function estimateJobTypeLabel(value) {
    return {
      primary: "Первичная",
      revision: "Корректировка",
      additional: "Допработы",
      contractor: "Проверка подрядчика",
      other: "Другое"
    }[value] || "Не указан";
  }
  function estimateSiteCostsLabel(value) {
    return {
      include: "Организацию площадки включить",
      exclude: "Организацию площадки не включать",
      clarify: "Организацию площадки уточнить"
    }[value] || "Организация площадки не указана";
  }
  function defaultSiteCostsPolicyForEstimateType(estimateType) {
    return estimateType === "primary" ? "include" : "clarify";
  }
  function estimateSiteCostsHint(estimateType) {
    if (estimateType === "primary") {
      return "Первичная смета: бытовку, биотуалет и организацию площадки включаем по умолчанию. Если не нужны, выберите другой вариант.";
    }
    return "Не первичная смета: возможно, площадка уже организована или работы велись раньше. Лучше отдельно уточнить решение.";
  }
  function normalizeCustomerBasedTitle(customerName, rawTitle) {
    const customer = String(customerName || "").trim();
    const title = String(rawTitle || "").trim();
    if (!customer) return title;
    if (!title) return customer;
    if (title.toLowerCase().includes(customer.toLowerCase())) return title;
    return "".concat(customer, " - ").concat(title);
  }
  function normalizeEstimateJobTitle(customerName, estimateTitle) {
    return normalizeCustomerBasedTitle(customerName, estimateTitle);
  }
  function syncEstimateSiteCostsByType() {
    var _a;
    const form = qs("#estimateJobForm");
    if (!form) return;
    const estimateType = ((_a = form.elements.estimate_type) == null ? void 0 : _a.value) || "primary";
    const policyField = form.elements.site_costs_policy;
    const hint = qs("#estimateSiteCostsHint");
    if (hint) hint.textContent = estimateSiteCostsHint(estimateType);
    if (policyField && form.dataset.siteCostsTouched !== "true") {
      policyField.value = defaultSiteCostsPolicyForEstimateType(estimateType);
    }
  }
  function estimateJobStats(jobs) {
    return {
      active: jobs.filter((job) => ["estimate_new", "estimate_in_work", "estimate_question"].includes(job.status)).length,
      done: jobs.filter((job) => job.status === "estimate_done").length,
      overdue: jobs.filter((job) => job.status !== "estimate_done" && levelByDate(job.due_date) === "danger").length,
      hold: jobs.filter((job) => job.status === "estimate_hold").length,
      returned: jobs.filter((job) => job.status === "estimate_returned").length,
      questions: jobs.filter((job) => job.status === "estimate_question").length
    };
  }
  function renderEstimateJobStats(jobs) {
    const stats = estimateJobStats(jobs);
    const total = Math.max(jobs.length, 1);
    const segments = [
      ["Все", jobs.length, ""],
      ["В работе", stats.active, "blue"],
      ["Просрочено", stats.overdue, "danger"],
      ["Уточнение", stats.questions, "warning"],
      ["Сдано", stats.done, "success"],
      ["Пауза", stats.hold, "warning"],
      ["Возврат", stats.returned, "danger"]
    ];
    return '\n    <div class="task-stats">\n      '.concat(segments.map(
      ([title, count, level]) => '\n          <div class="task-stat '.concat(level, '">\n            <span>').concat(title, "</span>\n            <strong>").concat(count, '</strong>\n            <div class="stat-bar"><i style="width: ').concat(count / total * 100, '%"></i></div>\n          </div>')
    ).join(""), "\n    </div>");
  }
  function estimateJobProgress(job) {
    if (job.status === "estimate_done") return 100;
    if (!job.received_at || !job.due_date) return 15;
    const start = new Date("".concat(job.received_at, "T00:00:00"));
    const end = new Date("".concat(job.due_date, "T00:00:00"));
    const today = /* @__PURE__ */ new Date();
    const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const total = Math.max(end - start, 864e5);
    return Math.max(8, Math.min(100, (current - start) / total * 100));
  }
  function renderEstimateSchedule(jobs) {
    const activeJobs = jobs.filter((job) => job.status !== "estimate_done").slice(0, 8);
    if (!activeJobs.length) return '<p class="muted">Активных сметных заданий нет.</p>';
    return activeJobs.map(
      (job) => '\n      <div class="estimate-timeline-row">\n        <div class="estimate-timeline-main">\n          <strong>'.concat(escapeHtml(job.title), "</strong>\n          <span>").concat(escapeHtml(job.estimator_name || "сметчик не назначен"), " · ").concat(formatDateRu(job.received_at), " → ").concat(formatDateRu(job.due_date), '</span>\n        </div>\n        <div class="estimate-timeline-track ').concat(estimateJobStatusLevel(job), '"><i style="width: ').concat(estimateJobProgress(job), '%"></i></div>\n        ').concat(pill(label(job.status), estimateJobStatusLevel(job)), "\n      </div>")
    ).join("");
  }
  function estimateFileDownloadUrl(file) {
    return "/api/estimate-job-files/".concat(encodeURIComponent(file.id), "/download");
  }
  function estimateSmetterHref(job = {}) {
    const direct = String(job.smetter_url || "").trim();
    if (direct) return direct;
    return [job.result_comment, job.comment, job.question_comment, job.return_comment].map(firstUrlFromText).find((url) => /smetter/i.test(url)) || "";
  }
  function isEstimateImageFile(file) {
    const mime = String((file == null ? void 0 : file.mime_type) || "").toLowerCase();
    const fileName = String((file == null ? void 0 : file.file_name) || (file == null ? void 0 : file.title) || "").toLowerCase();
    return mime.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(fileName);
  }
  function renderEstimateJobFiles(files = [], jobId = "", canManageFiles = false) {
    if (!Array.isArray(files) || !files.length) return "";
    return '\n    <div class="estimate-job-files">\n      '.concat(files.map(
      (file) => {
        var _a;
        const title = escapeHtml(file.title || file.file_name || "Файл");
        const fileName = escapeHtml(file.file_name || "");
        const href = escapeAttr(estimateFileDownloadUrl(file));
        const isCurrent = Number((_a = file.is_current) != null ? _a : 1) !== 0;
        const version = Number(file.version_no || 1);
        const versionText = "v".concat(version).concat(isCurrent ? "" : " · предыдущая");
        const note = file.replacement_note ? " · ".concat(escapeHtml(file.replacement_note)) : "";
        const printButton = '<button class="estimate-file-print" type="button" data-print-estimate-file="'.concat(escapeAttr(file.id), '">Печать</button>');
        const replaceButton = canManageFiles && isCurrent ? '<button class="estimate-file-print" type="button" data-replace-estimate-file="'.concat(escapeAttr(file.id), '" data-estimate-job-id="').concat(escapeAttr(jobId), '">Заменить</button>') : "";
        const deleteButton = canManageFiles ? '<button class="estimate-file-print danger-outline" type="button" data-delete-estimate-file="'.concat(escapeAttr(file.id), '">Удалить</button>') : "";
        const meta = "<span>".concat(fileName, "</span><span>").concat(versionText).concat(note, "</span>");
        if (isEstimateImageFile(file)) {
          return '\n          <div class="estimate-file-card '.concat(isCurrent ? "" : "previous-version", '">\n            <button class="estimate-file-button" type="button" data-estimate-gallery-job="').concat(escapeAttr(jobId), '" data-estimate-gallery-file="').concat(escapeAttr(file.id), '">\n              <strong>').concat(title, "</strong>\n              ").concat(meta, "\n            </button>\n            ").concat(printButton, "\n            ").concat(replaceButton, "\n            ").concat(deleteButton, "\n          </div>");
        }
        return '\n          <div class="estimate-file-card '.concat(isCurrent ? "" : "previous-version", '">\n            <a href="').concat(href, '" target="_blank" rel="noopener noreferrer">\n              <strong>').concat(escapeHtml(file.title || file.file_name || "Файл"), "</strong>\n              ").concat(meta, "\n            </a>\n            ").concat(printButton, "\n            ").concat(replaceButton, "\n            ").concat(deleteButton, "\n          </div>");
      }
    ).join(""), "\n    </div>");
  }
  function renderEstimateGallery() {
    const gallery = state.estimateGallery || { files: [], index: 0 };
    const files = gallery.files || [];
    const file = files[gallery.index];
    const image = qs("#estimateImagePreview");
    const titleNode = qs("#estimateImageTitle");
    const counterNode = qs("#estimateImageCounter");
    const downloadNode = qs("#estimateImageDownload");
    const prevButton = qs("#estimateImagePrev");
    const nextButton = qs("#estimateImageNext");
    if (!file || !image || !titleNode || !counterNode || !downloadNode) return;
    const href = estimateFileDownloadUrl(file);
    image.src = href;
    image.alt = file.title || file.file_name || "Фото задания";
    titleNode.textContent = file.title || file.file_name || "Фото задания";
    counterNode.textContent = "".concat(gallery.index + 1, " из ").concat(files.length);
    downloadNode.href = href;
    prevButton.disabled = files.length < 2;
    nextButton.disabled = files.length < 2;
  }
  function openEstimateGallery(jobId, fileId) {
    const job = state.estimateJobs.find((item) => Number(item.id) === Number(jobId));
    const files = ((job == null ? void 0 : job.files) || []).filter(isEstimateImageFile);
    if (!files.length) return;
    const index = Math.max(0, files.findIndex((file) => Number(file.id) === Number(fileId)));
    state.estimateGallery = { jobId: Number(jobId), files, index };
    renderEstimateGallery();
    qs("#estimateImageDialog").showModal();
  }
  function moveEstimateGallery(direction) {
    const gallery = state.estimateGallery || { files: [], index: 0 };
    const files = gallery.files || [];
    if (files.length < 2) return;
    gallery.index = (gallery.index + direction + files.length) % files.length;
    state.estimateGallery = gallery;
    renderEstimateGallery();
  }
  function renderEstimateJobRow(job) {
    const statusLevel = estimateJobStatusLevel(job);
    const canEdit = canEditEstimateJob(job);
    const canStart = canStartEstimateJob(job);
    const canFinish = canFinishEstimateJob(job);
    const canReturn = canReturnEstimateJob(job);
    const canQuestion = canQuestionEstimateJob(job);
    const canManageFiles = canManageEstimateJobFiles(job);
    const canDelete = canDeleteEstimateJob(job);
    const smetterHref = estimateSmetterHref(job);
    return '\n    <article class="row estimate-job-row">\n      <div class="estimate-job-main">\n        <div class="stack-line">\n          <strong>'.concat(escapeHtml(job.title), "</strong>\n          ").concat(pill(label(job.status), statusLevel), "\n          ").concat(pill(job.due_date || "без срока", job.status === "estimate_done" ? "success" : levelByDate(job.due_date)), '\n        </div>\n        <div class="muted">').concat(escapeHtml(job.customer_name || "Заказчик не указан"), " · ").concat(escapeHtml(job.project_title || "без карточки объекта"), " · ").concat(estimateJobTypeLabel(job.estimate_type), '</div>\n        <div class="muted">получено: ').concat(formatDateRu(job.received_at) || "не указано", " · выдал задание: ").concat(escapeHtml(job.manager_name || "не назначен"), " · сметчик: ").concat(escapeHtml(job.estimator_name || "не назначен"), '</div>\n        <div class="estimate-job-flags">\n          ').concat(pill(estimateSiteCostsLabel(job.site_costs_policy), job.site_costs_policy === "exclude" ? "warning" : job.site_costs_policy === "clarify" ? "blue" : "success"), "\n          ").concat(isPartnerEstimateJob(job) ? pill("Партнерская смета", "blue") : "", "\n        </div>\n        ").concat(job.site_costs_comment ? '<p class="muted">Организация площадки: '.concat(escapeHtml(job.site_costs_comment), "</p>") : "", "\n        ").concat(smetterHref ? '<a class="link-button inline-link" href="'.concat(escapeAttr(smetterHref), '" target="_blank" rel="noopener noreferrer">Открыть Сметтер</a>') : "", "\n        ").concat(job.comment ? "<p>".concat(linkifyText(job.comment), "</p>") : "", "\n        ").concat(job.question_comment ? '<p class="muted warning-text">Уточнение: '.concat(linkifyText(job.question_comment), "</p>") : "", "\n        ").concat(job.return_comment ? '<p class="muted danger-text">Возврат менеджеру: '.concat(linkifyText(job.return_comment), "</p>") : "", "\n        ").concat(job.result_comment ? '<p class="muted">Итог: '.concat(linkifyText(job.result_comment), "</p>") : "", "\n        ").concat(renderEstimateJobFiles(job.files, job.id, canManageFiles), '\n      </div>\n      <div class="estimate-job-actions">\n        ').concat(canEdit ? '<button class="secondary tiny" type="button" data-edit-estimate-job="'.concat(job.id, '">Редактировать</button>') : "", "\n        ").concat(canStart ? '<button class="secondary tiny" type="button" data-estimate-job-status="estimate_in_work" data-estimate-job-id="'.concat(job.id, '">В работу</button>') : "", "\n        ").concat(canQuestion ? '<button class="secondary tiny" type="button" data-estimate-job-status="estimate_question" data-estimate-job-id="'.concat(job.id, '">Уточнить</button>') : "", "\n        ").concat(canReturn ? '<button class="secondary tiny danger-outline" type="button" data-estimate-job-status="estimate_returned" data-estimate-job-id="'.concat(job.id, '">Вернуть менеджеру</button>') : "", "\n        ").concat(canFinish ? '<button class="primary tiny" type="button" data-estimate-job-status="estimate_done" data-estimate-job-id="'.concat(job.id, '">Сдано</button>') : "", "\n        ").concat(canManageFiles ? '<button class="secondary tiny" type="button" data-open-estimate-files="'.concat(job.id, '">Добавить файл</button>') : "", "\n        ").concat(canDelete ? '<button class="danger-button tiny" type="button" data-delete-estimate-job="'.concat(job.id, '">Удалить</button>') : "", "\n      </div>\n    </article>");
  }
  function fillEstimateJobForm(job = {}) {
    var _a, _b;
    const form = qs("#estimateJobForm");
    form.reset();
    form.dataset.siteCostsTouched = job.id ? "true" : "false";
    form.elements.id.value = job.id || "";
    form.elements.title.value = job.title || "";
    form.elements.customer_name.value = job.customer_name || "";
    form.elements.project_id.value = job.project_id || "";
    const defaultManager = currentRoleBase() === "sales_manager" ? currentUserId() : (_a = usersByRole("sales_manager")[0]) == null ? void 0 : _a.id;
    const defaultEstimator = currentRoleBase() === "estimator" ? currentUserId() : (_b = usersByRole("estimator")[0]) == null ? void 0 : _b.id;
    form.elements.manager_id.value = job.manager_id || defaultManager || "";
    form.elements.estimator_id.value = job.estimator_id || defaultEstimator || "";
    form.elements.received_at.value = job.received_at || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    form.elements.due_date.value = job.due_date || "";
    form.elements.smetter_url.value = job.smetter_url || "";
    form.elements.estimate_type.value = job.estimate_type || "primary";
    form.elements.priority.value = job.priority || "normal";
    form.elements.site_costs_policy.value = job.site_costs_policy || defaultSiteCostsPolicyForEstimateType(form.elements.estimate_type.value);
    form.elements.site_costs_comment.value = job.site_costs_comment || "";
    form.elements.source.value = job.source || "";
    form.elements.comment.value = job.comment || "";
    syncEstimateSiteCostsByType();
  }
  function openEstimateJobDialog(jobId = "") {
    const job = state.estimateJobs.find((item) => Number(item.id) === Number(jobId)) || {};
    fillEstimateJobForm(job);
    qs("#estimateJobDialogTitle").textContent = job.id ? "Редактирование задания на смету" : "Новое задание на смету";
    qs("#estimateJobDialog").showModal();
  }
  function openEstimateJobDoneDialog(jobId) {
    const job = state.estimateJobs.find((item) => Number(item.id) === Number(jobId));
    const form = qs("#estimateJobDoneForm");
    form.reset();
    form.elements.id.value = jobId || "";
    qs("#estimateJobDoneTitle").textContent = job ? "Сдать смету: ".concat(job.title) : "Сдать смету";
    form.elements.result_comment.value = (job == null ? void 0 : job.result_comment) || "";
    qs("#estimateJobDoneDialog").showModal();
  }
  function updateEstimateFileDialogMode() {
    const form = qs("#estimateJobFileForm");
    if (!form) return;
    const mode = form.elements.mode.value || "add";
    const replaceWrap = qs("#estimateReplaceFileWrap");
    const fileInput = form.elements.attachments;
    if (replaceWrap) replaceWrap.hidden = mode !== "replace";
    if (fileInput) fileInput.multiple = mode !== "replace";
  }
  function openEstimateJobFileDialog(jobId, replaceFileId = "") {
    const job = state.estimateJobs.find((item) => Number(item.id) === Number(jobId));
    const form = qs("#estimateJobFileForm");
    if (!job || !form) return;
    form.reset();
    form.elements.id.value = job.id;
    form.elements.smetter_url.value = job.smetter_url || estimateSmetterHref(job) || "";
    qs("#estimateJobFileTitle").textContent = "Файлы сметы: ".concat(job.title);
    const currentFiles = (job.files || []).filter((file) => {
      var _a;
      return Number((_a = file.is_current) != null ? _a : 1) !== 0;
    });
    form.elements.replace_file_id.innerHTML = currentFiles.map((file) => '<option value="'.concat(escapeAttr(file.id), '">').concat(escapeHtml(file.title || file.file_name || "Файл"), " · v").concat(Number(file.version_no || 1), "</option>")).join("");
    if (replaceFileId) {
      form.elements.mode.value = "replace";
      form.elements.replace_file_id.value = String(replaceFileId);
    } else {
      form.elements.mode.value = "add";
    }
    if (!currentFiles.length) {
      form.elements.mode.value = "add";
      form.elements.mode.querySelector('option[value="replace"]').disabled = true;
    } else {
      form.elements.mode.querySelector('option[value="replace"]').disabled = false;
    }
    updateEstimateFileDialogMode();
    qs("#estimateJobFileDialog").showModal();
  }
  function uniqueMaterialBatches(materialRows = []) {
    const batches = /* @__PURE__ */ new Map();
    materialRows.forEach((item) => {
      const key = item.batch_id || "material-".concat(item.id);
      if (!batches.has(key)) batches.set(key, item);
    });
    return [...batches.values()];
  }
  function attentionItem(title, count, details, level, action, options = {}) {
    return __spreadValues({ title, count, details, level, action }, options);
  }
  function renderDashboardMetric({ title, count, details, view, taskFilter, level = "", always = false }) {
    const numeric = Number(count || 0);
    if (!always && numeric === 0) return "";
    const target = taskFilter ? 'data-task-filter="'.concat(taskFilter, '"') : 'data-view-target="'.concat(view || "dashboard", '"');
    const stateClass = numeric === 0 ? "is-zero" : level === "danger" ? "is-critical" : "is-active";
    return '\n    <button class="metric clickable '.concat(stateClass, " ").concat(level, '" ').concat(target, ' type="button">\n      <span class="muted">').concat(escapeHtml(title), "</span>\n      <strong>").concat(escapeHtml(String(count != null ? count : 0)), "</strong>\n      <span>").concat(escapeHtml(details), "</span>\n    </button>");
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
        items.push(attentionItem("MAX не привязан", unboundMaxUsers, "Личные уведомления не будут доходить до всех участников процесса.", "blue", { view: "feedback" }, { compact: true }));
      }
    }
    return items.slice(0, 6);
  }
  function renderDashboardAttention(items) {
    if (!items.length) {
      return '\n      <div class="attention-empty">\n        <strong>Критичных сигналов нет</strong>\n        <span>Агент не нашел просрочек, зависших приемок или проблемных заявок по текущей роли.</span>\n      </div>';
    }
    return '\n    <div class="attention-list">\n      '.concat(items.map((item) => {
      var _a, _b;
      const attrs = ((_a = item.action) == null ? void 0 : _a.taskFilter) ? 'data-task-filter="'.concat(item.action.taskFilter, '"') : 'data-view-target="'.concat(((_b = item.action) == null ? void 0 : _b.view) || "dashboard", '"');
      return '\n            <button class="attention-item '.concat(item.level, " ").concat(item.compact ? "compact" : "", '" type="button" ').concat(attrs, '>\n              <span class="attention-count">').concat(escapeHtml(String(item.count)), '</span>\n              <span class="attention-body">\n                <strong>').concat(escapeHtml(item.title), "</strong>\n                <small>").concat(escapeHtml(item.details), "</small>\n              </span>\n            </button>");
    }).join(""), "\n    </div>");
  }
  function canActAsTaskUser(task, kind) {
    const userId = currentUserId();
    const idKey = "".concat(kind, "_id");
    const roleKey = "".concat(kind, "_role");
    return task[idKey] === userId || task[roleKey] === currentRoleBase();
  }
  function canDeleteTask(task) {
    if (["accepted", "completed_pending_acceptance"].includes(task.status)) return false;
    return ["owner", "construction_manager"].includes(currentRoleBase());
  }
  async function renderDashboard() {
    const [summary, tasks, materialRows] = await Promise.all([api("/api/summary"), api("/api/tasks"), api("/api/material-requests")]);
    const roleTasks = visibleTasksForRole(tasks);
    const openRoleTasks = roleTasks.filter(isOpenTask);
    state.lastTasks = roleTasks;
    const dashboardStats = taskStats(openRoleTasks);
    const metricRows = [
      renderDashboardMetric({ title: "Объекты", count: summary.projects, details: "В базе MVP", view: "projects", always: true }),
      renderDashboardMetric({ title: "У менеджера", count: summary.pending_handover, details: "Черновики и доработки", view: "projects", level: "warning" }),
      renderDashboardMetric({ title: "На передаче", count: summary.construction_review || 0, details: "Ждут решения строительства", view: "projects", level: "warning" }),
      canView("tasks") ? renderDashboardMetric({ title: "Задачи к приемке", count: summary.task_done_waiting || 0, details: "Выполнены, но не приняты", taskFilter: "waiting", level: "blue" }) : "",
      canView("tasks") ? renderDashboardMetric({ title: "Просрочено", count: dashboardStats.overdue, details: "По открытым задачам", taskFilter: "overdue", level: "danger" }) : "",
      canView("estimates") ? renderDashboardMetric({ title: "Сметы в работе", count: summary.estimate_jobs_open || 0, details: "Нужно рассчитать", view: "estimates", level: "blue" }) : "",
      canView("estimates") ? renderDashboardMetric({ title: "Сметы просрочены", count: summary.estimate_jobs_overdue || 0, details: "Срок уже прошел", view: "estimates", level: "danger" }) : ""
    ].filter(Boolean);
    qs("#summaryCards").innerHTML = metricRows.length ? metricRows.join("") : '<div class="dashboard-empty-strip">Активных сигналов по роли пока нет.</div>';
    qs("#dashboardAttention").innerHTML = renderDashboardAttention(buildDashboardAttention(summary, openRoleTasks, materialRows));
    qs("#dashboardTaskStats").innerHTML = renderTaskStats(openRoleTasks, state.taskFilter, { hideZero: true, emptyText: "Активных задач по выбранной роли пока нет." }) + '<p class="muted dashboard-context-note">На рабочем столе показаны только открытые задачи. Принятые задачи остаются в полном разделе «Задачи» в фильтре «Принято».</p>';
    qs("#dashboardProjects").innerHTML = state.projects.slice(0, 4).map(
      (project) => '\n      <button class="row clickable" data-open-project="'.concat(project.id, '">\n        <div class="stack-line"><strong>').concat(project.title, "</strong>").concat(pill(label(project.status), "blue"), '</div>\n        <div class="muted">').concat(project.customer_name || "Заказчик не указан", " · ").concat(project.foreman_name || "Прораб не назначен", "</div>\n      </button>")
    ).join("");
    qs("#dashboardTasks").innerHTML = renderCollapsibleList({
      items: openRoleTasks,
      visibleCount: 3,
      emptyText: "Активных задач пока нет.",
      renderItem: renderDashboardTaskRow,
      moreLabel: "Остальные задачи",
      key: "dashboardTasks"
    });
    initSortableZones(qs("#dashboardView"));
  }
  async function renderEstimateJobs() {
    const statsNode = qs("#estimateJobStats");
    const scheduleNode = qs("#estimateJobSchedule");
    const rowsNode = qs("#estimateJobRows");
    if (!statsNode || !scheduleNode || !rowsNode) return;
    if (!canView("estimates")) {
      statsNode.innerHTML = "";
      scheduleNode.innerHTML = "";
      rowsNode.innerHTML = "";
      return;
    }
    const jobs = state.estimateJobs || [];
    statsNode.innerHTML = renderEstimateJobStats(jobs);
    scheduleNode.innerHTML = renderEstimateSchedule(jobs);
    rowsNode.innerHTML = jobs.length ? jobs.map(renderEstimateJobRow).join("") : '<p class="muted">Сметных заданий пока нет. Нажмите “Добавить задание”, чтобы зафиксировать входящую смету в работе.</p>';
  }
  function notificationTargetAttrs(row) {
    if (row.related_type === "material_request_batch" && row.related_id) return 'data-open-material-batch="batch-'.concat(row.related_id, '"');
    if (row.related_type === "task" || row.related_type === "tasks") return 'data-view-target="tasks"';
    if (row.related_type === "estimate_job") return 'data-view-target="estimates"';
    if (row.related_type === "variation") return 'data-view-target="variations"';
    if (row.project_id) return 'data-open-project="'.concat(row.project_id, '"');
    return 'data-view-target="dashboard"';
  }
  async function renderNotifications() {
    var _a;
    const rows = await api("/api/notifications");
    if (!rows.length) {
      qs("#notificationRows").innerHTML = '<p class="muted">Уведомлений пока нет.</p>';
      return;
    }
    const groups = rows.reduce((acc, row) => {
      const key = row.project_id ? "project-".concat(row.project_id) : "general";
      if (!acc[key]) {
        acc[key] = {
          key,
          title: row.project_title || "Без объекта",
          unread: 0,
          rows: []
        };
      }
      if (!row.is_read) acc[key].unread += 1;
      acc[key].rows.push(row);
      return acc;
    }, {});
    const groupRows = Object.values(groups).sort((a, b) => b.rows.length - a.rows.length || a.title.localeCompare(b.title, "ru")).map((group, index) => {
      var _a2;
      const open = (_a2 = state.notificationGroupsOpen[group.key]) != null ? _a2 : index === 0;
      return '\n        <details class="notification-group" data-notification-group="'.concat(group.key, '" ').concat(open ? "open" : "", ">\n          <summary>\n            <span>\n              <strong>").concat(escapeHtml(group.title), "</strong>\n              <small>").concat(group.rows.length, " событий").concat(group.unread ? " · новых: ".concat(group.unread) : "", "</small>\n            </span>\n            ").concat(group.unread ? pill("".concat(group.unread, " новых"), "warning") : "", '\n          </summary>\n          <div class="notification-group-list">\n            ').concat(group.rows.slice(0, 8).map(
        (row) => '\n                <button class="row clickable notification-row" '.concat(notificationTargetAttrs(row), '>\n                  <div class="stack-line"><strong>').concat(escapeHtml(row.title), "</strong>").concat(pill(row.user_name || row.role, row.is_read ? "" : "warning"), '</div>\n                  <div class="notification-text">').concat(escapeHtml(row.text), '</div>\n                  <div class="muted">').concat(formatDateRu(row.created_at), "</div>\n                </button>")
      ).join(""), "\n          </div>\n        </details>");
    }).join("");
    qs("#notificationRows").innerHTML = '\n    <details class="inline-collapsible notification-collapsible" '.concat(state.notificationsOpen ? "open" : "", ">\n      <summary>Последние события: ").concat(rows.length, '</summary>\n      <div class="notification-groups">').concat(groupRows, "</div>\n    </details>");
    (_a = qs(".notification-collapsible")) == null ? void 0 : _a.addEventListener("toggle", (event) => {
      state.notificationsOpen = event.currentTarget.open;
    });
    qsa("[data-notification-group]").forEach((details) => {
      details.addEventListener("toggle", (event) => {
        state.notificationGroupsOpen[event.currentTarget.dataset.notificationGroup] = event.currentTarget.open;
      });
    });
  }
  async function renderProjects() {
    const projects = state.projectListMode === "archive" ? state.archivedProjects : state.projects;
    qs("#projectListTitle").textContent = state.projectListMode === "archive" ? "Архив объектов" : "Список объектов";
    qsa("[data-project-list]").forEach((button) => button.classList.toggle("active", button.dataset.projectList === state.projectListMode));
    qs("#projectRows").innerHTML = projects.length ? projects.map(
      (project) => '\n          <div class="row clickable" data-open-project="'.concat(project.id, '">\n            <div class="row-grid project-list-card">\n              <div class="project-card-main">\n                <strong>').concat(project.title, '</strong>\n                <div class="muted">').concat(project.customer_name || "", '</div>\n              </div>\n              <div class="project-card-badges">\n                ').concat(pill(label(project.status), project.status === "revision_requested" ? "danger" : project.status === "submitted_to_construction" ? "warning" : "blue"), "\n                ").concat(state.projectListMode === "archive" ? pill(project.archive_reason || "архив", "success") : canViewFinancials() ? pill("Смета: ".concat(money(project.main_estimate_amount)), "success") : "", '\n              </div>\n              <div class="project-meta-line">\n                <span>').concat(state.projectListMode === "archive" ? project.archived_at || "без даты" : "Прораб: ".concat(project.foreman_name || "не назначен"), "</span>\n                ").concat(mapLink(project.address, project.navigator_url, "Я.Карты"), "\n              </div>\n            </div>\n          </div>")
    ).join("") : '<p class="muted">'.concat(state.projectListMode === "archive" ? "В архиве пока пусто." : "Объектов пока нет.", "</p>");
    const hasSelectedProject = state.selectedProjectId && projects.some((project) => Number(project.id) === Number(state.selectedProjectId));
    if (hasSelectedProject) await renderProjectDetail(state.selectedProjectId);
    else clearProjectDetail();
  }
  function projectFinancialSummaryHtml(project) {
    const base = Number(project.main_estimate_amount || 0);
    const approved = Number(project.approved_variations_amount || 0);
    const unresolved = Number(project.unresolved_overbudget_amount || 0);
    const acceptedTotal = base + approved;
    const forecastTotal = acceptedTotal + unresolved;
    const materialActual = buildMaterialBatches(project.materials || []).reduce((sum, batch) => sum + Number(batch.actual_purchase_amount || 0), 0);
    const rows = [
      ["Основная смета", base],
      ["Принятые допработы / доп. соглашения", approved],
      ["Итого по принятым основаниям", acceptedTotal],
      ["Сверхбюджет без решения", unresolved],
      ["Прогноз с нерешенным сверхбюджетом", forecastTotal]
    ];
    if (materialActual > 0) rows.push(["Факт закупок по заявкам", materialActual]);
    rows.push(["Срок", project.planned_end_date || "не задан"]);
    return '\n    <div class="detail-grid financial-summary-grid">\n      '.concat(rows.map(([title, value]) => '<div class="info"><span>'.concat(title, "</span><strong>").concat(typeof value === "number" ? money(value) : value, "</strong></div>")).join(""), "\n    </div>");
  }
  async function renderProjectDetail(projectId) {
    const project = await api("/api/projects/".concat(projectId));
    state.selectedProjectId = project.id;
    const docs = visibleDocuments(project.documents || []);
    const tabs = projectTabs();
    if (!tabs.includes(state.selectedProjectTab)) state.selectedProjectTab = tabs[0] || "overview";
    const overviewHtml = canViewFinancials() ? projectFinancialSummaryHtml(project) : '\n      <div class="detail-grid">\n        <div class="info"><span>Статус</span><strong>'.concat(label(project.status), '</strong></div>\n        <div class="info"><span>Срок</span><strong>').concat(project.planned_end_date || "не задан", '</strong></div>\n        <div class="info"><span>Прораб</span><strong>').concat(project.foreman_name || "не назначен", '</strong></div>\n        <div class="info"><span>Технадзор</span><strong>').concat(project.tech_supervisor_name || "не назначен", "</strong></div>\n      </div>");
    const tabData = {
      overview: overviewHtml,
      tasks: renderSmallList(project.tasks, (task) => "".concat(task.title, " · ").concat(label(task.status), " · ").concat(task.due_date || "без срока")),
      materials: '<p class="muted compact-note">Материалы здесь берутся только из файла материалов Сметтера и заявок. Файл “Задание на работы” сюда не попадает.</p>' + renderSmallList(
        project.materials,
        (item) => "".concat(item.title, " · ").concat(item.requested_quantity || item.estimated_quantity || 0, " ").concat(item.requested_unit || item.estimate_material_unit || "", " · ").concat(label(item.procurement_status), " · желаемая доставка: ").concat(item.needed_at || "не указана").concat(item.actual_delivery_date ? " · фактическая: ".concat(item.actual_delivery_date) : "").concat(item.procurement_comment ? " · комментарий снабжения: ".concat(item.procurement_comment) : "")
      ),
      works: '<p class="muted compact-note">Работы здесь берутся только из файла “Задание на работы”. Материалы из нижней части этого файла игнорируются.</p>' + renderSmallList(
        [...(project.works || []).map((item) => __spreadProps(__spreadValues({}, item), { kind: "plan" })), ...(project.extra_works || []).map((item) => __spreadProps(__spreadValues({}, item), { kind: "extra" }))],
        (item) => item.kind === "extra" ? "".concat(item.title, " · ").concat(item.quantity || 0, " ").concat(item.unit || "", " · ").concat(workReasonLabel(item.reason)) : "".concat(item.title, " · ").concat(item.estimated_quantity || 0, " ").concat(item.unit || "", " · ").concat(money(item.total_price))
      ),
      variations: canViewFinancials() ? renderSmallList(project.variations, (item) => "".concat(item.title, " · ").concat(variationType(item.type), " · ").concat(money(item.amount), " · ").concat(moneyDecision(item.financial_decision))) : '<p class="muted">Финансовые отклонения доступны руководителям и сметчикам.</p>',
      documents: renderGroupedProjectDocuments(docs, project.contracts || []),
      events: renderSmallList(project.events, (event) => "".concat(event.text))
    };
    const detailBlocks = [
      [
        "sections",
        '<div class="tabs">\n        '.concat(tabs.map((tab) => '<button class="tab '.concat(state.selectedProjectTab === tab ? "active" : "", '" data-project-tab="').concat(tab, '">').concat(tabTitle(tab), "</button>")).join(""), "\n      </div>\n      <div>").concat(tabData[state.selectedProjectTab], "</div>")
      ],
      ["edit", renderProjectEditPanel(project)],
      ["contract", renderProjectContractPanel(project)],
      ["workflow", renderProjectWorkflow(project)],
      ["documents", renderDocumentSummary(docs, project.contracts || [])]
    ];
    const customerPhone = formatRuPhone(project.customer_phone || "");
    const customerEmail = String(project.customer_email || "").trim();
    const customerHistory = Number(project.customer_projects_count || 1);
    const mapHref = yandexMapsUrl(project.address, project.navigator_url) || String(project.navigator_url || "").trim();
    const phoneLink = phoneHref(customerPhone);
    const managerNote = String(project.manager_note || "").trim();
    const smetterText = String(project.smetter_ref || "").trim();
    const smetterIsUrl = /^https?:\/\//i.test(smetterText);
    const smetterLooksLikeDomain = /^(www\.|[a-z0-9-]+\.[a-z0-9.-]+\/?)/i.test(smetterText) && !/\s/.test(smetterText);
    const smetterHref = smetterIsUrl ? smetterText : smetterLooksLikeDomain ? "https://".concat(smetterText) : "";
    const smetterButton = canViewExternalRefs() && smetterText ? smetterHref ? '<a class="secondary tiny project-smetter-button" href="'.concat(escapeAttr(smetterHref), '" target="_blank" rel="noopener noreferrer">Открыть Сметтер</a>') : '<span class="pill success">Сметтер: '.concat(escapeHtml(smetterText), "</span>") : "";
    const customerInfoHtml = '\n    <div class="project-contact-strip">\n      <div class="project-contact-main">\n        <strong>'.concat(escapeHtml(project.customer_name || "Клиент не указан"), "</strong>\n        <span>").concat(customerHistory, " ").concat(customerHistory === 1 ? "объект/договор" : "объектов/договоров", ' в истории</span>\n      </div>\n      <div class="project-contact-actions">\n        ').concat(phoneLink ? '<a class="link-button inline-link" href="'.concat(escapeAttr(phoneLink), '">Позвонить</a>') : '<span class="muted">Телефон не указан</span>', "\n        ").concat(customerEmail ? '<a class="link-button inline-link" href="mailto:'.concat(escapeAttr(customerEmail), '">Написать</a>') : '<span class="muted">E-mail не указан</span>', "\n        ").concat(mapHref ? '<a class="link-button inline-link" href="'.concat(escapeAttr(mapHref), '" target="_blank" rel="noopener noreferrer">Я.Карты</a>') : '<span class="muted">Локация не указана</span>', "\n        ").concat(smetterButton, "\n      </div>\n    </div>");
    const managerNoteHtml = managerNote ? '<section class="manager-note-panel">\n        <div class="stack-line"><strong>Вводные менеджера при передаче</strong>'.concat(pill(project.sales_manager_name || "Менеджер", "blue"), "</div>\n        <p>").concat(escapeHtml(managerNote), "</p>\n      </section>") : "";
    qs("#projectDetail").innerHTML = '\n    <div class="stack-line"><h2>'.concat(project.title, "</h2>").concat(pill(label(project.status), "blue"), "</div>\n    ").concat(customerInfoHtml, "\n    ").concat(managerNoteHtml, '\n    <div class="project-detail-blocks sortable-zone" data-sortable-zone="project-detail-v2">\n      ').concat(detailBlocks.filter(([, html]) => String(html || "").trim()).map(([key, html]) => '<div class="project-detail-block" data-sortable-block="'.concat(key, '">').concat(html, "</div>")).join(""), "\n    </div>\n  ");
    initSortableZones(qs("#projectDetail"));
  }
  function renderProjectEditPanel(project) {
    if (!canEditProject()) {
      return '<section class="workflow-panel subtle"><p class="muted">Текущая роль: '.concat(roleLabel(state.currentRole), ". Редактирование карточки доступно ген.директору, менеджеру и руководителю строительства.</p></section>");
    }
    return '\n    <section class="workflow-panel compact-workflow">\n      <div class="stack-line">\n        <h3>Карточка объекта</h3>\n        '.concat(pill("Доступ: ".concat(roleLabel(state.currentRole)), "success"), '\n      </div>\n      <div class="form-actions">\n        <span class="muted">Основные данные и файлы меняются в отдельном окне.</span>\n        <button class="secondary" data-edit-project="').concat(project.id, '">Редактировать</button>\n      </div>\n    </section>');
  }
  function renderProjectContractPanel(project) {
    if (!canEditProject()) return "";
    return '\n    <section class="workflow-panel compact-workflow contract-action-panel">\n      <div class="stack-line">\n        <h3>Договоры и доп. соглашения</h3>\n        '.concat(pill("Материалы и работы можно привязать к доп. соглашению", "blue"), '\n      </div>\n      <div class="form-actions">\n        <span class="muted">Добавляйте договор, допсоглашение, материалы и работы по нему из одного окна.</span>\n        <button class="primary" type="button" data-add-contract="').concat(project.id, '">Добавить договор / доп. соглашение</button>\n      </div>\n    </section>');
  }
  function renderProjectWorkflow(project) {
    if (project.status === "archived") {
      const restoreButton = canArchiveProject() ? '<button class="primary" data-project-action="restore" data-project-id="'.concat(project.id, '">Вернуть в работу</button>') : "";
      const deleteButton = canDeleteForever() ? '<button class="danger-button" data-project-action="delete" data-project-id="'.concat(project.id, '">Удалить навсегда</button>') : "";
      return '\n      <section class="workflow-panel">\n        <div class="stack-line"><h3>Архив</h3>'.concat(pill("Объект скрыт из работы", "blue"), '</div>\n        <p class="muted">Причина: ').concat(project.archive_reason || "не указана", '</p>\n        <div class="form-actions">\n          ').concat(restoreButton, "\n          ").concat(deleteButton, "\n        </div>\n        ").concat(canDeleteForever() ? '<p class="muted">Полное удаление доступно только роли “Ген.директор” и только из архива.</p>' : "", "\n      </section>");
    }
    if (project.status === "draft" || project.status === "revision_requested") {
      return '\n      <section class="workflow-panel">\n        <div class="stack-line"><h3>Передача объекта</h3>'.concat(pill(project.status === "revision_requested" ? "Нужна доработка" : "Черновик", project.status === "revision_requested" ? "danger" : "warning"), "</div>\n        ").concat(project.workflow_comment ? '<p class="muted">Комментарий руководителя строительства: '.concat(project.workflow_comment, "</p>") : "", "\n        ").concat(project.status === "revision_requested" ? '<label>Что исправлено перед повторной передачей <textarea id="submitFixComment" rows="2" placeholder="Например: добавил договор и проектную документацию"></textarea></label>' : "", '\n        <div class="form-actions">\n          <span class="muted">После проверки заполнения менеджер передает объект руководителю строительства.</span>\n          ').concat(canSubmitProject() ? '<button class="primary" data-project-action="submit" data-project-id="'.concat(project.id, '">Передать в работу</button>') : '<span class="muted">Передать объект может менеджер или ген.директор.</span>', "\n        </div>\n      </section>");
    }
    if (project.status === "submitted_to_construction") {
      if (!canAcceptProject()) {
        return '\n        <section class="workflow-panel">\n          <div class="stack-line"><h3>Проверка руководителем строительства</h3>'.concat(pill("Ожидает решения", "warning"), '</div>\n          <p class="muted">Принять объект в работу или вернуть менеджеру может только руководитель строительства или ген.директор.</p>\n        </section>');
      }
      return '\n      <section class="workflow-panel">\n        <div class="stack-line"><h3>Проверка руководителем строительства</h3>'.concat(pill("Ожидает решения", "warning"), '</div>\n        <div class="grid-2">\n          <label>Прораб <select id="acceptForeman">').concat(userOptionsByRole("foreman"), '</select></label>\n          <label>Сметчик <select id="acceptEstimator">').concat(userOptionsByRole("estimator"), '</select></label>\n        </div>\n        <div class="grid-2">\n          <label>Снабжение <select id="acceptProcurement">').concat(userOptionsByRole("procurement_manager"), '</select></label>\n          <label>Технадзор <select id="acceptTech">').concat(userOptionsByRole("technical_supervisor"), '</select></label>\n        </div>\n        <label>Комментарий при возврате <textarea id="returnComment" rows="2" placeholder="Что менеджеру нужно исправить"></textarea></label>\n        <div class="form-actions">\n          <button class="secondary" data-project-action="return" data-project-id="').concat(project.id, '">Вернуть на доработку</button>\n          <button class="primary" data-project-action="accept" data-project-id="').concat(project.id, '">Принять в работу</button>\n        </div>\n      </section>');
    }
    return '\n    <section class="workflow-panel">\n      <div class="stack-line"><h3>Объект в работе</h3>'.concat(pill("Ответственные назначены", "success"), '</div>\n      <p class="muted">После принятия уведомления получают прораб, снабжение, сметчик и технадзор.</p>\n      ').concat(canAcceptProject() ? '<div class="grid-2">\n              <label>Прораб <select id="assignForeman">'.concat(userOptionsByRole("foreman", { includeEmpty: true, selectedId: project.foreman_id }), '</select></label>\n              <label>Сметчик <select id="assignEstimator">').concat(userOptionsByRole("estimator", { includeEmpty: true, selectedId: project.estimator_id }), '</select></label>\n            </div>\n            <div class="grid-2">\n              <label>Снабжение <select id="assignProcurement">').concat(userOptionsByRole("procurement_manager", { includeEmpty: true, selectedId: project.procurement_manager_id }), '</select></label>\n              <label>Технадзор <select id="assignTech">').concat(userOptionsByRole("technical_supervisor", { includeEmpty: true, selectedId: project.tech_supervisor_id }), '</select></label>\n            </div>\n            <button class="secondary" data-project-action="assign" data-project-id="').concat(project.id, '">Сохранить ответственных</button>') : "", "\n      ").concat(canArchiveProject() ? '<button class="secondary" data-project-action="archive" data-project-id="'.concat(project.id, '">Отправить в архив</button>') : "", "\n    </section>");
  }
  function renderSmallList(items, getText) {
    if (!items.length) return '<p class="muted">Пока пусто.</p>';
    return '<div class="list">'.concat(items.map((item) => '<div class="row">'.concat(getText(item), "</div>")).join(""), "</div>");
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
    const cleaned = String(value).replace(/\s/g, "").replace(/₽|руб\.?/gi, "").replace(/[^0-9,.-]/g, "");
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
    return lines.slice(1).map((line) => {
      const cells = parseCsvLine(line, delimiter);
      return {
        section: cells[sectionIndex] || "",
        name: cells[nameIndex] || "",
        unit: cells[unitIndex] || "",
        estimated_quantity: numberFromCell(cells[quantityIndex]),
        unit_price: numberFromCell(cells[priceIndex]),
        total_price: numberFromCell(cells[totalIndex])
      };
    }).filter((row) => row.name);
  }
  function renderEstimatePreview() {
    qs("#estimatePreviewRows").innerHTML = state.estimatePreviewRows.length ? state.estimatePreviewRows.slice(0, 20).map(
      (row) => '\n          <div class="row">\n            <div class="row-grid">\n              <div><strong>'.concat(row.name, '</strong><div class="muted">').concat(row.section || "Без раздела", "</div></div>\n              ").concat(pill("".concat(row.estimated_quantity || 0, " ").concat(row.unit || ""), "blue"), "\n              <div>").concat(money(row.unit_price), "</div>\n              ").concat(pill(money(row.total_price), "success"), "\n            </div>\n          </div>")
    ).join("") : '<p class="muted">В файле не найдено строк материалов.</p>';
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
      file_base64: await fileToBase64(file)
    };
  }
  async function projectFormToJson(form) {
    const data = formToJson(form);
    data.title = normalizeCustomerBasedTitle(data.customer_name, data.title);
    data.customer_phone = formatRuPhone(data.customer_phone);
    const files = form.elements;
    const materialFile = files.estimate_file_name.files[0];
    const workTaskFile = files.work_task_file.files[0];
    const projectDocFiles = Array.from(files.project_docs_file.files || []);
    data.estimate_file_name = (materialFile == null ? void 0 : materialFile.name) || form.dataset.existingEstimateFileName || "";
    data.work_task_file_name = (workTaskFile == null ? void 0 : workTaskFile.name) || form.dataset.existingWorkTaskFileName || "";
    data.initial_documents = (await Promise.all(
      [
        fileDocumentPayload(materialFile, "Файл материалов из Сметтера", "smetter_materials"),
        fileDocumentPayload(workTaskFile, "Задание на работы из Сметтера", "smetter_work_task"),
        fileDocumentPayload(files.contract_file.files[0], "Договор", "contract"),
        fileDocumentPayload(files.estimate_doc_file.files[0], "Смета", "main_estimate"),
        ...projectDocFiles.map((file) => fileDocumentPayload(file, "Проектная документация: ".concat(file.name), "project_documentation"))
      ].filter(Boolean)
    )).filter(Boolean);
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
          file_base64: await fileToBase64(file)
        })
      });
      state.estimatePreviewRows = result.rows || [];
    } else {
      const text = await file.text();
      state.estimatePreviewRows = readEstimateRows(text);
    }
    renderEstimatePreview();
    showToast("Найдено строк: ".concat(state.estimatePreviewRows.length));
  }
  function tabTitle(tab) {
    return {
      overview: "Обзор",
      tasks: "Задачи",
      works: "Работы",
      materials: "Материалы",
      variations: "Допработы",
      documents: "Документы",
      events: "История"
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
        tasks: []
      };
      acc[task.project_id].tasks.push(task);
      return acc;
    }, {});
    if (currentRoleBase() === "foreman") {
      const userId = currentUserId();
      state.projects.filter((project) => project.foreman_id === userId).forEach((project) => {
        grouped[project.id] = grouped[project.id] || {
          id: project.id,
          title: project.title,
          foremanId: project.foreman_id,
          tasks: []
        };
      });
    }
    const taskProjects = Object.values(grouped).sort((a, b) => a.title.localeCompare(b.title, "ru"));
    if (!state.selectedTaskProjectId && taskProjects.length) state.selectedTaskProjectId = taskProjects[0].id;
    if (state.selectedTaskProjectId && !grouped[state.selectedTaskProjectId] && taskProjects.length) state.selectedTaskProjectId = taskProjects[0].id;
    if (!taskProjects.length) state.selectedTaskProjectId = null;
    const selectedGroup = grouped[state.selectedTaskProjectId] || null;
    const tasks = selectedGroup ? selectedGroup.tasks : [];
    qs("#taskProjectRows").innerHTML = taskProjects.length ? taskProjects.map((project) => {
      const stats = taskStats(project.tasks);
      const newCount = project.tasks.filter((task) => ["new", "returned", "completed_pending_acceptance"].includes(task.status)).length;
      const openCount = project.tasks.filter(isOpenTask).length;
      return '\n            <button class="row clickable task-project-row '.concat(state.selectedTaskProjectId === project.id ? "active" : "", '" data-task-project="').concat(project.id, '">\n              <div class="stack-line"><strong>').concat(project.title, '</strong></div>\n              <div class="task-project-indicators">').concat(taskProjectIndicatorPills(stats, openCount, newCount), "</div>\n            </button>");
    }).join("") : '<p class="muted">'.concat(currentRoleBase() === "foreman" ? "За этим прорабом пока нет объектов с задачами." : "Задач пока нет.", "</p>");
    qs("#taskStats").innerHTML = renderTaskStats(tasks, state.taskFilter, { compact: true }) + '<p class="muted task-status-help">Не принято / ждет приемки — исполнитель отметил выполнение, но проверяющий еще не принял. На доработке — проверяющий вернул задачу исполнителю с комментарием и новым сроком.</p>';
    const visibleTasks = tasks.filter((task) => taskMatchesFilter(task, state.taskFilter));
    qs("#taskRows").innerHTML = visibleTasks.length ? visibleTasks.map((task) => {
      const canComplete = task.status !== "accepted" && task.status !== "completed_pending_acceptance" && (canActAsTaskUser(task, "assignee") || ["owner", "construction_manager", "finance_director"].includes(currentRoleBase()));
      const canReview = task.status === "completed_pending_acceptance" && (["owner", "construction_manager", "finance_director"].includes(currentRoleBase()) || canActAsTaskUser(task, "reviewer"));
      const lastComment = latestTaskComment(task);
      const taskKey = "task:".concat(task.id);
      return '\n            <details class="row task-row task-collapsible" data-collapsible-key="'.concat(escapeAttr(taskKey), '"').concat(openAttrForKey(taskKey), '>\n              <summary class="task-summary">\n                <span class="task-summary-main">\n                  <strong>').concat(task.title, '</strong>\n                  <span class="stack-line">').concat(pill(label(task.status), taskStatusLevel(task.status))).concat(pill(task.due_date || "без срока", levelByDate(task.due_date))).concat(pill(taskPriorityLabel(task.priority), taskPriorityLevel(task.priority)), '</span>\n                </span>\n              </summary>\n              <div class="task-row-body">\n              <div class="row-grid">\n                <div class="task-main">\n                  <div class="muted">').concat(task.project_title, " · поставил: ").concat(task.creator_name || "не указано", " · создана: ").concat(formatDateRu(task.created_at)).concat(task.start_date ? " · начало: ".concat(formatDateRu(task.start_date)) : "").concat(task.contract_title ? " · ".concat(contractType(task.contract_type), ": ").concat(task.contract_title) : "", "</div>\n                  ").concat(task.description ? "<div>".concat(task.description, "</div>") : "", "\n                  ").concat(task.rejection_comment ? '<div class="muted">Комментарий по возврату: '.concat(task.rejection_comment, "</div>") : "", "\n                  ").concat(lastComment ? '<div class="task-last-comment"><strong>'.concat(escapeHtml(lastComment.actor_name || "Комментарий"), ":</strong> ").concat(escapeHtml(lastComment.comment), "</div>") : "", '\n                </div>\n                <div class="task-people">Ответственный: ').concat(task.assignee_name || "не назначен", '<br /><span class="muted">Принимает: ').concat(task.reviewer_name || task.creator_name || "не назначен", '</span></div>\n              </div>\n              <div class="task-actions">\n                <button class="secondary" type="button" data-open-task="').concat(task.id, '">Подробнее</button>\n                ').concat(canComplete ? '<button class="secondary" data-task-action="complete" data-task-id="'.concat(task.id, '">Выполнено</button>') : "", "\n                ").concat(canReview ? '<button class="primary" data-task-action="accept" data-task-id="'.concat(task.id, '">Принять</button><button class="secondary" data-task-action="return" data-task-id="').concat(task.id, '">Вернуть</button>') : "", "\n                ").concat(canDeleteTask(task) ? '<button class="danger-button" data-task-action="delete" data-task-id="'.concat(task.id, '">Удалить</button>') : "", "\n              </div>\n              </div>\n            </details>");
    }).join("") : '<p class="muted">'.concat(tasks.length ? "В этом фильтре задач нет." : "Задач пока нет.", "</p>");
  }
  function workProjectId() {
    var _a, _b, _c;
    const selected = state.selectedWorkProjectId || ((_a = qs('#workProjectForm select[name="project_id"]')) == null ? void 0 : _a.value) || state.selectedProjectId || ((_b = state.projects[0]) == null ? void 0 : _b.id) || "";
    if (!selected) return "";
    const exists = state.projects.some((project) => Number(project.id) === Number(selected));
    return exists ? selected : ((_c = state.projects[0]) == null ? void 0 : _c.id) || "";
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
    select.innerHTML = '<option value="">Без привязки к разделу</option>' + sections.map((section) => '<option value="'.concat(escapeAttr(section), '">').concat(section, "</option>")).join("");
    if (sections.includes(current)) select.value = current;
  }
  function taskTimeline(task) {
    var _a, _b;
    const actionTitle = {
      create: "Поставлена",
      comment: "Комментарий",
      complete: "Выполнена исполнителем",
      accept: "Принята",
      return: "Возвращена на доработку",
      postpone: "Частично / перенесена",
      delete: "Удалена"
    };
    if ((_a = task.events) == null ? void 0 : _a.length) {
      return '<div class="task-timeline">'.concat(task.events.map(
        (event) => '\n          <div class="task-timeline-item">\n            <strong>'.concat(actionTitle[event.action] || event.action, "</strong>\n            <span>").concat(formatDateRu(event.created_at), '</span>\n            <p class="muted">').concat([event.actor_name, event.comment, event.due_date ? "срок: ".concat(formatDateRu(event.due_date)) : ""].filter(Boolean).join(" · "), "</p>\n            ").concat(renderTaskEventAttachments(event), "\n          </div>")
      ).join(""), "</div>");
    }
    const rows = [
      ["Поставлена", task.created_at, task.creator_name || "автор не указан"],
      ["Выполнена исполнителем", task.completed_at, task.assignee_name || "исполнитель не указан"],
      ["Принята", task.accepted_at, task.reviewer_name || task.creator_name || "принимающий не указан"]
    ].filter(([, date]) => date);
    if (!((_b = task.events) == null ? void 0 : _b.length) && task.status === "returned" && task.rejection_comment) {
      rows.push(["Возвращена на доработку", task.updated_at, task.rejection_comment]);
    }
    return rows.length ? '<div class="task-timeline">'.concat(rows.map(
      ([title, date, note]) => '\n          <div class="task-timeline-item">\n            <strong>'.concat(title, "</strong>\n            <span>").concat(formatDateRu(date), '</span>\n            <p class="muted">').concat(note, "</p>\n          </div>")
    ).join(""), "</div>") : '<p class="muted">Истории по задаче пока нет.</p>';
  }
  function taskDiscussionEvents(task) {
    return (task.events || []).filter((event) => event.action === "comment" && (String(event.comment || "").trim() || (event.attachments || []).length));
  }
  function latestTaskComment(task) {
    return [...taskDiscussionEvents(task)].reverse().find((event) => event.action === "comment") || null;
  }
  function renderTaskEventAttachments(event) {
    const attachments = event.attachments || [];
    if (!attachments.length) return "";
    return '\n    <div class="task-attachments">\n      '.concat(attachments.map((file) => {
      const href = "/api/documents/".concat(file.id, "/download");
      const fileName = escapeHtml(file.file_name || file.title || "Файл");
      const isImage = String(file.mime_type || "").startsWith("image/");
      return '\n            <a class="task-attachment" href="'.concat(href, '" target="_blank" rel="noopener">\n              ').concat(isImage ? '<img src="'.concat(href, '" alt="').concat(fileName, '" />') : "", "\n              <span>").concat(fileName, "</span>\n            </a>");
    }).join(""), "\n    </div>");
  }
  function renderTaskDiscussion(task) {
    const comments = taskDiscussionEvents(task).slice(-8);
    const commentRows = comments.length ? comments.map((event) => {
      const own = Number(event.actor_id || 0) === Number(currentUserId() || 0);
      return '\n            <div class="task-comment '.concat(own ? "own" : "", '">\n              <div class="stack-line">\n                <strong>').concat(escapeHtml(event.actor_name || "Участник"), "</strong>\n                ").concat(pill(event.action === "comment" ? "Комментарий" : label(event.status_to || event.action), event.action === "comment" ? "" : taskStatusLevel(event.status_to)), '\n                <span class="muted">').concat(formatDateRu(event.created_at), "</span>\n              </div>\n              ").concat(event.comment ? "<p>".concat(escapeHtml(event.comment), "</p>") : "", "\n              ").concat(renderTaskEventAttachments(event), "\n            </div>");
    }).join("") : '<p class="muted">Комментариев по задаче пока нет.</p>';
    return '\n    <section class="workflow-panel task-discussion">\n      <div class="panel-head">\n        <h3>Обсуждение</h3>\n        <span class="muted">Комментарии остаются внутри задачи</span>\n      </div>\n      <div class="task-comment-list">'.concat(commentRows, '</div>\n      <div class="task-comment-form" data-task-comment-form data-task-id="').concat(task.id, '">\n        <textarea rows="2" placeholder="Написать комментарий по задаче"></textarea>\n        <input type="file" multiple />\n        <button class="primary" type="button" data-task-comment-send="').concat(task.id, '">Отправить</button>\n      </div>\n    </section>');
  }
  function renderTaskActionPanel(task) {
    const canComplete = task.status !== "accepted" && task.status !== "completed_pending_acceptance" && (canActAsTaskUser(task, "assignee") || ["owner", "construction_manager", "finance_director"].includes(currentRoleBase()));
    const canReview = task.status === "completed_pending_acceptance" && (["owner", "construction_manager", "finance_director"].includes(currentRoleBase()) || canActAsTaskUser(task, "reviewer"));
    if (!canComplete && !canReview) return "";
    return '\n    <section class="workflow-panel task-action-panel" data-task-action-panel data-task-id="'.concat(task.id, '">\n      <div class="panel-head">\n        <h3>Действия по задаче</h3>\n        <span class="muted">Результат, перенос срока и файлы фиксируются в истории</span>\n      </div>\n      <label>Комментарий <textarea rows="3" data-task-action-comment placeholder="Что сделано, что осталось, почему нужен перенос или что принять/вернуть"></textarea></label>\n      <div class="grid-2">\n        <label>Новый срок при переносе/возврате <input type="date" data-task-action-due-date value="').concat(task.due_date || "", '" /></label>\n        <label>Фото / видео / документ <input type="file" data-task-action-files multiple /></label>\n      </div>\n      <div class="form-actions">\n        ').concat(canComplete ? '<button class="primary" type="button" data-task-action="complete" data-task-id="'.concat(task.id, '">Выполнено</button><button class="secondary" type="button" data-task-action="postpone" data-task-id="').concat(task.id, '">Частично / перенести срок</button>') : "", "\n        ").concat(canReview ? '<button class="primary" type="button" data-task-action="accept" data-task-id="'.concat(task.id, '">Принять выполнение</button><button class="secondary" type="button" data-task-action="return" data-task-id="').concat(task.id, '">Вернуть на доработку</button>') : "", "\n      </div>\n    </section>");
  }
  function openTaskDetail(taskId) {
    const task = state.lastTasks.find((item) => Number(item.id) === Number(taskId));
    if (!task) {
      showToast("Задача не найдена");
      return;
    }
    qs("#taskDetailTitle").textContent = task.title || "Задача";
    qs("#taskDetailContent").innerHTML = '\n    <section class="workflow-panel compact-workflow">\n      <div class="stack-line">\n        <h3>'.concat(task.project_title || "Объект не указан", "</h3>\n        ").concat(pill(label(task.status), taskStatusLevel(task.status)), "\n        ").concat(pill(task.due_date || "без срока", levelByDate(task.due_date)), "\n        ").concat(pill(taskPriorityLabel(task.priority), taskPriorityLevel(task.priority)), '\n      </div>\n      <div class="task-detail-grid">\n        <div><span class="muted">Поставил</span><strong>').concat(task.creator_name || "не указано", '</strong></div>\n        <div><span class="muted">Исполнитель</span><strong>').concat(task.assignee_name || "не назначен", '</strong></div>\n        <div><span class="muted">Принимает</span><strong>').concat(task.reviewer_name || task.creator_name || "не назначен", '</strong></div>\n        <div><span class="muted">Дата постановки</span><strong>').concat(formatDateRu(task.created_at), '</strong></div>\n        <div><span class="muted">Дата начала</span><strong>').concat(task.start_date ? formatDateRu(task.start_date) : "не указана", '</strong></div>\n        <div><span class="muted">Договор</span><strong>').concat(task.contract_title ? "".concat(contractType(task.contract_type), ": ").concat(task.contract_title) : "без привязки", "</strong></div>\n      </div>\n      ").concat(task.description ? '<p class="preserve-lines">'.concat(task.description, "</p>") : "", "\n      ").concat(task.rejection_comment ? '<div class="hint-box warning"><strong>Причина возврата / непринятия</strong><p>'.concat(task.rejection_comment, "</p></div>") : "", '\n    </section>\n    <section class="workflow-panel">\n      <h3>История задачи</h3>\n      ').concat(taskTimeline(task), "\n    </section>\n    ").concat(renderTaskActionPanel(task), "\n    ").concat(renderTaskDiscussion(task));
    qs("#taskDetailDialog").showModal();
  }
  function isWorkStageOpen(projectId, stage) {
    var _a;
    return Boolean((_a = state.openWorkStages[String(projectId)]) == null ? void 0 : _a[stage]);
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
      qs("#workRows").innerHTML = '<p class="muted">Сначала создайте объект.</p>';
      qs("#workExtraRows").innerHTML = "";
      return;
    }
    const [works, extraWorks] = await Promise.all([
      api("/api/work-items?project_id=".concat(projectId)),
      api("/api/work-extra-items?project_id=".concat(projectId))
    ]);
    fillWorkExtraSectionSelect(works);
    const project = state.projects.find((item) => Number(item.id) === Number(projectId));
    const fileNote = (project == null ? void 0 : project.work_task_file_name) ? '<p class="muted">Файл задания: '.concat(project.work_task_file_name, " · загружено работ: ").concat(works.length, "</p>") : '<p class="muted">Файл задания на работы по этому объекту еще не загружен.</p>';
    const processNote = '\n    <section class="hint-box neutral work-process-note">\n      <strong>Как читать раздел</strong>\n      <p>Слева — плановые работы из файла «Задание на работы» Сметтера. Справа — появившиеся работы: допы, превышения, переделки и расходы компании. На рабочем столе показываются задачи и контрольные сигналы, а не весь список работ по смете.</p>\n    </section>';
    const workTree = buildWorkTree(works);
    qs("#workRows").innerHTML = "".concat(processNote, '<div class="work-file-note">').concat(fileNote, "</div>") + (works.length ? Object.entries(workTree).map(
      ([stage, stageData]) => '\n          <details class="estimate-section work-stage" data-work-stage="'.concat(escapeAttr(stage), '" ').concat(isWorkStageOpen(projectId, stage) ? "open" : "", '>\n            <summary>\n              <span class="work-section-title">\n                <strong>').concat(stage, '</strong>\n              </span>\n              <span class="work-section-count">').concat(stageData.total, '</span>\n            </summary>\n            <div class="work-groups">\n              ').concat(Object.entries(stageData.groups).map(
        ([group, rows]) => '\n                  <section class="work-group">\n                    <div class="work-group-head">\n                      <strong>'.concat(group, "</strong>\n                      <span>").concat(rows.length, '</span>\n                    </div>\n                    <div class="table work-items">\n                      ').concat(rows.map(
          (row) => '\n                          <div class="row estimate-material-row work-row">\n                            <div class="material-main">\n                              <strong>'.concat(row.title, '</strong>\n                            </div>\n                            <div class="work-row-meta">\n                              <span>').concat(row.estimated_quantity || 0, " ").concat(row.unit || "", "</span>\n                              <span>").concat(money(row.unit_price), "</span>\n                              <strong>").concat(money(row.total_price), "</strong>\n                            </div>\n                          </div>")
        ).join(""), "\n                    </div>\n                  </section>")
      ).join(""), "\n            </div>\n          </details>")
    ).join("") : '<p class="muted">Список работ пока пуст. Если файл уже выбран и сохранен, значит программа не распознала строки в этой выгрузке.</p>');
    qs("#workExtraRows").innerHTML = extraWorks.length ? extraWorks.map(
      (row) => '\n          <div class="row estimate-material-row">\n            <div class="material-main">\n              <strong>'.concat(row.title, '</strong>\n              <div class="muted">').concat(row.project_title || "", " · ").concat(row.estimate_section || "без раздела", " · ").concat(row.creator_name || "автор не указан", "</div>\n              ").concat(row.comment ? '<div class="muted">'.concat(row.comment, "</div>") : "", '\n            </div>\n            <div class="stack-line">\n              ').concat(pill("".concat(row.quantity || 0, " ").concat(row.unit || ""), "blue"), "\n              ").concat(pill(workReasonLabel(row.reason), row.reason === "company_cost" || row.reason === "rework" ? "danger" : "warning"), "\n            </div>\n          </div>")
    ).join("") : '<p class="muted">Появившихся работ по объекту пока нет.</p>';
  }
  async function renderLocations() {
    const payload = await api("/api/locations");
    const projects = payload.projects || [];
    const suppliers = payload.suppliers || [];
    qs("#objectLocationRows").innerHTML = projects.length ? projects.map(
      (project) => '\n          <div class="row location-row">\n            <div>\n              <strong>'.concat(project.title, '</strong>\n              <div class="muted">').concat(project.customer_name || "", '</div>\n              <div class="muted">').concat(project.address || "Адрес не указан", "</div>\n            </div>\n            ").concat(mapLink(project.address, project.navigator_url), "\n          </div>")
    ).join("") : '<p class="muted">Активных объектов пока нет.</p>';
    qs("#supplierLocationRows").innerHTML = suppliers.length ? suppliers.map(
      (supplier) => '\n          <div class="row location-row">\n            <div>\n              <strong>'.concat(supplier.title, '</strong>\n              <div class="muted">').concat(supplier.address || "Адрес не указан", "</div>\n              ").concat(supplier.comment ? '<div class="muted">'.concat(supplier.comment, "</div>") : "", "\n            </div>\n            ").concat(mapLink(supplier.address, supplier.maps_url), "\n          </div>")
    ).join("") : '<p class="muted">Локации поставщиков пока не добавлены.</p>';
  }
  async function renderMaterials() {
    qsa("[data-material-list-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.materialListMode === state.materialListMode);
    });
    const exportButton = qs("#exportCompletedMaterialsButton");
    if (exportButton) exportButton.hidden = !["owner", "construction_manager", "finance_director", "accountant", "procurement_manager"].includes(currentRoleBase());
    const items = await api("/api/material-requests?archive=".concat(state.materialListMode === "archive" ? "1" : "0"));
    state.materialRequests = items;
    const visibleItems = currentRoleBase() === "foreman" ? items.filter((item) => Number(item.project_foreman_id) === Number(currentUserId()) || Number(item.creator_id) === Number(currentUserId())) : items;
    const batches = buildMaterialBatches(visibleItems);
    const renderBatchCard = (batch) => '\n      <button class="row clickable material-request-row material-batch-row" type="button" data-open-material-batch="'.concat(batch.key, '">\n        <div class="material-main">\n          <strong>').concat(materialBatchTitle(batch, currentRoleBase() === "procurement_manager"), '</strong>\n          <div class="muted">Объект: ').concat(batch.project_title || "не указан", " · кто заказал: ").concat(batch.creator_name || "не указано", '</div>\n          <div class="muted">Позиций: ').concat(batch.items.length, " · желаемая доставка: ").concat(batch.needed_at || "не указана", " · сумма: ").concat(money(batch.total_amount), "</div>\n          ").concat(batch.actual_purchase_amount ? '<div class="muted">Фактическая стоимость закупки: '.concat(money(batch.actual_purchase_amount), "</div>") : "", '\n          <div class="muted">Основания: ').concat(materialBatchBasisSummary(batch), '</div>\n          <div class="muted">').concat(materialBatchDestination(batch), "</div>\n          ").concat(materialReceiptActionNote(batch), "\n          ").concat(batch.revision_comment ? '<div class="muted">Комментарий по доработке: '.concat(batch.revision_comment, "</div>") : "", "\n          ").concat(state.materialListMode === "archive" && batch.archived_at ? '<div class="muted">В архиве с '.concat(formatDateRu(batch.archived_at), "</div>") : "", '\n        </div>\n        <div class="stack-line">\n          ').concat(pill(urgencyLabel(batch.delivery_urgency), urgencyLevel(batch.delivery_urgency)), "\n          ").concat(pill(label(batch.status), materialBatchLevel(batch.status)), "\n        </div>\n      </button>");
    if (!batches.length) {
      qs("#materialRows").innerHTML = '<p class="muted">'.concat(state.materialListMode === "archive" ? "В архиве заявок пока нет." : currentRoleBase() === "foreman" ? "По объектам этого прораба заявок пока нет. Нажмите “Добавить заявку”, чтобы заказать материалы." : "Заявок на материалы пока нет.", "</p>");
      return;
    }
    if (state.materialListMode === "archive") {
      const grouped = batches.reduce((acc, batch) => {
        const title = batch.project_title || "Объект не указан";
        acc[title] = acc[title] || [];
        acc[title].push(batch);
        return acc;
      }, {});
      qs("#materialRows").innerHTML = Object.entries(grouped).map(
        ([projectTitle, projectBatches]) => '\n        <section class="material-archive-group">\n          <h3>'.concat(projectTitle, '</h3>\n          <div class="table">').concat(projectBatches.map(renderBatchCard).join(""), "</div>\n        </section>")
      ).join("");
      return;
    }
    qs("#materialRows").innerHTML = batches.map(renderBatchCard).join("");
  }
  function findMaterialBatch(batchKey) {
    return buildMaterialBatches(state.materialRequests).find((batch) => batch.key === batchKey);
  }
  async function openMaterialBatchDialog(batchKey) {
    if (!state.materialRequests.length) {
      state.materialRequests = await api("/api/material-requests?archive=".concat(state.materialListMode === "archive" ? "1" : "0"));
    }
    let batch = findMaterialBatch(batchKey);
    if (!batch) {
      const [activeItems, archivedItems] = await Promise.all([
        api("/api/material-requests?archive=0"),
        api("/api/material-requests?archive=1")
      ]);
      state.materialRequests = [...activeItems, ...archivedItems];
      batch = findMaterialBatch(batchKey);
    }
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
    const canReceive = canReceiveMaterialBatch(batch);
    qs("#materialReviewContent").innerHTML = '\n    <section class="workflow-panel compact-workflow">\n      <div class="stack-line">\n        <h3>'.concat(batch.project_title || "Объект не указан", "</h3>\n        ").concat(pill(urgencyLabel(batch.delivery_urgency), urgencyLevel(batch.delivery_urgency)), "\n        ").concat(pill(label(batch.status), materialBatchLevel(batch.status)), '\n      </div>\n      <p class="muted">Кто заказал: ').concat(batch.creator_name || "не указано", " · желаемая доставка: ").concat(batch.needed_at || "не указана", " · позиций: ").concat(batch.items.length, "</p>\n      ").concat(batch.actual_purchase_amount ? '<p class="muted">Фактическая стоимость закупки: '.concat(money(batch.actual_purchase_amount), " · сметная сумма заявки: ").concat(money(batch.total_amount), "</p>") : "", '\n      <p class="muted">Основания: ').concat(materialBatchBasisSummary(batch), '</p>\n      <p class="muted">').concat(materialBatchDestination(batch), "</p>\n      ").concat(batch.comment ? "<p>".concat(batch.comment, "</p>") : "", "\n      ").concat(batch.revision_comment ? '<p class="muted">Комментарий по доработке: '.concat(batch.revision_comment, "</p>") : "", "\n      ").concat(batch.foreman_response ? '<p class="muted">Ответ прораба: '.concat(batch.foreman_response, "</p>") : "", "\n      ").concat(batch.scheduled_delivery_date ? '<p class="muted">Назначенная доставка: '.concat(formatDateRu(batch.scheduled_delivery_date), "</p>") : "", "\n      ").concat(batch.procurement_comment ? '<p class="muted">Комментарий снабжения: '.concat(batch.procurement_comment, "</p>") : "", "\n      ").concat(batch.receipt_comment ? '<p class="muted">Приемка: '.concat(batch.receipt_comment, "</p>") : "", "\n      ").concat(batch.variation_id ? '<p class="muted">Связана с допработой: '.concat(batch.variation_title || "#".concat(batch.variation_id), " · ").concat(label(batch.variation_status), "</p>") : "", "\n      ").concat(materialReceiptAttachment(batch), '\n    </section>\n    <div class="table material-review-items">\n      ').concat(batch.items.map(
      (item) => '\n          <div class="row estimate-material-row">\n            <div class="material-main">\n              <strong>'.concat(item.title, '</strong>\n              <div class="muted">').concat(item.estimate_section || "без раздела", "</div>\n              ").concat(item.comment ? '<div class="muted">'.concat(item.comment, "</div>") : "", '\n            </div>\n            <div class="stack-line">\n              ').concat(pill("".concat(item.requested_quantity || item.estimated_quantity || 0, " ").concat(item.requested_unit || item.estimate_material_unit || ""), "blue"), "\n              ").concat(pill(materialBasisLabel(item.basis_type), materialBasisLevel(item.basis_type)), "\n              ").concat(pill(money(item.total_amount), "success"), "\n              ").concat(materialActualTotal(item) ? pill("Закупка: ".concat(money(materialActualTotal(item))), materialActualOverrun(item) ? "danger" : "blue") : "", "\n            </div>\n          </div>")
    ).join(""), "\n    </div>\n    ").concat(canCreateVariation ? '<section class="workflow-panel">\n            <h3>Допработа / отклонение</h3>\n            <p class="muted">В заявке есть позиции сверх основной сметы. Можно создать связанную запись в разделе “Допработы”, чтобы решить, кто оплачивает и как оформляем.</p>\n            <div class="form-actions">\n              <button class="primary" type="button" data-material-batch-action="create_variation" data-material-batch-id="'.concat(batch.id, '">Создать допработу</button>\n            </div>\n          </section>') : "", "\n    ").concat(canReview ? '<section class="workflow-panel">\n            <h3>Решение снабжения</h3>\n            <label>Комментарий при возврате <textarea id="materialBatchReturnComment" rows="3" placeholder="Например: не понятно количество, уточните позицию"></textarea></label>\n            <div class="form-actions">\n              <button class="primary" type="button" data-material-batch-action="accept" data-material-batch-id="'.concat(batch.id, '">Принять в работу</button>\n              <button class="secondary" type="button" data-material-batch-action="return" data-material-batch-id="').concat(batch.id, '">Вернуть на доработку</button>\n            </div>\n          </section>') : "", "\n    ").concat(canSchedule ? '<section class="workflow-panel">\n            <h3>Доставка</h3>\n            <label>Дата доставки <input id="materialBatchDeliveryDate" type="date" value="'.concat(batch.scheduled_delivery_date || batch.needed_at || "", '" /></label>\n            <div class="table material-review-items">\n              ').concat(batch.items.map(
      (item) => '\n                  <div class="row estimate-material-row">\n                    <div class="material-main">\n                      <strong>'.concat(item.title, '</strong>\n                      <div class="muted">Смета: ').concat(money(item.total_amount), " · ").concat(item.requested_quantity || item.estimated_quantity || 0, " ").concat(item.requested_unit || item.estimate_material_unit || "", '</div>\n                    </div>\n                    <label>Цена закупки за ед., ₽ <input type="text" inputmode="decimal" data-material-actual-unit="').concat(item.id, '" value="').concat(item.actual_unit_price || "", '" placeholder="0" /></label>\n                    <label>Сумма закупки, ₽ <input type="text" inputmode="decimal" data-material-actual-total="').concat(item.id, '" value="').concat(item.actual_total_amount || "", '" placeholder="0" /></label>\n                  </div>')
    ).join(""), '\n            </div>\n            <label>Комментарий снабжения <textarea id="materialBatchScheduleComment" rows="3" placeholder="Например: нужна доверенность или кран">').concat(batch.procurement_comment || "", '</textarea></label>\n            <div class="form-actions">\n              <button class="primary" type="button" data-material-batch-action="schedule" data-material-batch-id="').concat(batch.id, '">Уведомить о доставке</button>\n              <button class="secondary" type="button" data-material-batch-action="save_actuals" data-material-batch-id="').concat(batch.id, '">Сохранить цены закупки</button>\n            </div>\n          </section>') : "", "\n    ").concat(canResolveIssue ? '<section class="workflow-panel">\n            <h3>Исправление проблемы</h3>\n            <p class="muted">Укажите, когда будет повторная доставка, замена или довоз материала. Прораб и руководители получат уведомление.</p>\n            <label>Дата повторной доставки <input id="materialBatchResolveDate" type="date" value="'.concat(batch.scheduled_delivery_date || "", '" /></label>\n            <label>Комментарий снабжения <textarea id="materialBatchResolveComment" rows="3" placeholder="Например: заменили позицию, довезем недостающий материал, поставщик подтвердил замену"></textarea></label>\n            <div class="form-actions">\n              <button class="primary" type="button" data-material-batch-action="resolve_issue" data-material-batch-id="').concat(batch.id, '">Уведомить о повторной доставке</button>\n            </div>\n          </section>') : "", "\n    ").concat(canEdit ? renderMaterialBatchEditSection(batch) : "", "\n    ").concat(canReceive ? '<section class="workflow-panel material-receipt-panel">\n            <h3>Приемка доставки</h3>\n            <p class="muted">Доставка назначена'.concat(batch.scheduled_delivery_date ? " на ".concat(formatDateRu(batch.scheduled_delivery_date)) : "", '. Если все по списку, подтвердите получение. Если что-то не так, опишите проблему и прикрепите фото или видео.</p>\n            <label>Комментарий при проблеме <textarea id="materialBatchReceiptComment" rows="3" placeholder="Что именно не так: не довезли, повреждено, не тот материал"></textarea></label>\n            <label>Фото или видео <input id="materialBatchReceiptFile" type="file" accept="image/*,video/*" /></label>\n            <div class="form-actions">\n              <button class="primary" type="button" data-material-batch-action="receive" data-receipt-status="received" data-material-batch-id="').concat(batch.id, '">Материалы получены</button>\n              <button class="secondary" type="button" data-material-batch-action="receive" data-receipt-status="issue" data-material-batch-id="').concat(batch.id, '">Есть проблема</button>\n            </div>\n          </section>') : "", "\n  ");
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
      disputed_position: "Спорно"
    }[type] || type;
  }
  function moneyDecision(value) {
    return {
      not_decided: "Не решено",
      customer: "Заказчик",
      company: "Компания",
      contractor: "Подрядчик",
      disputed: "Спорно"
    }[value] || value;
  }
  function variationStatusLevel(status) {
    return {
      decision_required: "danger",
      in_review: "warning",
      approved: "success",
      rejected: ""
    }[status] || "blue";
  }
  async function renderVariations() {
    const rows = await api("/api/variations");
    qs("#variationRows").innerHTML = rows.length ? rows.map(
      (row) => '\n          <button class="row clickable variation-row" type="button" data-open-variation="'.concat(row.id, '">\n            <div class="row-grid">\n              <div>\n                <strong>').concat(row.title, '</strong>\n                <div class="muted">').concat(row.project_title, " · ").concat(variationType(row.type)).concat(row.estimate_section ? " · ".concat(row.estimate_section) : "").concat(row.source_type === "material_request_batch" ? " · из заявки материалов #".concat(row.source_id) : "", "</div>\n              </div>\n              ").concat(pill(label(row.status), variationStatusLevel(row.status)), "\n              ").concat(canViewFinancials() ? pill(variationAmountLabel(row), Number(row.amount || 0) > 0 ? "warning" : "danger") : "", "\n              ").concat(canViewFinancials() ? "<div>".concat(moneyDecisionLabel(row.financial_decision), "</div>") : "", "\n              ").concat(pill(row.due_date || "без срока", levelByDate(row.due_date)), "\n            </div>\n          </button>")
    ).join("") : '<p class="muted">Допработ и отклонений пока нет.</p>';
  }
  async function openVariationDialog(variationId) {
    const variation = await api("/api/variations/".concat(variationId));
    qs("#variationDetailTitle").textContent = variation.title || "Допработа";
    const materials = variation.materials || [];
    const attachments = variation.attachments || [];
    qs("#variationDetailContent").innerHTML = '\n    <section class="workflow-panel compact-workflow">\n      <div class="stack-line">\n        <h3>'.concat(variation.project_title || "Объект не указан", "</h3>\n        ").concat(pill(variationType(variation.type), "blue"), "\n        ").concat(canViewFinancials() ? pill(moneyDecisionLabel(variation.financial_decision), variation.financial_decision === "not_decided" ? "danger" : "warning") : "", '\n      </div>\n      <p class="muted">').concat(canViewFinancials() ? "Сумма: ".concat(variationAmountLabel(variation), " · ") : "", "срок решения: ").concat(variation.due_date || "не указан", "</p>\n      ").concat(variation.estimate_section ? '<p class="muted">Раздел / этап сметы: '.concat(variation.estimate_section, "</p>") : "", '\n      <p class="muted">Статус: ').concat(label(variation.status), " · инициатор: ").concat(variation.requester_name || "не указан").concat(variation.approver_name ? " · решение: ".concat(variation.approver_name) : "", "</p>\n      ").concat(variation.source_type === "material_request_batch" ? '<p class="muted">Источник: заявка материалов #'.concat(variation.source_id, "</p>") : "", "\n      ").concat(variation.description ? '<p class="preserve-lines">'.concat(variation.description, "</p>") : "", '\n      <div class="hint-box neutral">\n        <strong>Что здесь решить</strong>\n        <p>Нужно определить основание отклонения и кто оплачивает: заказчик по допсоглашению, компания, подрядчик или спорная позиция. Если сумма не задана, сметчику или менеджеру нужно приложить расчет/смету.</p>\n      </div>\n      <div class="form-actions">\n        ').concat(canViewFinancials() ? '<button class="secondary" type="button" data-export-variation="'.concat(variation.id, '" ').concat(materials.length ? "" : "disabled", ">Выгрузить Excel</button>") : "", "\n        ").concat(["owner", "construction_manager", "finance_director"].includes(currentRoleBase()) && !["approved", "rejected"].includes(variation.status) ? '<button class="primary" type="button" data-variation-action="approve" data-variation-id="'.concat(variation.id, '">Согласовать</button><button class="secondary" type="button" data-variation-action="reject" data-variation-id="').concat(variation.id, '">Отклонить</button>') : "", '\n      </div>\n    </section>\n    <section class="workflow-panel">\n      <h3>Материалы</h3>\n      ').concat(materials.length ? '<div class="table variation-materials">\n              '.concat(materials.map(
      (item) => '\n                  <div class="row estimate-material-row">\n                    <div class="material-main">\n                      <strong>'.concat(item.title, '</strong>\n                      <div class="muted">').concat(item.estimate_section || "без раздела", "</div>\n                      ").concat(item.comment ? '<div class="muted">'.concat(item.comment, "</div>") : "", '\n                    </div>\n                    <div class="stack-line">\n                      ').concat(pill(materialBasisLabel(item.basis_type), materialBasisLevel(item.basis_type)), "\n                      ").concat(pill("".concat(item.requested_quantity || 0, " ").concat(item.requested_unit || item.estimate_material_unit || ""), "blue"), "\n                      ").concat(canViewFinancials() ? pill(money(item.total_amount), "success") : "", "\n                    </div>\n                  </div>")
    ).join(""), "\n            </div>") : '<p class="muted">К этой допработе пока не привязан список материалов.</p>', "\n    </section>");
    if (attachments.length) {
      qs("#variationDetailContent").insertAdjacentHTML(
        "beforeend",
        '<section class="workflow-panel">\n        <h3>Вложения</h3>\n        <div class="document-list">'.concat(attachments.map((doc) => '<div class="document-row">'.concat(documentFileLink(doc), "</div>")).join(""), "</div>\n      </section>")
      );
    }
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
      payload = __spreadProps(__spreadValues({}, payload), { financial_decision: decision.trim() || "customer", comment });
    }
    if (action === "reject") {
      const comment = window.prompt("Почему отклоняем?");
      if (comment === null) return;
      payload = __spreadProps(__spreadValues({}, payload), { financial_decision: "company", comment });
    }
    await api("/api/variations/".concat(variationId, "/").concat(action), {
      method: "POST",
      body: JSON.stringify(payload)
    });
    await renderVariations();
    await openVariationDialog(variationId);
    showToast(action === "approve" ? "Допработа согласована" : "Допработа отклонена");
  }
  function contractType(type) {
    return {
      customer_contract: "Заказчик",
      additional_agreement: "Доп. соглашение",
      supplier_contract: "Поставщик",
      contractor_contract: "Подрядчик",
      equipment_rent: "Аренда"
    }[type] || type;
  }
  function knowledgeFolderOptions(selected = "") {
    const selectedValue = String(selected || "");
    const options = ['<option value="">Без папки / корень базы знаний</option>'];
    (state.knowledgeFolders || []).forEach((folder) => {
      const value = String(folder.id);
      const labelText = folder.path || folder.title || "Папка ".concat(folder.id);
      options.push('<option value="'.concat(escapeAttr(value), '" ').concat(value === selectedValue ? "selected" : "", ">").concat(escapeHtml(labelText), "</option>"));
    });
    return options.join("");
  }
  function fillKnowledgeFolderSelects() {
    qsa('#documentForm select[name="folder_id"], #knowledgeFolderForm select[name="parent_id"]').forEach((select) => {
      const current = select.value || "";
      select.innerHTML = knowledgeFolderOptions(current);
    });
  }
  function knowledgeCurrentFolderId() {
    const current = String(state.knowledgeCurrentFolderId || "");
    if (!current) return "";
    const exists = (state.knowledgeFolders || []).some((folder) => String(folder.id) === current);
    if (!exists) {
      state.knowledgeCurrentFolderId = "";
      localStorage.setItem("knowledgeCurrentFolderId", "");
      return "";
    }
    return current;
  }
  function setKnowledgeCurrentFolderId(folderId = "") {
    state.knowledgeCurrentFolderId = String(folderId || "");
    localStorage.setItem("knowledgeCurrentFolderId", state.knowledgeCurrentFolderId);
  }
  function knowledgeFolderById(folderId, folders = state.knowledgeFolders || []) {
    const id = String(folderId || "");
    return folders.find((folder) => String(folder.id) === id) || null;
  }
  function knowledgeFolderAncestors(folderId, folders = state.knowledgeFolders || []) {
    const byId = new Map(folders.map((folder) => [String(folder.id), folder]));
    const result = [];
    let current = byId.get(String(folderId || ""));
    const visited = /* @__PURE__ */ new Set();
    while (current && !visited.has(String(current.id))) {
      visited.add(String(current.id));
      result.unshift(current);
      current = current.parent_id ? byId.get(String(current.parent_id)) : null;
    }
    return result;
  }
  function setKnowledgeUploading(isUploading, message = "") {
    state.knowledgeUploading = Boolean(isUploading);
    state.knowledgeUploadMessage = message || (isUploading ? "Загружаем файлы" : "");
    setAppLoading(state.knowledgeUploading, state.knowledgeUploadMessage || "Загружаем файлы", "knowledge-upload");
    updateKnowledgeUploadState();
  }
  function updateKnowledgeUploadState() {
    const status = qs("#documentUploadState");
    if (status) {
      status.hidden = !state.knowledgeUploading;
      status.querySelector("[data-upload-message]").textContent = state.knowledgeUploadMessage || "Загружаем файлы";
    }
    const submit = qs("#documentSubmitButton");
    if (submit) submit.disabled = state.knowledgeUploading;
    const manager = qs("[data-knowledge-drop-zone]");
    if (manager) {
      manager.classList.toggle("is-uploading", state.knowledgeUploading);
      manager.setAttribute("aria-busy", state.knowledgeUploading ? "true" : "false");
    }
    const overlay = qs(".knowledge-upload-overlay");
    if (overlay) {
      overlay.hidden = !state.knowledgeUploading;
      overlay.querySelector("[data-upload-message]").textContent = state.knowledgeUploadMessage || "Загружаем файлы";
    }
  }
  function renderKnowledgeUploadOverlay() {
    return '\n    <div class="knowledge-upload-overlay" '.concat(state.knowledgeUploading ? "" : "hidden", '>\n      <div class="upload-card">\n        <span class="apple-spinner" aria-hidden="true"></span>\n        <strong data-upload-message>').concat(escapeHtml(state.knowledgeUploadMessage || "Загружаем файлы"), "</strong>\n        <span>Пожалуйста, подождите. Большие фото и видео могут загружаться дольше.</span>\n      </div>\n    </div>");
  }
  function renderKnowledgeDocumentRow(doc) {
    const moveControls = canManageKnowledgeBase() ? '\n      <div class="knowledge-move-row">\n        <select data-document-move-folder="'.concat(doc.id, '" aria-label="Папка материала">').concat(knowledgeFolderOptions(doc.folder_id || ""), '</select>\n        <button class="secondary tiny" type="button" data-document-action="move" data-document-id="').concat(doc.id, '">Переместить</button>\n      </div>') : "";
    return '\n    <article class="knowledge-item knowledge-file-card">\n      <div class="knowledge-item-icon" aria-hidden="true">□</div>\n      <div class="knowledge-item-main">\n        '.concat(doc.file_path ? documentFileLink(doc) : "<div><strong>".concat(escapeHtml(documentTitle(doc)), '</strong><div class="muted">').concat(escapeHtml(doc.file_name || "Файл не загружен"), "</div></div>"), '\n        <div class="stack-line">').concat(pill(documentType(doc.type), "blue")).concat(pill(label(doc.status)), '</div>\n      </div>\n      <div class="knowledge-item-actions">\n        ').concat(moveControls, "\n        ").concat(canDeleteKnowledgeBase() ? '<button class="danger-button tiny" type="button" data-document-action="delete" data-document-id="'.concat(doc.id, '">Удалить</button>') : "", "\n      </div>\n    </article>");
  }
  function renderKnowledgeFolderRow(folder, folders = [], docs = []) {
    const id = String(folder.id);
    const childCount = folders.filter((item) => String(item.parent_id || "") === id).length;
    const fileCount = docs.filter((doc) => String(doc.folder_id || "") === id).length;
    const isEmpty = !childCount && !fileCount;
    return '\n    <article class="knowledge-item knowledge-folder-row">\n      <button class="knowledge-folder-open" type="button" data-knowledge-folder-open="'.concat(folder.id, '">\n        <span class="knowledge-item-icon" aria-hidden="true">▣</span>\n        <span class="knowledge-item-main">\n          <strong>').concat(escapeHtml(folder.title || "Папка"), '</strong>\n          <span class="muted">').concat(fileCount, " файл(ов) · ").concat(childCount, ' подпапок</span>\n        </span>\n      </button>\n      <div class="knowledge-item-actions">\n        ').concat(canDeleteKnowledgeBase() && isEmpty ? '<button class="danger-button tiny" type="button" data-folder-action="delete" data-folder-id="'.concat(folder.id, '">Удалить</button>') : "", "\n      </div>\n    </article>");
  }
  function renderKnowledgeBreadcrumb(currentId, folders = []) {
    const ancestors = knowledgeFolderAncestors(currentId, folders);
    const items = [
      '<button type="button" data-knowledge-folder-open="">База знаний</button>',
      ...ancestors.map((folder) => '<button type="button" data-knowledge-folder-open="'.concat(folder.id, '">').concat(escapeHtml(folder.title || "Папка"), "</button>"))
    ];
    return '<nav class="knowledge-breadcrumb" aria-label="Путь в базе знаний">'.concat(items.join("<span>/</span>"), "</nav>");
  }
  function renderKnowledgeFileManager(folders = [], docs = []) {
    const currentId = knowledgeCurrentFolderId();
    const currentFolder = knowledgeFolderById(currentId, folders);
    const childFolders = folders.filter((folder) => String(folder.parent_id || "") === currentId).sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "ru"));
    const folderDocs = docs.filter((doc) => String(doc.folder_id || "") === currentId).sort((a, b) => String(documentTitle(a) || "").localeCompare(String(documentTitle(b) || ""), "ru"));
    const parentId = (currentFolder == null ? void 0 : currentFolder.parent_id) ? String(currentFolder.parent_id) : "";
    const emptyMessage = currentId ? "В этой папке пока нет файлов и подпапок." : "База знаний пока пустая. Загружайте сюда регламенты, проектные решения, узлы и общую документацию.";
    const rows = [
      currentId ? '<article class="knowledge-item knowledge-back-row"><button class="knowledge-folder-open" type="button" data-knowledge-folder-open="'.concat(escapeAttr(parentId), '"><span class="knowledge-item-icon">↩</span><span class="knowledge-item-main"><strong>Назад</strong><span class="muted">В родительскую папку</span></span></button></article>') : "",
      ...childFolders.map((folder) => renderKnowledgeFolderRow(folder, folders, docs)),
      ...folderDocs.map(renderKnowledgeDocumentRow)
    ].filter(Boolean).join("");
    return '\n    <section class="knowledge-manager" data-knowledge-drop-zone data-folder-id="'.concat(escapeAttr(currentId), '">\n      ').concat(renderKnowledgeBreadcrumb(currentId, folders), '\n      <div class="knowledge-current-head">\n        <div>\n          <h3>').concat(escapeHtml((currentFolder == null ? void 0 : currentFolder.title) || "База знаний"), '</h3>\n          <p class="muted">').concat(currentId ? escapeHtml((currentFolder == null ? void 0 : currentFolder.path) || "") : "Корень базы знаний", " · ").concat(childFolders.length, " папок · ").concat(folderDocs.length, " файлов</p>\n        </div>\n        ").concat(canManageKnowledgeBase() ? '<div class="knowledge-drop-text">Перетащите файлы или папку сюда, чтобы загрузить их в текущую папку</div>' : "", '\n      </div>\n      <div class="knowledge-list">\n        ').concat(rows || '<p class="muted knowledge-empty">'.concat(emptyMessage, "</p>"), "\n      </div>\n      ").concat(canManageKnowledgeBase() ? renderKnowledgeUploadOverlay() : "", "\n    </section>");
  }
  function knowledgeUploadItem(file, relativePath = "") {
    return {
      file,
      relativePath: relativePath || file.webkitRelativePath || file.name
    };
  }
  function normalizeKnowledgeUploadItems(files = []) {
    return Array.from(files || []).map((item) => {
      if (!item) return null;
      if (item.file instanceof File) return knowledgeUploadItem(item.file, item.relativePath);
      if (item instanceof File) return knowledgeUploadItem(item);
      return null;
    }).filter(Boolean);
  }
  function readKnowledgeDirectoryEntries(reader) {
    return new Promise((resolve, reject) => {
      const entries = [];
      const readBatch = () => {
        reader.readEntries(
          (batch) => {
            if (!batch.length) {
              resolve(entries);
              return;
            }
            entries.push(...batch);
            readBatch();
          },
          (error) => reject(error)
        );
      };
      readBatch();
    });
  }
  async function collectKnowledgeHandleFiles(handle, parentPath = "") {
    if (!handle) return [];
    const handlePath = "".concat(parentPath).concat(handle.name || "");
    if (handle.kind === "file" && typeof handle.getFile === "function") {
      try {
        const file = await handle.getFile();
        return [knowledgeUploadItem(file, handlePath || file.name)];
      } catch (e) {
        return [];
      }
    }
    if (handle.kind === "directory") {
      const children = [];
      if (typeof handle.values === "function") {
        try {
          for (var iter = __forAwait(handle.values()), more, temp, error; more = !(temp = await iter.next()).done; more = false) {
            const child = temp.value;
            children.push(child);
          }
        } catch (temp) {
          error = [temp];
        } finally {
          try {
            more && (temp = iter.return) && await temp.call(iter);
          } finally {
            if (error)
              throw error[0];
          }
        }
      } else if (typeof handle.entries === "function") {
        try {
          for (var iter2 = __forAwait(handle.entries()), more2, temp2, error2; more2 = !(temp2 = await iter2.next()).done; more2 = false) {
            const [, child] = temp2.value;
            children.push(child);
          }
        } catch (temp2) {
          error2 = [temp2];
        } finally {
          try {
            more2 && (temp2 = iter2.return) && await temp2.call(iter2);
          } finally {
            if (error2)
              throw error2[0];
          }
        }
      }
      const nested = await Promise.allSettled(children.map((child) => collectKnowledgeHandleFiles(child, "".concat(handlePath, "/"))));
      return nested.filter((item) => item.status === "fulfilled").flatMap((item) => item.value || []);
    }
    return [];
  }
  async function collectKnowledgeDataTransferHandles(items = []) {
    const handleItems = Array.from(items || []).filter((item) => typeof item.getAsFileSystemHandle === "function");
    if (!handleItems.length) return [];
    const handles = await Promise.all(handleItems.map((item) => item.getAsFileSystemHandle().catch(() => null)));
    const nested = await Promise.all(handles.filter(Boolean).map((handle) => collectKnowledgeHandleFiles(handle)));
    return nested.flat();
  }
  async function collectKnowledgeEntryFiles(entry, parentPath = "") {
    if (!entry) return [];
    const entryPath = "".concat(parentPath).concat(entry.name || "");
    if (entry.isFile) {
      return new Promise((resolve, reject) => {
        entry.file(
          (file) => resolve([knowledgeUploadItem(file, entryPath || file.name)]),
          (error) => reject(error)
        );
      });
    }
    if (entry.isDirectory) {
      const children = await readKnowledgeDirectoryEntries(entry.createReader());
      const nested = await Promise.all(children.map((child) => collectKnowledgeEntryFiles(child, "".concat(entryPath, "/"))));
      return nested.flat();
    }
    return [];
  }
  async function collectKnowledgeDroppedFiles(dataTransfer) {
    const items = Array.from((dataTransfer == null ? void 0 : dataTransfer.items) || []);
    const handleFiles = await collectKnowledgeDataTransferHandles(items).catch(() => []);
    if (handleFiles.length) return handleFiles;
    const entries = items.map((item) => typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null).filter(Boolean);
    if (entries.length) {
      const nested = await Promise.allSettled(entries.map((entry) => collectKnowledgeEntryFiles(entry)));
      const collected = nested.filter((item) => item.status === "fulfilled").flatMap((item) => item.value || []);
      if (collected.length) return collected;
      const fallbackFiles = normalizeKnowledgeUploadItems(Array.from((dataTransfer == null ? void 0 : dataTransfer.files) || []));
      if (fallbackFiles.length) return fallbackFiles;
      throw new Error("Не удалось прочитать папку. Проверьте, что она находится на компьютере, а не только в облаке, или выберите ее через «Добавить материал» → «Или папка целиком».");
    }
    return normalizeKnowledgeUploadItems(Array.from((dataTransfer == null ? void 0 : dataTransfer.files) || []));
  }
  async function uploadKnowledgeFiles(files, options = {}) {
    var _a;
    const fileList = normalizeKnowledgeUploadItems(files);
    if (!fileList.length) {
      showToast("Выберите файлы для загрузки");
      return;
    }
    const folderId = (_a = options.folderId) != null ? _a : knowledgeCurrentFolderId();
    const type = options.type || "other";
    const title = options.title || "";
    const message = fileList.length > 1 ? "Загружаем файлы: ".concat(fileList.length) : "Загружаем файл: ".concat(fileList[0].file.name);
    setKnowledgeUploading(true, message);
    try {
      const documents = await Promise.all(
        fileList.map(async (item) => {
          const file = item.file;
          const relativePath = item.relativePath || file.name;
          const fallbackTitle = file.name.replace(/\.[^.]+$/, "") || file.name;
          const itemTitle = fileList.length === 1 && title ? title : fallbackTitle;
          return {
            title: itemTitle,
            type,
            folder_id: folderId || "",
            relative_path: relativePath,
            document_file: await fileDocumentPayload(file, fileList.length === 1 && title ? title : file.name, type, "knowledge_base")
          };
        })
      );
      await api("/api/documents", {
        method: "POST",
        body: JSON.stringify({ related_type: "knowledge_base", folder_id: folderId || "", type, documents })
      });
      await renderDocuments();
      showToast(fileList.length > 1 ? "Материалы добавлены в базу знаний: ".concat(fileList.length) : "Материал добавлен в базу знаний");
    } finally {
      setKnowledgeUploading(false);
    }
  }
  async function renderDocuments() {
    const newKnowledgeFolderButton = qs("#newKnowledgeFolderButton");
    const newDocumentButton = qs("#newDocumentButton");
    if (newKnowledgeFolderButton) newKnowledgeFolderButton.hidden = !canManageKnowledgeBase();
    if (newDocumentButton) newDocumentButton.hidden = !canManageKnowledgeBase();
    const [folders, docs] = await Promise.all([
      api("/api/document-folders?related_type=knowledge_base"),
      api("/api/documents?related_type=knowledge_base")
    ]);
    state.knowledgeFolders = Array.isArray(folders) ? folders : [];
    fillKnowledgeFolderSelects();
    qs("#documentCards").innerHTML = renderKnowledgeFileManager(state.knowledgeFolders, Array.isArray(docs) ? docs : []);
    updateKnowledgeUploadState();
  }
  function feedbackStatusLabel(status) {
    return {
      new: "Новое",
      in_work: "В работе",
      done: "Обработано"
    }[status] || status || "Новое";
  }
  function feedbackStatusLevel(status) {
    return {
      new: "warning",
      in_work: "blue",
      done: "success"
    }[status] || "";
  }
  function renderFeedbackAttachments(attachments = []) {
    if (!Array.isArray(attachments) || !attachments.length) return "";
    return '\n    <div class="feedback-attachments">\n      '.concat(attachments.map((attachment, index) => {
      var _a, _b;
      const url = attachment.url || ((_a = attachment.payload) == null ? void 0 : _a.url) || "";
      const type = attachment.type || "file";
      const title = attachment.name || "".concat(type, " ").concat(index + 1);
      if (url && type === "image") {
        return '\n              <a class="feedback-attachment image" href="'.concat(escapeAttr(url), '" target="_blank" rel="noopener noreferrer">\n                <img src="').concat(escapeAttr(url), '" alt="').concat(escapeAttr(title), '" loading="lazy" />\n                <span>Открыть скриншот</span>\n              </a>');
      }
      if (url && type === "video") {
        const thumbnail = attachment.thumbnail_url || ((_b = attachment.thumbnail) == null ? void 0 : _b.url) || "";
        return '\n              <a class="feedback-attachment image" href="'.concat(escapeAttr(url), '" target="_blank" rel="noopener noreferrer">\n                ').concat(thumbnail ? '<img src="'.concat(escapeAttr(thumbnail), '" alt="').concat(escapeAttr(title), '" loading="lazy" />') : "", "\n                <span>Открыть видео").concat(attachment.duration ? " · ".concat(attachment.duration, " сек.") : "", "</span>\n              </a>");
      }
      if (url) {
        return '<a class="feedback-attachment" href="'.concat(escapeAttr(url), '" target="_blank" rel="noopener noreferrer">').concat(escapeHtml(title), "</a>");
      }
      return '<span class="feedback-attachment muted">'.concat(escapeHtml(title), "</span>");
    }).join(""), "\n    </div>");
  }
  function feedbackStatusButton(item, status, title) {
    const isActive = item.status === status;
    const activeLabel = {
      in_work: "В работе",
      done: "Готово"
    }[status];
    return '\n    <button\n      class="secondary tiny feedback-status-button '.concat(isActive ? "is-active" : "", '"\n      type="button"\n      data-feedback-status="').concat(status, '"\n      data-feedback-id="').concat(item.id, '"\n      ').concat(isActive ? "disabled" : "", "\n    >").concat(isActive && activeLabel ? activeLabel : title, "</button>");
  }
  function updateFeedbackRefreshUi(isLoading, message = "") {
    state.feedbackRefreshing = Boolean(isLoading);
    const button = qs("#refreshFeedbackButton");
    const statusNode = qs("#feedbackRefreshStatus");
    if (button) {
      button.disabled = state.feedbackRefreshing;
      button.classList.toggle("is-pending", state.feedbackRefreshing);
      button.textContent = state.feedbackRefreshing ? "Обновляю..." : "Обновить";
    }
    if (statusNode && message) {
      statusNode.textContent = message;
    }
  }
  function feedbackRefreshMessage(itemsCount = null) {
    const countText = itemsCount === null ? "" : "Сообщений: ".concat(itemsCount, ". ");
    return "".concat(countText, "Последнее обновление: ").concat(state.feedbackLastUpdatedAt || "еще не было");
  }
  async function renderFeedback(options = {}) {
    const { silent = false } = options;
    const rowsNode = qs("#feedbackRows");
    const statsNode = qs("#feedbackStats");
    const statusNode = qs("#feedbackRefreshStatus");
    const bindingsPanel = qs("#maxBindingsPanel");
    const bindingsRows = qs("#maxBindingRows");
    const deleteSelectedButton = qs("#deleteSelectedFeedbackButton");
    if (!rowsNode || !statsNode) return;
    if (!canView("feedback")) {
      rowsNode.innerHTML = "";
      statsNode.innerHTML = "";
      if (statusNode) statusNode.textContent = "";
      if (bindingsPanel) bindingsPanel.hidden = true;
      if (deleteSelectedButton) deleteSelectedButton.hidden = true;
      return;
    }
    if (deleteSelectedButton) deleteSelectedButton.hidden = !canDeleteFeedback();
    renderMaxBindings(bindingsPanel, bindingsRows);
    if (!silent) updateFeedbackRefreshUi(true, "Обновляю список обратной связи...");
    let items = [];
    try {
      items = await api("/api/feedback?_=".concat(Date.now()), { cache: "no-store" });
      state.feedbackLastUpdatedAt = (/* @__PURE__ */ new Date()).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    } catch (error) {
      updateFeedbackRefreshUi(false, "Не удалось обновить обратную связь: ".concat(error.message || "ошибка загрузки"));
      throw error;
    }
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
      ["done", "Обработано"]
    ];
    statsNode.innerHTML = statItems.map(
      ([key, title]) => '\n      <button class="task-stat '.concat(state.feedbackFilter === key ? "active" : "", '" type="button" data-feedback-filter="').concat(key, '">\n        <span>').concat(title, "</span>\n        <strong>").concat(counts[key] || 0, "</strong>\n      </button>")
    ).join("");
    const filtered = state.feedbackFilter === "all" ? items : items.filter((item) => item.status === state.feedbackFilter);
    rowsNode.innerHTML = filtered.length ? filtered.map((item) => {
      const attachments = Array.isArray(item.attachments) ? item.attachments : [];
      return '\n          <article class="row feedback-row">\n            <div class="feedback-main">\n              <div class="feedback-head">\n                <label class="feedback-select" aria-label="Выбрать сообщение">\n                  <input type="checkbox" data-feedback-check="'.concat(item.id, '" ').concat(state.selectedFeedbackIds.has(Number(item.id)) ? "checked" : "", ' />\n                </label>\n                <div class="feedback-title">\n                  <strong>').concat(escapeHtml(item.sender_name || item.sender_id || "MAX"), "</strong>\n                  ").concat(pill(feedbackStatusLabel(item.status), feedbackStatusLevel(item.status)), '\n                </div>\n              </div>\n              <div class="muted">').concat(escapeHtml(item.chat_title || item.chat_id || "Чат MAX"), " · ").concat(formatDateRu(item.created_at), "</div>\n              <p>").concat(escapeHtml(item.text || "Без текста").replace(/\n/g, "<br>"), "</p>\n              ").concat(renderFeedbackAttachments(attachments), "\n              ").concat(item.decision_comment ? '<div class="muted">Комментарий: '.concat(escapeHtml(item.decision_comment), "</div>") : "", '\n            </div>\n            <div class="feedback-actions">\n              ').concat(feedbackStatusButton(item, "in_work", "В работу"), "\n              ").concat(feedbackStatusButton(item, "done", "Готово"), "\n              ").concat(canDeleteFeedback() ? '<button class="danger-button tiny" type="button" data-feedback-delete="'.concat(item.id, '">Удалить</button>') : "", "\n            </div>\n          </article>");
    }).join("") : '<p class="muted">Сообщений из MAX пока нет.</p>';
    updateFeedbackRefreshUi(false, feedbackRefreshMessage(items.length));
  }
  function renderMaxBindings(panel, rowsNode) {
    if (!panel || !rowsNode) return;
    const canManage = canManageSystemSettings();
    panel.hidden = !canManage;
    if (!canManage) return;
    rememberMaxBindingDrafts(rowsNode);
    rowsNode.innerHTML = state.users.map(
      (user) => {
        var _a, _b, _c;
        const draft = state.maxChatDrafts[String(user.id)] || {};
        const maxChatId = (_b = (_a = draft.max_chat_id) != null ? _a : user.max_chat_id) != null ? _b : "";
        const maxEnabled = (_c = draft.enabled) != null ? _c : Boolean(user.max_notifications_enabled);
        return '\n      <article class="row max-binding-row" data-max-user-row="'.concat(user.id, '">\n        <div>\n          <strong>').concat(taskParticipantLabel(user), '</strong>\n          <div class="muted">').concat(maxEnabled ? "Личные уведомления включены" : "Личные уведомления выключены", '</div>\n        </div>\n        <input name="max_chat_id" value="').concat(escapeAttr(maxChatId), '" placeholder="Личный chat_id из MAX" />\n        <label class="checkbox-line">\n          <input name="max_enabled" type="checkbox" ').concat(maxEnabled ? "checked" : "", ' />\n          Включить\n        </label>\n        <button class="secondary tiny" type="button" data-save-max-chat="').concat(user.id, '">Сохранить</button>\n      </article>');
      }
    ).join("");
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
    var _a;
    const userId = (_a = row == null ? void 0 : row.dataset) == null ? void 0 : _a.maxUserRow;
    if (!userId) return;
    const input = row.querySelector('input[name="max_chat_id"]');
    const checkbox = row.querySelector('input[name="max_enabled"]');
    if (!input || !checkbox) return;
    state.maxChatDrafts[String(userId)] = {
      max_chat_id: input.value,
      enabled: checkbox.checked
    };
  }
  async function renderEvents() {
    const events = await api("/api/events");
    qs("#eventTimeline").innerHTML = events.map((event) => '\n    <article class="timeline-item">\n      <div class="stack-line"><strong>'.concat(eventType(event.type), "</strong>").concat(pill(event.visibility === "customer_allowed" ? "Можно заказчику" : "Внутреннее", event.visibility === "customer_allowed" ? "success" : ""), "</div>\n      <p>").concat(event.text, '</p>\n      <div class="muted">').concat(event.project_title, " · ").concat(event.author_name || "автор не указан", " · ").concat(event.created_at, "</div>\n    </article>")).join("");
  }
  function eventType(type) {
    return {
      decision: "Решение",
      comment: "Комментарий",
      document: "Документ",
      problem: "Проблема",
      customer_approval: "Согласование"
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
    const form = qs("#".concat(formId));
    await api(endpoint, { method: "POST", body: JSON.stringify(formToJson(form)) });
    qs("#".concat(dialogId)).close();
    form.reset();
    await loadAll();
    showToast(successMessage);
  }
  function hasOpenDialog() {
    return Boolean(document.querySelector("dialog[open]"));
  }
  function bindStableDetailsTouchGuard() {
    document.addEventListener(
      "touchstart",
      (event) => {
        var _a, _b, _c, _d;
        const summary = (_b = (_a = event.target).closest) == null ? void 0 : _b.call(_a, "summary");
        if (!((_c = summary == null ? void 0 : summary.parentElement) == null ? void 0 : _c.classList.contains("estimate-section"))) return;
        const touch = (_d = event.touches) == null ? void 0 : _d[0];
        if (!touch) return;
        summary.dataset.touchStartX = String(touch.clientX);
        summary.dataset.touchStartY = String(touch.clientY);
        summary.dataset.touchMoved = "0";
      },
      { passive: true }
    );
    document.addEventListener(
      "touchmove",
      (event) => {
        var _a, _b, _c, _d;
        const summary = (_b = (_a = event.target).closest) == null ? void 0 : _b.call(_a, "summary");
        if (!((_c = summary == null ? void 0 : summary.parentElement) == null ? void 0 : _c.classList.contains("estimate-section"))) return;
        const touch = (_d = event.touches) == null ? void 0 : _d[0];
        if (!touch) return;
        const startX = Number(summary.dataset.touchStartX || touch.clientX);
        const startY = Number(summary.dataset.touchStartY || touch.clientY);
        if (Math.abs(touch.clientX - startX) > 8 || Math.abs(touch.clientY - startY) > 8) {
          summary.dataset.touchMoved = "1";
        }
      },
      { passive: true }
    );
    document.addEventListener(
      "click",
      (event) => {
        var _a, _b, _c;
        const summary = (_b = (_a = event.target).closest) == null ? void 0 : _b.call(_a, "summary");
        if (!((_c = summary == null ? void 0 : summary.parentElement) == null ? void 0 : _c.classList.contains("estimate-section"))) return;
        if (summary.dataset.touchMoved === "1") {
          event.preventDefault();
          event.stopImmediatePropagation();
          summary.dataset.touchMoved = "0";
        }
      },
      true
    );
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
    } else if (state.view === "estimates") {
      await renderEstimateJobs();
    } else if (state.view === "feedback") {
      await renderFeedback({ silent: true });
    }
  }
  function setProjectFileFieldsRequired(required) {
    ["estimate_file_name", "work_task_file", "contract_file", "estimate_doc_file", "project_docs_file"].forEach((name) => {
      const input = qs('#projectForm input[name="'.concat(name, '"]'));
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
    setProjectSaving(false);
    setProjectFileStatus("");
    setProjectExistingFiles(null);
    restoreProjectFormDraft(form);
  }
  async function openProjectEditDialog(projectId) {
    const project = await api("/api/projects/".concat(projectId));
    const form = qs("#projectForm");
    form.reset();
    form.dataset.mode = "edit";
    form.dataset.projectId = project.id;
    form.dataset.existingEstimateFileName = project.estimate_file_name || "";
    form.dataset.existingWorkTaskFileName = project.work_task_file_name || "";
    qs("#projectDialogTitle").textContent = "Редактирование объекта";
    qs("#projectSubmitButton").textContent = "Сохранить";
    setProjectFileFieldsRequired(false);
    setProjectSaving(false);
    setProjectFormStatus("");
    setProjectFileStatus("");
    setProjectExistingFiles(project);
    form.elements.title.value = project.title || "";
    form.elements.customer_name.value = project.customer_name || "";
    form.elements.customer_phone.value = project.customer_phone || "";
    form.elements.customer_email.value = project.customer_email || "";
    form.elements.address.value = project.address || "";
    form.elements.navigator_url.value = project.navigator_url || "";
    form.elements.manager_note.value = project.manager_note || "";
    form.elements.smetter_ref.value = project.smetter_ref || "";
    form.elements.planned_end_date.value = project.planned_end_date || "";
    form.elements.main_estimate_amount.value = project.main_estimate_amount || "";
    qs("#projectDialog").showModal();
  }
  function openContractDialog(projectId = "") {
    var _a;
    const form = qs("#contractForm");
    form.reset();
    if (projectId) form.elements.project_id.value = String(projectId);
    form.elements.responsible_id.value = currentUserId() || ((_a = state.users.find((user) => user.role === "construction_manager")) == null ? void 0 : _a.id) || "";
    qs("#contractDialog").showModal();
  }
  async function handleProjectAction(button) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r;
    const projectId = button.dataset.projectId;
    const action = button.dataset.projectAction;
    let payload = { actor_id: currentUserId(), actor_role: currentRoleBase() };
    let message = "Объект обновлен";
    if (action === "return") {
      payload = { comment: ((_a = qs("#returnComment")) == null ? void 0 : _a.value) || "" };
      message = "Объект возвращен менеджеру";
    }
    if (action === "archive") {
      const confirmed = window.confirm("Отправить объект в архив? Активные задачи и заявки по объекту будут скрыты из рабочих реестров. Вернуть объект сможет ген.директор или руководитель строительства.");
      if (!confirmed) return;
      payload = { reason: ((_b = qs("#archiveReason")) == null ? void 0 : _b.value) || "" };
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
        title: (_c = qs("#projectEditTitle")) == null ? void 0 : _c.value,
        customer_name: (_d = qs("#projectEditCustomer")) == null ? void 0 : _d.value,
        address: (_e = qs("#projectEditAddress")) == null ? void 0 : _e.value,
        smetter_ref: (_f = qs("#projectEditSmetter")) == null ? void 0 : _f.value,
        planned_end_date: (_g = qs("#projectEditEndDate")) == null ? void 0 : _g.value,
        main_estimate_amount: (_h = qs("#projectEditEstimate")) == null ? void 0 : _h.value,
        estimate_file_name: (_i = qs("#projectEditFileName")) == null ? void 0 : _i.value
      };
      message = "Карточка объекта сохранена";
    }
    if (action === "accept") {
      payload = {
        foreman_id: (_j = qs("#acceptForeman")) == null ? void 0 : _j.value,
        estimator_id: (_k = qs("#acceptEstimator")) == null ? void 0 : _k.value,
        procurement_manager_id: (_l = qs("#acceptProcurement")) == null ? void 0 : _l.value,
        tech_supervisor_id: (_m = qs("#acceptTech")) == null ? void 0 : _m.value
      };
      message = "Объект принят в работу";
    }
    if (action === "assign") {
      payload = {
        actor_id: currentUserId(),
        actor_role: currentRoleBase(),
        foreman_id: (_n = qs("#assignForeman")) == null ? void 0 : _n.value,
        estimator_id: (_o = qs("#assignEstimator")) == null ? void 0 : _o.value,
        procurement_manager_id: (_p = qs("#assignProcurement")) == null ? void 0 : _p.value,
        tech_supervisor_id: (_q = qs("#assignTech")) == null ? void 0 : _q.value
      };
      message = "Ответственные по объекту обновлены";
    }
    if (action === "submit") {
      payload.comment = ((_r = qs("#submitFixComment")) == null ? void 0 : _r.value) || "";
      message = "Объект передан руководителю строительства";
    }
    await api("/api/projects/".concat(projectId, "/").concat(action), {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const numericProjectId = Number(projectId);
    if (action === "delete") {
      state.selectedProjectId = null;
      state.projectListMode = "archive";
      await loadAll();
      switchView("projects");
      qs("#projectDetail").innerHTML = '<p class="muted">Объект удален из архива навсегда.</p>';
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
    var _a, _b, _c, _d, _e;
    const taskId = button.dataset.taskId;
    const action = button.dataset.taskAction;
    const panel = button.closest("[data-task-action-panel]");
    const panelComment = ((_a = panel == null ? void 0 : panel.querySelector("[data-task-action-comment]")) == null ? void 0 : _a.value.trim()) || "";
    const panelDueDate = ((_b = panel == null ? void 0 : panel.querySelector("[data-task-action-due-date]")) == null ? void 0 : _b.value) || "";
    const panelFiles = [...((_c = panel == null ? void 0 : panel.querySelector("[data-task-action-files]")) == null ? void 0 : _c.files) || []];
    let payload = {};
    let message = "Задача обновлена";
    if (action === "complete") {
      const answer = panel ? panelComment : window.prompt("Что сделано по задаче? Можно оставить пустым.", "");
      if (answer === null) return;
      const comment = answer || "";
      payload = __spreadProps(__spreadValues({}, payload), { comment });
      message = "Задача отмечена выполненной";
    }
    if (action === "accept") {
      const answer = panel ? panelComment : window.prompt("Комментарий к приемке. Можно оставить пустым.", "");
      if (answer === null) return;
      const comment = answer || "";
      payload = __spreadProps(__spreadValues({}, payload), { comment });
      message = "Выполнение принято";
    }
    if (action === "return") {
      const comment = panel ? panelComment : window.prompt("Что нужно доработать?");
      if (comment === null || !String(comment).trim()) {
        showToast("Напишите, что нужно доработать");
        return;
      }
      const dueDate = panel ? panelDueDate : window.prompt("Новый срок выполнения в формате ГГГГ-ММ-ДД. Можно оставить пустым.");
      if (dueDate === null) return;
      payload = __spreadProps(__spreadValues({}, payload), { comment, due_date: dueDate.trim() });
      message = "Задача возвращена на доработку";
    }
    if (action === "postpone") {
      const comment = panel ? panelComment : window.prompt("Почему переносим срок или что выполнено частично?");
      if (comment === null || !String(comment).trim()) {
        showToast("Напишите причину переноса или частичного выполнения");
        return;
      }
      const dueDate = panel ? panelDueDate : window.prompt("Новый срок выполнения в формате ГГГГ-ММ-ДД", "");
      if (dueDate === null) return;
      payload = __spreadProps(__spreadValues({}, payload), { comment, due_date: String(dueDate).trim() });
      message = "Задача оставлена в работе с новым комментарием";
    }
    if (action === "delete") {
      const confirmed = window.confirm("Удалить задачу? Это действие нельзя отменить.");
      if (!confirmed) return;
      message = "Задача удалена";
      payload = __spreadProps(__spreadValues({}, payload), { comment: "Удалено из интерфейса задач." });
    }
    if (panelFiles.length) {
      payload.attachments = await Promise.all(panelFiles.map((file) => fileDocumentPayload(file, file.name, "other", "task")));
    }
    payload.actor_id = currentUserId() || null;
    payload.actor_role = currentRoleBase();
    await api("/api/tasks/".concat(taskId, "/").concat(action), {
      method: "POST",
      body: JSON.stringify(payload)
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
    if (((_d = qs("#taskDetailDialog")) == null ? void 0 : _d.open) && action !== "delete") openTaskDetail(taskId);
    if (action === "delete" && ((_e = qs("#taskDetailDialog")) == null ? void 0 : _e.open)) qs("#taskDetailDialog").close();
    showToast(message);
  }
  async function handleTaskComment(button) {
    var _a;
    const taskId = button.dataset.taskCommentSend;
    const form = button.closest("[data-task-comment-form]");
    const textarea = form == null ? void 0 : form.querySelector("textarea");
    const files = [...((_a = form == null ? void 0 : form.querySelector('input[type="file"]')) == null ? void 0 : _a.files) || []];
    const comment = (textarea == null ? void 0 : textarea.value.trim()) || "";
    if (!comment && !files.length) {
      showToast("Напишите комментарий по задаче или прикрепите файл");
      return;
    }
    button.disabled = true;
    try {
      await api("/api/tasks/".concat(taskId, "/comment"), {
        method: "POST",
        body: JSON.stringify({
          actor_id: currentUserId() || null,
          comment,
          attachments: await Promise.all(files.map((file) => fileDocumentPayload(file, file.name, "other", "task")))
        })
      });
      const selectedProjectId = state.selectedProjectId;
      const selectedTaskProjectId = state.selectedTaskProjectId;
      await loadAll();
      state.selectedProjectId = selectedProjectId;
      state.selectedTaskProjectId = selectedTaskProjectId;
      if (state.view === "tasks") await renderTasks();
      openTaskDetail(taskId);
      showToast("Комментарий добавлен");
    } finally {
      button.disabled = false;
    }
  }
  function bindEvents() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
    bindStableDetailsTouchGuard();
    initPullToRefresh();
    qsa("[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
    qsa("[data-view-target]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.viewTarget)));
    qs("#refreshButton").addEventListener("click", () => refreshAppFromUser("Обновляем данные").catch((error) => showToast(error.message)));
    (_a = qs("#logoutButton")) == null ? void 0 : _a.addEventListener("click", () => {
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
      await renderEstimateJobs();
      await renderDashboard();
      await renderMaterials();
      await renderDocuments();
      fillMaterialProjectSelect();
      updateMaterialActorHint();
      showToast("Роль: ".concat(roleLabel(state.currentRole)));
    });
    qs("#newProjectButton").addEventListener("click", () => {
      resetProjectDialog();
      qs("#projectDialog").showModal();
    });
    (_b = qs("#newContractButton")) == null ? void 0 : _b.addEventListener("click", () => openContractDialog(state.selectedProjectId || ""));
    qs("#newTaskButton").addEventListener("click", () => {
      var _a2;
      const form = qs("#taskForm");
      form.reset();
      form.elements.creator_role.value = currentRoleBase();
      const userId = currentUserId();
      form.elements.creator_id.value = userId || "";
      if (userId && form.elements.reviewer_id) form.elements.reviewer_id.value = String(userId);
      if (state.selectedProjectId && form.elements.project_id) form.elements.project_id.value = String(state.selectedProjectId);
      loadTaskContractOptions(((_a2 = form.elements.project_id) == null ? void 0 : _a2.value) || "");
      qs("#taskDialog").showModal();
    });
    (_c = qs('#taskForm select[name="project_id"]')) == null ? void 0 : _c.addEventListener("change", (event) => loadTaskContractOptions(event.target.value));
    qs("#newEstimateJobButton").addEventListener("click", () => openEstimateJobDialog());
    (_d = qs('#estimateJobForm select[name="estimate_type"]')) == null ? void 0 : _d.addEventListener("change", () => syncEstimateSiteCostsByType());
    (_e = qs('#estimateJobForm select[name="site_costs_policy"]')) == null ? void 0 : _e.addEventListener("change", () => {
      qs("#estimateJobForm").dataset.siteCostsTouched = "true";
    });
    (_f = qs('#estimateJobFileForm select[name="mode"]')) == null ? void 0 : _f.addEventListener("change", updateEstimateFileDialogMode);
    qs("#newMaterialButton").addEventListener("click", async () => {
      const form = qs("#materialForm");
      form.reset();
      resetExtraMaterials();
      qs("#materialEstimatePicker").innerHTML = '<p class="muted">Выберите объект и нажмите “Материалы по смете”.</p>';
      fillMaterialProjectSelect(state.selectedProjectId);
      updateMaterialActorHint();
      await loadMaterialEstimatePicker();
      qs("#materialDialog").showModal();
    });
    qs("#newVariationButton").addEventListener("click", () => qs("#variationDialog").showModal());
    (_g = qs("#newKnowledgeFolderButton")) == null ? void 0 : _g.addEventListener("click", () => {
      const form = qs("#knowledgeFolderForm");
      form.reset();
      fillKnowledgeFolderSelects();
      form.elements.parent_id.value = knowledgeCurrentFolderId();
      qs("#knowledgeFolderDialog").showModal();
    });
    qs("#newDocumentButton").addEventListener("click", () => {
      const form = qs("#documentForm");
      form.reset();
      fillKnowledgeFolderSelects();
      form.elements.folder_id.value = knowledgeCurrentFolderId();
      updateKnowledgeUploadState();
      qs("#documentDialog").showModal();
    });
    qs("#newEventButton").addEventListener("click", () => qs("#eventDialog").showModal());
    (_h = qs("#refreshFeedbackButton")) == null ? void 0 : _h.addEventListener("click", async () => {
      try {
        await renderFeedback();
        showToast("Обратная связь обновлена");
      } catch (error) {
        showToast(error.message || "Не удалось обновить обратную связь");
      }
    });
    (_i = qs("#deleteSelectedFeedbackButton")) == null ? void 0 : _i.addEventListener("click", async () => {
      if (!canDeleteFeedback()) {
        showToast("Удаление сообщений недоступно для текущей роли");
        return;
      }
      const ids = [...state.selectedFeedbackIds].filter(Boolean);
      if (!ids.length) {
        showToast("Выберите сообщения для удаления");
        return;
      }
      const confirmed = confirm("Удалить выбранные сообщения: ".concat(ids.length, "?"));
      if (!confirmed) return;
      const result = await api("/api/feedback/delete-bulk", {
        method: "POST",
        body: JSON.stringify({ ids })
      });
      ids.forEach((id) => state.selectedFeedbackIds.delete(Number(id)));
      await renderFeedback();
      showToast("Удалено сообщений: ".concat(result.deleted || ids.length));
    });
    qsa("[data-close]").forEach((button) => button.addEventListener("click", () => qs("#".concat(button.dataset.close)).close()));
    (_j = qs("#estimateImagePrev")) == null ? void 0 : _j.addEventListener("click", () => moveEstimateGallery(-1));
    (_k = qs("#estimateImageNext")) == null ? void 0 : _k.addEventListener("click", () => moveEstimateGallery(1));
    let estimateGalleryTouchX = null;
    (_l = qs("#estimateImageStage")) == null ? void 0 : _l.addEventListener(
      "touchstart",
      (event) => {
        var _a2, _b2, _c2;
        estimateGalleryTouchX = (_c2 = (_b2 = (_a2 = event.changedTouches) == null ? void 0 : _a2[0]) == null ? void 0 : _b2.clientX) != null ? _c2 : null;
      },
      { passive: true }
    );
    (_m = qs("#estimateImageStage")) == null ? void 0 : _m.addEventListener(
      "touchend",
      (event) => {
        var _a2, _b2, _c2;
        if (estimateGalleryTouchX === null) return;
        const delta = ((_c2 = (_b2 = (_a2 = event.changedTouches) == null ? void 0 : _a2[0]) == null ? void 0 : _b2.clientX) != null ? _c2 : estimateGalleryTouchX) - estimateGalleryTouchX;
        estimateGalleryTouchX = null;
        if (Math.abs(delta) < 45) return;
        moveEstimateGallery(delta < 0 ? 1 : -1);
      },
      { passive: true }
    );
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
    qsa("[data-material-list-mode]").forEach(
      (button) => button.addEventListener("click", async () => {
        state.materialListMode = button.dataset.materialListMode;
        await renderMaterials();
      })
    );
    qs("#exportCompletedMaterialsButton").addEventListener("click", () => {
      var _a2;
      const projectId = ((_a2 = qs('#estimateImportForm select[name="project_id"]')) == null ? void 0 : _a2.value) || "";
      const suffix = projectId ? "?project_id=".concat(encodeURIComponent(projectId)) : "";
      window.open("/api/material-requests/export".concat(suffix), "_blank", "noopener");
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
      if (projectId) window.open("/api/work-items/print?project_id=".concat(encodeURIComponent(projectId)), "_blank", "noopener");
    });
    qs("#workRows").addEventListener(
      "toggle",
      (event) => {
        var _a2, _b2;
        const stage = (_b2 = (_a2 = event.target).closest) == null ? void 0 : _b2.call(_a2, ".work-stage");
        if (!stage) return;
        const projectId = workProjectId();
        if (!projectId) return;
        setWorkStageOpen(projectId, stage.dataset.workStage || "", stage.open);
      },
      true
    );
    document.addEventListener("click", async (event) => {
      var _a2, _b2, _c2, _d2, _e2, _f2, _g2, _h2, _i2, _j2, _k2, _l2, _m2, _n2, _o;
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
      const taskCommentButton = event.target.closest("[data-task-comment-send]");
      if (taskCommentButton) {
        await handleTaskComment(taskCommentButton);
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
        await api("/api/users/".concat(userId, "/max-chat"), {
          method: "POST",
          body: JSON.stringify({
            max_chat_id: row.querySelector('input[name="max_chat_id"]').value.trim(),
            enabled: row.querySelector('input[name="max_enabled"]').checked
          })
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
      const feedbackStatusButton2 = event.target.closest("[data-feedback-status]");
      if (feedbackStatusButton2) {
        const nextStatus = feedbackStatusButton2.dataset.feedbackStatus;
        const originalText = feedbackStatusButton2.textContent;
        feedbackStatusButton2.disabled = true;
        feedbackStatusButton2.classList.add("is-pending");
        feedbackStatusButton2.textContent = "Отправляю...";
        try {
          await api("/api/feedback/".concat(feedbackStatusButton2.dataset.feedbackId, "/status"), {
            method: "POST",
            body: JSON.stringify({ status: nextStatus, comment: "" })
          });
          await renderFeedback();
          showToast(nextStatus === "in_work" ? "Замечание взято в работу" : "Замечание отмечено готовым");
        } catch (error) {
          feedbackStatusButton2.disabled = false;
          feedbackStatusButton2.classList.remove("is-pending");
          feedbackStatusButton2.textContent = originalText;
          showToast(error.message || "Не удалось обновить статус");
        }
        return;
      }
      const feedbackDeleteButton = event.target.closest("[data-feedback-delete]");
      if (feedbackDeleteButton) {
        const confirmed = confirm("Удалить это сообщение из обратной связи?");
        if (!confirmed) return;
        await api("/api/feedback/".concat(feedbackDeleteButton.dataset.feedbackDelete, "/delete"), {
          method: "POST",
          body: JSON.stringify({})
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
        (_a2 = removeExtraMaterial.closest(".extra-material-row")) == null ? void 0 : _a2.remove();
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
      const editEstimateJobButton = event.target.closest("[data-edit-estimate-job]");
      if (editEstimateJobButton) {
        openEstimateJobDialog(editEstimateJobButton.dataset.editEstimateJob);
        return;
      }
      const estimateGalleryButton = event.target.closest("[data-estimate-gallery-file]");
      if (estimateGalleryButton) {
        openEstimateGallery(estimateGalleryButton.dataset.estimateGalleryJob, estimateGalleryButton.dataset.estimateGalleryFile);
        return;
      }
      const printEstimateFileButton = event.target.closest("[data-print-estimate-file]");
      if (printEstimateFileButton) {
        const url = estimateFileDownloadUrl({ id: printEstimateFileButton.dataset.printEstimateFile });
        const printWindow = window.open(url, "_blank");
        if (!printWindow) {
          showToast("Откройте файл и распечатайте через браузер");
          return;
        }
        showToast("Файл открыт для печати");
        setTimeout(() => {
          try {
            printWindow.print();
          } catch (error) {
          }
        }, 900);
        return;
      }
      const openEstimateFilesButton = event.target.closest("[data-open-estimate-files]");
      if (openEstimateFilesButton) {
        openEstimateJobFileDialog(openEstimateFilesButton.dataset.openEstimateFiles);
        return;
      }
      const replaceEstimateFileButton = event.target.closest("[data-replace-estimate-file]");
      if (replaceEstimateFileButton) {
        openEstimateJobFileDialog(replaceEstimateFileButton.dataset.estimateJobId, replaceEstimateFileButton.dataset.replaceEstimateFile);
        return;
      }
      const deleteEstimateFileButton = event.target.closest("[data-delete-estimate-file]");
      if (deleteEstimateFileButton) {
        const confirmed = confirm("Удалить этот файл из сданной сметы?");
        if (!confirmed) return;
        await api("/api/estimate-job-files/".concat(deleteEstimateFileButton.dataset.deleteEstimateFile, "/delete"), {
          method: "POST",
          body: JSON.stringify({})
        });
        await loadCoreData();
        await renderEstimateJobs();
        await renderDashboard();
        showToast("Файл сметы удален");
        return;
      }
      const estimateJobStatusButton = event.target.closest("[data-estimate-job-status]");
      if (estimateJobStatusButton) {
        const id = estimateJobStatusButton.dataset.estimateJobId;
        const status = estimateJobStatusButton.dataset.estimateJobStatus;
        const body = { status };
        if (status === "estimate_done") {
          openEstimateJobDoneDialog(id);
          return;
        }
        if (status === "estimate_returned") {
          const comment = window.prompt("Что менеджеру нужно исправить или добавить в задании?");
          if (comment === null) return;
          if (!comment.trim()) {
            showToast("Укажите причину возврата задания менеджеру");
            return;
          }
          body.return_comment = comment.trim();
        }
        if (status === "estimate_question") {
          const comment = window.prompt("Что нужно уточнить у менеджера без возврата задания?");
          if (comment === null) return;
          if (!comment.trim()) {
            showToast("Напишите вопрос или уточнение");
            return;
          }
          body.question_comment = comment.trim();
        }
        await api("/api/estimate-jobs/".concat(id, "/status"), {
          method: "POST",
          body: JSON.stringify(body)
        });
        await loadCoreData();
        await renderEstimateJobs();
        await renderDashboard();
        const statusToast = {
          estimate_done: "Смета отмечена как сданная",
          estimate_returned: "Задание возвращено менеджеру",
          estimate_in_work: "Сметное задание взято в работу",
          estimate_question: "Уточнение отправлено менеджеру"
        };
        showToast(statusToast[status] || "Статус сметного задания изменен");
        return;
      }
      const deleteEstimateJobButton = event.target.closest("[data-delete-estimate-job]");
      if (deleteEstimateJobButton) {
        const confirmed = confirm("Удалить сметное задание? Это действие нельзя отменить.");
        if (!confirmed) return;
        await api("/api/estimate-jobs/".concat(deleteEstimateJobButton.dataset.deleteEstimateJob, "/delete"), {
          method: "POST",
          body: JSON.stringify({})
        });
        await loadCoreData();
        await renderEstimateJobs();
        await renderDashboard();
        showToast("Сметное задание удалено");
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
        window.open("/api/variations/".concat(variationExportButton.dataset.exportVariation, "/export"), "_blank", "noopener");
        return;
      }
      const knowledgeFolderOpenButton = event.target.closest("[data-knowledge-folder-open]");
      if (knowledgeFolderOpenButton) {
        setKnowledgeCurrentFolderId(knowledgeFolderOpenButton.dataset.knowledgeFolderOpen || "");
        await renderDocuments();
        return;
      }
      const folderActionButton = event.target.closest("[data-folder-action]");
      if (folderActionButton) {
        const action = folderActionButton.dataset.folderAction;
        const id = folderActionButton.dataset.folderId;
        if (action === "delete") {
          const confirmed = confirm("Удалить пустую папку базы знаний?");
          if (!confirmed) return;
          try {
            await api("/api/document-folders/".concat(id, "/delete"), {
              method: "POST",
              body: JSON.stringify({ actor_role: currentRoleBase() })
            });
            await renderDocuments();
            showToast("Папка удалена");
          } catch (error) {
            showToast(error.message || "Не удалось удалить папку");
          }
          return;
        }
      }
      const documentActionButton = event.target.closest("[data-document-action]");
      if (documentActionButton) {
        const action = documentActionButton.dataset.documentAction;
        const id = documentActionButton.dataset.documentId;
        if (action === "move") {
          const select = qs('[data-document-move-folder="'.concat(id, '"]'));
          try {
            await api("/api/documents/".concat(id, "/move"), {
              method: "POST",
              body: JSON.stringify({ folder_id: (select == null ? void 0 : select.value) || "", actor_role: currentRoleBase() })
            });
            await renderDocuments();
            showToast("Материал перемещён");
          } catch (error) {
            showToast(error.message || "Не удалось переместить материал");
          }
          return;
        }
        if (action === "delete") {
          const confirmed = confirm("Удалить материал из базы знаний? Файл также будет удалён из хранилища.");
          if (!confirmed) return;
          try {
            await api("/api/documents/".concat(id, "/delete"), {
              method: "POST",
              body: JSON.stringify({ actor_role: currentRoleBase() })
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
        const currentBatch = buildMaterialBatches(state.materialRequests || []).find((batch) => String(batch.id) === String(id));
        let body = {};
        if (action === "delete" && !confirm("Удалить заявку на материалы? Это можно сделать только до принятия снабжением в работу.")) return;
        if (action === "return") {
          body = { comment: ((_b2 = qs("#materialBatchReturnComment")) == null ? void 0 : _b2.value) || "" };
        }
        if (action === "resubmit") {
          body = { comment: ((_c2 = qs("#materialBatchResubmitComment")) == null ? void 0 : _c2.value) || "" };
        }
        if (action === "update") {
          body = {
            comment: ((_d2 = qs("#materialBatchUpdateComment")) == null ? void 0 : _d2.value) || "",
            needed_at: ((_e2 = qs("#materialBatchUpdateNeededAt")) == null ? void 0 : _e2.value) || "",
            items: collectMaterialBatchEdits(),
            extra_items: collectExtraMaterials("#batchExtraMaterialRows")
          };
        }
        if (action === "schedule") {
          body = {
            scheduled_delivery_date: ((_f2 = qs("#materialBatchDeliveryDate")) == null ? void 0 : _f2.value) || "",
            actual_items: currentBatch ? collectMaterialActualItems(currentBatch) : [],
            comment: ((_g2 = qs("#materialBatchScheduleComment")) == null ? void 0 : _g2.value) || ""
          };
        }
        if (action === "save_actuals") {
          body = {
            actual_items: currentBatch ? collectMaterialActualItems(currentBatch) : [],
            comment: ((_h2 = qs("#materialBatchScheduleComment")) == null ? void 0 : _h2.value) || ""
          };
        }
        if (action === "resolve_issue") {
          body = {
            scheduled_delivery_date: ((_i2 = qs("#materialBatchResolveDate")) == null ? void 0 : _i2.value) || "",
            comment: ((_j2 = qs("#materialBatchResolveComment")) == null ? void 0 : _j2.value) || ""
          };
        }
        if (action === "receive") {
          const file = (_l2 = (_k2 = qs("#materialBatchReceiptFile")) == null ? void 0 : _k2.files) == null ? void 0 : _l2[0];
          body = {
            receipt_status: materialBatchAction.dataset.receiptStatus || "received",
            comment: ((_m2 = qs("#materialBatchReceiptComment")) == null ? void 0 : _m2.value) || "",
            receipt_file: file ? {
              title: file.name,
              type: "other",
              file_name: file.name,
              mime_type: file.type,
              file_base64: await fileToBase64(file)
            } : null
          };
        }
        body.actor_role = currentRoleBase();
        body.actor_id = currentUserId();
        try {
          await api("/api/material-request-batches/".concat(id, "/").concat(action), {
            method: "POST",
            body: JSON.stringify(body)
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
            save_actuals: "Цены закупки сохранены",
            resolve_issue: "Прораб уведомлен о повторной доставке",
            receive: "Приемка по заявке отправлена",
            update: "Заявка исправлена и отправлена снабжению",
            delete: "Заявка удалена",
            create_variation: "Допработа создана и связана с заявкой"
          }[action] || "Заявка обновлена"
        );
        return;
      }
      const materialDeliverButton = event.target.closest("[data-material-deliver]");
      if (materialDeliverButton) {
        const id = materialDeliverButton.dataset.materialDeliver;
        await api("/api/material-requests/".concat(id, "/deliver"), {
          method: "POST",
          body: JSON.stringify({
            actual_delivery_date: ((_n2 = qs('[data-material-actual="'.concat(id, '"]'))) == null ? void 0 : _n2.value) || "",
            procurement_comment: ((_o = qs('[data-material-comment="'.concat(id, '"]'))) == null ? void 0 : _o.value) || ""
          })
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
        const projectId = Number(projectButton.dataset.openProject);
        const sameProjectAlreadyOpen = state.view === "projects" && Number(state.selectedProjectId) === projectId;
        state.selectedProjectTab = "overview";
        switchView("projects");
        if (sameProjectAlreadyOpen) {
          state.selectedProjectId = null;
          await renderProjects();
          clearProjectDetail();
          return;
        }
        state.selectedProjectId = projectId;
        await renderProjects();
        await renderProjectDetail(state.selectedProjectId);
      }
      const tabButton = event.target.closest("[data-project-tab]");
      if (tabButton) {
        state.selectedProjectTab = tabButton.dataset.projectTab;
        await renderProjectDetail(state.selectedProjectId);
      }
    });
    document.addEventListener("dragover", (event) => {
      var _a2, _b2;
      const dropZone = (_b2 = (_a2 = event.target).closest) == null ? void 0 : _b2.call(_a2, "[data-knowledge-drop-zone]");
      if (!dropZone || !canManageKnowledgeBase()) return;
      event.preventDefault();
      dropZone.classList.add("is-drag-over");
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    });
    document.addEventListener("dragleave", (event) => {
      var _a2, _b2;
      const dropZone = (_b2 = (_a2 = event.target).closest) == null ? void 0 : _b2.call(_a2, "[data-knowledge-drop-zone]");
      if (!dropZone) return;
      const nextTarget = event.relatedTarget;
      if (nextTarget && dropZone.contains(nextTarget)) return;
      dropZone.classList.remove("is-drag-over");
    });
    document.addEventListener("drop", async (event) => {
      var _a2, _b2;
      const dropZone = (_b2 = (_a2 = event.target).closest) == null ? void 0 : _b2.call(_a2, "[data-knowledge-drop-zone]");
      if (!dropZone || !canManageKnowledgeBase()) return;
      event.preventDefault();
      dropZone.classList.remove("is-drag-over");
      try {
        const files = await collectKnowledgeDroppedFiles(event.dataTransfer);
        if (!files.length) {
          showToast("Перетащите файлы или папку с файлами");
          return;
        }
        await uploadKnowledgeFiles(files, { folderId: dropZone.dataset.folderId || "" });
      } catch (error) {
        showToast(error.message || "Не удалось загрузить файлы");
        setKnowledgeUploading(false);
      }
    });
    document.addEventListener(
      "toggle",
      (event) => {
        var _a2, _b2;
        const details = (_b2 = (_a2 = event.target).closest) == null ? void 0 : _b2.call(_a2, "[data-collapsible-key]");
        if (!details) return;
        state.expandedLists[details.dataset.collapsibleKey] = details.open;
      },
      true
    );
    document.addEventListener("input", (event) => {
      var _a2, _b2, _c2, _d2;
      const projectInput = (_b2 = (_a2 = event.target).closest) == null ? void 0 : _b2.call(_a2, "#projectForm input, #projectForm textarea, #projectForm select");
      if (projectInput && projectInput.type !== "file") {
        if (projectInput.name === "customer_phone") {
          projectInput.value = formatRuPhone(projectInput.value);
        }
        saveProjectFormDraft(projectInput.form);
        setProjectFormStatus("Черновик полей сохранен в браузере.", "pending");
      }
      const maxChatInput = (_d2 = (_c2 = event.target).closest) == null ? void 0 : _d2.call(_c2, '[data-max-user-row] input[name="max_chat_id"]');
      if (maxChatInput) saveMaxBindingDraft(maxChatInput.closest("[data-max-user-row]"));
    });
    document.addEventListener("change", (event) => {
      var _a2, _b2, _c2, _d2;
      const projectInput = (_b2 = (_a2 = event.target).closest) == null ? void 0 : _b2.call(_a2, "#projectForm input, #projectForm textarea, #projectForm select");
      if (projectInput) saveProjectFormDraft(projectInput.form);
      const maxEnabledInput = (_d2 = (_c2 = event.target).closest) == null ? void 0 : _d2.call(_c2, '[data-max-user-row] input[name="max_enabled"]');
      if (maxEnabledInput) saveMaxBindingDraft(maxEnabledInput.closest("[data-max-user-row]"));
    });
    qs("#projectForm").addEventListener("submit", async (event) => {
      var _a2, _b2, _c2;
      event.preventDefault();
      const form = qs("#projectForm");
      const saveMode = ((_a2 = event.submitter) == null ? void 0 : _a2.dataset.saveMode) === "draft" ? "draft" : "complete";
      const missingFields = missingProjectRequiredFields(form, saveMode);
      if (missingFields.length) {
        setProjectFormStatus("Не заполнено: ".concat(missingFields.map(([, label2]) => label2).join(", "), "."), "error");
        missingFields[0] && ((_c2 = (_b2 = form.elements[missingFields[0][0]]) == null ? void 0 : _b2.focus) == null ? void 0 : _c2.call(_b2));
        return;
      }
      try {
        setProjectSaving(true, "Сохраняю карточку. Если приложены тяжелые файлы, загрузка может занять немного времени.");
        const payload = await projectFormToJson(form);
        setProjectFormStatus("Файлы подготовлены, отправляю данные на сервер...", "pending");
        payload.save_mode = saveMode;
        const isEdit = form.dataset.mode === "edit";
        const projectId = form.dataset.projectId;
        const uploadedInitialCount = payload.initial_documents.length;
        const hasWorkTaskUpload = payload.initial_documents.some((doc) => doc.type === "smetter_work_task");
        const savedProject = await api(isEdit ? "/api/projects/".concat(projectId, "/update") : "/api/projects", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        qs("#projectDialog").close();
        form.reset();
        if (!isEdit) clearProjectFormDraft();
        setProjectFormStatus("");
        setProjectFileStatus("");
        await loadAll();
        const savedProjectId = Number(isEdit ? projectId : savedProject.id);
        if (isEdit) {
          state.selectedProjectId = savedProjectId;
          await renderProjectDetail(state.selectedProjectId);
        }
        if (saveMode === "draft") {
          state.selectedProjectId = savedProjectId;
          switchView("projects");
          await renderProjects();
          await renderProjectDetail(savedProjectId);
          showToast(uploadedInitialCount ? "Черновик сохранен, файлов прикреплено: ".concat(uploadedInitialCount) : "Черновик сохранен");
          return;
        }
        if (hasWorkTaskUpload) {
          state.selectedProjectId = savedProjectId;
          state.selectedWorkProjectId = savedProjectId;
          switchView("works");
          const worksSelect = qs('#workProjectForm select[name="project_id"]');
          if (worksSelect) worksSelect.value = String(savedProjectId);
          await renderWorks();
          const count = Number(savedProject.imported_works_count || 0);
          showToast(count ? "Задание на работы загружено: ".concat(count, " строк") : "Файл сохранен, но работы не распознаны");
          return;
        }
        showToast(isEdit ? "Карточка объекта сохранена" : "Объект создан как черновик");
      } catch (error) {
        setProjectFormStatus(error.message || "Не удалось сохранить карточку объекта", "error");
        showToast(error.message || "Не удалось сохранить карточку объекта");
      } finally {
        setProjectSaving(false);
      }
    });
    qs("#taskForm").addEventListener("submit", (event) => {
      event.preventDefault();
      qs('#taskForm input[name="creator_role"]').value = currentRoleBase();
      qs('#taskForm input[name="creator_id"]').value = currentUserId() || "";
      submitForm("taskDialog", "taskForm", "/api/tasks", "Задача создана");
    });
    qs("#estimateJobForm").addEventListener("submit", async (event) => {
      var _a2;
      event.preventDefault();
      const form = qs("#estimateJobForm");
      const payload = formToJson(form);
      const id = payload.id;
      delete payload.id;
      payload.title = normalizeEstimateJobTitle(payload.customer_name, payload.title);
      const attachments = Array.from(((_a2 = form.elements.attachments) == null ? void 0 : _a2.files) || []);
      payload.attachments = await Promise.all(attachments.map((file) => fileDocumentPayload(file, file.name, "estimate_job_file", "estimate_job")));
      await api(id ? "/api/estimate-jobs/".concat(id, "/update") : "/api/estimate-jobs", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      qs("#estimateJobDialog").close();
      form.reset();
      await loadCoreData();
      await renderEstimateJobs();
      await renderDashboard();
      showToast(id ? "Сметное задание обновлено" : "Сметное задание создано");
    });
    qs("#estimateJobDoneForm").addEventListener("submit", async (event) => {
      var _a2;
      event.preventDefault();
      const form = qs("#estimateJobDoneForm");
      const id = form.elements.id.value;
      if (!id) {
        showToast("Не найдено сметное задание");
        return;
      }
      const attachments = Array.from(((_a2 = form.elements.attachments) == null ? void 0 : _a2.files) || []);
      const payload = {
        status: "estimate_done",
        result_comment: form.elements.result_comment.value || "",
        attachments: await Promise.all(attachments.map((file) => fileDocumentPayload(file, file.name, "estimate_job_file", "estimate_job")))
      };
      await api("/api/estimate-jobs/".concat(id, "/status"), {
        method: "POST",
        body: JSON.stringify(payload)
      });
      qs("#estimateJobDoneDialog").close();
      form.reset();
      await loadCoreData();
      await renderEstimateJobs();
      await renderDashboard();
      showToast("Смета сдана, файлы сохранены");
    });
    qs("#estimateJobFileForm").addEventListener("submit", async (event) => {
      var _a2, _b2;
      event.preventDefault();
      const form = qs("#estimateJobFileForm");
      const id = form.elements.id.value;
      const mode = form.elements.mode.value || "add";
      const attachments = Array.from(((_a2 = form.elements.attachments) == null ? void 0 : _a2.files) || []);
      const smetterUrl = ((_b2 = form.elements.smetter_url) == null ? void 0 : _b2.value.trim()) || "";
      if (!id) {
        showToast("Не найдено сметное задание");
        return;
      }
      if (!attachments.length && !smetterUrl) {
        showToast("Прикрепите файл сметы или укажите ссылку на Сметтер");
        return;
      }
      if (mode === "replace" && attachments.length && attachments.length !== 1) {
        showToast("Для замены выберите один новый файл");
        return;
      }
      const payload = {
        replacement_note: form.elements.replacement_note.value || "",
        smetter_url: smetterUrl,
        attachments: await Promise.all(attachments.map((file) => fileDocumentPayload(file, file.name, "estimate_job_file", "estimate_job")))
      };
      if (mode === "replace") {
        payload.replace_file_id = form.elements.replace_file_id.value;
      }
      await api("/api/estimate-jobs/".concat(id, "/files"), {
        method: "POST",
        body: JSON.stringify(payload)
      });
      qs("#estimateJobFileDialog").close();
      form.reset();
      await loadCoreData();
      await renderEstimateJobs();
      await renderDashboard();
      showToast(attachments.length ? mode === "replace" ? "Файл сметы заменен, старая версия сохранена" : "Файлы сметы добавлены" : "Ссылка на Сметтер сохранена");
    });
    qs("#materialForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = qs("#materialForm");
      const selectedRows = qsa("#materialEstimatePicker .estimate-choice-row").filter((row) => row.querySelector("[data-material-check]").checked);
      const items = selectedRows.map((row) => ({
        estimate_material_id: row.dataset.estimateId,
        quantity: row.querySelector("[data-material-quantity]").value,
        reason: row.querySelector("[data-material-reason] textarea").value
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
          extra_items
        })
      }).then(async () => {
        qs("#materialDialog").close();
        form.reset();
        await loadAll();
        showToast("Заявка на материалы отправлена снабжению");
      }).catch((error) => showToast(error.message));
    });
    qs("#variationForm").addEventListener("submit", async (event) => {
      var _a2;
      event.preventDefault();
      const form = qs("#variationForm");
      const payload = formToJson(form);
      payload.actor_id = currentUserId();
      payload.requester_id = currentUserId();
      payload.attachments = await Promise.all(
        Array.from(((_a2 = form.elements.variation_files) == null ? void 0 : _a2.files) || []).map(
          (file) => fileDocumentPayload(file, "Вложение к допработе: ".concat(file.name), "variation_attachment", "variation")
        )
      );
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
          file_name: (file == null ? void 0 : file.name) || "",
          mime_type: (file == null ? void 0 : file.type) || "",
          file_base64: file ? await fileToBase64(file) : "",
          replace: true,
          rows: state.estimatePreviewRows
        })
      });
      state.estimatePreviewRows = [];
      qs("#estimatePreviewRows").innerHTML = '<p class="muted">Файл загружен. Можно выбрать другой файл.</p>';
      await loadAll();
      switchView("materials");
      showToast("Материалы сметы загружены в объект");
    });
    (_n = qs("#knowledgeFolderForm")) == null ? void 0 : _n.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = qs("#knowledgeFolderForm");
      try {
        const payload = formToJson(form);
        await api("/api/document-folders", { method: "POST", body: JSON.stringify(payload) });
        qs("#knowledgeFolderDialog").close();
        form.reset();
        await renderDocuments();
        showToast("Папка добавлена в базу знаний");
      } catch (error) {
        showToast(error.message || "Не удалось создать папку");
      }
    });
    qs("#documentForm").addEventListener("submit", async (event) => {
      var _a2, _b2;
      event.preventDefault();
      const form = qs("#documentForm");
      try {
        const data = formToJson(form);
        const looseFiles = Array.from(((_a2 = form.elements.document_files) == null ? void 0 : _a2.files) || []);
        const folderFiles = Array.from(((_b2 = form.elements.document_folder) == null ? void 0 : _b2.files) || []);
        const files = [...looseFiles, ...folderFiles];
        if (!files.length) {
          showToast("Выберите файл или папку для загрузки");
          return;
        }
        await uploadKnowledgeFiles(files, { folderId: data.folder_id || "", title: data.title || "", type: data.type || "other" });
        qs("#documentDialog").close();
        form.reset();
        fillKnowledgeFolderSelects();
      } catch (error) {
        showToast(error.message || "Не удалось сохранить материал");
      } finally {
        setKnowledgeUploading(false);
      }
    });
    qs("#contractForm").addEventListener("submit", async (event) => {
      var _a2, _b2, _c2, _d2;
      event.preventDefault();
      const form = qs("#contractForm");
      try {
        const payload = formToJson(form);
        const file = form.elements.contract_document_file.files[0];
        if (file) {
          payload.document_file = await fileDocumentPayload(file, payload.title || file.name, "contract", "contract");
        }
        const materialsFile = (_b2 = (_a2 = form.elements.contract_materials_file) == null ? void 0 : _a2.files) == null ? void 0 : _b2[0];
        if (materialsFile) {
          payload.materials_file = await fileDocumentPayload(materialsFile, "Материалы по доп. соглашению из Сметтера", "smetter_materials", "contract");
        }
        const worksFile = (_d2 = (_c2 = form.elements.contract_works_file) == null ? void 0 : _c2.files) == null ? void 0 : _d2[0];
        if (worksFile) {
          payload.works_file = await fileDocumentPayload(worksFile, "Задание на работы по доп. соглашению из Сметтера", "smetter_work_task", "contract");
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
        showToast("Договор или доп. соглашение добавлено в карточку объекта");
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
    bindInstallEvents();
    switchView(state.view);
    await withAppLoading("Загружаем Контур", () => loadAll(), "boot");
    registerServiceWorker();
  }
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      var _a;
      if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            worker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
      (_a = registration.update) == null ? void 0 : _a.call(registration).catch(() => void 0);
    }).catch(() => void 0);
  }
  function bindInstallEvents() {
    var _a;
    (_a = qs("#installAppButton")) == null ? void 0 : _a.addEventListener("click", () => {
      installAndroidApp().catch((error) => showToast(error.message || "Не удалось начать установку"));
    });
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      state.installPromptEvent = event;
      state.installPromptReady = true;
      syncInstallButton();
    });
    window.addEventListener("appinstalled", () => {
      state.installPromptEvent = null;
      state.installPromptReady = false;
      syncInstallButton();
      showToast("Контур установлен на устройство.");
    });
    syncInstallButton();
  }
  boot().catch((error) => showToast(error.message));
  setInterval(() => {
    if (document.hidden) return;
    refreshLiveData().catch((error) => showToast(error.message));
  }, 1e4);
})();
