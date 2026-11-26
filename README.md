# Sathi Vision

[![CI](https://github.com/priyanshkk/sathi-vision/actions/workflows/ci.yml/badge.svg)](https://github.com/priyanshkk/sathi-vision/actions/workflows/ci.yml)

**Live object detection from your browser camera, powered by Python + open-vocabulary AI.**

Point your camera at a pen, dog, cup, phone, book, chair, plant — or type a new label — and Sathi Vision draws boxes around matches in real time. Everything runs on your own machine. No upload, no API key, no paid service.

![Sathi Vision](static/icon.svg)

## Why this exists

Most detector demos can only recognise a fixed list of objects. Sathi Vision uses **OWL-ViT**, an open-vocabulary model, so the labels are text you control. Add `spoon`, `headphones`, `sneaker`, or `remote control` from the UI and the model searches for it without retraining.

A lightweight OpenCV cascade fallback keeps the app usable on machines where the model is not available. A deterministic demo mode is included for tests and screenshots.

## Features

- **Live camera detection** with explicit browser permission (`getUserMedia`)
- **Open vocabulary** — type any object name and detect it
- **35 default labels** including pen, dog, cat, person, phone, laptop, cup, book, keys, bag, car, plant and more
- **Full HTML home page** with hero, live detector, controls, feature tour, steps and API docs
- **Adjustable confidence threshold** and removable label chips
- **Snapshot export** with boxes burned into the PNG
- **Privacy-first** — frames stay between your browser and your local Python server
- **Honest modes** — `auto`, `owlvit`, `opencv`, `demo` shown live in the UI
- **FastAPI backend** with `/health`, `/labels`, `/detect` and interactive `/docs`

## Quick start

### Windows (one click)

Double-click `run.bat`. It creates a virtual environment, installs dependencies and opens the backend at `http://127.0.0.1:8000`.

### Manual

```bash
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000**, click **Enable camera**, allow permission, and start holding objects in front of the camera.

> **First real run:** OWL-ViT downloads `google/owlvit-base-patch32` from Hugging Face once (about 600 MB) and caches it locally. Later runs are much faster. GPU users should install a CUDA build of PyTorch before the first run.

## Test without a camera

```bash
# Windows PowerShell
$env:VISION_MODE="demo"; python -m uvicorn app:app --host 127.0.0.1 --port 8000

# macOS / Linux
VISION_MODE=demo python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Demo mode returns a synthetic pen and dog box so you can verify the UI, overlays and API without camera hardware or model download.

## Detection modes

| Mode | What it does | Best for |
| --- | --- | --- |
| `auto` (default) | Tries OWL-ViT, falls back to OpenCV cascades if loading fails | Normal use |
| `owlvit` | Forces open-vocabulary detection with text labels | Arbitrary objects like pen, dog, spoon |
| `opencv` | Uses bundled face/eye/smile cascades only | No model download |
| `demo` | Returns fixed pen/dog detections | Tests and screenshots |

Set the mode with the `VISION_MODE` environment variable. The current mode is displayed in the detector status bar.

## API

Interactive Swagger docs are available at `http://127.0.0.1:8000/docs`.

```bash
curl -X POST http://127.0.0.1:8000/detect \
  -H "Content-Type: application/json" \
  -d '{"image":"data:image/jpeg;base64,...","labels":["pen","dog"],"threshold":0.15}'
```

Response:

```json
{
  "count": 2,
  "detections": [
    { "label": "pen", "score": 0.91, "box": [115, 151, 397, 187] },
    { "label": "dog", "score": 0.74, "box": [352, 72, 576, 306] }
  ],
  "width": 640,
  "height": 360,
  "latency_ms": 18.4,
  "mode": "owlvit"
}
```

`box` is `[x1, y1, x2, y2]` in source-frame pixels. The frontend sends JPEG frames at reduced resolution and throttles requests so inference stays responsive.

## Health check

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/labels
```

## Project structure

```text
sathi-vision/
├── app.py                 # FastAPI routes and static page
├── detector.py            # OWL-ViT, OpenCV fallback and demo detector
├── requirements.txt
├── run.bat                # Windows one-click launcher
├── run.sh                 # macOS / Linux launcher
├── static/
│   ├── index.html         # Full animated home page
│   ├── styles.css
│   ├── app.js             # Camera, detection loop and overlay drawing
│   └── icon.svg
└── README.md
```

## Privacy

Camera frames are decoded in the Python backend running on your machine. They are never forwarded to a third-party API. The OWL-ViT model weights are downloaded once from Hugging Face, but inference happens locally. No key, account or telemetry is required.

Browser camera APIs require `localhost` or HTTPS. If permission is denied, the page shows a clear in-page message instead of failing silently.

## Honest limitations

- Open-vocabulary means “search for labels you type”, not magic recognition of infinite unseen objects without naming them.
- Accuracy depends on lighting, occlusion, camera angle, label wording and the chosen threshold.
- CPU inference is slower than GPU inference. Lower the threshold carefully and keep the default label list focused.
- The OpenCV fallback only recognises face, eye and smile cascades; arbitrary objects need OWL-ViT.

## Built by

**Priyanshu Kumar** — [GitHub](https://github.com/priyanshkk) · [Portfolio](https://priyanshkk.github.io)

## License

MIT. See [LICENSE](LICENSE).
