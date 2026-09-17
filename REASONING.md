# REASONING.md - Architecture, Design Decisions & Problem Solving

This document details the engineering thought process, architectural choices, mathematical logic, and testing methodologies behind the **PulseCare Clinic System**.

---

## 🧠 1. Problem Analysis & Core Objectives

The user specification describes the daily frustrations of a busy medical clinic front desk:
1. **Double-Booking Doctors**: Multiple patients assigned to the same doctor in overlapping time windows.
2. **Cancellation Policy Disputes**: Lack of automated rule enforcement for late vs. early cancellations.
3. **Lookup Bottlenecks**: Desk staff struggling to quickly locate a doctor's schedule or a patient's visit history.

### Strategic Priorities:
- **Priority 1**: Mathematical guarantee against double-booking (ConflictGuard™).
- **Priority 2**: Fair, automated 24-hour late cancellation fee calculation.
- **Priority 3**: Fast, responsive front-desk lookup UI over REST APIs with pagination and sorting.

---

## 📐 2. Technical Design & Algorithms

### A. Overlap Prevention Algorithm (Interval Algebra)
To check if a proposed appointment interval $[A_{\text{start}}, A_{\text{end}})$ conflicts with an existing booking $[B_{\text{start}}, B_{\text{end}})$ for the same doctor on the same date:

1. Convert HH:MM time strings into total minutes from midnight:
   $$\text{minutes} = \text{hours} \times 60 + \text{minutes}$$
2. Two intervals $[A_{\text{start}}, A_{\text{end}})$ and $[B_{\text{start}}, B_{\text{end}})$ **overlap** if and only if:
   $$A_{\text{start}} < B_{\text{end}} \quad \text{AND} \quad B_{\text{start}} < A_{\text{end}}$$
3. **Edge Case Handling**: Adjacent slots (e.g. 09:00–09:30 and 09:30–10:00) satisfy $09:30 < 09:30 \Rightarrow \text{False}$, correctly recognizing that back-to-back appointments do NOT conflict.
4. **Cancelled Appointments**: Appointments with `status = 'CANCELLED'` are filtered out, releasing the doctor's time slot immediately.

### B. Late Cancellation Fee Logic
A cancellation is evaluated by computing the difference in hours between the scheduled appointment time ($T_{\text{apt}}$) and the cancellation timestamp ($T_{\text{cancel}}$):

$$\Delta H = \frac{T_{\text{apt}} - T_{\text{cancel}}}{3600 \times 1000}$$

- **If $\Delta H < 24$ hours**: The cancellation is categorized as **Late Cancellation**. A fixed fee of **$25.00** is recorded with status `PENDING`.
- **If $\Delta H \ge 24$ hours**: The cancellation is categorized as **Free Cancellation**. Fee is **$0.00**.

---

## 🏗️ 3. Full-Stack Architecture

### Database Schema Design (`clinic.db`)
- **`users`**: Manages receptionist accounts (`id`, `username`, `password_hash`, `role`).
- **`doctors`**: Master list of doctors (`id`, `name`, `specialty`, `room`, `avatar`).
- **`patients`**: Patient registry (`id`, `name`, `phone`, `email`, `dob`).
- **`appointments`**: Core transactional table (`id`, `patient_id`, `doctor_id`, `date`, `start_time`, `end_time`, `reason`, `status`, `cancellation_fee`, `cancellation_fee_status`).

### REST API Layer
Structured JSON APIs handle CRUD operations with full server-side validation. Even if a user attempts to bypass front-end controls, `POST /api/appointments` performs an independent database conflict check before inserting records.

### Desk Payment Gateway & Receipt Engine
Integrated desk checkout system (`POST /api/payments/process`) allowing staff to collect late cancellation fees (₹500.00) across UPI, Card, Cash, and NetBanking. Generates immutable transaction reference IDs (`TXN-XXXXXX`) and digital printable receipts.

---

## 🧪 4. Testing, Bug Fixes & Verification

### Issues Encountered & Resolved:
1. **Adjacent Slot False Positives**:
   - *Issue*: Early implementation evaluated `startA <= endB`, which incorrectly flagged back-to-back bookings (e.g. 09:00-09:30 and 09:30-10:00) as conflicts.
   - *Fix*: Refactored to strict inequality `startA < endB && startB < endA`.

2. **Database Auto-Seeding & Persistence**:
   - *Issue*: Fresh deployments had no default accounts or doctor schedules.
   - *Fix*: Created automatic schema initialization and data seed routine in `db.js` on server startup.

3. **Desk Payment Processing & Digital Receipts**:
   - *Issue*: Late cancellation fees were logged as pending without a direct way to collect and issue official receipts.
   - *Fix*: Added modal payment gateway checkout support and printable digital receipt generator.

---

## 🎯 6. Evaluation Twists & Advanced Lifecycle Automation

### Level 1 — T6 (Lifecycle Rescheduling)
- **Requirement**: Reschedule an appointment to a new time while maintaining conflict-free validation and keeping the same patient and doctor.
- **Solution**: Implemented `PUT /api/appointments/:id/reschedule`. The endpoint loads the existing appointment record, preserves `doctor_id` and `patient_id`, and runs `checkConflictInternal(doctor_id, newDate, newStart, newEnd, excludeId)` excluding the appointment's current ID. If clear, it updates `date`, `start_time`, and `end_time`.

### Level 2 — T1 (Notification Service Integration)
- **Requirement**: Each morning, remind patients of today's appointments via the Notification Service, graded via `/outbox` after `POST /clock`.
- **Solution**: Created `POST /clock` and `GET /outbox` endpoints and an `outbox` SQLite database table. Upon triggering `POST /clock`, the server fetches active appointments for the given date, formats reminder messages, inserts them into `outbox`, and exposes them via `GET /outbox`.

### Level 3 — T2 (Automation Job - Auto No-Show)
- **Requirement**: Auto-mark appointments as `NO_SHOW` 30 minutes after their start time if not completed, graded via `POST /clock`.
- **Solution**: Integrated into `POST /clock`. When the clock advances, for every `BOOKED` appointment on that date where `currentTime >= startTime + 30 minutes`, the status is updated to `NO_SHOW`.
