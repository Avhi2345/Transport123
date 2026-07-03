import request from 'supertest';
import app from '../app';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { PrismaClient, BookingStatus, TripStatus, UserRole, BookingType } from '@prisma/client';

// Mock process.env variables for testing
process.env.SUPABASE_JWT_SECRET = 'test-secret';
process.env.EMAIL_HOST_USER = 'test@example.com';
process.env.EMAIL_HOST_PASSWORD = 'password';

// Mock @prisma/client module with inline mock definition to avoid hoisting ReferenceErrors
jest.mock('@prisma/client', () => {
  const localMockPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    trip: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    routeStop: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    booking: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    vehicle: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    route: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    transportOperatorProfile: {
      upsert: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    liveTripStatus: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn().mockImplementation((callback: any) => callback(localMockPrisma)),
  };

  return {
    PrismaClient: jest.fn().mockImplementation(() => localMockPrisma),
    VehicleType: { sumo: 'sumo', traveller: 'traveller', bus: 'bus', taxi: 'taxi' },
    TripStatus: { scheduled: 'scheduled', departed: 'departed', completed: 'completed', cancelled: 'cancelled' },
    BookingStatus: {
      pending: 'pending',
      approved: 'approved',
      rejected: 'rejected',
      paid: 'paid',
      waiting_confirmation: 'waiting_confirmation',
      completed: 'completed',
      cancelled: 'cancelled',
    },
    BookingType: { instant: 'instant', request: 'request' },
    RefundMethod: { upi: 'upi', bank: 'bank' },
    UserRole: { traveler: 'traveler', transport_operator: 'transport_operator', admin: 'admin' },
  };
});

// Mock nodemailer
jest.mock('nodemailer', () => {
  return {
    createTransport: jest.fn().mockReturnValue({
      sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
    }),
  };
});

// Mock fs to prevent writing files to disk during test execution
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn()
}));

// Mock pdfkit to prevent generating real PDF in tests using standard ES Class syntax
jest.mock('pdfkit', () => {
  class MockPDFDocument {
    private handlers: Record<string, Function[]> = {};

    on(event: string, callback: Function) {
      if (!this.handlers[event]) this.handlers[event] = [];
      this.handlers[event].push(callback);
      if (event === 'data') {
        // Immediately yield mock PDF content chunks
        callback(Buffer.from('PDF Content'));
      }
      return this;
    }

    fillColor() { return this; }
    fontSize() { return this; }
    font() { return this; }
    text() { return this; }
    moveTo() { return this; }
    lineTo() { return this; }
    stroke() { return this; }
    image() { return this; }

    end() {
      if (this.handlers['end']) {
        this.handlers['end'].forEach((cb) => cb());
      }
    }
  }

  return {
    __esModule: true,
    default: MockPDFDocument,
  };
});

