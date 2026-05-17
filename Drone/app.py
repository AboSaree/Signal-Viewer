import io
import librosa
import numpy as np
import tensorflow as tf
import joblib
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# 1. Load your exported assets
model = tf.keras.models.load_model('drone_detection_model.keras')
scaler = joblib.load('mfcc_scaler.joblib')

def preprocess_audio(audio_bytes):
    # 1. Load audio
    y, sr = librosa.load(io.BytesIO(audio_bytes), sr=16000)
    
    # 2. Extract 40 MFCCs
    mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=40)
    
    # 3. Pad or Truncate to 174 frames
    max_pad_len = 174
    if mfccs.shape[1] < max_pad_len:
        pad_width = max_pad_len - mfccs.shape[1]
        mfccs = np.pad(mfccs, pad_width=((0, 0), (0, pad_width)), mode='constant')
    else:
        mfccs = mfccs[:, :max_pad_len]
    
    # --- FIX STARTS HERE ---
    
    # 4. Flatten to 6960 features to match the Scaler's training
    # mfccs is (40, 174). We flatten it to (1, 6960)
    mfccs_flattened = mfccs.flatten().reshape(1, -1)
    
    # 5. Scale using the loaded .joblib
    mfccs_scaled = scaler.transform(mfccs_flattened)
    
    # 6. Reshape back to the format the CNN model expects: (batch, height, width, channels)
    # The model expects (1, 40, 174, 1)
    final_input = mfccs_scaled.reshape(1, 40, 174, 1)
    
    return final_input
@app.route('/predict', methods=['POST'])
def predict():
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file"}), 400
    
    try:
        audio_data = request.files['audio'].read()
        processed = preprocess_audio(audio_data)
        
        prediction = model.predict(processed)
        result_index = np.argmax(prediction[0])
        
        classes = ['Drone', 'Not Drone']
        return jsonify({
            "label": classes[result_index],
            "confidence": float(np.max(prediction[0]))
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(port=5000, debug=True)