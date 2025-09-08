# app/admin.py
from django.contrib import admin
from django import forms
from django.core.files.storage import default_storage
from django.utils import timezone
import os, posixpath

from .models import Club, TableType


# Widget cho phép chọn nhiều file (Django 5)
class MultiFileInput(forms.ClearableFileInput):
    allow_multiple_selected = True


# Field chấp nhận list file và validate từng file
class MultipleFileField(forms.FileField):
    widget = MultiFileInput

    def clean(self, data, initial=None):
        # Không chọn gì
        if data in (None, "", [], ()):
            return []

        # Nếu chỉ 1 file -> đưa về list
        if not isinstance(data, (list, tuple)):
            data = [data]

        cleaned = []
        errors = []
        for f in data:
            try:
                cleaned.append(super().clean(f, initial))
            except forms.ValidationError as e:
                errors.extend(e.error_list)
        if errors:
            raise forms.ValidationError(errors)
        return cleaned


class ClubAdminForm(forms.ModelForm):
    # Trường form (không lưu DB) để tải NHIỀU ảnh
    new_images = MultipleFileField(
        required=False,
        label="Tải thêm ảnh (nhiều ảnh)",
        help_text="Chọn một hoặc nhiều ảnh; sau khi lưu, URL sẽ được append vào image_urls."
    )

    class Meta:
        model = Club
        fields = [
            "name", "district", "address", "price", "table", "review",
            "rate", "link", "image", "image_urls", "new_images"
        ]
        widgets = {
            "image_urls": forms.Textarea(attrs={"rows": 3}),
        }

    def save(self, commit=True):
        """Lưu file vào MEDIA_ROOT và append URL vào image_urls (JSONField)."""
        obj = super().save(commit=False)

        # Lấy các file đã qua validate từ cleaned_data
        uploaded_files = self.cleaned_data.get("new_images", [])
        if uploaded_files:
            urls = list(obj.image_urls or [])
            folder = f"clubs/{timezone.now():%Y/%m}"  # ví dụ: images/clubs/2025/09/...

            for f in uploaded_files:
                saved_path = default_storage.save(os.path.join(folder, f.name), f)
                url = default_storage.url(saved_path)  # /images/clubs/2025/09/abc.jpg
                url = posixpath.normpath(url).replace("\\", "/")
                urls.append(url)

            obj.image_urls = urls

        if commit:
            obj.save()
        return obj


@admin.register(Club)
class ClubAdmin(admin.ModelAdmin):
    form = ClubAdminForm
    list_display = ("name", "district", "price", "rate", "images_count")
    search_fields = ("name", "district", "address")

    def images_count(self, obj):
        return len(obj.image_urls or [])
    images_count.short_description = "Số ảnh"


@admin.register(TableType)
class TableTypeAdmin(admin.ModelAdmin):
    list_display = ("name_table",)
