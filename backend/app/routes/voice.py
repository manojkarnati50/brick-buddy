"""Optional Sarvam AI voice (Telugu). Browser Web Speech API is the default and needs no server call."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from ..config import settings

router = APIRouter(prefix="/api/voice", tags=["voice"])
SARVAM = "https://api.sarvam.ai"


def _key():
    if not settings.sarvam_api_key:
        raise HTTPException(501, "SARVAM_API_KEY not set; using the browser voice")
    return settings.sarvam_api_key


class TtsIn(BaseModel):
    text: str
    lang: str = "te-IN"


@router.post("/tts")
async def tts(body: TtsIn):
    key = _key()
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(f"{SARVAM}/text-to-speech", headers={"api-subscription-key": key},
                              json={"inputs": [body.text[:500]], "target_language_code": body.lang})
    if r.status_code != 200:
        raise HTTPException(502, f"Sarvam TTS error {r.status_code}")
    audios = r.json().get("audios") or []
    if not audios:
        raise HTTPException(502, "Sarvam returned no audio")
    return {"audio_base64": audios[0], "mime": "audio/wav"}


@router.post("/stt")
async def stt(file: UploadFile = File(...), lang: str = Form("te-IN")):
    key = _key()
    data = await file.read()
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(f"{SARVAM}/speech-to-text", headers={"api-subscription-key": key},
                              files={"file": (file.filename or "speech.wav", data, file.content_type or "audio/wav")},
                              data={"language_code": lang})
    if r.status_code != 200:
        raise HTTPException(502, f"Sarvam STT error {r.status_code}")
    return {"text": r.json().get("transcript", "")}
