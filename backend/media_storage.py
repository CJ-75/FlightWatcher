"""
Pluggable media upload backends.

Current: Supabase Storage (public bucket `media`).
Swap via MEDIA_PROVIDER without changing the HTTP route.
"""
from __future__ import annotations

import os
import re
import uuid
from typing import Any, Dict, Optional, Tuple

ALLOWED_MIME = frozenset(
    {
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
        "image/gif",
    }
)

KIND_FOLDERS = {
    "parcours-cover": "parcours/covers",
    "parcours-step": "parcours/steps",
    "generic": "uploads",
}

_SAFE_OWNER = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


def media_provider() -> str:
    return (os.getenv("MEDIA_PROVIDER") or "supabase").strip().lower() or "supabase"


def media_bucket() -> str:
    return (os.getenv("MEDIA_BUCKET") or "media").strip() or "media"


def max_upload_bytes() -> int:
    try:
        return max(1_000_000, int(os.getenv("MEDIA_MAX_BYTES") or 8_000_000))
    except ValueError:
        return 8_000_000


def normalize_kind(kind: Optional[str]) -> str:
    k = (kind or "generic").strip().lower()
    return k if k in KIND_FOLDERS else "generic"


def normalize_owner(owner_id: Optional[str], fallback: str = "anon") -> str:
    raw = (owner_id or fallback or "anon").strip()
    if _SAFE_OWNER.match(raw):
        return raw
    # uuid-like
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "", raw)[:64]
    return cleaned or "anon"


def guess_ext(filename: str, content_type: str) -> str:
    name = (filename or "").lower()
    for ext in ("jpg", "jpeg", "png", "webp", "heic", "heif", "gif"):
        if name.endswith(f".{ext}"):
            return "jpg" if ext == "jpeg" else ext
    ct = (content_type or "").lower()
    if "png" in ct:
        return "png"
    if "webp" in ct:
        return "webp"
    if "heic" in ct or "heif" in ct:
        return "heic"
    if "gif" in ct:
        return "gif"
    return "jpg"


def build_object_path(kind: str, owner_id: str, filename: str, content_type: str) -> str:
    folder = KIND_FOLDERS[normalize_kind(kind)]
    owner = normalize_owner(owner_id)
    ext = guess_ext(filename, content_type)
    return f"{folder}/{owner}/{uuid.uuid4().hex}.{ext}"


def normalize_content_type(raw: Optional[str], filename: str = "") -> str:
    ct = (raw or "").split(";")[0].strip().lower()
    if ct == "image/jpg":
        ct = "image/jpeg"
    if ct in ALLOWED_MIME:
        return "image/jpeg" if ct == "image/jpg" else ct
    # infer from name
    ext = guess_ext(filename, "")
    mapping = {
        "jpg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
        "heic": "image/heic",
        "heif": "image/heif",
        "gif": "image/gif",
    }
    return mapping.get(ext, "image/jpeg")


def upload_bytes(
    *,
    data: bytes,
    filename: str,
    content_type: str,
    kind: str,
    owner_id: str,
) -> Dict[str, Any]:
    """
    Upload raw bytes. Returns {url, path, bucket, provider}.
    Raises ValueError for validation; RuntimeError for provider failures.
    """
    if not data:
        raise ValueError("fichier vide")
    if len(data) > max_upload_bytes():
        raise ValueError(f"fichier trop volumineux (max {max_upload_bytes()} octets)")

    ct = normalize_content_type(content_type, filename)
    if ct not in ALLOWED_MIME and ct != "image/jpeg":
        # normalize_content_type always returns allowed or jpeg
        pass
    if ct not in ALLOWED_MIME:
        raise ValueError(f"type MIME non supporté: {ct}")

    provider = media_provider()
    if provider in ("supabase", "api"):
        return _upload_supabase(
            data=data,
            filename=filename,
            content_type=ct,
            kind=kind,
            owner_id=owner_id,
        )
    if provider == "none":
        raise RuntimeError("MEDIA_PROVIDER=none — uploads désactivés")
    raise RuntimeError(f"MEDIA_PROVIDER inconnu: {provider}")


def _upload_supabase(
    *,
    data: bytes,
    filename: str,
    content_type: str,
    kind: str,
    owner_id: str,
) -> Dict[str, Any]:
    from supabase_deps import get_supabase_service_client, get_supabase_client

    sb = get_supabase_service_client() or get_supabase_client()
    if not sb:
        raise RuntimeError("Supabase non configuré (SERVICE_ROLE ou ANON)")

    bucket = media_bucket()
    path = build_object_path(kind, owner_id, filename, content_type)

    # supabase-py storage upload
    res = sb.storage.from_(bucket).upload(
        path,
        data,
        file_options={
            "content-type": content_type,
            "upsert": "false",
            "cache-control": "31536000",
        },
    )
    # Older clients return dict-like / raise; newer may return UploadResponse
    if isinstance(res, dict) and res.get("error"):
        raise RuntimeError(str(res["error"]))

    public = sb.storage.from_(bucket).get_public_url(path)
    url = public
    if isinstance(public, dict):
        url = (public.get("publicUrl") or public.get("public_url") or "").strip()
    url = str(url or "").strip()
    # Some SDK versions append a trailing ? — strip for cleaner storage
    if url.endswith("?"):
        url = url[:-1]
    if not url:
        raise RuntimeError("URL publique Storage introuvable")

    return {
        "ok": True,
        "url": url,
        "path": path,
        "bucket": bucket,
        "provider": "supabase",
        "content_type": content_type,
    }


def public_transform_url(
    url: str,
    *,
    width: Optional[int] = None,
    quality: Optional[int] = None,
) -> str:
    """Best-effort Supabase Image Transform URL (no-op if not a Storage public URL)."""
    raw = (url or "").strip()
    if not raw or "storage/v1/object/public/" not in raw:
        return raw
    try:
        from urllib.parse import urlencode, urlparse, urlunparse

        marker = "/storage/v1/object/public/"
        parsed = urlparse(raw)
        after = parsed.path.split(marker, 1)[1]
        qs: Dict[str, str] = {}
        if width and width > 0:
            qs["width"] = str(int(width))
            qs["resize"] = "contain"
        if quality and quality > 0:
            qs["quality"] = str(min(100, int(quality)))
        if not qs:
            return raw
        new_path = f"/storage/v1/render/image/public/{after}"
        return urlunparse(parsed._replace(path=new_path, query=urlencode(qs)))
    except Exception:
        return raw
