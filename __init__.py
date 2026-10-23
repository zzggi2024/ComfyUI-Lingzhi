
import hashlib as _hashlib
import importlib.abc as _ia
import importlib.util as _iu
import json as _json
import os as _os
import sys as _sys
import time as _time
from pathlib import Path as _Path

WEB_DIRECTORY = "web"
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

_PLUGIN_NAME = 'ComfyUI-Lingzhi'
_SAFE_PLUGIN_NAME = 'ComfyUI-Lingzhi'
_AUTH_SCOPE = 'ACCOUNT:f5ab687684789fee24b634c1dd2fee7a8bad75516d71477a583dbbb7820e6b35'
_RELEASE_ID = 'e36799f235984d908e8686199bcd9a03'
_RELEASE_VERSION = '20261023233916'
_PACKAGE_HASH = '80cef0efb41b271ee5527cab8394e27d3819cf56a38eac3ddfc2438042c73a44'
_PACKAGE_FILES = ('_shaobkj_root_init.py.sbgc', 'api_utils.py.sbgc', 'lingzhi_shared.py.sbgc', 'minimax_h3_api.py.sbgc', 'node_api_generator.py.sbgc', 'node_batch_folder_io.py.sbgc', 'node_concurrent_image_edit.py.sbgc', 'node_custom_video_save.py.sbgc', 'node_doubao_image.py.sbgc', 'node_font_style_selector.py.sbgc', 'node_free_color.py.sbgc', 'node_grok_video.py.sbgc', 'node_h3_video.py.sbgc', 'node_image_compose.py.sbgc', 'node_image_index_switch.py.sbgc', 'node_image_split.py.sbgc', 'node_llm_app.py.sbgc', 'node_load_image_list.py.sbgc', 'node_local_llm_app.py.sbgc', 'node_loop.py.sbgc', 'node_loop_count.py.sbgc', 'node_multi_function_prompt_enhancer.py.sbgc', 'node_param_extract.py.sbgc', 'node_quick_mark.py.sbgc', 'node_qwen_image.py.sbgc', 'node_ratio_expand_mask.py.sbgc', 'node_resolution_judge.py.sbgc', 'node_sd20_video.py.sbgc', 'node_seedance_video.py.sbgc', 'node_size_preset.py.sbgc', 'node_smart_video_split_join.py.sbgc', 'node_text_process.py.sbgc', 'node_video_frame_repair.py.sbgc', 'node_wan_image.py.sbgc', 'node_zero_one_float.py.sbgc', 'nodes.py.sbgc', 'prompt_enhancer_h3.py.sbgc', 'prompt_enhancer_media.py.sbgc', 'prompt_enhancer_models.py.sbgc', 'prompt_enhancer_music3.py.sbgc', 'prompt_enhancer_provider.py.sbgc', 'prompt_enhancer_qwen_image21.py.sbgc', 'prompt_enhancer_runtime.py.sbgc', 'prompt_enhancer_seedance.py.sbgc', 'prompt_enhancer_shared.py.sbgc', 'prompt_enhancer_skills.py.sbgc', 'prompt_enhancer_types.py.sbgc', 'requirements.txt', 'resources/llama_runtime_manifest.json', 'resources/skills/qwen-image-2.1/SKILL.md', 'service.env', 'shaobkj_device_identity.py', 'shaobkj_license_client.py', 'shaobkj_release_crypto.py', 'shaobkj_secure_store.py', 'shaobkj_tls_utils.py', 'skills/3d-animation-short-generator/SKILL.md', 'skills/3d-animation-short-generator/meta.yaml', 'skills/3d-animation-short-generator/references/fallback-policy.md', 'skills/3d-animation-short-generator/references/model-selection.md', 'skills/3d-animation-short-generator/references/qc-checklist.md', 'skills/3d-animation-short-generator/references/shot-table-spec.md', 'skills/3d-animation-short-generator/references/storyboard-guidelines.md', 'skills/brand-promo-video-generator/SKILL.md', 'skills/brand-promo-video-generator/meta.yaml', 'skills/co-op-game-intro-generator/SKILL.md', 'skills/co-op-game-intro-generator/meta.yaml', 'skills/co-op-game-intro-generator/references/h3-confirmation-image-template.md', 'skills/co-op-game-intro-generator/references/h3-video-prompt-template.md', 'skills/h3-prompt-writing/SKILL.md', 'skills/h3-prompt-writing/references/base-en.txt', 'skills/h3-prompt-writing/references/ref-en.txt', 'skills/handdrawn-live-video-generator/SKILL.md', 'skills/handdrawn-live-video-generator/meta.yaml', 'skills/minimalist-product-ad-generator/SKILL.md', 'skills/minimalist-product-ad-generator/meta.yaml', 'skills/music-video-subtitle-generator/SKILL.md', 'skills/music-video-subtitle-generator/meta.yaml', 'skills/paper-collage-explainer-generator/SKILL.md', 'skills/paper-collage-explainer-generator/meta.yaml', 'skills/papercraft-stop-motion-explainer/SKILL.md', 'skills/papercraft-stop-motion-explainer/meta.yaml', 'text_contour_utils.py.sbgc', 'web/auth_popup.js', 'web/concurrent_node.js', 'web/dynamic_inputs.js', 'web/fixed_api_model_list.js', 'web/font_style_selector.js', 'web/free_color_preview.js', 'web/h3_video_policy_v2.mjs', 'web/h3_video_ui_v2.js', 'web/image_compose_inputs.js', 'web/local_llm_model_list.js', 'web/loop_trigger.js', 'web/multi_function_prompt_enhancer_policy.mjs', 'web/multi_function_prompt_enhancer_ui.js', 'web/multi_function_prompt_enhancer_ui_v2.js', 'web/multi_prompt_enhancer_policy.mjs', 'web/param_extract.js', 'web/quick_mark.js', 'web/size_preset_ratio.js', 'web/smart_video_serial.js', 'web/video_frame_preview.js')
_SIGNING_KEY_ID = 'cea89f49ac597fda'
_SIGNING_PUBLIC_KEY = 'RW2X1sagRieZMGzkHhKJ-yzZMHMWRDefT53RPqgf5zw'
_PLUGIN_DIR = _Path(__file__).resolve().parent
_ROOT_PAYLOAD = _PLUGIN_DIR / "_shaobkj_root_init.py.sbgc"
_AUTH_ROUTE_PREFIX = f"/{_SAFE_PLUGIN_NAME}/auth"
_CONTENT_KEY = None
_HELPER_ERROR = ""

