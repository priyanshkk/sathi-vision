"""Sathi Vision API — browser camera in, open-vocabulary detections out."""

from __future__ import annotations

import base64
import binascii
import os
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from detector import DEFAULT_LABELS, ObjectDetector

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
MODE = os.getenv("VISION_MODE", "auto")

detector = ObjectDetector(MODE)

app = FastAPI(
    title="Sathi Vision API",
    description="Open-vocabulary live object detection from a browser camera.",
    version="1.0.0",
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class DetectRequest(BaseModel):
    image: str = Field(..., description="Base64 JPEG frame, with or without a data URL prefix.")
    labels: list[str] | None = Field(default=None, description="Object names to look for.")
    threshold: float = Field(default=0.15, ge=0.0, le=1.0)


@app.get("/", include_in_schema=False)
def home() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "sathi-vision",
        "detector": detector.status(),
        "docs": "/docs",
    }


@app.get("/labels")
def labels() -> dict[str, Any]:
    return {"labels": DEFAULT_LABELS, "count": len(DEFAULT_LABELS)}


@app.post("/detect")
def detect(request: DetectRequest) -> dict[str, Any]:
    payload = request.image
    if "," in payload:
        payload = payload.split(",", 1)[1]

    try:
        raw = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid base64 frame: {exc}") from exc

    frame = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=400, detail="Could not decode image frame.")

    height, width = frame.shape[:2]
    if max(height, width) > 1280:
        scale = 1280 / max(height, width)
        frame = cv2.resize(frame, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA)
        height, width = frame.shape[:2]

    started = time.perf_counter()
    try:
        detections = detector.detect(frame, request.labels, request.threshold)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Detection failed: {exc}") from exc
    latency_ms = round((time.perf_counter() - started) * 1000, 1)

    return {
        "count": len(detections),
        "detections": detections,
        "width": width,
        "height": height,
        "latency_ms": latency_ms,
        "mode": detector.status()["mode"],
    }
