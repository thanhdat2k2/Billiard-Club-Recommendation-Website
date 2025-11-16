from django.shortcuts import render, get_object_or_404, redirect
from django.utils.http import url_has_allowed_host_and_scheme
from django.contrib import messages
from django.db.models import Prefetch
from django.http import HttpResponse
from django.core.paginator import Paginator
from django.views.decorators.http import require_POST

import random
import re

from django.db.models import Q,QuerySet
from .models import Club, TablesType, ClubImage, ClubReview, ProposedClub

from django.conf import settings

def home(request):
    ###############
    # Slider home #
    ###############
    number_of_slides = 5 #số slide trong home slider
    maximum_attempts = 4 #số lần random ngẫu nhiên
    
    base_queryset = Club.objects.only("id","name","image_thumb").order_by("id")
    total_records = base_queryset.count()
    
    slides = []
    if total_records == 0:
        return render(request,"clubs/home.html", {"slides":slides})
    
    for _ in range(maximum_attempts):
        sample_size = min(number_of_slides, total_records)
        random_offsets = random.sample(range(total_records), sample_size)
        random_offsets.sort()
        
        candidate_clubs = [base_queryset[offset:offset + 1].first() for offset in random_offsets]
        all_have_thumbnails = (
            len(candidate_clubs) == sample_size
            and all(club and club.image_thumb for club in candidate_clubs)
        )
        if all_have_thumbnails:
            slides = [
                {"club": club,"alt_text": club.name, "image_url": club.image_thumb.url}
                for club in candidate_clubs
            ]
            break
        
    ####################
    # Các quán nổi bật #
    ####################
    top_clubs = (
        Club.objects
        .filter(rate__isnull=False)
        .order_by('-rate', 'id')
        .only('id', 'name', 'district', 'price', 'rate', 'image_thumb')[:6]
    )
     
    context = {"slides": slides, "top_clubs": top_clubs}
    return render(request, 'clubs/home.html', context)

# ----- helpers -----
def extract_max_price_from_text(price_text: str):
    """'33k - 54k - 63k' -> 63000; '49 - 59k' -> 59000; '80,5k' -> 80500"""
    if not price_text:
        return None
    nums = []
    for m in re.finditer(r'(\d+(?:[.,]\d+)?)\s*([kK])?', price_text):
        n, unit = m.groups()
        if not n: 
            continue
        n = float(n.replace('.', '').replace(',', '.'))
        if unit or n < 1000:
            n *= 1000
        nums.append(int(round(n)))
    return max(nums) if nums else None

def price_in_band(max_price: int, band: str) -> bool:
    if not max_price or not band:
        return False
    if band == "30-60": return 30000 <= max_price <= 60000
    if band == "60-80": return 60000 <  max_price <= 80000
    if band == ">80" :  return max_price > 80000
    return False

