import nodemailer from 'nodemailer';
import { generateTicketPdf } from './pdf';

export async function sendBookingConfirmationEmail(booking: any): Promise<{ success: boolean; message: string }> {
  try {
    const emailHost = process.env.EMAIL_HOST || 'smtp.gmail.com';
    const emailPort = parseInt(process.env.EMAIL_PORT || '587');
    const emailUser = process.env.EMAIL_HOST_USER;
    const emailPassword = process.env.EMAIL_HOST_PASSWORD;
    const defaultFrom = process.env.DEFAULT_FROM_EMAIL || emailUser || 'no-reply@neexplore.com';

    const recipientEmail = booking.user?.email || booking.passenger_email;

    if (!recipientEmail) {
      return { success: false, message: 'No recipient email found' };
    }

    // Generate the PDF attachment
    const pdfBuffer = await generateTicketPdf(booking);

    if (!emailUser || !emailPassword) {
      console.warn('WARNING: Email SMTP credentials (EMAIL_HOST_USER, EMAIL_HOST_PASSWORD) not configured. Logging ticket email instead.');
      console.log(`[DEV EMAIL MOCK] To: ${recipientEmail} | Subject: Booking Confirmed - Ticket ${booking.booking_ref}`);
      return { success: true, message: 'Email logging successful (Mock Mode).' };
    }

    const transporter = nodemailer.createTransport({
      host: emailHost,
      port: emailPort,
      secure: emailPort === 465, // True for 465, false for others
      auth: {
        user: emailUser,
        pass: emailPassword,
      },
    });

    const depDate = new Date(booking.trip.departure_datetime);
    const formattedDate = depDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const mailOptions = {
      from: defaultFrom,
      to: recipientEmail,
      subject: `Booking Confirmed - Ticket ${booking.booking_ref}`,
      text: `Dear ${booking.passenger_name || 'Customer'},\n\nYour booking for '${booking.trip.route.source}' to '${booking.trip.route.destination}' is successfully confirmed!\n\nPlease find your E-Ticket attached to this email.\n\nBooking Ref: ${booking.booking_ref}\nSeat: ${booking.seat_number}\nDate: ${formattedDate}\n\nWarm Regards,\nNE Explore Tourism`,
      attachments: [
        {
          filename: `Ticket_${booking.booking_ref}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    };

    await transporter.sendMail(mailOptions);
    return { success: true, message: 'Email sent successfully.' };
  } catch (error: any) {
    console.error('Failed to send booking confirmation email:', error);
    return { success: false, message: error.message };
  }
}
