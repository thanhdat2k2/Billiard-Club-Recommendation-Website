from django.shortcuts import render, get_object_or_404
from django.core.paginator import Paginator
from .models import Club, TableType
from django.db.models import Q
import re

# ============ Helpers ============

# Lấy GIÁ CAO NHẤT (VND) từ chuỗi, ví dụ "33k - 54k - 63k" -> 63000
def extract_max_price_from_text(price_text: str):
    if not price_text:
        return None
    numbers = []
    # Bắt số + đơn vị k (tuỳ chọn). Ví dụ: "33k", "69 k", "120000"
    for match in re.finditer(r'(\d+(?:[.,]\d+)?)\s*([kK])?', price_text):
        number_str, unit = match.groups()
        if not number_str:
            continue
        # chuẩn hoá "12,5" -> 12.5; bỏ dấu . ngăn nghìn nếu có
        cleaned = number_str.replace('.', '').replace(',', '.')
        try:
            value = float(cleaned)
        except ValueError:
            continue
        # có 'k' => nghìn
        if unit:
            value *= 1000
        # không có đơn vị mà số nhỏ (<1000) thì coi là nghìn (vd "59")
        elif value < 1000:
            value *= 1000
        numbers.append(int(round(value)))
    return max(numbers) if numbers else None

# Kiểm tra giá thuộc khoảng nào
def is_in_price_band(max_price: int, band: str) -> bool:
    if max_price is None or not band:
        return False
    if band == "30-60":
        return 30000 <= max_price <= 60000
    if band == "60-80":
        return 60000 < max_price <= 80000
    if band == ">80":
        return max_price > 80000
    return False

# ============ View ============

def home(request):
    clubs_queryset = Club.objects.all()
    
    # ---- TÌM KIẾM THEO VĂN BẢN ----
    search_text = (request.GET.get('search_text') or '').strip()
    if search_text:
        clubs_queryset = clubs_queryset.filter(
            Q(name__icontains=search_text) |
            Q(district__icontains=search_text) |
            Q(address__icontains=search_text) |
            Q(table__icontains=search_text) |
            Q(review__icontains=search_text) |
            Q(price__icontains=search_text)
        )

    # --- Đọc filters từ URL ---
    selected_districts   = request.GET.getlist('district')
    selected_table_types = request.GET.getlist('table_type')
    selected_price_band  = request.GET.get('price_band', '')
    selected_rating_band = request.GET.get('rating_band', '')

    # --- Lọc theo Quận/Huyện ---
    if selected_districts:
        clubs_queryset = clubs_queryset.filter(district__in=selected_districts)

    # --- Lọc theo Loại bàn ---
    if selected_table_types:
        for table_type in selected_table_types:
            clubs_queryset = clubs_queryset.filter(table__icontains=table_type)

    # --- Lọc theo 5 khoảng rate (float) ---
    if selected_rating_band == '1-2':
        clubs_queryset = clubs_queryset.filter(rate__gte=1, rate__lt=2)
    elif selected_rating_band == '2-3':
        clubs_queryset = clubs_queryset.filter(rate__gte=2, rate__lt=3)
    elif selected_rating_band == '3-4':
        clubs_queryset = clubs_queryset.filter(rate__gte=3, rate__lt=4)
    elif selected_rating_band == '4-5':
        clubs_queryset = clubs_queryset.filter(rate__gte=4, rate__lt=5)
    elif selected_rating_band == '5':
        # tránh sai số float (nếu dùng FloatField)
        clubs_queryset = clubs_queryset.filter(rate__gte=4.995)

    # --- Lọc theo khoảng GIÁ CAO NHẤT (Python) ---
    if selected_price_band:
        clubs_queryset = [
            club for club in clubs_queryset
            if is_in_price_band(extract_max_price_from_text(club.price), selected_price_band)
        ]

    # --- Phân trang ---
    per_page_default = 12
    try:
        per_page = int(request.GET.get('per_page', per_page_default))
    except ValueError:
        per_page = per_page_default

    page_number = request.GET.get('page', 1)
    paginator = Paginator(clubs_queryset, per_page)  # nhận list hoặc queryset đều OK
    page_obj = paginator.get_page(page_number)
    page_range = paginator.get_elided_page_range(
        number=page_obj.number, on_each_side=1, on_ends=1
    )

    # --- Options cho filters ---
    district_options = (Club.objects.values_list('district', flat=True)
                        .filter(district__isnull=False)
                        .order_by('district').distinct())
    table_type_options = (TableType.objects.values_list('name_table', flat=True)
                          .filter(name_table__isnull=False)
                          .order_by('name_table').distinct())

    rating_band_options = [
        {"value": "1-2", "label": "Từ 1⭐",
         "checked": "checked" if selected_rating_band == "1-2" else ""},
        {"value": "2-3", "label": "Từ 2⭐",
         "checked": "checked" if selected_rating_band == "2-3" else ""},
        {"value": "3-4", "label": "Từ 3⭐",
         "checked": "checked" if selected_rating_band == "3-4" else ""},
        {"value": "4-5", "label": "Từ 4⭐",
         "checked": "checked" if selected_rating_band == "4-5" else ""},
        {"value": "5",   "label": "5⭐",
         "checked": "checked" if selected_rating_band == "5" else ""},
        {"value": "",    "label": "Tất cả",
         "checked": "checked" if selected_rating_band == "" else ""},
    ]

    context = {
        # Kết quả (đÃ phân trang)
        'clubs': page_obj.object_list,
        'paginator': paginator,
        'page_obj': page_obj,
        'page_range': page_range,

        # Data filter
        'districts': district_options,
        'table_types': table_type_options,
        'rating_band_options': rating_band_options,

        # Trạng thái đang chọn
        'selected_districts': selected_districts,
        'selected_types': selected_table_types,
        'price_band': selected_price_band,
        'rating_band': selected_rating_band,
        'per_page': per_page,
        
        # Trạng thái tìm kiếm để đổ lên ô search
        'search_text': search_text,
    }

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return render(request, 'app/_cards.html', context)
    return render(request, 'app/home.html', context)

def club_detail(request, club_id: int):
    club = get_object_or_404(Club, pk=club_id)
    # Lấy danh sách ảnh từ JSONField. Nếu trống thì fallback về ảnh đơn cũ.
    image_urls = list(club.image_urls or [])
    if not image_urls and getattr(club, "ImageURL", ""):
        image_urls = [club.ImageURL]

    context = {
        "club": club,
        "image_urls": image_urls,  # <- truyền xuống template để render slider
    }

    if request.headers.get("X-Requested-With") == "XMLHttpRequest":
        return render(request, "app/_club_detail.html", context)

    return render(request, "app/club_detail_page.html", context)