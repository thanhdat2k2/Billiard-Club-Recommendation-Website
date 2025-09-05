from django.shortcuts import render
from .models import Club, TableType

def home(request):
    clubs_queryset = Club.objects.all()

    selected_districts = request.GET.getlist('district')
    selected_table_types = request.GET.getlist('table_type')
    selected_min_rating = request.GET.get('rating_min')
    selected_price_band = request.GET.get('price_band')

    if selected_districts:
        clubs_queryset = clubs_queryset.filter(district__in=selected_districts)
    if selected_table_types:
        for table_type in selected_table_types:
            clubs_queryset = clubs_queryset.filter(table__icontains=table_type)
    if selected_min_rating:
        try:
            clubs_queryset = clubs_queryset.filter(rate__gte=float(selected_min_rating))
        except ValueError:
            pass
    # TODO: lọc giá thật nếu có cột số

    district_options = (Club.objects.values_list('district', flat=True)
                        .filter(district__isnull=False).order_by('district').distinct())
    table_type_options = (TableType.objects.values_list('name_table', flat=True)
                          .filter(name_table__isnull=False).order_by('name_table').distinct())
    rating_options = ['5', '4', '3', '2', '1']

    context = {
        'clubs': clubs_queryset,
        'districts': district_options,
        'table_types': table_type_options,
        'rating_options': rating_options,
        'selected_districts': selected_districts,
        'selected_types': selected_table_types,
        'rating_min': selected_min_rating or '',
        'price_band': selected_price_band or '',
    }

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return render(request, 'app/_cards.html', context)

    return render(request, 'app/home.html', context)