def inner_city_clubs(request):
    # base queryset
    qs = Club.objects.filter(type_district__iexact="nội thành").order_by("id")

    # lấy filter từ URL
    selected_districts   = request.GET.getlist("district")
    selected_table_types = request.GET.getlist("table_type")
    selected_price_band  = request.GET.get("price_band", "")
    selected_rating_band = request.GET.get("rating_band", "")
    sort_key = request.GET.get("sort", "")

    # 1) Quận/Huyện (multi)
    if selected_districts:
        qs = qs.filter(district__in=selected_districts)

    # 2) Loại bàn (multi) — chứa bất kỳ type nào được chọn
    if selected_table_types:
        q_or = Q()
        for t in selected_table_types:
            q_or |= Q(table__icontains=t)
        qs = qs.filter(q_or)

    # 3) Đánh giá (single band)
    rating_map = {
        "1-2": Q(rate__gte=1, rate__lt=2),
        "2-3": Q(rate__gte=2, rate__lt=3),
        "3-4": Q(rate__gte=3, rate__lt=4),
        "4-5": Q(rate__gte=4, rate__lt=5),
        "5"  : Q(rate__gte=4.995),
    }
    if selected_rating_band in rating_map:
        qs = qs.filter(rating_map[selected_rating_band])

    # 4) Mức giá (single band) — vì price là text nên lọc bằng Python
    if selected_price_band:
        qs = [c for c in qs if price_in_band(extract_max_price_from_text(c.price), selected_price_band)]

    # ----- options -----
    base_for_options = Club.objects.filter(type_district__iexact="nội thành")
    district_options = (base_for_options
                        .exclude(district__isnull=True).exclude(district__exact="")
                        .values_list("district", flat=True).distinct().order_by("district"))
    table_type_options = (TablesType.objects
                          .filter(name_table__isnull=False)
                          .values_list("name_table", flat=True)
                          .order_by("name_table").distinct())
    rating_band_options = [
        {"value": "1-2", "label": "Từ 1⭐", "checked": "checked" if selected_rating_band == "1-2" else ""},
        {"value": "2-3", "label": "Từ 2⭐", "checked": "checked" if selected_rating_band == "2-3" else ""},
        {"value": "3-4", "label": "Từ 3⭐", "checked": "checked" if selected_rating_band == "3-4" else ""},
        {"value": "4-5", "label": "Từ 4⭐", "checked": "checked" if selected_rating_band == "4-5" else ""},
        {"value": "5",   "label": "5⭐",   "checked": "checked" if selected_rating_band == "5"   else ""},
        {"value": "",    "label": "Tất cả","checked": "checked" if selected_rating_band == "" else ""},
    ]

    # ---------------- SẮP XẾP (SORT) ----------------
    def _max_price(c):
        return extract_max_price_from_text(c.price) or 0

    # Nếu còn là QuerySet và sort không liên quan tới 'price',
    # ưu tiên sort ngay trên DB để tối ưu.
    if isinstance(qs, QuerySet) and sort_key in {"rate_asc","rate_desc","name_asc","name_desc","id_asc","id_desc"}:
        order_map = {
            "rate_asc":  "rate",
            "rate_desc": "-rate",
            "name_asc":  "name",
            "name_desc": "-name",
            "id_asc":    "id",
            "id_desc":   "-id",
        }
        qs = qs.order_by(order_map[sort_key])
    else:
        # Còn lại (đã là list, hoặc sort theo giá) → sort bằng Python
        lst = list(qs)
        if sort_key == "price_asc":
            lst = sorted(lst, key=_max_price)
        elif sort_key == "price_desc":
            lst = sorted(lst, key=_max_price, reverse=True)
        elif sort_key == "rate_asc":
            lst = sorted(lst, key=lambda c: (c.rate or 0, c.id or 0))
        elif sort_key == "rate_desc":
            lst = sorted(lst, key=lambda c: (c.rate or 0, c.id or 0), reverse=True)
        elif sort_key == "name_asc":
            lst = sorted(lst, key=lambda c: (c.name or "").lower())
        elif sort_key == "name_desc":
            lst = sorted(lst, key=lambda c: (c.name or "").lower(), reverse=True)
        elif sort_key == "id_desc":
            lst = sorted(lst, key=lambda c: c.id or 0, reverse=True)
        else:
            # mặc định
            lst = sorted(lst, key=lambda c: c.id or 0)
        qs = lst

    # --- Phân trang ---
    per_page_default = 12
    try:
        per_page = int(request.GET.get('per_page', per_page_default))
    except ValueError:
        per_page = per_page_default

    page_number = request.GET.get('page', 1)
    paginator = Paginator(qs, per_page)  # nhận list hoặc queryset đều OK
    page_obj = paginator.get_page(page_number)
    page_range = paginator.get_elided_page_range(
        number=page_obj.number, on_each_side=1, on_ends=1
    )

    context = {
        "inner_city_clubs": page_obj.object_list,
        "page_obj": page_obj, 
        "paginator": paginator,
        'page_range': page_range,
        
        "district_options": district_options,
        "table_types": table_type_options,
        "rating_band_options": rating_band_options,
        "selected_districts": selected_districts,
        "selected_types": selected_table_types,
        "price_band": selected_price_band,
        "rating_band": selected_rating_band,
        
        'per_page': per_page,
    }
    
    return render(request, "clubs/inner-city-clubs.html", context)