describe('Transport System API Endpoints', () => {
  let travelerToken: string;
  let operatorToken: string;
  const prisma = new PrismaClient() as any;

  beforeAll(() => {
    travelerToken = jwt.sign(
      { sub: 'traveler-uuid', email: 'traveler@example.com', user_metadata: { role: 'traveler' } },
      'test-secret'
    );
    operatorToken = jwt.sign(
      { sub: 'operator-uuid', email: 'operator@example.com', user_metadata: { role: 'transport_operator' } },
      'test-secret'
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback: any) => callback(prisma));
    prisma.$executeRawUnsafe.mockResolvedValue(1);
    prisma.user.findUnique.mockResolvedValue({ id: 1, username: 'traveler-uuid', role: UserRole.traveler });
    prisma.user.create.mockResolvedValue({ id: 1, username: 'traveler-uuid', role: UserRole.traveler });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
    });
  });

  describe('GET /api/transport/trips/search', () => {
    it('should search trips matching source, destination, and date', async () => {
      const mockStops = [
        { id: 1, route_id: 10, stop_name: 'Guwahati', stop_order: 1, price_from_source: 0 },
        { id: 2, route_id: 10, stop_name: 'Shillong', stop_order: 3, price_from_source: 400 },
      ];

      prisma.routeStop.findMany
        .mockResolvedValueOnce([mockStops[0]]) // for source
        .mockResolvedValueOnce([mockStops[1]]); // for destination

      prisma.trip.findMany.mockResolvedValue([
        {
          id: 100,
          route_id: 10,
          vehicle_id: 5,
          departure_datetime: new Date().toISOString(),
          available_seats: 10,
          status: TripStatus.scheduled,
          route: {
            source: 'Guwahati',
            destination: 'Shillong',
            base_price: 400,
            stops: mockStops,
          },
          vehicle: {
            id: 5,
            name: 'ML Sumo',
            capacity: 10,
          },
        },
      ]);

      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const res = await request(app)
        .get('/api/transport/trips/search')
        .query({ source: 'Guwahati', destination: 'Shillong', date: todayStr });

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(100);
      expect(res.body[0].segment_price).toBe(400);
    });

    it('should return empty results if date is in the past', async () => {
      const res = await request(app)
        .get('/api/transport/trips/search')
        .query({ source: 'Guwahati', destination: 'Shillong', date: '2020-01-01' });

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(0);
    });
  });

  describe('GET /api/transport/trips/:id/seats', () => {
    it('should fetch seat layout status', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, username: 'traveler-uuid', role: UserRole.traveler });
      prisma.trip.findUnique.mockResolvedValue({
        id: 100,
        route_id: 10,
        route: {
          stops: [
            { id: 1, stop_order: 1, price_from_source: 0 },
            { id: 2, stop_order: 3, price_from_source: 400 },
          ],
        },
        vehicle: {
          capacity: 10,
        },
      });

      prisma.routeStop.findFirst
        .mockResolvedValueOnce({ id: 1, stop_order: 1, price_from_source: 0 })
        .mockResolvedValueOnce({ id: 2, stop_order: 3, price_from_source: 400 });

      prisma.booking.findMany
        .mockResolvedValueOnce([
          { id: 'b1', seat_number: '2', from_stop_order: 1, to_stop_order: 3, status: BookingStatus.approved },
        ]) // inside getAvailableSeatsList (activeBookings)
        .mockResolvedValueOnce([
          { id: 'b1', seat_number: '2', from_stop_order: 1, to_stop_order: 3, status: BookingStatus.approved },
        ]) // inside the main handler (activeBookings)
        .mockResolvedValueOnce([]); // inside the main handler (ownPending)

      const res = await request(app)
        .get('/api/transport/trips/100/seats')
        .set('Authorization', `Bearer ${travelerToken}`)
        .query({ from_stop: '1', to_stop: '2' });

      expect(res.status).toBe(200);
      expect(res.body.available_seats).toContain('1');
      expect(res.body.booked_seats).toContain('2');
    });
  });

  describe('POST /api/transport/book', () => {
    it('should book a seat successfully', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, username: 'traveler-uuid', role: UserRole.traveler });
      prisma.trip.findUnique.mockResolvedValue({
        id: 100,
        route_id: 10,
        route: {
          base_price: 400,
          stops: [
            { id: 1, stop_order: 1, price_from_source: 0 },
            { id: 2, stop_order: 3, price_from_source: 400 },
          ],
        },
        vehicle: {
          capacity: 10,
        },
      });

      // inside transaction callback
      prisma.booking.findMany
        .mockResolvedValueOnce([]) // getAvailableSeatsList inside checks
        .mockResolvedValueOnce([]); // activeBookings checks

      prisma.booking.create.mockResolvedValue({
        id: 'booking-id',
        booking_ref: 'REF12345',
        seat_number: '3',
        booking_type: BookingType.instant,
        price: 400,
        status: BookingStatus.approved,
        trip_id: 100,
        from_stop: { id: 1, stop_name: 'Guwahati' },
        to_stop: { id: 2, stop_name: 'Shillong' },
        trip: {
          departure_datetime: new Date().toISOString(),
          route: { source: 'Guwahati', destination: 'Shillong' },
          vehicle: { name: 'Sumo', vehicle_number: 'ML05' },
        },
      });

      const res = await request(app)
        .post('/api/transport/book')
        .set('Authorization', `Bearer ${travelerToken}`)
        .send({
          trip_id: 100,
          selected_seats: ['3'],
          booking_type: 'instant',
          from_stop: '1',
          to_stop: '2',
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Booking successful');
      expect(res.body.bookings[0].booking_ref).toBe('REF12345');
    });

    it('should fail if departure date is in the past', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, username: 'traveler-uuid', role: UserRole.traveler });
      prisma.trip.findUnique.mockResolvedValue({
        id: 100,
        route_id: 10,
        departure_datetime: '2020-01-01T12:00:00.000Z',
        route: {
          base_price: 400,
          stops: [
            { id: 1, stop_order: 1, price_from_source: 0 },
            { id: 2, stop_order: 3, price_from_source: 400 },
          ],
        },
        vehicle: {
          capacity: 10,
        },
      });

      const res = await request(app)
        .post('/api/transport/book')
        .set('Authorization', `Bearer ${travelerToken}`)
        .send({
          trip_id: 100,
          selected_seats: ['3'],
          booking_type: 'instant',
          from_stop: '1',
          to_stop: '2',
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Cannot book tickets for past dates');
    });
  });

  describe('GET /api/transport/bookings/:booking_ref/pdf', () => {
    it('should generate and return PDF for valid booking', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        booking_ref: 'REF12345',
        passenger_name: 'Traveler Name',
        seat_number: '3',
        status: BookingStatus.approved,
        trip: {
          id: 100,
          departure_datetime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // tomorrow
          route: { source: 'Guwahati', destination: 'Shillong' },
          vehicle: { name: 'Sumo', vehicle_number: 'ML05', driver_name: 'John', driver_contact: '123' },
        },
        from_stop: { id: 1, stop_name: 'Guwahati' },
        to_stop: { id: 2, stop_name: 'Shillong' },
      });

      const res = await request(app).get('/api/transport/bookings/REF12345/pdf');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment; filename="Ticket_REF12345.pdf"');
    });

    it('should return 410 if ticket is expired (older than 7 days)', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        booking_ref: 'REF12345',
        trip: {
          departure_datetime: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
        },
      });

      const res = await request(app).get('/api/transport/bookings/REF12345/pdf');
      expect(res.status).toBe(410);
      expect(res.body.error).toContain('Ticket expired');
    });
  });

  describe('GET /api/transport/operator/dashboard', () => {
    it('should block dashboard access for regular travelers', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, username: 'traveler-uuid', role: UserRole.traveler });

      const res = await request(app)
        .get('/api/transport/operator/dashboard')
        .set('Authorization', `Bearer ${travelerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Operator access required');
    });

    it('should return operator stats for a verified transport operator', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 2,
        username: 'operator-uuid',
        role: UserRole.transport_operator,
      });

      prisma.transportOperatorProfile.upsert.mockResolvedValue({
        operator_name: "Operator's Transport",
        phone: '1234567890',
      });

      prisma.vehicle.findMany.mockResolvedValue([{ id: 1, name: 'SumoML' }]);
      prisma.trip.findMany.mockResolvedValue([]);
      prisma.booking.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/transport/operator/dashboard')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.operator_profile.operator_name).toBe("Operator's Transport");
      expect(res.body.active_vehicles_count).toBe(1);
    });
  });

  describe('Operator Onboarding & Verification System', () => {
    let adminToken: string;

    beforeAll(() => {
      adminToken = jwt.sign(
        { sub: 'admin-uuid', email: 'admin@example.com', user_metadata: { role: 'admin' } },
        'test-secret'
      );
    });

    describe('POST /api/transport/operator/upload_doc', () => {
      it('should upload document base64 content and return URL', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 2, username: 'operator-uuid', role: UserRole.transport_operator });

        const res = await request(app)
          .post('/api/transport/operator/upload_doc')
          .set('Authorization', `Bearer ${operatorToken}`)
          .send({
            doc_type: 'licence',
            file_name: 'license.jpg',
            file_content: 'data:image/jpeg;base64,aGVsbG8gd29ybGQ='
          });

        expect(res.status).toBe(200);
        expect(res.body.url).toContain('/uploads/licence-2-');
      });

      it('should fail if inputs are missing', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 2, username: 'operator-uuid', role: UserRole.transport_operator });
        const res = await request(app)
          .post('/api/transport/operator/upload_doc')
          .set('Authorization', `Bearer ${operatorToken}`)
          .send({});

        expect(res.status).toBe(400);
      });
    });

    describe('POST /api/transport/operator/submit_verification', () => {
      it('should submit verification files and update status to pending', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 2, username: 'operator-uuid', role: UserRole.transport_operator });
        prisma.transportOperatorProfile.upsert.mockResolvedValue({
          user_id: 2,
          operator_name: 'Verified Agency',
          verification_status: 'pending'
        });
        prisma.vehicle.findUnique.mockResolvedValue(null);
        prisma.vehicle.create.mockResolvedValue({ id: 9 });

        const res = await request(app)
          .post('/api/transport/operator/submit_verification')
          .set('Authorization', `Bearer ${operatorToken}`)
          .send({
            operator_name: 'Verified Agency',
            phone: '9876543210',
            address: 'Shillong',
            upi_id: 'agency@ybl',
            bank_details: 'SBI Acct',
            licence_url: '/uploads/licence.jpg',
            rc_url: '/uploads/rc.jpg',
            vehicle_photo_url: '/uploads/photo.jpg',
            vehicle_name: 'Tata Sumo',
            vehicle_number: 'ML05A1234',
            vehicle_type: 'sumo',
            vehicle_capacity: '10'
          });

        expect(res.status).toBe(200);
        expect(res.body.operator_profile.verification_status).toBe('pending');
      });
    });

    describe('Verification Status Gate Check', () => {
      it('should block trip scheduling if operator is not approved', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 2, username: 'operator-uuid', role: UserRole.transport_operator });
        prisma.transportOperatorProfile.findUnique.mockResolvedValue({
          user_id: 2,
          verification_status: 'pending' // not approved
        });

        const res = await request(app)
          .post('/api/transport/operator/trips/create')
          .set('Authorization', `Bearer ${operatorToken}`)
          .send({
            route_id: '1',
            vehicle_id: '1',
            departure_datetime: new Date().toISOString()
          });

        expect(res.status).toBe(403);
        expect(res.body.error).toContain('verified by an admin');
      });
    });

    describe('Admin Profile List & Reviews', () => {
      it('should block non-admins from retrieving profiles', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 2, username: 'operator-uuid', role: UserRole.transport_operator });

        const res = await request(app)
          .get('/api/transport/operator/admin/profiles')
          .set('Authorization', `Bearer ${operatorToken}`);

        expect(res.status).toBe(403);
      });

      it('should allow admins to retrieve profiles', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 1, username: 'admin-uuid', role: UserRole.admin });
        prisma.transportOperatorProfile.findMany.mockResolvedValue([
          { user_id: 2, operator_name: 'Test Agency', verification_status: 'pending' }
        ]);
        prisma.vehicle.findMany.mockResolvedValue([]);

        const res = await request(app)
          .get('/api/transport/operator/admin/profiles')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.length).toBe(1);
        expect(res.body[0].operator_name).toBe('Test Agency');
      });

      it('should allow admins to review and approve an operator profile', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 1, username: 'admin-uuid', role: UserRole.admin });
        prisma.transportOperatorProfile.findUnique.mockResolvedValue({ user_id: 2, verification_status: 'pending' });
        prisma.transportOperatorProfile.update.mockResolvedValue({ user_id: 2, verification_status: 'approved' });
        prisma.user.update.mockResolvedValue({ id: 2, is_verified: true });
        prisma.vehicle.updateMany.mockResolvedValue({ count: 1 });

        const res = await request(app)
          .post('/api/transport/operator/admin/review')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            operator_id: '2',
            status: 'approved'
          });

        expect(res.status).toBe(200);
        expect(res.body.operator_profile.verification_status).toBe('approved');
      });

      it('should allow admins to review and request corrections on operator profile', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 1, username: 'admin-uuid', role: UserRole.admin });
        prisma.transportOperatorProfile.findUnique.mockResolvedValue({ user_id: 2, verification_status: 'pending' });
        prisma.transportOperatorProfile.update.mockResolvedValue({
          user_id: 2,
          verification_status: 'correction_requested',
          admin_notes: 'Uploaded licence photo is blurry'
        });
        prisma.vehicle.updateMany.mockResolvedValue({ count: 1 });

        const res = await request(app)
          .post('/api/transport/operator/admin/review')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            operator_id: '2',
            status: 'correction_requested',
            admin_notes: 'Uploaded licence photo is blurry'
          });

        expect(res.status).toBe(200);
        expect(res.body.operator_profile.verification_status).toBe('correction_requested');
        expect(res.body.operator_profile.admin_notes).toBe('Uploaded licence photo is blurry');
      });
    });
  });
});
