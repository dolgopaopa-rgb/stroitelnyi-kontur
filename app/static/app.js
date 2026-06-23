const initialRoute = new URLSearchParams(window.location.search);
const initialProjectId = Number(initialRoute.get("project") || 0) || null;
const routeViewMap = {
  "/today": "today",
  "/objects": "projects",
  "/tasks": "tasks",
  "/materials": "materials",
  "/photo-reports": "photos",
  "/object-issues": "object_remarks",
  "/documents": "documents",
  "/signals": "dashboard",
  "/feedback": "feedback",
  "/settings": "events",
};
const pathView = routeViewMap[window.location.pathname] || "";
const TASK_DESCRIPTION_COLLAPSED_IN_LIST = true;

const state = {
  view: initialRoute.get("view") || pathView || localStorage.getItem("currentView") || "today",
  currentRole: localStorage.getItem("currentRole") || "owner",
  session: null,
  canSwitchRole: true,
  users: [],
  projects: [],
  archivedProjects: [],
  materialRequests: [],
  blockers: [],
  photoReports: [],
  objectRemarks: [],
  estimateJobs: [],
  estimateMaterials: [],
  estimatePreviewRows: [],
  showEstimateMaterials: false,
  selectedProjectId: initialProjectId,
  selectedProjectTab: "overview",
  projectListMode: "active",
  materialListMode: "active",
  materialPipelineFilter: "all",
  materialQuickFilter: "all",
  taskFilter: "all",
  feedbackFilter: "all",
  remarkFilter: "all",
  selectedFeedbackIds: new Set(),
  feedbackRefreshing: false,
  feedbackLastUpdatedAt: "",
  maxChatDrafts: {},
  selectedTaskProjectId: initialProjectId,
  lastTasks: [],
  notificationsOpen: false,
  notificationGroupsOpen: {},
  expandedLists: {},
  selectedWorkProjectId: initialProjectId,
  selectedRemarkProjectId: initialProjectId,
  selectedPhotoProjectId: initialProjectId,
  openWorkStages: {},
  estimateGallery: { jobId: null, files: [], index: 0 },
  knowledgeFolders: [],
  knowledgeCurrentFolderId: localStorage.getItem("knowledgeCurrentFolderId") || "",
  knowledgeClassificationOnly: false,
  knowledgeUploading: false,
  knowledgeUploadMessage: "",
  installPromptEvent: null,
  installPromptReady: false,
  mobileQuickOpen: false,
  mobileSheetMode: "actions",
  loadingKeys: new Set(),
  mediaPreview: { items: [], index: 0, touchX: null },
  pullRefresh: { tracking: false, startY: 0, distance: 0, ready: false, refreshing: false },
  dataIntegrityReport: null,
  dataIntegrityFilter: "all",
  compactUiV1: true,
  densityMode: localStorage.getItem("uiDensityMode") || "",
  sidebarCollapsed: localStorage.getItem("sidebarCollapsed") === "1",
  projectDisplayMode: localStorage.getItem("projectDisplayMode") || "table",
};

const PROJECT_FORM_DRAFT_KEY = "projectFormDraft:v1";
const PROJECT_TEXT_DRAFT_FIELDS = [
  "title",
  "customer_name",
  "customer_phone",
  "customer_email",
  "address",
  "navigator_url",
  "manager_note",
  "smetter_ref",
  "planned_end_date",
  "main_estimate_amount",
];
const PROJECT_REQUIRED_FIELDS = [
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
  ["project_docs_file", "Проектная документация"],
];

let sortableDragSource = null;

const viewTitles = {
  today: "Сегодня",
  dashboard: "Сигналы",
  projects: "Объекты",
  estimates: "Сметы",
  tasks: "Задачи",
  works: "Работы",
  materials: "Материалы",
  variations: "Допработы и отклонения",
  object_remarks: "Замечания по объектам",
  photos: "Фотоотчёты",
  locations: "Локации",
  documents: "База знаний",
  feedback: "Обратная связь по программе",
  events: "Журнал событий",
};

const statusLabelMap = {
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
  waiting_check: "Ждёт проверки",
  in_progress_task: "В работе",
  review: "На проверке",
  uploaded: "Загружен",
  checked: "Проверен",
  invalid_empty: "Без файлов",
  duplicate: "Дубликат",
  superseded: "Заменён",
  completed_pending_acceptance: "Ждёт проверки",
  accepted: "Выполнение принято",
  cancelled: "Отменена",
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
  estimate_question: "Нужно уточнение",
  owner: "Ген.директор",
  construction_manager: "Рук. по строительству",
  finance_director: "Фин.директор",
  accountant: "Бухгалтер",
  sales_manager: "Менеджер",
  foreman: "Прораб",
  procurement_manager: "Снабжение",
  estimator: "Сметчик",
  technical_supervisor: "Технадзор",
  master: "Мастер",
  ai_auditor: "ИИ-аудитор",
  main_estimate: "По смете",
  main_estimate_overspend: "Сверх сметы",
  additional_work: "Допработа",
  additional_agreement: "Доп. соглашение",
  material_replacement: "Замена материала",
  over_budget_cost: "Сверх бюджета",
  internal_error_or_loss: "Расход компании",
  company_cost: "Расходы компании",
  rework: "Переделка",
  contract: "Договор",
  variation_estimate: "Смета допработ",
  act: "Акт",
  ks_2: "КС-2",
  ks_3: "КС-3",
  smetter_materials: "Материалы из Сметтера",
  smetter_work_task: "Задание на работы",
  project_documentation: "Проектная документация",
  detail_node: "Узел / решение",
  regulation: "Регламент",
  standard: "Стандарт",
  instruction: "Инструкция",
  other: "Документ",
  project: "Проект",
  estimate: "Смета",
  invoice: "Счёт",
  media: "Фото/видео",
  photo_video: "Фото/видео",
  variation_attachment: "Вложение к допработе",
  extra_work_attachment: "Вложение к допработе",
  service_file: "Служебный файл",
  service_screenshot: "Служебный скриншот",
  unclassified: "Не разобрано",
  photo_report: "Фотоотчёт",
  object_remark: "Замечание по объекту",
  object_remark_photo: "Фото замечания",
  task: "Задача",
  question: "Вопрос",
  issue: "Замечание",
  remark: "Замечание",
  photo: "Фотоотчёт",
  material: "Материал",
  decision: "Решение",
  check: "Проверка",
  need_approval: "Нужно согласовать",
  needs_approval: "Нужно согласовать",
  agreed: "Согласовано",
  delivered: "На объекте",
  in_transit: "В пути",
  on_site: "На объекте",
  problem: "Проблема",
  closed: "Закрыто",
  at_risk: "Под риском",
  requiring_review: "Требует проверки",
  open: "Открыт",
  waiting_external: "Ждём внешнего ответа",
  resolved: "Решён",
  no_material: "Нет материала",
  waiting_client_decision: "Ждём решение заказчика",
  waiting_owner_decision: "Ждём решение руководителя",
  waiting_project_documentation: "Ждём проект / чертёж",
  estimate_not_approved: "Не согласована смета",
  subcontractor_problem: "Проблема с подрядчиком",
  quality_problem: "Проблема качества",
  no_photo_report: "Нет фотоотчёта",
  material_under_risk: "Материал под риском",
  normal: "Обычный",
  low: "Низкий",
  medium: "Средняя",
  high: "Высокая",
  critical: "Критичная",
};

const statusLabels = statusLabelMap;

function statusLabel(value) {
  return statusLabelMap[value] || "Не задано";
}

function statusLevel(value, fallback = "") {
  const key = String(value || "");
  if (["overdue", "danger", "problem", "returned", "revision_requested", "rejected", "receipt_issue", "quality_problem", "no_material", "invalid_empty"].includes(key)) return "danger";
  if (["warning", "review", "completed_pending_acceptance", "waiting_check", "estimate_question", "estimate_returned", "submitted_to_construction", "decision_required", "need_approval", "needs_approval", "at_risk", "requiring_review", "estimate_hold", "new", "feedback_new", "open", "waiting_external", "waiting_client_decision", "waiting_owner_decision", "waiting_project_documentation", "estimate_not_approved", "subcontractor_problem", "no_photo_report", "approval", "check"].includes(key)) return "warning";
  if (["success", "accepted", "approved", "closed", "completed", "received", "on_site", "delivered", "agreed", "done", "feedback_done", "estimate_done", "resolved", "checked"].includes(key)) return "success";
  if (["blue", "in_progress", "in_progress_task", "ordered", "in_transit", "delivery_scheduled", "delivery_confirmed", "estimate_in_work", "in_review", "active", "in_work", "feedback_in_work", "material"].includes(key)) return "blue";
  if (["draft", "archived", "estimate_new", "not_required", "duplicate", "superseded"].includes(key)) return "";
  return fallback;
}

function qs(selector) {
  return document.querySelector(selector);
}

function qsa(selector) {
  return [...document.querySelectorAll(selector)];
}

async function api(path, options = {}) {
  const { loadingMessage = "Сохраняем данные", silentLoading = false, showLoading = false, ...fetchOptions } = options;
  const method = String(fetchOptions.method || "GET").toUpperCase();
  const shouldShowLoading = showLoading || (!silentLoading && method !== "GET");
  const loadingKey = `api-${method}-${path}-${Date.now()}-${Math.random()}`;
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
    response = await fetch(path, {
      ...fetchOptions,
      headers: { "Content-Type": "application/json", ...(fetchOptions.headers || {}) },
    });
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
      message = `Ошибка ${response.status}`;
    }
    if (response.status === 401) {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.href = `/login?next=${encodeURIComponent(next)}`;
      throw new Error("Требуется вход");
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

function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : "";
}

function isTodayDate(value) {
  return dateOnly(value) === todayIso();
}

function isDateOverdue(value) {
  const date = dateOnly(value);
  return Boolean(date && date < todayIso());
}

function isLast24Hours(value) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() <= 24 * 60 * 60 * 1000;
}

function byId(items = []) {
  return items.reduce((acc, item) => {
    acc[Number(item.id)] = item;
    return acc;
  }, {});
}

function levelByMoney(value) {
  return Number(value || 0) > 0 ? "danger" : "success";
}

function label(value) {
  return statusLabel(value);
}

function materialBasisLabel(value) {
  return statusLabelMap[value] || "Основание не указано";
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
    disputed: "Требуется разбор",
  }[value] || value || "Решение не принято";
}

function variationAmountLabel(row) {
  const amount = Number(row?.amount || 0);
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
  return ["owner", "construction_manager"].includes(currentRoleBase());
}

function canManageFeedback() {
  return ["owner", "construction_manager", "finance_director"].includes(currentRoleBase());
}

function canManageSystemSettings() {
  return ["owner", "construction_manager", "finance_director"].includes(currentRoleBase());
}

function canManageEstimateJobs() {
  return ["owner", "construction_manager", "sales_manager", "estimator"].includes(currentRoleBase());
}

function canDeleteEstimateJobs() {
  return ["owner", "construction_manager"].includes(currentRoleBase());
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
  return Boolean(userId && Number(job?.[field] || 0) === Number(userId));
}

function isPartnerEstimateJob(job) {
  return String(job?.estimator_email || "") === "estimate-partner@example.local";
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
  return ["owner", "construction_manager"].includes(role) || (role === "estimator" && isOwnEstimateJob(job, "estimator_id")) || managerControlsPartnerEstimateJob(job);
}

function canFinishEstimateJob(job) {
  const role = currentRoleBase();
  if (!["estimate_in_work", "estimate_question"].includes(job.status)) return false;
  return ["owner", "construction_manager"].includes(role) || (role === "estimator" && isOwnEstimateJob(job, "estimator_id")) || managerControlsPartnerEstimateJob(job);
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
  return ["owner", "construction_manager"].includes(role) || (role === "estimator" && isOwnEstimateJob(job, "estimator_id"));
}

function canQuestionEstimateJob(job) {
  const role = currentRoleBase();
  if (["estimate_done", "estimate_returned", "estimate_question"].includes(job.status)) return false;
  return ["owner", "construction_manager"].includes(role) || (role === "estimator" && isOwnEstimateJob(job, "estimator_id"));
}

const viewAccess = {
  owner: ["today", "dashboard", "projects", "estimates", "tasks", "works", "materials", "variations", "object_remarks", "photos", "locations", "documents", "feedback", "events"],
  construction_manager: ["today", "dashboard", "projects", "tasks", "works", "materials", "object_remarks", "photos", "documents", "feedback", "events"],
  ai_auditor: ["today", "dashboard", "projects", "estimates", "tasks", "works", "materials", "variations", "object_remarks", "photos", "locations", "documents", "feedback", "events"],
  finance_director: ["today", "dashboard", "projects", "tasks", "works", "materials", "variations", "object_remarks", "photos", "locations", "documents", "feedback", "events"],
  accountant: ["today", "dashboard", "projects", "materials", "variations", "locations", "documents", "events"],
  sales_manager: ["today", "dashboard", "projects", "estimates", "documents"],
  foreman: ["today", "dashboard", "projects", "tasks", "materials", "object_remarks", "photos"],
  master: ["today", "tasks", "object_remarks", "photos"],
  procurement_manager: ["today", "dashboard", "projects", "materials", "photos", "locations", "documents"],
  estimator: ["today", "estimates", "tasks", "materials", "variations", "photos", "documents"],
  technical_supervisor: ["today", "dashboard", "projects", "tasks", "works", "materials", "object_remarks", "photos", "locations", "documents"],
};

const navLabelsByRole = {
  owner: {
    dashboard: "Сигналы",
    projects: "Объекты",
    tasks: "Задачи",
    materials: "Материалы",
    object_remarks: "Замечания",
    photos: "Фотоотчёты",
  },
  construction_manager: {
    projects: "Мои объекты",
    dashboard: "Сигналы",
    tasks: "Задачи",
    materials: "Материалы",
    object_remarks: "Замечания",
    photos: "Фотоотчёты",
  },
  foreman: {
    projects: "Мои объекты",
    tasks: "Мои задачи",
    photos: "Фото",
    materials: "Материалы",
    object_remarks: "Замечания",
    dashboard: "Проблемы",
  },
  master: {
    tasks: "Мои задачи",
    photos: "Фото",
    object_remarks: "Проблема",
  },
  procurement_manager: {
    dashboard: "Проблемы",
    materials: "Заявки",
    photos: "Фотоотчёты",
    locations: "Поставщики",
  },
  estimator: {
    tasks: "Проверки",
    materials: "Материалы вне сметы",
    variations: "Допработы",
    photos: "Фотоотчёты",
  },
};

const defaultNavLabels = {
  today: "Сегодня",
  dashboard: "Сигналы",
  projects: "Объекты",
  estimates: "Сметы",
  tasks: "Задачи",
  works: "Работы",
  materials: "Материалы",
  variations: "Допработы",
  object_remarks: "Замечания",
  photos: "Фотоотчёты",
  locations: "Локации",
  documents: "База знаний",
  feedback: "Обратная связь по программе",
  events: "Журнал",
};

function navLabelForView(view) {
  const role = currentRoleBase();
  return navLabelsByRole[role]?.[view] || defaultNavLabels[view] || view;
}

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
    const labelNode = button.querySelector("span:last-child");
    if (labelNode) labelNode.textContent = navLabelForView(button.dataset.view);
  });
  qsa("[data-view-target]").forEach((button) => {
    button.hidden = !allowed.includes(button.dataset.viewTarget);
    if (button.closest(".mobile-bottom-nav")) {
      const spans = button.querySelectorAll("span");
      const labelNode = spans.length > 1 ? spans[spans.length - 1] : null;
      if (labelNode) labelNode.textContent = navLabelForView(button.dataset.viewTarget);
    }
  });
  qsa("[data-requires-view]").forEach((node) => {
    node.hidden = !allowed.includes(node.dataset.requiresView);
  });
  syncTopbarAccess();
  syncMobileQuickActions();
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
  applyUiShellPreferences();
  if (actions) {
    actions.classList.toggle("role-tools-hidden", !canUseRoleTools);
    actions.classList.toggle("manager-actions", currentRoleBase() === "sales_manager" && !canUseRoleTools);
  }
}

function isAndroidDevice() {
  return /Android/i.test(navigator.userAgent || "");
}

function isStandaloneApp() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
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
  if (choice?.outcome === "accepted") {
    showToast("Контур устанавливается на главный экран.");
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
  ai_auditor: new Set(["smetter_materials", "smetter_work_task", "project_documentation", "detail_node", "regulation", "standard", "instruction", "other"]),
  accountant: new Set(["main_estimate", "smetter_materials", "smetter_work_task", "contract", "variation_estimate", "act", "ks_2", "ks_3", "other"]),
  estimator: new Set(["main_estimate", "smetter_materials", "smetter_work_task", "project_documentation", "variation_estimate", "act", "ks_2", "ks_3", "photo_report", "object_remark_photo", "photo_video", "other"]),
  foreman: new Set(["project_documentation", "variation_attachment", "extra_work_attachment", "photo_report", "object_remark_photo", "detail_node", "regulation", "standard", "instruction"]),
  master: new Set(["project_documentation", "variation_attachment", "extra_work_attachment", "photo_report", "object_remark_photo", "detail_node", "regulation", "standard", "instruction"]),
  procurement_manager: new Set(["smetter_materials", "project_documentation", "variation_attachment", "extra_work_attachment", "photo_report", "object_remark_photo", "photo_video", "detail_node", "regulation", "standard", "instruction", "other"]),
  technical_supervisor: new Set(["smetter_materials", "smetter_work_task", "project_documentation", "variation_attachment", "extra_work_attachment", "photo_report", "object_remark_photo", "detail_node", "regulation", "standard", "instruction", "other"]),
};

const projectFileDocumentTypes = new Set(["project_documentation", "detail_node", "regulation", "standard", "instruction"]);

function isProjectFileDocument(doc) {
  return projectFileDocumentTypes.has(doc.type || "other");
}

function isProcessDocument(doc) {
  return !isProjectFileDocument(doc);
}

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
    owner: ["overview", "tasks", "materials", "photos", "remarks", "documents", "events", "finances"],
    construction_manager: ["overview", "tasks", "materials", "photos", "remarks", "documents", "events", "finances"],
    finance_director: ["overview", "tasks", "materials", "photos", "remarks", "documents", "events", "finances"],
    ai_auditor: ["overview", "tasks", "materials", "photos", "remarks", "documents", "events", "finances"],
    accountant: ["overview", "materials", "documents", "events", "finances"],
    sales_manager: ["overview", "documents"],
    foreman: ["overview", "tasks", "materials", "photos", "remarks", "documents"],
    master: ["overview", "tasks", "photos", "remarks", "documents"],
    procurement_manager: ["overview", "materials", "photos", "remarks", "documents", "events"],
    estimator: ["overview", "tasks", "materials", "photos", "remarks", "documents", "events"],
    technical_supervisor: ["overview", "tasks", "materials", "photos", "remarks", "documents", "events"],
  }[base];
  return (tabs || ["overview"]).filter((tab) => tab !== "finances" || canViewFinancials());
}

function roleLabel(role) {
  if (String(role || "").startsWith("foreman:")) {
    const user = state.users.find((item) => item.id === Number(String(role).split(":")[1]));
    return `Прораб ${user?.name || ""}`.trim();
  }
  return statusLabelMap[role] || "Роль не задана";
}

function currentRoleBase() {
  return String(state.currentRole || "").split(":")[0];
}

function currentUserId() {
  if (String(state.currentRole || "").includes(":")) return Number(String(state.currentRole).split(":")[1]);
  if (state.session?.user?.role === currentRoleBase()) return Number(state.session.user.id || 0) || null;
  return state.users.find((user) => user.role === currentRoleBase())?.id || null;
}

function defaultDensityMode() {
  return ["owner", "ai_auditor"].includes(currentRoleBase()) ? "compact" : "comfortable";
}

function effectiveDensityMode() {
  return state.densityMode || defaultDensityMode();
}

function syncDensitySelect() {
  const select = qs("#densitySelect");
  if (select) select.value = effectiveDensityMode();
}

function applyUiShellPreferences() {
  const density = effectiveDensityMode();
  document.body.dataset.featureFlag = "compact_ui_v1";
  document.body.classList.toggle("compact-ui-v1", Boolean(state.compactUiV1));
  document.body.classList.toggle("density-compact", density === "compact");
  document.body.classList.toggle("density-comfortable", density !== "compact");
  document.body.classList.toggle("sidebar-collapsed", Boolean(state.sidebarCollapsed));
  syncDensitySelect();
  const sidebarToggle = qs("#sidebarToggle");
  if (sidebarToggle) {
    sidebarToggle.setAttribute("aria-pressed", state.sidebarCollapsed ? "true" : "false");
    sidebarToggle.title = state.sidebarCollapsed ? "Развернуть меню" : "Свернуть меню";
  }
}

function setDensityMode(mode) {
  state.densityMode = mode === "comfortable" ? "comfortable" : "compact";
  localStorage.setItem("uiDensityMode", state.densityMode);
  applyUiShellPreferences();
}

function toggleSidebarCollapsed() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  localStorage.setItem("sidebarCollapsed", state.sidebarCollapsed ? "1" : "0");
  applyUiShellPreferences();
}

