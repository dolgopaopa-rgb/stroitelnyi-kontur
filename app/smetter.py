from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import dataclass
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request, urlopen


SMETTER_DEFAULT_BASE_URL = "https://app.smetter.ru"
SMETTER_ALLOWED_HOSTS = {"app.smetter.ru"}


class SmetterError(RuntimeError):
    pass


class SmetterConfigurationError(SmetterError):
    pass


class SmetterLinkError(SmetterError):
    pass


class SmetterApiError(SmetterError):
    pass


@dataclass(frozen=True)
class SmetterReference:
    source_url: str
    project_id: int | None
    estimate_id: int


def _positive_int(value: object) -> int | None:
    try:
        parsed = int(str(value or "").strip())
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _query_int(query: dict[str, list[str]], *names: str) -> int | None:
    lowered = {key.lower(): values for key, values in query.items()}
    for name in names:
        for value in lowered.get(name.lower(), []):
            parsed = _positive_int(value)
            if parsed:
                return parsed
    return None


def parse_smetter_reference(value: str) -> SmetterReference:
    raw = str(value or "").strip()
    if not raw:
        raise SmetterLinkError("Вставьте ссылку на конкретную смету в Сметтере.")
    if raw.isdigit():
        estimate_id = _positive_int(raw)
        if estimate_id:
            return SmetterReference(raw, None, estimate_id)

    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    if parsed.scheme != "https" or parsed.hostname not in SMETTER_ALLOWED_HOSTS:
        raise SmetterLinkError("Нужна ссылка вида https://app.smetter.ru/... на конкретную смету.")

    query = parse_qs(parsed.query)
    project_id = _query_int(query, "project_id", "projectId", "project")
    estimate_id = _query_int(query, "estimate_id", "estimateId", "estimate")
    path = parsed.path or ""
    if not project_id:
        match = re.search(r"/(?:projects?|objects?)/(?:view/)?(\d+)(?:/|$)", path, re.IGNORECASE)
        project_id = _positive_int(match.group(1)) if match else None
    if not estimate_id:
        match = re.search(r"/(?:estimates?|estimate)/(?:view/)?(\d+)(?:/|$)", path, re.IGNORECASE)
        estimate_id = _positive_int(match.group(1)) if match else None
    if not estimate_id:
        numeric_segments = [_positive_int(part) for part in path.split("/")]
        numeric_segments = [part for part in numeric_segments if part]
        if len(numeric_segments) >= 2:
            project_id = project_id or numeric_segments[-2]
            estimate_id = numeric_segments[-1]
    if not estimate_id:
        raise SmetterLinkError("В ссылке не найден номер конкретной сметы. Откройте смету и скопируйте её адрес.")
    return SmetterReference(raw, project_id, estimate_id)


def _payload_data(payload: object) -> object:
    if isinstance(payload, dict) and "data" in payload:
        return payload.get("data")
    return payload


def _rows(payload: object) -> list[dict]:
    data = _payload_data(payload)
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    if isinstance(data, dict):
        for key in ("items", "rows", "projects", "estimates"):
            value = data.get(key)
            if isinstance(value, list):
                return [row for row in value if isinstance(row, dict)]
    return []


def _project_rows(payload: object) -> list[dict]:
    projects: list[dict] = []

    def visit(item: object) -> None:
        if not isinstance(item, dict):
            return
        nested = item.get("projects")
        if isinstance(nested, list):
            for child in nested:
                visit(child)
        if _positive_int(item.get("id")) and "name" in item and not isinstance(nested, list):
            projects.append(item)

    for row in _rows(payload):
        visit(row)
    return projects


