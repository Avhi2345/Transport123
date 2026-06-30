"""
Utility functions for segment-based seat booking logic.
Implements RedBus-style seat availability checking with overlap detection.
"""

def check_segment_overlap(existing_from, existing_to, requested_from, requested_to):
    """
    Check if two route segments overlap.
    
    Args:
        existing_from: Stop order where existing booking starts
        existing_to: Stop order where existing booking ends
        requested_from: Stop order where requested booking starts
        requested_to: Stop order where requested booking ends
    
    Returns:
        True if segments overlap (seat NOT available)
        False if no overlap (seat available)
    """
    # Handle edge case: if stops touch exactly, treat as no overlap
    if existing_to == requested_from or existing_from == requested_to:
        return False
    
    # Standard overlap check
    return existing_from < requested_to and existing_to > requested_from


def get_available_seats(trip, from_stop_order, to_stop_order):
    """
    Get list of available seat numbers for a specific route segment.
    """
    total_seats = trip.vehicle.capacity
    all_seats = [str(i) for i in range(1, total_seats + 1)]
    
    # Get all active bookings for this trip
    from .models import Booking
    active_bookings = Booking.objects.filter(
        trip=trip,
        status__in=['pending', 'approved', 'paid', 'waiting_confirmation']
    ).exclude(status='cancelled')
    
    available_seats = []
    
    for seat_num in all_seats:
        seat_bookings = active_bookings.filter(seat_number=seat_num)
        
        is_available = True
        for booking in seat_bookings:
            existing_from = booking.from_stop_order
            existing_to = booking.to_stop_order
            
            # Skip if booking doesn't have segment info (legacy bookings)
            if existing_from is None or existing_to is None:
                is_available = False
                break
            
            # Check overlap
            if check_segment_overlap(existing_from, existing_to, from_stop_order, to_stop_order):
                is_available = False
                break
        
        if is_available:
            available_seats.append(seat_num)
    
    return available_seats


def get_booked_seats(trip, from_stop_order, to_stop_order):
    """
    Get list of booked (unavailable) seat numbers for a specific route segment.
    """
    total_seats = trip.vehicle.capacity
    all_seats = [str(i) for i in range(1, total_seats + 1)]
    available = get_available_seats(trip, from_stop_order, to_stop_order)
    
    return [seat for seat in all_seats if seat not in available]


def calculate_segment_price(from_stop, to_stop):
    """
    Calculate price for a route segment based on cumulative pricing.
    """
    if not from_stop or not to_stop:
        return 0
    
    return to_stop.price_from_source - from_stop.price_from_source


def validate_booking_segment(trip, from_stop, to_stop):
    """
    Validate that a booking segment is valid.
    """
    if not from_stop or not to_stop:
        return False, "Both boarding and dropping stops must be selected"
    
    if from_stop.route_id != trip.route_id or to_stop.route_id != trip.route_id:
        return False, "Selected stops do not belong to this trip's route"
    
    if from_stop.stop_order >= to_stop.stop_order:
        return False, "Boarding stop must come before dropping stop"
    
    return True, ""


