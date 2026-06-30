from rest_framework import viewsets, status, views, permissions
from rest_framework.response import Response
from rest_framework.decorators import action
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Sum, Q
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
from django.http import HttpResponse
import datetime
import json

from .models import Vehicle, Route, RouteStop, Trip, LiveTripStatus, Booking, TransportOperatorProfile
from .serializers import (
    VehicleSerializer, RouteSerializer, RouteStopSerializer, TripSerializer, 
    BookingSerializer, TransportOperatorProfileSerializer, LiveTripStatusSerializer
)
from .utils import (
    get_available_seats, get_booked_seats, calculate_segment_price, 
    validate_booking_segment, generate_ticket_pdf, send_booking_confirmation_email
)

class TripViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Trip.objects.all().order_by('departure_datetime')
    serializer_class = TripSerializer
    permission_classes = [permissions.AllowAny]

    @action(detail=False, methods=['get'], url_path='search')
    def search(self, request):
        """
        Search for trips on a specific date for a route segment.
        Query Params: source, destination, date (YYYY-MM-DD), vehicle_type (optional)
        """
        source = request.query_params.get('source')
        destination = request.query_params.get('destination')
        date_str = request.query_params.get('date')
        vehicle_type = request.query_params.get('vehicle_type')

        if not source or not destination or not date_str:
            return Response(
                {"error": "Please provide source, destination, and date parameters"}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            date = datetime.datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD"}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        # Find potential stops
        start_stops = RouteStop.objects.filter(stop_name__icontains=source)
        end_stops = RouteStop.objects.filter(stop_name__icontains=destination)
        
        # Route mapping for quick O(1) lookup
        end_stops_map = {}
        for stop in end_stops:
            if stop.route_id not in end_stops_map:
                end_stops_map[stop.route_id] = []
            end_stops_map[stop.route_id].append(stop)
            
        trips_list = []
        
        for start_stop in start_stops:
            if start_stop.route_id in end_stops_map:
                for end_stop in end_stops_map[start_stop.route_id]:
                    if start_stop.stop_order < end_stop.stop_order:
                        # Found matching route segment
                        route_trips = Trip.objects.filter(
                            route_id=start_stop.route_id,
                            departure_datetime__date=date,
                            status='scheduled'
                        )
                        
                        if vehicle_type:
                            route_trips = route_trips.filter(vehicle__vehicle_type=vehicle_type)
                            
                        for trip in route_trips:
                            # Attach segment metadata
                            trip.matched_from_stop = start_stop.id
                            trip.matched_to_stop = end_stop.id
                            trip.segment_price = end_stop.price_from_source - start_stop.price_from_source
                            trips_list.append(trip)

        trips_list.sort(key=lambda x: x.departure_datetime)
        serializer = self.get_serializer(trips_list, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='seats')
    def get_seats(self, request, pk=None):
        """
        Get the list of booked and available seats for a specific segment.
        Query Params: from_stop (integer id), to_stop (integer id)
        """
        trip = self.get_object()
        from_stop_id = request.query_params.get('from_stop')
        to_stop_id = request.query_params.get('to_stop')

        if not from_stop_id or not to_stop_id:
            # Fall back to full route
            route_stops = RouteStop.objects.filter(route=trip.route).order_by('stop_order')
            if route_stops.exists():
                from_stop = route_stops.first()
                to_stop = route_stops.last()
            else:
                return Response(
                    {"error": "No stops configured for this route"}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            from_stop = get_object_or_404(RouteStop, id=from_stop_id, route=trip.route)
            to_stop = get_object_or_404(RouteStop, id=to_stop_id, route=trip.route)

        is_valid, error_msg = validate_booking_segment(trip, from_stop, to_stop)
        if not is_valid:
            return Response({"error": error_msg}, status=status.HTTP_400_BAD_REQUEST)

        # Get available and booked seats
        available = get_available_seats(trip, from_stop.stop_order, to_stop.stop_order)
        booked = get_booked_seats(trip, from_stop.stop_order, to_stop.stop_order)
        
        # Also, check if this user has any pending instant bookings (we want to let them re-try payment for those)
        own_pending_seats = []
        if request.user.is_authenticated:
            own_pending_seats = Booking.objects.filter(
                trip=trip,
                user=request.user,
                status='pending',
                booking_type='instant'
            ).values_list('seat_number', flat=True)
            # Remove from booked list since the user owns this hold
            booked = [s for s in booked if s not in own_pending_seats]

        return Response({
            "trip_id": trip.id,
            "vehicle_capacity": trip.vehicle.capacity,
            "available_seats": available,
            "booked_seats": booked,
            "own_pending_seats": list(own_pending_seats),
            "segment_price": to_stop.price_from_source - from_stop.price_from_source
        })

    @action(detail=True, methods=['post'], url_path='start', permission_classes=[permissions.IsAuthenticated])
    def start_trip(self, request, pk=None):
        trip = self.get_object()
        if trip.vehicle.operator != request.user and not request.user.is_staff:
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)
            
        trip.status = 'departed'
        trip.save()
        
        live_status, created = LiveTripStatus.objects.get_or_create(
            trip=trip,
            defaults={
                'current_latitude': 0.0,
                'current_longitude': 0.0,
            }
        )
        
        return Response({"message": f"Trip to {trip.route.destination} started. Live tracking enabled.", "status": trip.status})

    @action(detail=True, methods=['post'], url_path='stop', permission_classes=[permissions.IsAuthenticated])
    def stop_trip(self, request, pk=None):
        trip = self.get_object()
        if trip.vehicle.operator != request.user and not request.user.is_staff:
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)
            
        trip.status = 'completed'
        trip.save()
        
        return Response({"message": f"Trip to {trip.route.destination} completed. Live tracking stopped.", "status": trip.status})

    @action(detail=True, methods=['post'], url_path='location', permission_classes=[permissions.IsAuthenticated])
    def update_location(self, request, pk=None):
        trip = self.get_object()
        if trip.vehicle.operator != request.user and not request.user.is_staff:
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)
            
        lat = float(request.data.get('lat', 0.0))
        lng = float(request.data.get('lng', 0.0))
        speed = float(request.data.get('speed', 0.0))
        delay = int(request.data.get('delay', 0))
        next_stop_id = request.data.get('next_stop_id')
        
        live_status, created = LiveTripStatus.objects.get_or_create(
            trip=trip,
            defaults={'current_latitude': lat, 'current_longitude': lng}
        )
        
        live_status.current_latitude = lat
        live_status.current_longitude = lng
        live_status.current_speed = speed
        live_status.delay_minutes = delay
        
        if next_stop_id:
            try:
                live_status.next_stop = RouteStop.objects.get(id=next_stop_id, route=trip.route)
            except RouteStop.DoesNotExist:
                pass
                
        live_status.save()
        return Response({"status": "success"})

    @action(detail=True, methods=['get'], url_path='tracking', permission_classes=[permissions.IsAuthenticated])
    def get_tracking(self, request, pk=None):
        trip = self.get_object()
        
        # Security: check if user has active booking or is operator/staff
        has_booking = Booking.objects.filter(
            trip=trip, user=request.user, 
            status__in=['approved', 'paid', 'pending', 'waiting_confirmation']
        ).exists()
        
        is_operator = trip.vehicle.operator == request.user or request.user.is_staff
        
        if not has_booking and not is_operator:
            return Response({"error": "You can only track trips you have booked"}, status=status.HTTP_403_FORBIDDEN)
            
        try:
            live_status = trip.live_status
            serializer = LiveTripStatusSerializer(live_status)
            return Response(serializer.data)
        except LiveTripStatus.DoesNotExist:
            return Response({"error": "Live tracking not active for this trip"}, status=status.HTTP_404_NOT_FOUND)

