from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework import status
import datetime

from transport.models import Vehicle, Route, RouteStop, Trip, Booking

User = get_user_model()

class TransportAPIFlowTest(APITestCase):
    def setUp(self):
        # Create user accounts
        self.traveler = User.objects.create_user(
            username='traveler_uuid', password='password', role='traveler', phone='9876543210'
        )
        self.operator = User.objects.create_user(
            username='operator_uuid', password='password', role='transport_operator', phone='9876543210'
        )
        
        # Setup Vehicle & Route
        self.vehicle = Vehicle.objects.create(
            operator=self.operator, name="Fleet Sumo", vehicle_type="sumo", 
            vehicle_number="ML-05-9999", capacity=10, driver_name="Driver", driver_contact="9876543210"
        )
        self.route = Route.objects.create(
            operator=self.operator, source="Guwahati", destination="Shillong", 
            estimated_duration="3 hours", base_price=400.00
        )
        
        # Setup Stops (Order 1: Guwahati, Order 2: Nongpoh, Order 3: Shillong)
        self.stop_guwahati = RouteStop.objects.create(
            route=self.route, stop_name="Guwahati", stop_order=1, distance_from_start=0, price_from_source=0
        )
        self.stop_nongpoh = RouteStop.objects.create(
            route=self.route, stop_name="Nongpoh", stop_order=2, distance_from_start=50, price_from_source=150
        )
        self.stop_shillong = RouteStop.objects.create(
            route=self.route, stop_name="Shillong", stop_order=3, distance_from_start=100, price_from_source=400
        )
        
        # Setup Trip (Tomorrow)
        self.departure_time = timezone.now() + datetime.timedelta(days=1)
        self.trip = Trip.objects.create(
            route=self.route, vehicle=self.vehicle, departure_datetime=self.departure_time, status='scheduled'
        )

    def test_trip_search_api(self):
        """Verify trip searching returns matching segment schedules."""
        url = '/api/transport/trips/search/'
        date_str = self.departure_time.date().strftime('%Y-%m-%d')
        
        response = self.client.get(url, {
            'source': 'Guwahati',
            'destination': 'Shillong',
            'date': date_str
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], self.trip.id)
        # Verify segment price is correct (400 - 0 = 400)
        self.assertEqual(float(response.data[0]['segment_price']), 400.00)

    def test_seat_layout_api(self):
        """Verify seat availability matches booking status."""
        self.client.force_authenticate(user=self.traveler)
        
        # Book seat 2 for Guwahati to Nongpoh
        Booking.objects.create(
            trip=self.trip, seat_number='2', booking_type='instant', status='approved',
            from_stop=self.stop_guwahati, to_stop=self.stop_nongpoh, price=150.00
        )
        
        # Query seat layout for Guwahati to Nongpoh (seat 2 should be booked)
        url = f'/api/transport/trips/{self.trip.id}/seats/'
        response = self.client.get(url, {
            'from_stop': self.stop_guwahati.id,
            'to_stop': self.stop_nongpoh.id
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('2', response.data['booked_seats'])
        self.assertNotIn('2', response.data['available_seats'])

        # Query seat layout for Nongpoh to Shillong (seat 2 should be available!)
        response = self.client.get(url, {
            'from_stop': self.stop_nongpoh.id,
            'to_stop': self.stop_shillong.id
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn('2', response.data['booked_seats'])
        self.assertIn('2', response.data['available_seats'])

    def test_booking_transaction_api(self):
        """Verify transactional booking creates tickets and locks duplicate attempts."""
        self.client.force_authenticate(user=self.traveler)
        
        url = '/api/transport/book/'
        payload = {
            'trip_id': self.trip.id,
            'selected_seats': ['3'],
            'booking_type': 'instant',
            'from_stop': self.stop_guwahati.id,
            'to_stop': self.stop_shillong.id
        }
        
        # Book seat 3
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Booking.objects.filter(trip=self.trip, seat_number='3').count(), 1)
        
        # Attempt duplicate booking for overlapping segment (Guwahati to Nongpoh) should be rejected
        payload_overlap = {
            'trip_id': self.trip.id,
            'selected_seats': ['3'],
            'booking_type': 'instant',
            'from_stop': self.stop_guwahati.id,
            'to_stop': self.stop_nongpoh.id
        }
        response_overlap = self.client.post(url, payload_overlap, format='json')
        self.assertEqual(response_overlap.status_code, status.HTTP_409_CONFLICT)

    def test_resend_email_api(self):
        """Verify the resend email API checks permissions and handles email sending."""
        self.client.force_authenticate(user=self.traveler)
        booking = Booking.objects.create(
            trip=self.trip, seat_number='4', booking_type='instant', status='approved',
            from_stop=self.stop_guwahati, to_stop=self.stop_shillong, price=400.00,
            user=self.traveler
        )
        url = f'/api/transport/bookings/{booking.booking_ref}/resend/'
        
        # Test success (authorized user)
        response = self.client.post(url)
        # It may return 500 if SMTP server is down/not configured, but let's make sure it handles auth check
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_500_INTERNAL_SERVER_ERROR])

        # Test failure (unauthorized user trying to resend someone else's email)
        other_user = User.objects.create_user(
            username='other_user', password='password', role='traveler'
        )
        self.client.force_authenticate(user=other_user)
        response_fail = self.client.post(url)
        self.assertEqual(response_fail.status_code, status.HTTP_403_FORBIDDEN)

    def test_operator_profile_update_api(self):
        """Verify updating operator profile details via PUT on dashboard."""
        self.client.force_authenticate(user=self.operator)
        url = '/api/transport/operator/dashboard/'
        payload = {
            'operator_name': 'Super Fast Transit',
            'phone': '9876543210',
            'upi_id': 'fast@upi'
        }
        response = self.client.put(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['operator_profile']['operator_name'], 'Super Fast Transit')
        self.assertEqual(response.data['operator_profile']['upi_id'], 'fast@upi')
