from __future__ import annotations

import sqlite3
import re
from datetime import date
from typing import Any


Violation = dict[str, Any]


def _row_exists(db: sqlite3.Connection, table: str, row_id: object) -> bool:
    if not row_id:
        return True
    row = db.execute(f"SELECT id FROM {table} WHERE id = ?", (row_id,)).fetchone()
    return bool(row)


def _add(
    violations: list[Violation],
    *,
    violation_type: str,
    entity_type: str,
    entity_id: object,
    object_title: str = "",
    reason: str,
    severity: str = "warning",
    recommendation: str,
    auto_fix_safe: bool = False,
) -> None:
    violations.append(
        {
            "violation_type": violation_type,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "object": object_title,
            "reason": reason,
            "severity": severity,
            "recommendation": recommendation,
            "auto_fix_safe": bool(auto_fix_safe),
        }
    )


def _table_columns(db: sqlite3.Connection, table: str) -> set[str]:
    return {row["name"] for row in db.execute(f"PRAGMA table_info({table})").fetchall()}


def _count_by(db: sqlite3.Connection, table: str, column: str) -> dict[str, int]:
    if column not in _table_columns(db, table):
        return {}
    rows = db.execute(
        f"""
        SELECT COALESCE(NULLIF({column}, ''), 'empty') AS key, COUNT(*) AS count
        FROM {table}
        GROUP BY COALESCE(NULLIF({column}, ''), 'empty')
        ORDER BY key
        """
    ).fetchall()
    return {str(row["key"]): int(row["count"]) for row in rows}


DOCUMENT_GENERIC_TYPES = {"", "document", "documents", "other", "unclassified"}


def _document_name(row: sqlite3.Row) -> str:
    return f"{row['title'] or ''} {row['file_name'] or ''}".lower()


def _document_type_suggestion(row: sqlite3.Row) -> str:
    raw = str(row["type"] or "").strip()
    if raw and raw not in DOCUMENT_GENERIC_TYPES:
        return raw

    name = _document_name(row)
    mime = str(row["mime_type"] or "").lower()
    related_type = str(row["related_type"] or "").lower()
    process_type = str(row["process_type"] or "").lower()
    is_media = mime.startswith(("image/", "video/")) or bool(re.search(r"\.(mov|mp4|jpe?g|png|webp)$", name))

    if process_type.startswith("variation:"):
        return "extra_work_attachment"
    if related_type == "material_receipt":
        return "photo_video" if is_media else "extra_work_attachment"
    if is_media:
        if re.search(r"кнопка|экран|ошибка|скрин|skrin|oshibka|screen|screenshot|feedback|интерфейс", name):
            return "service_screenshot"
        return "photo_video"
    if re.search(r"проект|пдф|узел|решени", name):
        return "project"
    if re.search(r"смет|задани[ея]\s+на\s+работ|smetter|work_assignment|purchase", name):
        return "estimate"
    if re.search(r"договор|допник|доп\.?\s*соглаш|contract", name):
        return "contract"
    if re.search(r"\bакт\b|кс-?2|кс-?3", name):
        return "act"
    if re.search(r"сч[её]т|invoice", name):
        return "invoice"
    if re.search(r"скрин|skrin|служеб|интерфейс|feedback|ошибка|oshibka|экран|screen|screenshot", name):
        return "service_screenshot"
    return "unclassified"


def _truthy(value: object) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "on"}


def _violation_type_counts(violations: list[Violation], severity: str | None = None) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in violations:
        if severity and item.get("severity") != severity:
            continue
        key = str(item.get("violation_type") or "unknown")
        counts[key] = counts.get(key, 0) + 1
    return dict(sorted(counts.items()))


