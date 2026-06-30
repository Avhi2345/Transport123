import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export async function generateTicketPdf(booking: any): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers: Buffer[] = [];
      
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', (err) => reject(err));

      // Header Brand Logo
      doc.fillColor('darkgreen')
         .fontSize(24)
         .font('Helvetica-Bold')
         .text('NE EXPLORE', 50, 50);
      
      doc.fillColor('black')
         .fontSize(12)
         .font('Helvetica')
         .text('Electronic Ticket / E-Ticket', 50, 80);
      
      // Decorative Divider line
      doc.moveTo(50, 100).lineTo(545, 100).stroke();

      // Booking Reference (Left Side)
      let y = 130;
      doc.fontSize(14).font('Helvetica-Bold').text(`Booking Ref: ${booking.booking_ref}`, 50, y);
      y += 25;
      doc.fontSize(12).font('Helvetica').text(`Status: ${booking.status.toUpperCase()}`, 50, y);
      y += 35;

      // Trip Information
      doc.fontSize(14).font('Helvetica-Bold').text('Trip Details', 50, y);
      y += 20;
      doc.fontSize(12).font('Helvetica').text(`Route: ${booking.trip.route.source} to ${booking.trip.route.destination}`, 50, y);
      y += 18;
      
      const depDate = new Date(booking.trip.departure_datetime);
      const formattedDate = depDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const formattedTime = depDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      
      doc.text(`Date: ${formattedDate}`, 50, y);
      y += 18;
      doc.text(`Time: ${formattedTime}`, 50, y);
      y += 18;

      if (booking.from_stop && booking.to_stop) {
        doc.font('Helvetica-Oblique').fontSize(11).text(`Boarding: ${booking.from_stop.stop_name}`, 50, y);
        y += 18;
        doc.text(`Dropping: ${booking.to_stop.stop_name}`, 50, y);
        y += 20;
        doc.font('Helvetica').fontSize(12);
      }

      // Vehicle and Driver Details
      doc.fontSize(14).font('Helvetica-Bold').text('Vehicle & Driver', 50, y);
      y += 20;
      doc.fontSize(12).font('Helvetica').text(`Vehicle: ${booking.trip.vehicle.name} (${booking.trip.vehicle.vehicle_number})`, 50, y);
      y += 18;
      doc.text(`Driver: ${booking.trip.vehicle.driver_name} (${booking.trip.vehicle.driver_contact})`, 50, y);
      y += 30;

      // Passenger Details
      doc.fontSize(14).font('Helvetica-Bold').text('Passenger Info', 50, y);
      y += 20;
      doc.fontSize(12).font('Helvetica').text(`Name: ${booking.passenger_name || 'N/A'}`, 50, y);
      y += 18;
      doc.text(`Seat Number: ${booking.seat_number}`, 50, y);
      y += 18;
      if (booking.passenger_phone) {
        doc.text(`Phone: ${booking.passenger_phone}`, 50, y);
      }

      // QR Code Render on the right side
      try {
        const qrData = booking.qr_code_data || `BOOKING:${booking.booking_ref}|TRIP:${booking.trip.id}|SEAT:${booking.seat_number}`;
        const qrBuffer = await QRCode.toBuffer(qrData, { width: 160, margin: 1 });
        doc.image(qrBuffer, 380, 130, { width: 160 });
        doc.fontSize(10).text('Scan to Verify', 380, 300, { width: 160, align: 'center' });
      } catch (qrErr) {
        console.error('Failed to generate QR Code for PDF:', qrErr);
      }

      // Page Footer
      doc.moveTo(50, 700).lineTo(545, 700).stroke();
      doc.fontSize(10).font('Helvetica-Oblique').text('Please arrive 15 minutes before departure.', 50, 715, { align: 'center', width: 495 });
      doc.text('Show this E-Ticket to the driver/operator.', 50, 730, { align: 'center', width: 495 });
      doc.fontSize(12).font('Helvetica-Bold').text('Safe Travels with NE Explore!', 50, 750, { align: 'center', width: 495 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
