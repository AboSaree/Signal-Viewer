import os
import wfdb
import numpy as np
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
import joblib
from pathlib import Path
from scipy.signal import butter, filtfilt
from scipy.stats import skew, kurtosis


def _safe_log(msg: str) -> None:
    """Log to stdout without crashing on Windows cp1252 consoles."""
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode("ascii", errors="replace").decode("ascii"))


def _hubert_backbone_ready(path: Path) -> bool:
    """True when a local HuBERT-ECG folder contains actual weight files."""
    if not path.is_dir():
        return False
    weight_names = (
        "pytorch_model.bin",
        "model.safetensors",
        "pytorch_model.bin.index.json",
    )
    return any((path / name).exists() for name in weight_names)


# ═══════════════════════════════════════════════════════════════════════════
#  HuBERT-ECG 5-CLASS MAP  (PTB-XL classes — matches Colab training)
# ═══════════════════════════════════════════════════════════════════════════
HUBERT_CLASSES = {
    0: {"code":"NORM", "label":"Normal Sinus Rhythm",
        "severity":"normal",   "color":"#68d391",
        "description":"No abnormality detected. Normal 12-lead ECG.",
        "action":"No action required."},
    1: {"code":"MI",   "label":"Myocardial Infarction",
        "severity":"critical", "color":"#fc8181",
        "description":"ST-segment changes and Q-waves consistent with myocardial infarction.",
        "action":"Urgent cardiology evaluation required."},
    2: {"code":"STTC", "label":"ST/T Change",
        "severity":"warning",  "color":"#f6ad55",
        "description":"Non-specific ST-segment or T-wave abnormality.",
        "action":"Clinical correlation required. May indicate ischemia or electrolyte imbalance."},
    3: {"code":"CD",   "label":"Conduction Disturbance",
        "severity":"warning",  "color":"#63b3ed",
        "description":"Abnormal conduction pattern (LBBB, RBBB, AV block, etc.).",
        "action":"Evaluate for underlying structural heart disease."},
    4: {"code":"HYP",  "label":"Hypertrophy",
        "severity":"info",     "color":"#b794f4",
        "description":"Evidence of atrial or ventricular hypertrophy.",
        "action":"Echocardiogram recommended to assess cardiac structure."},
}

# ═══════════════════════════════════════════════════════════════════════════
#  CLASSICAL SVM CLASSES  (Binary: Normal vs Arrhythmia)
# ═══════════════════════════════════════════════════════════════════════════
CLASSICAL_CLASSES = {
    0: {"code":"NORM", "label":"Normal Rhythm",
        "severity":"normal",  "color":"#68d391",
        "description":"No arrhythmia detected by classical feature analysis.",
        "action":"No action required."},
    1: {"code":"ARR",  "label":"Arrhythmia Detected",
        "severity":"warning", "color":"#f6ad55",
        "description":"Abnormal morphology or rhythm features detected by SVM classifier.",
        "action":"Clinical correlation and further evaluation recommended."},
}

# ═══════════════════════════════════════════════════════════════════════════
#  MODEL LOADING
# ═══════════════════════════════════════════════════════════════════════════
BASE_DIR = Path(__file__).resolve().parent
AI_DIR   = BASE_DIR / "ai"

# 2. Classical SVM (PTB-XL, 12-lead, binary)
try:
    svm_model   = joblib.load(AI_DIR / "classical_model.pkl")
    svm_scaler  = joblib.load(AI_DIR / "classical_scaler.pkl")
    svm_imputer = joblib.load(AI_DIR / "classical_imputer.pkl")
    _safe_log("[ECG-AI] Classical SVM loaded")
except Exception as e:
    _safe_log(f"[ECG-AI] Classical SVM load error: {e}")
    svm_model = svm_scaler = svm_imputer = None

# 3. HuBERT-ECG (12-lead deep model, fine-tuned on PTB-XL)
hubert_model      = None
hubert_dev        = None
HUBERT_MODEL_SIZE = "base"

try:
    import torch
    import torch.nn as nn
    from transformers import AutoModel

    hubert_dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    class HuBERTECGClassifier(nn.Module):
        def __init__(self, backbone, hidden_size=768, num_classes=5, dropout=0.3):
            super().__init__()
            self.backbone = backbone
            self.n_leads  = 12
            self.feature_proj = nn.Sequential(
                nn.Linear(hidden_size, 512),
                nn.LayerNorm(512),
                nn.GELU(),
                nn.Dropout(dropout),
            )
            self.binary_head = nn.Sequential(
                nn.Linear(512, 128), nn.GELU(), nn.Linear(128, 1)
            )
            self.type_head = nn.Sequential(
                nn.Linear(512, 128), nn.GELU(), nn.Linear(128, num_classes)
            )

        def forward(self, x):
            # x: (B, 12, seq_len) — process each lead separately
            all_hidden = []
            for i in range(x.shape[1]):
                lead_out = self.backbone(x[:, i, :])
                pooled   = lead_out.last_hidden_state.mean(dim=1)
                all_hidden.append(pooled)
            pooled   = torch.stack(all_hidden, dim=1).mean(dim=1)
            features = self.feature_proj(pooled)
            return self.binary_head(features), self.type_head(features)

        def predict_proba(self, x):
            self.eval()
            with torch.no_grad():
                if x.shape[0] == 1:
                    x2 = x.repeat(2, 1, 1)
                    binary_logit, type_logit = self.forward(x2)
                    binary_logit = binary_logit[:1]
                    type_logit   = type_logit[:1]
                else:
                    binary_logit, type_logit = self.forward(x)
                prob_abnormal = torch.sigmoid(binary_logit)
                prob_normal   = 1.0 - prob_abnormal
                type_probs    = torch.softmax(type_logit, dim=1)
                scaled = type_probs * prob_abnormal
                return torch.cat([prob_normal, scaled], dim=1)  # (B, 5)

    # Load checkpoint
    ckpt_path = AI_DIR / "hubert_ecg_classifier.pt"
    ckpt = torch.load(str(ckpt_path), map_location=hubert_dev, weights_only=False)
    _safe_log(f"[ECG-AI] Checkpoint keys: {list(ckpt.keys())}")

    HUBERT_MODEL_SIZE = ckpt.get("model_size", "base")
    hidden_size = {"small": 256, "base": 768, "large": 1024}.get(HUBERT_MODEL_SIZE, 768)
    num_classes = ckpt.get("num_classes", 5)

    # Load backbone from local cache (config-only folder is not enough)
    local_backbone_path = AI_DIR / f"hubert-ecg-{HUBERT_MODEL_SIZE}"
    hf_model_id = f"Edoardo-BS/hubert-ecg-{HUBERT_MODEL_SIZE}"
    if _hubert_backbone_ready(local_backbone_path):
        _safe_log(f"[ECG-AI] Loading backbone from local: {local_backbone_path}")
        # Weights are local; custom modeling code may still be fetched from HF once.
        bb = AutoModel.from_pretrained(str(local_backbone_path), trust_remote_code=True)
    else:
        _safe_log(f"[ECG-AI] Downloading backbone from HuggingFace: {hf_model_id}")
        bb = AutoModel.from_pretrained(hf_model_id, trust_remote_code=True)

    hubert_model = HuBERTECGClassifier(bb, hidden_size=hidden_size, num_classes=num_classes).to(hubert_dev)

    # Support all checkpoint key formats
    state_dict = (
        ckpt.get("model_state") or
        ckpt.get("model_state_dict") or
        ckpt.get("state_dict") or
        ckpt.get("weights")
    )
    # If checkpoint IS the state dict directly (all values are tensors)
    if state_dict is None:
        try:
            if all(isinstance(v, torch.Tensor) for v in ckpt.values()):
                state_dict = ckpt
        except Exception:
            pass

    if state_dict is None:
        raise KeyError(f"No model weights found. Keys: {list(ckpt.keys())}")

    hubert_model.load_state_dict(state_dict, strict=False)
    hubert_model.eval()
    _safe_log(f"[ECG-AI] HuBERT-ECG ({HUBERT_MODEL_SIZE}) loaded on {hubert_dev}")

