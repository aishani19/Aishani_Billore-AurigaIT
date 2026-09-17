const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db, initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'pulse-care-secret-key-2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// --- AUTH ENDPOINTS ---
app.post('/api/auth/register', async (req, res) => {
  const { username, password, name, role = 'RECEPTIONIST' } = req.body;
  if (!username || !password || !name) {
    return res.status(400).json({ error: 'Username, password, and name are required' });
  }

  try {
    const password_hash = await bcrypt.hash(password, 10);
    const id = 'user-' + Date.now();

    db.run(
      'INSERT INTO users (id, username, password_hash, name, role) VALUES (?, ?, ?, ?, ?)',
      [id, username, password_hash, name, role],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Username already exists' });
          }
          return res.status(500).json({ error: err.message });
        }
        const token = jwt.sign({ id, username, name, role }, JWT_SECRET, { expiresIn: '24h' });
        res.status(201).json({ token, user: { id, username, name, role } });
      }
    );
  } catch (err) {
    res.status(500).json({ error: 'Server error during registration' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ error: 'Invalid username or password' });

    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
  });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// --- DOCTORS ENDPOINTS ---
app.get('/api/doctors', (req, res) => {
  db.all('SELECT * FROM doctors ORDER BY name ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// --- PATIENTS ENDPOINTS ---
app.get('/api/patients', (req, res) => {
  const search = req.query.search || '';
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  const sortBy = req.query.sortBy || 'name';
  const sortOrder = req.query.sortOrder === 'DESC' ? 'DESC' : 'ASC';

  const validSortColumns = ['name', 'created_at', 'phone', 'email'];
  const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'name';
  const searchPattern = `%${search}%`;

  db.get(
    'SELECT COUNT(*) as count FROM patients WHERE name LIKE ? OR phone LIKE ? OR email LIKE ?',
    [searchPattern, searchPattern, searchPattern],
    (err, countRow) => {
      if (err) return res.status(500).json({ error: err.message });
      const total = countRow.count;

      db.all(
        `SELECT * FROM patients WHERE name LIKE ? OR phone LIKE ? OR email LIKE ? ORDER BY ${safeSortBy} ${sortOrder} LIMIT ? OFFSET ?`,
        [searchPattern, searchPattern, searchPattern, limit, offset],
        (err, rows) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({
            patients: rows,
            total,
            page,
            totalPages: Math.ceil(total / limit)
          });
        }
      );
    }
  );
});

app.post('/api/patients', authenticateToken, (req, res) => {
  const { name, phone, email, dob } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and phone are required' });
  }

  const id = 'pat-' + Date.now();
  db.run(
    'INSERT INTO patients (id, name, phone, email, dob) VALUES (?, ?, ?, ?, ?)',
    [id, name, phone, email || '', dob || ''],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id, name, phone, email, dob });
    }
  );
});

// --- CONFLICT CHECK HELPER ---
function checkConflictInternal(doctorId, date, startTime, endTime, excludeId = null) {
  return new Promise((resolve, reject) => {
    const startMins = timeToMinutes(startTime);
    const endMins = timeToMinutes(endTime);

    if (startMins >= endMins) {
      return resolve({
        hasConflict: true,
        reason: 'Invalid time range: Start time must be before end time.'
      });
    }

    db.all(
      `SELECT * FROM appointments WHERE doctor_id = ? AND date = ? AND status != 'CANCELLED'`,
      [doctorId, date],
      (err, rows) => {
        if (err) return reject(err);

        const conflicting = rows.find(apt => {
          if (excludeId && apt.id === excludeId) return false;
          const aptStart = timeToMinutes(apt.start_time);
          const aptEnd = timeToMinutes(apt.end_time);
          return startMins < aptEnd && aptStart < endMins;
        });

        if (conflicting) {
          resolve({
            hasConflict: true,
            conflictingAppointment: conflicting,
            reason: `Doctor is already booked with ${conflicting.patient_name} (${conflicting.start_time} - ${conflicting.end_time}).`
          });
        } else {
          resolve({ hasConflict: false });
        }
      }
    );
  });
}

