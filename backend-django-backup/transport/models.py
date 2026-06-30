from django.db import models
from django.conf import settings
import uuid
from core.validators import validate_phone_number
import datetime
from typing import Any

class Vehicle(models.Model):
    VEHICLE_TYPES = (
        ('sumo', 'Tata Sumo'),
        ('traveller', 'Force Traveller'),
        ('bus', 'Bus'),
        ('taxi', 'Local Taxi'),
    )
    
    objects = models.Manager()
    
    operator = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='vehicles', null=True, blank=True)
    name = models.CharField(max_length=100) # e.g. "Silver Sumo"
    vehicle_type = models.CharField(max_length=20, choices=VEHICLE_TYPES)
    vehicle_number = models.CharField(max_length=20, unique=True)
    capacity = models.PositiveIntegerField(help_text="Total number of seats")
    driver_name = models.CharField(max_length=100)
    driver_contact = models.CharField(max_length=20, validators=[validate_phone_number])
    
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.vehicle_number})"

class Route(models.Model):
    objects = models.Manager()
    
    operator = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='routes', null=True, blank=True)
    source = models.CharField(max_length=100)
    destination = models.CharField(max_length=100)
    estimated_duration = models.CharField(max_length=50, help_text="e.g. 5 hours")
    base_price = models.DecimalField(max_digits=10, decimal_places=2)
    
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.source} to {self.destination}"

class RouteStop(models.Model):
    """
    Represents a stop along a route with sequence order.
    Enables segment-based booking where seats can be reused for non-overlapping segments.
    """
    objects = models.Manager()
    
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name='stops')
    stop_name = models.CharField(max_length=100, help_text="Name of the stop (e.g., Guwahati, Shillong)")
    stop_order = models.PositiveIntegerField(help_text="Sequence order: 1, 2, 3...")
    distance_from_start = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Distance in km from source")
    price_from_source = models.DecimalField(max_digits=10, decimal_places=2, help_text="Cumulative price from source")
    arrival_time_offset = models.DurationField(null=True, blank=True, help_text="Time offset from departure (e.g., 2 hours)")
    
    # Coordinates for map plotting
    latitude = models.FloatField(null=True, blank=True, help_text="e.g. 26.1445")
    longitude = models.FloatField(null=True, blank=True, help_text="e.g. 91.7362")
    
    class Meta:
        ordering = ['route', 'stop_order']
        unique_together = ['route', 'stop_order']
    
    def __str__(self):
        return f"{self.route} - Stop {self.stop_order}: {self.stop_name}"

class Trip(models.Model):
    STATUS_CHOICES = (
        ('scheduled', 'Scheduled'),
        ('departed', 'Departed'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    )
    
    objects = models.Manager()
    
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name='trips')
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='trips')
    departure_datetime = models.DateTimeField()
    available_seats = models.PositiveIntegerField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='scheduled')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not self.pk:
            # Set available seats to vehicle capacity on creation
            self.available_seats = self.vehicle.capacity
        super().save(*args, **kwargs)

    @property
    def availability_percentage(self) -> int:
        if not self.vehicle or self.vehicle.capacity == 0:
            return 0
        return int((int(self.available_seats) / int(self.vehicle.capacity)) * 100)

    @property
    def full_route(self) -> str:
        return f"{str(self.route.source).title()} → {str(self.route.destination).title()}"

    @property
    def card_date(self) -> str:
        dep_dt: Any = self.departure_datetime
        return dep_dt.strftime("%d %b")

    @property
    def card_time(self) -> str:
        dep_dt: Any = self.departure_datetime
        return dep_dt.strftime("%I:%M %p")

    @property
    def card_remainder(self) -> int:
        count = getattr(self, 'recurring_count', 0)
        return count - 1 if count > 1 else 0

    def __str__(self):
        dep_dt: Any = self.departure_datetime
        return f"{self.route} on {dep_dt.strftime('%Y-%m-%d %H:%M')}"

class LiveTripStatus(models.Model):
    """
    Stores the real-time status of an active trip.
    Updated frequently by the operator's device.
    """
    objects = models.Manager()
    
    trip = models.OneToOneField(Trip, on_delete=models.CASCADE, related_name='live_status')
    
    current_latitude = models.FloatField(help_text="Current GPS Latitude")
    current_longitude = models.FloatField(help_text="Current GPS Longitude")
    current_speed = models.FloatField(default=0, help_text="Speed in km/h")
    
    # Tracking progress
    next_stop = models.ForeignKey(RouteStop, on_delete=models.SET_NULL, null=True, blank=True, related_name='incoming_trips')
    delay_minutes = models.IntegerField(default=0, help_text="Calculated delay in minutes")
    
    last_updated = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"Live: {self.trip} (Lat: {self.current_latitude}, Long: {self.current_longitude})"

    @property
    def is_active(self):
        # Consider active if updated in last 15 minutes
        from django.utils import timezone
        import datetime
        return timezone.now() - self.last_updated < datetime.timedelta(minutes=15)

