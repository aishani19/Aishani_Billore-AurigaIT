// Business Rules: Overlap Prevention & Cancellation Fee Calculations

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(mins) {
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
  Checks if proposed time range (startTime..endTime) overlaps with any existing booking for the doctor on date.
  Intervals [A_start, A_end) and [B_start, B_end) overlap if:
  A_start < B_end AND B_start < A_end
 */
function checkBookingConflict(doctorId, date, startTime, endTime, excludeAptId = null) {
  const appointments = store.getAppointments();
  const startMins = timeToMinutes(startTime);
  const endMins = timeToMinutes(endTime);

  if (startMins >= endMins) {
    return {
      hasConflict: true,
      reason: 'Invalid time range: Start time must be before end time.'
    };
  }

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const currentMins = now.getHours() * 60 + now.getMinutes();

  if (date < todayStr) {
    return {
      hasConflict: true,
      reason: 'Cannot book or reschedule appointments for past dates.'
    };
  }

  if (date === todayStr && startMins < currentMins) {
    return {
      hasConflict: true,
      reason: 'Cannot book or reschedule appointments for past times today.'
    };
  }

  const conflicting = appointments.find(apt => {
    if (apt.id === excludeAptId) return false;
    if (apt.status === 'CANCELLED') return false;
    if (apt.doctorId !== doctorId) return false;
    if (apt.date !== date) return false;

    const aptStart = timeToMinutes(apt.startTime);
    const aptEnd = timeToMinutes(apt.endTime);

    return startMins < aptEnd && aptStart < endMins;
  });

  if (conflicting) {
    return {
      hasConflict: true,
      conflictingAppointment: conflicting,
      reason: `Doctor is already booked with ${conflicting.patientName} (${conflicting.startTime} - ${conflicting.endTime}).`
    };
  }

  return { hasConflict: false };
}

/**
 * Calculates late cancellation fee in Rupees (₹).
 * Cancellation within 24 hours of appointment start time incurs a ₹500 fee.
 */
function evaluateCancellationFee(appointment, cancelDateTime = new Date()) {
  const aptStartDateTime = new Date(`${appointment.date}T${appointment.startTime}:00`);
  const hoursRemaining = (aptStartDateTime - cancelDateTime) / (1000 * 60 * 60);

  const LATE_FEE_HOURS_THRESHOLD = 24; // 24 hours notice
  const LATE_CANCELLATION_FEE = 500.00; // ₹500 fee

  if (hoursRemaining < LATE_FEE_HOURS_THRESHOLD) {
    return {
      isLate: true,
      fee: LATE_CANCELLATION_FEE,
      hoursRemaining: Math.round(hoursRemaining * 10) / 10,
      reason: hoursRemaining < 0 
        ? `Cancelled after scheduled time (₹${LATE_CANCELLATION_FEE} late fee)`
        : `Cancelled only ${Math.max(0, Math.round(hoursRemaining))} hours in advance (less than 24h threshold -> ₹${LATE_CANCELLATION_FEE} late fee)`
    };
  }

  return {
    isLate: false,
    fee: 0,
    hoursRemaining: Math.round(hoursRemaining * 10) / 10,
    reason: `Cancelled ${Math.round(hoursRemaining)} hours in advance (free cancellation)`
  };
}

/**
 * Returns available free time slots for a doctor on a given date.
 */
function getDoctorFreeSlots(doctorId, date, durationMins = 30) {
  const appointments = store.getAppointments().filter(a => a.doctorId === doctorId && a.date === date && a.status !== 'CANCELLED');
  const dayStart = 9 * 60; // 9:00 AM
  const dayEnd = 17 * 60;  // 5:00 PM
  
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const currentMins = now.getHours() * 60 + now.getMinutes();

  const freeSlots = [];
  for (let current = dayStart; current + durationMins <= dayEnd; current += 30) {
    const slotStart = current;
    const slotEnd = current + durationMins;

    if (date < todayStr) continue;
    if (date === todayStr && slotStart < currentMins) continue;
    const isConflict = appointments.some(apt => {
      const aptStart = timeToMinutes(apt.startTime);
      const aptEnd = timeToMinutes(apt.endTime);
      return slotStart < aptEnd && aptStart < slotEnd;
    });

    if (!isConflict) {
      freeSlots.push({
        startTime: minutesToTime(slotStart),
        endTime: minutesToTime(slotEnd)
      });
    }
  }
  return freeSlots;
}