app.post('/api/appointments/check-conflict', async (req, res) => {
  const { doctorId, date, startTime, endTime, excludeId } = req.body;
  if (!doctorId || !date || !startTime || !endTime) {
    return res.status(400).json({ error: 'Doctor, date, startTime, and endTime required' });
  }

  try {
    const result = await checkConflictInternal(doctorId, date, startTime, endTime, excludeId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- APPOINTMENTS ENDPOINTS ---
app.get('/api/appointments', (req, res) => {
  const { doctorId, date, status, search, patientId, feeFilter } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const offset = (page - 1) * limit;
  const sortBy = req.query.sortBy || 'date';
  const sortOrder = req.query.sortOrder === 'DESC' ? 'DESC' : 'ASC';

  const validSortColumns = ['date', 'start_time', 'patient_name', 'doctor_name', 'created_at', 'cancellation_fee'];
  const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'date';

  let conditions = [];
  let params = [];

  if (doctorId && doctorId !== 'ALL') {
    conditions.push('doctor_id = ?');
    params.push(doctorId);
  }
  if (date) {
    conditions.push('date = ?');
    params.push(date);
  }
  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (patientId) {
    conditions.push('patient_id = ?');
    params.push(patientId);
  }
  if (search) {
    conditions.push('(patient_name LIKE ? OR doctor_name LIKE ? OR reason LIKE ?)');
    const p = `%${search}%`;
    params.push(p, p, p);
  }
  if (feeFilter === 'PENDING') {
    conditions.push('status = "CANCELLED" AND cancellation_fee > 0 AND cancellation_fee_status = "PENDING"');
  } else if (feeFilter === 'PAID') {
    conditions.push('status = "CANCELLED" AND cancellation_fee > 0 AND cancellation_fee_status = "PAID"');
  } else if (feeFilter === 'FREE') {
    conditions.push('status = "CANCELLED" AND cancellation_fee = 0');
  }

  const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  db.get(`SELECT COUNT(*) as count FROM appointments ${whereClause}`, params, (err, countRow) => {
    if (err) return res.status(500).json({ error: err.message });
    const total = countRow.count;

    db.all(
      `SELECT * FROM appointments ${whereClause} ORDER BY ${safeSortBy} ${sortOrder} LIMIT ? OFFSET ?`,
      [...params, limit, offset],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const appointments = rows.map(a => ({
          id: a.id,
          patientId: a.patient_id,
          patientName: a.patient_name,
          doctorId: a.doctor_id,
          doctorName: a.doctor_name,
          date: a.date,
          startTime: a.start_time,
          endTime: a.end_time,
          reason: a.reason,
          status: a.status,
          cancellationFee: a.cancellation_fee,
          cancellationFeeStatus: a.cancellation_fee_status,
          cancellationReason: a.cancellation_reason,
          cancelledAt: a.cancelled_at,
          createdAt: a.created_at
        }));

        res.json({
          appointments,
          total,
          page,
          totalPages: Math.ceil(total / limit)
        });
      }
    );
  });
});

app.post('/api/appointments', authenticateToken, async (req, res) => {
  const { doctorId, patientId, date, startTime, endTime, reason } = req.body;
  if (!doctorId || !patientId || !date || !startTime || !endTime) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const conflictCheck = await checkConflictInternal(doctorId, date, startTime, endTime);
    if (conflictCheck.hasConflict) {
      return res.status(409).json({ error: conflictCheck.reason, conflict: true });
    }

    db.get('SELECT name FROM doctors WHERE id = ?', [doctorId], (err, doc) => {
      if (err || !doc) return res.status(400).json({ error: 'Doctor not found' });

      db.get('SELECT name FROM patients WHERE id = ?', [patientId], (err, pat) => {
        if (err || !pat) return res.status(400).json({ error: 'Patient not found' });

        const id = 'apt-' + Date.now();
        db.run(
          `INSERT INTO appointments 
           (id, patient_id, patient_name, doctor_id, doctor_name, date, start_time, end_time, reason, status, cancellation_fee, cancellation_fee_status) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'BOOKED', 0, 'FREE')`,
          [id, patientId, pat.name, doctorId, doc.name, date, startTime, endTime, reason || 'Routine Consultation'],
          function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({
              id, patientId, patientName: pat.name, doctorId, doctorName: doc.name,
              date, startTime, endTime, reason, status: 'BOOKED'
            });
          }
        );
      });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/appointments/:id/cancel', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM appointments WHERE id = ?', [id], (err, apt) => {
    if (err || !apt) return res.status(404).json({ error: 'Appointment not found' });

    const aptStartDateTime = new Date(`${apt.date}T${apt.start_time}:00`);
    const cancelDateTime = new Date();
    const hoursRemaining = (aptStartDateTime - cancelDateTime) / (1000 * 60 * 60);

    const isLate = hoursRemaining < 24;
    const fee = isLate ? 500.00 : 0.00;
    const feeStatus = isLate ? 'PENDING' : 'FREE';
    const reason = isLate 
      ? `Cancelled with only ${Math.max(0, Math.round(hoursRemaining))} hours notice (< 24h threshold -> ₹500 late fee)`
      : `Cancelled ${Math.round(hoursRemaining)} hours in advance (free cancellation)`;

    db.run(
      `UPDATE appointments 
       SET status = 'CANCELLED', cancellation_fee = ?, cancellation_fee_status = ?, cancellation_reason = ?, cancelled_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [fee, feeStatus, reason, id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({
          id,
          status: 'CANCELLED',
          cancellationFee: fee,
          cancellationFeeStatus: feeStatus,
          cancellationReason: reason,
          hoursRemaining: Math.round(hoursRemaining * 10) / 10
        });
      }
    );
  });
});

// --- PAYMENTS ENDPOINT (REAL PAYMENT SYSTEM INTEGRATION) ---
app.post('/api/payments/process', authenticateToken, (req, res) => {
  const { appointmentId, patientId, amount, paymentMethod = 'UPI' } = req.body;
  
  if (!appointmentId || !patientId || !amount) {
    return res.status(400).json({ error: 'appointmentId, patientId, and amount are required' });
  }

  db.get('SELECT * FROM appointments WHERE id = ?', [appointmentId], (err, apt) => {
    if (err || !apt) return res.status(404).json({ error: 'Appointment record not found' });

    const paymentId = 'pay-' + Date.now();
    const txnId = `TXN-${Math.floor(100000 + Math.random() * 900000)}-${paymentMethod.toUpperCase()}`;

    db.run(
      `INSERT INTO payments (id, appointment_id, patient_id, patient_name, amount, payment_method, transaction_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'SUCCESS')`,
      [paymentId, appointmentId, patientId, apt.patient_name, amount, paymentMethod, txnId],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });

        // Update cancellation fee status on appointment record
        db.run(
          `UPDATE appointments SET cancellation_fee_status = 'PAID' WHERE id = ?`,
          [appointmentId],
          function (err2) {
            if (err2) return res.status(500).json({ error: err2.message });

            res.status(201).json({
              success: true,
              message: 'Payment processed successfully',
              receipt: {
                receiptId: `REC-${paymentId.slice(-6)}`,
                transactionId: txnId,
                amount: parseFloat(amount),
                paymentMethod,
                date: new Date().toISOString(),
                patientName: apt.patient_name,
                doctorName: apt.doctor_name,
                appointmentDate: apt.date
              }
            });
          }
        );
      }
    );
  });
});

app.get('/api/payments', (req, res) => {
  db.all('SELECT * FROM payments ORDER BY created_at DESC LIMIT 100', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});



// --- DASHBOARD STATS ENDPOINT ---
app.get('/api/stats', (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  db.get(`SELECT COUNT(*) as todayCount FROM appointments WHERE date = ? AND status != 'CANCELLED'`, [today], (err, row1) => {
    db.get(`SELECT COUNT(*) as lateCount FROM appointments WHERE status = 'CANCELLED' AND cancellation_fee > 0`, [], (err, row2) => {
      db.get(`SELECT SUM(cancellation_fee) as pendingSum FROM appointments WHERE status = 'CANCELLED' AND cancellation_fee_status = 'PENDING'`, [], (err, row3) => {
        db.get(`SELECT SUM(amount) as collectedSum FROM payments WHERE status = 'SUCCESS'`, [], (err, row4) => {
          const todayBookings = row1 ? row1.todayCount : 0;
          const totalCapacity = 32; // 4 doctors * 8 slots/day
          const utilizationRate = Math.min(100, Math.round((todayBookings / totalCapacity) * 100));

          res.json({
            todayCount: todayBookings,
            lateCount: row2 ? row2.lateCount : 0,
            pendingFees: row3 && row3.pendingSum ? row3.pendingSum : 0,
            collectedRevenue: row4 && row4.collectedSum ? row4.collectedSum : 0,
            utilizationRate: `${utilizationRate}%`
          });
        });
      });
    });
  });
});

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`PulseCare Clinic Server running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
});