function fillTopbarProjectSelect() {
  const select = qs("#topbarProjectSelect");
  if (!select) return;
  const selected = state.selectedProjectId ? String(state.selectedProjectId) : "";
  const projects = roleScopedProjects(state.projects || []);
  select.innerHTML =
    `<option value="">Все объекты</option>` +
    projects
      .map((project) => `<option value="${project.id}">${escapeHtml(project.title || "Объект")}</option>`)
      .join("");
  select.value = projects.some((project) => String(project.id) === selected) ? selected : "";
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
    ["master", "Мастер"],
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
  const savedRole = localStorage.getItem("currentRole");
  const session = await api("/api/session");
  state.session = session;
  state.canSwitchRole = Boolean(session.can_switch_role);
  const ownRole = roleValueForUser(session.user, session.role);
  state.currentRole = state.canSwitchRole && savedRole ? savedRole : ownRole;
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

function linkifyText(value) {
  const text = String(value ?? "");
  const urlRegex = /https?:\/\/[^\s<]+/g;
  let result = "";
  let lastIndex = 0;
  let match;
  while ((match = urlRegex.exec(text))) {
    const url = match[0];
    result += escapeHtml(text.slice(lastIndex, match.index)).replace(/\n/g, "<br>");
    result += `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
    lastIndex = match.index + url.length;
  }
  result += escapeHtml(text.slice(lastIndex)).replace(/\n/g, "<br>");
  return result;
}

function firstUrlFromText(value) {
  const match = String(value ?? "").match(/https?:\/\/[^\s<>"']+/i);
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
  return groups.length ? `+7-${groups.join("-")}` : "+7";
}

function phoneHref(value) {
  const formatted = formatRuPhone(value);
  const digits = phoneDigits(formatted);
  return digits.length === 11 ? `tel:+${digits}` : "";
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

function yandexCoordinatePair(first, second, order = "lonlat") {
  const a = Number(String(first || "").replace(",", "."));
  const b = Number(String(second || "").replace(",", "."));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
  const lat = order === "latlon" ? a : b;
  const lon = order === "latlon" ? b : a;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return "";
  return `${lat},${lon}`;
}

function yandexPairFromText(value, order = "lonlat") {
  const match = String(value || "").match(/(-?\d+(?:[\.,]\d+)?),\s*(-?\d+(?:[\.,]\d+)?)/);
  return match ? yandexCoordinatePair(match[1], match[2], order) : "";
}

function yandexRouteTextDestination(value) {
  const text = decodeURIComponent(String(value || "").trim());
  if (!text) return "";
  const parts = text.split("~").map((part) => part.trim()).filter(Boolean);
  const destination = parts[parts.length - 1] || "";
  if (!destination) return "";
  return yandexPairFromText(destination, "latlon") || destination;
}

function yandexCoordinateDestination(mapsUrl) {
  const text = String(mapsUrl || "").trim();
  if (!text) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    const latTo = url.searchParams.get("lat_to") || url.searchParams.get("to_lat") || url.searchParams.get("lat");
    const lonTo = url.searchParams.get("lon_to") || url.searchParams.get("to_lon") || url.searchParams.get("lon");
    const toByParams = yandexCoordinatePair(latTo, lonTo, "latlon");
    if (toByParams) return toByParams;
    const routeDestination = yandexRouteTextDestination(url.searchParams.get("rtext"));
    if (routeDestination) return routeDestination;
    for (const key of ["pt", "ll", "whatshere[point]"]) {
      const destination = yandexPairFromText(url.searchParams.get(key), "lonlat");
      if (destination) return destination;
    }
  } catch {
    // Custom schemes and short share links may not parse as HTTPS URLs; try raw params below.
  }
  const latToMatch = text.match(/(?:lat_to|to_lat|lat)=(-?\d+(?:[\.,]\d+)?).*?(?:lon_to|to_lon|lon)=(-?\d+(?:[\.,]\d+)?)/i);
  const toByParams = latToMatch ? yandexCoordinatePair(latToMatch[1], latToMatch[2], "latlon") : "";
  if (toByParams) return toByParams;
  const lonToMatch = text.match(/(?:lon_to|to_lon|lon)=(-?\d+(?:[\.,]\d+)?).*?(?:lat_to|to_lat|lat)=(-?\d+(?:[\.,]\d+)?)/i);
  const toByReverseParams = lonToMatch ? yandexCoordinatePair(lonToMatch[2], lonToMatch[1], "latlon") : "";
  if (toByReverseParams) return toByReverseParams;
  const routeMatch = text.match(/rtext=([^&#]+)/i);
  const routeDestination = routeMatch ? yandexRouteTextDestination(routeMatch[1]) : "";
  if (routeDestination) return routeDestination;
  const rawMatch = text.match(/(?:pt|ll|whatshere(?:%5B|\[)point(?:%5D|\]))=(-?\d+(?:[\.,]\d+)?),\s*(-?\d+(?:[\.,]\d+)?)/i);
  return rawMatch ? yandexCoordinatePair(rawMatch[1], rawMatch[2], "lonlat") : "";
}

function yandexMapsUrl(address, mapsUrl = "") {
  const destination = yandexCoordinateDestination(mapsUrl) || String(address || "").trim();
  if (!destination) return "";
  return `https://yandex.ru/maps/?rtext=~${encodeURIComponent(destination)}&rtt=auto`;
}

function addressLink(address, className = "") {
  const text = String(address || "").trim();
  if (!text) return `<span class="muted">Адрес не указан</span>`;
  return `<a class="address-link ${className}" href="${escapeAttr(yandexMapsUrl(text))}" target="_blank" rel="noopener noreferrer">${text}</a>`;
}

function mapLink(address, mapsUrl, label = "Открыть в Яндекс.Картах") {
  const url = String(mapsUrl || "").trim();
  const addressText = String(address || "").trim();
  const href = yandexMapsUrl(addressText, url) || url;
  if (!href) return `<span class="muted">Локация не указана</span>`;
  return `<a class="link-button inline-link" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
}

function documentTypeKey(input) {
  const doc = typeof input === "object" && input ? input : { type: input };
  const rawType = String(doc.type || "").trim();
  const genericTypes = new Set(["", "document", "documents", "other"]);
  if (rawType && !genericTypes.has(rawType)) {
    if (rawType === "project_documentation") return "project";
    if (rawType === "smetter_materials" || rawType === "smetter_work_task" || rawType === "variation_estimate") return "estimate";
    if (rawType === "contract" || rawType === "additional_agreement") return "contract";
    if (rawType === "act" || rawType === "ks_2" || rawType === "ks_3") return "act";
    if (rawType === "invoice") return "invoice";
    if (rawType === "photo_report" || rawType === "object_remark_photo" || rawType === "media" || rawType === "photo_video") return "photo_video";
    if (rawType === "variation_attachment" || rawType === "extra_work_attachment") return "extra_work_attachment";
    if (rawType === "service_file" || rawType === "service_screenshot") return "service_screenshot";
    if (statusLabelMap[rawType]) return rawType;
  }
  const name = `${doc.title || ""} ${doc.file_name || ""}`.toLowerCase();
  const processType = String(doc.process_type || "").toLowerCase();
  const mime = String(doc.mime_type || "").toLowerCase();
  if (processType.startsWith("variation:")) return "extra_work_attachment";
  if (/(кнопка|экран|ошибка|скрин|skrin|oshibka|screen|screenshot|feedback|интерфейс)/.test(name) && (mime.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(name))) return "service_screenshot";
  if (mime.startsWith("image/") || mime.startsWith("video/") || /\.(mov|mp4|jpe?g|png|webp)$/i.test(name)) return "photo_video";
  if (/проект|пдф|узел|решени/.test(name)) return "project";
  if (/смет|задани[ея]\s+на\s+работ|smetter|work_assignment|purchase/.test(name)) return "estimate";
  if (/договор|допник|доп\.?\s*соглаш|contract/.test(name)) return "contract";
  if (/\bакт\b|кс-?2|кс-?3/.test(name)) return "act";
  if (/сч[её]т|invoice/.test(name)) return "invoice";
  if (/скрин|skrin|служеб|интерфейс|feedback|ошибка|oshibka|экран|screen|screenshot/.test(name)) return "service_screenshot";
  return genericTypes.has(rawType) ? "unclassified" : "other";
}

function documentType(input) {
  return statusLabelMap[documentTypeKey(input)] || "Не разобрано";
}

function documentTypeLevel(input) {
  return documentTypeKey(input) === "unclassified" ? "warning" : "blue";
}

function documentNeedsClassification(doc) {
  return documentTypeKey(doc) === "unclassified";
}

window.__konturDocumentTypeKey = documentTypeKey;

function isBrokenText(value) {
  const text = String(value || "").trim();
  return Boolean(text) && /^[?\s.,:;!()[\]-]+$/.test(text);
}

function isMostlyQuestionMarks(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  const questionCount = (text.match(/\?/g) || []).length;
  const readableCount = (text.match(/[0-9A-Za-zА-Яа-яЁё]/g) || []).length;
  return questionCount >= 8 && questionCount >= Math.max(8, readableCount * 2);
}

function feedbackDecisionComment(value) {
  const text = String(value || "").trim();
  if (!text || isBrokenText(text) || isMostlyQuestionMarks(text)) return "";
  return text;
}

function documentTitle(doc) {
  const title = String(doc.title || "").trim();
  if (title && !isBrokenText(title)) return title;
  return documentType(doc) || doc.file_name || "Документ";
}

function documentFileLink(doc) {
  const type = documentType(doc);
  const title = documentTitle(doc);
  const file = doc.file_name || "";
  if (!doc.file_path) {
    return `
      <div>
        <strong>${title}</strong>
        <div class="muted">${type} · файл не загружен</div>
      </div>`;
  }
  const processLabel = String(doc.process_type || "").startsWith("variation:") ? "" : doc.process_type;
  return `
    <a class="document-link" href="/api/documents/${doc.id}/download" target="_blank" rel="noopener noreferrer">
      <strong>${title}</strong>
      <span>${[type, doc.status === "archived" ? "архивная версия" : "", doc.related_section, processLabel, file].filter(Boolean).join(" · ")}</span>
    </a>`;
}

function contractTitleById(contracts = []) {
  return contracts.reduce((acc, contract) => {
    acc[Number(contract.id)] = `${contractType(contract.type)}: ${contract.title}`;
    return acc;
  }, {});
}

function renderDocumentRows(items) {
  return `<div class="document-list">${items.map((doc) => `<div class="document-row">${documentFileLink(doc)}</div>`).join("")}</div>`;
}

function renderDocumentDetails(title, items, { open = false, tone = "blue" } = {}) {
  if (!items.length) return "";
  return `
    <details class="document-contract-group" ${open ? "open" : ""}>
      <summary>${title} ${pill(`${items.length} шт.`, tone)}</summary>
      ${renderDocumentRows(items)}
    </details>`;
}

function renderGroupedProjectDocuments(docs, contracts = []) {
  const byContract = contractTitleById(contracts);
  const activeDocs = docs.filter((doc) => doc.status !== "archived");
  const archivedDocs = docs.filter((doc) => doc.status === "archived");
  const projectFiles = activeDocs.filter(isProjectFileDocument);
  const processDocs = activeDocs.filter(isProcessDocument);
  const archivedProjectFiles = archivedDocs.filter(isProjectFileDocument);
  const archivedProcessDocs = archivedDocs.filter(isProcessDocument);
  const processGroups = processDocs.reduce((acc, doc) => {
    const key = doc.contract_id ? byContract[Number(doc.contract_id)] || "Договор / доп. соглашение" : "Общие документы объекта";
    acc[key] = acc[key] || [];
    acc[key].push(doc);
    return acc;
  }, {});
  const projectFilesHtml = renderDocumentDetails("Файлы проекта", projectFiles, { open: true, tone: "success" });
  const processHtml = Object.entries(processGroups)
    .map(([title, items]) => renderDocumentDetails(title, items, { open: currentRoleBase() === "sales_manager", tone: "blue" }))
    .join("");
  const archiveHtml = archivedDocs.length
    ? `
      <details class="document-contract-group">
        <summary>Архив замененных файлов ${pill(`${archivedDocs.length} шт.`, "warning")}</summary>
        ${archivedProjectFiles.length ? renderDocumentDetails("Архив файлов проекта", archivedProjectFiles, { tone: "warning" }) : ""}
        ${archivedProcessDocs.length ? renderDocumentDetails("Архив документов по проекту", archivedProcessDocs, { tone: "warning" }) : ""}
      </details>`
    : "";
  if (currentRoleBase() === "foreman") {
    return (projectFilesHtml || archiveHtml)
      ? `${projectFilesHtml}${archivedProjectFiles.length ? archiveHtml : ""}`
      : `<p class="muted">Файлы проекта пока не загружены.</p>`;
  }
  return (projectFilesHtml || processHtml || archiveHtml)
    ? `${projectFilesHtml}${processHtml ? `<h4 class="document-section-title">Документы по проекту</h4>${processHtml}` : ""}${archiveHtml}`
    : `<p class="muted">Файлы и документы пока не загружены. Добавить договор, смету или проект можно через кнопку “Редактировать”.</p>`;
}

function renderDocumentSummary(docs, contracts = []) {
  const title = currentRoleBase() === "foreman" ? "Файлы проекта" : "Документы объекта";
  return `
    <section class="workflow-panel document-summary compact-collapsible">
      <details>
        <summary>
          <span>${title}</span>
          ${pill(`${docs.length} шт.`, docs.length ? "blue" : "")}
        </summary>
        ${renderGroupedProjectDocuments(docs, contracts)}
      </details>
    </section>`;
}

function renderProjectDocumentSpotlight(docs = []) {
  const projectDocs = docs.filter((doc) => doc.status !== "archived" && doc.type === "project_documentation");
  const canUseProjectDocs = ["foreman", "technical_supervisor", "procurement_manager", "estimator", "construction_manager", "owner"].includes(currentRoleBase());
  if (!canUseProjectDocs) return "";
  if (!projectDocs.length) {
    return `
      <section class="project-doc-spotlight empty">
        <div>
          <strong>Проектная документация</strong>
          <span>Файлы проекта пока не загружены в карточку объекта.</span>
        </div>
      </section>`;
  }
  return `
    <section class="project-doc-spotlight">
      <div class="project-doc-spotlight-head">
        <strong>Проектная документация</strong>
        ${pill(`${projectDocs.length} файл(ов)`, "blue")}
      </div>
      <div class="project-doc-spotlight-list">
        ${projectDocs
          .slice(0, 4)
          .map((doc) => `<div class="document-row">${documentFileLink(doc)}</div>`)
          .join("")}
      </div>
      ${projectDocs.length > 4 ? `<p class="muted">Остальные файлы доступны во вкладке “Документы”.</p>` : ""}
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
    <button class="row clickable dashboard-task-row" type="button" data-open-task="${task.id}">
      <div class="stack-line"><strong>${task.title}</strong>${pill(label(taskStatusKey(task)), taskStatusLevel(taskStatusKey(task)))}${pill(task.due_date || "без срока", levelByDate(task.due_date))}</div>
      <div class="muted">${task.project_title} · ответственный: ${task.assignee_name || "не назначен"} · принимает: ${task.reviewer_name || task.creator_name || "не назначен"}</div>
    </button>`;
}

function personalNotifyControl({ name = false } = {}) {
  const inputAttr = name ? 'name="notify_personal" value="1"' : "data-notify-personal";
  return `
    <label class="checkbox-line personal-notify">
      <input type="checkbox" ${inputAttr} />
      <span>Уведомить личным сообщением в MAX</span>
    </label>`;
}

function readPersonalNotify(root) {
  return Boolean(root?.querySelector("[data-notify-personal]")?.checked || root?.querySelector('[name="notify_personal"]')?.checked);
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

async function withAppLoading(message, task, key = `manual-${Date.now()}`) {
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
  status.className = `form-status ${level || ""}`.trim();
}

function setProjectFileStatus(message = "", level = "pending") {
  const status = qs("#projectFileStatus");
  if (!status) return;
  status.textContent = message;
  status.hidden = !message;
  status.className = `form-status file-status ${level || ""}`.trim();
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
    ["project_documentation", "Проектная документация"],
  ];
  const rows = requiredGroups
    .map(([type, title]) => {
      const groupDocs = docs.filter((doc) => doc.type === type);
      const files = groupDocs.length
        ? groupDocs
            .map((doc) => `<span>${escapeHtml(doc.file_name || documentTitle(doc))}</span>`)
            .join("")
        : `<span class="muted">не прикреплено</span>`;
      return `
        <div class="attached-draft-files-row ${groupDocs.length ? "is-present" : "is-missing"}">
          <strong>${escapeHtml(title)}</strong>
          <div>${files}</div>
        </div>`;
    })
    .join("");
  node.hidden = false;
  node.innerHTML = `
    <div class="attached-draft-files-head">
      <strong>Уже сохранено в карточке объекта</strong>
      <span>Поля выбора файлов выше остаются пустыми в браузере. Они нужны только для добавления новых файлов.</span>
    </div>
    ${rows}`;
}

function projectFileSummary(form) {
  const fields = [
    ["estimate_file_name", "материалы"],
    ["work_task_file", "задание на работы"],
    ["contract_file", "договор"],
    ["estimate_doc_file", "смета"],
    ["project_docs_file", "проектная документация"],
  ];
  const selected = [];
  fields.forEach(([name, labelText]) => {
    const input = form.elements[name];
    const files = Array.from(input?.files || []);
    if (!files.length) return;
    selected.push(files.length === 1 ? `${labelText}: ${files[0].name}` : `${labelText}: ${files.length} файлов`);
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
  setProjectFileStatus(`Выбраны файлы для отправки на сервер: ${selected.join("; ")}. Чтобы они попали в черновик, нажмите “Сохранить черновик”. После обновления страницы браузер сам не восстановит выбранные файлы.`, "pending");
}

function projectDraftSnapshot(form) {
  const values = {};
  PROJECT_TEXT_DRAFT_FIELDS.forEach((name) => {
    values[name] = form.elements[name]?.value || "";
  });
  const fileNames = {};
  PROJECT_REQUIRED_FIELDS.forEach(([name]) => {
    const input = form.elements[name];
    if (input?.type === "file" && input.files?.length) fileNames[name] = Array.from(input.files).map((file) => file.name);
  });
  return { values, fileNames, savedAt: new Date().toISOString() };
}

function hasProjectDraft(snapshot) {
  return Boolean(
    snapshot &&
      (Object.values(snapshot.values || {}).some((value) => String(value || "").trim()) ||
        Object.values(snapshot.fileNames || {}).some(Boolean))
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
    if (form.elements[name] && snapshot.values?.[name]) form.elements[name].value = snapshot.values[name];
  });
  const fileNames = Object.values(snapshot.fileNames || {}).flat().filter(Boolean);
  const note = fileNames.length
    ? `Черновик текстовых полей восстановлен. Файлы браузер не восстанавливает после обновления, выберите их снова: ${fileNames.join(", ")}.`
    : "Черновик текстовых полей восстановлен.";
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
    const input = form.elements[name];
    if (!input) return false;
    if (input.type === "file") {
      if (isEdit) return false;
      return !input.files?.length;
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
  qsa(".view").forEach((node) => {
    node.classList.remove("active");
    node.querySelector(":scope > .qa-page-marker")?.remove();
  });
  const activeView = qs(`#${view}View`);
  activeView.classList.add("active");
  const pageTestId = viewPageTestId(view);
  if (activeView.getAttribute("data-testid") !== pageTestId) {
    const marker = document.createElement("span");
    marker.className = "qa-page-marker";
    marker.hidden = true;
    marker.setAttribute("aria-hidden", "true");
    marker.setAttribute("data-testid", pageTestId);
    activeView.prepend(marker);
  }
  qs("#pageTitle").textContent = viewTitles[view];
  syncTopbarAccess();
  initSortableZones();
}

function viewPageTestId(view) {
  return (
    {
      today: "today-page",
      dashboard: "signals-page",
      projects: "objects-page",
      estimates: "estimates-page",
      tasks: "tasks-page",
      works: "works-page",
      materials: "materials-page",
      variations: "variations-page",
      object_remarks: "object-issues-page",
      photos: "photo-reports-page",
      locations: "locations-page",
      documents: "documents-page",
      feedback: "feedback-page",
      events: "events-page",
    }[view] || `${view}-page`
  );
}

function clearProjectDetail() {
  const detail = qs("#projectDetail");
  if (!detail) return;
  detail.innerHTML = `<p class="muted">&#1042;&#1099;&#1073;&#1077;&#1088;&#1080;&#1090;&#1077; &#1086;&#1073;&#1098;&#1077;&#1082;&#1090; &#1080;&#1079; &#1089;&#1087;&#1080;&#1089;&#1082;&#1072;.</p>`;
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
  const [users, projects, archivedProjects, estimateJobs] = await Promise.all([
    api("/api/users"),
    api("/api/projects"),
    api("/api/projects/archive"),
    canView("estimates") ? api("/api/estimate-jobs") : Promise.resolve([]),
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
  const [photoReports, objectRemarks, blockers] = await Promise.all([
    canView("photos") || canView("today") || canView("projects") ? api("/api/photo-reports") : Promise.resolve([]),
    canView("object_remarks") || canView("today") || canView("projects") ? api("/api/object-remarks") : Promise.resolve([]),
    canView("today") || canView("projects") || canView("tasks") || canView("materials") ? api("/api/blockers") : Promise.resolve([]),
  ]);
  state.photoReports = photoReports;
  state.objectRemarks = objectRemarks;
  state.blockers = blockers;
  await Promise.all([
    renderToday(),
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
    renderObjectRemarks(),
    renderPhotoReports(),
    renderDocuments(),
    renderFeedback(),
    renderEvents(),
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
  indicator.style.setProperty("--pull-offset", `${Math.max(-72, Math.round(clamped - 92))}px`);
  indicator.style.setProperty("--pull-angle", `${Math.max(32, Math.round((clamped / 92) * 360))}deg`);
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
      if (!isMobileTouchViewport() || hasOpenDialog() || state.pullRefresh.refreshing) return;
      if (event.touches.length !== 1 || !pageAtTop()) return;
      if (event.target.closest?.("input, textarea, select, button, a, .sidebar, dialog")) return;
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
  const projectOptions = state.projects.map((project) => `<option value="${project.id}">${project.title}</option>`).join("");
  const optionalProjectOptions = `<option value="">Без объекта</option>${projectOptions}`;
  const userOptions = state.users.map((user) => `<option value="${user.id}">${user.name}</option>`).join("");
  const taskUserOptions = taskParticipantOptions();
  qsa('select[name="project_id"]').forEach((select) => (select.innerHTML = projectOptions));
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
  qsa('select[name="owner_id"], select[name="responsible_id"], select[name="checked_by_id"]').forEach((select) => (select.innerHTML = userOptions));
  qsa('#taskForm select[name="assignee_id"], #taskForm select[name="reviewer_id"]').forEach((select) => (select.innerHTML = taskUserOptions));
  const photoDate = qs('#photoReportForm input[name="report_date"]');
  if (photoDate && !photoDate.value) photoDate.value = todayIso();
  updateEstimateMaterialSelect();
  fillRoleSwitcher();
  fillTopbarProjectSelect();
  fillMaterialProjectSelect();
  updateMaterialActorHint();
}

async function loadTaskContractOptions(projectId) {
  const select = qs('#taskForm select[name="contract_id"]');
  if (!select) return;
  select.innerHTML = `<option value="">Без привязки к договору</option>`;
  if (!projectId) return;
  try {
    const project = await api(`/api/projects/${projectId}`);
    const contracts = Array.isArray(project.contracts) ? project.contracts : [];
    select.innerHTML =
      `<option value="">${contracts.length ? "Выберите договор / доп. соглашение" : "Без привязки к договору"}</option>` +
      contracts
        .map((contract) => `<option value="${contract.id}">${contractType(contract.type)}: ${escapeHtml(contract.title || "документ")}</option>`)
        .join("");
    if (contracts.length) select.value = String(contracts[0].id);
  } catch (error) {
    select.innerHTML = `<option value="">Без привязки к договору</option>`;
  }
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

function estimateSectionKey(scope, projectId, section) {
  return `${scope}:${projectId || "none"}:${section || "no-section"}`;
}

function openAttrForKey(key) {
  return state.expandedLists[key] ? " open" : "";
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
    .map(([section, sectionRows]) => {
      const key = estimateSectionKey("estimate-materials", projectId, section);
      return `
      <details class="estimate-section" data-collapsible-key="${escapeAttr(key)}"${openAttrForKey(key)}>
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
      </details>`;
    })
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

function renderExtraMaterialRow(options = {}) {
  const changeType = options.changeType || "";
  return `
    <div class="row extra-material-row${changeType ? ` material-change-${changeType}` : ""}" data-change-type="${escapeAttr(changeType)}">
      <label>Материал <input data-extra-material-field="material" placeholder="Например: плиточный клей" /></label>
      <label>Наименование <input data-extra-material-field="name" placeholder="Марка, размер, артикул" /></label>
      <label>Ед. изм. <input data-extra-material-field="unit" placeholder="шт, м, кг, упак." /></label>
      <label>Количество <input data-extra-material-field="quantity" type="number" min="0" step="0.001" placeholder="0" /></label>
      <label>
        Причина
        <select data-extra-material-field="reason">
          <option value="additional_work">Доп</option>
          <option value="material_replacement">Замена</option>
          <option value="main_estimate_overspend">Превышение</option>
        </select>
      </label>
      ${changeType === "added" ? `<span class="pill success change-badge">Будет добавлено</span>` : ""}
      <button class="icon" type="button" data-remove-extra-material>×</button>
    </div>`;
}

function addExtraMaterialRow(containerSelector = "#extraMaterialRows", options = {}) {
  if (typeof containerSelector !== "string") containerSelector = "#extraMaterialRows";
  qs(containerSelector)?.insertAdjacentHTML("beforeend", renderExtraMaterialRow(options));
}

function resetExtraMaterials() {
  qs("#extraMaterialRows").innerHTML = "";
}

function collectExtraMaterials(containerSelector = "#extraMaterialRows") {
  return qsa(`${containerSelector} .extra-material-row`)
    .map((row) => ({
      material: row.querySelector('[data-extra-material-field="material"]').value.trim(),
      name: row.querySelector('[data-extra-material-field="name"]').value.trim(),
      unit: row.querySelector('[data-extra-material-field="unit"]').value.trim(),
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
    .map(([section, sectionRows]) => {
      const key = estimateSectionKey("material-picker", projectId, section);
      return `
      <details class="estimate-section" data-collapsible-key="${escapeAttr(key)}"${openAttrForKey(key)}>
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
      </details>`;
    })
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
        procurement_name: item.procurement_name || "",
        created_at: item.batch_created_at || item.created_at,
        needed_at: item.needed_at,
        delivery_urgency: item.batch_delivery_urgency || item.delivery_urgency,
        status: item.batch_status || item.procurement_status,
        stage: item.batch_stage || "",
        health: item.batch_health || "normal",
        health_comment: item.batch_health_comment || "",
        requiring_review: Number(item.batch_requiring_review || 0) === 1,
        procurement_responsible_id: item.batch_procurement_responsible_id || "",
        supplier_comment: item.batch_supplier_comment || "",
        planned_delivery_date: item.batch_planned_delivery_date || "",
        received_by: item.batch_received_by || "",
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
        total_amount: 0,
      });
    }
    const batch = map.get(key);
    batch.items.push(item);
    if (!isRemovedMaterialItem(item)) batch.total_amount += Number(item.total_amount || 0);
  });
  return [...map.values()].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

function materialBatchTitle(batch, received = false) {
  const title = batch.delivery_urgency === "urgent" ? "срочная заявка" : "заявка";
  const prefix = received ? `Получена ${title}` : title[0].toUpperCase() + title.slice(1);
  return `${prefix} на материалы от ${formatDateRu(batch.created_at) || "без даты"}`;
}

function materialBatchLevel(status) {
  return statusLevel(status);
}

function materialPipelineStatus(batchOrStatus) {
  const batch = typeof batchOrStatus === "object" ? batchOrStatus : { status: batchOrStatus };
  const health = String(batch.health || "");
  const stage = String(batch.stage || "");
  if (health === "problem") return "problem";
  if (stage) return stage === "draft" ? "needs_approval" : stage;
  const status = String(batch.status || "");
  if (status === "receipt_issue" || status === "returned" || status === "revision_requested" || batch.receipt_status === "problem") return "problem";
  if (status === "archived" || status === "closed") return "closed";
  if (status === "received" || batch.receipt_status === "ok") return "delivered";
  if (status === "delivery_confirmed" || status === "delivery_scheduled") return "in_transit";
  if (status === "ordered" || status === "delivery") return "ordered";
  if (status === "in_work" || status === "approved" || status === "agreed") return "approved";
  return "needs_approval";
}

function materialPipelineLevel(batchOrStatus) {
  return statusLevel(materialPipelineStatus(batchOrStatus));
}

function renderMaterialPipeline(batch) {
  const current = materialPipelineStatus(batch);
  const steps = ["needs_approval", "approved", "ordered", "in_transit", "delivered", "closed"];
  return `
    <div class="material-pipeline">
      ${steps
        .map((step) => `<span class="pipeline-step ${step === current ? "active" : ""} ${statusLevel(step)}">${statusLabel(step)}</span>`)
        .join("")}
    </div>`;
}

function materialStageLabel(batch) {
  const stage = String(batch?.stage || materialPipelineStatus(batch) || "");
  return stage === "draft" ? "Черновик" : statusLabel(stage);
}

function materialHealthLabel(batch) {
  if (batch?.requiring_review) return "Требует проверки";
  return statusLabel(String(batch?.health || "normal"));
}

function materialHealthLevel(batch) {
  if (batch?.requiring_review) return "warning";
  return statusLevel(String(batch?.health || "normal"));
}

function materialIsRisky(batch) {
  const status = materialPipelineStatus(batch);
  const actualOverrun = Number(batch.actual_purchase_amount || 0) > 0 && Number(batch.actual_purchase_amount || 0) > Number(batch.total_amount || 0);
  return status === "problem" || batch.requiring_review || ["at_risk"].includes(batch.health) || ["returned", "revision_requested"].includes(batch.status) || (batch.delivery_urgency === "urgent" && !["delivered", "closed"].includes(status)) || actualOverrun;
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
  return materialActiveItems(batch).some((item) => item.basis_type && item.basis_type !== "main_estimate");
}

function materialBatchHasNoPrice(batch) {
  return materialActiveItems(batch).some(materialRowHasNoPrice);
}

function materialBatchActualOverrun(batch) {
  return materialActiveItems(batch).some(materialRowActualOverrun) || (Number(batch.actual_purchase_amount || 0) > 0 && Number(batch.actual_purchase_amount || 0) > Number(batch.total_amount || 0));
}

function materialBatchIsMine(batch) {
  const role = currentRoleBase();
  const userId = Number(currentUserId() || 0);
  if (["owner", "construction_manager", "finance_director"].includes(role)) return true;
  if (role === "foreman") return Number(batch.project_foreman_id || 0) === userId || Number(batch.creator_id || 0) === userId;
  if (role === "procurement_manager") return true;
  if (role === "estimator") return materialBatchHasDeviation(batch) || materialBatchHasNoPrice(batch) || materialBatchActualOverrun(batch);
  return false;
}

function materialBatchHasNoResponsible(batch) {
  return !batch.procurement_name && !["closed", "delivered"].includes(materialPipelineStatus(batch));
}

function materialBatchMatchesQuickFilter(batch, filter = state.materialQuickFilter) {
  if (!filter || filter === "all") return true;
  if (filter === "mine") return materialBatchIsMine(batch);
  if (filter === "by_object") return state.selectedProjectId ? Number(batch.project_id || 0) === Number(state.selectedProjectId) : true;
  if (filter === "urgent") return batch.delivery_urgency === "urgent";
  if (filter === "no_responsible") return materialBatchHasNoResponsible(batch);
  if (filter === "no_due") return !batch.needed_at;
  if (filter === "blocker") return materialIsRisky(batch) || (state.blockers || []).some((blocker) => Number(blocker.linked_material_request_id || 0) === Number(batch.id || 0) && !["resolved", "closed"].includes(blocker.status));
  if (filter === "extra") return materialActiveItems(batch).some((item) => ["additional_work", "additional_agreement"].includes(item.basis_type));
  if (filter === "out_of_estimate") return materialBatchHasDeviation(batch) || materialBatchHasNoPrice(batch) || materialBatchActualOverrun(batch);
  return true;
}

function isRemovedMaterialItem(item) {
  return item?.change_type === "removed" || item?.procurement_status === "removed";
}

function materialActiveItems(batch) {
  return (batch.items || []).filter((item) => !isRemovedMaterialItem(item));
}

function materialRemovedItems(batch) {
  return (batch.items || []).filter(isRemovedMaterialItem);
}

function materialChangeLabel(changeType) {
  return {
    added: "Добавлено при исправлении",
    changed: "Изменено при исправлении",
    removed: "Удалено при исправлении",
  }[changeType || ""] || "";
}

function materialChangeLevel(changeType) {
  return {
    added: "success",
    changed: "warning",
    removed: "danger",
  }[changeType || ""] || "blue";
}

function materialItemChangeClass(item) {
  const changeType = isRemovedMaterialItem(item) ? "removed" : item?.change_type || "";
  return changeType ? ` material-change-${changeType}` : "";
}

function materialChangePill(item) {
  const changeType = isRemovedMaterialItem(item) ? "removed" : item?.change_type || "";
  const text = materialChangeLabel(changeType);
  return text ? pill(text, materialChangeLevel(changeType)) : "";
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
  const counts = materialActiveItems(batch).reduce((acc, item) => {
    const key = item.basis_type || "main_estimate";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([type, count]) => `${materialBasisLabel(type)}: ${count}`)
    .join(" · ");
}

function materialBatchDestination(batch) {
  if (!materialBatchHasDeviation(batch)) return "Куда внесено: основная смета";
  if (batch.variation_id) {
    return `Куда внесено: Допработы и отклонения — ${batch.variation_title || `#${batch.variation_id}`} (${label(batch.variation_status)})`;
  }
  return "Куда внести: требуется создать связанную допработу/отклонение";
}

function collectMaterialActualItems(batch) {
  return materialActiveItems(batch).map((item) => ({
    id: item.id,
    actual_unit_price: qs(`[data-material-actual-unit="${item.id}"]`)?.value || "",
    actual_total_amount: qs(`[data-material-actual-total="${item.id}"]`)?.value || "",
  }));
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
    return `<div class="material-receipt-note active">Доставка назначена${batch.scheduled_delivery_date ? ` на ${formatDateRu(batch.scheduled_delivery_date)}` : ""}. Откройте заявку и подтвердите получение или проблему.</div>`;
  }
  if (["new", "revision_requested"].includes(batch.status)) {
    return `<div class="muted">Приемка появится после того, как снабжение примет заявку и назначит доставку.</div>`;
  }
  if (batch.status === "in_work") {
    return `<div class="muted">Заявка в работе у снабжения. Подтверждение получения появится после назначения даты доставки.</div>`;
  }
  if (batch.status === "receipt_issue") {
    return `<div class="material-receipt-note danger">Проблема при приемке отправлена снабжению. Ожидается исправление или повторная доставка.</div>`;
  }
  if (batch.status === "received") {
    return `<div class="material-receipt-note success">Получение по заявке подтверждено.</div>`;
  }
  return "";
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
            <div class="row material-batch-edit-row${materialItemChangeClass(item)}" data-edit-item-id="${item.id}">
              <div class="material-main">
                <div class="stack-line">
                  <strong>${item.title}</strong>
                  ${materialChangePill(item)}
                  <span class="pill danger remove-change-badge">Будет удалено</span>
                </div>
                <div class="muted">${item.estimate_section || "без раздела"}</div>
                ${!item.estimate_material_id ? `<label>Наименование <input data-edit-item-title value="${escapeAttr(item.title)}" /></label>` : ""}
              </div>
              ${!item.estimate_material_id ? `<label>Ед. изм. <input data-edit-item-unit value="${escapeAttr(item.requested_unit || item.estimate_material_unit || "")}" placeholder="шт, м, кг, упак." /></label>` : ""}
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
              <label class="check-line"><input data-edit-item-remove type="checkbox" ${isRemovedMaterialItem(item) ? "checked" : ""} /> Удалить позицию</label>
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
      ${personalNotifyControl()}
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
    unit: row.querySelector("[data-edit-item-unit]")?.value.trim(),
    quantity: row.querySelector("[data-edit-item-quantity]")?.value,
    basis_type: row.querySelector("[data-edit-item-basis]")?.value,
    comment: row.querySelector("[data-edit-item-comment]")?.value.trim(),
    remove: row.querySelector("[data-edit-item-remove]")?.checked || false,
  }));
}

function taskStats(tasks) {
  return {
    active: tasks.filter((task) => ["new", "in_progress"].includes(taskStatusKey(task))).length,
    returned: tasks.filter((task) => taskStatusKey(task) === "returned").length,
    waiting: tasks.filter((task) => taskStatusKey(task) === "waiting_check").length,
    accepted: tasks.filter((task) => taskStatusKey(task) === "accepted").length,
    reviewOverdue: tasks.filter(taskReviewCountsAsOverdue).length,
    overdue: tasks.filter(taskCountsAsOverdue).length,
    noDue: tasks.filter((task) => isOpenTask(task) && !task.due_date).length,
  };
}

const TASK_STATUS_ALIASES = {
  completed_pending_acceptance: "waiting_check",
  in_progress_task: "in_progress",
  review: "in_progress",
};

function taskStatusKey(taskOrStatus) {
  const raw = typeof taskOrStatus === "object" ? taskOrStatus?.status_key || taskOrStatus?.status : taskOrStatus;
  const key = String(raw || "new").trim();
  return TASK_STATUS_ALIASES[key] || key || "new";
}

function taskIsWaitingCheck(task) {
  return taskStatusKey(task) === "waiting_check";
}

function taskExecutionOverdueStatuses() {
  return new Set(["new", "in_progress", "returned"]);
}

function taskCountsAsOverdue(task) {
  return taskExecutionOverdueStatuses().has(taskStatusKey(task)) && isDateOverdue(task.due_date);
}

function taskReviewCountsAsOverdue(task) {
  return taskIsWaitingCheck(task) && isDateOverdue(task.review_due_at);
}

window.__konturTaskStatusKey = taskStatusKey;
window.__konturTaskCountsAsOverdue = taskCountsAsOverdue;
window.__konturTaskReviewCountsAsOverdue = taskReviewCountsAsOverdue;

function taskMatchesFilter(task, filter) {
  const status = taskStatusKey(task);
  if (filter === "active") return ["new", "in_progress"].includes(status);
  if (filter === "returned") return status === "returned";
  if (filter === "waiting") return status === "waiting_check";
  if (filter === "accepted") return status === "accepted";
  if (filter === "overdue") return taskCountsAsOverdue(task);
  if (filter === "review_overdue") return taskReviewCountsAsOverdue(task);
  if (filter === "no_due") return isOpenTask(task) && !task.due_date;
  return true;
}

function isOpenTask(task) {
  return !["accepted", "cancelled", "closed"].includes(taskStatusKey(task));
}

function visibleTasksForRole(tasks) {
  return roleScopedTasks(tasks);
}

function isLeadershipRole(role = currentRoleBase()) {
  return ["owner", "construction_manager", "finance_director", "ai_auditor"].includes(role);
}

function roleScopedProjects(projects = state.projects) {
  const role = currentRoleBase();
  const userId = Number(currentUserId() || 0);
  const activeProjects = (projects || []).filter((project) => project.status !== "archived");
  if (isLeadershipRole(role)) return activeProjects;
  if (role === "sales_manager") return activeProjects.filter((project) => !userId || Number(project.sales_manager_id || 0) === userId || Number(project.manager_id || 0) === userId);
  if (role === "foreman") return activeProjects.filter((project) => Number(project.foreman_id || 0) === userId);
  if (role === "technical_supervisor") return activeProjects.filter((project) => !userId || Number(project.tech_supervisor_id || 0) === userId);
  if (role === "estimator") return activeProjects.filter((project) => !userId || Number(project.estimator_id || 0) === userId);
  if (role === "master") {
    const projectIds = new Set((state.lastTasks || []).filter((task) => task.assignee_role === "master" || task.reviewer_role === "master").map((task) => Number(task.project_id || 0)));
    return activeProjects.filter((project) => projectIds.has(Number(project.id)));
  }
  if (role === "procurement_manager") return activeProjects;
  return activeProjects;
}

function roleProjectIdSet(projects = roleScopedProjects(state.projects)) {
  return new Set((projects || []).map((project) => Number(project.id || 0)).filter(Boolean));
}

function taskText(task) {
  return `${task?.title || ""} ${task?.description || ""} ${task?.task_type || ""}`.toLowerCase();
}

function roleScopedTasks(tasks = []) {
  const role = currentRoleBase();
  const userId = Number(currentUserId() || 0);
  const rows = Array.isArray(tasks) ? tasks : [];
  if (isLeadershipRole(role)) return rows;
  if (role === "foreman") {
    return rows.filter((task) => Number(task.project_foreman_id || 0) === userId || Number(task.assignee_id || 0) === userId || Number(task.reviewer_id || 0) === userId);
  }
  if (role === "master") {
    return rows.filter((task) => task.assignee_role === "master" || task.reviewer_role === "master" || (!userId && inferTaskType(task) === "task"));
  }
  if (role === "procurement_manager") {
    return rows.filter((task) => ["material", "approval", "decision"].includes(inferTaskType(task)) || task.assignee_role === "procurement_manager" || task.reviewer_role === "procurement_manager" || /материал|заявк|поставк|купить|заказать/.test(taskText(task)));
  }
  if (role === "estimator") {
    return rows.filter((task) => task.assignee_role === "estimator" || task.reviewer_role === "estimator" || ["check", "approval", "material"].includes(inferTaskType(task)) || /смет|цен|расцен|допработ|сверх/.test(taskText(task)));
  }
  if (role === "technical_supervisor") {
    return rows.filter((task) => !userId || Number(task.assignee_id || 0) === userId || Number(task.reviewer_id || 0) === userId || ["check", "issue", "photo_report"].includes(inferTaskType(task)));
  }
  if (role === "sales_manager") {
    return rows.filter((task) => !userId || Number(task.creator_id || 0) === userId || Number(task.assignee_id || 0) === userId || Number(task.reviewer_id || 0) === userId);
  }
  return rows;
}

function materialRowHasDeviation(item) {
  return Boolean(item?.basis_type && item.basis_type !== "main_estimate");
}

function materialRowHasNoPrice(item) {
  return Number(item?.total_amount || 0) <= 0 && Number(item?.actual_total_amount || 0) <= 0 && Number(item?.unit_price || 0) <= 0;
}

function materialRowActualOverrun(item) {
  return Number(item?.actual_total_amount || 0) > 0 && Number(item?.actual_total_amount || 0) > Number(item?.total_amount || 0);
}

function roleScopedMaterialRows(rows = []) {
  const role = currentRoleBase();
  const userId = Number(currentUserId() || 0);
  const projectIds = roleProjectIdSet();
  const items = Array.isArray(rows) ? rows : [];
  if (isLeadershipRole(role)) return items;
  if (role === "foreman") {
    return items.filter((item) => Number(item.project_foreman_id || 0) === userId || Number(item.creator_id || 0) === userId);
  }
  if (role === "master") return [];
  if (role === "procurement_manager") return items;
  if (role === "estimator") return items.filter((item) => materialRowHasDeviation(item) || materialRowHasNoPrice(item) || materialRowActualOverrun(item));
  return items.filter((item) => projectIds.has(Number(item.project_id || 0)));
}

function roleScopedBlockers(blockers = []) {
  const role = currentRoleBase();
  const userId = Number(currentUserId() || 0);
  const projectIds = roleProjectIdSet();
  const rows = Array.isArray(blockers) ? blockers : [];
  if (isLeadershipRole(role)) return rows;
  if (role === "foreman") {
    return rows.filter((blocker) => Number(blocker.project_foreman_id || 0) === userId || Number(blocker.responsible_user_id || 0) === userId || projectIds.has(Number(blocker.project_id || 0)));
  }
  if (role === "master") {
    return rows.filter((blocker) => Number(blocker.responsible_user_id || 0) === userId || projectIds.has(Number(blocker.project_id || 0)));
  }
  if (role === "procurement_manager") return rows.filter((blocker) => ["no_material", "material_under_risk", "other"].includes(blocker.blocker_type) || projectIds.has(Number(blocker.project_id || 0)));
  if (role === "estimator") return rows.filter((blocker) => ["estimate_not_approved", "material_under_risk", "other"].includes(blocker.blocker_type) || projectIds.has(Number(blocker.project_id || 0)));
  return rows.filter((blocker) => projectIds.has(Number(blocker.project_id || 0)));
}

function roleTodayProfile() {
  const role = currentRoleBase();
  const profiles = {
    owner: {
      testId: "today-role-owner",
      label: "Руководитель компании",
      question: "Где горит и где нужно моё решение?",
      hint: "Показываем просрочки, блокеры, материалы под риском и объекты с проблемами по всей компании.",
      tasksTitle: "Задачи и решения на сегодня",
      attentionTitle: "Требует моего решения",
      materialsTitle: "Материалы под риском",
      visibleSections: ["tasks", "attention", "materials", "comments", "objects", "noPhoto"],
      taskMode: "leadership",
      materialMode: "risk",
      objectMode: "risk-first",
      actions: [
        ["dashboard", "Посмотреть сигналы"],
        ["projects", "Проблемные объекты"],
        ["tasks", "Открыть задачи"],
      ],
    },
    construction_manager: {
      testId: "today-role-project-manager",
      label: "Руководитель строительства",
      question: "Что происходит на моих объектах?",
      hint: "Фокус на объектах, задачах, фотоотчётах, замечаниях и материалах, которые тормозят стройку.",
      tasksTitle: "Задачи по объектам",
      attentionTitle: "Вопросы, требующие решения",
      materialsTitle: "Материалы, влияющие на объекты",
      visibleSections: ["tasks", "attention", "materials", "comments", "objects", "noPhoto"],
      taskMode: "project-manager",
      materialMode: "risk",
      objectMode: "risk-first",
      actions: [
        ["projects", "Открыть объекты"],
        ["tasks", "Создать задачу"],
        ["photos", "Фотоотчёты"],
      ],
    },
    foreman: {
      testId: "today-role-foreman",
      label: "Прораб",
      question: "Что мне сегодня сделать на объекте?",
      hint: "Только закреплённые объекты, ваши задачи, заявки, фотоотчёты и замечания к закрытию.",
      tasksTitle: "Мои задачи на сегодня",
      attentionTitle: "Что мешает закрыть работы",
      materialsTitle: "Материалы: получить или запросить",
      visibleSections: ["tasks", "attention", "materials", "objects", "noPhoto"],
      taskMode: "my-work",
      materialMode: "foreman",
      objectMode: "assigned",
      actions: [
        ["photos", "Добавить фотоотчёт"],
        ["materials", "Запросить материал"],
        ["tasks", "Мои задачи"],
      ],
    },
    master: {
      testId: "today-role-worker",
      label: "Мастер",
      question: "Что сделать, где сделать, как подтвердить?",
      hint: "Упрощённый режим: задача, срок, место, кнопка готово, фото и сообщение о проблеме.",
      tasksTitle: "Что сделать сегодня",
      attentionTitle: "Что мешает выполнить",
      materialsTitle: "Материалы по моим задачам",
      visibleSections: ["tasks", "attention"],
      taskMode: "worker",
      materialMode: "none",
      objectMode: "none",
      actions: [
        ["tasks", "Открыть задачи"],
        ["photos", "Добавить фото"],
      ],
    },
    procurement_manager: {
      testId: "today-role-procurement",
      label: "Снабжение",
      question: "Что купить, куда, когда и что тормозит объект?",
      hint: "Новые заявки, срочные поставки, проблемы при приёмке и материалы, которые держат объект.",
      tasksTitle: "Задачи по снабжению",
      attentionTitle: "Что тормозит поставки",
      materialsTitle: "Заявки с ближайшим сроком",
      visibleSections: ["attention", "materials", "comments"],
      taskMode: "procurement",
      materialMode: "procurement",
      objectMode: "none",
      actions: [
        ["materials", "Открыть заявки"],
        ["locations", "Поставщики"],
      ],
    },
    estimator: {
      testId: "today-role-estimator",
      label: "Сметчик",
      question: "Что требует проверки по смете и допработам?",
      hint: "Вне сметы, нет цены, цена отличается от сметы, новые комментарии и документы на проверку.",
      tasksTitle: "Проверки по смете",
      attentionTitle: "Что нужно уточнить",
      materialsTitle: "Материалы вне сметы / без цены",
      visibleSections: ["tasks", "attention", "materials", "comments"],
      taskMode: "estimator",
      materialMode: "estimator",
      objectMode: "none",
      actions: [
        ["estimates", "Сметные задания"],
        ["materials", "Проверить материалы"],
        ["variations", "Допработы"],
      ],
    },
    sales_manager: {
      testId: "today-role-manager",
      label: "Менеджер",
      question: "Какие объекты нужно передать или доработать?",
      hint: "Показываем черновики, объекты на передаче, замечания руководителя и документы, которые нужно дозагрузить.",
      tasksTitle: "Черновики и доработки",
      attentionTitle: "Что мешает передаче объекта",
      materialsTitle: "Файлы и сметы к проверке",
      visibleSections: ["attention", "objects", "comments"],
      taskMode: "manager",
      materialMode: "none",
      objectMode: "manager",
      actions: [
        ["projects", "Открыть объекты"],
        ["estimates", "Сметные задания"],
        ["documents", "База знаний"],
      ],
    },
  };
  return profiles[role] || profiles.owner;
}

function applyTodayProfile(profile) {
  const visible = new Set(profile.visibleSections || []);
  const sectionNodes = {
    tasks: "#todayTasks",
    attention: "#todayAttention",
    materials: "#todayMaterials",
    comments: "#todayComments",
    objects: "#todayObjects",
    noPhoto: "#todayNoPhoto",
  };
  Object.entries(sectionNodes).forEach(([key, selector]) => {
    const panel = qs(selector)?.closest(".panel");
    if (panel) panel.hidden = !visible.has(key);
  });
  const todayView = qs("#todayView");
  if (todayView) todayView.dataset.role = currentRoleBase();
  const rolePanel = qs(".today-role-panel");
  if (rolePanel) {
    rolePanel.dataset.testid = profile.testId || "today-role-owner";
    rolePanel.setAttribute("data-testid", profile.testId || "today-role-owner");
  }
  const materialsList = qs("#todayMaterials");
  if (materialsList) materialsList.dataset.testid = "today-materials-risk-list";
}

function taskTypeKey(task) {
  return normalizeTaskType(task?.task_type || task?.type || task?.kind || "task");
}

function taskMentions(task, words = []) {
  const text = `${task?.title || ""} ${task?.description || ""}`.toLowerCase();
  return words.some((word) => text.includes(word));
}

function taskRoleScore(task) {
  let score = 0;
  if (taskCountsAsOverdue(task)) score += 80;
  if (taskReviewCountsAsOverdue(task)) score += 75;
  if (taskStatusKey(task) === "returned") score += 60;
  if (taskIsWaitingCheck(task)) score += 45;
  if (["question", "decision", "approval"].includes(taskTypeKey(task))) score += 35;
  if (!task.due_date) score += 15;
  if (isTodayDate(task.due_date)) score += 25;
  return score;
}

function todayTasksForProfile(tasks = [], profile = roleTodayProfile()) {
  const mode = profile.taskMode || "leadership";
  let rows = (Array.isArray(tasks) ? tasks : []).filter(isOpenTask);
  if (mode === "worker") {
    rows = rows.filter((task) => isTodayDate(task.due_date) || taskCountsAsOverdue(task) || taskReviewCountsAsOverdue(task) || ["returned", "waiting_check"].includes(taskStatusKey(task)) || ["photo_report", "issue"].includes(taskTypeKey(task)));
  } else if (mode === "my-work") {
    rows = rows.filter((task) => isTodayDate(task.due_date) || taskCountsAsOverdue(task) || taskReviewCountsAsOverdue(task) || ["returned", "waiting_check"].includes(taskStatusKey(task)) || ["photo_report", "question", "decision", "approval", "issue", "material"].includes(taskTypeKey(task)));
  } else if (mode === "procurement") {
    rows = rows.filter((task) => ["material", "approval", "question"].includes(taskTypeKey(task)) || taskMentions(task, ["материал", "поставка", "заявк", "купить", "заказать"]));
  } else if (mode === "estimator") {
    rows = rows.filter((task) => ["check", "approval", "material", "question"].includes(taskTypeKey(task)) || taskMentions(task, ["смет", "допработ", "цена", "провер"]));
  } else if (mode === "manager") {
    rows = rows.filter((task) => ["returned", "waiting_answer"].includes(task.status) || taskMentions(task, ["документ", "договор", "смет"]));
  } else {
    rows = rows.filter((task) => isTodayDate(task.due_date) || taskCountsAsOverdue(task) || taskReviewCountsAsOverdue(task) || ["returned", "waiting_check", "waiting_answer"].includes(taskStatusKey(task)) || ["question", "decision", "approval", "photo_report"].includes(taskTypeKey(task)));
  }
  return rows.sort((a, b) => taskRoleScore(b) - taskRoleScore(a) || String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")));
}

function materialBatchRiskScore(batch) {
  let score = 0;
  const status = materialPipelineStatus(batch);
  if (status === "problem") score += 90;
  if (batch.is_blocker || batch.blocks_project) score += 80;
  if (batch.delivery_urgency === "urgent") score += 60;
  if (["needs_approval", "draft"].includes(status)) score += 30;
  if (["ordered", "in_transit"].includes(status)) score += 20;
  if (isTodayDate(batch.needed_at)) score += 25;
  if (isDateOverdue(batch.needed_at)) score += 70;
  return score;
}

function todayMaterialsForProfile(batches = [], profile = roleTodayProfile()) {
  const mode = profile.materialMode || "risk";
  let rows = Array.isArray(batches) ? batches : [];
  if (mode === "none") return [];
  if (mode === "procurement") {
    rows = rows.filter((batch) => !["closed", "cancelled"].includes(materialPipelineStatus(batch)));
  } else if (mode === "estimator") {
    rows = rows.filter((batch) => materialActiveItems(batch).some((item) => materialRowHasDeviation(item) || materialRowHasNoPrice(item) || materialRowActualOverrun(item)));
  } else if (mode === "foreman") {
    rows = rows.filter((batch) => !["closed", "cancelled"].includes(materialPipelineStatus(batch)));
  } else {
    rows = rows.filter(materialIsRisky);
  }
  return rows.sort((a, b) => materialBatchRiskScore(b) - materialBatchRiskScore(a) || String(a.needed_at || "9999").localeCompare(String(b.needed_at || "9999")));
}

function todayProjectsForProfile(projects = [], tasks = [], materialRows = [], profile = roleTodayProfile()) {
  if (profile.objectMode === "none") return [];
  const rows = Array.isArray(projects) ? [...projects] : [];
  return rows.sort((a, b) => projectBlockerCount(b, tasks, materialRows) - projectBlockerCount(a, tasks, materialRows) || String(a.title || "").localeCompare(String(b.title || ""), "ru"));
}

function roleScopedRemarksForToday(remarks = []) {
  const role = currentRoleBase();
  const userId = Number(currentUserId() || 0);
  const projectIds = roleProjectIdSet();
  const rows = Array.isArray(remarks) ? remarks : [];
  if (isLeadershipRole(role)) return rows;
  if (role === "foreman" || role === "master") {
    return rows.filter((remark) => Number(remark.responsible_user_id || 0) === userId || projectIds.has(Number(remark.project_id || 0)));
  }
  if (role === "technical_supervisor") return rows.filter((remark) => projectIds.has(Number(remark.project_id || 0)) || Number(remark.created_by || 0) === userId);
  return rows.filter((remark) => projectIds.has(Number(remark.project_id || 0)));
}

function renderTaskStats(tasks, activeFilter = state.taskFilter, options = {}) {
  const stats = taskStats(tasks);
  const total = Math.max(tasks.length, 1);
  const segments = [
    ["all", "Все", tasks.length, ""],
    ["active", "В работе", stats.active, "warning"],
    ["returned", "На доработке", stats.returned, "danger"],
    ["waiting", "Ждёт проверки", stats.waiting, "blue"],
    ["review_overdue", "Просрочена проверка", stats.reviewOverdue, "danger"],
    ["accepted", "Принято", stats.accepted, "success"],
    ["overdue", "Просрочено", stats.overdue, "danger"],
    ["no_due", "Без срока", stats.noDue, "warning"],
  ];
  const visibleSegments = options.hideZero ? segments.filter(([, , count]) => Number(count || 0) > 0) : segments;
  if (!visibleSegments.length) {
    return `<div class="task-stats-empty">${escapeHtml(options.emptyText || "Активных задач пока нет.")}</div>`;
  }
  return `
    <div class="task-stats ${options.hideZero ? "hide-zero" : ""} ${options.compact ? "compact-tabs" : ""}">
      ${visibleSegments
        .map(
          ([key, title, count, level]) => `
          <button class="task-stat ${level} ${Number(count || 0) === 0 ? "is-zero" : ""} ${activeFilter === key ? "active" : ""}" data-task-filter="${key}" type="button">
            <span>${title}</span>
            <strong>${count}</strong>
            <div class="stat-bar"><i style="width: ${(count / total) * 100}%"></i></div>
          </button>`
        )
        .join("")}
    </div>`;
}

function taskProjectIndicatorPills(stats, openCount, newCount) {
  const items = [];
  if (newCount) items.push(pill(`${newCount} требует внимания`, "warning"));
  if (stats.active) items.push(pill(`В работе ${stats.active}`, "warning"));
  if (stats.returned) items.push(pill(`На доработке ${stats.returned}`, "danger"));
  if (stats.waiting) items.push(pill(`Ждёт проверки ${stats.waiting}`, "blue"));
  if (stats.reviewOverdue) items.push(pill(`Проверка просрочена ${stats.reviewOverdue}`, "danger"));
  if (stats.accepted) items.push(pill(`Принято ${stats.accepted}`, "success"));
  if (!openCount && !newCount) items.push(`<span class="muted">открытых задач нет</span>`);
  return items.join("");
}

function taskStatusLevel(status) {
  return statusLevel(status);
}

function normalizeTaskType(type) {
  const key = String(type || "task").trim();
  if (key === "photo") return "photo_report";
  if (key === "remark") return "issue";
  return key || "task";
}

function taskDisplayTitle(task) {
  const title = String(task?.display_title || task?.title || "Задача").trim();
  if (/^Сделать фотоотч[её]т,/i.test(title)) return "Сделать фотоотчёт по объекту";
  if (title.length > 80) return `${title.slice(0, 77).trim()}...`;
  return title || "Задача";
}

function taskDisplayDescription(task) {
  const title = String(task?.title || "").trim();
  const description = String(task?.description || "").trim();
  if (/^Сделать фотоотч[её]т,/i.test(title) && !description) return title;
  if (title.length > 80 && !description) return title;
  return description;
}

function inferTaskType(taskOrType) {
  if (!taskOrType || typeof taskOrType !== "object") return normalizeTaskType(taskOrType);
  const explicit = normalizeTaskType(taskOrType.task_type || taskOrType.related_type || "task");
  const text = `${taskOrType.title || ""} ${taskOrType.description || ""} ${taskOrType.related_type || ""}`.toLowerCase();
  if (/фото\s*отч[её]т|фотоотч[её]т|photo/.test(text)) return "photo_report";
  if (/согласовать|нужно\s+решение|требует\s+решения|утвердить|одобрить/.test(text) || explicit === "approval") return "approval";
  if (/проверить|принять|контроль|проверка/.test(text) || explicit === "check") return "check";
  if (/[?？]/.test(text) || /что\s+думаете|как\s+лучше|вопрос|уточнить|уточнение/.test(text)) return "question";
  if (/материал|заявк|снабжен|поставк|заказать|купить/.test(text) || explicit === "material") return "material";
  if (/дефект|замечани|исправ|передел|брак|не\s+принят/.test(text)) return "issue";
  return explicit;
}

function taskTypeLabel(taskOrType) {
  return statusLabelMap[inferTaskType(taskOrType)] || "Задача";
}

function taskTypeLevel(taskOrType) {
  const type = inferTaskType(taskOrType);
  return {
    task: "blue",
    question: "warning",
    issue: "danger",
    remark: "danger",
    photo_report: "success",
    photo: "success",
    material: "blue",
    decision: "warning",
    check: "warning",
    approval: "warning",
  }[type || "task"] || "";
}

function taskPriorityLabel(priority) {
  return {
    urgent: "Срочно",
    high: "Высокий",
    normal: "Обычный",
    low: "Низкий",
  }[priority] || "Обычный";
}

function taskPriorityLevel(priority) {
  return {
    urgent: "danger",
    high: "warning",
    normal: "",
    low: "success",
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
    estimate_question: "warning",
  }[job.status] || "";
}

function estimateJobTypeLabel(value) {
  return {
    primary: "Первичная",
    revision: "Корректировка",
    additional: "Допработы",
    contractor: "Проверка подрядчика",
    other: "Другое",
  }[value] || "Не указан";
}

function estimateSiteCostsLabel(value) {
  return {
    include: "Организацию площадки включить",
    exclude: "Организацию площадки не включать",
    clarify: "Организацию площадки уточнить",
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
  return `${customer} - ${title}`;
}

function normalizeEstimateJobTitle(customerName, estimateTitle) {
  return normalizeCustomerBasedTitle(customerName, estimateTitle);
}

function syncEstimateSiteCostsByType() {
  const form = qs("#estimateJobForm");
  if (!form) return;
  const estimateType = form.elements.estimate_type?.value || "primary";
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
    questions: jobs.filter((job) => job.status === "estimate_question").length,
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
    ["Возврат", stats.returned, "danger"],
  ];
  return `
    <div class="task-stats">
      ${segments
        .map(
          ([title, count, level]) => `
          <div class="task-stat ${level}">
            <span>${title}</span>
            <strong>${count}</strong>
            <div class="stat-bar"><i style="width: ${(count / total) * 100}%"></i></div>
          </div>`
        )
        .join("")}
    </div>`;
}

function estimateJobProgress(job) {
  if (job.status === "estimate_done") return 100;
  if (!job.received_at || !job.due_date) return 15;
  const start = new Date(`${job.received_at}T00:00:00`);
  const end = new Date(`${job.due_date}T00:00:00`);
  const today = new Date();
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const total = Math.max(end - start, 86400000);
  return Math.max(8, Math.min(100, ((current - start) / total) * 100));
}

function renderEstimateSchedule(jobs) {
  const activeJobs = jobs.filter((job) => job.status !== "estimate_done").slice(0, 8);
  if (!activeJobs.length) return `<p class="muted">Активных сметных заданий нет.</p>`;
  return activeJobs
    .map(
      (job) => `
      <div class="estimate-timeline-row">
        <div class="estimate-timeline-main">
          <strong>${escapeHtml(job.title)}</strong>
          <span>${escapeHtml(job.estimator_name || "сметчик не назначен")} · ${formatDateRu(job.received_at)} → ${formatDateRu(job.due_date)}</span>
          ${job.question_comment ? `<em>Вопрос сметчика: ${escapeHtml(job.question_comment)}</em>` : ""}
        </div>
        <div class="estimate-timeline-track ${estimateJobStatusLevel(job)}"><i style="width: ${estimateJobProgress(job)}%"></i></div>
        ${pill(label(job.status), estimateJobStatusLevel(job))}
      </div>`
    )
    .join("");
}

function estimateFileDownloadUrl(file) {
  return `/api/estimate-job-files/${encodeURIComponent(file.id)}/download`;
}

function estimateSmetterHref(job = {}) {
  const direct = String(job.smetter_url || "").trim();
  if (direct) return direct;
  return [job.result_comment, job.comment, job.question_comment, job.return_comment]
    .map(firstUrlFromText)
    .find((url) => /smetter/i.test(url)) || "";
}

function isEstimateImageFile(file) {
  const mime = String(file?.mime_type || "").toLowerCase();
  const fileName = String(file?.file_name || file?.title || "").toLowerCase();
  return mime.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(fileName);
}

function renderEstimateJobFiles(files = [], jobId = "", canManageFiles = false) {
  if (!Array.isArray(files) || !files.length) return "";
  return `
    <div class="estimate-job-files">
      ${files
        .map(
          (file) => {
            const title = escapeHtml(file.title || file.file_name || "Файл");
            const fileName = escapeHtml(file.file_name || "");
            const href = escapeAttr(estimateFileDownloadUrl(file));
            const isCurrent = Number(file.is_current ?? 1) !== 0;
            const version = Number(file.version_no || 1);
            const versionText = `v${version}${isCurrent ? "" : " · предыдущая"}`;
            const note = file.replacement_note ? ` · ${escapeHtml(file.replacement_note)}` : "";
            const printButton = `<button class="estimate-file-print" type="button" data-print-estimate-file="${escapeAttr(file.id)}">Печать</button>`;
            const replaceButton = canManageFiles && isCurrent ? `<button class="estimate-file-print" type="button" data-replace-estimate-file="${escapeAttr(file.id)}" data-estimate-job-id="${escapeAttr(jobId)}">Заменить</button>` : "";
            const deleteButton = canManageFiles ? `<button class="estimate-file-print danger-outline" type="button" data-delete-estimate-file="${escapeAttr(file.id)}">Удалить</button>` : "";
            const meta = `<span>${fileName}</span><span>${versionText}${note}</span>`;
            if (isEstimateImageFile(file)) {
              return `
          <div class="estimate-file-card ${isCurrent ? "" : "previous-version"}">
            <button class="estimate-file-button" type="button" data-estimate-gallery-job="${escapeAttr(jobId)}" data-estimate-gallery-file="${escapeAttr(file.id)}">
              <strong>${title}</strong>
              ${meta}
            </button>
            ${printButton}
            ${replaceButton}
            ${deleteButton}
          </div>`;
            }
            return `
          <div class="estimate-file-card ${isCurrent ? "" : "previous-version"}">
            <a href="${href}" target="_blank" rel="noopener noreferrer">
              <strong>${escapeHtml(file.title || file.file_name || "Файл")}</strong>
              ${meta}
            </a>
            ${printButton}
            ${replaceButton}
            ${deleteButton}
          </div>`;
          }
        )
        .join("")}
    </div>`;
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
  counterNode.textContent = `${gallery.index + 1} из ${files.length}`;
  downloadNode.href = href;
  prevButton.disabled = files.length < 2;
  nextButton.disabled = files.length < 2;
}

function openEstimateGallery(jobId, fileId) {
  const job = state.estimateJobs.find((item) => Number(item.id) === Number(jobId));
  const files = (job?.files || []).filter(isEstimateImageFile);
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
  const canAnswerQuestion = canEdit && job.status === "estimate_question" && ["owner", "construction_manager", "sales_manager"].includes(currentRoleBase());
  const smetterHref = estimateSmetterHref(job);
  return `
    <article class="row estimate-job-row">
      <div class="estimate-job-main">
        <div class="stack-line">
          <strong>${escapeHtml(job.title)}</strong>
          ${pill(label(job.status), statusLevel)}
          ${pill(job.due_date || "без срока", job.status === "estimate_done" ? "success" : levelByDate(job.due_date))}
        </div>
        <div class="muted">${escapeHtml(job.customer_name || "Заказчик не указан")} · ${escapeHtml(job.project_title || "без карточки объекта")} · ${estimateJobTypeLabel(job.estimate_type)}</div>
        <div class="muted">получено: ${formatDateRu(job.received_at) || "не указано"} · выдал задание: ${escapeHtml(job.manager_name || "не назначен")} · сметчик: ${escapeHtml(job.estimator_name || "не назначен")}</div>
        <div class="estimate-job-flags">
          ${pill(estimateSiteCostsLabel(job.site_costs_policy), job.site_costs_policy === "exclude" ? "warning" : job.site_costs_policy === "clarify" ? "blue" : "success")}
          ${isPartnerEstimateJob(job) ? pill("Партнерская смета", "blue") : ""}
        </div>
        ${job.site_costs_comment ? `<p class="muted">Организация площадки: ${escapeHtml(job.site_costs_comment)}</p>` : ""}
        ${smetterHref ? `<a class="link-button inline-link" href="${escapeAttr(smetterHref)}" target="_blank" rel="noopener noreferrer">Открыть Сметтер</a>` : ""}
        ${job.comment ? `<p>${linkifyText(job.comment)}</p>` : ""}
        ${job.question_comment ? `<div class="estimate-question-note"><strong>Вопрос сметчика</strong><p>${linkifyText(job.question_comment)}</p></div>` : ""}
        ${job.return_comment ? `<p class="muted danger-text">Возврат менеджеру: ${linkifyText(job.return_comment)}</p>` : ""}
        ${job.result_comment ? `<p class="muted">Итог: ${linkifyText(job.result_comment)}</p>` : ""}
        ${renderEstimateJobFiles(job.files, job.id, canManageFiles)}
      </div>
      <div class="estimate-job-actions">
        ${canAnswerQuestion ? `<button class="secondary tiny" type="button" data-edit-estimate-job="${job.id}">Ответить на уточнение</button>` : canEdit ? `<button class="secondary tiny" type="button" data-edit-estimate-job="${job.id}">Редактировать</button>` : ""}
        ${canStart ? `<button class="secondary tiny" type="button" data-estimate-job-status="estimate_in_work" data-estimate-job-id="${job.id}">В работу</button>` : ""}
        ${canQuestion ? `<button class="secondary tiny" type="button" data-estimate-job-status="estimate_question" data-estimate-job-id="${job.id}">Уточнить</button>` : ""}
        ${canReturn ? `<button class="secondary tiny danger-outline" type="button" data-estimate-job-status="estimate_returned" data-estimate-job-id="${job.id}">Вернуть менеджеру</button>` : ""}
        ${canFinish ? `<button class="primary tiny" type="button" data-estimate-job-status="estimate_done" data-estimate-job-id="${job.id}">Сдано</button>` : ""}
        ${canManageFiles ? `<button class="secondary tiny" type="button" data-open-estimate-files="${job.id}">Добавить файл</button>` : ""}
        ${canDelete ? `<button class="danger-button tiny" type="button" data-delete-estimate-job="${job.id}">Удалить</button>` : ""}
      </div>
    </article>`;
}

function fillEstimateJobForm(job = {}) {
  const form = qs("#estimateJobForm");
  form.reset();
  form.dataset.siteCostsTouched = job.id ? "true" : "false";
  form.elements.id.value = job.id || "";
  form.elements.title.value = job.title || "";
  form.elements.customer_name.value = job.customer_name || "";
  form.elements.project_id.value = job.project_id || "";
  const defaultManager = currentRoleBase() === "sales_manager" ? currentUserId() : usersByRole("sales_manager")[0]?.id;
  const defaultEstimator = currentRoleBase() === "estimator" ? currentUserId() : usersByRole("estimator")[0]?.id;
  form.elements.manager_id.value = job.manager_id || defaultManager || "";
  form.elements.estimator_id.value = job.estimator_id || defaultEstimator || "";
  form.elements.received_at.value = job.received_at || new Date().toISOString().slice(0, 10);
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
  qs("#estimateJobDoneTitle").textContent = job ? `Сдать смету: ${job.title}` : "Сдать смету";
  form.elements.result_comment.value = job?.result_comment || "";
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
  qs("#estimateJobFileTitle").textContent = `Файлы сметы: ${job.title}`;
  const currentFiles = (job.files || []).filter((file) => Number(file.is_current ?? 1) !== 0);
  form.elements.replace_file_id.innerHTML = currentFiles
    .map((file) => `<option value="${escapeAttr(file.id)}">${escapeHtml(file.title || file.file_name || "Файл")} · v${Number(file.version_no || 1)}</option>`)
    .join("");
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
  const batches = new Map();
  materialRows.forEach((item) => {
    const key = item.batch_id || `material-${item.id}`;
    if (!batches.has(key)) batches.set(key, item);
  });
  return [...batches.values()];
}

function attentionItem(title, count, details, level, action, options = {}) {
  return { title, count, details, level, action, ...options };
}

function renderDashboardMetric({ title, count, details, view, taskFilter, level = "", always = false }) {
  const numeric = Number(count || 0);
  if (!always && numeric === 0) return "";
  const target = taskFilter ? `data-task-filter="${taskFilter}"` : `data-view-target="${view || "dashboard"}"`;
  const stateClass = numeric === 0 ? "is-zero" : level === "danger" ? "is-critical" : "is-active";
  return `
    <button class="metric clickable ${stateClass} ${level}" ${target} type="button">
      <span class="muted">${escapeHtml(title)}</span>
      <strong>${escapeHtml(String(count ?? 0))}</strong>
      <span>${escapeHtml(details)}</span>
    </button>`;
}

function buildDashboardAttention(summary, tasks, materialRows) {
  const items = [];
  const stats = taskStats(tasks);
  const activeProjects = state.projects.filter((project) => project.status !== "archived");
  const materialBatches = uniqueMaterialBatches(materialRows);

  if (stats.overdue) {
    items.push(attentionItem("Просрочено исполнение", stats.overdue, "Действие сейчас на исполнителе: принять в работу, продолжить или отправить на проверку.", "danger", { taskFilter: "overdue" }));
  }
  if (stats.reviewOverdue) {
    items.push(attentionItem("Просрочена проверка", stats.reviewOverdue, "Исполнитель уже отправил результат, теперь действие на проверяющем.", "danger", { taskFilter: "review_overdue" }));
  }
  if (stats.waiting) {
    items.push(attentionItem("Ждут проверки", stats.waiting, "Исполнители отправили результат, проверяющему нужно принять или вернуть.", "blue", { taskFilter: "waiting" }));
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
            <button class="attention-item ${item.level} ${item.compact ? "compact" : ""}" type="button" ${attrs}>
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
  if (["accepted", "waiting_check"].includes(taskStatusKey(task))) return false;
  return ["owner", "construction_manager"].includes(currentRoleBase());
}

function canActAsTaskPrivileged() {
  return ["owner", "construction_manager", "finance_director"].includes(currentRoleBase());
}

function canActOnTaskAsAssignee(task) {
  return canActAsTaskPrivileged() || canActAsTaskUser(task, "assignee");
}

function canActOnTaskAsReviewer(task) {
  return canActAsTaskPrivileged() || canActAsTaskUser(task, "reviewer") || canActAsTaskUser(task, "creator");
}

function taskVisibilityReason(task) {
  if (canActAsTaskUser(task, "assignee")) return "Назначено вам";
  if (canActAsTaskUser(task, "reviewer")) return "Требуется ваша проверка";
  if (canActAsTaskUser(task, "creator")) return "Вы создали задачу";
  const project = state.projects.find((item) => Number(item.id) === Number(task.project_id));
  const userId = Number(currentUserId() || 0);
  if (project && userId && [project.foreman_id, project.tech_supervisor_id, project.procurement_manager_id, project.estimator_id].some((id) => Number(id || 0) === userId)) return "На вашем объекте";
  if (isLeadershipRole()) return "Контроль руководителя";
  return "Доступно по вашей роли";
}

function taskNextAction(task) {
  const status = taskStatusKey(task);
  if (status === "new" && canActOnTaskAsAssignee(task)) return { action: "start", title: "Принять в работу", level: "primary" };
  if (status === "in_progress" && canActOnTaskAsAssignee(task)) return { action: "complete", title: "Отправить на проверку", level: "primary" };
  if (status === "returned" && canActOnTaskAsAssignee(task)) return { action: "start", title: "Продолжить работу", level: "primary" };
  if (status === "waiting_check" && canActOnTaskAsReviewer(task)) return { action: "accept", title: "Принять выполнение", level: "primary" };
  if (status === "waiting_check") return { title: "Ожидается проверка", disabled: true };
  if (status === "accepted") return { title: "Работа завершена и принята", disabled: true };
  return null;
}

function renderTaskNextAction(task, options = {}) {
  const next = taskNextAction(task);
  if (!next) return "";
  if (next.disabled) return `<button class="secondary" type="button" disabled title="${escapeAttr(next.title)}">${escapeHtml(next.title)}</button>`;
  const levelClass = next.level === "primary" ? "primary" : "secondary";
  return `<button class="${levelClass}" type="button" data-task-action="${next.action}" data-task-id="${task.id}">${escapeHtml(next.title)}</button>`;
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
    canView("tasks") ? renderDashboardMetric({ title: "Задачи к проверке", count: summary.task_done_waiting || 0, details: "Исполнитель отправил, проверяющий ещё не принял", taskFilter: "waiting", level: "blue" }) : "",
    canView("tasks") ? renderDashboardMetric({ title: "Просрочено", count: dashboardStats.overdue, details: "По открытым задачам", taskFilter: "overdue", level: "danger" }) : "",
    canView("estimates") ? renderDashboardMetric({ title: "Сметы в работе", count: summary.estimate_jobs_open || 0, details: "Нужно рассчитать", view: "estimates", level: "blue" }) : "",
    canView("estimates") ? renderDashboardMetric({ title: "Сметы просрочены", count: summary.estimate_jobs_overdue || 0, details: "Срок уже прошел", view: "estimates", level: "danger" }) : "",
  ].filter(Boolean);
  qs("#summaryCards").innerHTML = metricRows.length ? metricRows.join("") : `<div class="dashboard-empty-strip">Активных сигналов по роли пока нет.</div>`;
  qs("#dashboardAttention").innerHTML = renderDashboardAttention(buildDashboardAttention(summary, openRoleTasks, materialRows));
  qs("#dashboardTaskStats").innerHTML =
    renderTaskStats(openRoleTasks, state.taskFilter, { hideZero: true, emptyText: "Активных задач по выбранной роли пока нет." }) +
    `<p class="muted dashboard-context-note">На рабочем столе показаны только открытые задачи. Принятые задачи остаются в полном разделе «Задачи» в фильтре «Принято».</p>`;
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
    items: openRoleTasks,
    visibleCount: 3,
    emptyText: "Активных задач пока нет.",
    renderItem: renderDashboardTaskRow,
    moreLabel: "Остальные задачи",
    key: "dashboardTasks",
  });
  initSortableZones(qs("#dashboardView"));
}

function projectTasks(projectId, tasks = state.lastTasks || []) {
  return tasks.filter((task) => Number(task.project_id) === Number(projectId));
}

function projectMaterialBatches(projectId, materialRows = state.materialRequests || []) {
  return buildMaterialBatches(materialRows.filter((item) => Number(item.project_id) === Number(projectId)));
}

function projectRemarks(projectId) {
  return (state.objectRemarks || []).filter((remark) => Number(remark.project_id) === Number(projectId));
}

function projectPhotoReports(projectId) {
  return (state.photoReports || []).filter((report) => Number(report.project_id) === Number(projectId));
}

function photoReportCountsAsPresent(report) {
  const status = String(report.status_normalized || report.status || "");
  const filesCount = Number(report.files_count || (report.attachments || []).length || 0);
  return Boolean(report.is_valid_report !== false && filesCount > 0 && !["invalid_empty", "duplicate", "superseded", "cancelled", "rejected", "returned"].includes(status));
}

function latestPhotoReportDate(projectId) {
  return projectPhotoReports(projectId)
    .filter(photoReportCountsAsPresent)
    .map((report) => dateOnly(report.report_date || report.created_at))
    .filter(Boolean)
    .sort()
    .pop() || "";
}

function projectBlockerCount(project, tasks = state.lastTasks || [], materialRows = state.materialRequests || []) {
  const taskRows = projectTasks(project.id, tasks);
  const materialRowsForProject = projectMaterialBatches(project.id, materialRows);
  const remarks = projectRemarks(project.id);
  const blockers = roleScopedBlockers(state.blockers || []).filter((blocker) => Number(blocker.project_id || 0) === Number(project.id) && !["resolved", "closed"].includes(blocker.status));
  return (
    taskRows.filter((task) => task.status === "returned" || taskCountsAsOverdue(task)).length +
    materialRowsForProject.filter(materialIsRisky).length +
    remarks.filter((remark) => !["accepted", "closed"].includes(remark.status)).length +
    blockers.length
  );
}

function renderTodayKpis(items = []) {
  return items
    .slice(0, 6)
    .map(
      (item) => `
      <button class="metric compact-kpi ${item.level || ""} ${Number(item.value || 0) === 0 ? "is-zero" : ""}" type="button" ${item.attrs || 'data-view-target="today"'}>
        <span class="kpi-icon">${escapeHtml(item.icon || "•")}</span>
        <strong>${escapeHtml(String(item.value ?? 0))}</strong>
        <span>${escapeHtml(item.label || "")}</span>
      </button>`
    )
    .join("");
}

function renderLimitedRows(items, renderer, { limit = 5, empty = "", moreTarget = "" } = {}) {
  if (!items.length) return empty;
  const visible = items.slice(0, limit).map(renderer).join("");
  const hidden = items.length - limit;
  if (hidden <= 0) return visible;
  return `${visible}<button class="show-all-link" type="button" ${moreTarget || 'data-view-target="today"'}>Показать все ${items.length}</button>`;
}

function renderTodayTaskCard(task) {
  return `
    <button class="row clickable today-task-card" type="button" data-open-task="${task.id}" data-testid="task-card">
      <div class="stack-line">
        <span data-testid="task-type-badge">${pill(taskTypeLabel(task), taskTypeLevel(task))}</span>
        <span data-testid="task-status-badge">${pill(statusLabel(taskStatusKey(task)), taskStatusLevel(taskStatusKey(task)))}</span>
        <span data-testid="task-priority-badge">${pill(taskPriorityLabel(task.priority), taskPriorityLevel(task.priority))}</span>
        ${pill(task.due_date || "без срока", levelByDate(task.due_date))}
      </div>
      <strong class="task-card-title" data-testid="task-title">${escapeHtml(taskDisplayTitle(task))}</strong>
      <div class="muted" data-testid="task-meta">${escapeHtml(task.project_title || "Объект не указан")} · ответственный: ${escapeHtml(task.assignee_name || "не назначен")} · срок: ${task.due_date ? formatDateRu(task.due_date) : "без срока"}</div>
    </button>`;
}

function renderTodayMaterialCard(batch) {
  const overrun = Number(batch.actual_purchase_amount || 0) > Number(batch.total_amount || 0) && Number(batch.actual_purchase_amount || 0) > 0;
  const firstItem = materialActiveItems(batch)[0] || {};
  return `
    <button class="row clickable today-material-card" type="button" data-open-material-batch="${batch.key}" data-testid="material-card">
      <div class="stack-line">
        ${pill(statusLabel(materialPipelineStatus(batch)), materialPipelineLevel(batch))}
        ${batch.delivery_urgency === "urgent" ? pill("Срочно", "danger") : ""}
        ${overrun ? pill("Факт выше сметы", "danger") : ""}
      </div>
      <strong>${escapeHtml(firstItem.title || materialBatchTitle(batch))}</strong>
      <div class="muted">${escapeHtml(batch.project_title || "Объект не указан")} · ${escapeHtml(firstItem.requested_quantity || firstItem.estimated_quantity || "")} ${escapeHtml(firstItem.requested_unit || firstItem.estimate_material_unit || "")}</div>
      <div class="muted">позиций: ${materialActiveItems(batch).length} · основание: ${escapeHtml(materialBatchBasisSummary(batch) || "не указано")} · срок: ${batch.needed_at ? formatDateRu(batch.needed_at) : "без срока"} · отвечает: ${escapeHtml(batch.procurement_name || "Снабжение")}</div>
      </button>`;
}

function renderTodayObjectCard(project, tasks, materialRows) {
  const taskRows = projectTasks(project.id, tasks);
  const openTasks = taskRows.filter(isOpenTask);
  const overdueTasks = taskRows.filter(taskCountsAsOverdue);
  const blockers = projectBlockerCount(project, tasks, materialRows);
  const riskyMaterials = projectMaterialBatches(project.id, materialRows).filter(materialIsRisky);
  const latestPhoto = latestPhotoReportDate(project.id);
  return `
    <button class="today-object-card clickable" type="button" data-open-project="${project.id}">
      <div class="today-object-head">
        <strong>${escapeHtml(project.title || "Объект")}</strong>
        ${pill(statusLabel(project.status), statusLevel(project.status))}
      </div>
      <div class="muted">ответственный: ${escapeHtml(project.foreman_name || "прораб не назначен")} · этап: ${statusLabel(project.stage || project.status)}</div>
      <div class="today-object-metrics">
        ${pill(`открыто: ${openTasks.length}`, openTasks.length ? "blue" : "")}
        ${overdueTasks.length ? pill(`просрочено: ${overdueTasks.length}`, "danger") : ""}
        ${blockers ? pill(`блокеры: ${blockers}`, "danger") : ""}
        ${riskyMaterials.length ? pill(`материалы под риском: ${riskyMaterials.length}`, "warning") : ""}
      </div>
      <div class="muted">последний фотоотчёт: ${latestPhoto ? formatDateRu(latestPhoto) : "не найден"}</div>
    </button>`;
}

function renderTodayAttentionCard(title, count, text, level, targetAttrs) {
  if (!Number(count || 0)) return "";
  return `
    <button class="attention-item ${level}" type="button" ${targetAttrs || 'data-view-target="dashboard"'}>
      <span class="attention-count">${escapeHtml(String(count))}</span>
      <span class="attention-body">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(text)}</small>
      </span>
    </button>`;
}

function todayDecisionItems({ overdueTasks = [], returnedTasks = [], waitingTasks = [], riskyMaterials = [], noPhotoProjects = [], blockers = [], remarks = [] }) {
  const today = new Date().toISOString().slice(0, 10);
  const taskItem = (task, type, level, action = "Открыть задачу") => ({
    type,
    level,
    object: task.project_title || "Объект не указан",
    title: task.title || "Задача",
    responsible: task.assignee_name || "не назначен",
    due: task.due_date || "без срока",
    criticality: level === "danger" ? "Высокая" : level === "warning" ? "Средняя" : "Рабочая",
    action,
    attrs: `data-open-task="${task.id}"`,
  });
  return [
    ...blockers.map((blocker) => ({
      type: statusLabel(blocker.blocker_type || "other"),
      level: blocker.severity === "critical" || blocker.severity === "high" ? "danger" : "warning",
      object: blocker.project_title || "Объект не указан",
      title: blocker.title || "Блокер объекта",
      responsible: blocker.responsible_name || "не назначен",
      due: blocker.due_date || "без срока",
      criticality: blocker.severity === "critical" || blocker.severity === "high" ? "Высокая" : "Средняя",
      action: blocker.linked_task_id ? "Открыть задачу" : blocker.linked_material_request_id ? "Открыть заявку" : "Открыть объект",
      attrs: blocker.linked_task_id ? `data-open-task="${blocker.linked_task_id}"` : blocker.linked_material_request_id ? `data-open-material-batch="batch-${blocker.linked_material_request_id}"` : `data-open-project="${blocker.project_id}"`,
    })),
    ...remarks.map((remark) => ({
      type: "Замечание",
      level: isDateOverdue(remark.due_date) || remark.status === "returned" ? "danger" : "warning",
      object: remark.project_title || "Объект не указан",
      title: remark.title || "Замечание по объекту",
      responsible: remark.responsible_name || "не назначен",
      due: remark.due_date || "без срока",
      criticality: isDateOverdue(remark.due_date) ? "Высокая" : "Средняя",
      action: "Открыть замечания",
      attrs: `data-view-target="object_remarks"`,
    })),
    ...overdueTasks.map((task) => taskItem(task, "Просрочено", "danger")),
    ...returnedTasks.map((task) => taskItem(task, "Возвращено", "warning")),
    ...waitingTasks.map((task) => taskItem(task, "Ждёт проверки", "blue")),
    ...riskyMaterials.map((batch) => ({
      type: "Материал",
      level: materialPipelineLevel(batch),
      object: batch.project_title || "Объект не указан",
      title: materialBatchTitle(batch),
      responsible: "Снабжение",
      due: batch.needed_at || "без срока",
      criticality: materialPipelineStatus(batch) === "problem" ? "Высокая" : "Под риском",
      action: "Открыть заявку",
      attrs: `data-open-material-batch="${batch.key}"`,
    })),
    ...noPhotoProjects.map((project) => ({
      type: "Нет фотоотчёта",
      level: "warning",
      object: project.title || "Объект",
      title: "Сделать фотоотчёт за сегодня",
      responsible: project.tech_supervisor_name || project.foreman_name || "не назначен",
      due: today,
      criticality: "Средняя",
      action: "Открыть объект",
      attrs: `data-open-project="${project.id}"`,
    })),
  ];
}

function renderTodayDecisionItem(item) {
  return `
    <button class="attention-item decision-item ${item.level || ""}" type="button" ${item.attrs || 'data-view-target="tasks"'}>
      <span class="attention-count">${escapeHtml(item.type || "Сигнал")}</span>
      <span class="attention-body">
        <strong>${escapeHtml(item.object || "Объект")} — ${escapeHtml(item.title || "Что-то требует решения")}</strong>
        <small>Ответственный: ${escapeHtml(item.responsible || "не назначен")} · Срок: ${escapeHtml(item.due || "без срока")} · Критичность: ${escapeHtml(item.criticality || "рабочая")}</small>
        <em>${escapeHtml(item.action || "Открыть")}</em>
      </span>
    </button>`;
}

function renderTodayPrimaryActions(profile) {
  return (profile.actions || [])
    .filter(([view]) => canView(view))
    .map(([view, title]) => `<button class="secondary" type="button" data-view-target="${view}">${escapeHtml(title)}</button>`)
    .join("");
}

function mobileQuickActionsForRole() {
  const role = currentRoleBase();
  if (role === "master") {
    return [
      ["photo", "Добавить фото"],
      ["blocker", "Сообщить проблему"],
    ];
  }
  if (role === "foreman") {
    return [
      ["photo", "Добавить фотоотчёт"],
      ["task", "Создать задачу"],
      ["material", "Запросить материал"],
      ["remark", "Создать замечание"],
      ["blocker", "Сообщить проблему"],
    ];
  }
  if (role === "procurement_manager") {
    return [
      ["material", "Открыть заявки"],
      ["blocker", "Сообщить проблему"],
    ];
  }
  return [
    ["photo", "Добавить фотоотчёт"],
    ["task", "Создать задачу"],
    ["remark", "Создать замечание"],
    ["material", "Запросить материал"],
    ["blocker", "Сообщить проблему"],
  ];
}

function syncMobileQuickActions() {
  const sheet = qs("#mobileQuickSheet");
  const list = qs("#mobileQuickActions");
  if (!sheet || !list) return;
  const title = qs("#mobileQuickSheetTitle");
  if (state.mobileSheetMode === "menu") {
    const views = mobileMenuViewsForRole();
    if (title) title.textContent = "Разделы";
    list.innerHTML = views
      .map((view) => `<button class="secondary mobile-menu-item" type="button" data-view-target="${view}" data-mobile-menu-item="${view}">${escapeHtml(navLabelForView(view))}</button>`)
      .join("");
    sheet.hidden = !state.mobileQuickOpen;
    return;
  }
  if (title) title.textContent = "Быстрое действие";
  const actions = mobileQuickActionsForRole().filter(([action]) => {
    if (action === "photo") return canView("photos") || canView("today");
    if (action === "task") return canView("tasks");
    if (action === "remark") return canView("object_remarks");
    if (action === "material") return canView("materials") || currentRoleBase() === "foreman";
    return true;
  });
  list.innerHTML = actions.map(([action, title]) => `<button class="secondary" type="button" data-mobile-action="${action}">${escapeHtml(title)}</button>`).join("");
  sheet.hidden = !state.mobileQuickOpen;
}

function toggleMobileQuickActions(open = !state.mobileQuickOpen) {
  state.mobileQuickOpen = Boolean(open);
  state.mobileSheetMode = "actions";
  syncMobileQuickActions();
}

function mobileMenuViewsForRole() {
  const order = ["today", "dashboard", "projects", "estimates", "tasks", "works", "materials", "variations", "object_remarks", "photos", "locations", "documents", "feedback", "events"];
  const allowed = allowedViews();
  return order.filter((view) => allowed.includes(view));
}

function toggleMobileMenu(open = true) {
  state.mobileQuickOpen = Boolean(open);
  state.mobileSheetMode = "menu";
  syncMobileQuickActions();
}

function firstRoleProjectId() {
  return state.selectedProjectId || roleScopedProjects(state.projects)[0]?.id || state.projects[0]?.id || "";
}

async function quickCreateBlocker() {
  const projectId = firstRoleProjectId();
  if (!projectId) {
    showToast("Сначала нужен объект");
    return;
  }
  const title = window.prompt("Кратко опишите проблему, которая тормозит объект");
  if (title === null) return;
  if (!String(title).trim()) {
    showToast("Напишите проблему");
    return;
  }
  await api("/api/blockers", {
    method: "POST",
    body: JSON.stringify({
      project_id: projectId,
      title: title.trim(),
      description: "",
      blocker_type: "other",
      responsible_user_id: currentUserId() || "",
      severity: "medium",
      status: "open",
      actor_id: currentUserId() || "",
    }),
  });
  await loadAll();
  showToast("Проблема добавлена в блокеры");
}

async function handleMobileQuickAction(action) {
  toggleMobileQuickActions(false);
  const projectId = firstRoleProjectId();
  if (action === "photo") {
    const form = qs("#photoReportForm");
    form?.reset();
    if (projectId && form?.elements.project_id) form.elements.project_id.value = String(projectId);
    if (form?.elements.report_date) form.elements.report_date.value = todayIso();
    qs("#photoReportDialog")?.showModal();
    return;
  }
  if (action === "task") {
    const form = qs("#taskForm");
    form?.reset();
    if (projectId && form?.elements.project_id) form.elements.project_id.value = String(projectId);
    if (form?.elements.creator_role) form.elements.creator_role.value = currentRoleBase();
    if (form?.elements.creator_id) form.elements.creator_id.value = currentUserId() || "";
    loadTaskContractOptions(form?.elements.project_id?.value || "");
    qs("#taskDialog")?.showModal();
    return;
  }
  if (action === "remark") {
    const form = qs("#objectRemarkForm");
    form?.reset();
    if (projectId && form?.elements.project_id) form.elements.project_id.value = String(projectId);
    qs("#objectRemarkDialog")?.showModal();
    return;
  }
  if (action === "material") {
    if (canView("materials")) switchView("materials");
    await openNewMaterialDialog(projectId);
    return;
  }
  if (action === "blocker") {
    await quickCreateBlocker();
  }
}

async function renderToday() {
  if (!qs("#todayView")) return;
  const [tasks, materialRows, notifications] = await Promise.all([
    canView("tasks") || canView("today") ? api("/api/tasks") : Promise.resolve([]),
    canView("materials") || canView("today") ? api("/api/material-requests") : Promise.resolve([]),
    api("/api/notifications").catch(() => []),
  ]);
  const profile = roleTodayProfile();
  applyTodayProfile(profile);
  const roleProjects = roleScopedProjects(state.projects);
  const roleProjectIds = roleProjectIdSet(roleProjects);
  const roleTasks = roleScopedTasks(tasks);
  const roleMaterialRows = roleScopedMaterialRows(materialRows);
  const roleBlockers = roleScopedBlockers(state.blockers || []);
  const roleRemarks = roleScopedRemarksForToday(state.objectRemarks || []);
  state.lastTasks = roleTasks;
  state.materialRequests = roleMaterialRows;
  qs("#todayRoleLabel").textContent = profile.label;
  qs("#todayRoleQuestion").textContent = profile.question;
  qs("#todayRoleHint").textContent = profile.hint;
  qs("#todayTasksTitle").textContent = profile.tasksTitle;
  qs("#todayAttentionTitle").textContent = profile.attentionTitle;
  qs("#todayMaterialsTitle").textContent = profile.materialsTitle;
  qs("#todayPrimaryActions").innerHTML = renderTodayPrimaryActions(profile);
  const todayTasks = todayTasksForProfile(roleTasks, profile);
  const overdueTasks = roleTasks.filter(taskCountsAsOverdue);
  const returnedTasks = roleTasks.filter((task) => taskStatusKey(task) === "returned");
  const waitingTasks = roleTasks.filter(taskIsWaitingCheck);
  const materialBatches = buildMaterialBatches(roleMaterialRows);
  const riskyMaterials = todayMaterialsForProfile(materialBatches, profile);
  const activeProjects = todayProjectsForProfile(roleProjects, roleTasks, roleMaterialRows, profile);
  const noPhotoProjects = activeProjects.filter((project) => !isTodayDate(latestPhotoReportDate(project.id)));
  const openRemarks = roleRemarks.filter((remark) => !["accepted", "closed"].includes(remark.status)).sort((a, b) => Number(isDateOverdue(b.due_date)) - Number(isDateOverdue(a.due_date)) || String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")));
  const recentComments = notifications
    .filter((row) => isLast24Hours(row.created_at))
    .filter((row) => !row.project_id || isLeadershipRole() || roleProjectIds.has(Number(row.project_id || 0)))
    .slice(0, 12);
  const decisionItems = todayDecisionItems({ overdueTasks, returnedTasks, waitingTasks, riskyMaterials, noPhotoProjects, blockers: roleBlockers, remarks: openRemarks });
  qs("#todayKpis").innerHTML = renderTodayKpis([
    ["Требует действия", decisionItems.length, "!", decisionItems.length ? "danger" : "", 'data-view-target="tasks"'],
    ["Просрочено", overdueTasks.length, "⏱", overdueTasks.length ? "danger" : "", 'data-view-target="tasks"'],
    ["Ждёт проверки", waitingTasks.length, "✓", waitingTasks.length ? "blue" : "", 'data-view-target="tasks"'],
    ["Блокеры", roleBlockers.length, "◆", roleBlockers.length ? "danger" : "", 'data-view-target="dashboard"'],
    ["Без фотоотчёта", noPhotoProjects.length, "▣", noPhotoProjects.length ? "warning" : "", 'data-view-target="photos"'],
    ["Материалы под риском", riskyMaterials.length, "◫", riskyMaterials.length ? "warning" : "", 'data-view-target="materials"'],
  ].map(([label, value, icon, level, attrs]) => ({ label, value, icon, level, attrs })));
  qs("#todayTasks").innerHTML = todayTasks.length
    ? renderLimitedRows(todayTasks, renderTodayTaskCard, { limit: 5, moreTarget: 'data-view-target="tasks"' })
    : `<div class="empty-state"><strong>На сегодня задач нет</strong><p class="muted">Проверьте просроченные или откройте объект.</p></div>`;
  qs("#todayAttention").innerHTML = decisionItems.length
    ? renderLimitedRows(decisionItems, renderTodayDecisionItem, { limit: 5, moreTarget: 'data-view-target="tasks"' })
    : `<div class="attention-empty"><strong>Критичных сигналов нет</strong><span>На сейчас ничего срочного не найдено.</span></div>`;
  qs("#todayMaterials").innerHTML = riskyMaterials.length
    ? renderLimitedRows(riskyMaterials, renderTodayMaterialCard, { limit: 5, moreTarget: 'data-view-target="materials"' })
    : `<div class="empty-state"><strong>Заявок под риском нет</strong><p class="muted">Заявки появятся здесь, когда прораб или руководитель запросит материалы.</p>${canView("materials") ? `<button class="secondary tiny" type="button" data-view-target="materials">Открыть материалы</button>` : ""}</div>`;
  qs("#todayComments").innerHTML = recentComments.length
    ? renderLimitedRows(
        recentComments,
          (row) => `
          <button class="row clickable" type="button" ${notificationTargetAttrs(row)}>
            <strong>${escapeHtml(row.title || "Событие")}</strong>
            <div class="muted">${escapeHtml(row.project_title || "без объекта")} · ${formatDateRu(row.created_at)}</div>
            <p>${escapeHtml(row.text || "")}</p>
          </button>`,
        { limit: 5, moreTarget: 'data-view-target="dashboard"' }
      )
    : `<p class="muted">Новых комментариев за 24 часа нет.</p>`;
  qs("#todayObjects").innerHTML = activeProjects.length
    ? renderLimitedRows(activeProjects, (project) => renderTodayObjectCard(project, roleTasks, roleMaterialRows), { limit: 5, moreTarget: 'data-view-target="projects"' })
    : `<p class="muted">Активных объектов пока нет.</p>`;
  qs("#todayNoPhoto").innerHTML = noPhotoProjects.length
    ? renderLimitedRows(
        noPhotoProjects,
          (project) => `
          <button class="row clickable" type="button" data-open-project="${project.id}">
            <strong>${escapeHtml(project.title)}</strong>
            <div class="muted">последний фотоотчёт: ${latestPhotoReportDate(project.id) ? formatDateRu(latestPhotoReportDate(project.id)) : "не найден"}</div>
          </button>`,
        { limit: 5, moreTarget: 'data-view-target="photos"' }
      )
    : `<p class="muted">По всем активным объектам есть фотоотчёт за сегодня.</p>`;
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
  rowsNode.innerHTML = jobs.length
    ? jobs.map(renderEstimateJobRow).join("")
    : `<p class="muted">Сметных заданий пока нет. Нажмите “Добавить задание”, чтобы зафиксировать входящую смету в работе.</p>`;
}

function notificationTargetAttrs(row) {
  if (row.related_type === "material_request_batch" && row.related_id) return `data-open-material-batch="batch-${row.related_id}"`;
  if (row.related_type === "task" || row.related_type === "tasks") return `data-view-target="tasks"`;
  if (row.related_type === "estimate_job") return `data-view-target="estimates"`;
  if (row.related_type === "variation") return `data-view-target="variations"`;
  if (row.project_id) return `data-open-project="${row.project_id}"`;
  return `data-view-target="dashboard"`;
}

function signalTypeKey(row) {
  const title = String(row.title || "").toLowerCase();
  if (/материал|закуп|заявк/.test(title)) return "материалы вне основной сметы";
  if (/просроч/.test(title)) return "просроченная задача";
  if (/возвращ/.test(title)) return "возвращённая задача";
  if (/фото/.test(title)) return "нет фотоотчёта";
  if (/допработ|отклон/.test(title)) return "новая допработа";
  if (/смет/.test(title)) return "нужна проверка сметчика";
  if (/ответствен/.test(title)) return "нет ответственного";
  if (/срок/.test(title)) return "задача без срока";
  const relatedType = String(row.related_type || "").toLowerCase();
  const relatedLabels = {
    task: "Задача",
    tasks: "Задача",
    material: "Материалы вне основной сметы",
    materials: "Материалы вне основной сметы",
    material_request: "Материалы вне основной сметы",
    material_requests: "Материалы вне основной сметы",
    photo: "Нет фотоотчёта",
    photo_report: "Нет фотоотчёта",
    photo_reports: "Нет фотоотчёта",
    blocker: "Блокер",
    blockers: "Блокер",
    object_remark: "Замечание",
    object_remarks: "Замечание",
    variation: "Допработа",
    variations: "Допработа",
    estimate: "Смета",
    estimate_job: "Смета",
  };
  return relatedLabels[relatedType] || row.title || "Сигнал";
}

function normalizeSignalPreviewText(row) {
  const title = String(row.title || "Событие").trim();
  let text = String(row.text || "").trim();
  if (text.toLowerCase().startsWith(title.toLowerCase())) {
    text = text.slice(title.length).replace(/^[:\s\-—.]+/, "").trim();
  }
  return normalizePositionPluralText(text || title);
}

function normalizePositionPluralText(text) {
  return String(text || "").replace(/\b(\d+)\s+позиций\b/gi, (_, count) => positionsLabel(Number(count)));
}

function signalPreviewEntries(items = []) {
  const groups = new Map();
  items.forEach((row) => {
    const text = normalizeSignalPreviewText(row);
    if (!groups.has(text)) groups.set(text, { text, count: 0 });
    groups.get(text).count += 1;
  });
  const entries = [...groups.values()];
  const visible = entries.slice(0, 3).map((entry) => entry.text);
  let hidden = 0;
  entries.slice(0, 3).forEach((entry) => {
    hidden += Math.max(0, entry.count - 1);
  });
  entries.slice(3).forEach((entry) => {
    hidden += entry.count;
  });
  return { visible, hidden };
}

function pluralRu(count, one, few, many) {
  const value = Math.abs(Number(count || 0));
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function positionsLabel(count) {
  return `${count} ${pluralRu(count, "позиция", "позиции", "позиций")}`;
}

window.__konturDedupeSignals = dedupeSignals;
window.__konturSignalPreviewEntries = signalPreviewEntries;

function dedupeSignals(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const day = dateOnly(row.created_at) || "без даты";
    const type = signalTypeKey(row);
    const sourceId = normalizeSignalPreviewText(row).toLowerCase();
    const key = `${row.project_id || "general"}:${type}:${day}:${row.related_type || ""}:${sourceId}`;
    if (!map.has(key)) {
      map.set(key, {
        ...row,
        signal_key: key,
        signal_type: type,
        signal_day: day,
        rows: [],
        unread: 0,
      });
    }
    const group = map.get(key);
    group.rows.push(row);
    if (!row.is_read) group.unread += 1;
  });
  return [...map.values()].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

function signalStatus(row) {
  if (row.status) return row.status;
  if (row.unread) return "new";
  return row.is_read ? "resolved" : "in_work";
}

function renderSignalRow(signal) {
  const items = signal.rows || [signal];
  const first = items[0] || signal;
  const preview = signalPreviewEntries(items);
  return `
    <button class="row clickable notification-row signal-row" ${notificationTargetAttrs(first)} data-testid="signal-card">
      <div class="stack-line">
        <strong>[${escapeHtml(signal.signal_type || "Сигнал")}] ${escapeHtml(signal.project_title || "Без объекта")}</strong>
        ${pill(statusLabel(signalStatus(signal)), statusLevel(signalStatus(signal)))}
      </div>
      <div class="muted"><span data-testid="signal-group-count">${positionsLabel(items.length)}</span> · создано ${formatDateRu(signal.signal_day || signal.created_at)}</div>
      <div class="signal-preview">
        ${preview.visible.map((text) => `<span>${escapeHtml(text)}</span>`).join("")}
        ${preview.hidden ? `<span class="muted">ещё ${positionsLabel(preview.hidden)}</span>` : ""}
      </div>
    </button>`;
}

async function renderNotifications() {
  const rows = await api("/api/notifications");
  if (!rows.length) {
    qs("#notificationRows").innerHTML = `<p class="muted">Уведомлений пока нет.</p>`;
    return;
  }
  const signals = dedupeSignals(rows);
  const groups = signals.reduce((acc, row) => {
    const key = row.project_id ? `project-${row.project_id}` : "general";
    if (!acc[key]) {
      acc[key] = {
        key,
        title: row.project_title || "Без объекта",
        unread: 0,
        rows: [],
      };
    }
    if (row.unread) acc[key].unread += row.unread;
    else if (!row.is_read) acc[key].unread += 1;
    acc[key].rows.push(row);
    return acc;
  }, {});
  const groupRows = Object.values(groups)
    .sort((a, b) => b.rows.length - a.rows.length || a.title.localeCompare(b.title, "ru"))
    .map((group, index) => {
      const open = state.notificationGroupsOpen[group.key] ?? index === 0;
      return `
        <details class="notification-group" data-notification-group="${group.key}" ${open ? "open" : ""}>
          <summary>
            <span>
              <strong>${escapeHtml(group.title)}</strong>
              <small>${group.rows.length} событий${group.unread ? ` · новых: ${group.unread}` : ""}</small>
            </span>
            ${group.unread ? pill(`${group.unread} новых`, "warning") : ""}
          </summary>
          <div class="notification-group-list">
            ${group.rows
              .slice(0, 8)
              .map(renderSignalRow)
              .join("")}
          </div>
        </details>`;
    })
    .join("");
  qs("#notificationRows").innerHTML = `
    <details class="inline-collapsible notification-collapsible" ${state.notificationsOpen ? "open" : ""}>
      <summary>Последние события: ${rows.length}</summary>
      <div class="notification-groups">${groupRows}</div>
    </details>`;
  qs(".notification-collapsible")?.addEventListener("toggle", (event) => {
    state.notificationsOpen = event.currentTarget.open;
  });
  qsa("[data-notification-group]").forEach((details) => {
    details.addEventListener("toggle", (event) => {
      state.notificationGroupsOpen[event.currentTarget.dataset.notificationGroup] = event.currentTarget.open;
    });
  });
}

function mediaPreviewLink(doc) {
  if (!doc) return "";
  const href = `/api/documents/${doc.id}/download`;
  const title = escapeHtml(doc.file_name || doc.title || "Файл");
  const mime = String(doc.mime_type || "");
  if (mime.startsWith("image/")) {
    return `<a class="media-thumb" href="${href}" data-media-preview="image" data-media-url="${href}" data-media-title="${title}" data-media-mime="${escapeHtml(mime)}"><span class="media-thumb-placeholder">Фото</span><span>${title}</span></a>`;
  }
  if (mime.startsWith("video/")) {
    return `<a class="media-thumb video" href="${href}" data-media-preview="video" data-media-url="${href}" data-media-title="${title}" data-media-mime="${escapeHtml(mime)}"><span>Видео</span><small>${title}</small></a>`;
  }
  return `<a class="media-thumb file" href="${href}" target="_blank" rel="noopener"><span>${title}</span></a>`;
}

function closeMediaPreview() {
  const dialog = qs("#mediaPreviewDialog");
  const body = qs("#mediaPreviewBody");
  if (dialog?.open) dialog.close();
  if (body) body.innerHTML = "";
  state.mediaPreview = { items: [], index: 0, touchX: null };
}

function mediaPreviewItemFromLink(link) {
  return {
    href: link.dataset.mediaUrl || link.getAttribute("href") || "",
    title: link.dataset.mediaTitle || link.textContent?.trim() || "Просмотр файла",
    mime: link.dataset.mediaMime || "",
    kind: link.dataset.mediaPreview || "",
  };
}

function renderMediaPreview() {
  const dialog = qs("#mediaPreviewDialog");
  const titleNode = qs("#mediaPreviewTitle");
  const body = qs("#mediaPreviewBody");
  const originalLink = qs("#mediaPreviewOpenOriginal");
  const counter = qs("#mediaPreviewCounter");
  const prevButton = qs("#mediaPreviewPrev");
  const nextButton = qs("#mediaPreviewNext");
  const items = state.mediaPreview.items || [];
  const index = Math.min(Math.max(Number(state.mediaPreview.index || 0), 0), Math.max(items.length - 1, 0));
  const item = items[index];
  if (!item || !item.href || !dialog || !body) return;
  const safeTitle = item.title || "Просмотр файла";
  const mediaKind = item.kind || (String(item.mime || "").startsWith("video/") ? "video" : "image");
  state.mediaPreview.index = index;
  titleNode.textContent = safeTitle;
  if (counter) counter.textContent = items.length > 1 ? `${index + 1} / ${items.length}` : "1 / 1";
  if (prevButton) prevButton.disabled = items.length <= 1;
  if (nextButton) nextButton.disabled = items.length <= 1;
  if (originalLink) originalLink.href = item.href;
  body.innerHTML =
    mediaKind === "video"
      ? `<video src="${item.href}" controls playsinline preload="metadata"></video>`
      : `<img src="${item.href}" alt="${escapeHtml(safeTitle)}" />`;
}

function openMediaPreview({ href, title, mime, kind, items = [], index = 0 }) {
  const dialog = qs("#mediaPreviewDialog");
  const body = qs("#mediaPreviewBody");
  if (!href || !dialog || !body) {
    window.open(href || "#", "_blank", "noopener");
    return;
  }
  const galleryItems = items.length ? items : [{ href, title, mime, kind }];
  state.mediaPreview = { items: galleryItems, index, touchX: null };
  renderMediaPreview();
  if (!dialog.open) dialog.showModal();
}

function moveMediaPreview(delta) {
  const items = state.mediaPreview.items || [];
  if (items.length <= 1) return;
  state.mediaPreview.index = (Number(state.mediaPreview.index || 0) + delta + items.length) % items.length;
  renderMediaPreview();
}

function renderPhotoReportCard(report) {
  const attachments = (report.attachments || []).filter((doc) => String(doc.mime_type || "").startsWith("image/") || String(doc.mime_type || "").startsWith("video/"));
  return `
    <article class="row photo-report-card" data-testid="photo-report-card">
      <div class="photo-report-main">
        <div class="stack-line">
          <strong>${escapeHtml(report.project_title || "Объект не указан")}</strong>
          ${pill(statusLabel(report.status || "review"), statusLevel(report.status || "review"))}
          ${pill(formatDateRu(report.report_date), "blue")}
        </div>
        <div class="muted">автор: ${escapeHtml(report.author_name || "не указан")} · этап: ${escapeHtml(report.stage || "не указан")} · зоны: ${escapeHtml(report.zones || "не указаны")}</div>
        ${report.comment ? `<p>${escapeHtml(report.comment)}</p>` : ""}
      </div>
      <div class="media-grid">${attachments.length ? attachments.map(mediaPreviewLink).join("") : `<span class="muted">Фото/видео не прикреплены.</span>`}</div>
    </article>`;
}

function projectsWithoutTodayPhoto() {
  return roleScopedProjects(state.projects)
    .filter((project) => project.status !== "archived")
    .filter((project) => !isTodayDate(latestPhotoReportDate(project.id)));
}

function renderPhotoEmptyState(projects = projectsWithoutTodayPhoto()) {
  const count = projects.length;
  return `
    <section class="empty-state photo-empty-state">
      <strong>Фотоотчётов пока нет</strong>
      <p>По активным объектам сегодня нет ${count} фотоотчёт${count === 1 ? "а" : count >= 2 && count <= 4 ? "ов" : "ов"}.</p>
      ${
        count
          ? `<div class="list compact-empty-list">${projects
              .slice(0, 8)
              .map((project) => `
                <div class="row empty-action-row">
                  <button class="clickable empty-action-main" type="button" data-open-project="${project.id}">
                    <strong>${escapeHtml(project.title || "Объект")}</strong>
                    <span class="muted">последний фотоотчёт: ${latestPhotoReportDate(project.id) ? formatDateRu(latestPhotoReportDate(project.id)) : "не найден"}</span>
                  </button>
                  ${canView("photos") ? `<button class="secondary tiny" type="button" data-mobile-action="photo" data-project-context="${project.id}">Добавить</button>` : `<button class="secondary tiny" type="button" data-open-project="${project.id}">Запросить</button>`}
                </div>`)
              .join("")}</div>`
          : `<p class="muted">По всем активным объектам есть фотоотчёт за сегодня.</p>`
      }
    </section>`;
}

function renderRemarkEmptyState() {
  return `
    <section class="empty-state remark-empty-state">
      <strong>Замечаний по объектам пока нет</strong>
      <p>Здесь будут строительные замечания: дефекты, переделки, контроль качества.</p>
      <div class="remark-example-flow">
        <span>Фото до</span>
        <span>Описание</span>
        <span>Ответственный</span>
        <span>Срок</span>
        <span>Фото после</span>
        <span>Принято</span>
      </div>
      ${canView("object_remarks") ? `<button class="secondary tiny" type="button" data-mobile-action="remark">Создать замечание</button>` : ""}
    </section>`;
}

async function renderPhotoReports() {
  const rowsNode = qs("#photoReportRows");
  if (!rowsNode) return;
  if (!canView("photos")) {
    rowsNode.innerHTML = "";
    return;
  }
  const reports = state.photoReports || [];
  rowsNode.innerHTML = reports.length
    ? reports.map(renderPhotoReportCard).join("")
    : renderPhotoEmptyState();
}

function remarkPhotoBlock(title, doc) {
  if (!doc?.id) return "";
  return `
    <div class="remark-photo">
      <span class="muted">${title}</span>
      ${mediaPreviewLink(doc)}
    </div>`;
}

function renderObjectRemarkCard(remark) {
  return `
    <article class="row object-remark-card">
      <div class="object-remark-main">
        <div class="stack-line">
          <strong>${escapeHtml(remark.project_title || "Объект не указан")}</strong>
          ${pill(statusLabel(remark.status), statusLevel(remark.status))}
          ${remark.due_date ? pill(formatDateRu(remark.due_date), levelByDate(remark.due_date)) : pill("без срока", "")}
        </div>
        <div class="muted">зона: ${escapeHtml(remark.zone || "не указана")} · ответственный: ${escapeHtml(remark.responsible_name || "не назначен")} · проверил: ${escapeHtml(remark.checked_by_name || "не указан")}</div>
        <p>${escapeHtml(remark.description || "Без описания")}</p>
      </div>
      <div class="remark-media-grid">
        ${remarkPhotoBlock("Фото до", remark.photo_before)}
        ${remarkPhotoBlock("Фото после", remark.photo_after)}
      </div>
    </article>`;
}

async function renderObjectRemarks() {
  const rowsNode = qs("#objectRemarkRows");
  const statsNode = qs("#objectRemarkStats");
  if (!rowsNode || !statsNode) return;
  if (!canView("object_remarks")) {
    rowsNode.innerHTML = "";
    statsNode.innerHTML = "";
    return;
  }
  const remarks = state.objectRemarks || [];
  const stats = [
    ["all", "Все", remarks.length, ""],
    ["new", "Новые", remarks.filter((item) => item.status === "new").length, "warning"],
    ["in_progress_task", "В работе", remarks.filter((item) => item.status === "in_progress_task").length, "blue"],
    ["returned", "Возвращены", remarks.filter((item) => item.status === "returned").length, "danger"],
    ["accepted", "Приняты", remarks.filter((item) => item.status === "accepted" || item.status === "closed").length, "success"],
  ].filter(([, , count], index) => index === 0 || count > 0);
  statsNode.innerHTML = stats
    .map(
      ([key, title, count, level]) => `
      <button class="task-stat ${level}" type="button" data-remark-filter="${key}">
        <span>${title}</span>
        <strong>${count}</strong>
      </button>`
    )
    .join("");
  const filtered = state.remarkFilter && state.remarkFilter !== "all" ? remarks.filter((item) => item.status === state.remarkFilter) : remarks;
  rowsNode.innerHTML = filtered.length
    ? filtered.map(renderObjectRemarkCard).join("")
    : renderRemarkEmptyState();
}

async function renderProjects() {
  const projects = state.projectListMode === "archive" ? state.archivedProjects : state.projects;
  qs("#projectListTitle").textContent = state.projectListMode === "archive" ? "Архив объектов" : "Список объектов";
  qsa("[data-project-list]").forEach((button) => button.classList.toggle("active", button.dataset.projectList === state.projectListMode));
  const rowsNode = qs("#projectRows");
  if (rowsNode) {
    rowsNode.classList.toggle("project-table-mode", state.projectDisplayMode === "table");
    rowsNode.classList.toggle("project-card-mode", state.projectDisplayMode !== "table");
  }
  qsa("[data-project-display]").forEach((button) => button.classList.toggle("active", button.dataset.projectDisplay === state.projectDisplayMode));
  qs("#projectRows").innerHTML = projects.length
    ? projects
        .map(
          (project) => `
          <div class="row clickable" data-open-project="${project.id}" data-testid="object-card">
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
    ["Прогноз с нерешенным сверхбюджетом", forecastTotal],
  ];
  if (materialActual > 0) rows.push(["Факт закупок по заявкам", materialActual]);
  rows.push(["Срок", project.planned_end_date || "не задан"]);
  return `
    <div class="detail-grid financial-summary-grid">
      ${rows
        .map(([title, value]) => `<div class="info"><span>${title}</span><strong>${typeof value === "number" ? money(value) : value}</strong></div>`)
        .join("")}
    </div>`;
}

function renderProjectMaterialHistory(project) {
  const batches = buildMaterialBatches(project.materials || []);
  if (!batches.length) return "";
  return `
    <section class="project-history-section">
      <div class="stack-line project-history-head">
        <h3>Заявки на материалы</h3>
        ${pill(`${batches.length} шт.`, "blue")}
      </div>
      <div class="project-history-batches">
        ${batches
          .map((batch) => {
            const activeItems = materialActiveItems(batch);
            const removedItems = materialRemovedItems(batch);
            const totalActual = activeItems.reduce((sum, item) => sum + Number(item.actual_total_amount || 0), 0);
            return `
              <details class="history-batch-card">
                <summary>
                  <span>
                    <strong>${escapeHtml(materialBatchTitle(batch))}</strong>
                    <small>Заказал: ${escapeHtml(batch.creator_name || "не указано")} · позиций: ${activeItems.length}${removedItems.length ? ` · удалено при правке: ${removedItems.length}` : ""}</small>
                  </span>
                  <span class="stack-line">
                    ${pill(statusLabel(materialPipelineStatus(batch)), materialPipelineLevel(batch))}
                    ${pill(urgencyLabel(batch.delivery_urgency), urgencyLevel(batch.delivery_urgency))}
                  </span>
                </summary>
                <div class="history-batch-body">
                  <div class="history-batch-meta">
                    <span>Желаемая доставка: <strong>${escapeHtml(batch.needed_at || "не указана")}</strong></span>
                    <span>Сметная сумма: <strong>${money(batch.total_amount)}</strong></span>
                    ${totalActual ? `<span>Факт закупки: <strong>${money(totalActual)}</strong></span>` : ""}
                  </div>
                  ${batch.comment ? `<p><strong>Комментарий прораба:</strong> ${escapeHtml(batch.comment)}</p>` : ""}
                  ${batch.revision_comment ? `<p class="history-warning"><strong>Возврат снабжения:</strong> ${escapeHtml(batch.revision_comment)}</p>` : ""}
                  ${batch.foreman_response ? `<p><strong>Ответ прораба:</strong> ${escapeHtml(batch.foreman_response)}</p>` : ""}
                  ${batch.procurement_comment ? `<p><strong>Комментарий снабжения:</strong> ${escapeHtml(batch.procurement_comment)}</p>` : ""}
                  ${batch.scheduled_delivery_date ? `<p><strong>Назначенная доставка:</strong> ${formatDateRu(batch.scheduled_delivery_date)}</p>` : ""}
                  ${batch.receipt_comment ? `<p><strong>Приемка:</strong> ${escapeHtml(batch.receipt_comment)}</p>` : ""}
                  ${materialReceiptAttachment(batch)}
                  <div class="table history-material-items">
                    ${activeItems
                      .map(
                        (item) => `
                          <div class="row estimate-material-row${materialItemChangeClass(item)}">
                            <div class="material-main">
                              <strong>${escapeHtml(item.title)}</strong>
                              <div class="muted">${escapeHtml(item.estimate_section || "без раздела")}</div>
                              ${item.comment ? `<div class="muted">${escapeHtml(item.comment)}</div>` : ""}
                            </div>
                            <div class="stack-line">
                              ${pill(escapeHtml(`${item.requested_quantity || item.estimated_quantity || 0} ${item.requested_unit || item.estimate_material_unit || ""}`), "blue")}
                              ${pill(materialBasisLabel(item.basis_type), materialBasisLevel(item.basis_type))}
                              ${pill(money(item.total_amount), "success")}
                              ${materialActualTotal(item) ? pill(`Закупка: ${money(materialActualTotal(item))}`, materialActualOverrun(item) ? "danger" : "blue") : ""}
                            </div>
                          </div>`
                      )
                      .join("")}
                  </div>
                  <div class="form-actions">
                    <button class="secondary tiny" type="button" data-open-material-batch="${batch.key}">Открыть заявку</button>
                  </div>
                </div>
              </details>`;
          })
          .join("")}
      </div>
    </section>`;
}

function renderProjectEvents(events = []) {
  if (!events.length) return `<p class="muted">Событий пока нет.</p>`;
  return `
    <section class="project-history-section">
      <div class="stack-line project-history-head">
        <h3>История действий</h3>
        ${pill(`${events.length} записей`, "blue")}
      </div>
      <div class="list project-event-list">
        ${events
          .map(
            (event) => `
              <article class="row project-event-row">
                <div class="stack-line">
                  <strong>${escapeHtml(eventType(event.type))}</strong>
                  ${pill(event.related_type === "material_request" ? "материалы" : escapeHtml(event.related_type || "объект"), event.related_type === "material_request" ? "blue" : "")}
                </div>
                <p>${escapeHtml(event.text || "").replace(/\n/g, "<br>")}</p>
                <div class="muted">${escapeHtml(event.author_name || "автор не указан")} · ${formatDateRu(event.created_at) || event.created_at || ""}</div>
              </article>`
          )
          .join("")}
      </div>
    </section>`;
}

function renderProjectHistory(project) {
  return `
    <div class="project-history">
      ${renderProjectMaterialHistory(project)}
      ${renderProjectEvents(project.events || [])}
    </div>`;
}

function projectDetailTasks(project) {
  return project.tasks || [];
}

function projectDetailBatches(project) {
  return buildMaterialBatches(project.materials || []);
}

function projectLatestPhoto(project) {
  const reports = project.photo_reports || [];
  return reports
    .filter(photoReportCountsAsPresent)
    .map((report) => dateOnly(report.report_date || report.created_at))
    .filter(Boolean)
    .sort()
    .pop() || "";
}

function projectAttentionItems(project) {
  const tasks = projectDetailTasks(project);
  const batches = projectDetailBatches(project);
  const remarks = project.object_remarks || [];
  const blockers = (project.blockers || []).filter((blocker) => !["resolved", "closed"].includes(blocker.status));
  const items = [];
  const overdueTasks = tasks.filter(taskCountsAsOverdue);
  const returnedTasks = tasks.filter((task) => taskStatusKey(task) === "returned");
  const riskyMaterials = batches.filter(materialIsRisky);
  const openRemarks = remarks.filter((remark) => !["accepted", "closed"].includes(remark.status));
  if (blockers.length) items.push({ title: "Открытые блокеры", count: blockers.length, level: "danger", tab: "overview" });
  if (overdueTasks.length) items.push({ title: "Просроченные задачи", count: overdueTasks.length, level: "danger", tab: "tasks" });
  if (returnedTasks.length) items.push({ title: "Возвращённые задачи", count: returnedTasks.length, level: "warning", tab: "tasks" });
  if (riskyMaterials.length) items.push({ title: "Материалы с проблемами", count: riskyMaterials.length, level: "danger", tab: "materials" });
  if (openRemarks.length) items.push({ title: "Незакрытые замечания", count: openRemarks.length, level: "warning", tab: "remarks" });
  return items;
}

function renderProjectHero(project) {
  const tasks = projectDetailTasks(project);
  const batches = projectDetailBatches(project);
  const latestPhoto = projectLatestPhoto(project);
  const openTasks = tasks.filter(isOpenTask);
  const overdueTasks = tasks.filter(taskCountsAsOverdue);
  const riskyMaterials = batches.filter(materialIsRisky);
  const openRemarks = (project.object_remarks || []).filter((remark) => !["accepted", "closed"].includes(remark.status));
  const blockers = (project.blockers || []).filter((blocker) => !["resolved", "closed"].includes(blocker.status)).length;
  return `
    <section class="project-hero">
      <div class="project-hero-main" data-testid="object-summary">
        <div class="stack-line">
          <h2>${escapeHtml(project.title || "Объект")}</h2>
          ${pill(statusLabel(project.status), statusLevel(project.status))}
        </div>
        <div class="project-hero-meta">
          <span>Ответственный: <strong>${escapeHtml(project.foreman_name || "прораб не назначен")}</strong></span>
          <span>Этап: <strong>${statusLabel(project.stage || project.status)}</strong></span>
          <span>Ближайший дедлайн: <strong>${project.planned_end_date ? formatDateRu(project.planned_end_date) : "не задан"}</strong></span>
          <span>Последний фотоотчёт: <strong>${latestPhoto ? formatDateRu(latestPhoto) : "не найден"}</strong></span>
        </div>
      </div>
      <div class="project-hero-stats">
        <div class="info"><span>Открытые задачи</span><strong>${openTasks.length}</strong></div>
        <div class="info ${overdueTasks.length ? "danger" : ""}"><span>Просрочено</span><strong>${overdueTasks.length}</strong></div>
        <div class="info ${blockers ? "danger" : ""}"><span>Блокеры</span><strong>${blockers}</strong></div>
        <div class="info ${riskyMaterials.length ? "warning" : ""}"><span>Материалы под риском</span><strong>${riskyMaterials.length}</strong></div>
        <div class="info ${openRemarks.length ? "warning" : ""}"><span>Открытые замечания</span><strong>${openRemarks.length}</strong></div>
      </div>
    </section>`;
}

function renderProjectAttention(project) {
  const items = projectAttentionItems(project);
  if (!items.length) {
    return `
      <section class="project-attention" data-testid="object-attention-block">
        <strong>Что требует внимания</strong>
        <p class="muted">Просрочек, блокеров, возвращённых задач и проблемных материалов не найдено.</p>
      </section>`;
  }
  return `
    <section class="project-attention" data-testid="object-attention-block">
      <strong>Что требует внимания</strong>
      <div class="project-attention-list">
        ${items
          .map(
            (item) => `
            <button class="attention-chip ${item.level}" type="button" data-project-tab="${item.tab}">
              <span>${escapeHtml(item.title)}</span>
              <strong>${item.count}</strong>
            </button>`
          )
          .join("")}
      </div>
    </section>`;
}

function renderProjectQuickActions() {
  const actions = [
    ['data-project-tab="tasks"', "Открыть задачи"],
    ['data-project-tab="photos"', "Добавить фотоотчёт"],
    ['data-project-tab="remarks"', "Создать замечание"],
    ['data-view-target="materials"', "Запросить материал"],
    ['data-project-tab="documents"', "Открыть документы"],
  ];
  return `
    <section class="project-quick-actions" data-testid="object-quick-actions" data-legacy-testid="object-actions">
      <strong>Ближайшие действия</strong>
      <div class="project-action-list">
        ${actions.map(([attrs, title]) => `<button class="secondary tiny" type="button" ${attrs}>${title}</button>`).join("")}
      </div>
    </section>`;
}

function renderProjectOverview(project) {
  const blockers = (project.blockers || []).filter((blocker) => !["resolved", "closed"].includes(blocker.status));
  return `
    <div class="detail-grid">
      <div class="info"><span>Статус</span><strong>${statusLabel(project.status)}</strong></div>
      <div class="info"><span>Ответственный</span><strong>${project.foreman_name || "не назначен"}</strong></div>
      <div class="info"><span>Этап</span><strong>${statusLabel(project.stage || project.status)}</strong></div>
      <div class="info"><span>Срок</span><strong>${project.planned_end_date ? formatDateRu(project.planned_end_date) : "не задан"}</strong></div>
    </div>
    ${
      blockers.length
        ? `<section class="workflow-panel compact-workflow">
            <h3>Блокеры объекта</h3>
            <div class="list">
              ${blockers
                .slice(0, 5)
                .map(
                  (blocker) => `
                  <div class="row blocker-row" data-testid="blocker-card">
                    <div class="stack-line"><strong>${escapeHtml(blocker.title || "Блокер")}</strong><span data-testid="blocker-type-badge">${pill(statusLabel(blocker.blocker_type || "other"), statusLevel(blocker.blocker_type || "warning"))}</span><span data-testid="blocker-status-badge">${pill(statusLabel(blocker.status || "open"), statusLevel(blocker.status || "open"))}</span><span data-testid="blocker-severity-badge">${pill(statusLabel(blocker.severity || "medium"), blocker.severity === "critical" || blocker.severity === "high" ? "danger" : "warning")}</span></div>
                    <div class="muted">ответственный: ${escapeHtml(blocker.responsible_name || "не назначен")} · срок: ${blocker.due_date ? formatDateRu(blocker.due_date) : "без срока"}</div>
                  </div>`
                )
                .join("")}
            </div>
          </section>`
        : ""
    }`;
}

function renderProjectTaskList(tasks = []) {
  if (!tasks.length) return `<p class="muted">Задач по объекту пока нет.</p>`;
  return `<div class="list">${tasks.map(renderCompactTaskRow).join("")}</div>`;
}

function renderCompactTaskRow(task) {
  return `
    <button class="row clickable compact-task-card" type="button" data-open-task="${task.id}" data-testid="task-card">
      <div class="compact-task-title">
        <span data-testid="task-type-badge">${pill(taskTypeLabel(task), taskTypeLevel(task))}</span>
        <strong data-testid="task-title">${escapeHtml(taskDisplayTitle(task))}</strong>
      </div>
      <div class="compact-task-meta" data-testid="task-meta">
        <span>${escapeHtml(task.project_title || "объект")}</span>
        <span>ответственный: ${escapeHtml(task.assignee_name || "не назначен")}</span>
        <span>срок: ${task.due_date ? formatDateRu(task.due_date) : "без срока"}</span>
      </div>
      <div class="stack-line">
        <span data-testid="task-status-badge">${pill(statusLabel(taskStatusKey(task)), taskStatusLevel(taskStatusKey(task)))}</span>
        <span data-testid="task-priority-badge">${pill(taskPriorityLabel(task.priority), taskPriorityLevel(task.priority))}</span>
      </div>
    </button>`;
}

function renderProjectMaterialList(project) {
  const batches = projectDetailBatches(project);
  if (!batches.length) return `<p class="muted">Материалов и заявок по объекту пока нет.</p>`;
  return `
    <div class="list">
      ${batches
        .map(
          (batch) => `
          <button class="row clickable project-material-card" type="button" data-open-material-batch="${batch.key}">
            <div class="stack-line">
              <strong>${escapeHtml(materialBatchTitle(batch))}</strong>
              ${pill(statusLabel(materialPipelineStatus(batch)), materialPipelineLevel(batch))}
            </div>
            ${renderMaterialPipeline(batch)}
            <div class="muted">позиций: ${materialActiveItems(batch).length} · кто запросил: ${escapeHtml(batch.creator_name || "не указан")} · срок: ${batch.needed_at ? formatDateRu(batch.needed_at) : "не указан"}</div>
            <div class="muted">смета: ${money(batch.total_amount)}${batch.actual_purchase_amount ? ` · факт закупки: ${money(batch.actual_purchase_amount)}` : ""}</div>
            ${batch.procurement_comment ? `<p>${escapeHtml(batch.procurement_comment)}</p>` : ""}
          </button>`
        )
        .join("")}
    </div>`;
}

async function renderProjectDetail(projectId) {
  const project = await api(`/api/projects/${projectId}`);
  state.selectedProjectId = project.id;
  const docs = visibleDocuments(project.documents || []);
  const tabs = projectTabs();
  if (!tabs.includes(state.selectedProjectTab)) state.selectedProjectTab = tabs[0] || "overview";
  const tabData = {
    overview: renderProjectOverview(project),
    tasks: renderProjectTaskList(project.tasks || []),
    materials: `<p class="muted compact-note">Материалы здесь берутся только из файла материалов Сметтера и заявок. Файл “Задание на работы” сюда не попадает.</p>` + renderProjectMaterialList(project),
    works: `<p class="muted compact-note">Работы здесь берутся только из файла “Задание на работы”. Материалы из нижней части этого файла игнорируются.</p>` + renderSmallList(
      [...(project.works || []).map((item) => ({ ...item, kind: "plan" })), ...(project.extra_works || []).map((item) => ({ ...item, kind: "extra" }))],
      (item) =>
        item.kind === "extra"
          ? `${item.title} · ${item.quantity || 0} ${item.unit || ""} · ${workReasonLabel(item.reason)}`
          : `${item.title} · ${item.estimated_quantity || 0} ${item.unit || ""} · ${money(item.total_price)}`
    ),
    variations: canViewFinancials() ? renderSmallList(project.variations, (item) => `${item.title} · ${variationType(item.type)} · ${money(item.amount)} · ${moneyDecision(item.financial_decision)}`) : `<p class="muted">Финансовые отклонения доступны руководителям и сметчикам.</p>`,
    photos: (project.photo_reports || []).length ? (project.photo_reports || []).map(renderPhotoReportCard).join("") : renderPhotoEmptyState([project]),
    remarks: (project.object_remarks || []).length ? (project.object_remarks || []).map(renderObjectRemarkCard).join("") : renderRemarkEmptyState(),
    documents: renderGroupedProjectDocuments(docs, project.contracts || []),
    events: renderProjectHistory(project),
    finances: canViewFinancials() ? projectFinancialSummaryHtml(project) : `<p class="muted">Финансы доступны руководителям и бухгалтерии.</p>`,
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
    ["contract", renderProjectContractPanel(project)],
    ["workflow", renderProjectWorkflow(project)],
    ["documents", renderDocumentSummary(docs, project.contracts || [])],
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
  const smetterHref = smetterIsUrl ? smetterText : smetterLooksLikeDomain ? `https://${smetterText}` : "";
  const smetterButton = canViewExternalRefs() && smetterText
    ? smetterHref
      ? `<a class="secondary tiny project-smetter-button" href="${escapeAttr(smetterHref)}" target="_blank" rel="noopener noreferrer">Открыть Сметтер</a>`
      : `<span class="pill success">Сметтер: ${escapeHtml(smetterText)}</span>`
    : "";
  const customerInfoHtml = `
    <div class="project-contact-strip">
      <div class="project-contact-main">
        <strong>${escapeHtml(project.customer_name || "Клиент не указан")}</strong>
        <span>${customerHistory} ${customerHistory === 1 ? "объект/договор" : "объектов/договоров"} в истории</span>
      </div>
      <div class="project-contact-actions">
        ${phoneLink ? `<a class="contact-action" href="${escapeAttr(phoneLink)}" title="${escapeAttr(customerPhone)}">Позвонить</a>` : `<span class="muted">Телефон не указан</span>`}
        ${customerEmail ? `<a class="contact-action" href="mailto:${escapeAttr(customerEmail)}" title="${escapeAttr(customerEmail)}">Написать</a>` : `<span class="muted">E-mail не указан</span>`}
        ${mapHref ? `<a class="contact-action map" href="${escapeAttr(mapHref)}" target="_blank" rel="noopener noreferrer">Я.Карты</a>` : `<span class="muted">Локация не указана</span>`}
        ${smetterButton}
      </div>
    </div>`;
  const managerNoteHtml = managerNote
    ? `<section class="manager-note-panel">
        <div class="stack-line"><strong>Вводные менеджера при передаче</strong>${pill(project.sales_manager_name || "Менеджер", "blue")}</div>
        <p>${escapeHtml(managerNote)}</p>
      </section>`
    : "";
  const projectDocsSpotlightHtml = renderProjectDocumentSpotlight(docs);
  qs("#projectDetail").innerHTML = `
    ${renderProjectHero(project)}
    ${renderProjectAttention(project)}
    ${renderProjectQuickActions(project)}
    ${customerInfoHtml}
    ${managerNoteHtml}
    ${projectDocsSpotlightHtml}
    <div class="project-detail-blocks sortable-zone" data-sortable-zone="project-detail-v2">
      ${detailBlocks.filter(([, html]) => String(html || "").trim()).map(([key, html]) => `<div class="project-detail-block" data-sortable-block="${key}">${html}</div>`).join("")}
    </div>
  `;
  initSortableZones(qs("#projectDetail"));
}

function renderProjectEditPanel(project) {
  if (!canEditProject()) {
    if (currentRoleBase() === "ai_auditor") {
      return `<section class="workflow-panel subtle"><p class="muted">Режим аудита: изменения запрещены. Можно просматривать структуру карточки, вкладки и обезличенные данные.</p></section>`;
    }
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

function renderProjectContractPanel(project) {
  if (!canEditProject()) return "";
  return `
    <section class="workflow-panel compact-workflow contract-action-panel">
      <div class="stack-line">
        <h3>Договоры и доп. соглашения</h3>
        ${pill("Материалы и работы можно привязать к доп. соглашению", "blue")}
      </div>
      <div class="form-actions">
        <span class="muted">Добавляйте договор, допсоглашение, материалы и работы по нему из одного окна.</span>
        <button class="primary" type="button" data-add-contract="${project.id}">Добавить договор / доп. соглашение</button>
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
        ${canSubmitProject() ? personalNotifyControl() : ""}
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
        ${personalNotifyControl()}
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
            ${personalNotifyControl()}
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
  data.title = normalizeCustomerBasedTitle(data.customer_name, data.title);
  data.customer_phone = formatRuPhone(data.customer_phone);
  const files = form.elements;
  const materialFile = files.estimate_file_name.files[0];
  const workTaskFile = files.work_task_file.files[0];
  const projectDocFiles = Array.from(files.project_docs_file.files || []);
  data.estimate_file_name = materialFile?.name || form.dataset.existingEstimateFileName || "";
  data.work_task_file_name = workTaskFile?.name || form.dataset.existingWorkTaskFileName || "";
  data.initial_documents = (
    await Promise.all(
      [
        fileDocumentPayload(materialFile, "Файл материалов из Сметтера", "smetter_materials"),
        fileDocumentPayload(workTaskFile, "Задание на работы из Сметтера", "smetter_work_task"),
        fileDocumentPayload(files.contract_file.files[0], "Договор", "contract"),
        fileDocumentPayload(files.estimate_doc_file.files[0], "Смета", "main_estimate"),
        ...projectDocFiles.map((file) => fileDocumentPayload(file, `Проектная документация: ${file.name}`, "project_documentation")),
      ].filter(Boolean)
    )
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
    photos: "Фото",
    remarks: "Замечания",
    variations: "Допработы",
    documents: currentRoleBase() === "foreman" ? "Файлы проекта" : "Документы",
    events: "История",
    finances: "Финансы",
  }[tab];
}

function taskWorkflowBucket(task) {
  const status = taskStatusKey(task);
  if (canActAsTaskUser(task, "assignee") && ["new", "in_progress", "returned"].includes(status)) {
    return { key: "my_action", title: "Мне нужно сделать", hint: "Задачи, где следующий шаг сейчас на вас." };
  }
  if (canActOnTaskAsReviewer(task) && taskIsWaitingCheck(task)) {
    return { key: "my_review", title: "Мне нужно проверить", hint: "Задачи, где исполнитель уже отправил результат." };
  }
  if (canActAsTaskUser(task, "assignee") && taskIsWaitingCheck(task)) {
    return { key: "waiting", title: "Я жду", hint: "Вы уже отправили результат, теперь действие на проверяющем." };
  }
  const project = state.projects.find((item) => Number(item.id) === Number(task.project_id));
  const userId = Number(currentUserId() || 0);
  const ownsProject =
    userId &&
    project &&
    [project.foreman_id, project.construction_manager_id, project.procurement_manager_id, project.estimator_id, project.technical_supervisor_id]
      .map((value) => Number(value || 0))
      .includes(userId);
  if (ownsProject) {
    return { key: "my_project", title: "На моих объектах", hint: "Задачи других сотрудников по объектам, за которые вы отвечаете." };
  }
  if (canActAsTaskUser(task, "creator")) {
    return { key: "created_by_me", title: "Я поставил", hint: "Задачи, которые вы создали и можете контролировать." };
  }
  return { key: "other", title: "Остальные задачи", hint: "Задачи, доступные вашей роли для просмотра." };
}

function renderTaskCard(task) {
  const canReview = taskIsWaitingCheck(task) && canActOnTaskAsReviewer(task);
  const lastComment = latestTaskComment(task);
  const taskKey = `task:${task.id}`;
  return `
    <details class="row task-row task-collapsible" data-collapsible-key="${escapeAttr(taskKey)}"${openAttrForKey(taskKey)} data-testid="task-card">
      <summary class="task-summary">
        <span class="task-summary-main">
          <span class="task-summary-title"><span data-testid="task-type-badge">${pill(taskTypeLabel(task), taskTypeLevel(task))}</span><strong data-testid="task-title">${escapeHtml(taskDisplayTitle(task))}</strong></span>
          <span class="task-summary-meta" data-testid="task-meta">${escapeHtml(task.project_title || "объект не указан")} · ${escapeHtml(task.assignee_name || "ответственный не назначен")} · ${task.due_date ? formatDateRu(task.due_date) : "без срока"} · ${escapeHtml(taskVisibilityReason(task))}</span>
          <span class="stack-line"><span data-testid="task-status-badge">${pill(label(taskStatusKey(task)), taskStatusLevel(taskStatusKey(task)))}</span><span data-testid="task-priority-badge">${pill(taskPriorityLabel(task.priority), taskPriorityLevel(task.priority))}</span></span>
        </span>
      </summary>
      <div class="task-row-body">
      <div class="row-grid">
        <div class="task-main">
          <div class="muted">${task.project_title} · поставил: ${task.creator_name || "не указано"} · создана: ${formatDateRu(task.created_at)}${task.start_date ? ` · начало: ${formatDateRu(task.start_date)}` : ""}${task.contract_title ? ` · ${contractType(task.contract_type)}: ${task.contract_title}` : ""}</div>
          ${taskDisplayDescription(task) ? `<div class="preserve-lines">${escapeHtml(taskDisplayDescription(task))}</div>` : ""}
          ${task.rejection_comment ? `<div class="muted">Комментарий по возврату: ${escapeHtml(task.rejection_comment)}</div>` : ""}
          ${lastComment ? `<div class="task-last-comment"><strong>${escapeHtml(lastComment.actor_name || "Комментарий")}:</strong> ${escapeHtml(lastComment.comment)}</div>` : ""}
        </div>
        <div class="task-people">Ответственный: ${task.assignee_name || "не назначен"}<br /><span class="muted">Принимает: ${task.reviewer_name || task.creator_name || "не назначен"}</span></div>
      </div>
      <div class="task-actions">
        <button class="secondary" type="button" data-open-task="${task.id}">Подробнее</button>
        ${renderTaskNextAction(task)}
        ${canReview ? `<button class="secondary" data-task-action="return" data-task-id="${task.id}">Вернуть</button>` : ""}
        ${canDeleteTask(task) ? `<button class="danger-button" data-task-action="delete" data-task-id="${task.id}">Удалить</button>` : ""}
      </div>
      </div>
    </details>`;
}

function renderTaskWorkflowSections(tasks) {
  const order = ["my_action", "my_review", "waiting", "my_project", "created_by_me", "other"];
  const groups = new Map();
  tasks.forEach((task) => {
    const bucket = taskWorkflowBucket(task);
    if (!groups.has(bucket.key)) groups.set(bucket.key, { ...bucket, tasks: [] });
    groups.get(bucket.key).tasks.push(task);
  });
  return order
    .filter((key) => groups.has(key))
    .map((key) => {
      const group = groups.get(key);
      return `
        <section class="task-workflow-section" data-testid="task-workflow-section" data-task-workflow="${group.key}">
          <div class="task-workflow-head">
            <div>
              <h3>${escapeHtml(group.title)}</h3>
              <p class="muted">${escapeHtml(group.hint)}</p>
            </div>
            ${pill(`${group.tasks.length}`, "blue")}
          </div>
          <div class="task-workflow-list">${group.tasks.map(renderTaskCard).join("")}</div>
        </section>`;
    })
    .join("");
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
          const newCount = project.tasks.filter((task) => ["new", "returned", "waiting_check"].includes(taskStatusKey(task))).length;
          const openCount = project.tasks.filter(isOpenTask).length;
          return `
            <button class="row clickable task-project-row ${state.selectedTaskProjectId === project.id ? "active" : ""}" data-task-project="${project.id}">
              <div class="stack-line"><strong>${project.title}</strong></div>
              <div class="task-project-indicators">${taskProjectIndicatorPills(stats, openCount, newCount)}</div>
            </button>`;
        })
        .join("")
    : `<p class="muted">${currentRoleBase() === "foreman" ? "За этим прорабом пока нет объектов с задачами." : "Задач пока нет."}</p>`;
  qs("#taskStats").innerHTML =
    renderTaskStats(tasks, state.taskFilter, { compact: true }) +
    `<p class="muted task-status-help">Ждёт проверки — исполнитель отправил результат, дальше действие на проверяющем. На доработке — проверяющий вернул задачу исполнителю с комментарием и новым сроком.</p>`;
  const visibleTasks = tasks.filter((task) => taskMatchesFilter(task, state.taskFilter));
  qs("#taskRows").innerHTML = visibleTasks.length
    ? renderTaskWorkflowSections(visibleTasks)
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
    comment: "Комментарий",
    complete: "Выполнена исполнителем",
    accept: "Принята",
    return: "Возвращена на доработку",
    postpone: "Частично / перенесена",
    delete: "Удалена",
  };
  if (task.events?.length) {
    return `<div class="task-timeline">${task.events
      .map(
        (event) => `
          <div class="task-timeline-item">
            <strong>${actionTitle[event.action] || event.action}</strong>
            <span>${formatDateRu(event.created_at)}</span>
            <p class="muted">${[event.actor_name, event.comment, event.due_date ? `срок: ${formatDateRu(event.due_date)}` : ""].filter(Boolean).join(" · ")}</p>
            ${renderTaskEventAttachments(event)}
          </div>`
      )
      .join("")}</div>`;
  }
  const rows = [
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

function taskDiscussionEvents(task) {
  return (task.events || []).filter((event) => event.action === "comment" && (String(event.comment || "").trim() || (event.attachments || []).length));
}

function latestTaskComment(task) {
  return [...taskDiscussionEvents(task)].reverse().find((event) => event.action === "comment") || null;
}

function renderTaskEventAttachments(event) {
  const attachments = event.attachments || [];
  if (!attachments.length) return "";
  return `
    <div class="task-attachments">
      ${attachments
        .map((file) => {
          const href = `/api/documents/${file.id}/download`;
          const fileName = escapeHtml(file.file_name || file.title || "Файл");
          const isImage = String(file.mime_type || "").startsWith("image/");
          return `
            <a class="task-attachment" href="${href}" target="_blank" rel="noopener">
              ${isImage ? `<img src="${href}" alt="${fileName}" />` : ""}
              <span>${fileName}</span>
            </a>`;
        })
        .join("")}
    </div>`;
}

function renderTaskDiscussion(task) {
  const comments = taskDiscussionEvents(task).slice(-8);
  const commentRows = comments.length
    ? comments
        .map((event) => {
          const own = Number(event.actor_id || 0) === Number(currentUserId() || 0);
          return `
            <div class="task-comment ${own ? "own" : ""}">
              <div class="stack-line">
                <strong>${escapeHtml(event.actor_name || "Участник")}</strong>
                ${pill(event.action === "comment" ? "Комментарий" : label(event.status_to || event.action), event.action === "comment" ? "" : taskStatusLevel(event.status_to))}
                <span class="muted">${formatDateRu(event.created_at)}</span>
              </div>
              ${event.comment ? `<p>${escapeHtml(event.comment)}</p>` : ""}
              ${renderTaskEventAttachments(event)}
            </div>`;
        })
        .join("")
    : `<p class="muted">Комментариев по задаче пока нет.</p>`;
  return `
    <section class="workflow-panel task-discussion">
      <div class="panel-head">
        <h3>Обсуждение</h3>
        <span class="muted">Комментарии остаются внутри задачи</span>
      </div>
      <div class="task-comment-list">${commentRows}</div>
      <div class="task-comment-form" data-task-comment-form data-task-id="${task.id}">
        <textarea rows="2" placeholder="Написать комментарий по задаче"></textarea>
        <input type="file" multiple />
        <div class="form-actions compact-actions">
          ${personalNotifyControl()}
          <button class="primary" type="button" data-task-comment-send="${task.id}">Отправить</button>
        </div>
      </div>
    </section>`;
}

function renderTaskActionPanel(task) {
  const status = taskStatusKey(task);
  const canStart = ["new", "returned"].includes(status) && canActOnTaskAsAssignee(task);
  const canSubmit = status === "in_progress" && canActOnTaskAsAssignee(task);
  const canReview = status === "waiting_check" && canActOnTaskAsReviewer(task);
  if (!canStart && !canSubmit && !canReview) return "";
  return `
    <section class="workflow-panel task-action-panel" data-task-action-panel data-task-id="${task.id}">
      <div class="panel-head">
        <h3>Действия по задаче</h3>
        <span class="muted">Каждое действие меняет статус и фиксируется в истории</span>
      </div>
      <label>Комментарий <textarea rows="3" data-task-action-comment placeholder="При отправке на проверку напишите, что сделано. При возврате - что исправить."></textarea></label>
      <div class="grid-2">
        <label>Новый срок при переносе/возврате <input type="date" data-task-action-due-date value="${task.due_date || ""}" /></label>
        <label>Фото / видео / документ <input type="file" data-task-action-files multiple /></label>
      </div>
      ${personalNotifyControl()}
      <div class="form-actions">
        ${canStart ? `<button class="primary" type="button" data-task-action="start" data-task-id="${task.id}">${status === "returned" ? "Продолжить работу" : "Принять в работу"}</button>` : ""}
        ${canSubmit ? `<button class="primary" type="button" data-task-action="complete" data-task-id="${task.id}">Отправить на проверку</button><button class="secondary" type="button" data-task-action="postpone" data-task-id="${task.id}">Оставить в работе / перенести срок</button>` : ""}
        ${canReview ? `<button class="primary" type="button" data-task-action="accept" data-task-id="${task.id}">Принять выполнение</button><button class="secondary" type="button" data-task-action="return" data-task-id="${task.id}">Вернуть на доработку</button>` : ""}
      </div>
    </section>`;
}

function canEditTaskType(task) {
  const role = currentRoleBase();
  if (["owner", "construction_manager", "finance_director"].includes(role)) return true;
  const userId = Number(currentUserId() || 0);
  return Boolean(userId && [Number(task.creator_id || 0), Number(task.reviewer_id || 0)].includes(userId));
}

function renderTaskTypeEditor(task) {
  if (!canEditTaskType(task)) return "";
  const current = inferTaskType(task);
  const options = [
    ["task", "Задача"],
    ["question", "Вопрос"],
    ["decision", "Решение"],
    ["photo_report", "Фотоотчёт"],
    ["issue", "Замечание"],
    ["material", "Материал"],
    ["check", "Проверка"],
    ["approval", "Согласование"],
  ];
  return `
    <section class="workflow-panel task-type-editor">
      <h3>Тип задачи</h3>
      <div class="inline-form">
        <select data-task-type-select="${task.id}">
          ${options.map(([value, title]) => `<option value="${value}" ${value === current ? "selected" : ""}>${title}</option>`).join("")}
        </select>
        <button class="secondary" type="button" data-task-type-save="${task.id}">Сохранить тип</button>
      </div>
    </section>`;
}

function renderTaskStatusScale(task) {
  const status = taskStatusKey(task);
  const order = [
    ["new", "Новая"],
    ["in_progress", "В работе"],
    ["waiting_check", "Проверка"],
    ["accepted", "Принято"],
  ];
  const statusIndex = status === "returned" ? 1 : Math.max(order.findIndex(([key]) => key === status), 0);
  return `
    <div class="task-status-scale" aria-label="Жизненный цикл задачи">
      ${order
        .map(([key, title], index) => {
          const active = key === status || (status === "returned" && key === "in_progress");
          const done = index < statusIndex || status === "accepted";
          return `<span class="${done ? "done" : ""} ${active ? "active" : ""}">${escapeHtml(title)}</span>`;
        })
        .join("")}
    </div>`;
}

function openTaskDetail(taskId) {
  const task = state.lastTasks.find((item) => Number(item.id) === Number(taskId));
  if (!task) {
    showToast("Задача не найдена");
    return;
  }
  qs("#taskDetailTitle").textContent = taskDisplayTitle(task);
  qs("#taskDetailContent").innerHTML = `
    <section class="workflow-panel compact-workflow">
      <div class="stack-line">
        <h3>${task.project_title || "Объект не указан"}</h3>
        ${pill(label(taskStatusKey(task)), taskStatusLevel(taskStatusKey(task)))}
        ${pill(task.due_date || "без срока", levelByDate(task.due_date))}
        ${pill(taskPriorityLabel(task.priority), taskPriorityLevel(task.priority))}
      </div>
      ${renderTaskStatusScale(task)}
      <div class="task-detail-grid">
        <div><span class="muted">Поставил</span><strong>${task.creator_name || "не указано"}</strong></div>
        <div><span class="muted">Исполнитель</span><strong>${task.assignee_name || "не назначен"}</strong></div>
        <div><span class="muted">Принимает</span><strong>${task.reviewer_name || task.creator_name || "не назначен"}</strong></div>
        <div><span class="muted">Дата постановки</span><strong>${formatDateRu(task.created_at)}</strong></div>
        <div><span class="muted">Дата начала</span><strong>${task.start_date ? formatDateRu(task.start_date) : "не указана"}</strong></div>
        <div><span class="muted">Договор</span><strong>${task.contract_title ? `${contractType(task.contract_type)}: ${task.contract_title}` : "без привязки"}</strong></div>
      </div>
      <p class="muted">${escapeHtml(taskVisibilityReason(task))}</p>
      ${taskDisplayDescription(task) ? `<p class="preserve-lines">${escapeHtml(taskDisplayDescription(task))}</p>` : ""}
      ${task.rejection_comment ? `<div class="hint-box warning"><strong>Причина возврата / непринятия</strong><p>${task.rejection_comment}</p></div>` : ""}
    </section>
    <section class="workflow-panel">
      <h3>История задачи</h3>
      ${taskTimeline(task)}
    </section>
    ${renderTaskTypeEditor(task)}
    ${renderTaskActionPanel(task)}
    ${renderTaskDiscussion(task)}`;
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
  const processNote = `
    <section class="hint-box neutral work-process-note">
      <strong>Как читать раздел</strong>
      <p>Слева — плановые работы из файла «Задание на работы» Сметтера. Справа — появившиеся работы: допы, превышения, переделки и расходы компании. На рабочем столе показываются задачи и контрольные сигналы, а не весь список работ по смете.</p>
    </section>`;
  const workTree = buildWorkTree(works);
  qs("#workRows").innerHTML =
    `${processNote}<div class="work-file-note">${fileNote}</div>` +
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
  qsa("[data-material-pipeline-filter]").forEach((button) => {
    const key = button.dataset.materialPipelineFilter;
    const isActive = key === state.materialPipelineFilter;
    button.classList.toggle("active", isActive);
    const count = buildMaterialBatches(state.materialRequests || []).filter((batch) => key === "all" || materialPipelineStatus(batch) === key).length;
    button.dataset.count = String(count || "");
  });
  qsa("[data-material-quick-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.materialQuickFilter === state.materialQuickFilter);
  });
  const exportButton = qs("#exportCompletedMaterialsButton");
  if (exportButton) exportButton.hidden = !["owner", "construction_manager", "finance_director", "accountant", "procurement_manager"].includes(currentRoleBase());
  const items = await api(`/api/material-requests?archive=${state.materialListMode === "archive" ? "1" : "0"}`);
  const visibleItems = roleScopedMaterialRows(items);
  state.materialRequests = visibleItems;
  const allBatches = buildMaterialBatches(visibleItems);
  qsa("[data-material-pipeline-filter]").forEach((button) => {
    const key = button.dataset.materialPipelineFilter;
    button.classList.toggle("active", key === state.materialPipelineFilter);
    button.dataset.count = String(allBatches.filter((batch) => key === "all" || materialPipelineStatus(batch) === key).length);
  });
  qsa("[data-material-quick-filter]").forEach((button) => {
    const key = button.dataset.materialQuickFilter || "all";
    button.classList.toggle("active", key === state.materialQuickFilter);
    button.dataset.count = String(allBatches.filter((batch) => materialBatchMatchesQuickFilter(batch, key)).length || "");
  });
  const pipelineBatches =
    state.materialPipelineFilter === "all"
      ? allBatches
      : allBatches.filter((batch) => materialPipelineStatus(batch) === state.materialPipelineFilter);
  const batches = pipelineBatches.filter((batch) => materialBatchMatchesQuickFilter(batch));
  const renderBatchCard = (batch) => {
    const activeCount = materialActiveItems(batch).length;
    const removedCount = materialRemovedItems(batch).length;
    const neededAt = batch.needed_at ? formatDateRu(batch.needed_at) : "не указано";
    const responsible = batch.procurement_name || "Снабжение";
    const firstItem = materialActiveItems(batch)[0] || {};
    return `
      <button class="row clickable material-request-row material-batch-row" type="button" data-open-material-batch="${batch.key}" data-testid="material-card">
        <div class="material-main">
          <strong>${escapeHtml(firstItem.title || materialBatchTitle(batch, currentRoleBase() === "procurement_manager"))}</strong>
          <div class="material-card-grid">
            <span><b>Объект:</b> ${escapeHtml(batch.project_title || "не указан")}</span>
            <span><b>Позиций:</b> ${activeCount}${removedCount ? `, удалено: ${removedCount}` : ""}</span>
            <span><b>Основание:</b> ${escapeHtml(materialBatchBasisSummary(batch) || "не указано")}</span>
            <span><b>Кто запросил:</b> ${escapeHtml(batch.creator_name || "не указано")}</span>
            <span><b>Когда нужно:</b> ${escapeHtml(neededAt)}</span>
            <span><b>Ответственный:</b> ${escapeHtml(responsible)}</span>
          </div>
          <div class="muted">${escapeHtml(materialBatchTitle(batch, currentRoleBase() === "procurement_manager"))}</div>
          <div class="muted">Сумма: ${money(batch.total_amount)}</div>
          ${batch.actual_purchase_amount ? `<div class="muted">Фактическая стоимость закупки: ${money(batch.actual_purchase_amount)}</div>` : ""}
          <div class="muted">${materialBatchDestination(batch)}</div>
          <div class="muted">Этап: ${escapeHtml(materialStageLabel(batch))} · Состояние: ${escapeHtml(materialHealthLabel(batch))}${batch.health_comment ? ` · ${escapeHtml(batch.health_comment)}` : ""}</div>
          ${materialReceiptActionNote(batch)}
          ${batch.revision_comment ? `<div class="muted">Комментарий по доработке: ${batch.revision_comment}</div>` : ""}
          ${state.materialListMode === "archive" && batch.archived_at ? `<div class="muted">В архиве с ${formatDateRu(batch.archived_at)}</div>` : ""}
        </div>
        <div class="stack-line">
          ${pill(urgencyLabel(batch.delivery_urgency), urgencyLevel(batch.delivery_urgency))}
          ${pill(materialStageLabel(batch), materialPipelineLevel(batch))}
          ${pill(materialHealthLabel(batch), materialHealthLevel(batch))}
        </div>
      </button>`;
  };
  if (!batches.length) {
    const filterLabel = state.materialPipelineFilter === "all" ? "" : ` со статусом «${statusLabel(state.materialPipelineFilter)}»`;
    const quickLabel = state.materialQuickFilter === "all" ? "" : ` в выбранном фильтре`;
    qs("#materialRows").innerHTML = `<div class="empty-state"><strong>${state.materialListMode === "archive" ? `В архиве заявок${filterLabel}${quickLabel} пока нет.` : `Заявок${filterLabel}${quickLabel} пока нет.`}</strong><p class="muted">Заявки появятся здесь, когда прораб или руководитель запросит материалы.</p>${["foreman", "construction_manager", "owner", "finance_director"].includes(currentRoleBase()) ? `<button class="secondary tiny" type="button" data-open-new-material>Создать заявку</button>` : ""}</div>`;
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

async function openNewMaterialDialog(projectId = state.selectedProjectId) {
  const form = qs("#materialForm");
  if (!form) return;
  form.reset();
  resetExtraMaterials();
  qs("#materialEstimatePicker").innerHTML = `<p class="muted">Выберите объект и нажмите “Материалы по смете”.</p>`;
  fillMaterialProjectSelect(projectId);
  updateMaterialActorHint();
  await loadMaterialEstimatePicker();
  qs("#materialDialog").showModal();
}

function findMaterialBatch(batchKey) {
  return buildMaterialBatches(state.materialRequests).find((batch) => batch.key === batchKey);
}

async function openMaterialBatchDialog(batchKey) {
  if (!state.materialRequests.length) {
    state.materialRequests = await api(`/api/material-requests?archive=${state.materialListMode === "archive" ? "1" : "0"}`);
  }
  let batch = findMaterialBatch(batchKey);
  if (!batch) {
    const [activeItems, archivedItems] = await Promise.all([
      api("/api/material-requests?archive=0"),
      api("/api/material-requests?archive=1"),
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
  const canSaveActualsOnly = currentRoleBase() === "procurement_manager" && batch.id && !canSchedule && ["received", "receipt_issue"].includes(batch.status);
  const canResolveIssue = currentRoleBase() === "procurement_manager" && batch.id && batch.status === "receipt_issue";
  const canEdit = canEditMaterialBatch(batch);
  const canCreateVariation = canCreateVariationFromBatch(batch);
  const canReceive = canReceiveMaterialBatch(batch);
  const activeItems = materialActiveItems(batch);
  const removedItems = materialRemovedItems(batch);
  qs("#materialReviewContent").innerHTML = `
    <section class="workflow-panel compact-workflow">
      <div class="stack-line">
        <h3>${batch.project_title || "Объект не указан"}</h3>
        ${pill(urgencyLabel(batch.delivery_urgency), urgencyLevel(batch.delivery_urgency))}
        ${pill(materialStageLabel(batch), materialPipelineLevel(batch))}
        ${pill(materialHealthLabel(batch), materialHealthLevel(batch))}
      </div>
      <p class="muted">Кто заказал: ${batch.creator_name || "не указано"} · желаемая доставка: ${batch.needed_at || "не указана"} · позиций: ${activeItems.length}${removedItems.length ? ` · удалено при исправлении: ${removedItems.length}` : ""}</p>
      ${batch.actual_purchase_amount ? `<p class="muted">Фактическая стоимость закупки: ${money(batch.actual_purchase_amount)} · сметная сумма заявки: ${money(batch.total_amount)}</p>` : ""}
      <p class="muted">Основания: ${materialBatchBasisSummary(batch)}</p>
      <p class="muted">${materialBatchDestination(batch)}</p>
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
          <div class="row estimate-material-row${materialItemChangeClass(item)}">
            <div class="material-main">
              <div class="stack-line">
                <strong>${item.title}</strong>
                ${materialChangePill(item)}
              </div>
              <div class="muted">${item.estimate_section || "без раздела"}</div>
              ${item.comment ? `<div class="muted">${item.comment}</div>` : ""}
            </div>
            <div class="stack-line">
              ${pill(`${item.requested_quantity || item.estimated_quantity || 0} ${item.requested_unit || item.estimate_material_unit || ""}`, "blue")}
              ${pill(materialBasisLabel(item.basis_type), materialBasisLevel(item.basis_type))}
              ${pill(money(item.total_amount), "success")}
              ${materialActualTotal(item) ? pill(`Закупка: ${money(materialActualTotal(item))}`, materialActualOverrun(item) ? "danger" : "blue") : ""}
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
            ${personalNotifyControl()}
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
            ${personalNotifyControl()}
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
            <div class="table material-review-items">
              ${activeItems
                .map(
                  (item) => `
                  <div class="row estimate-material-row">
                    <div class="material-main">
                      <strong>${item.title}</strong>
                      <div class="muted">Смета: ${money(item.total_amount)} · ${item.requested_quantity || item.estimated_quantity || 0} ${item.requested_unit || item.estimate_material_unit || ""}</div>
                    </div>
                    <label>Цена закупки за ед., ₽ <input type="text" inputmode="decimal" data-material-actual-unit="${item.id}" value="${item.actual_unit_price || ""}" placeholder="0" /></label>
                    <label>Сумма закупки, ₽ <input type="text" inputmode="decimal" data-material-actual-total="${item.id}" value="${item.actual_total_amount || ""}" placeholder="0" /></label>
                  </div>`
                )
                .join("")}
            </div>
            <label>Комментарий снабжения <textarea id="materialBatchScheduleComment" rows="3" placeholder="Например: нужна доверенность или кран">${batch.procurement_comment || ""}</textarea></label>
            ${personalNotifyControl()}
            <div class="form-actions">
              <button class="primary" type="button" data-material-batch-action="schedule" data-material-batch-id="${batch.id}">Уведомить о доставке</button>
              <button class="secondary" type="button" data-material-batch-action="save_actuals" data-material-batch-id="${batch.id}">Сохранить цены закупки</button>
            </div>
          </section>`
        : ""
    }
    ${
      canSaveActualsOnly
        ? `<section class="workflow-panel">
            <h3>Фактические цены закупки</h3>
            <p class="muted">Заявка уже в архиве или закрыта, но снабжение может допоставить фактические цены и суммы закупки.</p>
            <div class="table material-review-items">
              ${activeItems
                .map(
                  (item) => `
                  <div class="row estimate-material-row">
                    <div class="material-main">
                      <strong>${item.title}</strong>
                      <div class="muted">Смета: ${money(item.total_amount)} · ${item.requested_quantity || item.estimated_quantity || 0} ${item.requested_unit || item.estimate_material_unit || ""}</div>
                    </div>
                    <label>Цена закупки за ед., ₽ <input type="text" inputmode="decimal" data-material-actual-unit="${item.id}" value="${item.actual_unit_price || ""}" placeholder="0" /></label>
                    <label>Сумма закупки, ₽ <input type="text" inputmode="decimal" data-material-actual-total="${item.id}" value="${item.actual_total_amount || ""}" placeholder="0" /></label>
                  </div>`
                )
                .join("")}
            </div>
            <label>Комментарий снабжения <textarea id="materialBatchScheduleComment" rows="3" placeholder="Например: цены внесены после закрытия заявки">${batch.procurement_comment || ""}</textarea></label>
            ${personalNotifyControl()}
            <div class="form-actions">
              <button class="secondary" type="button" data-material-batch-action="save_actuals" data-material-batch-id="${batch.id}">Сохранить цены закупки</button>
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
            ${personalNotifyControl()}
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
        ? `<section class="workflow-panel material-receipt-panel">
            <h3>Приемка доставки</h3>
            <p class="muted">Доставка назначена${batch.scheduled_delivery_date ? ` на ${formatDateRu(batch.scheduled_delivery_date)}` : ""}. Если все по списку, подтвердите получение. Если что-то не так, опишите проблему и прикрепите фото или видео.</p>
            <label>Комментарий при проблеме <textarea id="materialBatchReceiptComment" rows="3" placeholder="Что именно не так: не довезли, повреждено, не тот материал"></textarea></label>
            <label>Фото или видео <input id="materialBatchReceiptFile" type="file" accept="image/*,video/*" /></label>
            ${personalNotifyControl()}
            <div class="form-actions">
              <button class="primary" type="button" data-material-batch-action="receive" data-receipt-status="received" data-material-batch-id="${batch.id}">Материалы получены</button>
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
  }[type] || statusLabel(type);
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
              ${canViewFinancials() ? pill(variationAmountLabel(row), Number(row.amount || 0) > 0 ? "warning" : "danger") : ""}
              ${canViewFinancials() ? `<div>${moneyDecisionLabel(row.financial_decision)}</div>` : ""}
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
  const attachments = variation.attachments || [];
  qs("#variationDetailContent").innerHTML = `
    <section class="workflow-panel compact-workflow">
      <div class="stack-line">
        <h3>${variation.project_title || "Объект не указан"}</h3>
        ${pill(variationType(variation.type), "blue")}
        ${canViewFinancials() ? pill(moneyDecisionLabel(variation.financial_decision), variation.financial_decision === "not_decided" ? "danger" : "warning") : ""}
      </div>
      <p class="muted">${canViewFinancials() ? `Сумма: ${variationAmountLabel(variation)} · ` : ""}срок решения: ${variation.due_date || "не указан"}</p>
      ${variation.estimate_section ? `<p class="muted">Раздел / этап сметы: ${variation.estimate_section}</p>` : ""}
      <p class="muted">Статус: ${label(variation.status)} · инициатор: ${variation.requester_name || "не указан"}${variation.approver_name ? ` · решение: ${variation.approver_name}` : ""}</p>
      ${variation.source_type === "material_request_batch" ? `<p class="muted">Источник: заявка материалов #${variation.source_id}</p>` : ""}
      ${variation.description ? `<p class="preserve-lines">${variation.description}</p>` : ""}
      <div class="hint-box neutral">
        <strong>Что здесь решить</strong>
        <p>Нужно определить основание отклонения и кто оплачивает: заказчик по допсоглашению, компания, подрядчик или спорная позиция. Если сумма не задана, сметчику или менеджеру нужно приложить расчет/смету.</p>
      </div>
      <div class="form-actions">
        ${canViewFinancials() ? `<button class="secondary" type="button" data-export-variation="${variation.id}" ${materials.length ? "" : "disabled"}>Выгрузить Excel</button>` : ""}
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
                      ${canViewFinancials() ? pill(money(item.total_amount), "success") : ""}
                    </div>
                  </div>`
                )
                .join("")}
            </div>`
          : `<p class="muted">К этой допработе пока не привязан список материалов.</p>`
      }
    </section>`;
  if (attachments.length) {
    qs("#variationDetailContent").insertAdjacentHTML(
      "beforeend",
      `<section class="workflow-panel">
        <h3>Вложения</h3>
        <div class="document-list">${attachments.map((doc) => `<div class="document-row">${documentFileLink(doc)}</div>`).join("")}</div>
      </section>`
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
  return statusLabelMap[type] || {
    customer_contract: "Заказчик",
    supplier_contract: "Поставщик",
    contractor_contract: "Подрядчик",
    equipment_rent: "Аренда",
  }[type] || "Договор";
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

function knowledgeFolderOptions(selected = "") {
  const selectedValue = String(selected || "");
  const options = [`<option value="">Без папки / корень базы знаний</option>`];
  (state.knowledgeFolders || []).forEach((folder) => {
    const value = String(folder.id);
    const labelText = folder.path || folder.title || `Папка ${folder.id}`;
    options.push(`<option value="${escapeAttr(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(labelText)}</option>`);
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
  const visited = new Set();
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
  return `
    <div class="knowledge-upload-overlay" ${state.knowledgeUploading ? "" : "hidden"}>
      <div class="upload-card">
        <span class="apple-spinner" aria-hidden="true"></span>
        <strong data-upload-message>${escapeHtml(state.knowledgeUploadMessage || "Загружаем файлы")}</strong>
        <span>Пожалуйста, подождите. Большие фото и видео могут загружаться дольше.</span>
      </div>
    </div>`;
}

function renderKnowledgeDocumentRow(doc) {
  const moveControls = canManageKnowledgeBase()
    ? `
      <div class="knowledge-move-row">
        <select data-document-move-folder="${doc.id}" aria-label="Папка материала">${knowledgeFolderOptions(doc.folder_id || "")}</select>
        <button class="secondary tiny" type="button" data-document-action="move" data-document-id="${doc.id}">Переместить</button>
      </div>`
    : "";
  return `
    <article class="knowledge-item knowledge-file-card">
      <div class="knowledge-item-icon" aria-hidden="true">□</div>
      <div class="knowledge-item-main">
        ${doc.file_path ? documentFileLink(doc) : `<div><strong>${escapeHtml(documentTitle(doc))}</strong><div class="muted">${escapeHtml(doc.file_name || "Файл не загружен")}</div></div>`}
      <div class="stack-line">${pill(documentType(doc), documentTypeLevel(doc))}${pill(label(doc.status))}</div>
      </div>
      <div class="knowledge-item-actions">
        ${moveControls}
        ${canDeleteKnowledgeBase() ? `<button class="danger-button tiny" type="button" data-document-action="delete" data-document-id="${doc.id}">Удалить</button>` : ""}
      </div>
    </article>`;
}

function renderKnowledgeFolderRow(folder, folders = [], docs = []) {
  const id = String(folder.id);
  const childCount = folders.filter((item) => String(item.parent_id || "") === id).length;
  const fileCount = docs.filter((doc) => String(doc.folder_id || "") === id).length;
  const isEmpty = !childCount && !fileCount;
  return `
    <article class="knowledge-item knowledge-folder-row">
      <button class="knowledge-folder-open" type="button" data-knowledge-folder-open="${folder.id}">
        <span class="knowledge-item-icon" aria-hidden="true">▣</span>
        <span class="knowledge-item-main">
          <strong>${escapeHtml(folder.title || "Папка")}</strong>
          <span class="muted">${fileCount} файл(ов) · ${childCount} подпапок</span>
        </span>
      </button>
      <div class="knowledge-item-actions">
        ${canDeleteKnowledgeBase() && isEmpty ? `<button class="danger-button tiny" type="button" data-folder-action="delete" data-folder-id="${folder.id}">Удалить</button>` : ""}
      </div>
    </article>`;
}

function renderKnowledgeBreadcrumb(currentId, folders = []) {
  const ancestors = knowledgeFolderAncestors(currentId, folders);
  const items = [
    `<button type="button" data-knowledge-folder-open="">База знаний</button>`,
    ...ancestors.map((folder) => `<button type="button" data-knowledge-folder-open="${folder.id}">${escapeHtml(folder.title || "Папка")}</button>`),
  ];
  return `<nav class="knowledge-breadcrumb" aria-label="Путь в базе знаний">${items.join("<span>/</span>")}</nav>`;
}

function renderKnowledgeFileManager(folders = [], docs = []) {
  const currentId = knowledgeCurrentFolderId();
  const currentFolder = knowledgeFolderById(currentId, folders);
  const childFolders = folders
    .filter((folder) => String(folder.parent_id || "") === currentId)
    .sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "ru"));
  const allFolderDocs = docs
    .filter((doc) => String(doc.folder_id || "") === currentId)
    .sort((a, b) => String(documentTitle(a) || "").localeCompare(String(documentTitle(b) || ""), "ru"));
  const folderDocs = state.knowledgeClassificationOnly ? allFolderDocs.filter(documentNeedsClassification) : allFolderDocs;
  const parentId = currentFolder?.parent_id ? String(currentFolder.parent_id) : "";
  const emptyMessage = currentId
    ? "В этой папке пока нет файлов и подпапок."
    : "База знаний пока пустая. Загружайте сюда регламенты, проектные решения, узлы и общую документацию.";
  const rows = [
    currentId
      ? `<article class="knowledge-item knowledge-back-row"><button class="knowledge-folder-open" type="button" data-knowledge-folder-open="${escapeAttr(parentId)}"><span class="knowledge-item-icon">↩</span><span class="knowledge-item-main"><strong>Назад</strong><span class="muted">В родительскую папку</span></span></button></article>`
      : "",
    ...childFolders.map((folder) => renderKnowledgeFolderRow(folder, folders, docs)),
    ...folderDocs.map(renderKnowledgeDocumentRow),
  ]
    .filter(Boolean)
    .join("");
  const unclassifiedRows = allFolderDocs.filter(documentNeedsClassification);
  const classificationNotice = unclassifiedRows.length
    ? `
      <section class="classification-notice">
        <strong>Требует классификации</strong>
        <p class="muted">Эти файлы не удалось автоматически отнести к проекту, смете, договору, акту, счёту или фото/видео.</p>
        <div class="stack-line">${unclassifiedRows.slice(0, 8).map((doc) => pill(documentTitle(doc), "warning")).join("")}</div>
        <button class="secondary tiny" type="button" data-knowledge-classification-filter="${state.knowledgeClassificationOnly ? "all" : "unclassified"}">${state.knowledgeClassificationOnly ? "Показать все файлы" : "Показать только неразобранные"}</button>
      </section>`
    : "";

  return `
    <section class="knowledge-manager" data-knowledge-drop-zone data-folder-id="${escapeAttr(currentId)}">
      ${renderKnowledgeBreadcrumb(currentId, folders)}
      <div class="knowledge-current-head">
        <div>
          <h3>${escapeHtml(currentFolder?.title || "База знаний")}</h3>
          <p class="muted">${currentId ? escapeHtml(currentFolder?.path || "") : "Корень базы знаний"} · ${childFolders.length} папок · ${folderDocs.length} файлов${state.knowledgeClassificationOnly ? " · фильтр: требуют классификации" : ""}</p>
        </div>
        ${canManageKnowledgeBase() ? `<div class="knowledge-drop-text">Перетащите файлы или папку сюда, чтобы загрузить их в текущую папку</div>` : ""}
      </div>
      <div class="knowledge-list">
        ${classificationNotice}
        ${rows || `<p class="muted knowledge-empty">${emptyMessage}</p>`}
      </div>
      ${canManageKnowledgeBase() ? renderKnowledgeUploadOverlay() : ""}
    </section>`;
}

function knowledgeUploadItem(file, relativePath = "") {
  return {
    file,
    relativePath: relativePath || file.webkitRelativePath || file.name,
  };
}

function normalizeKnowledgeUploadItems(files = []) {
  return Array.from(files || [])
    .map((item) => {
      if (!item) return null;
      if (item.file instanceof File) return knowledgeUploadItem(item.file, item.relativePath);
      if (item instanceof File) return knowledgeUploadItem(item);
      return null;
    })
    .filter(Boolean);
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
  const handlePath = `${parentPath}${handle.name || ""}`;
  if (handle.kind === "file" && typeof handle.getFile === "function") {
    try {
      const file = await handle.getFile();
      return [knowledgeUploadItem(file, handlePath || file.name)];
    } catch {
      return [];
    }
  }
  if (handle.kind === "directory") {
    const children = [];
    if (typeof handle.values === "function") {
      for await (const child of handle.values()) children.push(child);
    } else if (typeof handle.entries === "function") {
      for await (const [, child] of handle.entries()) children.push(child);
    }
    const nested = await Promise.allSettled(children.map((child) => collectKnowledgeHandleFiles(child, `${handlePath}/`)));
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
  const entryPath = `${parentPath}${entry.name || ""}`;
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
    const nested = await Promise.all(children.map((child) => collectKnowledgeEntryFiles(child, `${entryPath}/`)));
    return nested.flat();
  }
  return [];
}

async function collectKnowledgeDroppedFiles(dataTransfer) {
  const items = Array.from(dataTransfer?.items || []);
  const handleFiles = await collectKnowledgeDataTransferHandles(items).catch(() => []);
  if (handleFiles.length) return handleFiles;

  const entries = items
    .map((item) => (typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null))
    .filter(Boolean);
  if (entries.length) {
    const nested = await Promise.allSettled(entries.map((entry) => collectKnowledgeEntryFiles(entry)));
    const collected = nested.filter((item) => item.status === "fulfilled").flatMap((item) => item.value || []);
    if (collected.length) return collected;
    const fallbackFiles = normalizeKnowledgeUploadItems(Array.from(dataTransfer?.files || []));
    if (fallbackFiles.length) return fallbackFiles;
    throw new Error("Не удалось прочитать папку. Проверьте, что она находится на компьютере, а не только в облаке, или выберите ее через «Добавить материал» → «Или папка целиком».");
  }
  return normalizeKnowledgeUploadItems(Array.from(dataTransfer?.files || []));
}

async function uploadKnowledgeFiles(files, options = {}) {
  const fileList = normalizeKnowledgeUploadItems(files);
  if (!fileList.length) {
    showToast("Выберите файлы для загрузки");
    return;
  }
  const folderId = options.folderId ?? knowledgeCurrentFolderId();
  const type = options.type || "other";
  const title = options.title || "";
  const message = fileList.length > 1 ? `Загружаем файлы: ${fileList.length}` : `Загружаем файл: ${fileList[0].file.name}`;
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
          document_file: await fileDocumentPayload(file, fileList.length === 1 && title ? title : file.name, type, "knowledge_base"),
        };
      })
    );
    await api("/api/documents", {
      method: "POST",
      body: JSON.stringify({ related_type: "knowledge_base", folder_id: folderId || "", type, documents }),
    });
    await renderDocuments();
    showToast(fileList.length > 1 ? `Материалы добавлены в базу знаний: ${fileList.length}` : "Материал добавлен в базу знаний");
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
    api("/api/documents?related_type=knowledge_base"),
  ]);
  state.knowledgeFolders = Array.isArray(folders) ? folders : [];
  fillKnowledgeFolderSelects();
  qs("#documentCards").innerHTML = renderKnowledgeFileManager(state.knowledgeFolders, Array.isArray(docs) ? docs : []);
  updateKnowledgeUploadState();
}

