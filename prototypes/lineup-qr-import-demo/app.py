from __future__ import annotations

from io import BytesIO
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from PIL import Image, UnidentifiedImageError

from qr_service import NoQrCodeError, inspect_image


DEMO_ROOT = Path(__file__).resolve().parent
app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 15 * 1024 * 1024


@app.get("/")
def index():
    return send_from_directory(DEMO_ROOT / "static", "index.html")


@app.get("/static/<path:filename>")
def static_file(filename: str):
    return send_from_directory(DEMO_ROOT / "static", filename)


@app.post("/api/decode")
def decode():
    uploaded = request.files.get("image")
    if uploaded is None or not uploaded.filename:
        return jsonify({"ok": False, "error": "请选择一张配队图片"}), 400

    try:
        image = Image.open(BytesIO(uploaded.read()))
        result = inspect_image(image)
        return jsonify({"ok": True, **result})
    except UnidentifiedImageError:
        return jsonify({"ok": False, "error": "文件不是可识别的图片"}), 400
    except NoQrCodeError:
        return jsonify({"ok": False, "error": "图片中没有识别到有效二维码"}), 422
    except Exception as error:
        return jsonify({"ok": False, "error": f"识别失败：{error}"}), 500


@app.errorhandler(413)
def too_large(_error):
    return jsonify({"ok": False, "error": "图片超过 15 MB，请压缩后重试"}), 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5178, debug=False)
