from django.db import models
from django.contrib.auth.models import User

# Create your models here.
class Club(models.Model):
    name = models.CharField(max_length=200,null=True)
    district = models.CharField(max_length=200,null=True)
    address = models.CharField(max_length=200,null=True)
    price = models.CharField(max_length=200,null=True)
    table = models.CharField(max_length=200,null=True)
    review = models.CharField(max_length=200,null=True)
    rate = models.FloatField()
    link = models.CharField(max_length=200,null=True)
    image = models.ImageField(null=True, blank=True)
    
    image_urls = models.JSONField(default=list, blank=True)
    
    def __str__(self):
        return self.name
    
    @property
    def ImageURL(self):
        # giữ tương thích template cũ
        try:
            return self.image.url
        except Exception:
            return ''

    @property
    def thumbnail_url(self):
        # ưu tiên ảnh file; nếu không có thì lấy ảnh đầu trong image_urls
        if self.image:
            try:
                return self.image.url
            except Exception:
                pass
        if self.image_urls:
            return self.image_urls[0]
        return ''
    
class TableType(models.Model):
    name_table = models.CharField(max_length=100,unique=True,null=True)
    
    def __str__(self):
        return self.name_table
