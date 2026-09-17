# PulseCare Clinic - Front Desk Management & ConflictGuard™

PulseCare is a full-stack clinic appointment management system built for busy medical clinics with multiple doctors. It eliminates doctor double-bookings using a real-time interval conflict prevention engine (**ConflictGuard™**), enforces a fair 24-hour late cancellation fee policy (**₹500 fee** for late cancellations vs **₹0** for early cancellations), provides instant patient lookups, daily doctor schedules, pagination, sorting, search, and user registration/login.

---

## 🛠️ Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite3 (`clinic.db`) with automatic table creation & initial seed data
- **Authentication**: JWT (JSON Web Tokens) with `bcryptjs` password hashing
- **Frontend**: HTML5, Vanilla CSS3 (CSS Variables, Flexbox/Grid, Glassmorphism design tokens), Modern Vanilla JavaScript
- **API Architecture**: RESTful JSON APIs

---

## 🚀 How to Set Up, Run, and Debug

### Prerequisites
- Node.js (v18+ recommended)
- npm (v9+ recommended)

### 1. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/your-username/clinic-appointments.git
cd clinic-appointments
npm install
```

### 2. Running the Application
Start the Express REST API server & static file host:
```bash
node server.js
```
The application will launch automatically at:
👉 **`http://localhost:3000`** (or `http://127.0.0.1:3000`)

### 3. Default Demo Accounts
The system automatically initializes a SQLite database with seed data:
- **Default Receptionist Login**:
  - **Username**: `admin`
  - **Password**: `admin123`

### 4. Debugging & Verification
- **Server Logs**: Server logs print directly to standard output upon launch.
- **Database Inspection**: SQLite database file is located at `./clinic.db`. You can view or reset tables using `sqlite3 clinic.db` or via DB Browser for SQLite.
- **API Endpoint Verification**: You can test REST APIs directly using `curl` or Postman:
  ```bash
  curl http://localhost:3000/api/doctors
  curl http://localhost:3000/api/patients?search=Eleanor
  curl http://localhost:3000/api/stats
  ```

---

## 📡 Complete REST API Endpoints

### 🔑 Authentication Endpoints
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register new receptionist user (`username`, `password`, `name`) | No |
| `POST` | `/api/auth/login` | Login user, returns JWT token & user object | No |
| `GET` | `/api/auth/me` | Fetch currently logged-in user profile | **Yes** (Bearer Token) |

### 👨‍⚕️ Doctors Endpoints
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/doctors` | Retrieve list of all doctors and specialty suites | No |

### 👤 Patients Endpoints
| Method | Endpoint | Description | Query Parameters |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/patients` | Search & paginate registered patients | `search`, `page`, `limit`, `sortBy`, `sortOrder` |
| `POST` | `/api/patients` | Register new patient (`name`, `phone`, `email`, `dob`) | **Yes** |

### 📅 Appointments & ConflictGuard™ Endpoints
| Method | Endpoint | Description | Query / Body Parameters |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/appointments` | Get appointments with filters & pagination | `doctorId`, `date`, `status`, `search`, `patientId`, `feeFilter`, `page`, `limit`, `sortBy`, `sortOrder` |
| `POST` | `/api/appointments/check-conflict` | Evaluate time slot overlap for a doctor | `{ doctorId, date, startTime, endTime, excludeId }` |
| `POST` | `/api/appointments` | Book new appointment with server-side overlap guard | `{ doctorId, patientId, date, startTime, endTime, reason }` |
| `POST` | `/api/appointments/:id/cancel` | Cancel appointment & calculate 24h fee threshold | Path `:id` |
| `PATCH` | `/api/appointments/:id/pay-fee` | Mark late cancellation fee (₹500) as PAID | Path `:id` |

### 💳 Payment Gateway Checkout Endpoints
| Method | Endpoint | Description | Body Parameters |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/payments/process` | Process fee payment & issue digital receipt | `{ appointmentId, patientId, amount, paymentMethod }` (UPI/CARD/CASH/NETBANKING) |
| `GET` | `/api/payments` | Fetch payment transaction audit trail | `limit` |

### 📊 Statistics Endpoint
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/stats` | Get dashboard summary metrics (Today's count, Late cancellations, Pending fees) |

---

## 🎯 Key Features Included

1. **ConflictGuard™ Double-Booking Guard**: Prevents doctor overlaps using interval algebra `[startA < endB && startB < endA]`.
2. **24-Hour Late Cancellation Fee Policy**: Automatically evaluates notice time. Notice < 24h incurs **₹500 fee**, notice >= 24h is **₹0**.
3. **Desk Payment Gateway & Digital Receipts**: Collect late cancellation fees via UPI, Card, Cash, NetBanking, and print/export official receipts.
4. **Financial & Operational Intelligence**: Real-time metrics for Collected Revenue (`₹`), Uncollected Fees (`₹`), and Doctor Schedule Utilization (`%`).
5. **One-Click Business CSV Data Export**: Export Patient Directory and Cancellation Audit logs directly to CSV for clinic accounting.
6. **Doctor Day Schedule Matrix**: Visual daily timeline of occupied & free slots per doctor.
7. **Patient Search & History**: Instant search by patient name, phone, or email.
8. **Pagination & Sorting**: Paginated patient directory and cancellation records table with sortable columns.
9. **One-Page Product Landing Page**: Includes product positioning, target audience, key features, and 3 future roadmap features (Deposit holds, EHR integration, Multi-branch AI roster).

