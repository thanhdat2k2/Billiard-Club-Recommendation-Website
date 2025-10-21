from django.contrib import admin
from django.db.models import Avg
from .models import Club, ClubImage, TablesType, ClubReview, ProposedClub

admin.site.register(Club)
admin.site.register(ClubImage)
admin.site.register(TablesType)
admin.site.register(ClubReview)
admin.site.register(ProposedClub)