def suburban_clubs(request):
    # ---------- Base queryset ----------
    queryset = (
        Club.objects
        .filter(type_district__iexact="ngoại thành")
        .only("id", "name", "district", "price", "rate", "image_thumb", "table")
        .order_by("id")
    )

    # ---------- Đọc tham số filter/sort ----------
    selected_districts   = request.GET.getlist("district")
    selected_table_types = request.GET.getlist("table_type")
    selected_price_band  = request.GET.get("price_band", "")
    selected_rating_band = request.GET.get("rating_band", "")
    selected_sort        = request.GET.get("sort", "")  # '', rate_desc, ...

    # ---------- Áp dụng filter ----------
    # 1) Quận/Huyện (multi)
    if selected_districts:
        queryset = queryset.filter(district__in=selected_districts)

    # 2) Loại bàn (multi) — chứa bất kỳ loại được chọn
    if selected_table_types:
        condition_or = Q()
        for table_name in selected_table_types:
            condition_or |= Q(table__icontains=table_name)
        queryset = queryset.filter(condition_or)

    # 3) Đánh giá (single band)
    rating_conditions = {
        "1-2": Q(rate__gte=1, rate__lt=2),
        "2-3": Q(rate__gte=2, rate__lt=3),
        "3-4": Q(rate__gte=3, rate__lt=4),
        "4-5": Q(rate__gte=4, rate__lt=5),
        "5":   Q(rate__gte=4.995),
    }
    if selected_rating_band in rating_conditions:
        queryset = queryset.filter(rating_conditions[selected_rating_band])

    # 4) Mức giá (single band) — vì 'price' là text nên lọc bằng Python
    #    Sau bước này có thể biến thành list (không còn là QuerySet).
    clubs_sequence = queryset
    if selected_price_band:
        clubs_sequence = [
            club for club in clubs_sequence
            if price_in_band(extract_max_price_from_text(club.price), selected_price_band)
        ]

    # ---------- Sắp xếp ----------
    # Nếu vẫn là QuerySet ta ưu tiên order_by; nếu đã thành list thì dùng sorted()
    def max_price_key(club):
        return extract_max_price_from_text(club.price) or 0

    if selected_sort == "rate_desc":
        clubs_sequence = (
            clubs_sequence.order_by("-rate", "id")
            if hasattr(clubs_sequence, "order_by")
            else sorted(clubs_sequence, key=lambda c: (c.rate or 0, c.id), reverse=True)
        )
    elif selected_sort == "rate_asc":
        clubs_sequence = (
            clubs_sequence.order_by("rate", "id")
            if hasattr(clubs_sequence, "order_by")
            else sorted(clubs_sequence, key=lambda c: (c.rate or 0, c.id))
        )
    elif selected_sort == "name_asc":
        clubs_sequence = (
            clubs_sequence.order_by("name", "id")
            if hasattr(clubs_sequence, "order_by")
            else sorted(clubs_sequence, key=lambda c: (c.name or "", c.id))
        )
    elif selected_sort == "name_desc":
        clubs_sequence = (
            clubs_sequence.order_by("-name", "id")
            if hasattr(clubs_sequence, "order_by")
            else sorted(clubs_sequence, key=lambda c: (c.name or "", c.id), reverse=True)
        )
    elif selected_sort == "price_asc":
        # buộc dùng sorted vì 'price' là text
        clubs_sequence = sorted(clubs_sequence, key=lambda c: (max_price_key(c), c.id))
    elif selected_sort == "price_desc":
        clubs_sequence = sorted(clubs_sequence, key=lambda c: (max_price_key(c), c.id), reverse=True)
    else:
        # mặc định theo id tăng
        clubs_sequence = (
            clubs_sequence.order_by("id")
            if hasattr(clubs_sequence, "order_by")
            else sorted(clubs_sequence, key=lambda c: c.id)
        )

    # ---------- Options cho bộ lọc (lấy từ toàn bộ ngoại thành) ----------
    base_for_options = Club.objects.filter(type_district__iexact="ngoại thành")
    district_options = (
        base_for_options
        .exclude(district__isnull=True).exclude(district__exact="")
        .values_list("district", flat=True)
        .distinct().order_by("district")
    )
    table_type_options = (
        TablesType.objects
        .filter(name_table__isnull=False)
        .values_list("name_table", flat=True)
        .distinct().order_by("name_table")
    )
    rating_band_options = [
        {"value": "1-2", "label": "Từ 1⭐", "checked": "checked" if selected_rating_band == "1-2" else ""},
        {"value": "2-3", "label": "Từ 2⭐", "checked": "checked" if selected_rating_band == "2-3" else ""},
        {"value": "3-4", "label": "Từ 3⭐", "checked": "checked" if selected_rating_band == "3-4" else ""},
        {"value": "4-5", "label": "Từ 4⭐", "checked": "checked" if selected_rating_band == "4-5" else ""},
        {"value": "5",   "label": "5⭐",   "checked": "checked" if selected_rating_band == "5" else ""},
        {"value": "",    "label": "Tất cả","checked": "checked" if selected_rating_band == "" else ""},
    ]

    # ---------- Phân trang (12/trang) ----------
    paginator = Paginator(clubs_sequence, 12)
    page_number = request.GET.get("page", 1)
    page_obj = paginator.get_page(page_number)

    # Chuẩn bị query string không có 'page' để các link phân trang giữ filter/sort
    params_without_page = request.GET.copy()
    params_without_page.pop("page", None)
    qs_no_page = params_without_page.urlencode()

    context = {
        "suburban_clubs": page_obj.object_list,
        "page_obj": page_obj,
        "paginator": paginator,
        "qs_no_page": qs_no_page,

        # options filter
        "district_options": district_options,
        "table_types": table_type_options,
        "rating_band_options": rating_band_options,

        # state đã chọn (để đồng bộ checkbox/chip/radio + hiển thị label)
        "selected_districts": selected_districts,
        "selected_types": selected_table_types,
        "price_band": selected_price_band,
        "rating_band": selected_rating_band,
        "sort": selected_sort,
    }
    return render(request,'clubs/suburban-clubs.html',context)

