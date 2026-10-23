from __future__ import annotations

import base64
import hashlib
import json
import os
import platform
import re
import secrets
import subprocess
import time
import uuid
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey

try:
    from .secure_store import get_secret, set_secret
except ImportError:
    from .shaobkj_secure_store import get_secret, set_secret

DEVICE_ID_VERSION = 2
DEVICE_KEY_NAME = "Shaobkj-GitHub/device-key"
DISCOVERY_TIMEOUT_SECONDS = 3.0
DISCOVERY_ATTEMPT_TIMEOUTS = (1.5, 0.75, 0.25)
DISCOVERY_RETRY_DELAYS = (0.2, 0.3)

SOURCE_PRIORITY = {
    "windows_smbios_uuid": 0,
    "windows_machine_guid": 1,
    "macos_ioplatform_uuid": 0,
    "macos_platform_serial": 1,
    "dmi_product_uuid": 0,
    "dmi_product_serial": 1,
    "dmi_board_serial": 2,
    "linux_machine_id": 3,
    "instance_id": -1,
}

DUPLICATE_UUIDS = {
    "03000200-0400-0500-0006-000700080009",
    "00000000-0000-0000-0000-000000000000",
    "ffffffff-ffff-ffff-ffff-ffffffffffff",
}

PLACEHOLDER_VALUES = {
    "",
    "none",
    "unknown",
    "not specified",
    "to be filled by o.e.m.",
    "default string",
    "system serial number",
    "not applicable",
    "n/a",
    "no instance(s) available.",
}

UUID_SOURCES = {
    "windows_smbios_uuid",
    "windows_machine_guid",
    "macos_ioplatform_uuid",
    "dmi_product_uuid",
}


def _strip_unknown(value: str) -> str:
    return (value or "").strip().strip("\x00").strip().strip('"').strip()


def normalize_uuid(value: str) -> str:
    cleaned = _strip_unknown(value)
    if cleaned.startswith("{") and cleaned.endswith("}"):
        cleaned = cleaned[1:-1].strip()
    try:
        parsed = uuid.UUID(cleaned)
    except (AttributeError, ValueError):
        return ""
    normalized = str(parsed).lower()
    if normalized in DUPLICATE_UUIDS:
        return ""
    return normalized


def _clean_anchor(anchor: str, source: str) -> str:
    cleaned = _strip_unknown(anchor)
    if source in UUID_SOURCES:
        return normalize_uuid(cleaned)
    if cleaned.casefold() in PLACEHOLDER_VALUES:
        return ""
    return cleaned


def _anchor_value(anchor: str, source: str) -> str:
    cleaned = _strip_unknown(anchor)
    for prefix in (f"local:{source}:", f"cloud:{source}:"):
        if cleaned.startswith(prefix):
            cleaned = cleaned[len(prefix):]
            break
    return _clean_anchor(cleaned, source)


def _canonical_anchor(anchor: str, source: str) -> str:
    value = _anchor_value(anchor, source)
    if not value:
        return ""
    prefix = "cloud" if source == "instance_id" else "local"
    return f"{prefix}:{source}:{value}"


def _anchor_fingerprint(anchor: str) -> str:
    return hashlib.sha256(anchor.encode("utf-8", errors="ignore")).hexdigest()[:24]


def _device_prefix(source: str) -> str:
    if source.startswith("windows_"):
        return "WIN"
    if source.startswith("macos_"):
        return "MAC"
    if source in {"dmi_product_uuid", "dmi_product_serial", "dmi_board_serial", "linux_machine_id"}:
        return "LIN"
    if source == "instance_id":
        return "CLOUD"
    return "LOC"


def _device_id_from_anchor(anchor: str, source: str) -> str:
    digest = hashlib.sha256(f"JDKF_DEVICE_V2:{anchor}".encode("utf-8", errors="ignore")).hexdigest()
    return f"JDKF-{_device_prefix(source)}-{digest[:32].upper()}"