except ImportError as e:
    _safe_log(f"[ECG-AI] HuBERT-ECG not available: {e}")
except Exception as e:
    import traceback
    _safe_log(f"[ECG-AI] HuBERT-ECG load error: {e}")
    traceback.print_exc()

# ═══════════════════════════════════════════════════════════════════════════
#  UTILITIES
# ═══════════════════════════════════════════════════════════════════════════

def _cors(response):
    response["Access-Control-Allow-Origin"]  = "*"
    response["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS"
    response["Access-Control-Allow-Headers"] = "Content-Type, Accept"
    return response

def detect_r_peaks_simple(signal, fs):
    diff = np.diff(signal) ** 2
    win  = max(1, int(0.15 * fs))
    mwi  = np.convolve(diff, np.ones(win) / win, mode='same')
    thr  = 0.3 * np.max(mwi)
    ref  = int(0.2 * fs)
    peaks, i = [], 0
    while i < len(mwi):
        if mwi[i] > thr:
            end = min(i + ref, len(mwi))
            peaks.append(i + int(np.argmax(mwi[i:end])))
            i = end
        else:
            i += 1
    return np.array(peaks)

def calculate_heart_rate(signal, fs):
    peaks = detect_r_peaks_simple(signal, fs)
    if len(peaks) < 2:
        return 75.0
    rr = np.diff(peaks) / fs
    rr = rr[(rr > 0.3) & (rr < 2.0)]
    return float(60.0 / np.mean(rr)) if len(rr) else 75.0

def _error_result(msg, hr=0, num_leads=0):
    return {
        "method": "error", "findings": [],
        "primary": {"code":"ERR","label":msg,"confidence":0,
                    "severity":"info","color":"#718096",
                    "description":msg,"action":"Manual review required."},
        "is_normal": None, "hr_bpm": hr,
        "num_leads_used": num_leads, "leads_note": f"{num_leads}-lead ECG"
    }

# ═══════════════════════════════════════════════════════════════════════════
#  MODEL 2 — CLASSICAL SVM
# ═══════════════════════════════════════════════════════════════════════════

def _bandpass(signal, fs, low=0.5, high=40.0):
    nyq = 0.5 * fs
    b, a = butter(3, [low/nyq, high/nyq], btype='band')
    return filtfilt(b, a, signal)

def _normalize(lead):
    mn, mx = lead.min(), lead.max()
    return 2*(lead-mn)/(mx-mn)-1 if mx-mn > 1e-8 else lead

def preprocess_lead_classical(signal, fs):
    signal = np.nan_to_num(signal, nan=0.0)
    return _normalize(_bandpass(signal, fs))

def extract_features_per_lead(segment, fs):
    f = []
    f += [np.mean(segment), np.std(segment), np.min(segment), np.max(segment),
          np.ptp(segment), float(skew(segment)), float(kurtosis(segment)),
          np.sum(segment**2), np.mean(np.abs(np.diff(segment))), np.sum(np.abs(np.diff(segment)))]
    r_idx  = int(np.argmax(segment)); r_amp = float(segment[r_idx])
    q_zone = segment[max(0,r_idx-15):r_idx]
    q_amp  = float(np.min(q_zone)) if len(q_zone) else 0.0
    s_zone = segment[r_idx:min(len(segment),r_idx+15)]
    s_amp  = float(np.min(s_zone)) if len(s_zone) else 0.0
    t_zone = segment[min(r_idx+10,len(segment)-1):]
    t_amp  = float(np.max(t_zone)) if len(t_zone) else 0.0
    above  = np.where(segment > 0.5*r_amp)[0]
    qrs_w  = float(len(above))/fs*1000
    p_zone = segment[max(0,r_idx-40):max(0,r_idx-15)]
    p_amp  = float(np.max(p_zone)) if len(p_zone) else 0.0
    st_z   = segment[min(r_idx+5,len(segment)-1):min(r_idx+20,len(segment))]
    st_elev= float(np.mean(st_z)) if len(st_z) else 0.0
    f += [r_amp,q_amp,s_amp,t_amp,p_amp,r_amp-q_amp,r_amp-s_amp,t_amp/(r_amp+1e-8),qrs_w,st_elev]
    b0 = segment - np.mean(segment); var = np.var(b0)+1e-8
    for lag in range(1,11):
        f.append(float(np.mean(b0[lag:]*b0[:-lag])/var))
    full_ac  = np.correlate(b0, b0, mode='full')
    full_ac  = full_ac[len(full_ac)//2:]
    full_ac  = full_ac/(full_ac[0]+1e-8)
    peaks_ac = [i for i in range(1,min(50,len(full_ac)-1))
                if full_ac[i]>full_ac[i-1] and full_ac[i]>full_ac[i+1]]
    dom = peaks_ac[0]/fs if peaks_ac else 0.0
    f += [dom, 60.0/(dom+1e-8), float(np.median(segment)),
          float(np.percentile(segment,25)), float(np.percentile(segment,75))]
    assert len(f)==35
    return np.array(f, dtype=np.float32)

def extract_features_12lead(signal_12lead, fs):
    seg_len   = min(signal_12lead.shape[0], int(5*fs))
    all_feats = []
    for li in range(min(signal_12lead.shape[1], 12)):
        lead = preprocess_lead_classical(signal_12lead[:seg_len, li], fs)
        all_feats.append(extract_features_per_lead(lead, fs))
    while len(all_feats) < 12:
        all_feats.append(np.zeros(35, dtype=np.float32))
    return np.concatenate(all_feats)

def classify_classical_svm(signal_12lead, fs, num_leads):
    if svm_model is None or svm_scaler is None or svm_imputer is None:
        return _error_result(
            "Classical model not available — place classical_model.pkl, "
            "classical_scaler.pkl, classical_imputer.pkl in viewer/ai/",
            calculate_heart_rate(signal_12lead[:,0], fs), num_leads)
    try:
        feats     = extract_features_12lead(signal_12lead, fs).reshape(1,-1)
        feats     = svm_imputer.transform(feats)
        feats     = svm_scaler.transform(feats)
        proba_raw = svm_model.predict_proba(feats)[0]
    except Exception as exc:
        return _error_result(f"Feature extraction error: {exc}",
                             calculate_heart_rate(signal_12lead[:,0], fs), num_leads)

    model_name = type(svm_model).__name__
    is_calibrated_rf = 'Calibrated' in model_name or 'Forest' in model_name

    if not is_calibrated_rf:
        PTBXL_PRIOR     = np.array([0.21, 0.79])
        proba_corrected = proba_raw / (PTBXL_PRIOR + 1e-9)
        proba           = proba_corrected / proba_corrected.sum()
        model_tag       = 'classical_svm'
        model_label     = 'Classical SVM · PTB-XL · prior-corrected'
    else:
        proba       = proba_raw
        model_tag   = 'classical_rf'
        model_label = 'RandomForest · PTB-XL balanced · calibrated'

    print(f"[ECG-AI] {model_name}: raw={proba_raw.round(3)} used={proba.round(3)}")

    findings = []
    for cid, prob in enumerate(proba):
        if prob > 0.15:
            m = CLASSICAL_CLASSES[cid]
            findings.append({"code":m["code"],"label":m["label"],
                             "confidence":round(float(prob),3),"severity":m["severity"],
                             "color":m["color"],"description":m["description"],"action":m["action"]})
    findings.sort(key=lambda x: x["confidence"], reverse=True)
    if not findings:
        best = int(np.argmax(proba)); m = CLASSICAL_CLASSES[best]
        findings = [{"code":m["code"],"label":m["label"],
                     "confidence":round(float(proba[best]),3),"severity":m["severity"],
                     "color":m["color"],"description":m["description"],"action":m["action"]}]

    primary    = findings[0]
    hr_bpm     = calculate_heart_rate(signal_12lead[:,0], fs)
    leads_used = min(num_leads, 12)
    leads_note = f"{leads_used}-lead · 420 features · {model_label}"
    print(f"[ECG-AI] Classical → {primary['label']} ({primary['confidence']:.0%})")
    return {"method": model_tag, "findings":findings,"primary":primary,
            "is_normal":primary["code"]=="NORM","hr_bpm":round(hr_bpm,1),
            "num_leads_used":leads_used,"leads_note":leads_note}

# ═══════════════════════════════════════════════════════════════════════════
#  MODEL 3 — HuBERT-ECG
# ═══════════════════════════════════════════════════════════════════════════

def preprocess_ecg_hubert(signal_12lead, fs_in=100, target_len=1000, num_leads=12):
    """Returns (12, 1000) float32 — matches Colab preprocessing exactly."""
    from scipy.signal import resample_poly as _rp
    result = []
    for i in range(min(signal_12lead.shape[1], num_leads)):
        lead = np.nan_to_num(signal_12lead[:, i].copy(), nan=0.0)
        # Bandpass 0.5–40 Hz
        nyq = 0.5 * fs_in
        low  = max(0.5 / nyq, 1e-4)
        high = min(40.0 / nyq, 0.99)
        try:
            b, a = butter(3, [low, high], btype='band')
            lead = filtfilt(b, a, lead)
        except Exception:
            pass
        # Resample to 100 Hz
        if int(fs_in) != 100:
            try:
                lead = _rp(lead, 100, int(fs_in))
            except Exception:
                from scipy.signal import resample
                lead = resample(lead, int(len(lead) * 100 / fs_in))
        # Z-score normalize
        mu, sigma = lead.mean(), lead.std()
        lead = (lead - mu) / (sigma + 1e-8)
        lead = np.clip(lead, -10, 10)
        # Crop or pad
        if len(lead) >= target_len:
            s    = (len(lead) - target_len) // 2
            lead = lead[s:s + target_len]
        else:
            lead = np.pad(lead, (0, target_len - len(lead)), mode='constant')
        result.append(lead.astype(np.float32))
    while len(result) < num_leads:
        result.append(np.zeros(target_len, dtype=np.float32))
    return np.stack(result)   # (12, 1000)


def classify_hubert_ecg(signal_12lead, fs, num_leads):
    if hubert_model is None:
        return _error_result(
            "HuBERT-ECG not available — place hubert_ecg_classifier.pt in viewer/ai/",
            calculate_heart_rate(signal_12lead[:,0], fs), num_leads)
    try:
        import torch
        ecg_np = preprocess_ecg_hubert(signal_12lead, fs_in=fs)
        ecg_t  = torch.tensor(ecg_np).unsqueeze(0).to(hubert_dev)   # (1, 12, 1000)
        probs  = hubert_model.predict_proba(ecg_t)[0].cpu().numpy() # (5,)
    except Exception as exc:
        import traceback; traceback.print_exc()
        return _error_result(f"HuBERT inference error: {exc}",
                             calculate_heart_rate(signal_12lead[:,0], fs), num_leads)

    findings = []
    for cid, prob in enumerate(probs):
        if prob > 0.10:
            m = HUBERT_CLASSES[cid]
            findings.append({"code":m["code"],"label":m["label"],
                             "confidence":round(float(prob),3),"severity":m["severity"],
                             "color":m["color"],"description":m["description"],"action":m["action"]})
    findings.sort(key=lambda x: x["confidence"], reverse=True)
    if not findings:
        best = int(np.argmax(probs)); m = HUBERT_CLASSES[best]
        findings = [{"code":m["code"],"label":m["label"],
                     "confidence":round(float(probs[best]),3),"severity":m["severity"],
                     "color":m["color"],"description":m["description"],"action":m["action"]}]

    primary    = findings[0]
    hr_bpm     = calculate_heart_rate(signal_12lead[:,0], fs)
    leads_used = min(num_leads, 12)
    all_probs  = {HUBERT_CLASSES[i]["code"]: round(float(probs[i]), 3) for i in range(len(HUBERT_CLASSES))}
    print(f"[ECG-AI] HuBERT-ECG → {primary['label']} ({primary['confidence']:.0%}) | {all_probs}")
    return {
        "method":         f"hubert_ecg_{HUBERT_MODEL_SIZE}",
        "findings":       findings,
        "primary":        primary,
        "is_normal":      primary["code"] == "NORM",
        "hr_bpm":         round(hr_bpm, 1),
        "num_leads_used": leads_used,
        "all_probs":      all_probs,
        "leads_note":     f"12-lead HuBERT-ECG — pre-trained on 9.1M ECGs ({HUBERT_MODEL_SIZE})",
    }

# ═══════════════════════════════════════════════════════════════════════════
#  DISPATCHER
# ═══════════════════════════════════════════════════════════════════════════

def run_ai(signal_12lead, fs, num_leads, model_name="auto"):
    if model_name == "classical_svm":
        return classify_classical_svm(signal_12lead, fs, num_leads)
    if model_name in ("hubert", "hubert_ecg", f"hubert_ecg_{HUBERT_MODEL_SIZE}"):
        return classify_hubert_ecg(signal_12lead, fs, num_leads)
    # auto
    if num_leads >= 12 and hubert_model is not None:
        return classify_hubert_ecg(signal_12lead, fs, num_leads)
    if svm_model is not None:
        return classify_classical_svm(signal_12lead, fs, num_leads)
    return _error_result("No AI model files found in viewer/ai/", 0, num_leads)

# ═══════════════════════════════════════════════════════════════════════════
#  API ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@csrf_exempt
def upload_view_ecg(request):
    if request.method == "OPTIONS":
        return _cors(JsonResponse({}))
    if request.method != "POST":
        return _cors(JsonResponse({"error": "POST only"}, status=405))

    files = request.FILES.getlist("files")
    if not files:
        return _cors(JsonResponse({"error": "No files received"}, status=400))

    hea_file = next((f for f in files if f.name.lower().endswith(".hea")), None)
    if not hea_file:
        return _cors(JsonResponse(
            {"error": "No .hea file found. Upload the header file together with all signal files."},
            status=400))

    save_dir = settings.MEDIA_ROOT / "wfdb"
    os.makedirs(save_dir, exist_ok=True)
    saved = []
    for f in files:
        dest = save_dir / f.name
        with open(dest, "wb+") as out:
            for chunk in f.chunks():
                out.write(chunk)
        saved.append(f.name)
    print(f"[ECG upload] saved: {saved}")

    record_name = hea_file.name[:-4]
    record_path = str(save_dir / record_name)

    try:
        record = wfdb.rdrecord(record_path)
    except FileNotFoundError as exc:
        return _cors(JsonResponse({
            "error": f"Missing file: {exc}. Received: {saved}. Select ALL files for this record."
        }, status=400))
    except Exception as exc:
        return _cors(JsonResponse({"error": f"WFDB read error: {exc}"}, status=500))

    fs         = record.fs
    num_leads  = record.n_sig
    total_samp = record.sig_len
    sig_names  = record.sig_name
    sig_units  = record.units or ["mV"] * num_leads
    MAX_SAMP   = 5000

    channels = []
    for i in range(num_leads):
        col = record.p_signal[:MAX_SAMP, i]
        channels.append(np.nan_to_num(col, nan=0.0).tolist())

    time = (np.arange(min(MAX_SAMP, total_samp)) / fs).tolist()

    model_param = request.GET.get("model", "auto").strip().lower()
    full_signal = np.nan_to_num(record.p_signal, nan=0.0)
    single_lead = full_signal[:, 0]
    try:
        ai_result = run_ai(full_signal, fs, num_leads, model_param)
    except Exception as exc:
        print(f"[ECG-AI] Classification error: {exc}")
        ai_result = _error_result(str(exc), 0, num_leads)

    available_models = []
    if svm_model    is not None: available_models.append("classical_svm")
    if hubert_model is not None: available_models.append(f"hubert_ecg_{HUBERT_MODEL_SIZE}")

    return _cors(JsonResponse({
        "record_name":      record_name,
        "fs":               fs,
        "num_leads":        num_leads,
        "total_samples":    total_samp,
        "sig_names":        sig_names,
        "sig_units":        sig_units,
        "duration_sec":     round(total_samp / fs, 2),
        "files_received":   saved,
        "time":             time,
        "signal":           channels[0],
        "channels":         channels,
        "num_channels":     num_leads,
        "num_samples":      len(channels[0]),
        "window_start":     0,
        "window_end":       min(MAX_SAMP, total_samp),
        "ai":               ai_result,
        "available_models": available_models,
        "active_model":     model_param,
    }))


@csrf_exempt
def reanalyze_view(request):
    if request.method == "OPTIONS":
        return _cors(JsonResponse({}))

    record_name = request.GET.get("record", "").strip()
    model_param = request.GET.get("model", "auto").strip().lower()
    if model_param.startswith("hubert"):
        model_param = "hubert_ecg"

    if not record_name:
        return _cors(JsonResponse({"error": "record param required"}, status=400))

    record_path = str(settings.MEDIA_ROOT / "wfdb" / record_name)
    try:
        record = wfdb.rdrecord(record_path)
    except Exception as exc:
        return _cors(JsonResponse({"error": f"WFDB read error: {exc}"}, status=500))

    fs        = record.fs
    num_leads = record.n_sig
    full_sig  = np.nan_to_num(record.p_signal, nan=0.0)
    try:
        ai_result = run_ai(full_sig, fs, num_leads, model_param)
    except Exception as exc:
        ai_result = _error_result(str(exc), 0, num_leads)

    available_models = []
    if svm_model    is not None: available_models.append("classical_svm")
    if hubert_model is not None: available_models.append(f"hubert_ecg_{HUBERT_MODEL_SIZE}")

    return _cors(JsonResponse({
        "ai":               ai_result,
        "available_models": available_models,
        "active_model":     model_param,
    }))


@csrf_exempt
def window_view(request):
    if request.method == "OPTIONS":
        return _cors(JsonResponse({}))

    record_name = request.GET.get("record", "").strip()
    start       = int(request.GET.get("start", 0))
    end         = int(request.GET.get("end",   5000))

    if not record_name:
        return _cors(JsonResponse({"error": "record param required"}, status=400))

    record_path = str(settings.MEDIA_ROOT / "wfdb" / record_name)
    try:
        record = wfdb.rdrecord(record_path, sampfrom=start, sampto=end)
    except Exception as exc:
        return _cors(JsonResponse({"error": f"WFDB read error: {exc}"}, status=500))

    fs        = record.fs
    num_leads = record.n_sig
    length    = record.sig_len
    channels  = []
    for i in range(num_leads):
        col = record.p_signal[:, i]
        channels.append(np.nan_to_num(col, nan=0.0).tolist())
    time = (np.arange(length) / fs + start / fs).tolist()

    return _cors(JsonResponse({
        "record_name":  record_name,
        "fs":           fs,
        "sig_names":    record.sig_name,
        "time":         time,
        "channels":     channels,
        "num_channels": num_leads,
        "num_samples":  length,
        "window_start": start,
        "window_end":   start + length,
    }))


# ═══════════════════════════════════════════════════════════════════════════
#  EEG — BIOT MODEL  (Biosignal Transformer, fine-tuned on TUEV/TUAB)
# ═══════════════════════════════════════════════════════════════════════════

# ── EEG class map ──────────────────────────────────────────────────────────
# TUEV (Temple University EEG Events) 6-class seizure/artefact classification.
# Adjust labels below to match however you trained the head.
EEG_BIOT_CLASSES = {
    0: {"code": "SPSW", "label": "Spike and Sharp Wave",
        "severity": "critical", "color": "#fc8181",
        "description": "Epileptiform discharge — spike-and-slow-wave complex.",
        "action": "Urgent neurology evaluation."},
    1: {"code": "GPED", "label": "Generalised Periodic Epileptiform",
        "severity": "critical", "color": "#f6ad55",
        "description": "Generalised periodic epileptiform discharge (GPED).",
        "action": "Close monitoring; consider anti-epileptic medication."},
    2: {"code": "PLED", "label": "Lateralised Periodic Epileptiform",
        "severity": "warning", "color": "#b794f4",
        "description": "Lateralised (focal) periodic epileptiform discharge (PLED).",
        "action": "Neurology referral and structural imaging recommended."},
    3: {"code": "EYEM", "label": "Eye Movement Artefact",
        "severity": "info",    "color": "#63b3ed",
        "description": "Eye-movement contamination detected in EEG signal.",
        "action": "Artefact — repeat acquisition with eye closure."},
    4: {"code": "ARTF", "label": "Muscle / Motion Artefact",
        "severity": "info",    "color": "#4fd1c5",
        "description": "High-frequency muscle or electrode-movement artefact.",
        "action": "Artefact — improve electrode contact and repeat."},
    5: {"code": "BCKG", "label": "Background (Normal)",
        "severity": "normal",  "color": "#68d391",
        "description": "Normal background EEG activity — no pathological discharge.",
        "action": "No action required."},
    6: {"code": "SEIZ", "label": "Seizure Activity",
        "severity": "critical", "color": "#fc8181",
        "description": "Ictal pattern — sustained rhythmic epileptiform discharge.",
        "action": "Immediate medical intervention required."},
}

# ── BIOT architecture (mirrors the saved checkpoint) ──────────────────────
biot_model = None
biot_dev   = None

try:
    import torch
    import torch.nn as nn
    import math

    biot_dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    # ── Step 1: read exact shapes from checkpoint BEFORE building model ───
    _ckpt = torch.load(str(AI_DIR / "eeg_biot_best.pt"),
                       map_location=biot_dev, weights_only=False)

    # Derive every hyperparameter directly from tensor shapes in the checkpoint
    _head_w  = _ckpt["final_layer.classification_head.weight"]   # (num_cls, emb_dim)
    _head_b  = _ckpt["final_layer.classification_head.bias"]      # (num_cls,)
    _patch_w = _ckpt["encoder.patch_embedding.projection.weight"] # (emb_dim, patch_size)
    _idx     = _ckpt["encoder.index"]                             # (n_ch,)
    _ch_tok  = _ckpt["encoder.channel_tokens.weight"]            # (n_ch_embed, emb_dim)
    _pe      = _ckpt["encoder.positional_encoding.pe"]            # (1, max_len, emb_dim) or (max_len, emb_dim)

    _NUM_CLS   = int(_head_w.shape[0])          # e.g. 7
    _EMB_DIM   = int(_head_w.shape[1])          # e.g. 256
    _PATCH_SZ  = int(_patch_w.shape[1])         # e.g. 101
    _IDX_LEN   = int(_idx.shape[0])             # e.g. 18  → this is what encoder.index holds
    _N_CH_EMB  = int(_ch_tok.shape[0])          # e.g. 18  → channel_tokens rows
    _MAX_LEN   = int(_pe.shape[-2])             # e.g. 1000
    # mlp_dim from ffn weight
    _ffn_w1    = _ckpt["encoder.transformer.layers.layers.0.1.fn.fn.w1.weight"]  # (mlp_dim, emb_dim)
    _MLP_DIM   = int(_ffn_w1.shape[0])          # e.g. 1024
    # depth from number of transformer layer groups
    _DEPTH     = sum(1 for k in _ckpt if k.startswith("encoder.transformer.layers.layers.")
                     and k.count(".") == 5 and k.endswith(".0.norm.weight"))

    _safe_log(
        f"[EEG-AI] Checkpoint shapes: num_cls={_NUM_CLS}, emb_dim={_EMB_DIM}, "
        f"patch_sz={_PATCH_SZ}, idx_len={_IDX_LEN}, n_ch_emb={_N_CH_EMB}, "
        f"mlp_dim={_MLP_DIM}, depth={_DEPTH}, max_len={_MAX_LEN}"
    )

    # ── Step 2: build architecture that EXACTLY matches checkpoint keys ────

    class _LocalAttention(nn.Module):
        def __init__(self, dim, heads=8, dropout=0.0):
            super().__init__()
            self.heads   = heads
            self.scale   = (dim // heads) ** -0.5
            self.to_q    = nn.Linear(dim, dim, bias=False)
            self.to_k    = nn.Linear(dim, dim, bias=False)
            self.to_v    = nn.Linear(dim, dim, bias=False)
            self.to_out  = nn.Linear(dim, dim)
            self.dropout = nn.Dropout(dropout)
            # local_attn sub-module to match checkpoint key
            # "encoder.transformer.layers.layers.0.0.fn.local_attn.dropout"
            self.local_attn = nn.ModuleDict({"dropout": nn.Dropout(dropout)})

        def forward(self, x):
            B, N, D = x.shape
            H, d = self.heads, D // self.heads
            q = self.to_q(x).view(B, N, H, d).transpose(1, 2)
            k = self.to_k(x).view(B, N, H, d).transpose(1, 2)
            v = self.to_v(x).view(B, N, H, d).transpose(1, 2)
            attn = torch.softmax(q @ k.transpose(-2, -1) * self.scale, dim=-1)
            attn = self.dropout(attn)
            out  = (attn @ v).transpose(1, 2).reshape(B, N, D)
            return self.to_out(out)

    class _FeedForward(nn.Module):
        def __init__(self, dim, mlp_dim, dropout=0.0):
            super().__init__()
            self.w1      = nn.Linear(dim, mlp_dim)
            self.act     = nn.GELU()
            self.dropout = nn.Dropout(dropout)
            self.w2      = nn.Linear(mlp_dim, dim)
        def forward(self, x):
            return self.w2(self.dropout(self.act(self.w1(x))))

    class _PreNorm(nn.Module):
        def __init__(self, dim, fn):
            super().__init__()
            self.norm = nn.LayerNorm(dim)
            self.fn   = fn
        def forward(self, x, **kw):
            return self.fn(self.norm(x), **kw)

    class _PatchEmbedding(nn.Module):
        def __init__(self, patch_size, emb_dim):
            super().__init__()
            self.projection = nn.Linear(patch_size, emb_dim)
        def forward(self, x):
            return self.projection(x)

    class _PositionalEncoding(nn.Module):
        def __init__(self, max_len, emb_dim):
            super().__init__()
            self.dropout = nn.Dropout(0.1)
            pe  = torch.zeros(max_len, emb_dim)
            pos = torch.arange(max_len).unsqueeze(1).float()
            div = torch.exp(torch.arange(0, emb_dim, 2).float() * (-math.log(10000.0) / emb_dim))
            pe[:, 0::2] = torch.sin(pos * div)
            half = emb_dim // 2
            pe[:, 1::2] = torch.cos(pos * div)[:, :pe[:, 1::2].shape[1]]
            self.register_buffer('pe', pe.unsqueeze(0))   # (1, max_len, emb_dim)
        def forward(self, x):
            return self.dropout(x + self.pe[:, :x.size(1)])

    # Inner classes that produce key pattern:
    # encoder.transformer.layers.layers.i.j.*
    class _InnerLayers(nn.Module):
        def __init__(self, dim, depth, heads, mlp_dim, dropout=0.):
            super().__init__()
            rows = []
            for _ in range(depth):
                rows.append(nn.ModuleList([
                    _PreNorm(dim, _LocalAttention(dim, heads, dropout)),
                    _PreNorm(dim, _FeedForward(dim, mlp_dim, dropout)),
                ]))
            self.layers = nn.ModuleList(rows)
        def forward(self, x):
            for attn, ff in self.layers:
                x = attn(x) + x
                x = ff(x)   + x
            return x

    class _TransformerOuter(nn.Module):
        """Wraps _InnerLayers as .layers so keys become
           encoder.transformer.layers.layers.i.j.*"""
        def __init__(self, dim, depth, heads, mlp_dim, dropout=0.):
            super().__init__()
            self.layers = _InnerLayers(dim, depth, heads, mlp_dim, dropout)
        def forward(self, x): return self.layers(x)

    class BIOTEncoder(nn.Module):
        def __init__(self, emb_dim, heads, depth, n_ch_embed,
                     patch_size, mlp_dim, idx_len, max_len):
            super().__init__()
            # encoder.index → shape (idx_len,)
            self.index = nn.Parameter(
                torch.zeros(idx_len, dtype=torch.long), requires_grad=False)
            self.patch_embedding     = _PatchEmbedding(patch_size, emb_dim)
            self.transformer         = _TransformerOuter(emb_dim, depth, heads, mlp_dim)
            self.positional_encoding = _PositionalEncoding(max_len, emb_dim)
            # channel_tokens rows = n_ch_embed (NOT n_ch_embed+1)
            self.channel_tokens      = nn.Embedding(n_ch_embed, emb_dim)

        def forward(self, x):
            # x: (B, C, T)
            B, C, T = x.shape
            patch_size = self.patch_embedding.projection.in_features
            # Pad / crop T to be divisible by patch_size
            if T % patch_size != 0:
                pad = patch_size - (T % patch_size)
                x = torch.nn.functional.pad(x, (0, pad))
                T = x.shape[2]
            n_patches = T // patch_size
            # Reshape: (B*C, n_patches, patch_size)
            patches = x.reshape(B * C, n_patches, patch_size)
            emb = self.patch_embedding(patches)               # (B*C, n_patches, emb_dim)

            # Channel token: use index 0..(C-1), clamped to embedding size
            ch_idx = torch.arange(C, device=x.device).clamp(0, self.channel_tokens.num_embeddings - 1)
            tok = self.channel_tokens(ch_idx)                 # (C, emb_dim)
            tok = tok.unsqueeze(0).expand(B, -1, -1)          # (B, C, emb_dim)
            tok = tok.reshape(B * C, 1, -1)                   # (B*C, 1, emb_dim)
            emb = emb + tok
            emb = self.positional_encoding(emb)

            out  = self.transformer(emb)                      # (B*C, n_patches, emb_dim)
            pool = out.mean(dim=1)                            # (B*C, emb_dim)
            pool = pool.view(B, C, -1).mean(dim=1)           # (B, emb_dim)
            return pool

    class BIOTClassifier(nn.Module):
        def __init__(self, num_classes, emb_dim, heads, depth,
                     n_ch_embed, patch_size, mlp_dim, idx_len, max_len):
            super().__init__()
            self.encoder = BIOTEncoder(
                emb_dim=emb_dim, heads=heads, depth=depth,
                n_ch_embed=n_ch_embed, patch_size=patch_size,
                mlp_dim=mlp_dim, idx_len=idx_len, max_len=max_len,
            )
            self.final_layer = nn.ModuleDict({
                "activation_layer":    nn.GELU(),
                "classification_head": nn.Linear(emb_dim, num_classes),
            })

        def forward(self, x):
            feat  = self.encoder(x)
            feat  = self.final_layer["activation_layer"](feat)
            return self.final_layer["classification_head"](feat)

        def predict_proba(self, x):
            self.eval()
            with torch.no_grad():
                return torch.softmax(self.forward(x), dim=-1)

    # ── Step 3: instantiate with exact dimensions & load weights ──────────
    biot_model = BIOTClassifier(
        num_classes = _NUM_CLS,
        emb_dim     = _EMB_DIM,
        heads       = 8,          # to_q/to_k/to_v are (256,256) → any divisor works; 8 is typical
        depth       = _DEPTH,
        n_ch_embed  = _N_CH_EMB,
        patch_size  = _PATCH_SZ,
        mlp_dim     = _MLP_DIM,
        idx_len     = _IDX_LEN,
        max_len     = _MAX_LEN,
    ).to(biot_dev)

    missing, unexpected = biot_model.load_state_dict(_ckpt, strict=False)
    biot_model.eval()
    if missing:
        _safe_log(f"[EEG-AI] Missing keys ({len(missing)}): {missing[:5]}")
    if unexpected:
        _safe_log(f"[EEG-AI] Unexpected keys ({len(unexpected)}): {unexpected[:5]}")
    _safe_log(
        f"[EEG-AI] BIOT loaded: {_NUM_CLS} classes, emb={_EMB_DIM}, "
        f"patch={_PATCH_SZ}, ch_emb={_N_CH_EMB}, mlp={_MLP_DIM}, depth={_DEPTH}"
    )

except ImportError as _e:
    _safe_log(f"[EEG-AI] BIOT not available: {_e}")
except Exception as _e:
    import traceback as _tb
    _safe_log(f"[EEG-AI] BIOT load error: {_e}")
    _tb.print_exc()


def preprocess_eeg_biot(signal_nd, fs_in, target_fs=200, max_duration_sec=30):
    """
    Preprocesses EEG for BIOT inference.
    Returns float32 numpy array (C, T) where T is divisible by the model's patch_size.
    signal_nd: np.ndarray shape (T, C)
    """
    from scipy.signal import resample_poly, butter, filtfilt
    from math import gcd

    # Get patch_size from loaded model
    patch_size = 101   # default; overridden below if model is loaded
    if biot_model is not None:
        patch_size = biot_model.encoder.patch_embedding.projection.in_features

    C = signal_nd.shape[1]
    result = []
    # Target length: 10 seconds worth of data at target_fs, aligned to patch_size
    target_len_base = int(min(max_duration_sec, 10) * target_fs)
    target_len = max(patch_size, (target_len_base // patch_size) * patch_size)

    for ci in range(C):
        sig = np.nan_to_num(signal_nd[:, ci].copy(), nan=0.0)
        # Resample to target_fs
        if int(fs_in) != target_fs:
            g = gcd(int(target_fs), int(fs_in))
            try:
                sig = resample_poly(sig, target_fs // g, int(fs_in) // g)
            except Exception:
                from scipy.signal import resample as _rs
                sig = _rs(sig, int(len(sig) * target_fs / fs_in))
        # Bandpass 0.5–40 Hz
        nyq = 0.5 * target_fs
        try:
            b, a = butter(3, [0.5/nyq, min(40/nyq, 0.99)], btype='band')
            sig  = filtfilt(b, a, sig)
        except Exception:
            pass
        # Z-score
        mu, sd = sig.mean(), sig.std()
        sig = (sig - mu) / (sd + 1e-8)
        sig = np.clip(sig, -10, 10)
        # Crop / pad to target_len
        if len(sig) >= target_len:
            start = (len(sig) - target_len) // 2
            sig   = sig[start: start + target_len]
        else:
            sig = np.pad(sig, (0, target_len - len(sig)), mode='constant')
        result.append(sig.astype(np.float32))

    return np.stack(result)   # (C, target_len)


def classify_eeg_biot(signal_nd, fs, num_ch):
    """signal_nd: (T, C) numpy array"""
    if biot_model is None:
        return {
            "method": "error", "findings": [],
            "primary": {"code": "ERR", "label": "BIOT model not loaded",
                        "confidence": 0, "severity": "info", "color": "#718096",
                        "description": "Place eeg_biot_best.pt in viewer/ai/",
                        "action": "Check server logs."},
            "is_normal": None, "num_ch_used": num_ch,
        }
    try:
        import torch
        eeg_np = preprocess_eeg_biot(signal_nd, fs_in=fs)       # (C, L)
        eeg_t  = torch.tensor(eeg_np).unsqueeze(0).to(biot_dev) # (1, C, L)
        probs  = biot_model.predict_proba(eeg_t)[0].cpu().numpy()
    except Exception as exc:
        import traceback; traceback.print_exc()
        return {
            "method": "error", "findings": [],
            "primary": {"code": "ERR", "label": f"Inference error: {exc}",
                        "confidence": 0, "severity": "info", "color": "#718096",
                        "description": str(exc), "action": "Check server logs."},
            "is_normal": None, "num_ch_used": num_ch,
        }

    num_cls = len(probs)
    # Build dynamic class map if model has more/fewer classes than EEG_BIOT_CLASSES
    def _cls(i):
        return EEG_BIOT_CLASSES.get(i, {
            "code": f"C{i}", "label": f"Class {i}", "severity": "info",
            "color": "#718096", "description": "", "action": "",
        })

    findings = []
    for ci in range(num_cls):
        if probs[ci] > 0.10:
            m = _cls(ci)
            findings.append({
                "code": m["code"], "label": m["label"],
                "confidence": round(float(probs[ci]), 3),
                "severity": m["severity"], "color": m["color"],
                "description": m["description"], "action": m["action"],
            })
    findings.sort(key=lambda x: x["confidence"], reverse=True)
    if not findings:
        best = int(np.argmax(probs)); m = _cls(best)
        findings = [{"code": m["code"], "label": m["label"],
                     "confidence": round(float(probs[best]), 3),
                     "severity": m["severity"], "color": m["color"],
                     "description": m["description"], "action": m["action"]}]

    primary   = findings[0]
    all_probs = {_cls(i)["code"]: round(float(probs[i]), 3) for i in range(num_cls)}
    print(f"[EEG-AI] BIOT → {primary['label']} ({primary['confidence']:.0%}) | {all_probs}")
    return {
        "method":       "biot",
        "findings":     findings,
        "primary":      primary,
        "is_normal":    primary["code"] == "BCKG",
        "all_probs":    all_probs,
        "num_ch_used":  num_ch,
        "model_note":   f"BIOT Transformer · {num_ch}-channel EEG",
    }


# ── EDF reader helper ──────────────────────────────────────────────────────

def _edf_backends_available():
    """Return (has_pyedflib, has_mne) for the current Python interpreter."""
    try:
        import pyedflib  # noqa: F401
        has_pyedflib = True
    except ImportError:
        has_pyedflib = False
    try:
        import mne  # noqa: F401
        has_mne = True
    except ImportError:
        has_mne = False
    return has_pyedflib, has_mne


def _read_edf_pyedflib(edf_path: str):
    import pyedflib

    def _b2s(v, fallback=""):
        if isinstance(v, (bytes, bytearray)):
            v = v.decode("latin-1", errors="replace")
        v = str(v).strip().rstrip("\x00").strip()
        return v or fallback

    with pyedflib.EdfReader(edf_path) as edf:
        n_ch      = edf.signals_in_file
        sig_names = [_b2s(lbl, f"Ch{i+1}") for i, lbl in enumerate(edf.getSignalLabels())]
        sig_units = [_b2s(edf.physical_dimension(i), "uV") for i in range(n_ch)]
        fs_list   = [edf.getSampleFrequency(i) for i in range(n_ch)]
        fs        = float(fs_list[0])
        raw_sigs  = []
        for i in range(n_ch):
            s = edf.readSignal(i)
            if fs_list[i] != fs:
                from math import gcd as _gcd
                from scipy.signal import resample_poly as _rp
                g = _gcd(int(fs), int(fs_list[i]))
                s = _rp(s, int(fs) // g, int(fs_list[i]) // g)
            raw_sigs.append(s.astype(np.float32))
        min_len   = min(len(s) for s in raw_sigs)
        signal_nd = np.column_stack([s[:min_len] for s in raw_sigs])
    _safe_log(
        f"[EEG-EDF] pyedflib read: {n_ch} ch, {fs} Hz, {signal_nd.shape[0]} samples"
    )
    return signal_nd, fs, list(sig_names), sig_units


def _read_edf_mne(edf_path: str):
    import mne

    raw       = mne.io.read_raw_edf(edf_path, preload=True, verbose=False)
    fs        = raw.info["sfreq"]
    sig_names = raw.ch_names
    sig_units = ["uV"] * len(sig_names)
    data, _   = raw[:, :]
    signal_nd = (data * 1e6).T.astype(np.float32)
    _safe_log(
        f"[EEG-EDF] MNE read: {len(sig_names)} ch, {fs} Hz, {signal_nd.shape[0]} samples"
    )
    return signal_nd, float(fs), list(sig_names), sig_units


def _read_edf(edf_path: str):
    """
    Read an EDF/EDF+ file and return (signal_nd, fs, sig_names, sig_units).

    signal_nd : numpy array  shape (T, C)  — physical values (µV / mV / etc.)
    fs        : float  — sample rate of first signal (all channels assumed equal)
    sig_names : list[str]
    sig_units : list[str]

    Tries pyedflib first (lightweight), falls back to MNE.
    """
    has_pyedflib, has_mne = _edf_backends_available()
    if not has_pyedflib and not has_mne:
        raise RuntimeError(
            "Neither pyedflib nor MNE is installed in this Python environment. "
            "From ecg_backend run:  .\\venv\\Scripts\\pip install pyedflib mne  "
            "then restart the server."
        )

    pyedflib_err = None
    if has_pyedflib:
        try:
            return _read_edf_pyedflib(edf_path)
        except ImportError as exc:
            pyedflib_err = exc
        except Exception as exc:
            pyedflib_err = exc
            _safe_log(f"[EEG-EDF] pyedflib failed ({exc}), trying MNE")

    if has_mne:
        try:
            return _read_edf_mne(edf_path)
        except Exception as exc:
            if pyedflib_err is not None:
                raise RuntimeError(
                    f"EDF read failed with pyedflib ({pyedflib_err}) and MNE ({exc})"
                ) from exc
            raise RuntimeError(f"MNE EDF read failed: {exc}") from exc

    raise RuntimeError(
        f"EDF read failed with pyedflib ({pyedflib_err}). "
        "Install MNE as fallback:  pip install mne"
    ) from pyedflib_err


# ── EEG upload endpoint ────────────────────────────────────────────────────
@csrf_exempt
def upload_view_eeg(request):
    if request.method == "OPTIONS":
        return _cors(JsonResponse({}))
    if request.method != "POST":
        return _cors(JsonResponse({"error": "POST only"}, status=405))

    files = request.FILES.getlist("files")
    if not files:
        return _cors(JsonResponse({"error": "No files received"}, status=400))

    # ── Route: single .edf file ───────────────────────────────────────────
    edf_file = next((f for f in files if f.name.lower().endswith(".edf")), None)
    if edf_file:
        return _upload_eeg_edf(edf_file)

    # ── Route: WFDB (.hea + companions) ──────────────────────────────────
    hea_file = next((f for f in files if f.name.lower().endswith(".hea")), None)
    if not hea_file:
        return _cors(JsonResponse(
            {"error": "No .hea or .edf file found. "
                      "Upload a .edf file, or all WFDB files (.hea + .dat + companions)."
             }, status=400))

    save_dir = settings.MEDIA_ROOT / "eeg_wfdb"
    os.makedirs(save_dir, exist_ok=True)
    saved = []
    for f in files:
        dest = save_dir / f.name
        with open(dest, "wb+") as out:
            for chunk in f.chunks():
                out.write(chunk)
        saved.append(f.name)

    record_name = hea_file.name[:-4]
    record_path = str(save_dir / record_name)

    try:
        record = wfdb.rdrecord(record_path)
    except FileNotFoundError as exc:
        return _cors(JsonResponse({
            "error": f"Missing file: {exc}. Received: {saved}."}, status=400))
    except Exception as exc:
        return _cors(JsonResponse({"error": f"WFDB read error: {exc}"}, status=500))

    fs         = record.fs
    num_ch     = record.n_sig
    total_samp = record.sig_len
    sig_names  = record.sig_name
    sig_units  = record.units or ["µV"] * num_ch
    MAX_SAMP   = int(min(total_samp, fs * 30))   # up to 30 s

    channels = []
    for i in range(num_ch):
        col = record.p_signal[:MAX_SAMP, i]
        channels.append(np.nan_to_num(col, nan=0.0).tolist())

    time_arr = (np.arange(min(MAX_SAMP, total_samp)) / fs).tolist()

    full_signal = np.nan_to_num(record.p_signal, nan=0.0)   # (T, C)
    try:
        ai_result = classify_eeg_biot(full_signal, fs, num_ch)
    except Exception as exc:
        print(f"[EEG-AI] Classification error: {exc}")
        ai_result = {
            "method": "error", "findings": [],
            "primary": {"code": "ERR", "label": str(exc),
                        "confidence": 0, "severity": "info", "color": "#718096",
                        "description": str(exc), "action": "Check server logs."},
            "is_normal": None, "num_ch_used": num_ch,
        }

    return _cors(JsonResponse({
        "record_name":    record_name,
        "fs":             fs,
        "num_channels":   num_ch,
        "total_samples":  total_samp,
        "sig_names":      sig_names,
        "sig_units":      sig_units,
        "duration_sec":   round(total_samp / fs, 2),
        "files_received": saved,
        "time":           time_arr,
        "channels":       channels,
        "num_samples":    len(channels[0]) if channels else 0,
        "window_start":   0,
        "window_end":     min(MAX_SAMP, total_samp),
        "ai":             ai_result,
        "biot_available": biot_model is not None,
        "signal_type":    "eeg",
        "format":         "wfdb",
    }))


def _upload_eeg_edf(edf_django_file):
    """
    Handle a single uploaded .edf / .edf+ file.
    Saves it to disk, reads via pyedflib / MNE, runs BIOT AI, returns JsonResponse.
    """
    import tempfile

    save_dir = settings.MEDIA_ROOT / "eeg_edf"
    os.makedirs(save_dir, exist_ok=True)

    edf_path = str(save_dir / edf_django_file.name)
    with open(edf_path, "wb+") as out:
        for chunk in edf_django_file.chunks():
            out.write(chunk)

    try:
        signal_nd, fs, sig_names, sig_units = _read_edf(edf_path)
    except Exception as exc:
        return _cors(JsonResponse({"error": f"EDF read error: {exc}"}, status=500))

    total_samp = signal_nd.shape[0]
    num_ch     = signal_nd.shape[1]
    MAX_SAMP   = int(min(total_samp, fs * 30))   # send up to 30 s to the browser

    channels  = []
    for i in range(num_ch):
        col = signal_nd[:MAX_SAMP, i]
        channels.append(np.nan_to_num(col, nan=0.0).tolist())

    time_arr  = (np.arange(MAX_SAMP) / fs).tolist()

    # Run BIOT AI on the full recording (up to memory limits)
    full_signal = np.nan_to_num(signal_nd, nan=0.0)
    try:
        ai_result = classify_eeg_biot(full_signal, fs, num_ch)
    except Exception as exc:
        print(f"[EEG-EDF] AI error: {exc}")
        ai_result = {
            "method": "error", "findings": [],
            "primary": {"code": "ERR", "label": str(exc),
                        "confidence": 0, "severity": "info", "color": "#718096",
                        "description": str(exc), "action": "Check server logs."},
            "is_normal": None, "num_ch_used": num_ch,
        }

    record_name = edf_django_file.name
    if record_name.lower().endswith(".edf"):
        record_name = record_name[:-4]

    return _cors(JsonResponse({
        "record_name":    record_name,
        "fs":             fs,
        "num_channels":   num_ch,
        "total_samples":  total_samp,
        "sig_names":      sig_names,
        "sig_units":      sig_units,
        "duration_sec":   round(total_samp / fs, 2),
        "files_received": [edf_django_file.name],
        "time":           time_arr,
        "channels":       channels,
        "num_samples":    len(channels[0]) if channels else 0,
        "window_start":   0,
        "window_end":     MAX_SAMP,
        "ai":             ai_result,
        "biot_available": biot_model is not None,
        "signal_type":    "eeg",
        "format":         "edf",
    }))


# Dedicated EDF endpoint (optional alias — urls.py can map /upload-eeg-edf/ here)
@csrf_exempt
def upload_view_eeg_edf(request):
    """Accepts a single .edf file posted as multipart field 'file' or 'files'."""
    if request.method == "OPTIONS":
        return _cors(JsonResponse({}))
    if request.method != "POST":
        return _cors(JsonResponse({"error": "POST only"}, status=405))

    edf_file = (request.FILES.get("file")
                or next((f for f in request.FILES.getlist("files")
                         if f.name.lower().endswith(".edf")), None))
    if not edf_file:
        return _cors(JsonResponse(
            {"error": "No .edf file found. Send a single EDF file in the 'file' field."
             }, status=400))

    return _upload_eeg_edf(edf_file)