def generate_ticket_pdf(booking):
    """
    Generates a PDF ticket for the given booking using ReportLab.
    Returns: BytesIO buffer containing the PDF.
    """
    from io import BytesIO
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import inch
    from reportlab.lib import colors
    import qrcode

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    # Header
    c.setFont("Helvetica-Bold", 24)
    c.setFillColor(colors.darkgreen)
    c.drawString(1 * inch, height - 1 * inch, "NE EXPLORE")
    
    c.setFont("Helvetica", 12)
    c.setFillColor(colors.black)
    c.drawString(1 * inch, height - 1.25 * inch, "Electronic Ticket / E-Ticket")
    
    c.setLineWidth(1)
    c.line(1 * inch, height - 1.4 * inch, width - 1 * inch, height - 1.4 * inch)

    # Booking Details (Left Side)
    y_pos = height - 2 * inch
    c.setFont("Helvetica-Bold", 14)
    c.drawString(1 * inch, y_pos, f"Booking Ref: {booking.booking_ref}")
    
    y_pos -= 0.4 * inch
    c.setFont("Helvetica", 12)
    c.drawString(1 * inch, y_pos, f"Status: {booking.get_status_display()}")

    y_pos -= 0.6 * inch
    c.setFont("Helvetica-Bold", 14)
    c.drawString(1 * inch, y_pos, "Trip Details")
    
    trip = booking.trip
    y_pos -= 0.3 * inch
    c.setFont("Helvetica", 12)
    c.drawString(1 * inch, y_pos, f"Route: {trip.route.source} to {trip.route.destination}")
    y_pos -= 0.25 * inch
    c.drawString(1 * inch, y_pos, f"Date: {trip.departure_datetime.strftime('%d %B %Y')}")
    y_pos -= 0.25 * inch
    c.drawString(1 * inch, y_pos, f"Time: {trip.departure_datetime.strftime('%I:%M %p')}")
    
    # Segment info if available
    if booking.from_stop and booking.to_stop:
        y_pos -= 0.25 * inch
        c.setFont("Helvetica-Oblique", 11)
        c.drawString(1 * inch, y_pos, f"Boarding: {booking.from_stop.stop_name}")
        y_pos -= 0.25 * inch
        c.drawString(1 * inch, y_pos, f"Dropping: {booking.to_stop.stop_name}")
        c.setFont("Helvetica", 12)

    y_pos -= 0.4 * inch
    c.setFont("Helvetica-Bold", 14)
    c.drawString(1 * inch, y_pos, "Vehicle & Driver")
    y_pos -= 0.3 * inch
    c.setFont("Helvetica", 12)
    c.drawString(1 * inch, y_pos, f"Vehicle: {trip.vehicle.name} ({trip.vehicle.vehicle_number})")
    y_pos -= 0.25 * inch
    c.drawString(1 * inch, y_pos, f"Driver: {trip.vehicle.driver_name} ({trip.vehicle.driver_contact})")

    # Passenger Details
    y_pos -= 0.4 * inch
    c.setFont("Helvetica-Bold", 14)
    c.drawString(1 * inch, y_pos, "Passenger Info")
    y_pos -= 0.3 * inch
    c.setFont("Helvetica", 12)
    passenger_name = booking.passenger_name or (booking.user.first_name if booking.user else "N/A")
    c.drawString(1 * inch, y_pos, f"Name: {passenger_name}")
    y_pos -= 0.25 * inch
    c.drawString(1 * inch, y_pos, f"Seat Number: {booking.seat_number}")
    y_pos -= 0.25 * inch
    if booking.passenger_phone:
        c.drawString(1 * inch, y_pos, f"Phone: {booking.passenger_phone}")

    # QR Code (Right Side)
    qr = qrcode.QRCode(box_size=10, border=1)
    if booking.qr_code_data:
        qr_data = booking.qr_code_data
    else:
        qr_data = f"BOOKING:{booking.booking_ref}|TRIP:{trip.id}|SEAT:{booking.seat_number}"
    
    qr.add_data(qr_data)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")
    
    from reportlab.lib.utils import ImageReader
    qr_buffer = BytesIO()
    qr_img.save(qr_buffer, format="PNG")  # type: ignore
    qr_buffer.seek(0)
    
    qr_size = 2.5 * inch
    qr_x = width - 1 * inch - qr_size
    qr_y = height - 4.5 * inch
    c.drawImage(ImageReader(qr_buffer), qr_x, qr_y, width=qr_size, height=qr_size)
    
    c.setFont("Helvetica", 10)
    c.drawCentredString(qr_x + qr_size/2, qr_y - 0.2 * inch, "Scan to Verify")

    # Footer
    c.line(1 * inch, 2 * inch, width - 1 * inch, 2 * inch)
    c.setFont("Helvetica-Oblique", 10)
    c.drawCentredString(width / 2, 1.5 * inch, "Please arrive 15 minutes before departure.")
    c.drawCentredString(width / 2, 1.25 * inch, "Show this E-Ticket to the driver/operator.")
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(width / 2, 1 * inch, "Safe Travels with NE Explore!")

    c.showPage()
    c.save()
    
    buffer.seek(0)
    return buffer


def send_booking_confirmation_email(request, booking):
    """Helper to generate PDF Ticket and send email. Returns (success, error_message)"""
    from django.core.mail import EmailMessage

    try:
        trip = booking.trip
        
        # 1. Generate PDF Ticket
        pdf_buffer = generate_ticket_pdf(booking)
        pdf_content = pdf_buffer.getvalue()
        
        # 2. Prepare Email Content
        subject = f"Booking Confirmed - Ticket {booking.booking_ref}"
        passenger_greeting_name = booking.passenger_name or (booking.user.first_name if booking.user else 'Customer')
        message_body = f"""
        Dear {passenger_greeting_name},

        Your booking for '{trip.route.source}' to '{trip.route.destination}' is successfully confirmed!
        
        Please find your E-Ticket attached to this email.
        
        Booking Ref: {booking.booking_ref}
        Seat: {booking.seat_number}
        Date: {trip.departure_datetime.strftime('%d %b %Y')}
        
        Warm Regards,
        NE Explore Tourism
        """
        
        from django.conf import settings
        
        # Determine Recipient Email
        recipient_email = booking.user.email if (booking.user and booking.user.email) else booking.passenger_email
        
        if recipient_email:
            email = EmailMessage(
                subject,
                message_body,
                settings.DEFAULT_FROM_EMAIL, # From
                [recipient_email], # To
            )
            
            # Attach PDF
            filename = f"Ticket_{booking.booking_ref}.pdf"
            email.attach(filename, pdf_content, 'application/pdf')
            
            email.send(fail_silently=False)
            return True, "Email sent successfully."
        else:
             return False, "No recipient email found."
    
    except Exception as e:
        print(f"Email Error: {e}")
        return False, str(e)