def _display_code(device_id: str) -> str:
    normalized = "".join(char for char in device_id.strip().upper() if char.isalnum() or char == "-")
    prefix = normalized.split("-", 2)[1] if normalized.count("-") >= 2 else "LOC"
    compact = "".join(char for char in normalized if char.isalnum())
    return f"{prefix}-{compact[-10:]}" if compact else ""


def _sort_anchors(anchors: list[tuple[str, str]]) -> list[tuple[str, str]]:
    deduplicated: dict[str, str] = {}
    for anchor, source in anchors:
        canonical = _canonical_anchor(anchor, source)
        if canonical and source:
            deduplicated[source] = canonical
    return sorted(
        ((anchor, source) for source, anchor in deduplicated.items()),
        key=lambda item: (SOURCE_PRIORITY.get(item[1], 99), item[1]),
    )


def _read_service_env(name: str, root: Path | None = None) -> str:
    root = root or Path(__file__).resolve().parent
    path = root / "service.env"
    try:
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key.strip() == name:
                return _strip_unknown(value)
    except OSError:
        pass
    return ""


def _cloud_instance_id() -> str:
    value = os.getenv("SHAOBKJ_INSTANCE_ID") or _read_service_env("SHAOBKJ_INSTANCE_ID")
    return re.sub(r"[^A-Za-z0-9_.:-]", "", value.strip()).upper()[:128]


def _run_text(command: list[str], deadline: float) -> str:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        return ""
    kwargs = {}
    if platform.system().lower() == "windows":
        kwargs["creationflags"] = 0x08000000
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=max(0.1, remaining),
            check=False,
            **kwargs,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    return result.stdout.strip() if result.returncode == 0 else ""


def _read_windows_machine_guid() -> str:
    try:
        import winreg

        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography") as key:
            value, _ = winreg.QueryValueEx(key, "MachineGuid")
            return normalize_uuid(str(value))
    except Exception:
        return ""


def _read_windows_smbios_uuid(deadline: float) -> str:
    output = _run_text(
        [
            "powershell",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "(Get-CimInstance Win32_ComputerSystemProduct).UUID",
        ],
        deadline,
    )
    for line in output.splitlines():
        value = normalize_uuid(line)
        if value:
            return value
    wmic = _run_text(["wmic", "csproduct", "get", "UUID"], deadline)
    for line in wmic.splitlines():
        value = normalize_uuid(line)
        if value:
            return value
    return ""


def _read_windows_anchors(deadline: float) -> list[tuple[str, str]]:
    anchors: list[tuple[str, str]] = []
    smbios = _read_windows_smbios_uuid(deadline)
    machine_guid = _read_windows_machine_guid()
    if smbios:
        anchors.append((f"local:windows_smbios_uuid:{smbios}", "windows_smbios_uuid"))
    if machine_guid:
        anchors.append((f"local:windows_machine_guid:{machine_guid}", "windows_machine_guid"))
    return anchors


def _read_macos_anchors(deadline: float) -> list[tuple[str, str]]:
    output = _run_text(
        ["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"],
        deadline,
    )
    anchors: list[tuple[str, str]] = []
    platform_uuid = ""
    serial = ""
    for line in output.splitlines():
        if '"IOPlatformUUID"' in line and "=" in line:
            platform_uuid = normalize_uuid(line.split("=", 1)[1])
        elif '"IOPlatformSerialNumber"' in line and "=" in line:
            serial = _strip_unknown(line.split("=", 1)[1])
    if platform_uuid:
        anchors.append((f"local:macos_ioplatform_uuid:{platform_uuid}", "macos_ioplatform_uuid"))
    if serial and serial.casefold() not in PLACEHOLDER_VALUES:
        anchors.append((f"local:macos_platform_serial:{serial}", "macos_platform_serial"))
    return anchors


