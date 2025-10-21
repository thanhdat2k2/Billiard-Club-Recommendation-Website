from django.urls import path
from . import views

urlpatterns = [
    path('',views.home,name='home'),
    path("home/", views.home, name="home_alias"),
    path('inner-city-clubs/',views.inner_city_clubs,name='inner-city-clubs'),
    path('suburban-clubs/',views.suburban_clubs,name='suburban-clubs'),
    path("clubs/<int:pk>/", views.club_detail, name="club-detail"),
    path("clubs/<int:pk>/review/", views.submit_review, name="club-review"),
    path('contribute/',views.contribute,name='contribute'),
]