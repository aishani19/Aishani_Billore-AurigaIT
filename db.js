const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'clinic.db');
const db = new sqlite3.Database(DB_PATH);

function initDb() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Users table
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          role TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Doctors table
      db.run(`
        CREATE TABLE IF NOT EXISTS doctors (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          specialty TEXT NOT NULL,
          room TEXT NOT NULL,
          color TEXT NOT NULL,
          avatar TEXT NOT NULL
        )
      `);

      // Patients table
      db.run(`
        CREATE TABLE IF NOT EXISTS patients (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          phone TEXT NOT NULL,
          email TEXT,
          dob TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Appointments table
      db.run(`
        CREATE TABLE IF NOT EXISTS appointments (
          id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL,
          patient_name TEXT NOT NULL,
          doctor_id TEXT NOT NULL,
          doctor_name TEXT NOT NULL,
          date TEXT NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          reason TEXT,
          status TEXT NOT NULL DEFAULT 'BOOKED',
          cancellation_fee REAL DEFAULT 0,
          cancellation_fee_status TEXT DEFAULT 'FREE',
          cancellation_reason TEXT,
          reminder_status TEXT DEFAULT 'NOT_SENT',
          cancelled_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (patient_id) REFERENCES patients(id),
          FOREIGN KEY (doctor_id) REFERENCES doctors(id)
        )
      `);

      db.run(`ALTER TABLE appointments ADD COLUMN reminder_status TEXT DEFAULT 'NOT_SENT'`, (err) => {
        // Ignore duplicate column error if already exists
      });

      // Payments table
      db.run(`
        CREATE TABLE IF NOT EXISTS payments (
          id TEXT PRIMARY KEY,
          appointment_id TEXT NOT NULL,
          patient_id TEXT NOT NULL,
          patient_name TEXT NOT NULL,
          amount REAL NOT NULL,
          payment_method TEXT NOT NULL,
          transaction_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'SUCCESS',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (appointment_id) REFERENCES appointments(id),
          FOREIGN KEY (patient_id) REFERENCES patients(id)
        )
      `, (err) => {
        if (err) return reject(err);
        seedData().then(resolve).catch(reject);
      });
    });
  });
}

function getTodayString(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

async function seedData() {
  db.get('SELECT COUNT(*) as count FROM users', async (err, row) => {
    if (row && row.count === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      db.run('INSERT INTO users (id, username, password_hash, name, role) VALUES (?, ?, ?, ?, ?)',
        ['user-1', 'admin', hash, 'Front Desk Admin', 'RECEPTIONIST']
      );
    }
  });

  db.get('SELECT COUNT(*) as count FROM doctors', (err, row) => {
    if (row && row.count === 0) {
      const doctors = [
        ['doc-1', 'Dr. Sarah Jenkins', 'Cardiology', 'Suite 101', '#0284c7', '👩‍⚕️'],
        ['doc-2', 'Dr. Marcus Vance', 'Pediatrics', 'Suite 104', '#059669', '👨‍⚕️'],
        ['doc-3', 'Dr. Elena Rostova', 'Neurology', 'Suite 202', '#7c3aed', '👩‍⚕️'],
        ['doc-4', 'Dr. James Wilson', 'General Practice', 'Suite 108', '#d97706', '👨‍⚕️']
      ];
      const stmt = db.prepare('INSERT INTO doctors (id, name, specialty, room, color, avatar) VALUES (?, ?, ?, ?, ?, ?)');
      doctors.forEach(d => stmt.run(d));
      stmt.finalize();
    }
  });

  db.get('SELECT COUNT(*) as count FROM patients', (err, row) => {
    if (row && row.count === 0) {
      const patients = [
        ['pat-1', 'Eleanor Vance', '(555) 234-5678', 'eleanor.v@example.com', '1988-04-12'],
        ['pat-2', 'Michael Scott', '(555) 876-5432', 'm.scott@example.com', '1975-03-15'],
        ['pat-3', 'Sophia Martinez', '(555) 345-6789', 'sophia.m@example.com', '1995-11-20'],
        ['pat-4', 'David Miller', '(555) 987-6543', 'dmiller@example.com', '1982-08-05'],
        ['pat-5', 'Emma Watson', '(555) 456-7890', 'ewatson@example.com', '1990-09-19'],
        ['pat-6', 'Robert Chen', '(555) 654-3210', 'rchen@example.com', '1968-12-30']
      ];
      const stmt = db.prepare('INSERT INTO patients (id, name, phone, email, dob) VALUES (?, ?, ?, ?, ?)');
      patients.forEach(p => stmt.run(p));
      stmt.finalize();
    }
  });

  db.get('SELECT COUNT(*) as count FROM appointments', (err, row) => {
    if (row && row.count === 0) {
      const today = getTodayString(0);
      const tomorrow = getTodayString(1);

      const appointments = [
        ['apt-101', 'pat-1', 'Eleanor Vance', 'doc-1', 'Dr. Sarah Jenkins', today, '09:00', '09:30', 'Routine Cardiac Checkup', 'BOOKED', 0, 'FREE', '', null],
        ['apt-102', 'pat-2', 'Michael Scott', 'doc-1', 'Dr. Sarah Jenkins', today, '10:00', '11:00', 'ECG & Stress Test Evaluation', 'BOOKED', 0, 'FREE', '', null],
        ['apt-103', 'pat-3', 'Sophia Martinez', 'doc-2', 'Dr. Marcus Vance', today, '09:30', '10:15', 'Child Well-being Consultation', 'BOOKED', 0, 'FREE', '', null],
        ['apt-104', 'pat-4', 'David Miller', 'doc-3', 'Dr. Elena Rostova', today, '11:00', '11:45', 'Migraine Consultation', 'CANCELLED', 500, 'PENDING', 'Cancelled 2 hours before appointment (Late Cancellation - ₹500)', new Date().toISOString()],
        ['apt-105', 'pat-5', 'Emma Watson', 'doc-4', 'Dr. James Wilson', tomorrow, '14:00', '14:30', 'Flu Symptoms & Prescription Refill', 'BOOKED', 0, 'FREE', '', null],
        ['apt-106', 'pat-6', 'Robert Chen', 'doc-2', 'Dr. Marcus Vance', today, '14:00', '14:45', 'Vaccination Check', 'BOOKED', 0, 'FREE', '', null]
      ];
      const stmt = db.prepare(`
        INSERT INTO appointments 
        (id, patient_id, patient_name, doctor_id, doctor_name, date, start_time, end_time, reason, status, cancellation_fee, cancellation_fee_status, cancellation_reason, cancelled_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      appointments.forEach(a => stmt.run(a));
      stmt.finalize();
    }
  });
}

module.exports = { db, initDb };
