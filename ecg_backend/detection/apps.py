from pathlib import Path

from django.apps import AppConfig


class DetectionConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "detection"
    model = None
    scaler = None
    _load_attempted = False

    def ready(self):
        # Models load on first predict request — avoids blocking Django startup
        # when TensorFlow/Keras or weight files are missing.
        pass

    @classmethod
    def ensure_models(cls):
        if cls.model is not None and cls.scaler is not None:
            return True
        if cls._load_attempted:
            return cls.model is not None and cls.scaler is not None

        cls._load_attempted = True
        base = Path(__file__).resolve().parent.parent
        model_path = base / "drone_detection_model.keras"
        scaler_path = base / "mfcc_scaler.joblib"

        if not model_path.exists() or not scaler_path.exists():
            print(
                "[detection] Drone model files not found — place "
                "drone_detection_model.keras and mfcc_scaler.joblib in ecg_backend/"
            )
            return False

        try:
            import joblib
            import keras

            cls.model = keras.models.load_model(str(model_path))
            cls.scaler = joblib.load(str(scaler_path))
            print("[detection] Drone detection model loaded")
            return True
        except Exception as exc:
            print(f"[detection] Failed to load drone model: {exc}")
            cls.model = None
            cls.scaler = None
            return False