def club_detail(request, pk):
    club = get_object_or_404(
        Club.objects.prefetch_related(
            Prefetch(
                "images",
                queryset=ClubImage.objects.order_by("display_order", "id"),
            )
        ),
        pk=pk,
    )
    source = request.GET.get("src")
    
    gallery_images = club.images.all()

    # ===== Bổ sung: danh sách review đã duyệt + phân trang =====
    review_queryset = club.reviews.filter(is_approved=True).order_by("-created_at")
    review_paginator = Paginator(review_queryset, 10)  # 10 review/trang
    review_page_number = request.GET.get("rpage", 1)
    review_page = review_paginator.get_page(review_page_number)
    
    raw_return = request.GET.get("return", "")
    back_to = raw_return if url_has_allowed_host_and_scheme(
        url=raw_return, allowed_hosts={request.get_host()}
    ) else ""

    return render(
        request,
        "clubs/club_detail.html",
        {
            "club": club,
            "gallery_images": gallery_images,
            "source": source,
            "review_page": review_page,
            "reviews_total": review_paginator.count,
            "back_to": back_to
        },
    )

@require_POST
def submit_review(request, pk):
    """
    Nhận POST từ form review (không dùng forms.py).
    Giữ tối giản, không ảnh hưởng tới club_detail.
    """
    club = get_object_or_404(Club, pk=pk)

    reviewer_name = (request.POST.get("reviewer_name") or "").strip()
    rating_text = (request.POST.get("rating") or "").strip()
    comment = (request.POST.get("comment") or "").strip()

    errors = []
    try:
        rating = int(rating_text)
        if not (1 <= rating <= 5):
            errors.append("Điểm đánh giá phải từ 1 đến 5.")
    except ValueError:
        errors.append("Vui lòng chọn điểm đánh giá hợp lệ.")

    if len(comment) > 2000:
        errors.append("Nội dung review quá dài (tối đa 2000 ký tự).")

    if errors:
        for e in errors:
            messages.error(request, e)
        return redirect("club-detail", pk=club.pk)

    # Tạo review (đặt is_approved=True nếu không cần duyệt tay)
    ClubReview.objects.create(
        club=club,
        reviewer_name=reviewer_name or "Ẩn danh",
        rating=rating,
        comment=comment,
        is_approved=True,
    )

    # Tính lại điểm trung bình nếu bạn dùng club.rate làm hiển thị
    # (Giữ nguyên schema hiện tại của bạn; nếu không muốn tự động, có thể bỏ)
    from django.db.models import Avg
    avg = club.reviews.filter(is_approved=True).aggregate(Avg("rating"))["rating__avg"]
    if avg is not None:
        club.rate = round(float(avg), 2)
        club.save(update_fields=["rate"])

    messages.success(request, "Cảm ơn bạn! Review đã được ghi nhận.")
    return redirect("club-detail", pk=club.pk)

