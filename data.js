// Clinic Data Store & LocalStorage Management

const DEFAULT_DOCTORS = [
  { id: 'doc-1', name: 'Dr. Sarah Jenkins', specialty: 'Cardiology', color: '#3b82f6', room: 'Suite 101', avatar: '👩‍⚕️' },
  { id: 'doc-2', name: 'Dr. Marcus Vance', specialty: 'Pediatrics', color: '#10b981', room: 'Suite 104', avatar: '👨‍⚕️' },
  { id: 'doc-3', name: 'Dr. Elena Rostova', specialty: 'Neurology', color: '#8b5cf6', room: 'Suite 202', avatar: '👩‍⚕️' },
  { id: 'doc-4', name: 'Dr. James Wilson', specialty: 'General Practice', color: '#f59e0b', room: 'Suite 108', avatar: '👨‍⚕️' }
];

const DEFAULT_PATIENTS = [
  { id: 'pat-1', name: 'Eleanor Vance', phone: '(555) 234-5678', email: 'eleanor.v@example.com', dob: '1988-04-12' },
  { id: 'pat-2', name: 'Michael Scott', phone: '(555) 876-5432', email: 'm.scott@example.com', dob: '1975-03-15' },
  { id: 'pat-3', name: 'Sophia Martinez', phone: '(555) 345-6789', email: 'sophia.m@example.com', dob: '1995-11-20' },
  { id: 'pat-4', name: 'David Miller', phone: '(555) 987-6543', email: 'dmiller@example.com', dob: '1982-08-05' },
  { id: 'pat-5', name: 'Emma Watson', phone: '(555) 456-7890', email: 'ewatson@example.com', dob: '1990-09-19' },
  { id: 'pat-6', name: 'Robert Chen', phone: '(555) 654-3210', email: 'rchen@example.com', dob: '1968-12-30' }
];

function getTodayString(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

const DEFAULT_APPOINTMENTS = [
  {
    id: 'apt-101',
    patientId: 'pat-1',
    patientName: 'Eleanor Vance',
    doctorId: 'doc-1',
    doctorName: 'Dr. Sarah Jenkins',
    date: getTodayString(0),
    startTime: '09:00',
    endTime: '09:30',
    reason: 'Routine Cardiac Checkup',
    status: 'BOOKED',
    cancellationFee: 0,
    cancellationReason: '',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    id: 'apt-102',
    patientId: 'pat-2',
    patientName: 'Michael Scott',
    doctorId: 'doc-1',
    doctorName: 'Dr. Sarah Jenkins',
    date: getTodayString(0),
    startTime: '10:00',
    endTime: '11:00',
    reason: 'ECG & Stress Test Evaluation',
    status: 'BOOKED',
    cancellationFee: 0,
    cancellationReason: '',
    createdAt: new Date(Date.now() - 86400000 * 1).toISOString()
  },
  {
    id: 'apt-103',
    patientId: 'pat-3',
    patientName: 'Sophia Martinez',
    doctorId: 'doc-2',
    doctorName: 'Dr. Marcus Vance',
    date: getTodayString(0),
    startTime: '09:30',
    endTime: '10:15',
    reason: 'Child Well-being Consultation',
    status: 'BOOKED',
    cancellationFee: 0,
    cancellationReason: '',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString()
  },
  {
    id: 'apt-104',
    patientId: 'pat-4',
    patientName: 'David Miller',
    doctorId: 'doc-3',
    doctorName: 'Dr. Elena Rostova',
    date: getTodayString(0),
    startTime: '11:00',
    endTime: '11:45',
    reason: 'Migraine Consultation',
    status: 'CANCELLED',
    cancellationFee: 500,
    cancellationFeeStatus: 'PENDING',
    cancellationReason: 'Cancelled 2 hours before appointment (Late Cancellation - ₹500)',
    cancelledAt: new Date(Date.now() - 7200000).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString()
  },
  {
    id: 'apt-105',
    patientId: 'pat-5',
    patientName: 'Emma Watson',
    doctorId: 'doc-4',
    doctorName: 'Dr. James Wilson',
    date: getTodayString(1),
    startTime: '14:00',
    endTime: '14:30',
    reason: 'Flu Symptoms & Prescription Refill',
    status: 'BOOKED',
    cancellationFee: 0,
    cancellationReason: '',
    createdAt: new Date().toISOString()
  },
  {
    id: 'apt-106',
    patientId: 'pat-6',
    patientName: 'Robert Chen',
    doctorId: 'doc-2',
    doctorName: 'Dr. Marcus Vance',
    date: getTodayString(0),
    startTime: '14:00',
    endTime: '14:45',
    reason: 'Vaccination Check',
    status: 'BOOKED',
    cancellationFee: 0,
    cancellationReason: '',
    createdAt: new Date().toISOString()
  }
];

class ClinicStore {
  constructor() {
    this.init();
  }

  init() {
    if (!localStorage.getItem('clinic_doctors')) {
      localStorage.setItem('clinic_doctors', JSON.stringify(DEFAULT_DOCTORS));
    }
    if (!localStorage.getItem('clinic_patients')) {
      localStorage.setItem('clinic_patients', JSON.stringify(DEFAULT_PATIENTS));
    }
    if (!localStorage.getItem('clinic_appointments')) {
      localStorage.setItem('clinic_appointments', JSON.stringify(DEFAULT_APPOINTMENTS));
    }
  }

  getDoctors() {
    return JSON.parse(localStorage.getItem('clinic_doctors') || '[]');
  }

  getPatients() {
    return JSON.parse(localStorage.getItem('clinic_patients') || '[]');
  }

  getAppointments() {
    return JSON.parse(localStorage.getItem('clinic_appointments') || '[]');
  }

  saveAppointments(appointments) {
    localStorage.setItem('clinic_appointments', JSON.stringify(appointments));
  }

  addAppointment(apt) {
    const appointments = this.getAppointments();
    appointments.push(apt);
    this.saveAppointments(appointments);
  }

  updateAppointment(updatedApt) {
    const appointments = this.getAppointments().map(a => a.id === updatedApt.id ? updatedApt : a);
    this.saveAppointments(appointments);
  }

  addPatient(patient) {
    const patients = this.getPatients();
    patients.push(patient);
    localStorage.setItem('clinic_patients', JSON.stringify(patients));
    return patient;
  }

  resetToDefault() {
    localStorage.setItem('clinic_doctors', JSON.stringify(DEFAULT_DOCTORS));
    localStorage.setItem('clinic_patients', JSON.stringify(DEFAULT_PATIENTS));
    localStorage.setItem('clinic_appointments', JSON.stringify(DEFAULT_APPOINTMENTS));
  }
}

const store = new ClinicStore();