class BookingViewSet(viewsets.ModelViewSet):
    queryset = Booking.objects.all().order_by('-created_at')
    serializer_class = BookingSerializer
    lookup_field = 'booking_ref'
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Users can view their own bookings, operators can view all bookings on their vehicles
        user = self.request.user
        if user.role == 'transport_operator' or user.is_staff:
            return Booking.objects.filter(trip__vehicle__operator=user)
        return Booking.objects.filter(user=user)

    @action(detail=True, methods=['get'], url_path='pdf', permission_classes=[permissions.AllowAny])
    def download_pdf(self, request, booking_ref=None):
        """Download E-Ticket PDF receipt."""
        booking = get_object_or_404(Booking, booking_ref=booking_ref)
        
        # 7-day expiry logic post trip date
        from datetime import timedelta
        trip_date = booking.trip.departure_datetime.date()
        expiry_date = trip_date + timedelta(days=7)
        if timezone.now().date() > expiry_date:
            return Response({"error": "Ticket expired. Access is only available up to 7 days after the trip."}, status=status.HTTP_410_GONE)

        pdf_buffer = generate_ticket_pdf(booking)
        response = HttpResponse(pdf_buffer.read(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="Ticket_{booking.booking_ref}.pdf"'
        return response

    @action(detail=True, methods=['post'], url_path='resend', permission_classes=[permissions.IsAuthenticated])
    def resend_email(self, request, booking_ref=None):
        """Resend E-Ticket confirmation email."""
        booking = get_object_or_404(Booking, booking_ref=booking_ref)
        
        # Security check: ensure user owns this booking, is operator of the vehicle, or is staff
        if booking.user != request.user and booking.trip.vehicle.operator != request.user and not request.user.is_staff:
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)
            
        success, msg = send_booking_confirmation_email(request, booking)
        if success:
            return Response({"message": "Confirmation email resent successfully."})
        return Response({"error": f"Failed to send email: {msg}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'], url_path='cancel', permission_classes=[permissions.IsAuthenticated])
    def cancel_booking(self, request, booking_ref=None):
        booking = self.get_object()
        
        # Security check: ensure user owns this booking, is operator of the vehicle, or is staff
        if booking.user != request.user and booking.trip.vehicle.operator != request.user and not request.user.is_staff:
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)
            
        if booking.status == 'cancelled':
            return Response({"error": "Booking is already cancelled"}, status=status.HTTP_400_BAD_REQUEST)
            
        refund_method = request.data.get('refund_method') # 'upi' or 'bank'
        
        if refund_method == 'upi':
            upi_id = request.data.get('refund_upi_id')
            if not upi_id:
                return Response({"error": "UPI ID is required for UPI refund"}, status=status.HTTP_400_BAD_REQUEST)
            booking.refund_method = 'upi'
            booking.refund_upi_id = upi_id
        elif refund_method == 'bank':
            acc_num = request.data.get('refund_bank_account')
            ifsc = request.data.get('refund_bank_ifsc')
            bank_name = request.data.get('refund_bank_name')
            holder = request.data.get('refund_account_holder')
            if not acc_num or not ifsc or not bank_name or not holder:
                return Response({"error": "All bank details (account number, IFSC, bank name, holder name) are required"}, status=status.HTTP_400_BAD_REQUEST)
            booking.refund_method = 'bank'
            booking.refund_bank_account = acc_num
            booking.refund_bank_ifsc = ifsc
            booking.refund_bank_name = bank_name
            booking.refund_account_holder = holder
        else:
            return Response({"error": "Invalid refund method. Choose 'upi' or 'bank'."}, status=status.HTTP_400_BAD_REQUEST)
            
        booking.status = 'cancelled'
        booking.save()
        
        # Send cancellation email
        try:
            subject = f"Booking Cancelled: REF {booking.booking_ref}"
            message = f"Hello {booking.passenger_name},\n\nYour booking request (ID: {booking.booking_ref}) has been successfully cancelled.\nRefund method selected: {booking.get_refund_method_display()}.\n\nRegards,\nNE Explore"
            recipient = getattr(booking.user, 'email', None) or booking.passenger_email
            if recipient:
                send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [recipient])
        except Exception as e:
            print(f"Failed to send cancellation email: {e}")

        return Response({"message": "Booking cancelled successfully. Refund request recorded.", "booking": BookingSerializer(booking).data})

class BookingCreateAPIView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        """
        Transactional seat booking endpoint. Locks row to prevent race conditions.
        """
        trip_id = request.data.get('trip_id')
        selected_seats = request.data.get('selected_seats') # Array or comma-separated string
        booking_type = request.data.get('booking_type', 'request')
        from_stop_id = request.data.get('from_stop')
        to_stop_id = request.data.get('to_stop')
        
        # Optional metadata (mostly used by operators during counter check-ins)
        passenger_name = request.data.get('passenger_name')
        passenger_phone = request.data.get('passenger_phone')
        passenger_email = request.data.get('passenger_email')
        
        # Per-seat passenger info dictionary {"1": {"name": "X", "phone": "Y"}, ...}
        seat_details = request.data.get('seat_details', {})

        if not trip_id or not selected_seats:
            return Response({"error": "trip_id and selected_seats are required"}, status=status.HTTP_400_BAD_REQUEST)

        # Parse selected seats
        if isinstance(selected_seats, str):
            selected_seats = [s.strip() for s in selected_seats.split(',') if s.strip()]

        if not selected_seats:
            return Response({"error": "Please specify at least one seat"}, status=status.HTTP_400_BAD_REQUEST)

        # Acquire lock on the Trip row
        try:
            trip = Trip.objects.select_for_update().get(id=trip_id)
        except Trip.DoesNotExist:
            return Response({"error": "Trip not found"}, status=status.HTTP_404_NOT_FOUND)

        route_stops = RouteStop.objects.filter(route=trip.route).order_by('stop_order')
        has_stops = route_stops.exists()

        if has_stops:
            if not from_stop_id or not to_stop_id:
                from_stop = route_stops.first()
                to_stop = route_stops.last()
            else:
                from_stop = get_object_or_404(RouteStop, id=from_stop_id, route=trip.route)
                to_stop = get_object_or_404(RouteStop, id=to_stop_id, route=trip.route)
            
            # Validate segment
            is_valid, error_msg = validate_booking_segment(trip, from_stop, to_stop)
            if not is_valid:
                return Response({"error": error_msg}, status=status.HTTP_400_BAD_REQUEST)

            segment_price = calculate_segment_price(from_stop, to_stop)
        else:
            from_stop = to_stop = None
            segment_price = trip.route.base_price

        # Is operator making the booking?
        is_operator = request.user.role == 'transport_operator' or request.user.is_staff

        # Release existing pending bookings by this user for the same seats (e.g. they timed out/retried)
        if request.user.is_authenticated and booking_type == 'instant':
            Booking.objects.filter(
                trip=trip,
                user=request.user,
                status='pending',
                booking_type='instant',
                seat_number__in=selected_seats
            ).update(status='cancelled')

        # Check availability under transaction lock
        from_order = from_stop.stop_order if from_stop else 1  # type: ignore
        to_order = to_stop.stop_order if to_stop else 2  # type: ignore
        available_seats_list = get_available_seats(trip, from_order, to_order)
        for seat in selected_seats:
            if seat not in available_seats_list:
                return Response(
                    {"error": f"Seat {seat} has just been booked by someone else. Please try another seat."}, 
                    status=status.HTTP_409_CONFLICT
                )

        created_bookings = []
        for seat in selected_seats:
            # Check if seat-specific details are present
            seat_info = seat_details.get(seat, {})
            s_name = seat_info.get('name', passenger_name)
            s_phone = seat_info.get('phone', passenger_phone)
            
            booking_data = {
                'trip': trip,
                'seat_number': seat,
                'booking_type': booking_type,
                'price': segment_price,
                'segment_price': segment_price,
                # Operator bookings auto-approve if instant
                'status': 'approved' if (booking_type == 'instant' and is_operator) else ('pending' if booking_type != 'instant' else 'approved')
            }
            
            if has_stops:
                booking_data['from_stop'] = from_stop
                booking_data['to_stop'] = to_stop
                booking_data['from_stop_order'] = from_stop.stop_order  # type: ignore
                booking_data['to_stop_order'] = to_stop.stop_order  # type: ignore
                
            if is_operator:
                # Operator booking for manual customers
                booking_data['user'] = None
                booking_data['passenger_name'] = s_name or "Manual Check-in"
                booking_data['passenger_phone'] = s_phone or ""
                booking_data['passenger_email'] = passenger_email or ""
            else:
                # Regular user booking
                booking_data['user'] = request.user
                booking_data['passenger_name'] = s_name or request.user.username
                booking_data['passenger_phone'] = s_phone or getattr(request.user, 'phone', '')
                booking_data['passenger_email'] = request.user.email

            booking = Booking.objects.create(**booking_data)
            created_bookings.append(booking)

        # Trigger emails for approved bookings
        for b in created_bookings:
            if b.status in ['approved', 'paid']:
                send_booking_confirmation_email(request, b)

        serializer = BookingSerializer(created_bookings, many=True)
        return Response({
            "message": "Booking successful",
            "bookings": serializer.data
        }, status=status.HTTP_201_CREATED)

class OperatorDashboardAPIView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        """
        Dashboard stats for transport operators
        """
        if request.user.role != 'transport_operator' and not request.user.is_staff:
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        # Get operator profile
        operator_profile, created = TransportOperatorProfile.objects.get_or_create(
            user=request.user, 
            defaults={"operator_name": f"{request.user.username}'s Transport"}
        )

        # Retrieve active vehicles
        vehicles = Vehicle.objects.filter(operator=request.user, is_active=True)
        vehicles_serializer = VehicleSerializer(vehicles, many=True)

        # Retrieve upcoming trips
        trips = Trip.objects.filter(
            vehicle__operator=request.user,
            departure_datetime__gte=timezone.now()
        ).select_related('route', 'vehicle').order_by('departure_datetime')
        trips_serializer = TripSerializer(trips, many=True)

        # Stats calculations
        valid_statuses = ['approved', 'paid', 'waiting_confirmation', 'completed']
        bookings = Booking.objects.filter(trip__vehicle__operator=request.user, status__in=valid_statuses)
        
        total_revenue = bookings.aggregate(total=Sum('segment_price'))['total'] or 0
        total_passengers = bookings.count()
        recent_bookings = Booking.objects.filter(trip__vehicle__operator=request.user).order_by('-created_at')[:5]
        recent_serializer = BookingSerializer(recent_bookings, many=True)

        return Response({
            "operator_profile": TransportOperatorProfileSerializer(operator_profile).data,
            "active_vehicles_count": vehicles.count(),
            "vehicles": vehicles_serializer.data,
            "trips_count": trips.count(),
            "trips": trips_serializer.data,
            "total_revenue": total_revenue,
            "total_passengers": total_passengers,
            "recent_bookings": recent_serializer.data
        })

    def put(self, request):
        """
        Update operator profile details
        """
        if request.user.role != 'transport_operator' and not request.user.is_staff:
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        operator_profile, created = TransportOperatorProfile.objects.get_or_create(
            user=request.user, 
            defaults={"operator_name": f"{request.user.username}'s Transport"}
        )

        serializer = TransportOperatorProfileSerializer(operator_profile, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({
                "message": "Profile updated successfully",
                "operator_profile": serializer.data
            })
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class OperatorTripPassengersAPIView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, trip_id):
        """Retrieve booking list and passenger manifest for a trip."""
        trip = get_object_or_404(Trip, id=trip_id)
        if trip.vehicle.operator != request.user and not request.user.is_staff:
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        bookings = trip.bookings.all().order_by('seat_number')
        bookings_serializer = BookingSerializer(bookings, many=True)

        stops = trip.route.stops.all().order_by('stop_order')
        stops_serializer = RouteStopSerializer(stops, many=True)

        return Response({
            "trip": TripSerializer(trip).data,
            "bookings": bookings_serializer.data,
            "stops": stops_serializer.data
        })

class OperatorBookingStatusUpdateAPIView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, booking_id):
        """Approve/Reject/Cancel a passenger booking."""
        booking = get_object_or_404(Booking, id=booking_id)
        if booking.trip.vehicle.operator != request.user and not request.user.is_staff:
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        new_status = request.data.get('status')
        valid_statuses = [s[0] for s in Booking.STATUS_CHOICES]
        
        if not new_status or new_status not in valid_statuses:
            return Response({"error": "Invalid status option"}, status=status.HTTP_400_BAD_REQUEST)

        booking.status = new_status
        booking.save()

        # Email alerts
        recipient_email = getattr(booking.user, 'email', None) or booking.passenger_email
        if recipient_email:
            if new_status == 'approved':
                send_booking_confirmation_email(request, booking)
            elif new_status == 'rejected':
                subject = f"Booking Update: Trip to {booking.trip.route.destination}"
                message = f"Hello,\n\nUnfortunately, your booking request (ID: {booking.booking_ref}) has been rejected by the operator.\n\nRegards,\nNE Explore"
                try:
                    send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [recipient_email])
                except Exception as e:
                    print(f"Failed to send rejection email: {e}")

        return Response({
            "message": f"Booking {booking.booking_ref} status updated to {new_status}",
            "booking": BookingSerializer(booking).data
        })