try:
    from . import shaobkj_device_identity as _device_identity
    from . import shaobkj_license_client as _license_client
    from . import shaobkj_release_crypto as _release_crypto
    from . import shaobkj_secure_store as _secure_store
except Exception as _exc:
    _HELPER_ERROR = str(_exc)

def _license_key_name():
    return _secure_store.credential_name("license-key", _PLUGIN_NAME)

def _trusted_time_name():
    return _secure_store.credential_name("last-trusted-time", _PLUGIN_NAME)

def _clear_legacy_state():
    for name in (".auth_ok", "device.json", ".device_cache"):
        try:
            (_PLUGIN_DIR / name).unlink()
        except OSError:
            pass

def _read_trusted_time():
    try:
        return float(_secure_store.get_secret(_trusted_time_name()) or 0)
    except Exception:
        return 0.0

def _write_trusted_time(value):
    current = max(_read_trusted_time(), float(value or 0))
    _secure_store.set_secret(_trusted_time_name(), str(current))

def _license_file_path():
    return _device_identity.get_app_data_dir() / "leases" / f"{_SAFE_PLUGIN_NAME}.json"

def _read_record():
    path = _license_file_path()
    try:
        payload = _json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise PermissionError("未授权：本机许可证不存在。") from exc
    if not isinstance(payload, dict):
        raise PermissionError("未授权：许可证格式不正确。")
    return payload

def _write_record(record):
    path = _license_file_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{_os.getpid()}.tmp")
    temporary.write_text(_json.dumps(record, ensure_ascii=False), encoding="utf-8")
    _os.replace(temporary, path)