def _task_violations(db: sqlite3.Connection, violations: list[Violation]) -> None:
    task_columns = _table_columns(db, "tasks")
    execution_overdue_select = "COALESCE(t.is_execution_overdue, 0)" if "is_execution_overdue" in task_columns else "0"
    rows = db.execute(
        f"""
        SELECT t.*, {execution_overdue_select} AS integrity_is_execution_overdue,
               p.title AS project_title, p.id AS existing_project_id
        FROM tasks t
        LEFT JOIN projects p ON p.id = t.project_id
        """
    ).fetchall()
    for row in rows:
        status = str(row["status"] or "")
        if status == "accepted" and _truthy(row["integrity_is_execution_overdue"]):
            _add(
                violations,
                violation_type="accepted_task_in_overdue",
                entity_type="task",
                entity_id=row["id"],
                object_title=row["project_title"] or "",
                reason="Принятая задача имеет прошедший срок и не должна попадать в просроченные.",
                severity="warning",
                recommendation="Проверить фильтр просрочки и исключить accepted/closed/cancelled.",
                auto_fix_safe=False,
            )
        if status in {"waiting_check", "completed_pending_acceptance"} and not row["submitted_at"]:
            _add(
                violations,
                violation_type="waiting_check_without_submitted_at",
                entity_type="task",
                entity_id=row["id"],
                object_title=row["project_title"] or "",
                reason="Задача ждёт проверки, но submitted_at пустой.",
                severity="warning",
                recommendation="Восстановить дату отправки на проверку из task_events или вручную.",
                auto_fix_safe=False,
            )
        if status == "accepted" and not row["accepted_at"]:
            _add(
                violations,
                violation_type="accepted_without_accepted_at",
                entity_type="task",
                entity_id=row["id"],
                object_title=row["project_title"] or "",
                reason="Задача принята, но accepted_at пустой.",
                severity="warning",
                recommendation="Восстановить дату приёмки из task_events или вручную.",
                auto_fix_safe=False,
            )
        if status not in {"new", "in_progress", "waiting_check", "returned", "accepted", "closed", "cancelled", "archived", "completed_pending_acceptance", "in_progress_task", "review"}:
            _add(
                violations,
                violation_type="invalid_task_status",
                entity_type="task",
                entity_id=row["id"],
                object_title=row["project_title"] or "",
                reason=f"Неизвестный статус задачи: {status or 'empty'}.",
                severity="critical",
                recommendation="Выбрать допустимый статус задачи и сохранить через карточку.",
                auto_fix_safe=False,
            )
        if status not in {"accepted", "closed", "cancelled", "archived"} and not row["assignee_id"]:
            _add(
                violations,
                violation_type="task_without_required_assignee",
                entity_type="task",
                entity_id=row["id"],
                object_title=row["project_title"] or "",
                reason="Открытая задача без ответственного.",
                severity="warning",
                recommendation="Назначить исполнителя.",
                auto_fix_safe=False,
            )
        if row["project_id"] and not row["existing_project_id"]:
            _add(
                violations,
                violation_type="task_missing_project",
                entity_type="task",
                entity_id=row["id"],
                reason=f"Задача связана с несуществующим объектом #{row['project_id']}.",
                severity="critical",
                recommendation="Восстановить объект или переназначить задачу.",
                auto_fix_safe=False,
            )


