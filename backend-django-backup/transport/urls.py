from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    VehicleViewSet, RouteViewSet, TripViewSet, BookingViewSet, 
    BookingCreateAPIView, OperatorDashboardAPIView, OperatorTripPassengersAPIView, 
    OperatorBookingStatusUpdateAPIView, OperatorTripCreateAPIView, OperatorRouteCreateAPIView
)

router = DefaultRouter()
router.register(r'vehicles', VehicleViewSet, basename='vehicle')
router.register(r'routes', RouteViewSet, basename='route')
router.register(r'trips', TripViewSet, basename='trip')
router.register(r'bookings', BookingViewSet, basename='booking')

urlpatterns = [
    # ViewSets
    path('', include(router.urls)),
    
    # Booking Transactions
    path('book/', BookingCreateAPIView.as_view(), name='api-book-trip'),
    
    # Operator Dashboards & Operations
    path('operator/dashboard/', OperatorDashboardAPIView.as_view(), name='api-operator-dashboard'),
    path('operator/trips/<int:trip_id>/passengers/', OperatorTripPassengersAPIView.as_view(), name='api-operator-trip-passengers'),
    path('operator/bookings/<uuid:booking_id>/status/', OperatorBookingStatusUpdateAPIView.as_view(), name='api-operator-update-status'),
    path('operator/trips/create/', OperatorTripCreateAPIView.as_view(), name='api-operator-trip-create'),
    path('operator/routes/create/', OperatorRouteCreateAPIView.as_view(), name='api-operator-route-create'),
]
