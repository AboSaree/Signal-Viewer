# Signal Analysis & Visualization Platform

A high-performance, multi-component platform for surgical and medical signal analysis, featuring real-time visualization, AI-assisted diagnosis, and advanced analytical tools.

## 🌟 Components Overview

This platform consists of several integrated sub-projects, each specialized in different types of signal processing:

1.  **Medical Signal Viewer (Root)**: A high-performance, vanilla JavaScript client for real-time waveform visualization (ECG/EEG).
2.  **Angular Dashboard**: A modern web interface hosting multiple analytical tools:
    - **ECG/EEG Viewer**: AI-powered medical signal analysis.
    - **Stock Analyst**: Financial market data visualization and LSTM forecasting.
    - **Microbiome Analyzer**: Taxonomic and diversity analysis for patient data.
    - **Doppler Synthesizer**: Physics-based signal generation and velocity detection.
    - **Drone Detector**: Acoustic classification of drone signals.
3.  **ECG Backend (Django)**: A Python Django server providing REST APIs, signal parsing, and AI classification models.

---

## 📂 Project Structure

```text
├── DATA/                     # Sample datasets (ECG, Microbiome, Stocks)
├── Drone/                    # Legacy Drone detection Flask app
├── doppler-angular/          # Standalone Doppler Angular app
├── ecg_backend/              # Main Django Backend & Angular Frontend
│   ├── detection/            # Drone detection Django app
│   ├── viewer/               # ECG/EEG signal processing & AI
│   └── frontend/             # Angular 17 Dashboard
├── index.html                # Root Signal Viewer (Vanilla JS)
├── script.js                 # Signal Viewer Logic
└── style.css                 # Signal Viewer Styling
```

---

## 🚀 Getting Started

### Prerequisites
- **Python 3.10+**
- **Node.js 18+** & **npm**
- **Angular CLI** (`npm install -g @angular/cli`)

### Quick Setup

#### 1. Backend & AI Server (Django)
```bash
cd ecg_backend
# Setup virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r viewer/Requriments.txt

# Run migrations and start server
python manage.py migrate
python manage.py runserver  # Runs on http://127.0.0.1:8000
```

#### 2. Frontend Dashboard (Angular)
```bash
cd ecg_backend/frontend
npm install
npm start  # Runs on http://localhost:4200
```

#### 3. Root Signal Viewer (Vanilla JS)
Simply open `index.html` in your browser.

---

## 📊 Feature Deep-Dive

### 1. Medical Signal Viewer
- **Real-time Rendering**: Fluid, responsive canvas-based drawing of multi-lead ECG/EEG signals.
- **Advanced Visualization**:
  - **Single/Separate Views**: Toggle between individual channels or a unified view.
  - **Playback Controls**: Play, pause, and adjust scrolling speed.
  - **Measurement Tools**: Interactive zooming and panning.
  - **Analysis Plots**: Polar views, Scatter plots, and Digital XOR periodicity heatmaps.

### 2. ECG/EEG AI Analysis (In Dashboard)
- **AI Classification**: Utilizes **HuBERT-ECG** (Transformer-based) and **SVM** models for diagnostic insights.
- **Automated Findings**: Predicts severity (Normal, Warning, Critical) and provides specific diagnostic labels (e.g., Atrial Fibrillation, Hypertrophy).
- **R-Peak Detection**: Automated pulse calculation from raw signal data.

### 3. Stock Analyst
- **Interactive Charts**: Candlestick and volume charts powered by Lightweight Charts.
- **Technical Indicators**: 
  - Simple & Exponential Moving Averages (SMA/EMA).
  - Relative Strength Index (RSI).
  - MACD (Moving Average Convergence Divergence).
  - Heikin-Ashi candle conversions.
- **AI Forecasting**: LSTM Neural Network (TensorFlow.js) for price prediction with confidence scoring.

### 4. Microbiome Analyzer
- **Cohort Statistics**: Distribution analysis of IBD conditions (CD, UC, Non-IBD).
- **Taxonomic Barplots**: Visualizing bacterial presence across participants.
- **Diversity Heatmaps**: Analyzing microbial diversity across multiple weeks.
- **Patient Profiles**: Detailed breakdown of individual microbiome health.

### 5. Doppler & Drone Detection
- **Doppler Synthesizer**: Simulate frequency shifts based on target velocity.
- **Drone Detector**: Classify acoustic signatures using MFCC feature extraction and CNN models.

---

## 🛠 Tech Stack

- **Frontend**: Angular 17, TypeScript, HTML5 Canvas, Chart.js, TensorFlow.js.
- **Backend**: Django 5, Django REST Framework, Python 3.
- **AI/ML**: PyTorch (HuBERT), Scikit-learn (SVM), Keras/TensorFlow (Drone Detection), Librosa (Audio Processing).
- **Visualization**: Vanilla JS Canvas, Lightweight Charts, Chart.js.

---

## 🛡 Disclaimer
*This platform is for educational and research purposes. It is not intended for clinical use.*
