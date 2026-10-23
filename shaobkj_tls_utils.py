from __future__ import annotations

import ssl
import urllib.error
import urllib.request


def _certifi_path() -> str:
    try:
        import certifi

        return certifi.where()
    except (ImportError, OSError):
        return ""


def create_ssl_context() -> ssl.SSLContext:
    context = ssl.create_default_context()
    cafile = _certifi_path()
    if not cafile:
        return context
    try:
        context.load_verify_locations(cafile=cafile)
    except (OSError, ssl.SSLError):
        pass
    return context


def _should_retry_direct(exc: urllib.error.URLError) -> bool:
    reason = exc.reason
    if isinstance(reason, ssl.SSLError):
        return True
    return isinstance(reason, OSError) and reason.errno in {61, 111, 10061}


def _clone_request(request: urllib.request.Request) -> urllib.request.Request:
    return urllib.request.Request(
        request.full_url,
        data=request.data,
        headers=dict(request.header_items()),
        method=request.get_method(),
    )


def open_url(request: urllib.request.Request, timeout: float, context=None):
    context = context or create_ssl_context()
    direct_request = _clone_request(request)
    try:
        return urllib.request.urlopen(request, timeout=timeout, context=context)
    except urllib.error.HTTPError:
        raise
    except urllib.error.URLError as exc:
        if not _should_retry_direct(exc):
            raise
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        urllib.request.HTTPSHandler(context=context),
    )
    return opener.open(direct_request, timeout=timeout)