function feedbackStatusLabel(status) {
  return statusLabelMap[`feedback_${status}`] || statusLabel(status || "new");
}

function feedbackStatusLevel(status) {
  return statusLevel(`feedback_${status}`, statusLevel(status));
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

function feedbackStatusButton(item, status, title) {
  if (!canManageFeedback()) return "";
  const isActive = item.status === status;
  const activeLabel = {
    in_work: "В работе",
    done: "Готово",
  }[status];
  return `
    <button
      class="secondary tiny feedback-status-button ${isActive ? "is-active" : ""}"
      type="button"
      data-feedback-status="${status}"
      data-feedback-id="${item.id}"
      ${isActive ? "disabled" : ""}
    >${isActive && activeLabel ? activeLabel : title}</button>`;
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
  const countText = itemsCount === null ? "" : `Сообщений: ${itemsCount}. `;
  return `${countText}Последнее обновление: ${state.feedbackLastUpdatedAt || "еще не было"}`;
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
    items = await api(`/api/feedback?_=${Date.now()}`, { cache: "no-store" });
    state.feedbackLastUpdatedAt = new Date().toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch (error) {
    updateFeedbackRefreshUi(false, `Не удалось обновить обратную связь: ${error.message || "ошибка загрузки"}`);
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
          const decisionComment = feedbackDecisionComment(item.decision_comment);
          return `
          <article class="row feedback-row">
            <div class="feedback-main">
              <div class="feedback-head">
                <label class="feedback-select" aria-label="Выбрать сообщение">
                  <input type="checkbox" data-feedback-check="${item.id}" ${state.selectedFeedbackIds.has(Number(item.id)) ? "checked" : ""} />
                </label>
                <div class="feedback-title">
                  <strong>${escapeHtml(item.sender_name || item.sender_id || "MAX")}</strong>
                  ${pill(feedbackStatusLabel(item.status), feedbackStatusLevel(item.status))}
                </div>
              </div>
              <div class="muted">${escapeHtml(item.chat_title || item.chat_id || "Чат MAX")} · ${formatDateRu(item.created_at)}</div>
              <p>${escapeHtml(item.text || "Без текста").replace(/\n/g, "<br>")}</p>
              ${renderFeedbackAttachments(attachments)}
              ${decisionComment ? `<div class="muted">Комментарий: ${escapeHtml(decisionComment)}</div>` : ""}
            </div>
            <div class="feedback-actions">
              ${feedbackStatusButton(item, "in_work", "В работу")}
              ${feedbackStatusButton(item, "done", "Готово")}
              ${canDeleteFeedback() ? `<button class="danger-button tiny" type="button" data-feedback-delete="${item.id}">Удалить</button>` : ""}
            </div>
          </article>`;
        })
        .join("")
    : `<p class="muted">Сообщений из MAX пока нет.</p>`;
  updateFeedbackRefreshUi(false, feedbackRefreshMessage(items.length));
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
  await renderDataIntegrity();
  const events = await api("/api/events");
  qs("#eventTimeline").innerHTML = events.map((event) => `
    <article class="timeline-item">
      <div class="stack-line"><strong>${eventType(event.type)}</strong>${pill(event.visibility === "customer_allowed" ? "Можно заказчику" : "Внутреннее", event.visibility === "customer_allowed" ? "success" : "")}</div>
      <p>${event.text}</p>
      <div class="muted">${event.project_title} · ${event.author_name || "автор не указан"} · ${event.created_at}</div>
    </article>`).join("");
}