def _validate_lease(lease, signature, record, device):
    verified = _license_client.verify_lease(lease, signature, _SIGNING_PUBLIC_KEY)
    if verified.get("release_id") != _RELEASE_ID:
        raise PermissionError("许可证与当前发布版本不匹配。")
    if verified.get("package_hash") != _PACKAGE_HASH:
        raise PermissionError("许可证与当前发布包不匹配。")
    if verified.get("signing_key_id") != _SIGNING_KEY_ID:
        raise PermissionError("许可证签名密钥不匹配。")
    if verified.get("device_id") != device.get("device_id"):
        raise PermissionError("许可证与本机设备不匹配。")
    if verified.get("device_key_hash") != device.get("device_key_hash"):
        raise PermissionError("许可证与本机系统安装不匹配。")
    current = _time.time()
    if not _license_client.is_lease_usable(verified, current, _read_trusted_time()):
        raise PermissionError("许可证已过期或系统时间异常，请联网重新授权。")
    actual_hash = _release_crypto.compute_package_hash(
        _PLUGIN_DIR,
        included=set(_PACKAGE_FILES) if _PACKAGE_FILES else None,
    )
    if actual_hash != _PACKAGE_HASH:
        raise PermissionError("发布包完整性校验失败。")
    return verified

def _load_content_key():
    if _HELPER_ERROR:
        raise PermissionError(f"授权组件加载失败：{_HELPER_ERROR}")
    record = _read_record()
    device = _device_identity.get_device_payload()
    lease = _validate_lease(record.get("lease") or {}, record.get("signature") or "", record, device)
    private_key, _public_key = _device_identity.load_or_create_device_key()
    content_key = _license_client.unwrap_content_key(record.get("wrapped_content_key") or {}, private_key)
    if len(content_key) != 32:
        raise PermissionError("发布内容密钥格式不正确。")
    trusted = _read_trusted_time()
    if _time.time() > trusted + 60:
        _write_trusted_time(_time.time())
    return content_key, lease

def _store_lease_response(response, access_key):
    lease = response.get("lease") or {}
    signature = response.get("signature") or ""
    device = _device_identity.get_device_payload()
    _validate_lease(lease, signature, {}, device)
    record = {
        "lease": lease,
        "signature": signature,
        "wrapped_content_key": response.get("wrapped_content_key") or {},
    }
    _write_trusted_time(response.get("server_time") or _time.time())
    _secure_store.set_secret(_license_key_name(), access_key)
    _write_record(record)
    return record

def _request_lease(access_key):
    device = _device_identity.get_device_payload()
    response = _license_client.request_lease({
        "code": _AUTH_SCOPE,
        "access_key": access_key,
        "device_id": device.get("device_id") or "",
        "device_type": device.get("device_type") or "local",
        "instance_id": device.get("instance_id") or "",
        "device_public_key": device.get("device_public_key") or "",
        "release_id": _RELEASE_ID,
        "package_hash": _PACKAGE_HASH,
    })
    return _store_lease_response(response, access_key)

def _refresh_lease():
    access_key = _secure_store.get_secret(_license_key_name())
    if not access_key:
        raise PermissionError("未保存运行时授权码，请重新输入。")
    return _request_lease(access_key)

def _status_payload():
    try:
        _content_key, lease = _load_content_key()
        return {
            "ok": True,
            "release_id": lease.get("release_id"),
            "expires_at": lease.get("expires_at"),
        }
    except Exception as exc:
        return {"ok": False, "message": str(exc)}

