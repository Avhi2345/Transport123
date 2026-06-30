from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Vehicle, Route, RouteStop, Trip, LiveTripStatus, Booking, TransportOperatorProfile

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role', 'phone']

class VehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = '__all__'

class RouteStopSerializer(serializers.ModelSerializer):
    class Meta:
        model = RouteStop
        fields = '__all__'

class RouteSerializer(serializers.ModelSerializer):
    stops = RouteStopSerializer(many=True, read_only=True)
    
    class Meta:
        model = Route
        fields = ['id', 'operator', 'source', 'destination', 'estimated_duration', 'base_price', 'is_active', 'stops']

class TripSerializer(serializers.ModelSerializer):
    route_details = RouteSerializer(source='route', read_only=True)
    vehicle_details = VehicleSerializer(source='vehicle', read_only=True)
    availability_percentage = serializers.ReadOnlyField()
    full_route = serializers.ReadOnlyField()
    card_date = serializers.ReadOnlyField()
    card_time = serializers.ReadOnlyField()
    
    # We will compute these dynamically in search view
    matched_from_stop = serializers.IntegerField(required=False, read_only=True)
    matched_to_stop = serializers.IntegerField(required=False, read_only=True)
    segment_price = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, read_only=True)

    class Meta:
        model = Trip
        fields = [
            'id', 'route', 'route_details', 'vehicle', 'vehicle_details', 
            'departure_datetime', 'available_seats', 'status', 'created_at', 
            'updated_at', 'availability_percentage', 'full_route', 'card_date', 
            'card_time', 'matched_from_stop', 'matched_to_stop', 'segment_price'
        ]

class BookingSerializer(serializers.ModelSerializer):
    user_details = UserSerializer(source='user', read_only=True)
    trip_details = TripSerializer(source='trip', read_only=True)
    from_stop_details = RouteStopSerializer(source='from_stop', read_only=True)
    to_stop_details = RouteStopSerializer(source='to_stop', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    booking_type_display = serializers.CharField(source='get_booking_type_display', read_only=True)

    class Meta:
        model = Booking
        fields = '__all__'

class TransportOperatorProfileSerializer(serializers.ModelSerializer):
    user_details = UserSerializer(source='user', read_only=True)

    class Meta:
        model = TransportOperatorProfile
        fields = '__all__'

class LiveTripStatusSerializer(serializers.ModelSerializer):
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = LiveTripStatus
        fields = '__all__'