def contribute(request):
    errors = {}
    initial = {
        "name": "",
        "type_district": "nội thành",
        "district": "",
        "address": "",
        "price": "",
        "table": "",
        "note": "",
    }

    if request.method == "POST":
        name = (request.POST.get("name") or "").strip()
        type_district = (request.POST.get("type_district") or "").strip().lower()
        district = (request.POST.get("district") or "").strip()
        address = (request.POST.get("address") or "").strip()
        price = (request.POST.get("price") or "").strip()
        table = (request.POST.get("table") or "").strip()
        note = (request.POST.get("note") or "").strip()
        image_thumb = request.FILES.get("image_thumb")

        # lưu lại để repopulate form khi có lỗi
        initial.update({
            "name": name, "type_district": type_district, "district": district,
            "address": address, "price": price, "table": table, "note": note,
        })

        # validate tối thiểu
        if not name:
            errors["name"] = "Vui lòng nhập tên câu lạc bộ."
        if type_district not in ("nội thành", "ngoại thành"):
            errors["type_district"] = "Giá trị khu vực không hợp lệ."

        if not errors:
            ProposedClub.objects.create(
                name=name,
                type_district=type_district,
                district=district,
                address=address,
                price=price,
                table=table,
                note=note,
                image_thumb=image_thumb,
            )
            messages.success(request, "Cảm ơn bạn! Đề xuất đã được ghi nhận.")
            return redirect("contribute")

        messages.error(request, "Vui lòng kiểm tra lại các trường bên dưới.")

    # Danh sách đề xuất (mới nhất trước), phân trang 10 mục/trang
    proposed_qs = ProposedClub.objects.all()
    paginator = Paginator(proposed_qs, 10)
    page_obj = paginator.get_page(request.GET.get("page", 1))

    context = {
        "errors": errors,
        "form": initial,
        "page_obj": page_obj,
        "paginator": paginator,
        "proposed_clubs": page_obj.object_list,
    }
    return render(request, "clubs/contribute.html", context)

def debug_storage(request):
    # LẤY CLUB MỚI NHẤT (vừa tạo để test)
    club = Club.objects.order_by("-id").first()

    lines = []
    lines.append(f"DEFAULT_FILE_STORAGE: {settings.DEFAULT_FILE_STORAGE}")

    if not club:
        lines.append("No Club found in database.")
    else:
        lines.append(f"Club ID: {club.id}")
        lines.append(f"Club name: {club.name}")
        if club.image_thumb:
            lines.append(f"image_thumb.name: {club.image_thumb.name}")
            lines.append(f"image_thumb.url: {club.image_thumb.url}")
        else:
            lines.append("Club has no image_thumb")

    html = "<br>".join(lines)
    return HttpResponse(html)