def _read_linux_anchors() -> list[tuple[str, str]]:
    candidates = [
        ("dmi_product_uuid", Path("/sys/class/dmi/id/product_uuid")),
        ("dmi_product_serial", Path("/sys/class/dmi/id/product_serial")),
        ("dmi_board_serial", Path("/sys/class/dmi/id/board_serial")),
        ("linux_machine_id", Path("/etc/machine-id")),
    ]
    anchors: list[tuple[str, str]] = []
    for source, path in candidates:
        try:
            value = _clean_anchor(path.read_text(encoding="utf-8", errors="ignore"), source)
        except OSError:
            value = ""
        if value:
            anchors.append((f"local:{source}:{value}", source))
    return anchors


def _read_anchors_once(deadline: float) -> list[tuple[str, str]]:
    system_name = platform.system().lower()
    if system_name == "windows":
        anchors = _read_windows_anchors(deadline)
    elif system_name == "darwin":
        anchors = _read_macos_anchors(deadline)
    elif system_name == "linux":
        anchors = _read_linux_anchors()
    else:
        anchors = []
    instance_id = _cloud_instance_id()
    if instance_id:
        anchors.append((f"cloud:instance_id:{instance_id}", "instance_id"))
    return anchors


def discover_anchors() -> list[tuple[str, str]]:
    deadline = time.monotonic() + DISCOVERY_TIMEOUT_SECONDS
    preferred = "instance_id"
    system_name = platform.system().lower()
    if not _cloud_instance_id():
        preferred = {
            "windows": "windows_smbios_uuid",
            "darwin": "macos_ioplatform_uuid",
            "linux": "dmi_product_uuid",
        }.get(system_name, "")

    discovered: dict[str, str] = {}
    for attempt, attempt_timeout in enumerate(DISCOVERY_ATTEMPT_TIMEOUTS):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        attempt_deadline = min(deadline, time.monotonic() + attempt_timeout)
        for anchor, source in _read_anchors_once(attempt_deadline):
            canonical = _canonical_anchor(anchor, source)
            if canonical:
                discovered[source] = canonical
        if preferred in discovered or attempt >= len(DISCOVERY_ATTEMPT_TIMEOUTS) - 1:
            break
        remaining = deadline - time.monotonic()
        if remaining > 0:
            time.sleep(min(DISCOVERY_RETRY_DELAYS[min(attempt, len(DISCOVERY_RETRY_DELAYS) - 1)], remaining))
    return _sort_anchors([(anchor, source) for source, anchor in discovered.items()])


def _saved_fingerprints(stored: dict) -> dict[str, str]:
    saved = stored.get("device_anchor_fingerprints")
    result = {
        str(source): str(fingerprint)
        for source, fingerprint in saved.items()
        if source and fingerprint
    } if isinstance(saved, dict) else {}
    source = str(stored.get("device_anchor_source") or "").strip()
    fingerprint = str(stored.get("device_fingerprint") or "").strip()
    if source and fingerprint and source != "stored_only":
        result.setdefault(source, fingerprint)
    return result


