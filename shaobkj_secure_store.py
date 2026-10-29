from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import platform
import re
import socket
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

SERVICE_NAME = "Shaobkj-GitHub"
FALLBACK_VERSION = 1
FALLBACK_AAD = b"Shaobkj secure store v1"
FALLBACK_SECRET = hashlib.sha256(b"SHAOBKJ_SECURE_STORE_2026_V1").digest()


class SecretStoreError(RuntimeError):
    pass


def _load_keyring():
    import keyring

    return keyring


def _safe_component(value: str) -> str:
    component = re.sub(r"[^A-Za-z0-9._-]+", "_", (value or "").strip())
    return component.strip("._-") or "ShaobkjPlugin"


def credential_name(kind: str, plugin_name: str = "") -> str:
    kind_component = _safe_component(kind).lower()
    if plugin_name:
        return f"{SERVICE_NAME}/{_safe_component(plugin_name)}/{kind_component}"
    return f"{SERVICE_NAME}/{kind_component}"


def _app_data_dir() -> Path:
    system_name = platform.system().lower()
    if system_name == "windows":
        base = Path(os.getenv("APPDATA") or Path.home() / "AppData" / "Roaming")
    elif system_name == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.getenv("XDG_DATA_HOME") or Path.home() / ".local" / "share")
    return base / SERVICE_NAME


def _fallback_store_path() -> Path:
    return _app_data_dir() / "secure-store.json"


def _machine_identity() -> str:
    parts = [platform.system().lower()]
    configured_instance = (
        (os.getenv("SHAOBKJ_INSTANCE_ID") or "").strip().upper()
        or (os.getenv("COMFYUI_INSTANCE_ID") or "").strip().upper()
        or (os.getenv("RUNPOD_POD_ID") or "").strip().lower()
    )
    state_identity = ""
    try:
        device = json.loads((_app_data_dir() / "device-state.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        device = {}
    if isinstance(device, dict):
        state_identity = str(device.get("instance_id") or device.get("device_id") or "").strip().upper()
    stable_identity = configured_instance or state_identity
    if stable_identity:
        parts.append(stable_identity)
    else:
        parts.append(socket.gethostname().lower())
        for path in (Path("/etc/machine-id"), Path("/var/lib/dbus/machine-id")):
            try:
                value = path.read_text(encoding="utf-8", errors="ignore").strip()
            except OSError:
                value = ""
            parts.append(value)
    return "\0".join(parts)


def _fallback_key() -> bytes:
    identity = _machine_identity().encode("utf-8", errors="ignore")
    return hmac.new(FALLBACK_SECRET, identity, hashlib.sha256).digest()


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    encoded = str(value or "")
    return base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))


def _read_fallback_store() -> dict[str, str]:
    path = _fallback_store_path()
    if not path.is_file():
        return {}
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
        if document.get("version") != FALLBACK_VERSION:
            raise ValueError("unsupported secure store version")
        plaintext = AESGCM(_fallback_key()).decrypt(
            _b64decode(document["nonce"]),
            _b64decode(document["ciphertext"]),
            FALLBACK_AAD,
        )
        payload = json.loads(plaintext.decode("utf-8"))
    except (AttributeError, InvalidTag, KeyError, TypeError, ValueError, OSError, json.JSONDecodeError) as exc:
        raise SecretStoreError("云端加密凭据损坏或不属于当前实例，请重新授权。") from exc
    if not isinstance(payload, dict) or any(
        not isinstance(key, str) or not isinstance(value, str)
        for key, value in payload.items()
    ):
        raise SecretStoreError("云端加密凭据格式不正确，请重新授权。")
    return payload


def _write_fallback_store(payload: dict[str, str]) -> None:
    path = _fallback_store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        path.parent.chmod(0o700)
    except OSError:
        pass
    nonce = os.urandom(12)
    ciphertext = AESGCM(_fallback_key()).encrypt(
        nonce,
        json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"),
        FALLBACK_AAD,
    )
    document = {
        "version": FALLBACK_VERSION,
        "nonce": _b64encode(nonce),
        "ciphertext": _b64encode(ciphertext),
    }
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temporary.write_text(
            json.dumps(document, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        try:
            temporary.chmod(0o600)
        except OSError:
            pass
        os.replace(temporary, path)
    except OSError as exc:
        try:
            temporary.unlink()
        except OSError:
            pass
        raise SecretStoreError("无法写入云端加密凭据，请检查应用数据目录权限。") from exc


def _delete_fallback_secret(name: str) -> None:
    path = _fallback_store_path()
    if not path.is_file():
        return
    payload = _read_fallback_store()
    if name not in payload:
        return
    payload.pop(name, None)
    if payload:
        _write_fallback_store(payload)
        return
    try:
        path.unlink()
    except OSError as exc:
        raise SecretStoreError(f"无法删除云端加密凭据：{name}。") from exc


def _keyring_backend():
    try:
        keyring = _load_keyring()
        backend = keyring.get_keyring()
    except Exception:
        return None
    backend_type = type(backend)
    descriptor = f"{backend_type.__module__}.{backend_type.__name__}".lower()
    if any(marker in descriptor for marker in ("plaintext", "null", "fail")):
        return None
    return keyring


def get_secret(name: str) -> str | None:
    name = (name or "").strip()
    if not name:
        raise ValueError("凭据名称不能为空。")
    keyring = _keyring_backend()
    if keyring is not None:
        try:
            value = keyring.get_password(SERVICE_NAME, name)
        except Exception:
            value = None
        if value is not None:
            if not isinstance(value, str):
                raise SecretStoreError(f"系统安全凭据库返回了无效数据：{name}")
            return value
    return _read_fallback_store().get(name)


def set_secret(name: str, value: str) -> None:
    name = (name or "").strip()
    if not name:
        raise ValueError("凭据名称不能为空。")
    value = str(value or "")
    if not value:
        delete_secret(name)
        return
    keyring = _keyring_backend()
    if keyring is not None:
        try:
            keyring.set_password(SERVICE_NAME, name, value)
        except Exception:
            pass
        else:
            try:
                _delete_fallback_secret(name)
            except SecretStoreError:
                pass
            return
    payload = _read_fallback_store()
    payload[name] = value
    _write_fallback_store(payload)


def delete_secret(name: str) -> None:
    name = (name or "").strip()
    if not name:
        raise ValueError("凭据名称不能为空。")
    keyring = _keyring_backend()
    if keyring is not None:
        try:
            keyring.delete_password(SERVICE_NAME, name)
        except Exception:
            pass
    _delete_fallback_secret(name)