def _photo_report_violations(db: sqlite3.Connection, violations: list[Violation]) -> None:
    inactive = ("archived", "cancelled", "duplicate", "invalid_empty", "rejected", "superseded")
    inactive_sql = ",".join("?" for _ in inactive)
    rows = db.execute(
        f"""
        SELECT pr.*, p.title AS project_title, t.project_id AS task_project_id,
               (SELECT COUNT(*) FROM photo_report_documents prd WHERE prd.photo_report_id = pr.id) AS actual_files_count
        FROM photo_reports pr
        LEFT JOIN projects p ON p.id = pr.project_id
        LEFT JOIN tasks t ON t.id = pr.task_id
        WHERE pr.status NOT IN ({inactive_sql})
        """,
        inactive,
    ).fetchall()
    active_by_task: dict[int, list[sqlite3.Row]] = {}
    source_by_task: dict[int, list[sqlite3.Row]] = {}
    manual_duplicates: dict[tuple[object, object, object], list[sqlite3.Row]] = {}
    for row in rows:
        file_count = int(row["files_count"] or 0)
        actual_count = int(row["actual_files_count"] or 0)
        if file_count <= 0:
            _add(
                violations,
                violation_type="active_photo_report_without_files",
                entity_type="photo_report",
                entity_id=row["id"],
                object_title=row["project_title"] or "",
                reason="Активный фотоотчёт не содержит файлов.",
                severity="critical",
                recommendation="Прикрепить файлы или пометить отчёт invalid_empty/duplicate.",
                auto_fix_safe=False,
            )
        if file_count != actual_count:
            _add(
                violations,
                violation_type="photo_report_files_count_mismatch",
                entity_type="photo_report",
                entity_id=row["id"],
                object_title=row["project_title"] or "",
                reason=f"files_count={file_count}, фактически файлов={actual_count}.",
                severity="warning",
                recommendation="Пересчитать files_count после проверки вложений.",
                auto_fix_safe=True,
            )
        if row["task_id"]:
            active_by_task.setdefault(int(row["task_id"]), []).append(row)
            source_by_task.setdefault(int(row["task_id"]), []).append(row)
            if row["task_project_id"] and int(row["task_project_id"]) != int(row["project_id"]):
                _add(
                    violations,
                    violation_type="photo_report_task_other_project",
                    entity_type="photo_report",
                    entity_id=row["id"],
                    object_title=row["project_title"] or "",
                    reason="Фотоотчёт связан с задачей другого объекта.",
                    severity="critical",
                    recommendation="Связать отчёт с задачей своего объекта или создать отдельную задачу.",
                    auto_fix_safe=False,
                )
        else:
            key = (row["project_id"], row["report_date"], row["author_id"])
            manual_duplicates.setdefault(key, []).append(row)

    for task_id, task_rows in active_by_task.items():
        if len(task_rows) > 1:
            _add(
                violations,
                violation_type="multiple_active_photo_reports_for_task",
                entity_type="task",
                entity_id=task_id,
                object_title=task_rows[0]["project_title"] or "",
                reason=f"На задачу приходится {len(task_rows)} активных фотоотчёта.",
                severity="critical",
                recommendation="Оставить один актуальный отчёт, остальные пометить дублем или superseded.",
                auto_fix_safe=False,
            )

    for task_id, task_rows in source_by_task.items():
        if len(task_rows) > 1:
            _add(
                violations,
                violation_type="task_has_multiple_active_source_task_id",
                entity_type="task",
                entity_id=task_id,
                object_title=task_rows[0]["project_title"] or "",
                reason="У задачи несколько активных отчётов с одинаковым source task.",
                severity="critical",
                recommendation="Открыть отчёты и выбрать актуальный.",
                auto_fix_safe=False,
            )

    for key, duplicate_rows in manual_duplicates.items():
        if len(duplicate_rows) > 1:
            _add(
                violations,
                violation_type="manual_photo_report_duplicate",
                entity_type="photo_report",
                entity_id=",".join(str(row["id"]) for row in duplicate_rows),
                object_title=duplicate_rows[0]["project_title"] or "",
                reason="Несколько ручных фотоотчётов без задачи с одинаковыми объектом, датой и автором.",
                severity="warning",
                recommendation="Оставить самый новый отчёт, остальные пометить дублем.",
                auto_fix_safe=True,
            )

    signal_rows = db.execute(
        """
        SELECT n.*, p.title AS project_title
        FROM notifications n
        LEFT JOIN projects p ON p.id = n.project_id
        WHERE LOWER(COALESCE(n.title, '') || ' ' || COALESCE(n.text, '')) LIKE '%нет фотоотч%'
           OR LOWER(COALESCE(n.title, '') || ' ' || COALESCE(n.text, '')) LIKE '%без фотоотч%'
        """
    ).fetchall()
    present_dates = {
        (int(row["project_id"]), str(row["report_date"]))
        for row in rows
        if row["project_id"] and row["report_date"] and int(row["files_count"] or 0) > 0
    }
    for signal in signal_rows:
        date_text = str(signal["created_at"] or "")[:10]
        if signal["project_id"] and (int(signal["project_id"]), date_text) in present_dates:
            _add(
                violations,
                violation_type="missing_photo_signal_with_existing_report",
                entity_type="notification",
                entity_id=signal["id"],
                object_title=signal["project_title"] or "",
                reason="Есть сигнал «нет фотоотчёта» за дату, где уже есть действующий отчёт.",
                severity="warning",
                recommendation="Удалить устаревший сигнал, так как фотоотчёт уже есть.",
                auto_fix_safe=True,
            )