def resolve_machine_id(stored: dict, anchors: list[tuple[str, str]]) -> dict:
    ordered = _sort_anchors(anchors)
    stored = stored if isinstance(stored, dict) else {}
    stored_id = str(stored.get("device_id") or "").strip()
    saved = _saved_fingerprints(stored)
    current = {source: _anchor_fingerprint(anchor) for anchor, source in ordered}

    if not ordered:
        if stored_id:
            return {
                **stored,
                "device_id": stored_id,
                "device_type": str(stored.get("device_type") or "local"),
                "instance_id": str(stored.get("instance_id") or ""),
                "device_anchor_source": "stored_only",
                "changed": False,
            }
        loc_id = f"JDKF-LOC-{secrets.token_hex(16).upper()}"
        return {
            "device_id": loc_id,
            "device_type": "local",
            "instance_id": "",
            "device_anchor_source": "none",
            "device_fingerprint": "",
            "device_anchor_fingerprints": {},
            "changed": True,
        }

    primary_anchor, primary_source = ordered[0]
    primary_fingerprint = current[primary_source]
    stored_is_formal = stored_id.startswith(("JDKF-WIN-", "JDKF-MAC-", "JDKF-LIN-", "JDKF-CLOUD-"))
    matching_source = next(
        (source for source, fingerprint in current.items() if saved.get(source) == fingerprint),
        "",
    )
    generated_matches = any(
        _device_id_from_anchor(anchor, source) == stored_id
        for anchor, source in ordered
    )

    if stored_id and (stored_is_formal or stored_id.startswith("JDKF-LOC-")) and (matching_source or generated_matches):
        fingerprints = {**saved, **current}
        return {
            "device_id": stored_id,
            "device_type": "cloud" if primary_source == "instance_id" else "local",
            "instance_id": primary_anchor.split(":", 2)[2] if primary_source == "instance_id" else "",
            "device_anchor_source": primary_source,
            "device_fingerprint": primary_fingerprint,
            "device_anchor_fingerprints": fingerprints,
            "changed": True,
        }

    if stored_id and saved:
        saved_source = str(stored.get("device_anchor_source") or "").strip()
        historical_missing = (
            saved_source not in current
            if saved_source
            else any(source not in current for source in saved)
        )
        if historical_missing:
            return {
                **stored,
                "device_id": stored_id,
                "device_type": str(stored.get("device_type") or "local"),
                "instance_id": str(stored.get("instance_id") or ""),
                "device_anchor_source": "stored_only",
                "changed": False,
            }

    device_id = _device_id_from_anchor(primary_anchor, primary_source)
    return {
        "device_id": device_id,
        "device_type": "cloud" if primary_source == "instance_id" else "local",
        "instance_id": primary_anchor.split(":", 2)[2] if primary_source == "instance_id" else "",
        "device_anchor_source": primary_source,
        "device_fingerprint": primary_fingerprint,
        "device_anchor_fingerprints": current,
        "changed": True,
    }


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def load_or_create_device_key() -> tuple[str, str]:
    saved = get_secret(DEVICE_KEY_NAME)
    if saved:
        try:
            payload = json.loads(saved)
            private_key = str(payload.get("private_key") or "")
            public_key = str(payload.get("public_key") or "")
            if private_key and public_key:
                _b64decode(private_key)
                _b64decode(public_key)
                return private_key, public_key
            raise ValueError("missing key fields")
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            raise ValueError("本机设备密钥已损坏，请清除该插件的设备凭据后重新授权。") from exc

    private = X25519PrivateKey.generate()
    private_key = _b64encode(
        private.private_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PrivateFormat.Raw,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    public_key = _b64encode(
        private.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
    )
    set_secret(
        DEVICE_KEY_NAME,
        json.dumps({"private_key": private_key, "public_key": public_key}, separators=(",", ":")),
    )
    return private_key, public_key


def get_app_data_dir() -> Path:
    system_name = platform.system().lower()
    if system_name == "windows":
        base = Path(os.getenv("APPDATA") or Path.home() / "AppData" / "Roaming")
    elif system_name == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.getenv("XDG_DATA_HOME") or Path.home() / ".local" / "share")
    return base / "Shaobkj-GitHub"


def _state_path() -> Path:
    return get_app_data_dir() / "device-state.json"


def _read_state() -> dict:
    try:
        payload = json.loads(_state_path().read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _write_state(payload: dict) -> None:
    path = _state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, path)


def get_device_payload() -> dict[str, str]:
    state = _read_state()
    resolved = resolve_machine_id(state, discover_anchors())
    if resolved.pop("changed", False):
        _write_state(resolved)
    private_key, public_key = load_or_create_device_key()
    public_bytes = _b64decode(public_key)
    return {
        "device_id": str(resolved.get("device_id") or ""),
        "device_type": str(resolved.get("device_type") or "local"),
        "instance_id": str(resolved.get("instance_id") or ""),
        "device_public_key": public_key,
        "device_key_hash": hashlib.sha256(public_bytes).hexdigest(),
    }


def get_device_display_code(device_id: str) -> str:
    return _display_code(device_id)