class SmetterClient:
    def __init__(
        self,
        *,
        token: str | None = None,
        company_id: int | str | None = None,
        base_url: str | None = None,
        timeout_seconds: float | None = None,
        fetcher: Callable[[str], object] | None = None,
    ) -> None:
        self.token = str(token if token is not None else os.environ.get("SMETTER_API_TOKEN", "")).strip()
        self.company_id = _positive_int(company_id if company_id is not None else os.environ.get("SMETTER_COMPANY_ID", ""))
        self.base_url = str(base_url or os.environ.get("SMETTER_API_BASE_URL", SMETTER_DEFAULT_BASE_URL)).rstrip("/")
        self.timeout_seconds = float(timeout_seconds or os.environ.get("SMETTER_API_TIMEOUT_SECONDS", "30") or 30)
        self.fetcher = fetcher
        parsed_base = urlparse(self.base_url)
        if parsed_base.scheme != "https" or parsed_base.hostname not in SMETTER_ALLOWED_HOSTS:
            raise SmetterConfigurationError("Адрес API Сметтера должен вести на https://app.smetter.ru.")
        if not self.company_id:
            raise SmetterConfigurationError("Не задан SMETTER_COMPANY_ID.")
        if not self.fetcher and not self.token:
            raise SmetterConfigurationError("Не задан SMETTER_API_TOKEN.")

    def get(self, path: str) -> object:
        if not re.fullmatch(r"/public-api/v2/[A-Za-z0-9_?=&%./{}-]+", path):
            raise SmetterApiError("Запрошен неподдерживаемый путь API Сметтера.")
        if self.fetcher:
            return self.fetcher(path)
        request = Request(
            f"{self.base_url}{path}",
            method="GET",
            headers={"Authorization": f"Bearer {self.token}", "Accept": "application/json"},
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                raw = response.read()
        except HTTPError as error:
            if error.code in {401, 403}:
                raise SmetterApiError("Сметтер отклонил ключ API. Проверьте доступ компании.") from error
            if error.code == 404:
                raise SmetterApiError("Смета по этой ссылке не найдена или недоступна ключу API.") from error
            raise SmetterApiError(f"Сметтер вернул ошибку HTTP {error.code}.") from error
        except (URLError, TimeoutError, OSError) as error:
            raise SmetterApiError("Сметтер временно недоступен. Карточку можно сохранить и повторить загрузку позже.") from error
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise SmetterApiError("Сметтер вернул ответ в неизвестном формате.") from error

    def list_projects(self) -> list[dict]:
        return _project_rows(self.get(f"/public-api/v2/companies/{self.company_id}/projects"))

    def list_estimates(self, project_id: int) -> list[dict]:
        return _rows(self.get(f"/public-api/v2/companies/{self.company_id}/projects/{project_id}/estimates"))

    def find_project_for_estimate(self, estimate_id: int) -> int:
        for project in self.list_projects():
            project_id = _positive_int(project.get("id"))
            if not project_id:
                continue
            if any(_positive_int(item.get("id")) == estimate_id for item in self.list_estimates(project_id)):
                return project_id
        raise SmetterLinkError("Смета не найдена среди проектов компании, доступных API.")

    def load_estimate(self, link: str) -> dict:
        reference = parse_smetter_reference(link)
        project_id = reference.project_id or self.find_project_for_estimate(reference.estimate_id)
        payload = self.get(
            f"/public-api/v2/companies/{self.company_id}/projects/{project_id}/estimates/{reference.estimate_id}"
        )
        estimate = _payload_data(payload)
        if not isinstance(estimate, dict):
            raise SmetterApiError("Сметтер не вернул данные выбранной сметы.")
        actual_id = _positive_int(estimate.get("id"))
        if actual_id and actual_id != reference.estimate_id:
            raise SmetterApiError("Сметтер вернул другую смету. Автоматическая загрузка остановлена.")
        return build_estimate_snapshot(
            estimate,
            source_url=reference.source_url,
            company_id=int(self.company_id),
            project_id=project_id,
        )


def _number(value: object) -> float:
    try:
        return float(str(value or "0").replace(" ", "").replace(",", "."))
    except (TypeError, ValueError):
        return 0.0


def _position_rows(position: dict, section_parts: list[str]) -> list[dict]:
    if position.get("is_canceled"):
        return []
    title = str(position.get("name") or "").strip()
    children = [item for item in (position.get("children") or []) if isinstance(item, dict)]
    if children:
        next_parts = [*section_parts, title] if title else section_parts
        rows: list[dict] = []
        for child in children:
            rows.extend(_position_rows(child, next_parts))
        return rows
    position_type = str(position.get("type") or "").strip().lower()
    if position_type not in {"labor", "material"} or not title:
        return []
    return [
        {
            "source_id": _positive_int(position.get("id")),
            "source_guid": str(position.get("guid") or ""),
            "directory_guid": str(position.get("directory_position_guid") or ""),
            "section": " / ".join(part for part in section_parts if part) or "Без раздела",
            "title": title,
            "unit": str(position.get("unit") or "").strip(),
            "estimated_quantity": _number(position.get("amount")),
            "type": position_type,
        }
    ]


def build_estimate_snapshot(estimate: dict, *, source_url: str, company_id: int, project_id: int) -> dict:
    estimate_id = _positive_int(estimate.get("id"))
    if not estimate_id:
        raise SmetterApiError("У сметы отсутствует идентификатор.")
    positions: list[dict] = []
    for step in estimate.get("steps") or []:
        if not isinstance(step, dict):
            continue
        section = str(step.get("name") or "Без этапа").strip() or "Без этапа"
        for position in step.get("positions") or []:
            if isinstance(position, dict):
                positions.extend(_position_rows(position, [section]))
    works = [row for row in positions if row["type"] == "labor" and row["estimated_quantity"] > 0]
    materials = [row for row in positions if row["type"] == "material" and row["estimated_quantity"] > 0]
    digest_payload = {
        "company_id": company_id,
        "project_id": project_id,
        "estimate_id": estimate_id,
        "estimate_guid": str(estimate.get("guid") or ""),
        "name": str(estimate.get("name") or ""),
        "status": estimate.get("status"),
        "created_at": str(estimate.get("created_at") or ""),
        "works": works,
        "materials": materials,
    }
    digest = hashlib.sha256(
        json.dumps(digest_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return {
        **digest_payload,
        "source_url": source_url,
        "digest": digest,
        "works": works,
        "materials": materials,
    }


def source_api_path(snapshot: dict) -> str:
    return (
        f"/public-api/v2/companies/{quote(str(snapshot['company_id']))}"
        f"/projects/{quote(str(snapshot['project_id']))}/estimates/{quote(str(snapshot['estimate_id']))}"
    )
