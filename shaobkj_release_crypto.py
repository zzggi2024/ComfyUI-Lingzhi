from __future__ import annotations

import hashlib
import hmac
import secrets
import zlib
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

MAGIC = b"SBGHPUB2"
MAGIC_V3 = b"SBGHPUB3"
SECRET = hashlib.sha256(b"SHAOBKJ_GITHUB_PUBLISH_2026_V2").digest()
V3_AAD = b"Shaobkj-GitHub release v3"
CONTENT_KEY_SIZE = 32
IGNORED_DIR_NAMES = {
    ".git",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    "runtime",
}
IGNORED_FILE_NAMES = {
    "release_info.json",
    "__init__.py",
    "device.json",
    ".auth_ok",
    ".device_cache",
}
IGNORED_SUFFIXES = {".pyc", ".pyo"}
TEXT_SUFFIXES = {
    ".py",
    ".js",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".jsx",
    ".json",
    ".md",
    ".txt",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".cfg",
    ".conf",
    ".env",
    ".html",
    ".css",
    ".bat",
    ".ps1",
    ".sh",
    ".xml",
    ".csv",
}

def _rotl32(value: int, shift: int) -> int:
    return ((value << shift) & 0xFFFFFFFF) | (value >> (32 - shift))


def _quarter_round(state: list[int], a: int, b: int, c: int, d: int) -> None:
    state[a] = (state[a] + state[b]) & 0xFFFFFFFF
    state[d] ^= state[a]
    state[d] = _rotl32(state[d], 16)
    state[c] = (state[c] + state[d]) & 0xFFFFFFFF
    state[b] ^= state[c]
    state[b] = _rotl32(state[b], 12)
    state[a] = (state[a] + state[b]) & 0xFFFFFFFF
    state[d] ^= state[a]
    state[d] = _rotl32(state[d], 8)
    state[c] = (state[c] + state[d]) & 0xFFFFFFFF
    state[b] ^= state[c]
    state[b] = _rotl32(state[b], 7)


def _chacha_block(key: bytes, nonce: bytes, counter: int) -> bytes:
    import struct

    state = list(
        struct.unpack("<4I", b"expand 32-byte k")
        + struct.unpack("<8I", key)
        + (counter,)
        + struct.unpack("<3I", nonce)
    )
    working = state[:]
    for _ in range(10):
        _quarter_round(working, 0, 4, 8, 12)
        _quarter_round(working, 1, 5, 9, 13)
        _quarter_round(working, 2, 6, 10, 14)
        _quarter_round(working, 3, 7, 11, 15)
        _quarter_round(working, 0, 5, 10, 15)
        _quarter_round(working, 1, 6, 11, 12)
        _quarter_round(working, 2, 7, 8, 13)
        _quarter_round(working, 3, 4, 9, 14)
    return struct.pack("<16I", *[((working[i] + state[i]) & 0xFFFFFFFF) for i in range(16)])


def _chacha_crypt(data: bytes, nonce: bytes) -> bytes:
    out = bytearray()
    counter = 1
    for offset in range(0, len(data), 64):
        block = _chacha_block(SECRET, nonce, counter)
        counter += 1
        chunk = data[offset:offset + 64]
        out.extend(value ^ block[index] for index, value in enumerate(chunk))
    return bytes(out)


def _normalized_source(source: bytes) -> str:
    text = source.decode("utf-8-sig").lstrip("\ufeff")
    return text


def _legacy_payload(text: str) -> bytes:
    payload = zlib.compress(text.encode("utf-8"), level=9)
    nonce = secrets.token_bytes(12)
    encrypted = _chacha_crypt(payload, nonce)
    tag = hmac.new(SECRET, nonce + encrypted, hashlib.sha256).digest()
    return MAGIC + nonce + tag + encrypted


