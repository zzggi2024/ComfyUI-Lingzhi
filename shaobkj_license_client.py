from __future__ import annotations

import base64
import json
import time
import urllib.error
import urllib.request

from cryptography.exceptions import InvalidSignature, InvalidTag
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

try:
    from .shaobkj_tls_utils import create_ssl_context, open_url
except ImportError:
    from .shaobkj_tls_utils import create_ssl_context, open_url

API_BASE = "https://zhijia88.cn/"
REQUEST_TIMEOUT_SECONDS = 15
LICENSE_WRAP_INFO = b"Shaobkj license content key"
LICENSE_WRAP_AAD = b"Shaobkj wrapped content key"
CLOCK_ROLLBACK_TOLERANCE_SECONDS = 300


class LicenseError(RuntimeError):
    pass


def _b64decode(value: str) -> bytes:
    normalized = (value or "").strip()
    return base64.urlsafe_b64decode(normalized + "=" * (-len(normalized) % 4))


def _url(path: str) -> str:
    return API_BASE.rstrip("/") + "/" + path.lstrip("/")


def _request_json(path: str, payload: dict | None = None) -> dict:
    headers = {"Accept": "application/json"}
    data = None
    method = "GET"
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        method = "POST"
    request = urllib.request.Request(
        _url(path),
        data=data,
        headers=headers,
        method=method,
    )
    try:
        with open_url(
            request,
            timeout=REQUEST_TIMEOUT_SECONDS,
            context=create_ssl_context(),
        ) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        try:
            error_payload = json.loads(exc.read().decode("utf-8"))
        except Exception:
            error_payload = {}
        message = error_payload.get("error") or error_payload.get("message") or "服务端拒绝请求"
        raise LicenseError(f"授权服务请求失败: HTTP {exc.code}: {message}") from exc
    except (urllib.error.URLError, OSError) as exc:
        raise LicenseError(f"无法连接授权服务: {exc}") from exc
    try:
        result = json.loads(raw) if raw else {}
    except json.JSONDecodeError as exc:
        raise LicenseError("授权服务返回了无效 JSON。") from exc
    if not isinstance(result, dict):
        raise LicenseError("授权服务返回格式不正确。")
    if result.get("error"):
        raise LicenseError(f"授权服务返回错误: {result['error']}")
    return result


def get_server_signing_key() -> dict:
    result = _request_json("/Shaobkj/api/license/signing-key")
    if not result.get("public_key") or not result.get("key_id"):
        raise LicenseError("授权服务未返回有效签名公钥。")
    return result


def register_release(payload: dict) -> dict:
    return _request_json("/Shaobkj/api/license/releases/register", payload)


def request_lease(payload: dict) -> dict:
    return _request_json("/Shaobkj/api/license/lease", payload)


def verify_lease(lease: dict, signature: str, public_key: str) -> dict:
    if not isinstance(lease, dict):
        raise LicenseError("许可证格式不正确。")
    try:
        key = Ed25519PublicKey.from_public_bytes(_b64decode(public_key))
        signed = json.dumps(
            lease,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        key.verify(_b64decode(signature), signed)
    except (InvalidSignature, ValueError, TypeError) as exc:
        raise LicenseError("许可证签名验证失败。") from exc
    return lease


def unwrap_content_key(wrapped: dict, private_key: str) -> bytes:
    try:
        private = X25519PrivateKey.from_private_bytes(_b64decode(private_key))
        ephemeral = X25519PublicKey.from_public_bytes(_b64decode(wrapped["ephemeral_public_key"]))
        shared = private.exchange(ephemeral)
        key = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=_b64decode(wrapped["salt"]),
            info=LICENSE_WRAP_INFO,
        ).derive(shared)
        return AESGCM(key).decrypt(
            _b64decode(wrapped["nonce"]),
            _b64decode(wrapped["ciphertext"]),
            LICENSE_WRAP_AAD,
        )
    except (KeyError, InvalidTag, ValueError, TypeError) as exc:
        raise LicenseError("发布内容密钥解封装失败。") from exc


def is_lease_usable(lease: dict, now: float | None = None, last_trusted_time: float = 0) -> bool:
    if not isinstance(lease, dict):
        return False
    try:
        expires_at = int(lease.get("expires_at") or 0)
        issued_at = int(lease.get("issued_at") or 0)
    except (TypeError, ValueError):
        return False
    current = time.time() if now is None else float(now)
    if not lease.get("release_id") or not lease.get("package_hash"):
        return False
    if expires_at <= current:
        return False
    if issued_at > current + CLOCK_ROLLBACK_TOLERANCE_SECONDS:
        return False
    if current < float(last_trusted_time or 0) - CLOCK_ROLLBACK_TOLERANCE_SECONDS:
        return False
    return True
