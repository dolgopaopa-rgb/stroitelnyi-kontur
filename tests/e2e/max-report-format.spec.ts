import { expect, test } from "@playwright/test";
import { formatMaxReport, validateMaxReport } from "../helpers/maxFormatter";

test("MAX report has required structured sections", async () => {
  const message = formatMaxReport({
    task: "Проверить шаблон.",
    done: ["Добавлен formatter."],
    checks: { lint: "OK", typecheck: "OK", unit: "OK", e2e: "OK", scroll: "OK", buttons: "OK", navigation: "OK", mobile: "OK", readonly: "OK" },
    result: "PASS",
  });
  for (const heading of [
    "**✅ Строительный контур",
    "**📌 Задача**",
    "**🛠 Что сделано**",
    "**🧪 Проверки**",
    "**🐞 Найденные проблемы**",
    "**⚠️ Что не проверялось**",
    "**📎 Артефакты**",
    "**✅ Итог**",
    "**➡️ Следующий шаг**",
  ]) {
    expect(message).toContain(heading);
  }
  expect(validateMaxReport(message).ok).toBeTruthy();
});

test("MAX report rejects question-mark corrupted text", async () => {
  const message = formatMaxReport({
    task: "????????? ??????? ????? ?????? ? ?????? UX-??????.",
    done: ["??????? audit-login ?????? ????? ????????? ??????."],
    checks: { lint: "OK", typecheck: "OK", unit: "OK", e2e: "OK", scroll: "OK", buttons: "OK", navigation: "OK", mobile: "OK", readonly: "OK" },
    result: "PASS",
  });
  const validation = validateMaxReport(message);
  expect(validation.ok).toBeFalsy();
  expect(validation.hasCorruptedText).toBeTruthy();
});