def _material_violations(db: sqlite3.Connection, violations: list[Violation]) -> None:
    rows = db.execute(
        """
        SELECT b.*, p.title AS project_title,
               creator.name AS creator_name,
               COUNT(m.id) AS items_count,
               SUM(CASE WHEN COALESCE(m.change_type, '') != 'removed' THEN 1 ELSE 0 END) AS active_items_count
        FROM material_request_batches b
        LEFT JOIN projects p ON p.id = b.project_id
        LEFT JOIN users creator ON creator.id = b.creator_id
        LEFT JOIN material_requests m ON m.batch_id = b.id
        GROUP BY b.id
        """
    ).fetchall()
    allowed_stage = {"draft", "needs_approval", "approved", "ordered", "in_transit", "delivered", "closed", "cancelled"}
    allowed_health = {"normal", "at_risk", "problem"}
    for row in rows:
        stage = str(row["stage"] or "")
        health = str(row["health"] or "")
        if stage not in allowed_stage:
            _add(
                violations,
                violation_type="invalid_material_stage",
                entity_type="material_request_batch",
                entity_id=row["id"],
                object_title=row["project_title"] or "",
                reason=f"Недопустимый stage: {stage or 'empty'}.",
                severity="critical",
                recommendation="Выбрать корректный физический этап материала.",
                auto_fix_safe=False,
            )
        if health not in allowed_health:
            _add(
                violations,
                violation_type="invalid_material_health",
                entity_type="material_request_batch",
                entity_id=row["id"],
                object_title=row["project_title"] or "",
                reason=f"Недопустимое health: {health or 'empty'}.",
                severity="critical",
                recommendation="Выбрать корректное состояние материала.",
                auto_fix_safe=False,
            )
        if stage == "delivered" and not row["received_at"]:
            _add(
                violations,
                violation_type="delivered_without_received_at",
                entity_type="material_request_batch",
                entity_id=row["id"],
                object_title=row["project_title"] or "",
                reason="Материал на объекте, но дата получения не заполнена.",
                severity="critical",
                recommendation="Заполнить дату получения или вернуть этап.",
                auto_fix_safe=False,
            )
        if stage == "delivered" and not row["received_by"]:
            _add(
                violations,
                violation_type="delivered_without_received_by",
                entity_type="material_request_batch",
                entity_id=row["id"],
                object_title=row["project_title"] or "",
                reason="Материал на объекте, но не указан подтвердивший получение.",
                severity="critical",
                recommendation="Указать, кто подтвердил получение.",
                auto_fix_safe=False,
            )
        if stage == "ordered" and not row["procurement_responsible_id"]:
            _add(
                violations,
                violation_type="ordered_without_procurement_responsible",
                entity_type="material_request_batch",
                entity_id=row["id"],
                object_title=row["project_title"] or "",
                reason="Материал заказан, но ответственный по закупке не указан.",
                severity="warning",
                recommendation="Назначить ответственного по закупке.",
                auto_fix_safe=False,
            )
        if stage == "in_transit" and not row["planned_delivery_date"]:
            _add(
                violations,
                violation_type="in_transit_without_planned_delivery",
                entity_type="material_request_batch",
                entity_id=row["id"],
                object_title=row["project_title"] or "",
                reason="Материал в пути, но плановая дата доставки не указана.",
                severity="critical",
                recommendation="Заполнить плановую дату доставки.",
                auto_fix_safe=False,
            )
        if not row["project_id"] or not _row_exists(db, "projects", row["project_id"]):
            _add(
                violations,
                violation_type="material_without_project",
                entity_type="material_request_batch",
                entity_id=row["id"],
                reason="Заявка материалов связана с отсутствующим объектом.",
                severity="critical",
                recommendation="Восстановить объект или переназначить заявку.",
                auto_fix_safe=False,
            )
        if health == "problem" and not (row["health_comment"] or row["receipt_comment"] or row["procurement_comment"] or row["comment"]):
            _add(
                violations,
                violation_type="material_problem_without_comment",
                entity_type="material_request_batch",
                entity_id=row["id"],
                object_title=row["project_title"] or "",
                reason="У материала состояние «Проблема», но нет поясняющего комментария.",
                severity="warning",
                recommendation="Добавить комментарий с причиной проблемы.",
                auto_fix_safe=False,
            )
        if int(row["active_items_count"] or 0) <= 0:
            _add(
                violations,
                violation_type="material_batch_without_active_items",
                entity_type="material_request_batch",
                entity_id=row["id"],
                object_title=row["project_title"] or "",
                reason="Заявка не содержит активных позиций.",
                severity="warning",
                recommendation="Добавить позицию или удалить/закрыть заявку.",
                auto_fix_safe=False,
            )
        open_blocker = db.execute(
            """
            SELECT id
            FROM blockers
            WHERE linked_material_request_id = ?
              AND status NOT IN ('resolved', 'closed')
            LIMIT 1
            """,
            (row["id"],),
        ).fetchone()
        if stage == "closed" and open_blocker:
            _add(
                violations,
                violation_type="closed_material_with_open_blocker",
                entity_type="material_request_batch",
                entity_id=row["id"],
                object_title=row["project_title"] or "",
                reason="Заявка закрыта, но связанный блокер ещё открыт.",
                severity="warning",
                recommendation="Закрыть блокер или вернуть заявку в рабочий этап.",
                auto_fix_safe=False,
            )

    orphan_rows = db.execute(
        """
        SELECT m.*, p.title AS project_title
        FROM material_requests m
        LEFT JOIN projects p ON p.id = m.project_id
        WHERE p.id IS NULL
        """
    ).fetchall()
    for row in orphan_rows:
        _add(
            violations,
            violation_type="material_item_without_project",
            entity_type="material_request",
            entity_id=row["id"],
            reason="Позиция материала связана с отсутствующим объектом.",
            severity="critical",
            recommendation="Восстановить объект или удалить ошибочную позицию.",
            auto_fix_safe=False,
        )