class OperatorTripCreateAPIView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        """Create scheduling routes and recurring trip sequences."""
        if request.user.role != 'transport_operator' and not request.user.is_staff:
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        route_id = request.data.get('route_id')
        vehicle_id = request.data.get('vehicle_id')
        departure_datetime_str = request.data.get('departure_datetime')
        is_daily = request.data.get('is_daily', False)
        days_count = int(request.data.get('schedule_days', 30))
        additional_times = request.data.get('additional_times', []) # List of "HH:MM" strings

        route = get_object_or_404(Route, id=route_id, operator=request.user)
        vehicle = get_object_or_404(Vehicle, id=vehicle_id, operator=request.user)

        try:
            departure_dt = datetime.datetime.fromisoformat(departure_datetime_str.replace('Z', '+00:00'))
        except ValueError:
            return Response({"error": "Invalid ISO datetime format"}, status=status.HTTP_400_BAD_REQUEST)

        count = 0
        trips_created = []

        if is_daily:
            for i in range(days_count):
                current_date = departure_dt.date() + datetime.timedelta(days=i)
                dt_main = datetime.datetime.combine(current_date, departure_dt.time())
                
                # Create main trip for day
                trip = Trip.objects.create(
                    route=route,
                    vehicle=vehicle,
                    departure_datetime=dt_main,
                    status='scheduled'
                )
                trips_created.append(trip)
                count += 1

                # Create additional hourly trips for day
                for t_str in additional_times:
                    if t_str and ':' in t_str:
                        try:
                            h, m = map(int, t_str.split(':'))
                            dt_extra = datetime.datetime.combine(current_date, datetime.time(hour=h, minute=m))
                            extra_trip = Trip.objects.create(
                                route=route,
                                vehicle=vehicle,
                                departure_datetime=dt_extra,
                                status='scheduled'
                            )
                            trips_created.append(extra_trip)
                            count += 1
                        except ValueError:
                            pass
        else:
            trip = Trip.objects.create(
                route=route,
                vehicle=vehicle,
                departure_datetime=departure_dt,
                status='scheduled'
            )
            trips_created.append(trip)
            count += 1

        return Response({
            "message": f"Successfully created {count} trips.",
            "trips": TripSerializer(trips_created, many=True).data
        }, status=status.HTTP_201_CREATED)

