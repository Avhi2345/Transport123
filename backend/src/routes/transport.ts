import { Router } from 'express';
import { authMiddleware, operatorMiddleware } from '../middleware/auth';
import {
  searchTrips,
  getTripSeats,
  createBooking,
  startTrip,
  stopTrip,
  updateLocation,
  getTracking,
  getBookingsList,
  getBookingByRef,
  downloadBookingPdf,
  resendEmail,
  cancelBooking,
  getOperatorDashboard,
  updateOperatorProfile,
  getOperatorTripPassengers,
  updateOperatorBookingStatus,
  createOperatorTrip,
  createOperatorRoute,
  getVehiclesList,
  createVehicle,
  getRoutesList,
  createRoute,
  addStop,
  deleteStop,
  uploadDoc,
  submitVerification,
  getAdminOperatorProfiles,
  reviewOperatorProfile,
  reviewVehicle,
  updateProfile,
  getProfile,
  sendOTP,
  verifyOTP,
  devApproveOperator
} from '../controllers/transport';

const router = Router();

// Public Routes (or simple Auth wrapper where optional, but usually wrapped under auth middleware)
router.get('/trips/search', searchTrips);
router.get('/trips/:id/seats', getTripSeats);
router.get('/bookings/:booking_ref/pdf', downloadBookingPdf); // PDF download doesn't strictly enforce token in Django
router.post('/otp/send', sendOTP);
router.post('/otp/verify', verifyOTP);

// Authenticated Routes
router.use(authMiddleware);

// User Profile
router.get('/profile', getProfile);
router.put('/profile', updateProfile);

// Vehicles ViewSet
router.get('/vehicles', getVehiclesList);
router.post('/vehicles', createVehicle);

// Routes ViewSet
router.get('/routes', getRoutesList);
router.post('/routes', createRoute);
router.post('/routes/:id/add_stop', addStop);
router.post('/routes/:id/delete_stop', deleteStop);

// Booking Transactions
router.post('/book', createBooking);
router.get('/bookings', getBookingsList);
router.get('/bookings/:booking_ref', getBookingByRef);
router.post('/bookings/:booking_ref/resend', resendEmail);
router.post('/bookings/:booking_ref/cancel', cancelBooking);

// Trip Operations
router.post('/trips/:id/start', startTrip);
router.post('/trips/:id/stop', stopTrip);
router.post('/trips/:id/location', updateLocation);
router.get('/trips/:id/tracking', getTracking);

// Admin Specific Operations (Must be before operatorMiddleware since Admins do not have the transport_operator role)
router.get('/operator/admin/profiles', getAdminOperatorProfiles);
router.post('/operator/admin/review', reviewOperatorProfile);
router.post('/operator/admin/review-vehicle', reviewVehicle);

// Operator Specific Operations
router.use('/operator', operatorMiddleware);
router.get('/operator/dashboard', getOperatorDashboard);
router.put('/operator/dashboard', updateOperatorProfile);
router.get('/operator/trips/:trip_id/passengers', getOperatorTripPassengers);
router.post('/operator/bookings/:booking_id/status', updateOperatorBookingStatus);
router.post('/operator/trips/create', createOperatorTrip);
router.post('/operator/routes/create', createOperatorRoute);
router.post('/operator/upload_doc', uploadDoc);
router.post('/operator/submit_verification', submitVerification);
router.post('/operator/dev-approve', devApproveOperator);

export default router;
