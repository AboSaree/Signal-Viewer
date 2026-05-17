from django.urls import path, include
from django.http import HttpResponse

def home(request):
    return HttpResponse("ECG Backend is running!")

urlpatterns = [
    path("", home),
    path("", include("viewer.urls")),
    path("api/", include("viewer.urls")),
    path("api/", include("detection.urls")),
    path("", include("detection.urls")),
]