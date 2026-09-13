from __future__ import annotations

import json
import subprocess
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from PIL import Image, ImageOps
import zxingcpp


DEMO_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = DEMO_ROOT.parents[1]
OFFICIAL_HOST = "rocom.qq.com"
OFFICIAL_PATH = "/act/a20250703array/index.html"


class NoQrCodeError(Exception):
    pass


def _point(point) -> dict[str, int]:
    return {"x": int(point.x), "y": int(point.y)}


def decode_qr(image: Image.Image) -> dict:
    normalized = ImageOps.exif_transpose(image).convert("RGB")
    results = zxingcpp.read_barcodes(
        normalized,
        formats=zxingcpp.BarcodeFormat.QRCode,
        try_rotate=True,
        try_downscale=True,
        try_invert=True,
    )
    valid = [result for result in results if result.valid and result.text]
    if not valid:
        raise NoQrCodeError()

    result = valid[0]
    position = result.position
    return {
        "payload": result.text,
        "format": str(result.format),
        "image": {"width": normalized.width, "height": normalized.height},
        "corners": [
            _point(position.top_left),
            _point(position.top_right),
            _point(position.bottom_right),
            _point(position.bottom_left),
        ],
        "codeCount": len(valid),
    }


def classify_payload(payload: str) -> dict:
    text = payload.strip()
    parsed = urlparse(text)
    if parsed.scheme in {"http", "https"} and parsed.netloc:
        query = parse_qs(parsed.query, keep_blank_values=True)
        if parsed.hostname == OFFICIAL_HOST and parsed.path == OFFICIAL_PATH and query.get("shareData"):
            return {
                "kind": "official_share_url",
                "label": "官方阵容分享链接",
                "safeNote": "只在本机提取 shareData，没有访问链接",
            }
        return {
            "kind": "url",
            "label": "普通网址或短链接",
            "safeNote": "未自动访问链接，也未猜测阵容字段",
        }
    if 8 <= len(text) <= 512 and all(character.isalnum() or character in "_~-+/\\" for character in text):
        return {
            "kind": "lineup_code_candidate",
            "label": "阵容码候选",
            "safeNote": "将用项目协议严格校验",
        }
    return {
        "kind": "unknown",
        "label": "未知文本载荷",
        "safeNote": "没有按阵容数据解释",
    }


def parse_lineup(payload: str) -> tuple[dict | None, str | None]:
    completed = subprocess.run(
        ["node", str(DEMO_ROOT / "parse-lineup.mjs")],
        cwd=PROJECT_ROOT,
        input=payload,
        text=True,
        encoding="utf-8",
        capture_output=True,
        timeout=10,
        check=False,
    )
    if completed.returncode == 0:
        return json.loads(completed.stdout), None
    message = completed.stderr.strip() or "阵容协议校验失败"
    return None, message


def inspect_image(image: Image.Image) -> dict:
    decoded = decode_qr(image)
    classification = classify_payload(decoded["payload"])
    preview = None
    protocol_error = None
    if classification["kind"] in {"official_share_url", "lineup_code_candidate"}:
        preview, protocol_error = parse_lineup(decoded["payload"])
        if preview is not None:
            classification = {
                **classification,
                "kind": "lineup",
                "label": "已确认的游戏阵容协议",
                "safeNote": "二维码和阵容字段均已在本机校验",
            }
    return {
        **decoded,
        "classification": classification,
        "preview": preview,
        "protocolError": protocol_error,
    }