class OperatorRouteCreateAPIView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        """Create Route and auto-create list of stops."""
        if request.user.role != 'transport_operator' and not request.user.is_staff:
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        source = request.data.get('source')
        destination = request.data.get('destination')
        estimated_duration = request.data.get('estimated_duration')
        base_price = request.data.get('base_price')
        intermediate_stops = request.data.get('stops', []) # List of dicts: {name, distance, price, time_offset_minutes}

        if not source or not destination or not base_price:
            return Response({"error": "source, destination, and base_price are required"}, status=status.HTTP_400_BAD_REQUEST)

        # Create main Route
        route = Route.objects.create(
            operator=request.user,
            source=source,
            destination=destination,
            estimated_duration=estimated_duration or "",
            base_price=base_price
        )

        # Create Source Stop (Order 1)
        RouteStop.objects.create(
            route=route,
            stop_name=source,
            stop_order=1,
            distance_from_start=0,
            price_from_source=0,
            arrival_time_offset=datetime.timedelta(0)
        )

        current_order = 2
        max_dist = 0

        # Create Intermediate Stops
        for stop_info in intermediate_stops:
            s_name = stop_info.get('name')
            s_dist = float(stop_info.get('distance', 0))
            s_price = float(stop_info.get('price', 0))
            s_offset_min = int(stop_info.get('time_offset_minutes', 0))

            RouteStop.objects.create(
                route=route,
                stop_name=s_name,
                stop_order=current_order,
                distance_from_start=s_dist,
                price_from_source=s_price,
                arrival_time_offset=datetime.timedelta(minutes=s_offset_min)
            )
            current_order += 1
            max_dist = max(max_dist, s_dist)

        # Create Destination Stop
        dest_dist = max_dist + 20 if max_dist > 0 else 50
        RouteStop.objects.create(
            route=route,
            stop_name=destination,
            stop_order=current_order,
            distance_from_start=dest_dist,
            price_from_source=base_price,
            arrival_time_offset=datetime.timedelta(hours=5) # Default/estimate
        )

        return Response({
            "message": "Route and stops successfully created.",
            "route": RouteSerializer(route).data
        }, status=status.HTTP_201_CREATED)

