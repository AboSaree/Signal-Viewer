from django.urls import path
from .views import PredictView, drone_page

urlpatterns = [
    path('drone/predict', PredictView.as_view()),
    path('drone/', drone_page),   # ← ضيف ده
]