class Booking(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('paid', 'Paid at Counter'),
        ('waiting_confirmation', 'Waiting for Confirmation'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    )
    
    BOOKING_TYPE_CHOICES = (
        ('instant', 'Instant Confirm'),
        ('request', 'Request Booking (Pay Later)'),
    )

    objects = models.Manager()

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking_ref = models.CharField(max_length=10, unique=True, help_text="Short readable ID for users")
    
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='transport_bookings', null=True, blank=True)
    passenger_name = models.CharField(max_length=100, blank=True, null=True, help_text="For manual bookings by operator")
    passenger_phone = models.CharField(max_length=20, blank=True, null=True, validators=[validate_phone_number])
    passenger_email = models.EmailField(blank=True, null=True, help_text="For sending tickets to non-registered users")

    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name='bookings')
    
    transaction_id = models.CharField(max_length=50, blank=True, null=True, help_text="UPI Transaction ID / UTR")
    
    # Segment-based booking fields
    from_stop = models.ForeignKey(RouteStop, on_delete=models.PROTECT, related_name='boarding_bookings', null=True, blank=True, help_text="Boarding stop")
    to_stop = models.ForeignKey(RouteStop, on_delete=models.PROTECT, related_name='dropping_bookings', null=True, blank=True, help_text="Dropping stop")
    from_stop_order = models.PositiveIntegerField(null=True, blank=True, help_text="Denormalized for performance")
    to_stop_order = models.PositiveIntegerField(null=True, blank=True, help_text="Denormalized for performance")
    
    seat_number = models.CharField(max_length=5, help_text="e.g. 1A, 2B")
    booking_type = models.CharField(max_length=20, choices=BOOKING_TYPE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # Store price at time of booking in case it changes later
    price = models.DecimalField(max_digits=10, decimal_places=2, help_text="Legacy field - use segment_price for new bookings")
    segment_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text="Price for this specific segment")
    
    qr_code_data = models.TextField(blank=True, null=True, help_text="Data content for QR code")
    
    # Refund fields
    refund_method = models.CharField(max_length=20, blank=True, null=True, choices=(('upi', 'UPI'), ('bank', 'Bank Transfer')), help_text="Method for refund processing")
    refund_upi_id = models.CharField(max_length=100, blank=True, null=True, help_text="Refund UPI ID")
    refund_bank_account = models.CharField(max_length=50, blank=True, null=True, help_text="Refund Bank Account Number")
    refund_bank_ifsc = models.CharField(max_length=20, blank=True, null=True, help_text="Refund Bank IFSC Code")
    refund_bank_name = models.CharField(max_length=100, blank=True, null=True, help_text="Refund Bank Name")
    refund_account_holder = models.CharField(max_length=100, blank=True, null=True, help_text="Refund Account Holder Name")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not self.booking_ref:
            # Generate a simple 8-char ref
            import random, string
            chars = string.ascii_uppercase + string.digits
            self.booking_ref = ''.join(random.choices(chars, k=8))  # type: ignore
        
        # Set segment price if not provided
        if not self.price and self.segment_price:
            self.price = self.segment_price
        elif not self.segment_price and self.price:
            self.segment_price = self.price
        
        # Denormalize stop orders for performance
        if self.from_stop and not self.from_stop_order:
            self.from_stop_order = self.from_stop.stop_order
        if self.to_stop and not self.to_stop_order:
            self.to_stop_order = self.to_stop.stop_order
            
        if not self.qr_code_data:
            user_id = self.user_id if self.user_id else "MANUAL"
            self.qr_code_data = f"BOOKING:{self.booking_ref}|TRIP:{self.trip_id}|USER:{user_id}"  # type: ignore
        
        self.clean() # Run validation before saving
        super().save(*args, **kwargs)

    def clean(self):
        from django.core.exceptions import ValidationError
        from .utils import check_segment_overlap  # type: ignore
        
        # Skip validation if trip/seat/stops not set (e.g. initial creation steps)
        if not self.trip or not self.seat_number:
            return

        # Get existing ACTIVE bookings for this seat on this trip
        existing_bookings = Booking.objects.filter(
            trip=self.trip,
            seat_number=self.seat_number,
            status__in=['pending', 'approved', 'paid', 'waiting_confirmation']
        ).exclude(id=self.id) # Exclude self if updating
        
        # Determine current segment
        current_from = self.from_stop_order
        current_to = self.to_stop_order
        
        # If denormalized fields not yet set, try to get from relations
        if current_from is None and self.from_stop:
            current_from = self.from_stop.stop_order
        if current_to is None and self.to_stop:
            current_to = self.to_stop.stop_order
            
        for booking in existing_bookings:
            # Check overlap
            # If either new or existing has no segment info, assume full route overlap
            if (current_from is None or current_to is None or 
                booking.from_stop_order is None or booking.to_stop_order is None):
                raise ValidationError(f"Seat {self.seat_number} is already booked for this trip.")
            
            if check_segment_overlap(booking.from_stop_order, booking.to_stop_order, current_from, current_to):
                raise ValidationError(f"Seat {self.seat_number} is already booked for the selected segment.")

    def __str__(self):
        user_email = self.user.email if self.user else self.passenger_name  # type: ignore
        return f"Booking {self.booking_ref} - {user_email}"

class TransportOperatorProfile(models.Model):
    objects = models.Manager()
    
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='transport_profile')
    operator_name = models.CharField(max_length=100, default="Transport Agency")
    phone = models.CharField(max_length=20, blank=True, null=True, validators=[validate_phone_number])
    address = models.TextField(blank=True, null=True)
    upi_id = models.CharField(max_length=50, blank=True, null=True, help_text="UPI ID for receiving payments (e.g. name@upi)")
    bank_details = models.TextField(blank=True, null=True, help_text="Bank Account Details (Account No, IFSC, etc.)")
    
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        username = self.user.username if self.user else "Unknown"  # type: ignore
        return f"{self.operator_name} ({username})"