class VehicleViewSet(viewsets.ModelViewSet):
    serializer_class = VehicleSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Vehicle.objects.filter(operator=self.request.user)

    def perform_create(self, serializer):
        serializer.save(operator=self.request.user)

class RouteViewSet(viewsets.ModelViewSet):
    serializer_class = RouteSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Route.objects.filter(operator=self.request.user)

    def perform_create(self, serializer):
        serializer.save(operator=self.request.user)

    @action(detail=True, methods=['post'], url_path='add_stop')
    @transaction.atomic
    def add_stop(self, request, pk=None):
        route = self.get_object()
        stop_name = request.data.get('stop_name')
        stop_order = request.data.get('stop_order')
        distance = request.data.get('distance_from_start')
        price = request.data.get('price_from_source')
        time_offset_minutes = int(request.data.get('time_offset_minutes', 0))

        if not stop_name or not stop_order or not distance or not price:
            return Response({"error": "All fields are required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            target_order = int(stop_order)
            
            # Shift existing stops
            existing_stops = RouteStop.objects.filter(route=route, stop_order__gte=target_order)
            if existing_stops.exists():
                for stop in existing_stops.order_by('-stop_order'):
                    stop.stop_order += 1
                    stop.save()

            new_stop = RouteStop.objects.create(
                route=route,
                stop_name=stop_name,
                stop_order=target_order,
                distance_from_start=float(distance),
                price_from_source=float(price),
                arrival_time_offset=datetime.timedelta(minutes=time_offset_minutes)
            )

            return Response({
                "message": f"Stop '{stop_name}' added successfully",
                "stop": RouteStopSerializer(new_stop).data,
                "route": RouteSerializer(route).data
            }, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='delete_stop')
    @transaction.atomic
    def delete_stop(self, request, pk=None):
        route = self.get_object()
        stop_id = request.data.get('stop_id')

        if not stop_id:
            return Response({"error": "stop_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        stop = get_object_or_404(RouteStop, id=stop_id, route=route)
        stop.delete()

        # Re-normalize remaining stops
        stops = route.stops.all().order_by('stop_order')
        for index, s in enumerate(stops, start=1):
            if s.stop_order != index:
                s.stop_order = index
                s.save()

        return Response({
            "message": "Stop deleted and order re-normalized",
            "route": RouteSerializer(route).data
        })