def _other_violations(db: sqlite3.Connection, violations: list[Violation]) -> None:
    notification_rows = db.execute(
        """
        SELECT *
        FROM notifications
        WHERE related_type IS NOT NULL
          AND related_type != ''
          AND related_id IS NOT NULL
        """
    ).fetchall()
    table_by_type = {
        "task": "tasks",
        "photo_report": "photo_reports",
        "material_request_batch": "material_request_batches",
        "object_remark": "object_remarks",
        "variation": "variations",
        "project": "projects",
    }
    for row in notification_rows:
        table = table_by_type.get(str(row["related_type"] or ""))
        if table and not _row_exists(db, table, row["related_id"]):
            _add(
                violations,
                violation_type="notification_missing_entity",
                entity_type="notification",
                entity_id=row["id"],
                reason=f"Уведомление связано с отсутствующей сущностью {row['related_type']} #{row['related_id']}.",
                severity="warning",
                recommendation="Удалить уведомление, которое ведёт в отсутствующую сущность.",
                auto_fix_safe=True,
            )

    duplicate_signals = db.execute(
        """
        SELECT project_id, related_type, related_id, title, date(created_at) AS day, COUNT(*) AS count,
               GROUP_CONCAT(id) AS ids
        FROM notifications
        WHERE COALESCE(title, '') != ''
        GROUP BY project_id, related_type, related_id, title, date(created_at)
        HAVING COUNT(*) > 1
        """
    ).fetchall()
    for row in duplicate_signals:
        _add(
            violations,
            violation_type="duplicate_signal",
            entity_type="notification",
            entity_id=row["ids"],
            reason=f"Дублирующийся сигнал: {row['title']} ({row['count']} повторов за день).",
            severity="warning",
            recommendation="Оставить самый новый сигнал, лишние повторы удалить.",
            auto_fix_safe=True,
        )

    document_rows = db.execute(
        """
        SELECT d.*, p.title AS project_title
        FROM documents d
        LEFT JOIN projects p ON p.id = d.project_id
        WHERE COALESCE(d.type, '') IN ('', 'other', 'unclassified')
        """
    ).fetchall()
    for row in document_rows:
        suggested_type = _document_type_suggestion(row)
        can_fix = suggested_type not in DOCUMENT_GENERIC_TYPES
        _add(
            violations,
            violation_type="document_without_classification",
            entity_type="document",
            entity_id=row["id"],
            object_title=row["project_title"] or "",
            reason="Документ требует проверки классификации.",
            severity="info",
            recommendation=f"Auto-classify document as {suggested_type}." if can_fix else "Leave document for manual classification.",
            auto_fix_safe=can_fix,
        )


