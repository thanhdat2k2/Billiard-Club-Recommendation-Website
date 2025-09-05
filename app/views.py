from django.shortcuts import render
from django.http import HttpResponse
from .models import *

# Create your views here.
def home(request):
    clubs = Club.objects.all()
    districts = (Club.objects
                 .values_list('district', flat=True)
                 .filter(district__isnull=False)
                 .order_by('district')
                 .distinct())
    table_types = (TableType.objects.values_list('name_table',flat=True).filter(name_table__isnull=False).order_by('name_table').distinct())
    return render(request, 'app/home.html', {
        'clubs': clubs,
        'districts': districts,
        'table_types': table_types,
    })
    