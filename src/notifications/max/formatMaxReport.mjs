export const REQUIRED_MAX_REPORT_HEADINGS = [
  "**✅ Строительный контур",
  "**📌 Задача**",
  "**🛠 Что сделано**",
  "**🧪 Проверки**",
  "**🐞 Найденные проблемы**",
  "**⚠️ Что не проверялось**",
  "**📎 Артефакты**",
  "**✅ Итог**",
  "**➡️ Следующий шаг**",
];

function statusIcon(value) {
  if (value === "PASS" || value === "OK") return "✅";
  if (value === "FAIL") return "❌";
  if (value === "PARTIAL" || value === "WARN") return "⚠️";
  return "не запускался";
}

function lines(items, empty = "— нет") {
  const list = (items || []).filter(Boolean);
  if (!list.length) return empty;
  return list.map((item) => `— ${item}`).join("\n");
}

function checkLine(label, value) {
  return `— ${label}: ${statusIcon(value)}`;
}

export function looksCorruptedText(message) {
  const value = String(message || "");
  if (!value.trim()) return false;
  const compact = value.replace(/\s+/g, "");
  const questionCount = [...value].filter((char) => char === "?").length;
  if (compact.includes("?????") && questionCount >= 10) return true;
  const suspiciousLines = value
    .split(/\n/)
    .filter((line) => {
      const clean = line.trim();
      if (clean.length < 18) return false;
      const lineQuestionCount = [...clean].filter((char) => char === "?").length;
      return lineQuestionCount >= 5 && lineQuestionCount / clean.length > 0.25;
    }).length;
  return suspiciousLines >= 2;
}

export function formatMaxReport(input = {}) {
  const checks = input.checks || {};
  const problems = input.problems || [];
  const notChecked = input.notChecked || [];
  const artifacts = input.artifacts || [
    "qa-artifacts/latest/qa-report.md",
    "qa-artifacts/latest/qa-report.json",
  ];
  const result = input.result || input.overall || "PARTIAL";

  return [
    input.heading || "**✅ Строительный контур — отчёт по QA-доработке**",
    "",
    "**📌 Задача**",
    input.task || "Кратко: выполнена доработка приложения.",
    "",
    "**🛠 Что сделано**",
    lines(input.done || []),
    "",
    "**🧪 Проверки**",
    [
      checkLine("Lint", checks.lint),
      checkLine("Typecheck", checks.typecheck),
      checkLine("Unit tests", checks.unit),
      checkLine("E2E tests", checks.e2e),
      checkLine("Scroll QA", checks.scroll),
      checkLine("Button QA", checks.buttons),
      checkLine("Navigation QA", checks.navigation),
      checkLine("Mobile QA", checks.mobile),
      checkLine("Read-only QA", checks.readonly),
      checkLine("Live audit-login actual access", checks.liveAuditLogin || checks.live_audit_login_actual_access),
      checkLine("Snapshot QA consistency", checks.snapshotConsistency || checks.snapshot_qa_consistency),
    ].join("\n"),
    "",
    "**🐞 Найденные проблемы**",
    problems.length ? lines(problems) : "Критических проблем не найдено.",
    "",
    "**⚠️ Что не проверялось**",
    notChecked.length ? lines(notChecked) : "Все обязательные проверки запускались.",
    "",
    "**📎 Артефакты**",
    lines(artifacts),
    "",
    "**✅ Итог**",
    result,
    "",
    "**➡️ Следующий шаг**",
    input.nextStep || "Проверить изменения на своих ролях и написать замечания в чат.",
  ].join("\n");
}

export function validateMaxReport(message) {
  const missing = REQUIRED_MAX_REPORT_HEADINGS.filter((heading) => !String(message || "").includes(heading));
  const hasSectionBreaks = String(message || "").split(/\n\s*\n/).length >= 8;
  const hasLongSingleParagraph = String(message || "")
    .split(/\n\s*\n/)
    .some((paragraph) => paragraph.length > 900);
  const hasCorruptedText = looksCorruptedText(message);
  return {
    ok: missing.length === 0 && hasSectionBreaks && !hasLongSingleParagraph && !hasCorruptedText,
    missing,
    hasSectionBreaks,
    hasLongSingleParagraph,
    hasCorruptedText,
  };
}
