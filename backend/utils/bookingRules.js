function hasExistingBookingForDate(existingBookings, bookingDate) {
  return existingBookings.some((booking) => {
    if (!booking || !booking.BookingDate) {
      return false;
    }

    const isSameDate = booking.BookingDate === bookingDate;
    const isActive = ['pending', 'approved'].includes(booking.Status);

    return isSameDate && isActive;
  });
}

module.exports = { hasExistingBookingForDate };