def run_data_integrity_checks(db: sqlite3.Connection) -> dict[str, Any]:
    violations: list[Violation] = []
    _task_violations(db, violations)
    _photo_report_violations(db, violations)
    _material_violations(db, violations)
    _other_violations(db, violations)
    critical = sum(1 for item in violations if item["severity"] == "critical")
    warnings = sum(1 for item in violations if item["severity"] == "warning")
    info = sum(1 for item in violations if item["severity"] == "info")
    return {
        "agent": "Data Integrity Agent",
        "status": "critical" if critical else "warning" if warnings else "ok",
        "checked_at": date.today().isoformat(),
        "summary": {
            "critical": critical,
            "warnings": warnings,
            "info": info,
            "total": len(violations),
            "tasks": sum(1 for item in violations if item["entity_type"] == "task"),
            "photo_reports": sum(1 for item in violations if item["entity_type"] == "photo_report"),
            "materials": sum(1 for item in violations if item["entity_type"] in {"material_request_batch", "material_request"}),
            "signals": sum(1 for item in violations if item["entity_type"] == "notification"),
            "documents": sum(1 for item in violations if item["entity_type"] == "document"),
            "blockers": sum(1 for item in violations if item["entity_type"] == "blocker"),
        },
        "violation_counts": _violation_type_counts(violations),
        "warning_counts_by_type": _violation_type_counts(violations, "warning"),
        "material_counts": {
            "stage": _count_by(db, "material_request_batches", "stage"),
            "health": _count_by(db, "material_request_batches", "health"),
            "legacy_status": _count_by(db, "material_request_batches", "status"),
        },
        "violations": violations,
    }