function canViewDataIntegrity() {
  return ["owner", "construction_manager", "finance_director"].includes(currentRoleBase()) || currentRoleBase() === "ai_auditor";
}

function integrityEntityGroup(entityType) {
  if (["material_request_batch", "material_request"].includes(entityType)) return "material";
  return entityType || "other";
}

function integritySeverityLevel(severity) {
  return severity === "critical" ? "danger" : severity === "warning" ? "warning" : "blue";
}

async function renderDataIntegrity(force = false) {
  const panel = qs("#dataIntegrityPanel");
  if (!panel) return;
  panel.hidden = !canViewDataIntegrity();
  if (panel.hidden) return;
  if (!state.dataIntegrityReport || force) {
    state.dataIntegrityReport = await api("/api/data-integrity", { silentLoading: !force, loadingMessage: "Проверяем целостность данных" });
  }
  const report = state.dataIntegrityReport || {};
  const summary = report.summary || {};
  const stats = [
    ["Критические", summary.critical || 0, "danger"],
    ["Предупреждения", summary.warnings || 0, "warning"],
    ["Инфо", summary.info || 0, "blue"],
    ["Всего", summary.total || 0, ""],
  ];
  qs("#dataIntegrityStats").innerHTML = stats
    .map(([labelText, count, level]) => `<button class="metric ${Number(count) ? level : "is-zero"}" type="button"><span>${labelText}</span><strong>${count}</strong></button>`)
    .join("");
  qsa("[data-integrity-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.integrityFilter === state.dataIntegrityFilter);
  });
  const violations = (report.violations || []).filter((item) => {
    if (state.dataIntegrityFilter === "all") return true;
    return integrityEntityGroup(item.entity_type) === state.dataIntegrityFilter;
  });
  qs("#dataIntegrityRows").innerHTML = violations.length
    ? violations
        .map(
          (item) => `
          <div class="row dense-row">
            <div class="material-main">
              <div class="stack-line">
                <strong>${escapeHtml(item.violation_type || "Нарушение")}</strong>
                ${pill(item.severity === "critical" ? "Критично" : item.severity === "warning" ? "Предупреждение" : "Инфо", integritySeverityLevel(item.severity))}
              </div>
              <div class="muted">${escapeHtml(item.entity_type || "entity")} #${escapeHtml(String(item.entity_id || ""))}${item.object ? ` · ${escapeHtml(item.object)}` : ""}</div>
              <div>${escapeHtml(item.reason || "")}</div>
              <div class="muted">Рекомендация: ${escapeHtml(item.recommendation || "Проверить вручную.")}</div>
            </div>
            ${pill(item.auto_fix_safe ? "можно авто после команды" : "ручная проверка", item.auto_fix_safe ? "blue" : "warning")}
          </div>`
        )
        .join("")
    : `<div class="empty-state"><strong>Нарушений по фильтру нет</strong><p class="muted">Data Integrity Agent не нашёл проблем в выбранной группе.</p></div>`;
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