def encrypt_source(
    source: bytes,
    filename: str = "<shaobkj-release>",
    content_key: bytes | None = None,
) -> bytes:
    text = _normalized_source(source)
    if content_key is None:
        return _legacy_payload(text)
    if len(content_key) != CONTENT_KEY_SIZE:
        raise ValueError("发布内容密钥必须是 32 字节。")
    payload = zlib.compress(text.encode("utf-8"), level=9)
    nonce = secrets.token_bytes(12)
    encrypted = AESGCM(content_key).encrypt(nonce, payload, V3_AAD)
    return MAGIC_V3 + nonce + encrypted


def decrypt_source(payload: bytes, content_key: bytes | None = None) -> str:
    if payload.startswith(MAGIC_V3):
        if content_key is None or len(content_key) != CONTENT_KEY_SIZE:
            raise ValueError("缺少有效的发布内容密钥。")
        nonce = payload[len(MAGIC_V3):len(MAGIC_V3) + 12]
        encrypted = payload[len(MAGIC_V3) + 12:]
        try:
            compressed = AESGCM(content_key).decrypt(nonce, encrypted, V3_AAD)
        except InvalidTag as exc:
            raise ValueError("发布内容密钥错误或文件完整性校验失败。") from exc
        return zlib.decompress(compressed).decode("utf-8-sig").lstrip("\ufeff")

    if not payload.startswith(MAGIC):
        raise ValueError("不是受支持的 .sbgc 文件。")
    nonce = payload[len(MAGIC):len(MAGIC) + 12]
    tag = payload[len(MAGIC) + 12:len(MAGIC) + 44]
    encrypted = payload[len(MAGIC) + 44:]
    expected = hmac.new(SECRET, nonce + encrypted, hashlib.sha256).digest()
    if not hmac.compare_digest(tag, expected):
        raise ValueError("旧版 .sbgc 文件完整性校验失败。")
    return zlib.decompress(_chacha_crypt(encrypted, nonce)).decode("utf-8-sig").lstrip("\ufeff")


def _package_files(root: Path, excluded: set[str] | None = None) -> dict[str, Path]:
    root = Path(root)
    if not root.is_dir():
        raise ValueError(f"发布目录不存在: {root}")
    excluded = {Path(item).as_posix() for item in excluded or set()}
    files = {}
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        relative_path = path.relative_to(root)
        if relative_path.as_posix() in excluded:
            continue
        if any(part.lower() in IGNORED_DIR_NAMES for part in relative_path.parts):
            continue
        if relative_path.name.lower() in IGNORED_FILE_NAMES:
            continue
        if relative_path.suffix.lower() in IGNORED_SUFFIXES:
            continue
        files[relative_path.as_posix()] = path
    return files


def list_package_files(root: Path, excluded: set[str] | None = None) -> tuple[str, ...]:
    return tuple(sorted(_package_files(root, excluded)))


def compute_package_hash(
    root: Path,
    excluded: set[str] | None = None,
    included: tuple[str, ...] | set[str] | None = None,
) -> str:
    files = _package_files(root, excluded)
    if included is None:
        package_files = sorted(files.items())
    else:
        expected = {Path(item).as_posix() for item in included}
        missing = sorted(expected.difference(files))
        if missing:
            raise ValueError(f"发布包文件缺失: {', '.join(missing)}")
        package_files = [(relative, files[relative]) for relative in sorted(expected)]
    digest = hashlib.sha256()
    for relative_name, path in package_files:
        relative = relative_name.encode("utf-8")
        digest.update(len(relative).to_bytes(8, "big"))
        digest.update(relative)
        content = None
        if path.suffix.lower() in TEXT_SUFFIXES:
            content = path.read_bytes().replace(b"\r\n", b"\n").replace(b"\r", b"\n")
        size = len(content) if content is not None else path.stat().st_size
        digest.update(size.to_bytes(8, "big"))
        if content is not None:
            digest.update(content)
        else:
            with path.open("rb") as handle:
                while chunk := handle.read(1024 * 1024):
                    digest.update(chunk)
    return digest.hexdigest()
