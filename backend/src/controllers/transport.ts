import { Request, Response } from 'express';
import { PrismaClient, VehicleType, TripStatus, BookingStatus, BookingType, RefundMethod, UserRole } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { sendBookingConfirmationEmail } from '../utils/email';
import { generateTicketPdf } from '../utils/pdf';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Helper to check segment overlaps
export function checkSegmentOverlap(existingFrom: number, existingTo: number, requestedFrom: number, requestedTo: number): boolean {
  if (existingTo === requestedFrom || existingFrom === requestedTo) {
    return false;
  }
  return existingFrom < requestedTo && existingTo > requestedFrom;
}

// Helper to get available seats for a trip in a segment
export async function getAvailableSeatsList(tripId: number, fromOrder: number, toOrder: number): Promise<string[]> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { vehicle: true }
  });
  
  if (!trip || !trip.vehicle) return [];
  
  const capacity = trip.vehicle.capacity;
  const allSeats = Array.from({ length: capacity }, (_, i) => String(i + 1));

  const activeBookings = await prisma.booking.findMany({
    where: {
      trip_id: tripId,
      status: {
        in: [
          BookingStatus.pending,
          BookingStatus.approved,
          BookingStatus.paid,
          BookingStatus.waiting_confirmation
        ]
      }
    }
  });

  const availableSeats: string[] = [];

  for (const seat of allSeats) {
    const seatBookings = activeBookings.filter(b => b.seat_number === seat);
    let isAvailable = true;

    for (const booking of seatBookings) {
      const existingFrom = booking.from_stop_order;
      const existingTo = booking.to_stop_order;

      if (existingFrom === null || existingTo === null) {
        isAvailable = false;
        break;
      }

      if (checkSegmentOverlap(existingFrom, existingTo, fromOrder, toOrder)) {
        isAvailable = false;
        break;
      }
    }

    if (isAvailable) {
      availableSeats.push(seat);
    }
  }

  return availableSeats;
}

// Helper to format Trip details matching Django response
function formatTrip(trip: any, matchedFromStop?: number, matchedToStop?: number, segmentPrice?: number) {
  const capacity = trip.vehicle?.capacity || 0;
  const availPercentage = capacity > 0 ? Math.round((trip.available_seats / capacity) * 100) : 0;
  const depDate = new Date(trip.departure_datetime);

  const cardDate = depDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); // e.g. "12 Jun"
  const cardTime = depDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }); // e.g. "09:30 AM"

  return {
    id: trip.id,
    route: trip.route_id,
    route_details: trip.route ? {
      ...trip.route,
      base_price: Number(trip.route.base_price),
      stops: trip.route.stops?.map((s: any) => ({
        ...s,
        distance_from_start: Number(s.distance_from_start),
        price_from_source: Number(s.price_from_source)
      })) || []
    } : null,
    vehicle: trip.vehicle_id,
    vehicle_details: trip.vehicle,
    departure_datetime: trip.departure_datetime,
    available_seats: trip.available_seats,
    status: trip.status,
    created_at: trip.created_at,
    updated_at: trip.updated_at,
    availability_percentage: availPercentage,
    full_route: trip.route ? `${trip.route.source.toUpperCase()} → ${trip.route.destination.toUpperCase()}` : '',
    card_date: cardDate,
    card_time: cardTime,
    matched_from_stop: matchedFromStop || null,
    matched_to_stop: matchedToStop || null,
    segment_price: segmentPrice !== undefined ? Number(segmentPrice) : null,
    live_status: trip.live_status || null
  };
}

// Helper to format Booking response
function formatBooking(booking: any) {
  return {
    ...booking,
    price: Number(booking.price),
    segment_price: booking.segment_price ? Number(booking.segment_price) : null,
    status_display: booking.status,
    booking_type_display: booking.booking_type,
    trip_details: booking.trip ? formatTrip(booking.trip) : null,
    from_stop_details: booking.from_stop ? {
      ...booking.from_stop,
      distance_from_start: Number(booking.from_stop.distance_from_start),
      price_from_source: Number(booking.from_stop.price_from_source)
    } : null,
    to_stop_details: booking.to_stop ? {
      ...booking.to_stop,
      distance_from_start: Number(booking.to_stop.distance_from_start),
      price_from_source: Number(booking.to_stop.price_from_source)
    } : null
  };
}

