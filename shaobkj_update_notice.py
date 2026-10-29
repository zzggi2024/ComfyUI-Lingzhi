from __future__ import annotations

import json
import os
import re
import secrets
from pathlib import Path


def _notice_path(app_data_dir: Path, plugin_name: str) -> Path:
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", str(plugin_name or "")).strip("._-")
    return Path(app_data_dir) / f"update-notice-{safe_name or 'plugin'}.json"


def _last_notified_id(app_data_dir: Path, plugin_name: str) -> str:
    try:
        payload = json.loads(_notice_path(app_data_dir, plugin_name).read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return ""
    if not isinstance(payload, dict):
        return ""
    return str(payload.get("last_notified_id") or "").strip()


def build_update_payload(
    update: dict,
    current_version: str,
    app_data_dir: Path,
    plugin_name: str,
) -> dict:
    update = update if isinstance(update, dict) else {}
    latest = str(update.get("latest_version") or "").strip()
    current = str(current_version or "").strip()
    if not latest or latest == current:
        return {}
    if latest.isdigit() and current.isdigit() and int(latest) <= int(current):
        return {}
    notice_id = str(update.get("latest_release_id") or latest).strip()
    return {
        "current_version": current,
        "latest_version": latest,
        "download_url": str(update.get("download_url") or "").strip(),
        "notice_id": notice_id,
        "notify": _last_notified_id(app_data_dir, plugin_name) != notice_id,
    }


def mark_update_notified(app_data_dir: Path, plugin_name: str, notice_id: str) -> None:
    notice_id = str(notice_id or "").strip()
    if not notice_id:
        return
    path = _notice_path(app_data_dir, plugin_name)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.{secrets.token_hex(4)}.tmp")
    temporary.write_text(
        json.dumps({"last_notified_id": notice_id}, ensure_ascii=False),
        encoding="utf-8",
    )
    os.replace(temporary, path)
