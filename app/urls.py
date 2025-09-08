from django.contrib import admin
from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path("club/<int:club_id>/", views.club_detail, name="club_detail"),
]