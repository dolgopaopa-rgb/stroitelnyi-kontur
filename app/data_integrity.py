from __future__ import annotations

import sqlite3
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
                recommendation="Открыть, объединить или пометить дублем. Автоматически не объединять.",
                auto_fix_safe=False,
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
                recommendation="Скрыть или пересчитать сигнал после проверки отчёта.",
                auto_fix_safe=False,
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
                recommendation="Скрыть уведомление или восстановить связанную сущность.",
                auto_fix_safe=False,
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
            recommendation="Сгруппировать сигналы или скрыть лишние повторы.",
            auto_fix_safe=False,
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
        _add(
            violations,
            violation_type="document_without_classification",
            entity_type="document",
            entity_id=row["id"],
            object_title=row["project_title"] or "",
            reason="Документ требует проверки классификации.",
            severity="info",
            recommendation="Выбрать тип документа или оставить «Не разобрано» до ручной проверки.",
            auto_fix_safe=False,
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