def plan_data_integrity_fixes(db: sqlite3.Connection) -> dict[str, Any]:
    inactive_photo_statuses = ("archived", "cancelled", "duplicate", "invalid_empty", "rejected", "superseded")
    inactive_sql = ",".join("?" for _ in inactive_photo_statuses)
    actions: list[dict[str, Any]] = []

    mismatch_rows = db.execute(
        """
        SELECT pr.id,
               COALESCE(pr.files_count, 0) AS files_count,
               (SELECT COUNT(*) FROM photo_report_documents prd WHERE prd.photo_report_id = pr.id) AS actual_files_count
        FROM photo_reports pr
        WHERE COALESCE(pr.files_count, 0) != (
            SELECT COUNT(*)
            FROM photo_report_documents prd
            WHERE prd.photo_report_id = pr.id
        )
        """
    ).fetchall()
    if mismatch_rows:
        actions.append(
            {
                "action": "recount_photo_report_files_count",
                "entity_type": "photo_report",
                "count": len(mismatch_rows),
                "ids": [int(row["id"]) for row in mismatch_rows],
            }
        )

    manual_rows = db.execute(
        f"""
        SELECT pr.*,
               (SELECT COUNT(*) FROM photo_report_documents prd WHERE prd.photo_report_id = pr.id) AS actual_files_count
        FROM photo_reports pr
        WHERE pr.task_id IS NULL
          AND pr.status NOT IN ({inactive_sql})
        ORDER BY pr.project_id, pr.report_date, pr.author_id,
                 actual_files_count DESC,
                 datetime(COALESCE(pr.created_at, '1970-01-01')) DESC,
                 pr.id DESC
        """,
        inactive_photo_statuses,
    ).fetchall()
    grouped_manual: dict[tuple[object, object, object], list[sqlite3.Row]] = {}
    for row in manual_rows:
        grouped_manual.setdefault((row["project_id"], row["report_date"], row["author_id"]), []).append(row)
    duplicate_photo_ids: list[int] = []
    for rows in grouped_manual.values():
        if len(rows) > 1:
            duplicate_photo_ids.extend(int(row["id"]) for row in rows[1:])
    if duplicate_photo_ids:
        actions.append(
            {
                "action": "mark_manual_photo_report_duplicates",
                "entity_type": "photo_report",
                "count": len(duplicate_photo_ids),
                "ids": duplicate_photo_ids,
            }
        )

    signal_rows = db.execute(
        f"""
        SELECT n.id
        FROM notifications n
        WHERE (
            LOWER(COALESCE(n.title, '') || ' ' || COALESCE(n.text, '')) LIKE '%нет фотоотч%'
            OR LOWER(COALESCE(n.title, '') || ' ' || COALESCE(n.text, '')) LIKE '%без фотоотч%'
        )
        AND n.project_id IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM photo_reports pr
            WHERE pr.project_id = n.project_id
              AND pr.report_date = date(n.created_at)
              AND COALESCE(pr.files_count, 0) > 0
              AND pr.status NOT IN ({inactive_sql})
        )
        """,
        inactive_photo_statuses,
    ).fetchall()
    stale_no_photo_ids = [int(row["id"]) for row in signal_rows]
    if stale_no_photo_ids:
        actions.append(
            {
                "action": "delete_stale_no_photo_signals",
                "entity_type": "notification",
                "count": len(stale_no_photo_ids),
                "ids": stale_no_photo_ids,
            }
        )

    table_by_type = {
        "task": "tasks",
        "photo_report": "photo_reports",
        "material_request_batch": "material_request_batches",
        "object_remark": "object_remarks",
        "variation": "variations",
        "project": "projects",
    }
    missing_entity_ids: list[int] = []
    notification_rows = db.execute(
        """
        SELECT id, related_type, related_id
        FROM notifications
        WHERE related_type IS NOT NULL
          AND related_type != ''
          AND related_id IS NOT NULL
        """
    ).fetchall()
    for row in notification_rows:
        table = table_by_type.get(str(row["related_type"] or ""))
        if table and not _row_exists(db, table, row["related_id"]):
            missing_entity_ids.append(int(row["id"]))
    if missing_entity_ids:
        actions.append(
            {
                "action": "delete_notifications_missing_entity",
                "entity_type": "notification",
                "count": len(missing_entity_ids),
                "ids": missing_entity_ids,
            }
        )

    duplicate_rows = db.execute(
        """
        SELECT project_id, related_type, related_id, title, date(created_at) AS day,
               GROUP_CONCAT(id) AS ids
        FROM notifications
        WHERE COALESCE(title, '') != ''
        GROUP BY project_id, related_type, related_id, title, date(created_at)
        HAVING COUNT(*) > 1
        """
    ).fetchall()
    duplicate_notification_ids: list[int] = []
    for row in duplicate_rows:
        ids = [int(item) for item in str(row["ids"] or "").split(",") if item]
        if len(ids) > 1:
            duplicate_notification_ids.extend(sorted(ids, reverse=True)[1:])
    duplicate_notification_ids = sorted(set(duplicate_notification_ids) - set(missing_entity_ids) - set(stale_no_photo_ids))
    if duplicate_notification_ids:
        actions.append(
            {
                "action": "delete_duplicate_signals",
                "entity_type": "notification",
                "count": len(duplicate_notification_ids),
                "ids": duplicate_notification_ids,
            }
        )

    document_rows = db.execute(
        """
        SELECT *
        FROM documents
        WHERE COALESCE(type, '') IN ('', 'other', 'unclassified')
        """
    ).fetchall()
    document_updates: dict[str, list[int]] = {}
    for row in document_rows:
        suggested_type = _document_type_suggestion(row)
        if suggested_type in DOCUMENT_GENERIC_TYPES:
            continue
        document_updates.setdefault(suggested_type, []).append(int(row["id"]))
    for document_type, ids in sorted(document_updates.items()):
        actions.append(
            {
                "action": "classify_documents",
                "entity_type": "document",
                "document_type": document_type,
                "count": len(ids),
                "ids": ids,
            }
        )

    return {
        "agent": "Data Integrity Agent",
        "mode": "plan",
        "auto_fix_safe": True,
        "actions": actions,
        "total_actions": len(actions),
        "total_entities": sum(int(action["count"]) for action in actions),
    }