async function submitPhotoReportForm(event) {
  event.preventDefault();
  const form = qs("#photoReportForm");
  const files = Array.from(form.elements.attachments?.files || []);
  if (!files.length) {
    showToast("Прикрепите фото или видео по объекту");
    return;
  }
  const payload = {
    project_id: form.elements.project_id.value,
    report_date: form.elements.report_date.value || todayIso(),
    stage: form.elements.stage.value,
    zones: form.elements.zones.value,
    comment: form.elements.comment.value,
    notify_personal: form.elements.notify_personal?.checked || false,
    attachments: await Promise.all(files.map((file) => fileDocumentPayload(file, file.name, "photo_report", "photo_report"))),
  };
  await api("/api/photo-reports", {
    method: "POST",
    loadingMessage: "Загружаем фотоотчёт",
    body: JSON.stringify(payload),
  });
  qs("#photoReportDialog").close();
  form.reset();
  await loadAll();
  showToast("Фотоотчёт сохранён");
}

async function submitObjectRemarkForm(event) {
  event.preventDefault();
  const form = qs("#objectRemarkForm");
  const beforeFile = form.elements.photo_before?.files?.[0];
  const afterFile = form.elements.photo_after?.files?.[0];
  const payload = {
    project_id: form.elements.project_id.value,
    zone: form.elements.zone.value,
    description: form.elements.description.value,
    responsible_id: form.elements.responsible_id.value,
    due_date: form.elements.due_date.value,
    status: form.elements.status.value,
    checked_by_id: form.elements.checked_by_id.value,
    notify_personal: form.elements.notify_personal?.checked || false,
    photo_before: beforeFile ? await fileDocumentPayload(beforeFile, `Фото до: ${beforeFile.name}`, "object_remark_photo", "object_remark") : null,
    photo_after: afterFile ? await fileDocumentPayload(afterFile, `Фото после: ${afterFile.name}`, "object_remark_photo", "object_remark") : null,
  };
  await api("/api/object-remarks", {
    method: "POST",
    loadingMessage: "Сохраняем замечание",
    body: JSON.stringify(payload),
  });
  qs("#objectRemarkDialog").close();
  form.reset();
  await loadAll();
  showToast("Замечание сохранено");
}

