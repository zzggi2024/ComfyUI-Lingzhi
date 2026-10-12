
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
_INIT_PAYLOAD = b'SBGHPUB2\xc2\xb9Q\xa1\x98\xa4\xf7\xe0O\x04\x81>\x1a\n7z\x80]u\xc3\xcc\x812\x91\xedo\xd5~\x80\xc1\xd8\xb1\xbaQ\x9f\x81\x90\xb2K\x19\x1a\xf0\x12$\\\xc1v\x8fr\x14,\xea\x04Un\x1b\x07\xedbTY}\x15\xb11@d3\xa3\xeb\x8a\x82=\x95\x96\xb3\xb5\xa8\xef\x9b\xfb6\x13k\x05\xa8\xca?r\xd4\xdbw\x8a_\x94\xaa\x06\xbfH\xb7\x95V^m\xfb}\x1a\xcfD\x8f.\x18\xf2$\xf2\xbdrd\x07\x86\xdf\x9f\xcf\xda\x14{\xdc\xc9c\xe8c\xf5L\x84\xbaJ,5\x1d\x94\x1b8\xa7=8hw\x11\xd8{\xe1\xd8\xf5\xe9\x89\xcaeN)\x0b\x1a\x02\xa1Y\x16\x1c9\x8d\xab\xd9"\xa4\xaf\xb3\x93\x8b\xbd1\xd6\x03\xae\xf4wu\x1f\xf9\x198K\x00\xed\xe2G\x00\xdb\xdf\xd7\x82Z?\xc2\x0f\xeek\x85Tmk[.\x01\xc4\xb3w\x84{\x06\xc7\x9e\xd8'
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

