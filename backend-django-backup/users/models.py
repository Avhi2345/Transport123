from django.contrib.auth.models import AbstractUser
from django.db import models
from core.validators import validate_phone_number

class User(AbstractUser):
    ROLE_CHOICES = (
        ('traveler', 'Traveler'),
        ('guide', 'Guide'),
        ('homestay', 'Homestay'),
        ('villager', 'Villager'),
        ('hotel', 'Hotel'),
        ('transport_operator', 'Transport Operator'),
    )

    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='traveler')
    phone = models.CharField(max_length=20, validators=[validate_phone_number], blank=True, null=True)
    
    # Verification & Security
    is_verified = models.BooleanField(default=False)
    verification_token = models.CharField(max_length=100, blank=True, null=True)
    reset_token = models.CharField(max_length=100, blank=True, null=True)
    token_created_at = models.DateTimeField(blank=True, null=True)
    profile_picture = models.ImageField(upload_to='profile_pics/', blank=True, null=True)

    def __str__(self):
        return f"{self.username} - {self.email} ({self.role})"