function hasOpenDialog() {
  return Boolean(document.querySelector("dialog[open]"));
}

function nearestScrollableElement(element) {
  let current = element instanceof Element ? element : element?.parentElement;
  while (current && current !== document.body && current !== document.documentElement) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    const canScroll = /auto|scroll|overlay/.test(overflowY) && current.scrollHeight > current.clientHeight + 1;
    if (canScroll) return current;
    current = current.parentElement;
  }
  return null;
}

function canScrollPageVertically(deltaY) {
  const root = document.scrollingElement || document.documentElement;
  if (!root || root.scrollHeight <= root.clientHeight + 1) return false;
  const atTop = root.scrollTop <= 0;
  const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 1;
  return (deltaY < 0 && !atTop) || (deltaY > 0 && !atBottom);
}

function normalizedWheelDeltaY(event) {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * window.innerHeight;
  return event.deltaY;
}

function bindWheelPageScroll() {
  if (bindWheelPageScroll.bound) return;
  bindWheelPageScroll.bound = true;
  document.addEventListener(
    "wheel",
    (event) => {
      if (event.defaultPrevented || hasOpenDialog()) return;
      if (event.target.closest?.("dialog")) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const deltaY = normalizedWheelDeltaY(event);
      if (!deltaY || !canScrollPageVertically(deltaY)) return;
      const scrollable = nearestScrollableElement(event.target);
      if (!scrollable) {
        event.preventDefault();
        window.scrollBy({ top: deltaY, behavior: "auto" });
        return;
      }
      const atTop = scrollable.scrollTop <= 0;
      const atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 1;
      if ((deltaY < 0 && !atTop) || (deltaY > 0 && !atBottom)) return;
      event.preventDefault();
      window.scrollBy({ top: deltaY, behavior: "auto" });
    },
    { passive: false }
  );
}

