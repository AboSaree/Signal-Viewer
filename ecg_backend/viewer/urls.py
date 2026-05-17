from django.urls import path
from . import views

urlpatterns = [
    path('upload-eeg/', views.upload_view_eeg),
    path('upload-view/',  views.upload_view_ecg),   # POST — رفع ملفات ECG
    path('reanalyze/',    views.reanalyze_view),     # GET  — إعادة تحليل بنموذج مختلف
    path('window/',       views.window_view),         # GET  — جزء من الإشارة
]