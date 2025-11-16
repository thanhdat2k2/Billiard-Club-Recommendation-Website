from django.db import models
from django.contrib.auth.models import User
from django.core.validators import FileExtensionValidator
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db.models import Avg
from uuid import uuid4
import os
from cloudinary_storage.storage import MediaCloudinaryStorage


def club_thumbnail_upload_to(instance: "Club", filename: str) -> str:
    """
    Nơi lưu ảnh đại diện (thumbnail) của một Club.
    Kết quả: media/thumb/<uuid>.<ext>
    """
    _, ext = os.path.splitext(filename)
    return f"thumb/{uuid4().hex}{ext.lower()}"

def club_slider_upload_to(instance: "ClubImage", filename: str) -> str:
    """
    Nơi lưu ảnh gallery/slider của Club.
    Kết quả: media/slider/<club_id>/<uuid>.<ext>
    """
    _, ext = os.path.splitext(filename)
    club_id = instance.club_id or "tmp"
    return f"slider/{club_id}/{uuid4().hex}{ext.lower()}"
 
class Club(models.Model):
    """
    Thông tin câu lạc bộ billiards.
    Ảnh đại diện (thumbnail) sẽ được lưu tại media/thumb/.
    """
    name = models.CharField(max_length=200,null=True)
    district = models.CharField(max_length=200,null=True)
    type_district = models.CharField(max_length=20,null=True)
    address = models.CharField(max_length=200,null=True)
    price = models.CharField(max_length=200,null=True)
    table = models.CharField(max_length=200,null=True)
    review = models.CharField(max_length=200,null=True)
    rate = models.FloatField()
    link = models.CharField(max_length=200,null=True)
    image_thumb = models.ImageField(storage=MediaCloudinaryStorage(),upload_to=club_thumbnail_upload_to,null=True,blank=True,validators=[FileExtensionValidator(["jpg", "jpeg", "png", "webp"])])

    def __str__(self):
        return self.name

class ClubImage(models.Model):
    """
    Ảnh gallery/slider của một Club (quan hệ 1-nhiều).
    Ảnh sẽ lưu tại media/slider/<club_id>/...
    """
    club = models.ForeignKey(Club,related_name="images", on_delete=models.CASCADE)
    image = models.ImageField(storage=MediaCloudinaryStorage(),upload_to=club_slider_upload_to,validators=[FileExtensionValidator(["jpg", "jpeg", "png", "webp"])])
    display_order = models.PositiveIntegerField(default=0)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ["display_order", "id"]
        verbose_name = "Club image"
        verbose_name_plural = "Club images"
        
    def __str__(self) -> str:
        return f"Image #{self.display_order} for {self.club}"
    
class TablesType(models.Model):
    name_table = models.CharField(max_length=100,unique=True,null=True)
    
    def __str__(self):
        return self.name_table
    
class ClubReview(models.Model):
    """
    Review của người dùng dành cho 1 Club (quan hệ 1-nhiều).
    Có thể cho phép ẩn danh (name trống) hoặc dùng request.user nếu bạn bắt đăng nhập.
    """
    club = models.ForeignKey("Club", related_name="reviews", on_delete=models.CASCADE)
    reviewer_name = models.CharField(max_length=120, blank=True)  # "Ẩn danh" nếu trống
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_approved = models.BooleanField(default=True)  # nếu muốn duyệt tay

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Review {self.rating}★ for {self.club_id}"

    @staticmethod
    def recompute_club_rating(club: "Club"):
        """
        Tính lại rate trung bình của club dựa trên review đã duyệt.
        Gọi sau khi thêm/sửa/xoá review.
        """
        from django.db.models import Avg
        avg = club.reviews.filter(is_approved=True).aggregate(avg=Avg("rating"))["avg"]
        if avg is not None:
            club.rate = round(float(avg), 2)
            club.save(update_fields=["rate"])
            

def proposed_thumb_upload_to(instance: "ProposedClub", filename: str) -> str:
    _, ext = os.path.splitext(filename)
    return f"proposed/thumb/{uuid4().hex}{ext.lower()}"

class ProposedClub(models.Model):
    """Đề xuất CLB do người dùng gửi; bạn duyệt rồi mới thêm vào bảng Club chính."""
    TYPE_CHOICES = (
        ("nội thành", "Nội thành"),
        ("ngoại thành", "Ngoại thành"),
    )

    name = models.CharField(max_length=200)
    district = models.CharField(max_length=200, blank=True)
    type_district = models.CharField(max_length=20, choices=TYPE_CHOICES)
    address = models.CharField(max_length=300, blank=True)
    price = models.CharField(max_length=200, blank=True)      # dạng text: "40k - 60k"
    table = models.CharField(max_length=200, blank=True)      # vd: "Pool, Carom, Snooker"
    note = models.TextField(blank=True)                       # ghi chú thêm từ người đề xuất
    image_thumb = models.ImageField(storage=MediaCloudinaryStorage(),
        upload_to=proposed_thumb_upload_to,
        blank=True, null=True,
        validators=[FileExtensionValidator(["jpg","jpeg","png","webp"])]
    )
    created_at = models.DateTimeField(auto_now_add=True)
    is_reviewed = models.BooleanField(default=False)          # bạn đã xem/duyệt đề xuất chưa

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"[Proposed] {self.name}"