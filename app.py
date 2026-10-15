"""صوت دزاير: خادم تحويل النص إلى صوت جزائري بنموذج KasbahTTS (Habibi-TTS / F5-TTS)."""
import io
import json
import os
import re
import secrets
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

BASE = Path(__file__).parent
DATA_DIR = Path(os.getenv("DATA_DIR", BASE))
DB_FILE = DATA_DIR / "codes.json"
VOICES_DIR = Path(os.getenv("VOICES_DIR", BASE / "voices"))

FREE_DAILY_CHARS = int(os.getenv("FREE_DAILY_CHARS", 1000))
FREE_MAX = int(os.getenv("FREE_MAX_PER_REQUEST", 300))
PAID_MAX = int(os.getenv("PAID_MAX_PER_REQUEST", 1500))
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "")
NFE_STEP = int(os.getenv("NFE_STEP", 32))
CFG_STRENGTH = float(os.getenv("CFG_STRENGTH", 2.0))
MAX_QUEUE = int(os.getenv("MAX_QUEUE", 8))
TRUST_PROXY = os.getenv("TRUST_PROXY", "1") == "1"
HF_REPO = os.getenv("HF_REPO", "MenaVoice/KasbahTTS-V0")
SKIP_MODEL = os.getenv("SKIP_MODEL", "0") == "1"  # لتجربة الواجهة بدون GPU

state = {"model": None, "vocoder": None}
gpu_lock = threading.Lock()          # النموذج يخدم طلبًا واحدًا في كل مرة
db_lock = threading.Lock()
slots = threading.BoundedSemaphore(MAX_QUEUE)
ref_cache = {}                       # voice id -> (ref_audio, ref_text)
free_usage = {}                      # ip -> {"day": ..., "used": ...}


# ---------------------------------------------------------------- النموذج
def load_everything():
    from huggingface_hub import hf_hub_download
    from f5_tts.infer.utils_infer import load_model, load_vocoder
    from f5_tts.model import DiT

    ckpt = os.getenv("CKPT_PATH") or hf_hub_download(HF_REPO, "ALGERIA.safetensors")
    vocab = os.getenv("VOCAB_PATH") or hf_hub_download(HF_REPO, "vocab.txt")
    print("تحميل المحوّل الصوتي (vocoder)...")
    state["vocoder"] = load_vocoder(vocoder_name="vocos", is_local=False)
    print("تحميل النموذج...")
    state["model"] = load_model(
        DiT,
        dict(dim=1024, depth=22, heads=16, ff_mult=2, text_dim=512, conv_layers=4),
        ckpt_path=ckpt,
        vocab_file=vocab,
    )
    try:
        import torch
        if not torch.cuda.is_available():
            print("تنبيه: لا يوجد GPU. التوليد على المعالج بطيء جدًا.")
    except Exception:
        pass
    print("النموذج جاهز.")


@asynccontextmanager
async def lifespan(_app):
    if SKIP_MODEL:
        print("وضع SKIP_MODEL: الواجهة تعمل لكن التوليد معطّل.")
    else:
        load_everything()
    yield


app = FastAPI(lifespan=lifespan)


# ---------------------------------------------------------------- الأصوات
def read_voices():
    f = VOICES_DIR / "voices.json"
    if not f.exists():
        return []
    try:
        items = json.loads(f.read_text("utf-8"))
    except Exception:
        return []
    return [v for v in items if (VOICES_DIR / v.get("wav", "")).is_file()]


# ---------------------------------------------------------------- معالجة النص
TASHKEEL = re.compile(r"[ً-ٰٟـ]")
FORBIDDEN = re.compile(r"[A-Za-z0-9٠-٩۰-۹]")


def clean_text(text: str) -> str:
    text = TASHKEEL.sub("", text)  # النموذج لا يدعم التشكيل
    return re.sub(r"\s+", " ", text).strip()


def split_chunks(text: str, limit: int = 120):
    parts = re.split(r"(?<=[.!?؟،,؛;\n])\s*", text)
    chunks, cur = [], ""
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if cur and len(cur) + len(p) + 1 > limit:
            chunks.append(cur)
            cur = p
        else:
            cur = f"{cur} {p}".strip()
    if cur:
        chunks.append(cur)
    return chunks


def synthesize(voice: dict, text: str, speed: float):
    import numpy as np
    from f5_tts.infer.utils_infer import preprocess_ref_audio_text
    from habibi_tts.infer.utils_infer import infer_process

    with gpu_lock:
        if voice["id"] not in ref_cache:
            ref_cache[voice["id"]] = preprocess_ref_audio_text(
                str(VOICES_DIR / voice["wav"]), voice["text"]
            )
        ref_audio, ref_text = ref_cache[voice["id"]]

        pieces, sr = [], 24000
        for chunk in split_chunks(text):
            kwargs = dict(
                ref_audio=ref_audio, ref_text=ref_text, gen_text=chunk,
                model_obj=state["model"], vocoder=state["vocoder"], speed=speed,
            )
            try:
                audio, sr, _ = infer_process(**kwargs, nfe_step=NFE_STEP, cfg_strength=CFG_STRENGTH)
            except TypeError:  # إذا كانت النسخة لا تقبل هذين الوسيطين
                audio, sr, _ = infer_process(**kwargs)
            pieces.append(np.asarray(audio, dtype=np.float32))
            pieces.append(np.zeros(int(sr * 0.15), dtype=np.float32))
        return np.concatenate(pieces[:-1]), sr