def _register_auth_routes():
    try:
        from aiohttp import web as _web
        from server import PromptServer as _PromptServer
    except Exception:
        return
    routes = _PromptServer.instance.routes

    @routes.get(_AUTH_ROUTE_PREFIX + "/device-id")
    async def _device_id(request):
        _ = request
        return _web.json_response(_device_identity.get_device_payload())

    @routes.get(_AUTH_ROUTE_PREFIX + "/status")
    async def _status(request):
        _ = request
        return _web.json_response(_status_payload())

    @routes.post(_AUTH_ROUTE_PREFIX + "/verify")
    async def _verify(request):
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        try:
            _request_lease(payload.get("code") or "")
            return _web.json_response({
                "ok": True,
                "restart_required": True,
                "message": "授权成功，请重启 ComfyUI 以加载节点",
            })
        except Exception as exc:
            return _web.json_response({"ok": False, "message": str(exc)}, status=400)

    @routes.post(_AUTH_ROUTE_PREFIX + "/refresh")
    async def _refresh(request):
        _ = request
        try:
            record = _refresh_lease()
            return _web.json_response({
                "ok": True,
                "expires_at": (record.get("lease") or {}).get("expires_at"),
            })
        except Exception as exc:
            return _web.json_response({"ok": False, "message": str(exc)}, status=400)

_register_auth_routes()
_clear_legacy_state()

def _wrap_node_class(cls):
    function_name = getattr(cls, "FUNCTION", None)
    if not function_name or getattr(cls, "_shaobkj_drm_wrapped", False):
        return cls
    original = getattr(cls, function_name, None)
    if not callable(original):
        return cls
    def _wrapped(self, *args, **kwargs):
        _load_content_key()
        return original(self, *args, **kwargs)
    setattr(cls, function_name, _wrapped)
    setattr(cls, "_shaobkj_drm_wrapped", True)
    return cls

def _wrap_node_mappings(namespace):
    mappings = namespace.get("NODE_CLASS_MAPPINGS")
    if isinstance(mappings, dict):
        for cls in mappings.values():
            if isinstance(cls, type):
                _wrap_node_class(cls)

class _Loader(_ia.Loader):
    def __init__(self, fullname, path, is_package=False):
        self.fullname = fullname
        self.path = path
        self._is_package = is_package

    def create_module(self, spec):
        return None

    def is_package(self, fullname):
        return self._is_package

    def exec_module(self, module):
        if _CONTENT_KEY is None:
            raise PermissionError("未授权：无法解密发布模块。")
        source = _release_crypto.decrypt_source(self.path.read_bytes(), _CONTENT_KEY)
        module.__file__ = str(self.path)
        module.__loader__ = self
        module.__cached__ = None
        module.__package__ = self.fullname if self._is_package else self.fullname.rpartition(".")[0]
        if self._is_package:
            module.__path__ = [str(self.path.parent)]
        exec(compile(source, str(self.path), "exec"), module.__dict__)
        _wrap_node_mappings(module.__dict__)

class _Finder(_ia.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        prefix = __name__ + "."
        if not fullname.startswith(prefix):
            return None
        rel_path = fullname[len(prefix):].replace(".", _os.sep)
        base = _PLUGIN_DIR
        module_file = base / f"{rel_path}.py.sbgc"
        package_file = base / rel_path / "__init__.py.sbgc"
        if module_file.is_file():
            return _iu.spec_from_loader(fullname, _Loader(fullname, module_file), origin=str(module_file))
        if package_file.is_file():
            loader = _Loader(fullname, package_file, True)
            spec = _iu.spec_from_loader(fullname, loader, origin=str(package_file), is_package=True)
            spec.submodule_search_locations = [str(package_file.parent)]
            return spec
        package_dir = base / rel_path
        if package_dir.is_dir():
            spec = _iu.spec_from_loader(fullname, loader=None, is_package=True)
            spec.submodule_search_locations = [str(package_dir)]
            return spec
        return None

if not any(isinstance(finder, _Finder) for finder in _sys.meta_path):
    _sys.meta_path.insert(0, _Finder())

try:
    _CONTENT_KEY, _INITIAL_LEASE = _load_content_key()
except Exception:
    _CONTENT_KEY = None
    _INITIAL_LEASE = None

if _CONTENT_KEY is not None:
    _ROOT_SOURCE = _release_crypto.decrypt_source(_ROOT_PAYLOAD.read_bytes(), _CONTENT_KEY)
    exec(compile(_ROOT_SOURCE, str(_ROOT_PAYLOAD), "exec"), globals())
    _wrap_node_mappings(globals())
    WEB_DIRECTORY = "web"