// 1. Search Trips
export async function searchTrips(req: AuthRequest, res: Response) {
  const { source, destination, date: dateStr, vehicle_type } = req.query;

  if (!source || !destination) {
    return res.status(400).json({ error: 'Please provide source and destination parameters' });
  }

  try {
    let startOfDay: Date | undefined;
    let endOfDay: Date | undefined;
    let startOfToday: Date | undefined;

    if (dateStr) {
      const searchDate = new Date(dateStr as string);
      if (isNaN(searchDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }

      const parts = (dateStr as string).split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const today = new Date();
        const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const searchDateLocal = new Date(year, month, day);
        if (searchDateLocal < todayLocal) {
          return res.json([]); // Return empty results for past dates
        }
      }

      startOfDay = new Date(searchDate.setHours(0, 0, 0, 0));
      endOfDay = new Date(searchDate.setHours(23, 59, 59, 999));
    } else {
      const today = new Date();
      startOfToday = new Date(today.setHours(0, 0, 0, 0));
    }

    // Find stops containing source or destination strings
    const startStops = await prisma.routeStop.findMany({
      where: { stop_name: { contains: source as string, mode: 'insensitive' } }
    });
    
    const endStops = await prisma.routeStop.findMany({
      where: { stop_name: { contains: destination as string, mode: 'insensitive' } }
    });

    const tripsList: any[] = [];

    for (const startStop of startStops) {
      const matchingEndStops = endStops.filter(
        (e) => e.route_id === startStop.route_id && startStop.stop_order < e.stop_order
      );

      for (const endStop of matchingEndStops) {
        // Find trips matching this route and departure date
        const routeTrips = await prisma.trip.findMany({
          where: {
            route_id: startStop.route_id,
            departure_datetime: dateStr ? {
              gte: startOfDay,
              lte: endOfDay
            } : {
              gte: startOfToday
            },
            status: {
              in: [TripStatus.scheduled, TripStatus.departed]
            },
            ...(vehicle_type ? { vehicle: { vehicle_type: vehicle_type as VehicleType } } : {})
          },
          include: {
            route: { include: { stops: { orderBy: { stop_order: 'asc' } } } },
            vehicle: true
          }
        });

        for (const trip of routeTrips) {
          const segmentPrice = Number(endStop.price_from_source) - Number(startStop.price_from_source);
          tripsList.push(formatTrip(trip, startStop.id, endStop.id, segmentPrice));
        }
      }
    }

    tripsList.sort((a, b) => new Date(a.departure_datetime).getTime() - new Date(b.departure_datetime).getTime());
    return res.json(tripsList);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 2. Get available and booked seats for a segment
export async function getTripSeats(req: AuthRequest, res: Response) {
  const tripId = parseInt(req.params.id);
  const { from_stop: fromStopIdStr, to_stop: toStopIdStr } = req.query;

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        route: { include: { stops: { orderBy: { stop_order: 'asc' } } } },
        vehicle: true
      }
    });

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    let fromStop: any;
    let toStop: any;

    if (!fromStopIdStr || !toStopIdStr) {
      if (trip.route.stops.length > 0) {
        fromStop = trip.route.stops[0];
        toStop = trip.route.stops[trip.route.stops.length - 1];
      } else {
        return res.status(400).json({ error: 'No stops configured for this route' });
      }
    } else {
      fromStop = await prisma.routeStop.findFirst({
        where: { id: parseInt(fromStopIdStr as string), route_id: trip.route_id }
      });
      toStop = await prisma.routeStop.findFirst({
        where: { id: parseInt(toStopIdStr as string), route_id: trip.route_id }
      });
    }

    if (!fromStop || !toStop) {
      return res.status(404).json({ error: 'Stops not found on this trip\'s route' });
    }

    if (fromStop.stop_order >= toStop.stop_order) {
      return res.status(400).json({ error: 'Boarding stop must come before dropping stop' });
    }

    const availableSeats = await getAvailableSeatsList(tripId, fromStop.stop_order, toStop.stop_order);
    const totalSeats = trip.vehicle.capacity;
    const allSeats = Array.from({ length: totalSeats }, (_, i) => String(i + 1));
    let bookedSeats = allSeats.filter((s) => !availableSeats.includes(s));

    let ownPendingSeats: string[] = [];
    if (req.user) {
      const ownPending = await prisma.booking.findMany({
        where: {
          trip_id: tripId,
          user_id: req.user.id,
          status: BookingStatus.pending,
          booking_type: BookingType.instant
        },
        select: { seat_number: true }
      });
      ownPendingSeats = ownPending.map((b) => b.seat_number);
      // Remove from booked list since the user owns this hold
      bookedSeats = bookedSeats.filter((s) => !ownPendingSeats.includes(s));
    }

    const segmentPrice = Number(toStop.price_from_source) - Number(fromStop.price_from_source);

    return res.json({
      trip_id: trip.id,
      vehicle_capacity: trip.vehicle.capacity,
      available_seats: availableSeats,
      booked_seats: bookedSeats,
      own_pending_seats: ownPendingSeats,
      segment_price: segmentPrice
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 3. Create Booking (Atomic Transaction with select_for_update)
export async function createBooking(req: AuthRequest, res: Response) {
  const {
    trip_id,
    selected_seats,
    booking_type = 'request',
    from_stop: fromStopIdStr,
    to_stop: toStopIdStr,
    passenger_name,
    passenger_phone,
    passenger_email,
    seat_details = {}
  } = req.body;

  if (!trip_id || !selected_seats) {
    return res.status(400).json({ error: 'trip_id and selected_seats are required' });
  }

  const tripId = parseInt(trip_id);
  let seatsList: string[] = [];

  if (Array.isArray(selected_seats)) {
    seatsList = selected_seats.map(s => String(s).trim());
  } else if (typeof selected_seats === 'string') {
    seatsList = selected_seats.split(',').map(s => s.trim()).filter(Boolean);
  }

  if (seatsList.length === 0) {
    return res.status(400).json({ error: 'Please specify at least one seat' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Lock the Trip row (equivalent to select_for_update)
      await tx.$executeRawUnsafe(`SELECT * FROM "transport_trip" WHERE id = $1 FOR UPDATE`, tripId);

      const trip = await tx.trip.findUnique({
        where: { id: tripId },
        include: { route: { include: { stops: true } }, vehicle: true }
      });

      if (!trip) throw new Error('Trip not found');

      // Check if departure date is in the past (yesterday or earlier)
      const tripDate = trip.departure_datetime ? new Date(trip.departure_datetime) : new Date();
      const today = new Date();
      const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const tripDateLocal = new Date(tripDate.getFullYear(), tripDate.getMonth(), tripDate.getDate());
      if (tripDateLocal < todayLocal) {
        throw new Error('Cannot book tickets for past dates');
      }

      const routeStops = trip.route.stops.sort((a, b) => a.stop_order - b.stop_order);
      const hasStops = routeStops.length > 0;

      let fromStop: any = null;
      let toStop: any = null;
      let segmentPrice = Number(trip.route.base_price);

      if (hasStops) {
        if (!fromStopIdStr || !toStopIdStr) {
          fromStop = routeStops[0];
          toStop = routeStops[routeStops.length - 1];
        } else {
          fromStop = routeStops.find(s => s.id === parseInt(fromStopIdStr));
          toStop = routeStops.find(s => s.id === parseInt(toStopIdStr));
        }

        if (!fromStop || !toStop) throw new Error('Selected stops do not belong to this trip\'s route');
        if (fromStop.stop_order >= toStop.stop_order) throw new Error('Boarding stop must come before dropping stop');

        segmentPrice = Number(toStop.price_from_source) - Number(fromStop.price_from_source);
      }

      const isOperator = req.user?.role === 'transport_operator';

      // 2. Release existing pending bookings by this user for the same seats (e.g. timeout / retry)
      if (req.user && booking_type === 'instant') {
        await tx.booking.updateMany({
          where: {
            trip_id: tripId,
            user_id: req.user.id,
            status: BookingStatus.pending,
            booking_type: BookingType.instant,
            seat_number: { in: seatsList }
          },
          data: { status: BookingStatus.cancelled }
        });
      }

      // 3. Check seat availability under lock
      const fromOrder = fromStop ? fromStop.stop_order : 1;
      const toOrder = toStop ? toStop.stop_order : 2;

      // Re-fetch bookings under transaction to check overlaps
      const activeBookings = await tx.booking.findMany({
        where: {
          trip_id: tripId,
          status: {
            in: [
              BookingStatus.pending,
              BookingStatus.approved,
              BookingStatus.paid,
              BookingStatus.waiting_confirmation
            ]
          }
        }
      });

      for (const seat of seatsList) {
        const seatBookings = activeBookings.filter(b => b.seat_number === seat);
        let isAvailable = true;

        for (const booking of seatBookings) {
          const exFrom = booking.from_stop_order;
          const exTo = booking.to_stop_order;
          if (exFrom === null || exTo === null) {
            isAvailable = false;
            break;
          }
          if (checkSegmentOverlap(exFrom, exTo, fromOrder, toOrder)) {
            isAvailable = false;
            break;
          }
        }

        if (!isAvailable) {
          throw new Error(`Seat ${seat} has just been booked by someone else. Please try another seat.`);
        }
      }

      const createdBookings: any[] = [];

      for (const seat of seatsList) {
        const seatInfo = seat_details[seat] || {};
        const sName = seatInfo.name || passenger_name;
        const sPhone = seatInfo.phone || passenger_phone;

        // Generate custom booking_ref
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let bookingRef = '';
        for (let i = 0; i < 8; i++) {
          bookingRef += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        const bData: any = {
          booking_ref: bookingRef,
          seat_number: seat,
          booking_type: booking_type as BookingType,
          price: segmentPrice,
          segment_price: segmentPrice,
          status: (booking_type === 'instant' && isOperator) ? BookingStatus.approved : (booking_type !== 'instant' ? BookingStatus.pending : BookingStatus.approved),
          trip_id: tripId,
          from_stop_order: fromOrder,
          to_stop_order: toOrder,
          qr_code_data: `BOOKING:${bookingRef}|TRIP:${tripId}|USER:${req.user?.id || 'MANUAL'}`
        };

        if (fromStop) bData.from_stop_id = fromStop.id;
        if (toStop) bData.to_stop_id = toStop.id;

        if (isOperator) {
          bData.passenger_name = sName || 'Manual Check-in';
          bData.passenger_phone = sPhone || '';
          bData.passenger_email = passenger_email || '';
        } else if (req.user) {
          bData.user_id = req.user.id;
          bData.passenger_name = sName || `${req.user.first_name} ${req.user.last_name}`.trim() || req.user.username;
          bData.passenger_phone = sPhone || req.user.phone || '';
          bData.passenger_email = req.user.email;
        }

        const bookingObj = await tx.booking.create({
          data: bData,
          include: {
            trip: { include: { route: true, vehicle: true } },
            from_stop: true,
            to_stop: true
          }
        });

        createdBookings.push(bookingObj);
      }

      return createdBookings;
    }, {
      maxWait: 15000,
      timeout: 30000
    });

    // Run emails outside of db transaction
    for (const b of result) {
      if (b.status === BookingStatus.approved || b.status === BookingStatus.paid) {
        sendBookingConfirmationEmail(b).catch(console.error);
      }
    }

    return res.status(201).json({
      message: 'Booking successful',
      bookings: result.map(formatBooking)
    });
  } catch (err: any) {
    console.error("CREATE BOOKING ERROR:", err);
    if (err.message.includes('booked')) {
      return res.status(409).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message });
  }
}

// 4. Start Trip
export async function startTrip(req: AuthRequest, res: Response) {
  const tripId = parseInt(req.params.id);
  if (!req.user) return res.sendStatus(401);

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { vehicle: true }
    });

    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.vehicle.operator_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const updated = await prisma.trip.update({
      where: { id: tripId },
      data: { status: TripStatus.departed }
    });

    await prisma.liveTripStatus.upsert({
      where: { trip_id: tripId },
      update: {},
      create: {
        trip_id: tripId,
        current_latitude: 0.0,
        current_longitude: 0.0,
        current_speed: 0.0
      }
    });

    return res.json({ message: 'Trip departed. Live tracking enabled.', status: updated.status });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 5. Stop Trip
export async function stopTrip(req: AuthRequest, res: Response) {
  const tripId = parseInt(req.params.id);
  if (!req.user) return res.sendStatus(401);

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { vehicle: true }
    });

    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.vehicle.operator_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const updated = await prisma.trip.update({
      where: { id: tripId },
      data: { status: TripStatus.completed }
    });

    return res.json({ message: 'Trip completed. Live tracking stopped.', status: updated.status });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 6. Update Location