def encode_audio(audio, sr):
    import soundfile as sf
    try:
        buf = io.BytesIO()
        sf.write(buf, audio, sr, format="MP3")
        return buf.getvalue(), "audio/mpeg"
    except Exception:
        buf = io.BytesIO()
        sf.write(buf, audio, sr, format="WAV")
        return buf.getvalue(), "audio/wav"


# ---------------------------------------------------------------- الحصص والأكواد
def load_codes():
    try:
        return json.loads(DB_FILE.read_text("utf-8"))
    except Exception:
        return {}


def save_codes(codes):
    DB_FILE.write_text(json.dumps(codes, ensure_ascii=False, indent=2), "utf-8")


def client_ip(request: Request) -> str:
    if TRUST_PROXY:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def get_free(ip: str):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rec = free_usage.get(ip)
    if not rec or rec["day"] != today:
        rec = {"day": today, "used": 0}
        free_usage[ip] = rec
    return rec


# ---------------------------------------------------------------- الواجهات
class TTSRequest(BaseModel):
    text: str
    voice: str = ""
    speed: float = 1.0


class CodeRequest(BaseModel):
    chars: int


@app.get("/")
def home():
    return FileResponse(BASE / "index.html")


@app.get("/health")
def health():
    return {"ok": True, "model_loaded": state["model"] is not None}


@app.get("/api/voices")
def voices():
    return [{"id": v["id"], "name": v.get("name", v["id"])} for v in read_voices()]


@app.get("/api/quota")
def quota(request: Request, x_access_code: str = Header(default="")):
    code = x_access_code.strip()
    if code:
        with db_lock:
            rec = load_codes().get(code)
        if not rec:
            raise HTTPException(404, "الكود غير صحيح")
        return {"type": "paid", "remaining": rec["chars"], "maxPerRequest": PAID_MAX}
    with db_lock:
        used = get_free(client_ip(request))["used"]
    return {"type": "free", "remaining": max(0, FREE_DAILY_CHARS - used), "maxPerRequest": FREE_MAX}


@app.post("/api/tts")
def tts(body: TTSRequest, request: Request, x_access_code: str = Header(default="")):
    if state["model"] is None:
        raise HTTPException(503, "الخدمة غير جاهزة بعد")

    available = read_voices()
    if not available:
        raise HTTPException(503, "لم تتم إضافة أصوات بعد")
    voice = next((v for v in available if v["id"] == body.voice), available[0])

    text = clean_text(body.text)
    if not text:
        raise HTTPException(400, "اكتب نصًا أولًا")
    if FORBIDDEN.search(text):
        raise HTTPException(400, "اكتب النص بالحروف العربية فقط: الأرقام تُكتب بالحروف ولا تستعمل الحروف اللاتينية")
    speed = max(0.7, min(1.3, body.speed))

    code = x_access_code.strip()
    ip = client_ip(request)
    with db_lock:
        if code:
            rec = load_codes().get(code)
            if not rec:
                raise HTTPException(403, "الكود غير صحيح")
            if rec["chars"] < len(text):
                raise HTTPException(402, "رصيد الكود غير كافٍ")
            max_len = PAID_MAX
        else:
            if get_free(ip)["used"] + len(text) > FREE_DAILY_CHARS:
                raise HTTPException(402, "انتهت حصتك المجانية اليوم. اشترِ كودًا للمتابعة.")
            max_len = FREE_MAX
    if len(text) > max_len:
        raise HTTPException(400, f"النص طويل، الحد الأقصى {max_len} حرفًا في المرة الواحدة")

    if not slots.acquire(blocking=False):
        raise HTTPException(503, "الخادم مزدحم الآن، حاول بعد قليل")
    try:
        audio, sr = synthesize(voice, text, speed)
        data, mime = encode_audio(audio, sr)
    except Exception as e:  # noqa: BLE001
        print("TTS error:", repr(e))
        raise HTTPException(500, "تعذر توليد الصوت، جرّب نصًا أقصر أو أعد المحاولة")
    finally:
        slots.release()

    with db_lock:  # الخصم بعد النجاح فقط
        if code:
            codes = load_codes()
            if code in codes:
                codes[code]["chars"] = max(0, codes[code]["chars"] - len(text))
                save_codes(codes)
        else:
            get_free(ip)["used"] += len(text)
    return Response(content=data, media_type=mime)


# أنشئ كودًا بعد استلام الدفع:
# curl -X POST https://موقعك/api/admin/code -H "x-admin-token: TOKEN" -H "Content-Type: application/json" -d '{"chars":20000}'
@app.post("/api/admin/code")
def create_code(body: CodeRequest, x_admin_token: str = Header(default="")):
    if not ADMIN_TOKEN or not secrets.compare_digest(x_admin_token.encode(), ADMIN_TOKEN.encode()):
        raise HTTPException(401, "غير مصرح")
    if body.chars < 1:
        raise HTTPException(400, "حدد عدد الأحرف chars")
    code = "DZ-" + secrets.token_hex(5).upper()
    with db_lock:
        codes = load_codes()
        codes[code] = {"chars": body.chars, "created": datetime.now(timezone.utc).isoformat()}
        save_codes(codes)
    return {"code": code, "chars": body.chars}
