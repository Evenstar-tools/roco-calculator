from __future__ import annotations

import sys
import unittest
from io import BytesIO
from pathlib import Path

import qrcode
from PIL import Image, ImageFilter


DEMO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DEMO_ROOT))

from qr_service import NoQrCodeError, classify_payload, decode_qr, inspect_image


class QrDemoTests(unittest.TestCase):
    def test_real_sample_decodes_and_maps_six_members(self):
        sample = Image.open(DEMO_ROOT / "tests" / "fixtures" / "real-qiandao-lineup.jpg")
        result = inspect_image(sample)

        self.assertEqual(result["classification"]["kind"], "lineup")
        self.assertIn("rocom.qq.com/act/a20250703array", result["payload"])
        self.assertEqual(result["preview"]["name"], "雨中小故事")
        self.assertEqual(
            [member["name"] for member in result["preview"]["members"] if member],
            ["爵士鹿", "幻影灵菇", "飞飞钥", "小皮球", "荆棘电环", "寂灭骨龙"],
        )
        self.assertEqual(result["preview"]["export"]["code"], result["payload"].split("shareData=", 1)[1].split("&", 1)[0])

    def test_image_without_qr_is_rejected(self):
        with self.assertRaises(NoQrCodeError):
            decode_qr(Image.new("RGB", (640, 360), "white"))

    def test_heavily_blurred_qr_is_rejected(self):
        qr = qrcode.make("B~invalid-blurred-fixture").convert("RGB").resize((180, 180))
        blurred = qr.filter(ImageFilter.GaussianBlur(radius=20))
        with self.assertRaises(NoQrCodeError):
            decode_qr(blurred)

    def test_unknown_payload_is_not_treated_as_lineup(self):
        image = qrcode.make("qiandao-demo:unknown-payload").convert("RGB")
        result = inspect_image(image)
        self.assertEqual(result["classification"]["kind"], "unknown")
        self.assertIsNone(result["preview"])
        self.assertIsNone(result["protocolError"])

    def test_generic_url_is_never_promoted_to_lineup(self):
        classification = classify_payload("https://example.invalid/short/abc")
        self.assertEqual(classification["kind"], "url")


if __name__ == "__main__":
    unittest.main()