export async function updateLocation(req: AuthRequest, res: Response) {
  const tripId = parseInt(req.params.id);
  const { lat, lng, speed, delay, next_stop_id } = req.body;
  if (!req.user) return res.sendStatus(401);

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { vehicle: true }
    });

    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.vehicle.operator_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    await prisma.liveTripStatus.upsert({
      where: { trip_id: tripId },
      update: {
        current_latitude: parseFloat(lat || 0),
        current_longitude: parseFloat(lng || 0),
        current_speed: parseFloat(speed || 0),
        delay_minutes: parseInt(delay || 0),
        ...(next_stop_id ? { next_stop_id: parseInt(next_stop_id) } : {})
      },
      create: {
        trip_id: tripId,
        current_latitude: parseFloat(lat || 0),
        current_longitude: parseFloat(lng || 0),
        current_speed: parseFloat(speed || 0),
        delay_minutes: parseInt(delay || 0),
        ...(next_stop_id ? { next_stop_id: parseInt(next_stop_id) } : {})
      }
    });

    return res.json({ status: 'success' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 7. Get Tracking
export async function getTracking(req: AuthRequest, res: Response) {
  const tripId = parseInt(req.params.id);
  if (!req.user) return res.sendStatus(401);

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { vehicle: true }
    });

    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    // Validate security: user has active booking or is operator/admin
    const hasBooking = await prisma.booking.findFirst({
      where: {
        trip_id: tripId,
        user_id: req.user.id,
        status: { in: [BookingStatus.approved, BookingStatus.paid, BookingStatus.pending, BookingStatus.waiting_confirmation] }
      }
    });

    const isOperator = trip.vehicle.operator_id === req.user.id || req.user.role === 'admin';

    if (!hasBooking && !isOperator) {
      return res.status(403).json({ error: 'You can only track trips you have booked' });
    }

    const liveStatus = await prisma.liveTripStatus.findUnique({
      where: { trip_id: tripId },
      include: { next_stop: true }
    });

    if (!liveStatus) {
      return res.status(404).json({ error: 'Live tracking not active for this trip' });
    }

    // Check if active (updated in last 15 mins)
    const lastUpdated = new Date(liveStatus.last_updated).getTime();
    const isActive = Date.now() - lastUpdated < 15 * 60 * 1000;

    return res.json({
      ...liveStatus,
      is_active: isActive
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 8. Get Bookings List (Own or Operator Vehicle Bookings)
export async function getBookingsList(req: AuthRequest, res: Response) {
  if (!req.user) return res.sendStatus(401);

  try {
    let bookings;
    if (req.user.role === 'transport_operator' || req.user.role === 'admin') {
      bookings = await prisma.booking.findMany({
        where: { trip: { vehicle: { operator_id: req.user.id } } },
        include: {
          trip: { include: { route: true, vehicle: true } },
          from_stop: true,
          to_stop: true
        },
        orderBy: { created_at: 'desc' }
      });
    } else {
      bookings = await prisma.booking.findMany({
        where: { user_id: req.user.id },
        include: {
          trip: { include: { route: true, vehicle: true } },
          from_stop: true,
          to_stop: true
        },
        orderBy: { created_at: 'desc' }
      });
    }

    return res.json(bookings.map(formatBooking));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 9. Get Single Booking by Ref
export async function getBookingByRef(req: AuthRequest, res: Response) {
  const { booking_ref } = req.params;
  if (!req.user) return res.sendStatus(401);

  try {
    const booking = await prisma.booking.findUnique({
      where: { booking_ref },
      include: {
        trip: {
          include: {
            route: {
              include: {
                stops: {
                  orderBy: {
                    stop_order: 'asc'
                  }
                }
              }
            },
            vehicle: true
          }
        },
        from_stop: true,
        to_stop: true
      }
    });

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Permissions check
    if (booking.user_id !== req.user.id && booking.trip.vehicle.operator_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    return res.json(formatBooking(booking));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 9b. Download Booking PDF (Public Endpoint)
export async function downloadBookingPdf(req: Request, res: Response) {
  const { booking_ref } = req.params;

  try {
    const booking = await prisma.booking.findUnique({
      where: { booking_ref },
      include: {
        trip: { include: { route: true, vehicle: true } },
        from_stop: true,
        to_stop: true
      }
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // 7-day expiry logic post trip date
    const tripDate = new Date(booking.trip.departure_datetime);
    const expiryDate = new Date(tripDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (new Date() > expiryDate) {
      return res.status(410).json({ error: 'Ticket expired. Access is only available up to 7 days after the trip.' });
    }

    const pdfBuffer = await generateTicketPdf(booking);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Ticket_${booking.booking_ref}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err: any) {
    console.error('Failed to generate PDF for download:', err);
    return res.status(500).json({ error: err.message });
  }
}

// 10. Resend Confirmation Email
export async function resendEmail(req: AuthRequest, res: Response) {
  const { booking_ref } = req.params;
  if (!req.user) return res.sendStatus(401);

  try {
    const booking = await prisma.booking.findUnique({
      where: { booking_ref },
      include: {
        trip: { include: { route: true, vehicle: true } },
        from_stop: true,
        to_stop: true
      }
    });

    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.user_id !== req.user.id && booking.trip.vehicle.operator_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const emailRes = await sendBookingConfirmationEmail(booking);
    if (emailRes.success) {
      return res.json({ message: 'Confirmation email resent successfully.' });
    } else {
      return res.status(500).json({ error: `Failed to send email: ${emailRes.message}` });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 11. Cancel Booking
export async function cancelBooking(req: AuthRequest, res: Response) {
  const { booking_ref } = req.params;
  const { refund_method, refund_upi_id, refund_bank_account, refund_bank_ifsc, refund_bank_name, refund_account_holder } = req.body;
  if (!req.user) return res.sendStatus(401);

  try {
    const booking = await prisma.booking.findUnique({
      where: { booking_ref },
      include: { trip: { include: { route: true, vehicle: true } } }
    });

    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.user_id !== req.user.id && booking.trip.vehicle.operator_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    if (booking.status === BookingStatus.cancelled) {
      return res.status(400).json({ error: 'Booking is already cancelled' });
    }

    let final_refund_method = refund_method;
    let final_upi_id = refund_upi_id;
    let final_bank_account = refund_bank_account;
    let final_bank_ifsc = refund_bank_ifsc;
    let final_bank_name = refund_bank_name;
    let final_account_holder = refund_account_holder;

    if (!final_refund_method) {
      // Find the user's saved profile payment details
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (user) {
        if (user.upi_id) {
          final_refund_method = 'upi';
          final_upi_id = user.upi_id;
        } else if (user.bank_account) {
          final_refund_method = 'bank';
          final_bank_account = user.bank_account;
          final_bank_ifsc = user.bank_ifsc;
          final_bank_name = user.bank_name;
          final_account_holder = user.account_holder;
        }
      }
    }

    if (final_refund_method === 'upi') {
      if (!final_upi_id) return res.status(400).json({ error: 'UPI ID is required for UPI refund' });
    } else if (final_refund_method === 'bank') {
      if (!final_bank_account || !final_bank_ifsc || !final_bank_name || !final_account_holder) {
        return res.status(400).json({ error: 'All bank details are required for bank transfer refund' });
      }
    } else {
      return res.status(400).json({ error: 'Invalid refund method. Choose "upi" or "bank".' });
    }

    const updated = await prisma.booking.update({
      where: { booking_ref },
      data: {
        status: BookingStatus.cancelled,
        refund_method: final_refund_method as RefundMethod,
        refund_upi_id: final_upi_id,
        refund_bank_account: final_bank_account,
        refund_bank_ifsc: final_bank_ifsc,
        refund_bank_name: final_bank_name,
        refund_account_holder: final_account_holder
      },
      include: {
        trip: { include: { route: true, vehicle: true } }
      }
    });

    // Send Cancellation Email
    try {
      const recipient = updated.passenger_email || req.user.email;
      if (recipient) {
        const transporter = nodemailer.createTransport({
          host: process.env.EMAIL_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.EMAIL_PORT || '587'),
          auth: {
            user: process.env.EMAIL_HOST_USER,
            pass: process.env.EMAIL_HOST_PASSWORD,
          }
        });
        await transporter.sendMail({
          from: process.env.DEFAULT_FROM_EMAIL || 'no-reply@neexplore.com',
          to: recipient,
          subject: `Booking Cancelled: REF ${updated.booking_ref}`,
          text: `Hello ${updated.passenger_name},\n\nYour booking request (ID: ${updated.booking_ref}) has been successfully cancelled.\nRefund method selected: ${updated.refund_method?.toUpperCase()}.\n\nRegards,\nNE Explore`
        });
      }
    } catch (mailErr) {
      console.error('Failed to send cancellation email:', mailErr);
    }

    return res.json({ message: 'Booking cancelled successfully. Refund request recorded.', booking: formatBooking(updated) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 12. Operator Dashboard Stats
export async function getOperatorDashboard(req: AuthRequest, res: Response) {
  if (!req.user) return res.sendStatus(401);

  try {
    const operatorProfile = await prisma.transportOperatorProfile.upsert({
      where: { user_id: req.user.id },
      update: {},
      create: {
        user_id: req.user.id,
        operator_name: `${req.user.username}'s Transport`
      }
    });

    const vehicles = await prisma.vehicle.findMany({
      where: { operator_id: req.user.id, is_active: true }
    });

    const upcomingTrips = await prisma.trip.findMany({
      where: {
        vehicle: { operator_id: req.user.id },
        status: { in: [TripStatus.scheduled, TripStatus.departed] }
      },
      include: { route: true, vehicle: true },
      orderBy: { departure_datetime: 'asc' }
    });

    const validStatuses = [BookingStatus.approved, BookingStatus.paid, BookingStatus.waiting_confirmation, BookingStatus.completed];
    const bookings = await prisma.booking.findMany({
      where: {
        trip: { vehicle: { operator_id: req.user.id } },
        status: { in: validStatuses }
      }
    });

    const totalRevenue = bookings.reduce((sum, b) => sum + Number(b.segment_price || b.price), 0);
    const totalPassengers = bookings.length;

    const recentBookings = await prisma.booking.findMany({
      where: { trip: { vehicle: { operator_id: req.user.id } } },
      include: {
        trip: { include: { route: true, vehicle: true } },
        from_stop: true,
        to_stop: true
      },
      orderBy: { created_at: 'desc' },
      take: 5
    });

    return res.json({
      operator_profile: operatorProfile,
      active_vehicles_count: vehicles.length,
      vehicles: vehicles,
      trips_count: upcomingTrips.length,
      trips: upcomingTrips.map(t => formatTrip(t)),
      total_revenue: totalRevenue,
      total_passengers: totalPassengers,
      recent_bookings: recentBookings.map(formatBooking)
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 13. Update Operator Profile
export async function updateOperatorProfile(req: AuthRequest, res: Response) {
  if (!req.user) return res.sendStatus(401);

  try {
    const profile = await prisma.transportOperatorProfile.update({
      where: { user_id: req.user.id },
      data: {
        operator_name: req.body.operator_name,
        phone: req.body.phone,
        address: req.body.address,
        upi_id: req.body.upi_id,
        bank_details: req.body.bank_details
      }
    });
    return res.json({ message: 'Profile updated successfully', operator_profile: profile });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 14. Get Operator Trip Passengers Manifest
export async function getOperatorTripPassengers(req: AuthRequest, res: Response) {
  const tripId = parseInt(req.params.trip_id);
  if (!req.user) return res.sendStatus(401);

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        vehicle: true,
        route: { include: { stops: { orderBy: { stop_order: 'asc' } } } },
        live_status: true
      }
    });

    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.vehicle.operator_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const bookings = await prisma.booking.findMany({
      where: { trip_id: tripId },
      include: {
        trip: { include: { route: true, vehicle: true } },
        from_stop: true,
        to_stop: true
      },
      orderBy: { seat_number: 'asc' }
    });

    return res.json({
      trip: formatTrip(trip),
      bookings: bookings.map(formatBooking),
      stops: trip.route.stops
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 15. Operator Booking Status Update
export async function updateOperatorBookingStatus(req: AuthRequest, res: Response) {
  const { booking_id } = req.params;
  const { status } = req.body;
  if (!req.user) return res.sendStatus(401);

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: booking_id },
      include: { trip: { include: { vehicle: true, route: true } } }
    });

    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.trip.vehicle.operator_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const updated = await prisma.booking.update({
      where: { id: booking_id },
      data: { status: status as BookingStatus },
      include: {
        trip: { include: { vehicle: true, route: true } },
        from_stop: true,
        to_stop: true,
        user: true
      }
    });

    // Send confirmation/rejection email
    const recipient = updated.passenger_email || updated.user?.email;
    if (recipient) {
      if (status === BookingStatus.approved) {
        sendBookingConfirmationEmail(updated).catch(console.error);
      } else if (status === BookingStatus.rejected) {
        try {
          const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.EMAIL_PORT || '587'),
            auth: {
              user: process.env.EMAIL_HOST_USER,
              pass: process.env.EMAIL_HOST_PASSWORD,
            }
          });
          await transporter.sendMail({
            from: process.env.DEFAULT_FROM_EMAIL || 'no-reply@neexplore.com',
            to: recipient,
            subject: `Booking Update: Trip to ${updated.trip.route.destination}`,
            text: `Hello,\n\nUnfortunately, your booking request (ID: ${updated.booking_ref}) has been rejected by the operator.\n\nRegards,\nNE Explore`
          });
        } catch (emailErr) {
          console.error('Failed to send rejection email:', emailErr);
        }
      }
    }

    return res.json({
      message: `Booking ${updated.booking_ref} status updated to ${status}`,
      booking: formatBooking(updated)
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 16. Operator Trip Creation (Daily / Recurring scheduling)
export async function createOperatorTrip(req: AuthRequest, res: Response) {
  const { route_id, vehicle_id, departure_datetime, is_daily, schedule_days = 30, additional_times = [] } = req.body;
  if (!req.user) return res.sendStatus(401);

  try {
    const profile = await prisma.transportOperatorProfile.findUnique({ where: { user_id: req.user.id } });
    if (!profile || profile.verification_status !== 'approved') {
      return res.status(403).json({ error: 'Operator account must be verified by an admin before scheduling trips' });
    }
    const route = await prisma.route.findFirst({
      where: { id: parseInt(route_id), operator_id: req.user.id }
    });
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: parseInt(vehicle_id), operator_id: req.user.id }
    });

    if (!route || !vehicle) {
      return res.status(404).json({ error: 'Route or Vehicle not found' });
    }

    const departureDt = new Date(departure_datetime);
    if (isNaN(departureDt.getTime())) {
      return res.status(400).json({ error: 'Invalid departure datetime format' });
    }

    const tripsCreated: any[] = [];

    if (is_daily) {
      const daysCount = parseInt(schedule_days);
      for (let i = 0; i < daysCount; i++) {
        const currentDate = new Date(departureDt);
        currentDate.setDate(departureDt.getDate() + i);

        // Main daily trip
        const mainTrip = await prisma.trip.create({
          data: {
            route_id: route.id,
            vehicle_id: vehicle.id,
            departure_datetime: currentDate,
            available_seats: vehicle.capacity,
            status: TripStatus.scheduled
          }
        });
        tripsCreated.push(mainTrip);

        // Additional hourly trips
        for (const timeStr of additional_times) {
          if (timeStr && timeStr.includes(':')) {
            const [h, m] = timeStr.split(':').map(Number);
            const extraDt = new Date(currentDate);
            extraDt.setHours(h, m, 0, 0);

            const extraTrip = await prisma.trip.create({
              data: {
                route_id: route.id,
                vehicle_id: vehicle.id,
                departure_datetime: extraDt,
                available_seats: vehicle.capacity,
                status: TripStatus.scheduled
              }
            });
            tripsCreated.push(extraTrip);
          }
        }
      }
    } else {
      const trip = await prisma.trip.create({
        data: {
          route_id: route.id,
          vehicle_id: vehicle.id,
          departure_datetime: departureDt,
          available_seats: vehicle.capacity,
          status: TripStatus.scheduled
        }
      });
      tripsCreated.push(trip);
    }

    return res.status(201).json({
      message: `Successfully created ${tripsCreated.length} trips.`,
      trips: tripsCreated
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 17. Operator Route Creation with stops
export async function createOperatorRoute(req: AuthRequest, res: Response) {
  const { source, destination, estimated_duration, base_price, stops = [] } = req.body;
  if (!req.user) return res.sendStatus(401);

  if (!source || !destination || !base_price) {
    return res.status(400).json({ error: 'source, destination, and base_price are required' });
  }

  try {
    const profile = await prisma.transportOperatorProfile.findUnique({ where: { user_id: req.user.id } });
    if (!profile || profile.verification_status !== 'approved') {
      return res.status(403).json({ error: 'Operator account must be verified by an admin before creating routes' });
    }
    const result = await prisma.$transaction(async (tx) => {
      const route = await tx.route.create({
        data: {
          operator_id: req.user!.id,
          source,
          destination,
          estimated_duration: estimated_duration || '',
          base_price: parseFloat(base_price)
        }
      });

      // 1. Source Stop (Order 1)
      await tx.routeStop.create({
        data: {
          route_id: route.id,
          stop_name: source,
          stop_order: 1,
          distance_from_start: 0.0,
          price_from_source: 0.0,
          arrival_time_offset: 0
        }
      });

      let currentOrder = 2;
      let maxDist = 0;

      // 2. Intermediate stops
      for (const stopInfo of stops) {
        const sName = stopInfo.name;
        const sDist = parseFloat(stopInfo.distance || 0);
        const sPrice = parseFloat(stopInfo.price || 0);
        const sOffsetMin = parseInt(stopInfo.time_offset_minutes || 0);

        await tx.routeStop.create({
          data: {
            route_id: route.id,
            stop_name: sName,
            stop_order: currentOrder,
            distance_from_start: sDist,
            price_from_source: sPrice,
            arrival_time_offset: sOffsetMin
          }
        });

        currentOrder++;
        maxDist = Math.max(maxDist, sDist);
      }

      // 3. Destination Stop (Last order)
      const destDist = maxDist > 0 ? maxDist + 20 : 50;
      await tx.routeStop.create({
        data: {
          route_id: route.id,
          stop_name: destination,
          stop_order: currentOrder,
          distance_from_start: destDist,
          price_from_source: parseFloat(base_price),
          arrival_time_offset: 300 // default 5 hours
        }
      });

      return tx.route.findUnique({
        where: { id: route.id },
        include: { stops: { orderBy: { stop_order: 'asc' } } }
      });
    });

    return res.status(201).json({
      message: 'Route and stops successfully created.',
      route: result
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 18. Vehicle ViewSet Actions
export async function getVehiclesList(req: AuthRequest, res: Response) {
  if (!req.user) return res.sendStatus(401);
  try {
    const list = await prisma.vehicle.findMany({ where: { operator_id: req.user.id } });
    return res.json(list);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function createVehicle(req: AuthRequest, res: Response) {
  if (!req.user) return res.sendStatus(401);
  const { name, vehicle_type, vehicle_number, capacity, driver_name, driver_contact } = req.body;

  try {
    const profile = await prisma.transportOperatorProfile.findUnique({ where: { user_id: req.user.id } });
    if (!profile || profile.verification_status !== 'approved') {
      return res.status(403).json({ error: 'Operator account must be verified by an admin before managing vehicles' });
    }
    const vehicle = await prisma.vehicle.create({
      data: {
        operator_id: req.user.id,
        name,
        vehicle_type: vehicle_type as VehicleType,
        vehicle_number,
        capacity: parseInt(capacity),
        driver_name,
        driver_contact
      }
    });
    return res.status(201).json(vehicle);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 19. Route ViewSet Actions
export async function getRoutesList(req: AuthRequest, res: Response) {
  if (!req.user) return res.sendStatus(401);
  try {
    const list = await prisma.route.findMany({
      where: { operator_id: req.user.id },
      include: { stops: { orderBy: { stop_order: 'asc' } } }
    });
    return res.json(list.map((r: any) => ({
      ...r,
      base_price: Number(r.base_price),
      stops: r.stops.map((s: any) => ({
        ...s,
        distance_from_start: Number(s.distance_from_start),
        price_from_source: Number(s.price_from_source)
      }))
    })));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function createRoute(req: AuthRequest, res: Response) {
  if (!req.user) return res.sendStatus(401);
  const { source, destination, estimated_duration, base_price } = req.body;

  try {
    const profile = await prisma.transportOperatorProfile.findUnique({ where: { user_id: req.user.id } });
    if (!profile || profile.verification_status !== 'approved') {
      return res.status(403).json({ error: 'Operator account must be verified by an admin before creating routes' });
    }
    const route = await prisma.route.create({
      data: {
        operator_id: req.user.id,
        source,
        destination,
        estimated_duration,
        base_price: parseFloat(base_price)
      }
    });
    return res.status(201).json({ ...route, base_price: Number(route.base_price) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function addStop(req: AuthRequest, res: Response) {
  const routeId = parseInt(req.params.id);
  const { stop_name, stop_order, distance_from_start, price_from_source, time_offset_minutes } = req.body;

  try {
    const targetOrder = parseInt(stop_order);

    const result = await prisma.$transaction(async (tx) => {
      // Shift orders of existing stops at or below target order
      const existingStops = await tx.routeStop.findMany({
        where: { route_id: routeId, stop_order: { gte: targetOrder } }
      });

      for (const stop of existingStops) {
        await tx.routeStop.update({
          where: { id: stop.id },
          data: { stop_order: stop.stop_order + 1 }
        });
      }

      await tx.routeStop.create({
        data: {
          route_id: routeId,
          stop_name,
          stop_order: targetOrder,
          distance_from_start: parseFloat(distance_from_start),
          price_from_source: parseFloat(price_from_source),
          arrival_time_offset: parseInt(time_offset_minutes || 0)
        }
      });

      return tx.route.findUnique({
        where: { id: routeId },
        include: { stops: { orderBy: { stop_order: 'asc' } } }
      });
    });

    return res.json({ message: `Stop '${stop_name}' added successfully`, route: result });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export async function deleteStop(req: AuthRequest, res: Response) {
  const routeId = parseInt(req.params.id);
  const { stop_id } = req.body;

  try {
    const stopId = parseInt(stop_id);
    await prisma.$transaction(async (tx) => {
      const stop = await tx.routeStop.findFirst({
        where: { id: stopId, route_id: routeId }
      });

      if (!stop) throw new Error('Stop not found');
      await tx.routeStop.delete({ where: { id: stopId } });

      // Re-order remaining stops
      const stops = await tx.routeStop.findMany({
        where: { route_id: routeId },
        orderBy: { stop_order: 'asc' }
      });

      for (let i = 0; i < stops.length; i++) {
        await tx.routeStop.update({
          where: { id: stops[i].id },
          data: { stop_order: i + 1 }
        });
      }
    });

    return res.json({ message: 'Stop deleted successfully' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

// 20. Operator Document Upload
export async function uploadDoc(req: AuthRequest, res: Response) {
  if (!req.user) return res.sendStatus(401);
  const { doc_type, file_name, file_content } = req.body;

  if (!doc_type || !file_name || !file_content) {
    return res.status(400).json({ error: 'doc_type, file_name, and file_content (base64) are required' });
  }

  try {
    const validTypes = ['licence', 'rc', 'vehicle_photo'];
    if (!validTypes.includes(doc_type)) {
      return res.status(400).json({ error: 'Invalid doc_type. Choose licence, rc, or vehicle_photo' });
    }

    const dirPath = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    let base64Data = file_content;
    if (file_content.includes(';base64,')) {
      base64Data = file_content.split(';base64,')[1];
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const ext = path.extname(file_name) || '.jpg';
    const uniqueName = `${doc_type}-${req.user.id}-${Date.now()}${ext}`;
    const filePath = path.join(dirPath, uniqueName);

    fs.writeFileSync(filePath, buffer);

    const publicUrl = `/uploads/${uniqueName}`;
    return res.status(200).json({ url: publicUrl });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 21. Operator Submit Verification
export async function submitVerification(req: AuthRequest, res: Response) {
  if (!req.user) return res.sendStatus(401);
  const {
    operator_name,
    phone,
    address,
    upi_id,
    bank_details,
    licence_url,
    rc_url,
    vehicle_photo_url,
    vehicle_name,
    vehicle_number,
    vehicle_type,
    vehicle_capacity
  } = req.body;

  try {
    if (!licence_url || !rc_url || !vehicle_photo_url) {
      return res.status(400).json({ error: 'All verification documents (Licence, RC, and Vehicle Photo) are required.' });
    }

    const profile = await prisma.transportOperatorProfile.upsert({
      where: { user_id: req.user.id },
      update: {
        operator_name: operator_name || `${req.user.username}'s Transport`,
        phone,
        address,
        upi_id,
        bank_details,
        licence_url,
        rc_url,
        vehicle_photo_url,
        verification_status: 'pending',
        admin_notes: null,
        submitted_at: new Date()
      },
      create: {
        user_id: req.user.id,
        operator_name: operator_name || `${req.user.username}'s Transport`,
        phone,
        address,
        upi_id,
        bank_details,
        licence_url,
        rc_url,
        vehicle_photo_url,
        verification_status: 'pending',
        submitted_at: new Date()
      }
    });

    if (vehicle_name && vehicle_number && vehicle_type && vehicle_capacity) {
      const existingVehicle = await prisma.vehicle.findUnique({
        where: { vehicle_number }
      });

      if (!existingVehicle) {
        await prisma.vehicle.create({
          data: {
            operator_id: req.user.id,
            name: vehicle_name,
            vehicle_type: vehicle_type as any,
            vehicle_number,
            capacity: parseInt(vehicle_capacity),
            driver_name: req.body.driver_name || operator_name || 'Driver',
            driver_contact: req.body.driver_contact || phone || '',
            is_active: false
          }
        });
      }
    }

    return res.status(200).json({ message: 'Verification details submitted successfully', operator_profile: profile });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 22. Admin Fetch Operator Profiles for Review
export async function getAdminOperatorProfiles(req: AuthRequest, res: Response) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const profiles = await prisma.transportOperatorProfile.findMany({
      include: {
        user: {
          select: {
            email: true,
            first_name: true,
            last_name: true
          }
        }
      },
      orderBy: { submitted_at: 'desc' }
    });

    const profilesWithVehicles = await Promise.all(profiles.map(async (profile) => {
      const vehicles = await prisma.vehicle.findMany({
        where: { operator_id: profile.user_id }
      });
      return {
        ...profile,
        vehicles
      };
    }));

    return res.json(profilesWithVehicles);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 23. Admin Review Operator Profile (Approve/Reject/Correction)
export async function reviewOperatorProfile(req: AuthRequest, res: Response) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { operator_id, status, admin_notes } = req.body;
  if (!operator_id || !status) {
    return res.status(400).json({ error: 'operator_id and status are required' });
  }

  const validStatuses = ['approved', 'correction_requested'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Choose approved or correction_requested' });
  }

  const operatorId = parseInt(operator_id);

  try {
    const profile = await prisma.transportOperatorProfile.findUnique({
      where: { user_id: operatorId }
    });

    if (!profile) {
      return res.status(404).json({ error: 'Operator profile not found' });
    }

    const updatedProfile = await prisma.$transaction(async (tx) => {
      const updated = await tx.transportOperatorProfile.update({
        where: { user_id: operatorId },
        data: {
          verification_status: status,
          admin_notes: status === 'correction_requested' ? admin_notes : null
        }
      });

      if (status === 'approved') {
        await tx.user.update({
          where: { id: operatorId },
          data: { is_verified: true }
        });

        await tx.vehicle.updateMany({
          where: { operator_id: operatorId },
          data: { is_active: true }
        });
      } else {
        await tx.vehicle.updateMany({
          where: { operator_id: operatorId },
          data: { is_active: false }
        });
      }

      return updated;
    });

    return res.json({ message: `Operator profile review completed. Status set to: ${status}`, operator_profile: updatedProfile });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 24. General User Profile Update
export async function updateProfile(req: AuthRequest, res: Response) {
  if (!req.user) return res.sendStatus(401);
  const { first_name, last_name, phone, upi_id, bank_account, bank_ifsc, bank_name, account_holder } = req.body;

  try {
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        first_name: first_name !== undefined ? first_name : req.user.first_name,
        last_name: last_name !== undefined ? last_name : req.user.last_name,
        phone: phone !== undefined ? phone : req.user.phone,
        upi_id: upi_id !== undefined ? upi_id : req.user.upi_id,
        bank_account: bank_account !== undefined ? bank_account : req.user.bank_account,
        bank_ifsc: bank_ifsc !== undefined ? bank_ifsc : req.user.bank_ifsc,
        bank_name: bank_name !== undefined ? bank_name : req.user.bank_name,
        account_holder: account_holder !== undefined ? account_holder : req.user.account_holder,
      }
    });

    return res.json({
      message: 'Profile updated successfully',
      user: {
        id: updated.id,
        email: updated.email,
        first_name: updated.first_name,
        last_name: updated.last_name,
        phone: updated.phone,
        role: updated.role,
        is_verified: updated.is_verified,
        upi_id: updated.upi_id,
        bank_account: updated.bank_account,
        bank_ifsc: updated.bank_ifsc,
        bank_name: updated.bank_name,
        account_holder: updated.account_holder
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 25. Get General User Profile
export async function getProfile(req: AuthRequest, res: Response) {
  if (!req.user) return res.sendStatus(401);
  return res.json({
    id: req.user.id,
    email: req.user.email,
    first_name: req.user.first_name,
    last_name: req.user.last_name,
    phone: req.user.phone,
    role: req.user.role,
    is_verified: req.user.is_verified,
    upi_id: req.user.upi_id,
    bank_account: req.user.bank_account,
    bank_ifsc: req.user.bank_ifsc,
    bank_name: req.user.bank_name,
    account_holder: req.user.account_holder
  });
}

// 26. Send Email Verification OTP
export async function sendOTP(req: Request, res: Response) {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  // Check for common typo domains to strictly restrict misspellings
  const domain = email.split('@')[1]?.toLowerCase();
  const typoDomains = ['gail.com', 'gamil.com', 'gmal.com', 'gmaill.com', 'gmil.com', 'gmail.co', 'gemail.com'];
  if (typoDomains.includes(domain)) {
    return res.status(400).json({ error: `It looks like you misspelled your email domain. Did you mean gmail.com?` });
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  // Set expiry to 10 minutes from now
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Store in database using upsert so we only have 1 active OTP per email at any time
  const emailKey = email.toLowerCase().trim();
  try {
    await prisma.registrationOTP.upsert({
      where: { email: emailKey },
      update: {
        otp,
        expires_at: expiresAt
      },
      create: {
        email: emailKey,
        otp,
        expires_at: expiresAt
      }
    });
  } catch (dbErr: any) {
    console.error('Failed to store OTP in database:', dbErr);
    return res.status(500).json({ error: 'Failed to generate verification code in database.' });
  }

  try {
    const emailHost = process.env.EMAIL_HOST || 'smtp.gmail.com';
    const emailPort = parseInt(process.env.EMAIL_PORT || '587');
    const emailUser = process.env.EMAIL_HOST_USER;
    const emailPassword = process.env.EMAIL_HOST_PASSWORD;
    const defaultFrom = process.env.DEFAULT_FROM_EMAIL || emailUser || 'no-reply@neexplore.com';

    if (!emailUser || !emailPassword) {
      console.warn('WARNING: Email SMTP credentials not configured. Logging OTP instead.');
      console.log(`[DEV OTP MOCK] To: ${email} | OTP: ${otp}`);
      return res.json({ message: 'OTP sent successfully (Mock Mode).' });
    }

    const transporter = nodemailer.createTransport({
      host: emailHost,
      port: emailPort,
      secure: emailPort === 465,
      auth: {
        user: emailUser,
        pass: emailPassword,
      },
    });

    const mailOptions = {
      from: defaultFrom,
      to: email,
      subject: 'NE Explore - Email Verification OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #4f46e5; text-align: center; margin-bottom: 24px;">Verify Your Email</h2>
          <p style="font-size: 16px; color: #333333; line-height: 1.5;">Hello,</p>
          <p style="font-size: 16px; color: #333333; line-height: 1.5;">Thank you for registering with <strong>NE Explore</strong>. Please use the following One-Time Password (OTP) to complete your registration:</p>
          <div style="text-align: center; margin: 30px 0;">
            <span style="display: inline-block; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #4f46e5; background-color: #f3f4f6; padding: 12px 30px; border-radius: 8px; border: 1px dashed #4f46e5;">${otp}</span>
          </div>
          <p style="font-size: 14px; color: #666666; line-height: 1.5; text-align: center;">This OTP is valid for <strong>10 minutes</strong>. Do not share this code with anyone.</p>
          <hr style="border: 0; border-top: 1px solid #eeeeee; margin: 30px 0;" />
          <p style="font-size: 12px; color: #999999; text-align: center; line-height: 1.5;">If you did not request this code, you can safely ignore this email.</p>
          <p style="font-size: 12px; color: #999999; text-align: center; font-weight: bold; margin-top: 10px;">NE Explore Tourism Team</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    return res.json({ message: 'OTP sent successfully.' });
  } catch (error: any) {
    console.error('Failed to send OTP email:', error);
    return res.status(500).json({ error: `Failed to send email: ${error.message}` });
  }
}

// 27. Verify Email Verification OTP
export async function verifyOTP(req: Request, res: Response) {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  const emailKey = email.toLowerCase().trim();
  const record = await prisma.registrationOTP.findUnique({
    where: { email: emailKey }
  });

  if (!record) {
    return res.status(400).json({ error: 'No OTP requested for this email. Please request a new OTP.' });
  }

  if (new Date() > record.expires_at) {
    await prisma.registrationOTP.delete({ where: { email: emailKey } }).catch(() => {});
    return res.status(400).json({ error: 'OTP has expired. Please request a new OTP.' });
  }

  if (record.otp !== otp.trim()) {
    return res.status(400).json({ error: 'Invalid OTP code. Please try again.' });
  }

  // OTP verified successfully. Remove it so it can't be reused.
  await prisma.registrationOTP.delete({ where: { email: emailKey } }).catch(() => {});
  return res.json({ success: true, message: 'OTP verified successfully.' });
}