function bindStableDetailsTouchGuard() {
  document.addEventListener(
    "touchstart",
    (event) => {
      const summary = event.target.closest?.("summary");
      if (!summary?.parentElement?.classList.contains("estimate-section")) return;
      const touch = event.touches?.[0];
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
      const summary = event.target.closest?.("summary");
      if (!summary?.parentElement?.classList.contains("estimate-section")) return;
      const touch = event.touches?.[0];
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
      const summary = event.target.closest?.("summary");
      if (!summary?.parentElement?.classList.contains("estimate-section")) return;
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
  setProjectSaving(false);
  setProjectFileStatus("");
  setProjectExistingFiles(null);
  restoreProjectFormDraft(form);
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
  const form = qs("#contractForm");
  form.reset();
  if (projectId) form.elements.project_id.value = String(projectId);
  form.elements.responsible_id.value = currentUserId() || state.users.find((user) => user.role === "construction_manager")?.id || "";
  qs("#contractDialog").showModal();
}

async function handleProjectAction(button) {
  const projectId = button.dataset.projectId;
  const action = button.dataset.projectAction;
  const panel = button.closest(".workflow-panel");
  const notifyPersonal = readPersonalNotify(panel);
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

  payload.actor_id = payload.actor_id || currentUserId();
  payload.actor_role = payload.actor_role || currentRoleBase();
  if (notifyPersonal) payload.notify_personal = true;

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
  const panel = button.closest("[data-task-action-panel]");
  const panelComment = panel?.querySelector("[data-task-action-comment]")?.value.trim() || "";
  const panelDueDate = panel?.querySelector("[data-task-action-due-date]")?.value || "";
  const panelFiles = [...(panel?.querySelector("[data-task-action-files]")?.files || [])];
  const notifyPersonal = readPersonalNotify(panel);
  let payload = {};
  let message = "Задача обновлена";
  if (action === "start") {
    const comment = panel ? panelComment : "";
    payload = { ...payload, comment };
    message = "Задача принята в работу";
  }
  if (action === "complete") {
    const answer = panel ? panelComment : window.prompt("Что сделано по задаче? Комментарий обязателен.", "");
    if (answer === null) return;
    const comment = String(answer || "").trim();
    if (!comment) {
      showToast("После выполнения задачи напишите, что именно сделано");
      return;
    }
    payload = { ...payload, comment };
    message = "Задача отправлена на проверку";
  }
  if (action === "accept") {
    const answer = panel ? panelComment : window.prompt("Комментарий к приемке. Можно оставить пустым.", "");
    if (answer === null) return;
    const comment = answer || "";
    payload = { ...payload, comment };
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
    payload = { ...payload, comment, due_date: dueDate.trim() };
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
    payload = { ...payload, comment, due_date: String(dueDate).trim() };
    message = "Задача оставлена в работе с новым комментарием";
  }
  if (action === "delete") {
    const confirmed = window.confirm("Удалить задачу? Это действие нельзя отменить.");
    if (!confirmed) return;
    message = "Задача удалена";
    payload = { ...payload, comment: "Удалено из интерфейса задач." };
  }
  if (panelFiles.length) {
    payload.attachments = await Promise.all(panelFiles.map((file) => fileDocumentPayload(file, file.name, "other", "task")));
  }
  if (notifyPersonal) payload.notify_personal = true;
  payload.actor_id = currentUserId() || null;
  payload.actor_role = currentRoleBase();
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
  if (qs("#taskDetailDialog")?.open && action !== "delete") openTaskDetail(taskId);
  if (action === "delete" && qs("#taskDetailDialog")?.open) qs("#taskDetailDialog").close();
  showToast(message);
}

async function handleTaskComment(button) {
  const taskId = button.dataset.taskCommentSend;
  const form = button.closest("[data-task-comment-form]");
  const textarea = form?.querySelector("textarea");
  const files = [...(form?.querySelector('input[type="file"]')?.files || [])];
  const comment = textarea?.value.trim() || "";
  const notifyPersonal = readPersonalNotify(form);
  if (!comment && !files.length) {
    showToast("Напишите комментарий по задаче или прикрепите файл");
    return;
  }
  button.disabled = true;
  try {
    await api(`/api/tasks/${taskId}/comment`, {
      method: "POST",
      body: JSON.stringify({
        actor_id: currentUserId() || null,
        comment,
        notify_personal: notifyPersonal,
        attachments: await Promise.all(files.map((file) => fileDocumentPayload(file, file.name, "other", "task"))),
      }),
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

async function runGlobalSearch(rawQuery) {
  const query = String(rawQuery || "").trim().toLowerCase();
  if (!query) {
    showToast("Введите, что найти: объект, задачу или материал");
    return;
  }
  const project = [...(state.projects || []), ...(state.archivedProjects || [])].find((item) =>
    [item.title, item.customer_name, item.address].some((value) => String(value || "").toLowerCase().includes(query))
  );
  if (project) {
    state.selectedProjectId = project.id;
    await switchView("projects");
    await renderProjectDetail(project.id);
    showToast("Открыт найденный объект");
    return;
  }
  const task = (state.lastTasks || []).find((item) =>
    [item.title, item.description, item.project_title, item.assignee_name].some((value) => String(value || "").toLowerCase().includes(query))
  );
  if (task) {
    state.selectedTaskProjectId = task.project_id || null;
    await switchView("tasks");
    openTaskDetail(task.id);
    showToast("Открыта найденная задача");
    return;
  }
  const batch = buildMaterialBatches(state.materialRequests || []).find((item) =>
    [materialBatchTitle(item), item.project_title, item.creator_name].some((value) => String(value || "").toLowerCase().includes(query))
  );
  if (batch) {
    await switchView("materials");
    await openMaterialBatchDialog(batch.key);
    showToast("Открыта найденная заявка");
    return;
  }
  showToast("Ничего не найдено. Попробуйте другое слово.");
}

function bindEvents() {
  bindStableDetailsTouchGuard();
  bindWheelPageScroll();
  initPullToRefresh();
  qs("#sidebarToggle")?.addEventListener("click", () => toggleSidebarCollapsed());
  qs("#densitySelect")?.addEventListener("change", (event) => setDensityMode(event.target.value));
  qs("#topbarProjectSelect")?.addEventListener("change", async (event) => {
    const projectId = Number(event.target.value || 0) || null;
    state.selectedProjectId = projectId;
    state.selectedTaskProjectId = projectId;
    localStorage.setItem("selectedTopbarProjectId", projectId ? String(projectId) : "");
    if (projectId) {
      await switchView("projects");
      await renderProjectDetail(projectId);
    } else if (state.view === "projects") {
      await renderProjects();
    }
  });
  qs("#globalSearchInput")?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await runGlobalSearch(event.currentTarget.value);
  });
  qsa("[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  qsa("[data-view-target]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.viewTarget)));
  qsa("[data-project-display]").forEach((button) =>
    button.addEventListener("click", () => {
      state.projectDisplayMode = button.dataset.projectDisplay === "cards" ? "cards" : "table";
      localStorage.setItem("projectDisplayMode", state.projectDisplayMode);
      renderProjects();
    })
  );
  qs("#refreshButton").addEventListener("click", () => refreshAppFromUser("Обновляем данные").catch((error) => showToast(error.message)));
  qs("#mobileQuickActionToggle")?.addEventListener("click", () => toggleMobileQuickActions());
  qs("#mobileQuickActionClose")?.addEventListener("click", () => toggleMobileQuickActions(false));
  qs("#mobileMoreButton")?.addEventListener("click", () => toggleMobileMenu(true));
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
    await renderEstimateJobs();
    await renderToday();
    await renderDashboard();
    await renderMaterials();
    await renderObjectRemarks();
    await renderPhotoReports();
    await renderDocuments();
    await renderEvents();
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
    if (state.selectedProjectId && form.elements.project_id) form.elements.project_id.value = String(state.selectedProjectId);
    loadTaskContractOptions(form.elements.project_id?.value || "");
    qs("#taskDialog").showModal();
  });
  qs('#taskForm select[name="project_id"]')?.addEventListener("change", (event) => loadTaskContractOptions(event.target.value));
  qs("#newEstimateJobButton").addEventListener("click", () => openEstimateJobDialog());
  qs('#estimateJobForm select[name="estimate_type"]')?.addEventListener("change", () => syncEstimateSiteCostsByType());
  qs('#estimateJobForm select[name="site_costs_policy"]')?.addEventListener("change", () => {
    qs("#estimateJobForm").dataset.siteCostsTouched = "true";
  });
  qs('#estimateJobFileForm select[name="mode"]')?.addEventListener("change", updateEstimateFileDialogMode);
  qs("#newMaterialButton").addEventListener("click", async () => openNewMaterialDialog());
  qs("#newVariationButton").addEventListener("click", () => qs("#variationDialog").showModal());
  qs("#newObjectRemarkButton")?.addEventListener("click", () => {
    const form = qs("#objectRemarkForm");
    form.reset();
    if (state.selectedProjectId && form.elements.project_id) form.elements.project_id.value = String(state.selectedProjectId);
    qs("#objectRemarkDialog").showModal();
  });
  qs("#newPhotoReportButton")?.addEventListener("click", () => {
    const form = qs("#photoReportForm");
    form.reset();
    if (state.selectedProjectId && form.elements.project_id) form.elements.project_id.value = String(state.selectedProjectId);
    form.elements.report_date.value = todayIso();
    qs("#photoReportDialog").showModal();
  });
  qs("#newKnowledgeFolderButton")?.addEventListener("click", () => {
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
  qs("#refreshIntegrityButton")?.addEventListener("click", async () => {
    await renderDataIntegrity(true);
    showToast("Проверка целостности обновлена");
  });
  qsa("[data-integrity-filter]").forEach((button) =>
    button.addEventListener("click", async () => {
      state.dataIntegrityFilter = button.dataset.integrityFilter || "all";
      await renderDataIntegrity();
    })
  );
  qs("#refreshFeedbackButton")?.addEventListener("click", async () => {
    try {
      await renderFeedback();
      showToast("Обратная связь обновлена");
    } catch (error) {
      showToast(error.message || "Не удалось обновить обратную связь");
    }
  });
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
  qs("#mediaPreviewClose")?.addEventListener("click", closeMediaPreview);
  qs("#mediaPreviewCloseBottom")?.addEventListener("click", closeMediaPreview);
  qs("#mediaPreviewPrev")?.addEventListener("click", () => moveMediaPreview(-1));
  qs("#mediaPreviewNext")?.addEventListener("click", () => moveMediaPreview(1));
  qs("#mediaPreviewDialog")?.addEventListener("close", () => {
    const body = qs("#mediaPreviewBody");
    if (body) body.innerHTML = "";
    state.mediaPreview = { items: [], index: 0, touchX: null };
  });
  qs("#mediaPreviewBody")?.addEventListener(
    "touchstart",
    (event) => {
      state.mediaPreview.touchX = event.changedTouches?.[0]?.clientX ?? null;
    },
    { passive: true }
  );
  qs("#mediaPreviewBody")?.addEventListener(
    "touchend",
    (event) => {
      const startX = state.mediaPreview.touchX;
      const endX = event.changedTouches?.[0]?.clientX ?? null;
      state.mediaPreview.touchX = null;
      if (startX == null || endX == null || Math.abs(endX - startX) < 45) return;
      moveMediaPreview(endX < startX ? 1 : -1);
    },
    { passive: true }
  );
  qs("#mediaPreviewDialog")?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") moveMediaPreview(-1);
    if (event.key === "ArrowRight") moveMediaPreview(1);
  });

  qs("#estimateImagePrev")?.addEventListener("click", () => moveEstimateGallery(-1));
  qs("#estimateImageNext")?.addEventListener("click", () => moveEstimateGallery(1));
  let estimateGalleryTouchX = null;
  qs("#estimateImageStage")?.addEventListener(
    "touchstart",
    (event) => {
      estimateGalleryTouchX = event.changedTouches?.[0]?.clientX ?? null;
    },
    { passive: true }
  );
  qs("#estimateImageStage")?.addEventListener(
    "touchend",
    (event) => {
      if (estimateGalleryTouchX === null) return;
      const delta = (event.changedTouches?.[0]?.clientX ?? estimateGalleryTouchX) - estimateGalleryTouchX;
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
  qsa("[data-material-list-mode]").forEach((button) =>
    button.addEventListener("click", async () => {
      state.materialListMode = button.dataset.materialListMode;
      await renderMaterials();
    })
  );
  qsa("[data-material-pipeline-filter]").forEach((button) =>
    button.addEventListener("click", async () => {
      state.materialPipelineFilter = button.dataset.materialPipelineFilter || "all";
      await renderMaterials();
    })
  );
  qsa("[data-material-quick-filter]").forEach((button) =>
    button.addEventListener("click", async () => {
      state.materialQuickFilter = button.dataset.materialQuickFilter || "all";
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

  document.addEventListener("change", (event) => {
    const removeToggle = event.target.closest?.("[data-edit-item-remove]");
    if (removeToggle) {
      removeToggle.closest(".material-batch-edit-row")?.classList.toggle("material-change-removed", removeToggle.checked);
    }
  });

  document.addEventListener("click", async (event) => {
    const mediaPreviewButton = event.target.closest("[data-media-preview]");
    if (mediaPreviewButton) {
      event.preventDefault();
      const galleryRoot = mediaPreviewButton.closest(".media-grid, .remark-media-grid, .photo-report-card, .object-remark-card");
      const galleryItems = qsa("[data-media-preview]", galleryRoot || document).map(mediaPreviewItemFromLink).filter((item) => item.href);
      const clickedHref = mediaPreviewButton.dataset.mediaUrl || mediaPreviewButton.getAttribute("href") || "";
      const clickedIndex = Math.max(0, galleryItems.findIndex((item) => item.href === clickedHref));
      openMediaPreview({
        href: mediaPreviewButton.dataset.mediaUrl || mediaPreviewButton.getAttribute("href"),
        title: mediaPreviewButton.dataset.mediaTitle || mediaPreviewButton.textContent?.trim(),
        mime: mediaPreviewButton.dataset.mediaMime || "",
        kind: mediaPreviewButton.dataset.mediaPreview || "",
        items: galleryItems,
        index: clickedIndex,
      });
      return;
    }

    const viewTargetButton = event.target.closest("[data-view-target]");
    if (viewTargetButton) {
      switchView(viewTargetButton.dataset.viewTarget);
      if (viewTargetButton.closest("#mobileQuickSheet")) toggleMobileQuickActions(false);
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

    const openNewMaterialButton = event.target.closest("[data-open-new-material]");
    if (openNewMaterialButton) {
      await openNewMaterialDialog();
      return;
    }

    const mobileActionButton = event.target.closest("[data-mobile-action]");
    if (mobileActionButton) {
      if (mobileActionButton.dataset.projectContext) state.selectedProjectId = Number(mobileActionButton.dataset.projectContext);
      await handleMobileQuickAction(mobileActionButton.dataset.mobileAction);
      return;
    }

    const taskCommentButton = event.target.closest("[data-task-comment-send]");
    if (taskCommentButton) {
      await handleTaskComment(taskCommentButton);
      return;
    }

    const taskTypeSaveButton = event.target.closest("[data-task-type-save]");
    if (taskTypeSaveButton) {
      const taskId = taskTypeSaveButton.dataset.taskTypeSave;
      const select = qs(`[data-task-type-select="${taskId}"]`);
      await api(`/api/tasks/${taskId}/type`, {
        method: "POST",
        body: JSON.stringify({ task_type: select?.value || "task" }),
      });
      await loadAll();
      if (state.view === "tasks") await renderTasks();
      openTaskDetail(taskId);
      showToast("Тип задачи обновлён");
      return;
    }

    const feedbackFilterButton = event.target.closest("[data-feedback-filter]");
    if (feedbackFilterButton) {
      state.feedbackFilter = feedbackFilterButton.dataset.feedbackFilter;
      await renderFeedback();
      return;
    }

    const remarkFilterButton = event.target.closest("[data-remark-filter]");
    if (remarkFilterButton) {
      state.remarkFilter = remarkFilterButton.dataset.remarkFilter;
      await renderObjectRemarks();
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
      if (!canManageFeedback()) return;
      const nextStatus = feedbackStatusButton.dataset.feedbackStatus;
      const originalText = feedbackStatusButton.textContent;
      feedbackStatusButton.disabled = true;
      feedbackStatusButton.classList.add("is-pending");
      feedbackStatusButton.textContent = "Отправляю...";
      try {
        await api(`/api/feedback/${feedbackStatusButton.dataset.feedbackId}/status`, {
          method: "POST",
          body: JSON.stringify({ status: nextStatus, comment: "" }),
        });
        await renderFeedback();
        showToast(nextStatus === "in_work" ? "Замечание взято в работу" : "Замечание отмечено готовым");
      } catch (error) {
        feedbackStatusButton.disabled = false;
        feedbackStatusButton.classList.remove("is-pending");
        feedbackStatusButton.textContent = originalText;
        showToast(error.message || "Не удалось обновить статус");
      }
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
      addExtraMaterialRow("#batchExtraMaterialRows", { changeType: "added" });
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
          // Some browsers block scripted printing for downloaded documents.
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
      await api(`/api/estimate-job-files/${deleteEstimateFileButton.dataset.deleteEstimateFile}/delete`, {
        method: "POST",
        body: JSON.stringify({}),
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
      await api(`/api/estimate-jobs/${id}/status`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await loadCoreData();
      await renderEstimateJobs();
      await renderDashboard();
      const statusToast = {
        estimate_done: "Смета отмечена как сданная",
        estimate_returned: "Задание возвращено менеджеру",
        estimate_in_work: "Сметное задание взято в работу",
        estimate_question: "Уточнение отправлено менеджеру",
      };
      showToast(statusToast[status] || "Статус сметного задания изменен");
      return;
    }

    const deleteEstimateJobButton = event.target.closest("[data-delete-estimate-job]");
    if (deleteEstimateJobButton) {
      const confirmed = confirm("Удалить сметное задание? Это действие нельзя отменить.");
      if (!confirmed) return;
      await api(`/api/estimate-jobs/${deleteEstimateJobButton.dataset.deleteEstimateJob}/delete`, {
        method: "POST",
        body: JSON.stringify({}),
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
      window.open(`/api/variations/${variationExportButton.dataset.exportVariation}/export`, "_blank", "noopener");
      return;
    }

    const knowledgeFolderOpenButton = event.target.closest("[data-knowledge-folder-open]");
    if (knowledgeFolderOpenButton) {
      state.knowledgeClassificationOnly = false;
      setKnowledgeCurrentFolderId(knowledgeFolderOpenButton.dataset.knowledgeFolderOpen || "");
      await renderDocuments();
      return;
    }

    const knowledgeClassificationFilterButton = event.target.closest("[data-knowledge-classification-filter]");
    if (knowledgeClassificationFilterButton) {
      state.knowledgeClassificationOnly = knowledgeClassificationFilterButton.dataset.knowledgeClassificationFilter === "unclassified";
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
          await api(`/api/document-folders/${id}/delete`, {
            method: "POST",
            body: JSON.stringify({ actor_role: currentRoleBase() }),
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
        const select = qs(`[data-document-move-folder="${id}"]`);
        try {
          await api(`/api/documents/${id}/move`, {
            method: "POST",
            body: JSON.stringify({ folder_id: select?.value || "", actor_role: currentRoleBase() }),
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
      const actionPanel = materialBatchAction.closest(".workflow-panel");
      const currentBatch = buildMaterialBatches(state.materialRequests || []).find((batch) => String(batch.id) === String(id));
      let body = {};
      if (action === "delete" && !confirm("Удалить заявку на материалы? Это можно сделать только до принятия снабжением в работу.")) return;
      if (action === "return") {
        body = { comment: qs("#materialBatchReturnComment")?.value || "" };
      }
      if (action === "resubmit") {
        body = { comment: qs("#materialBatchResubmitComment")?.value || "" };
      }
      if (action === "update") {
        const extraItems = collectExtraMaterials("#batchExtraMaterialRows");
        const incompleteExtra = extraItems.some((item) => !item.material || !item.name || !item.unit || Number(item.quantity || 0) <= 0 || !item.reason);
        if (incompleteExtra) {
          showToast("Заполните материал, наименование, ед. измерения, количество и причину");
          return;
        }
        body = {
          comment: qs("#materialBatchUpdateComment")?.value || "",
          needed_at: qs("#materialBatchUpdateNeededAt")?.value || "",
          items: collectMaterialBatchEdits(),
          extra_items: extraItems,
        };
      }
      if (action === "schedule") {
        body = {
          scheduled_delivery_date: qs("#materialBatchDeliveryDate")?.value || "",
          actual_items: currentBatch ? collectMaterialActualItems(currentBatch) : [],
          comment: qs("#materialBatchScheduleComment")?.value || "",
        };
      }
      if (action === "save_actuals") {
        body = {
          actual_items: currentBatch ? collectMaterialActualItems(currentBatch) : [],
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
      body.notify_personal = readPersonalNotify(actionPanel);
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
          save_actuals: "Цены закупки сохранены",
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
    const dropZone = event.target.closest?.("[data-knowledge-drop-zone]");
    if (!dropZone || !canManageKnowledgeBase()) return;
    event.preventDefault();
    dropZone.classList.add("is-drag-over");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });

  document.addEventListener("dragleave", (event) => {
    const dropZone = event.target.closest?.("[data-knowledge-drop-zone]");
    if (!dropZone) return;
    const nextTarget = event.relatedTarget;
    if (nextTarget && dropZone.contains(nextTarget)) return;
    dropZone.classList.remove("is-drag-over");
  });

  document.addEventListener("drop", async (event) => {
    const dropZone = event.target.closest?.("[data-knowledge-drop-zone]");
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
      const details = event.target.closest?.("[data-collapsible-key]");
      if (!details) return;
      state.expandedLists[details.dataset.collapsibleKey] = details.open;
    },
    true
  );

  document.addEventListener("input", (event) => {
    const projectInput = event.target.closest?.("#projectForm input, #projectForm textarea, #projectForm select");
    if (projectInput && projectInput.type !== "file") {
      if (projectInput.name === "customer_phone") {
        projectInput.value = formatRuPhone(projectInput.value);
      }
      saveProjectFormDraft(projectInput.form);
      setProjectFormStatus("Черновик полей сохранен в браузере.", "pending");
    }
    const maxChatInput = event.target.closest?.('[data-max-user-row] input[name="max_chat_id"]');
    if (maxChatInput) saveMaxBindingDraft(maxChatInput.closest("[data-max-user-row]"));
  });

  document.addEventListener("change", (event) => {
    const projectInput = event.target.closest?.("#projectForm input, #projectForm textarea, #projectForm select");
    if (projectInput) saveProjectFormDraft(projectInput.form);
    const maxEnabledInput = event.target.closest?.('[data-max-user-row] input[name="max_enabled"]');
    if (maxEnabledInput) saveMaxBindingDraft(maxEnabledInput.closest("[data-max-user-row]"));
  });

  qs("#projectForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = qs("#projectForm");
    const saveMode = event.submitter?.dataset.saveMode === "draft" ? "draft" : "complete";
    const missingFields = missingProjectRequiredFields(form, saveMode);
    if (missingFields.length) {
      setProjectFormStatus(`Не заполнено: ${missingFields.map(([, label]) => label).join(", ")}.`, "error");
      missingFields[0] && form.elements[missingFields[0][0]]?.focus?.();
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
      const savedProject = await api(isEdit ? `/api/projects/${projectId}/update` : "/api/projects", {
        method: "POST",
        body: JSON.stringify(payload),
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
        showToast(uploadedInitialCount ? `Черновик сохранен, файлов прикреплено: ${uploadedInitialCount}` : "Черновик сохранен");
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
        showToast(count ? `Задание на работы загружено: ${count} строк` : "Файл сохранен, но работы не распознаны");
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
  qs("#photoReportForm")?.addEventListener("submit", submitPhotoReportForm);
  qs("#objectRemarkForm")?.addEventListener("submit", submitObjectRemarkForm);
  qs("#estimateJobForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = qs("#estimateJobForm");
    const payload = formToJson(form);
    const id = payload.id;
    delete payload.id;
    payload.title = normalizeEstimateJobTitle(payload.customer_name, payload.title);
    const attachments = Array.from(form.elements.attachments?.files || []);
    payload.attachments = await Promise.all(attachments.map((file) => fileDocumentPayload(file, file.name, "estimate_job_file", "estimate_job")));
    await api(id ? `/api/estimate-jobs/${id}/update` : "/api/estimate-jobs", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    qs("#estimateJobDialog").close();
    form.reset();
    await loadCoreData();
    await renderEstimateJobs();
    await renderDashboard();
    showToast(id ? "Сметное задание обновлено" : "Сметное задание создано");
  });
  qs("#estimateJobDoneForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = qs("#estimateJobDoneForm");
    const id = form.elements.id.value;
    if (!id) {
      showToast("Не найдено сметное задание");
      return;
    }
    const attachments = Array.from(form.elements.attachments?.files || []);
    const payload = {
      status: "estimate_done",
      result_comment: form.elements.result_comment.value || "",
      attachments: await Promise.all(attachments.map((file) => fileDocumentPayload(file, file.name, "estimate_job_file", "estimate_job"))),
    };
    await api(`/api/estimate-jobs/${id}/status`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    qs("#estimateJobDoneDialog").close();
    form.reset();
    await loadCoreData();
    await renderEstimateJobs();
    await renderDashboard();
    showToast("Смета сдана, файлы сохранены");
  });
  qs("#estimateJobFileForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = qs("#estimateJobFileForm");
    const id = form.elements.id.value;
    const mode = form.elements.mode.value || "add";
    const attachments = Array.from(form.elements.attachments?.files || []);
    const smetterUrl = form.elements.smetter_url?.value.trim() || "";
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
      attachments: await Promise.all(attachments.map((file) => fileDocumentPayload(file, file.name, "estimate_job_file", "estimate_job"))),
    };
    if (mode === "replace") {
      payload.replace_file_id = form.elements.replace_file_id.value;
    }
    await api(`/api/estimate-jobs/${id}/files`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    qs("#estimateJobFileDialog").close();
    form.reset();
    await loadCoreData();
    await renderEstimateJobs();
    await renderDashboard();
    showToast(attachments.length ? (mode === "replace" ? "Файл сметы заменен, старая версия сохранена" : "Файлы сметы добавлены") : "Ссылка на Сметтер сохранена");
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
    const incompleteExtra = extra_items.some((item) => !item.material || !item.name || !item.unit || Number(item.quantity || 0) <= 0 || !item.reason);
    if (incompleteExtra) {
      showToast("Заполните материал, наименование, ед. измерения, количество и причину");
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
    payload.attachments = await Promise.all(
      Array.from(form.elements.variation_files?.files || []).map((file) =>
        fileDocumentPayload(file, `Вложение к допработе: ${file.name}`, "variation_attachment", "variation")
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
  qs("#knowledgeFolderForm")?.addEventListener("submit", async (event) => {
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
    event.preventDefault();
    const form = qs("#documentForm");
    try {
      const data = formToJson(form);
      const looseFiles = Array.from(form.elements.document_files?.files || []);
      const folderFiles = Array.from(form.elements.document_folder?.files || []);
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
    event.preventDefault();
    const form = qs("#contractForm");
    try {
      const payload = formToJson(form);
      const file = form.elements.contract_document_file.files[0];
      if (file) {
        payload.document_file = await fileDocumentPayload(file, payload.title || file.name, "contract", "contract");
      }
      const materialsFile = form.elements.contract_materials_file?.files?.[0];
      if (materialsFile) {
        payload.materials_file = await fileDocumentPayload(materialsFile, "Материалы по доп. соглашению из Сметтера", "smetter_materials", "contract");
      }
      const worksFile = form.elements.contract_works_file?.files?.[0];
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
  navigator.serviceWorker
    .register("/sw.js", { updateViaCache: "none" })
    .then((registration) => {
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
      registration.update?.().catch(() => undefined);
    })
    .catch(() => undefined);
}

function bindInstallEvents() {
  qs("#installAppButton")?.addEventListener("click", () => {
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
}, 10000);