def _apply_id_update(db: sqlite3.Connection, sql: str, ids: list[int]) -> int:
    if not ids:
        return 0
    db.executemany(sql, [(item_id,) for item_id in ids])
    return len(ids)


def apply_data_integrity_fixes(db: sqlite3.Connection, *, dry_run: bool = True) -> dict[str, Any]:
    plan = plan_data_integrity_fixes(db)
    applied: list[dict[str, Any]] = []
    if dry_run:
        return {**plan, "mode": "dry_run", "applied": applied}

    for action in plan["actions"]:
        ids = [int(item) for item in action.get("ids", [])]
        name = str(action.get("action") or "")
        count = 0
        if name == "recount_photo_report_files_count":
            before_changes = db.total_changes
            db.execute(
                """
                UPDATE photo_reports
                SET files_count = (
                    SELECT COUNT(*)
                    FROM photo_report_documents prd
                    WHERE prd.photo_report_id = photo_reports.id
                ),
                    updated_at = CURRENT_TIMESTAMP
                WHERE files_count IS NULL
                   OR files_count != (
                       SELECT COUNT(*)
                       FROM photo_report_documents prd
                       WHERE prd.photo_report_id = photo_reports.id
                   )
                """
            )
            count = int(db.total_changes - before_changes)
        elif name == "mark_manual_photo_report_duplicates":
            count = _apply_id_update(
                db,
                """
                UPDATE photo_reports
                SET status = 'duplicate',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                ids,
            )
        elif name in {"delete_stale_no_photo_signals", "delete_notifications_missing_entity", "delete_duplicate_signals"}:
            count = _apply_id_update(db, "DELETE FROM notifications WHERE id = ?", ids)
        elif name == "classify_documents":
            document_type = str(action.get("document_type") or "").strip()
            if document_type:
                db.executemany(
                    """
                    UPDATE documents
                    SET type = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    [(document_type, item_id) for item_id in ids],
                )
                count = len(ids)
        applied.append({k: v for k, v in action.items() if k != "ids"} | {"applied": count})

    return {
        **plan,
        "mode": "apply",
        "applied": applied,
        "applied_entities": sum(int(item.get("applied") or 0) for item in applied),
    }
