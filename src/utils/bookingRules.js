export function hasExistingBookingForDate(userBookings, date) {
  return userBookings.some(
    booking => booking.BookingDate === date && 
    (booking.Status === 'pending' || booking.Status === 'approved')
  );
}
