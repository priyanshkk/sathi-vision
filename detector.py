"""Open-vocabulary object detector with a lightweight OpenCV fallback.

Primary mode uses OWL-ViT from Hugging Face Transformers, which accepts arbitrary
text labels such as "pen", "dog", "cup" or "laptop" without retraining.
"""

from __future__ import annotations

import os
import threading
from typing import Any

import cv2
import numpy as np
from PIL import Image

DEFAULT_LABELS = [
    "pen",
    "pencil",
    "dog",
    "cat",
    "person",
    "face",
    "hand",
    "book",
    "notebook",
    "phone",
    "mobile phone",
    "laptop",
    "keyboard",
    "mouse",
    "cup",
    "bottle",
    "glass",
    "keys",
    "watch",
    "bag",
    "backpack",
    "shoe",
    "chair",
    "table",
    "plant",
    "flower",
    "car",
    "bicycle",
    "remote control",
    "headphones",
    "camera",
    "clock",
    "spoon",
    "plate",
    "scissors",
]


class ObjectDetector:
    def __init__(self, mode: str = "auto") -> None:
        requested = (mode or "auto").lower()
        self.mode = "owlvit" if requested == "auto" else requested
        self._pipe: Any = None
        self._cascades: dict[str, cv2.CascadeClassifier] = {}
        self._lock = threading.Lock()
        self._device = -1
        self._ready = False
        self._error: str | None = None

    def status(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "ready": self._ready,
            "device": "cuda" if self._device == 0 else "cpu" if self.mode == "owlvit" else "opencv",
            "error": self._error,
            "label_count": len(DEFAULT_LABELS),
        }

    def _load_owlvit(self) -> bool:
        if self._pipe is not None:
            return True
        try:
            import torch
            from transformers import pipeline

            threads = max(1, min(4, os.cpu_count() or 1))
            torch.set_num_threads(threads)
            self._device = 0 if torch.cuda.is_available() else -1
            self._pipe = pipeline(
                "zero-shot-object-detection",
                model="google/owlvit-base-patch32",
                device=self._device,
            )
            self._ready = True
            self._error = None
            return True
        except Exception as exc:  # pragma: no cover - depends on local model availability
            self._error = str(exc)
            self.mode = "opencv"
            return False

    def _load_cascades(self) -> None:
        if self._cascades:
            return
        base = cv2.data.haarcascades
        names = {
            "face": "haarcascade_frontalface_default.xml",
            "eye": "haarcascade_eye.xml",
            "smile": "haarcascade_smile.xml",
        }
        for label, filename in names.items():
            cascade = cv2.CascadeClassifier(os.path.join(base, filename))
            if not cascade.empty():
                self._cascades[label] = cascade

    def _demo_detections(self, width: int, height: int) -> list[dict[str, Any]]:
        return [
            {
                "label": "pen",
                "score": 0.91,
                "box": [int(width * 0.18), int(height * 0.42), int(width * 0.62), int(height * 0.52)],
            },
            {
                "label": "dog",
                "score": 0.74,
                "box": [int(width * 0.55), int(height * 0.2), int(width * 0.9), int(height * 0.85)],
            },
        ]

    def _opencv_detections(self, image_bgr: np.ndarray) -> list[dict[str, Any]]:
        self._load_cascades()
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        height, width = gray.shape[:2]
        results: list[dict[str, Any]] = []
        for label, cascade in self._cascades.items():
            scale = 1.05 if label == "face" else 1.1
            neighbors = 3 if label == "face" else 5
            for x, y, w, h in cascade.detectMultiScale(gray, scaleFactor=scale, minNeighbors=neighbors):
                results.append(
                    {
                        "label": label,
                        "score": 0.75,
                        "box": [int(x), int(y), int(x + w), int(y + h)],
                    }
                )
        return results[:20] or [
            {
                "label": "no object",
                "score": 0.5,
                "box": [int(width * 0.35), int(height * 0.35), int(width * 0.65), int(height * 0.65)],
            }
        ]

    def detect(
        self,
        image_bgr: np.ndarray,
        labels: list[str] | None = None,
        threshold: float = 0.15,
    ) -> list[dict[str, Any]]:
        labels = [str(label).strip() for label in (labels or DEFAULT_LABELS) if str(label).strip()]
        threshold = float(threshold)
        height, width = image_bgr.shape[:2]

        if self.mode == "demo":
            return [item for item in self._demo_detections(width, height) if item["score"] >= threshold]

        with self._lock:
            if self.mode == "owlvit" and self._load_owlvit():
                try:
                    rgb = Image.fromarray(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB))
                    raw = self._pipe(image=rgb, candidate_labels=labels)
                    results: list[dict[str, Any]] = []
                    for item in raw or []:
                        score = float(item.get("score", 0.0))
                        if score < threshold:
                            continue
                        box = item.get("box") or {}
                        x1 = max(0, min(width, int(float(box.get("xmin", 0)))))
                        y1 = max(0, min(height, int(float(box.get("ymin", 0)))))
                        x2 = max(0, min(width, int(float(box.get("xmax", 0)))))
                        y2 = max(0, min(height, int(float(box.get("ymax", 0)))))
                        if x2 <= x1 or y2 <= y1:
                            continue
                        results.append(
                            {
                                "label": str(item.get("label", "object")),
                                "score": round(score, 3),
                                "box": [x1, y1, x2, y2],
                            }
                        )
                    return results[:30]
                except Exception as exc:  # pragma: no cover - runtime inference
                    self._error = str(exc)

        return self._opencv_detections(image_bgr)
