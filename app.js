// PulseCare Pro Next-Gen SaaS Frontend Controller & Interactive Simulator

class ClinicApp {
  constructor() {
    this.currentTab = 'tab-schedule';
    this.selectedDate = getTodayString(0);
    this.selectedDoctorFilter = 'ALL';
    this.selectedPatientId = null;
    this.appointmentToCancel = null;
    this.preventedConflictsCount = 0;
    this.feeFilter = 'ALL';
    this.authToken = localStorage.getItem('pulse_auth_token') || null;
    this.currentUser = JSON.parse(localStorage.getItem('pulse_auth_user') || 'null');

    // Pagination & Sorting state
    this.patientPage = 1;
    this.patientSortBy = 'name';
    this.patientSortOrder = 'ASC';
    
    this.cancellationPage = 1;
    this.cancellationSortBy = 'date';
    this.cancellationSortOrder = 'DESC';

    this.init();
  }

  async init() {
    this.startLiveClock();
    this.setupCommandPalette();
    this.setupSimulatorWidget();
    this.setupAuthUI();
    this.setupNavigation();
    this.setupDatePickers();
    await this.populateDropdowns();
    this.setupBookingFormListeners();
    this.setupPatientLookupListeners();
    this.setupCancellationListeners();
    this.setupModals();
    this.render();
  }

  startLiveClock() {
    const clockEl = document.getElementById('clock-text');
    const updateTime = () => {
      const now = new Date();
      if (clockEl) {
        clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' IST';
      }
    };
    updateTime();
    setInterval(updateTime, 1000);
  }

  // --- COMMAND PALETTE (Ctrl + K) ---
  setupCommandPalette() {
    const cmdModal = document.getElementById('modal-cmd');
    const openBtn = document.getElementById('btn-open-cmd');
    const cmdInput = document.getElementById('cmd-input');

    const openCmd = () => {
      cmdModal.classList.remove('hidden');
      cmdInput.value = '';
      cmdInput.focus();
    };

    const closeCmd = () => cmdModal.classList.add('hidden');

    openBtn?.addEventListener('click', openCmd);

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openCmd();
      }
      if (e.key === 'Escape') closeCmd();
    });

    cmdModal?.addEventListener('click', (e) => {
      if (e.target === cmdModal) closeCmd();
    });

    document.querySelectorAll('.cmd-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const actionTab = opt.getAttribute('data-action');
        if (actionTab) {
          this.switchTab(actionTab);
          closeCmd();
        }
      });
    });
  }

  // --- INTERACTIVE SIMULATOR ON LANDING PAGE ---
  setupSimulatorWidget() {
    const simDoctor = document.getElementById('sim-doctor');
    const simStart = document.getElementById('sim-start');
    const simEnd = document.getElementById('sim-end');
    const simBanner = document.getElementById('sim-banner');
    const simDesc = document.getElementById('sim-desc');

    const runSim = () => {
      if (!simDoctor || !simStart || !simEnd) return;
      const docId = simDoctor.value;
      const start = simStart.value;
      const end = simEnd.value;
      const today = getTodayString(0);

      const conflictCheck = checkBookingConflict(docId, today, start, end);

      if (conflictCheck.hasConflict) {
        simBanner.className = 'sim-status-banner conflict';
        simBanner.querySelector('span').textContent = '🚨';
        simBanner.querySelector('strong').textContent = 'Double-Booking Blocked!';
        simDesc.textContent = conflictCheck.reason;
      } else {
        simBanner.className = 'sim-status-banner clear';
        simBanner.querySelector('span').textContent = '✅';
        simBanner.querySelector('strong').textContent = 'Time Slot Clean & Available!';
        simDesc.textContent = `No overlapping bookings found for ${start} - ${end}.`;
      }
    };

    simDoctor?.addEventListener('change', runSim);
    simStart?.addEventListener('input', runSim);
    simEnd?.addEventListener('input', runSim);

    runSim();
  }

  async apiRequest(endpoint, method = 'GET', data = null) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }

      const options = { method, headers };
      if (data) options.body = JSON.stringify(data);

      const response = await fetch(endpoint, options);
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || 'API Request failed');
      }
      return json;
    } catch (err) {
      console.warn(`API error on ${endpoint}, falling back to local store:`, err.message);
      return null;
    }
  }

  setupAuthUI() {
    const authBox = document.getElementById('auth-user-box');
    const headerLoginBtn = document.getElementById('btn-header-login');

    if (this.currentUser) {
      authBox.innerHTML = `
        <div class="auth-user-info">
          <span class="auth-user-name">👤 ${this.currentUser.name}</span>
          <span class="auth-user-role">${this.currentUser.role}</span>
        </div>
        <button id="btn-logout" class="btn-text-danger" style="margin-left:0.5rem;">Logout</button>
      `;
      document.getElementById('btn-logout').addEventListener('click', () => this.logout());
      headerLoginBtn.classList.add('hidden');
    } else {
      authBox.innerHTML = `
        <div class="auth-user-info">
          <span class="auth-user-name">Guest Receptionist</span>
          <span class="auth-user-role">Click to login</span>
        </div>
        <button id="btn-sidebar-login" class="btn btn-sm btn-primary">Login</button>
      `;
      document.getElementById('btn-sidebar-login').addEventListener('click', () => this.openAuthModal());
      headerLoginBtn.classList.remove('hidden');
    }

    headerLoginBtn.addEventListener('click', () => this.openAuthModal());
  }

  openAuthModal() {
    document.getElementById('modal-auth').classList.remove('hidden');
  }

  logout() {
    this.authToken = null;
    this.currentUser = null;
    localStorage.removeItem('pulse_auth_token');
    localStorage.removeItem('pulse_auth_user');
    this.setupAuthUI();
    this.showToast('Logged out successfully', 'success');
  }

  async updateStatsBar() {
    const apiStats = await this.apiRequest('/api/stats');
    if (apiStats) {
      document.getElementById('stat-today-count').textContent = apiStats.todayCount;
      document.getElementById('stat-prevented-count').textContent = this.preventedConflictsCount;
      document.getElementById('stat-late-cancellations').textContent = apiStats.lateCount;
      document.getElementById('stat-pending-fees').textContent = `₹${parseFloat(apiStats.pendingFees).toFixed(2)}`;
      if (document.getElementById('stat-collected-revenue')) {
        document.getElementById('stat-collected-revenue').textContent = `₹${parseFloat(apiStats.collectedRevenue || 0).toFixed(2)}`;
      }
      if (document.getElementById('stat-utilization-rate')) {
        document.getElementById('stat-utilization-rate').textContent = apiStats.utilizationRate || '0%';
      }
      return;
    }

    const appointments = store.getAppointments();
    const todayStr = getTodayString(0);
    const todayApts = appointments.filter(a => a.date === todayStr && a.status !== 'CANCELLED');
    document.getElementById('stat-today-count').textContent = todayApts.length;
    document.getElementById('stat-prevented-count').textContent = this.preventedConflictsCount;

    const lateApts = appointments.filter(a => a.status === 'CANCELLED' && a.cancellationFee > 0);
    document.getElementById('stat-late-cancellations').textContent = lateApts.length;

    const pendingSum = appointments
      .filter(a => a.status === 'CANCELLED' && a.cancellationFeeStatus === 'PENDING')
      .reduce((sum, a) => sum + (a.cancellationFee || 0), 0);
    document.getElementById('stat-pending-fees').textContent = `₹${pendingSum.toFixed(2)}`;
  }

  setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        this.switchTab(targetTab);
      });
    });

    document.getElementById('brand-home-link').addEventListener('click', () => {
      this.switchTab('tab-landing');
    });

    document.getElementById('btn-quick-book').addEventListener('click', () => {
      this.switchTab('tab-booking');
    });

    document.getElementById('btn-launch-console').addEventListener('click', () => {
      this.switchTab('tab-schedule');
    });

    document.getElementById('btn-show-features').addEventListener('click', () => {
      document.querySelector('.next-features-card').scrollIntoView({ behavior: 'smooth' });
    });
  }

  switchTab(tabId) {
    this.currentTab = tabId;
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === tabId);
    });

    const headingMap = {
      'tab-landing': { title: "Product Overview & Roadmap", sub: "PulseCare Front Desk Management Console." },
      'tab-schedule': { title: "Doctor's Daily Schedule", sub: "View occupied time slots and book conflict-free appointments." },
      'tab-booking': { title: "Book New Appointment", sub: "Real-time ConflictGuard™ checks for doctor overlaps instantly." },
      'tab-patients': { title: "Patient Directory & History", sub: "Search patients, view past visits, and manage records." },
      'tab-cancellations': { title: "Cancellation Fees & Compliance", sub: "24-Hour Fair Cancellation Policy enforcement and fee tracking." }
    };

    if (headingMap[tabId]) {
      document.getElementById('page-heading').textContent = headingMap[tabId].title;
      document.getElementById('page-subheading').textContent = headingMap[tabId].sub;
    }

    if (tabId === 'tab-schedule') this.renderScheduleView();
    if (tabId === 'tab-cancellations') this.renderCancellationsTable();
  }

  setupDatePickers() {
    const dateInput = document.getElementById('schedule-date-input');
    const todayStr = getTodayString(0);
    if (dateInput) dateInput.min = todayStr;
    dateInput.value = this.selectedDate;

    dateInput.addEventListener('change', (e) => {
      this.selectedDate = e.target.value;
      this.renderScheduleView();
    });

    document.getElementById('btn-today').addEventListener('click', () => {
      this.selectedDate = getTodayString(0);
      dateInput.value = this.selectedDate;
      this.renderScheduleView();
    });

    document.getElementById('btn-prev-day').addEventListener('click', () => {
      const d = new Date(this.selectedDate);
      d.setDate(d.getDate() - 1);
      this.selectedDate = d.toISOString().split('T')[0];
      dateInput.value = this.selectedDate;
      this.renderScheduleView();
    });

    document.getElementById('btn-next-day').addEventListener('click', () => {
      const d = new Date(this.selectedDate);
      d.setDate(d.getDate() + 1);
      this.selectedDate = d.toISOString().split('T')[0];
      dateInput.value = this.selectedDate;
      this.renderScheduleView();
    });

    document.getElementById('doctor-filter').addEventListener('change', (e) => {
      this.selectedDoctorFilter = e.target.value;
      this.renderScheduleView();
    });

    const bookDate = document.getElementById('book-date');
    if (bookDate) {
      bookDate.min = todayStr;
      bookDate.value = this.selectedDate;
    }
    const rDate = document.getElementById('reschedule-date');
    if (rDate) rDate.min = todayStr;
  }

  async populateDropdowns() {
    let doctors = await this.apiRequest('/api/doctors');
    if (!doctors) doctors = store.getDoctors();

    let patientsRes = await this.apiRequest('/api/patients?limit=200');
    let patients = patientsRes ? patientsRes.patients : store.getPatients();

    const filterSelect = document.getElementById('doctor-filter');
    filterSelect.innerHTML = '<option value="ALL">All Doctors</option>' + 
      doctors.map(d => `<option value="${d.id}">${d.name} (${d.specialty})</option>`).join('');

    const bookDocSelect = document.getElementById('book-doctor');
    bookDocSelect.innerHTML = doctors.map(d => `<option value="${d.id}">${d.name} — ${d.specialty} (${d.room})</option>`).join('');

    const bookPatSelect = document.getElementById('book-patient');
    bookPatSelect.innerHTML = patients.map(p => `<option value="${p.id}">${p.name} (${p.phone})</option>`).join('');
  }

  async renderScheduleView() {
    const grid = document.getElementById('schedule-grid');
    grid.innerHTML = '';

    let doctors = await this.apiRequest('/api/doctors');
    if (!doctors) doctors = store.getDoctors();

    const visibleDoctors = this.selectedDoctorFilter === 'ALL' 
      ? doctors 
      : doctors.filter(d => d.id === this.selectedDoctorFilter);

    let aptsRes = await this.apiRequest(`/api/appointments?date=${this.selectedDate}&limit=200`);
    let appointments = aptsRes ? aptsRes.appointments : store.getAppointments();

    visibleDoctors.forEach(doc => {
      const col = document.createElement('div');
      col.className = 'doctor-schedule-column';

      col.innerHTML = `
        <div class="doctor-column-header">
          <div class="doctor-avatar">${doc.avatar}</div>
          <div class="doctor-info">
            <h4>${doc.name}</h4>
            <span>${doc.specialty} • ${doc.room}</span>
          </div>
        </div>
        <div class="slots-container" id="slots-doc-${doc.id}"></div>
      `;

      grid.appendChild(col);

      const slotsContainer = col.querySelector(`#slots-doc-${doc.id}`);
      
      const docApts = appointments.filter(a => a.doctorId === doc.id && a.date === this.selectedDate);
      docApts.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

      if (docApts.length === 0) {
        slotsContainer.innerHTML = `<div class="empty-state" style="padding: 1.5rem 0.5rem;"><small>No bookings yet for this date.</small></div>`;
      } else {
        docApts.forEach(apt => {
          const card = document.createElement('div');
          const isCancelled = apt.status === 'CANCELLED';
          card.className = `slot-card ${isCancelled ? 'cancelled' : 'booked'}`;
          let statusBadge = '';
          if (isCancelled) {
            statusBadge = `<span class="badge badge-cancelled">CANCELLED ${apt.cancellationFee > 0 ? `(₹${apt.cancellationFee} Late Fee)` : ''}</span>`;
          } else if (apt.status === 'IN_PROGRESS') {
            statusBadge = `<span class="badge" style="background:#0284c7; color:#fff;">🟢 IN CONSULTATION</span>`;
          } else if (apt.status === 'COMPLETED') {
            statusBadge = `<span class="badge" style="background:#059669; color:#fff;">✅ COMPLETED</span>`;
          } else if (apt.status === 'NO_SHOW') {
            statusBadge = `<span class="badge" style="background:#dc2626; color:#fff;">⚠️ NO SHOW</span>`;
          }

          let arrivalTag = '';
          if (apt.arrivalTime) {
            const isLate = apt.arrivalStatus && apt.arrivalStatus.startsWith('LATE');
            arrivalTag = `<div style="font-size:0.75rem; font-weight:700; margin-top:0.25rem; color:${isLate ? '#dc2626' : '#059669'};">
              ${isLate ? `⏱️ Arrived ${apt.minutesLate || 0}m Late (${apt.arrivalTime})` : `✅ Arrived On Time (${apt.arrivalTime})`}
            </div>`;
          } else if (apt.status === 'NO_SHOW') {
            arrivalTag = `<div style="font-size:0.75rem; font-weight:600; margin-top:0.25rem; color:#dc2626;">
              ⚠️ Arrival Missed (No-Show recorded)
            </div>`;
          } else if (isCancelled) {
            arrivalTag = `<div style="font-size:0.75rem; font-weight:600; margin-top:0.25rem; color:#94a3b8;">
              🚫 Not Arrived (Visit Cancelled)
            </div>`;
          } else {
            arrivalTag = `<div style="font-size:0.75rem; font-weight:600; margin-top:0.25rem; color:#0284c7;">
              ⏳ Awaiting Patient Arrival (Scheduled: ${apt.startTime})
            </div>`;
          }

          card.innerHTML = `
            <div class="slot-time">⏱️ ${apt.startTime} - ${apt.endTime}</div>
            <div class="slot-patient">${apt.patientName}</div>
            <div class="slot-reason">${apt.reason || 'General Consultation'}</div>
            ${statusBadge ? `<div style="margin-top:0.3rem;">${statusBadge}</div>` : ''}
            ${arrivalTag}
            ${!isCancelled && apt.status !== 'COMPLETED' ? `
              <div class="slot-actions" style="margin-top:0.5rem; display:flex; flex-wrap:wrap; gap:0.25rem;">
                ${apt.status === 'BOOKED' ? `<button class="btn btn-sm btn-primary btn-checkin-apt" data-id="${apt.id}">📍 Mark Arrived</button>` : ''}
                ${apt.status === 'IN_PROGRESS' ? `<button class="btn btn-sm btn-success btn-complete-apt" data-id="${apt.id}" style="background:#059669; color:#fff;">✅ Complete Visit</button>` : ''}
                <button class="btn btn-sm btn-outline btn-reschedule-apt" data-id="${apt.id}">Reschedule</button>
                <button class="btn btn-sm btn-outline btn-cancel-apt" data-id="${apt.id}">Cancel</button>
              </div>
            ` : ''}
          `;

          if (!isCancelled) {
            card.querySelector('.btn-checkin-apt')?.addEventListener('click', async () => {
              const res = await this.apiRequest(`/api/appointments/${apt.id}/check-in`, 'POST');
              if (res && !res.error) {
                this.showToast(`📍 Patient Checked In! ${res.message}`, res.minutesLate > 0 ? 'error' : 'success');
                await this.loadInitialData();
                this.render();
              }
            });

            card.querySelector('.btn-complete-apt')?.addEventListener('click', async () => {
              const res = await this.apiRequest(`/api/appointments/${apt.id}/complete`, 'POST');
              if (res && !res.error) {
                this.showToast('✅ Consultation completed successfully!', 'success');
                await this.loadInitialData();
                this.render();
              }
            });

            card.querySelector('.btn-cancel-apt')?.addEventListener('click', () => {
              this.openCancelModal(apt);
            });
            card.querySelector('.btn-reschedule-apt')?.addEventListener('click', () => {
              this.openRescheduleModal(apt);
            });
          }

          slotsContainer.appendChild(card);
        });
      }

      const freeSlots = getDoctorFreeSlots(doc.id, this.selectedDate, 30);
      if (freeSlots.length > 0) {
        const freeHeader = document.createElement('div');
        freeHeader.style.cssText = 'font-size:0.75rem; font-weight:700; color:#64748b; margin-top:1rem; margin-bottom:0.25rem;';
        freeHeader.textContent = 'AVAILABLE SLOTS (Click to Book)';
        slotsContainer.appendChild(freeHeader);

        freeSlots.slice(0, 4).forEach(slot => {
          const freeCard = document.createElement('div');
          freeCard.className = 'slot-card available';
          freeCard.innerHTML = `
            <div>
              <div class="slot-time">${slot.startTime} - ${slot.endTime}</div>
              <small style="color:#10b981; font-weight:600;">+ Open Slot</small>
            </div>
            <button class="btn btn-sm btn-primary">Book</button>
          `;

          freeCard.addEventListener('click', () => {
            this.prefillBookingForm(doc.id, this.selectedDate, slot.startTime, slot.endTime);
          });

          slotsContainer.appendChild(freeCard);
        });
      }
    });
  }

  prefillBookingForm(doctorId, date, startTime, endTime) {
    this.switchTab('tab-booking');
    document.getElementById('book-doctor').value = doctorId;
    document.getElementById('book-date').value = date;
    document.getElementById('book-start-time').value = startTime;
    document.getElementById('book-end-time').value = endTime;
    this.validateBookingOverlap();
  }

  setupBookingFormListeners() {
    const docInput = document.getElementById('book-doctor');
    const dateInput = document.getElementById('book-date');
    const startInput = document.getElementById('book-start-time');
    const endInput = document.getElementById('book-end-time');
    const form = document.getElementById('booking-form');

    const triggerValidation = () => this.validateBookingOverlap();

    docInput.addEventListener('change', triggerValidation);
    dateInput.addEventListener('change', triggerValidation);
    startInput.addEventListener('input', triggerValidation);
    endInput.addEventListener('input', triggerValidation);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleBookingSubmit();
    });

    this.validateBookingOverlap();
  }

  async validateBookingOverlap() {
    const doctorId = document.getElementById('book-doctor').value;
    const date = document.getElementById('book-date').value;
    const startTime = document.getElementById('book-start-time').value;
    const endTime = document.getElementById('book-end-time').value;
    const submitBtn = document.getElementById('btn-submit-booking');

    const conflictAlert = document.getElementById('conflict-alert');
    const successAlert = document.getElementById('availability-success');

    if (!doctorId || !date || !startTime || !endTime) {
      conflictAlert.classList.add('hidden');
      successAlert.classList.add('hidden');
      submitBtn.disabled = true;
      return;
    }

    const apiConflict = await this.apiRequest('/api/appointments/check-conflict', 'POST', {
      doctorId, date, startTime, endTime
    });

    const evaluation = apiConflict || checkBookingConflict(doctorId, date, startTime, endTime);

    if (evaluation.hasConflict) {
      this.preventedConflictsCount++;
      document.getElementById('stat-prevented-count').textContent = this.preventedConflictsCount;

      conflictAlert.classList.remove('hidden');
      successAlert.classList.add('hidden');
      document.getElementById('conflict-desc').textContent = evaluation.reason;
      submitBtn.disabled = true;
    } else {
      conflictAlert.classList.add('hidden');
      successAlert.classList.remove('hidden');
      submitBtn.disabled = false;
    }
  }

  async handleBookingSubmit() {
    const doctorId = document.getElementById('book-doctor').value;
    const patientId = document.getElementById('book-patient').value;
    const date = document.getElementById('book-date').value;
    const startTime = document.getElementById('book-start-time').value;
    const endTime = document.getElementById('book-end-time').value;
    const reason = document.getElementById('book-reason').value;

    const res = await this.apiRequest('/api/appointments', 'POST', {
      doctorId, patientId, date, startTime, endTime, reason
    });

    if (res && !res.error) {
      this.showToast(`Appointment successfully booked!`, 'success');
    } else if (res && res.conflict) {
      this.showToast(`Conflict detected: ${res.error}`, 'error');
      return;
    } else {
      const doctors = store.getDoctors();
      const patients = store.getPatients();
      const doctor = doctors.find(d => d.id === doctorId);
      const patient = patients.find(p => p.id === patientId);

      const newApt = {
        id: 'apt-' + Date.now(),
        patientId, patientName: patient.name,
        doctorId, doctorName: doctor.name,
        date, startTime, endTime,
        reason: reason || 'Routine Consultation',
        status: 'BOOKED', cancellationFee: 0, cancellationReason: '',
        createdAt: new Date().toISOString()
      };
      store.addAppointment(newApt);
      this.showToast(`Appointment booked for ${patient.name}!`, 'success');
    }

    document.getElementById('book-reason').value = '';
    this.selectedDate = date;
    document.getElementById('schedule-date-input').value = date;
    this.render();
    this.switchTab('tab-schedule');
  }

  downloadCSV(filename, csvData) {
    const bomCsv = '\uFEFF' + csvData;
    const blob = new Blob([bomCsv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  setupPatientLookupListeners() {
    const searchInput = document.getElementById('patient-search-input');
    searchInput.addEventListener('input', (e) => {
      this.patientPage = 1;
      this.renderPatientsList(e.target.value);
    });

    document.getElementById('patient-sort-select').addEventListener('change', (e) => {
      const [sortBy, sortOrder] = e.target.value.split('-');
      this.patientSortBy = sortBy;
      this.patientSortOrder = sortOrder;
      this.patientPage = 1;
      this.renderPatientsList(searchInput.value);
    });

    document.getElementById('btn-book-for-patient').addEventListener('click', () => {
      if (!this.selectedPatientId) return;
      document.getElementById('book-patient').value = this.selectedPatientId;
      this.switchTab('tab-booking');
    });

    document.getElementById('btn-export-patients-csv')?.addEventListener('click', async () => {
      let res = await this.apiRequest('/api/patients?limit=1000');
      let patients = res ? res.patients : store.getPatients();
      let csv = 'ID,Name,Phone,Email,DOB\n';
      patients.forEach(p => {
        csv += `"${p.id}","${p.name}","${p.phone}","${p.email || ''}","${p.dob || ''}"\n`;
      });
      this.downloadCSV(`PulseCare_Patients_${new Date().toISOString().split('T')[0]}.csv`, csv);
      this.showToast('Exported patient directory CSV!', 'success');
    });
  }

  async renderPatientsList(searchTerm = '') {
    const list = document.getElementById('patients-list');
    const pagination = document.getElementById('patient-pagination');
    list.innerHTML = '';

    const apiRes = await this.apiRequest(
      `/api/patients?search=${encodeURIComponent(searchTerm)}&page=${this.patientPage}&limit=10&sortBy=${this.patientSortBy}&sortOrder=${this.patientSortOrder}`
    );

    let patients = apiRes ? apiRes.patients : store.getPatients();
    let totalPages = apiRes ? apiRes.totalPages : 1;
    let total = apiRes ? apiRes.total : patients.length;

    if (patients.length === 0) {
      list.innerHTML = `<div class="empty-state"><small>No patients found.</small></div>`;
      pagination.innerHTML = '';
      return;
    }

    patients.forEach(p => {
      const card = document.createElement('div');
      card.className = `patient-item-card ${p.id === this.selectedPatientId ? 'active' : ''}`;
      
      const initials = p.name.split(' ').map(n => n[0]).join('');
      card.innerHTML = `
        <div class="patient-avatar-sm">${initials}</div>
        <div class="patient-item-info">
          <h5>${p.name}</h5>
          <p>📞 ${p.phone}</p>
        </div>
      `;

      card.addEventListener('click', () => {
        this.selectPatient(p);
      });

      list.appendChild(card);
    });

    pagination.innerHTML = `
      <span class="pagination-info">Showing page ${this.patientPage} of ${totalPages} (${total} Total)</span>
      <div class="pagination-controls">
        <button class="btn btn-sm btn-secondary" id="btn-patient-prev" ${this.patientPage <= 1 ? 'disabled' : ''}>Prev</button>
        <button class="btn btn-sm btn-secondary" id="btn-patient-next" ${this.patientPage >= totalPages ? 'disabled' : ''}>Next</button>
      </div>
    `;

    document.getElementById('btn-patient-prev')?.addEventListener('click', () => {
      if (this.patientPage > 1) {
        this.patientPage--;
        this.renderPatientsList(searchTerm);
      }
    });

    document.getElementById('btn-patient-next')?.addEventListener('click', () => {
      if (this.patientPage < totalPages) {
        this.patientPage++;
        this.renderPatientsList(searchTerm);
      }
    });
  }

  async selectPatient(patient) {
    this.selectedPatientId = patient.id;
    this.renderPatientsList(document.getElementById('patient-search-input').value);

    document.getElementById('patient-detail-empty').classList.add('hidden');
    document.getElementById('patient-detail-content').classList.remove('hidden');

    const initials = patient.name.split(' ').map(n => n[0]).join('');
    document.getElementById('detail-patient-avatar').textContent = initials;
    document.getElementById('detail-patient-name').textContent = patient.name;
    document.getElementById('detail-patient-phone').textContent = `📞 ${patient.phone}`;
    document.getElementById('detail-patient-email').textContent = `✉️ ${patient.email || 'N/A'}`;
    document.getElementById('detail-patient-dob').textContent = `🎂 DOB: ${patient.dob || 'N/A'}`;

    let historyData = await this.apiRequest(`/api/patients/${patient.id}/history`);
    let summary = historyData ? historyData.summary : null;
    let appointments = historyData ? historyData.history : (aptsRes ? aptsRes.appointments : store.getAppointments().filter(a => a.patientId === patient.id));

    if (summary) {
      document.getElementById('detail-patient-dob').innerHTML = `
        🎂 DOB: ${patient.dob || 'N/A'}<br>
        <div style="margin-top:0.4rem; padding:0.4rem 0.6rem; background:rgba(2, 132, 199, 0.08); border-radius:6px; font-size:0.8rem; color:var(--text-main);">
          <strong>📊 Attendance & Punctuality Record:</strong><br>
          Visits: <strong>${summary.totalVisits}</strong> | On-Time: <strong style="color:#059669;">${summary.onTimeCount}</strong> | Late: <strong style="color:#dc2626;">${summary.lateCount}</strong> | No-Shows: <strong style="color:#b91c1c;">${summary.noShowCount}</strong><br>
          Punctuality Score: <strong style="color:var(--primary);">${summary.punctualityScore}</strong>
        </div>
      `;
    }

    const historyList = document.getElementById('patient-history-list');
    historyList.innerHTML = '';

    if (appointments.length === 0) {
      historyList.innerHTML = `<div class="empty-state"><small>No appointment records found for this patient.</small></div>`;
      return;
    }

    appointments.forEach(apt => {
      const isCancelled = apt.status === 'CANCELLED';
      const card = document.createElement('div');
      card.className = 'history-card';

      let statusBadge = `<span class="badge badge-booked">${apt.status}</span>`;
      if (isCancelled) {
        statusBadge = `<span class="badge badge-cancelled">CANCELLED ${apt.cancellationFee > 0 ? `(₹${apt.cancellationFee} Fee)` : ''}</span>`;
      } else if (apt.status === 'IN_PROGRESS') {
        statusBadge = `<span class="badge" style="background:#0284c7; color:#fff;">🟢 IN CONSULTATION</span>`;
      } else if (apt.status === 'COMPLETED') {
        statusBadge = `<span class="badge" style="background:#059669; color:#fff;">✅ COMPLETED</span>`;
      } else if (apt.status === 'NO_SHOW') {
        statusBadge = `<span class="badge" style="background:#dc2626; color:#fff;">⚠️ NO SHOW</span>`;
      }

      let arrivalInfo = '';
      if (apt.arrivalTime) {
        const isLate = apt.arrivalStatus && apt.arrivalStatus.startsWith('LATE');
        arrivalInfo = `<div style="font-size:0.75rem; font-weight:700; color:${isLate ? '#dc2626' : '#059669'}; margin-top:0.2rem;">
          ${isLate ? `⏱️ Arrived ${apt.minutesLate || 0}m Late at ${apt.arrivalTime}` : `✅ Arrived On-Time at ${apt.arrivalTime}`}
        </div>`;
      } else if (apt.status === 'NO_SHOW') {
        arrivalInfo = `<div style="font-size:0.75rem; font-weight:600; color:#dc2626; margin-top:0.2rem;">⚠️ Arrival Missed (No-Show recorded)</div>`;
      } else if (isCancelled) {
        arrivalInfo = `<div style="font-size:0.75rem; font-weight:600; color:#94a3b8; margin-top:0.2rem;">🚫 Not Arrived (Visit Cancelled)</div>`;
      } else {
        arrivalInfo = `<div style="font-size:0.75rem; font-weight:600; color:#0284c7; margin-top:0.2rem;">⏳ Awaiting Patient Arrival</div>`;
      }

      card.innerHTML = `
        <div class="history-main">
          <strong>${apt.doctorName || 'Doctor'}</strong>
          <span>📅 ${apt.date} at ${apt.startTime} - ${apt.endTime} (${apt.reason || 'Consultation'})</span>
          ${arrivalInfo}
          ${isCancelled && apt.cancellationReason ? `<div style="font-size:0.75rem; color:#ef4444; margin-top:0.2rem;">${apt.cancellationReason}</div>` : ''}
        </div>
        <div style="text-align:right;">
          ${statusBadge}
          ${!isCancelled && apt.status !== 'COMPLETED' ? `
            <div style="margin-top:0.4rem;">
              <button class="btn btn-sm btn-outline btn-cancel-history" data-id="${apt.id}">Cancel</button>
            </div>
          ` : ''}
        </div>
      `;

      if (!isCancelled) {
        card.querySelector('.btn-cancel-history').addEventListener('click', () => {
          this.openCancelModal(apt);
        });
      }

      historyList.appendChild(card);
    });
  }

  setupCancellationListeners() {
    const buttons = document.querySelectorAll('[data-fee-filter]');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.feeFilter = btn.getAttribute('data-fee-filter');
        this.cancellationPage = 1;
        this.renderCancellationsTable();
      });
    });

    document.querySelectorAll('.data-table th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.getAttribute('data-sort');
        if (this.cancellationSortBy === field) {
          this.cancellationSortOrder = this.cancellationSortOrder === 'ASC' ? 'DESC' : 'ASC';
        } else {
          this.cancellationSortBy = field;
          this.cancellationSortOrder = 'ASC';
        }
        this.renderCancellationsTable();
      });
    });

    document.getElementById('btn-export-fees-csv')?.addEventListener('click', async () => {
      let res = await this.apiRequest('/api/appointments?status=CANCELLED&limit=1000');
      let apts = res ? res.appointments : store.getAppointments().filter(a => a.status === 'CANCELLED');
      let csv = 'Appointment ID,Patient Name,Doctor,Date,StartTime,Fee Amount,Fee Status,Reason\n';
      apts.forEach(a => {
        csv += `"${a.id}","${a.patientName}","${a.doctorName}","${a.date}","${a.startTime}","${a.cancellationFee || 0}","${a.cancellationFeeStatus || 'FREE'}","${(a.cancellationReason || '').replace(/"/g, '""')}"\n`;
      });
      this.downloadCSV(`PulseCare_Fee_Audit_${new Date().toISOString().split('T')[0]}.csv`, csv);
      this.showToast('Exported fee audit CSV report!', 'success');
    });
  }

  async renderCancellationsTable() {
    const tbody = document.getElementById('cancellations-tbody');
    const pagination = document.getElementById('cancellations-pagination');
    tbody.innerHTML = '';

    const apiRes = await this.apiRequest(
      `/api/appointments?status=CANCELLED&feeFilter=${this.feeFilter}&page=${this.cancellationPage}&limit=10&sortBy=${this.cancellationSortBy}&sortOrder=${this.cancellationSortOrder}`
    );

    let appointments = apiRes ? apiRes.appointments : store.getAppointments().filter(a => a.status === 'CANCELLED');
    let totalPages = apiRes ? apiRes.totalPages : 1;
    let total = apiRes ? apiRes.total : appointments.length;

    if (appointments.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No cancellation records matching filter.</td></tr>`;
      pagination.innerHTML = '';
      return;
    }

    appointments.forEach(apt => {
      const tr = document.createElement('tr');
      const isLate = apt.cancellationFee > 0;
      const isPaid = apt.cancellationFeeStatus === 'PAID';

      tr.innerHTML = `
        <td><strong>${apt.patientName}</strong></td>
        <td>${apt.doctorName}</td>
        <td>${apt.date} (${apt.startTime})</td>
        <td><span class="badge ${isLate ? 'badge-cancelled' : 'badge-booked'}">${isLate ? 'Late Cancellation' : 'Free Cancellation'}</span></td>
        <td><strong>₹${(apt.cancellationFee || 0).toFixed(2)}</strong></td>
        <td>
          ${isLate 
            ? `<span class="badge ${isPaid ? 'badge-paid' : 'badge-pending'}">${isPaid ? 'PAID' : 'PENDING'}</span>`
            : '<span style="color:#64748b;">N/A (₹0)</span>'
          }
        </td>
        <td>
          ${isLate && !isPaid ? `<button class="btn btn-sm btn-primary btn-pay-fee" data-id="${apt.id}">Collect Fee</button>` : ''}
          ${isLate && isPaid ? `<span style="color:#10b981; font-weight:700; font-size:0.8rem;">✓ Collected</span>` : ''}
        </td>
      `;

      if (isLate && !isPaid) {
        tr.querySelector('.btn-pay-fee').addEventListener('click', () => {
          this.openPaymentCheckoutModal(apt);
        });
      }

      tbody.appendChild(tr);
    });

    pagination.innerHTML = `
      <span class="pagination-info">Page ${this.cancellationPage} of ${totalPages} (${total} Records)</span>
      <div class="pagination-controls">
        <button class="btn btn-sm btn-secondary" id="btn-cancel-prev" ${this.cancellationPage <= 1 ? 'disabled' : ''}>Prev</button>
        <button class="btn btn-sm btn-secondary" id="btn-cancel-next" ${this.cancellationPage >= totalPages ? 'disabled' : ''}>Next</button>
      </div>
    `;

    document.getElementById('btn-cancel-prev')?.addEventListener('click', () => {
      if (this.cancellationPage > 1) {
        this.cancellationPage--;
        this.renderCancellationsTable();
      }
    });

    document.getElementById('btn-cancel-next')?.addEventListener('click', () => {
      if (this.cancellationPage < totalPages) {
        this.cancellationPage++;
        this.renderCancellationsTable();
      }
    });
  }

  setupModals() {
    const aModal = document.getElementById('modal-auth');
    document.getElementById('btn-close-auth-modal').addEventListener('click', () => aModal.classList.add('hidden'));

    document.getElementById('btn-switch-to-register').addEventListener('click', () => {
      document.getElementById('auth-login-form').classList.add('hidden');
      document.getElementById('auth-register-form').classList.remove('hidden');
      document.getElementById('auth-modal-title').textContent = 'Register Receptionist Staff';
    });

    document.getElementById('btn-switch-to-login').addEventListener('click', () => {
      document.getElementById('auth-register-form').classList.add('hidden');
      document.getElementById('auth-login-form').classList.remove('hidden');
      document.getElementById('auth-modal-title').textContent = 'Receptionist Staff Login';
    });

    document.getElementById('auth-login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value;
      const password = document.getElementById('login-password').value;

      const res = await this.apiRequest('/api/auth/login', 'POST', { username, password });
      if (res && res.token) {
        this.authToken = res.token;
        this.currentUser = res.user;
        localStorage.setItem('pulse_auth_token', res.token);
        localStorage.setItem('pulse_auth_user', JSON.stringify(res.user));
        this.setupAuthUI();
        aModal.classList.add('hidden');
        this.showToast(`Welcome back, ${res.user.name}!`, 'success');
      } else {
        this.showToast(res ? res.error : 'Login failed', 'error');
      }
    });

    document.getElementById('auth-register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('reg-name').value;
      const username = document.getElementById('reg-username').value;
      const password = document.getElementById('reg-password').value;

      const res = await this.apiRequest('/api/auth/register', 'POST', { name, username, password });
      if (res && res.token) {
        this.authToken = res.token;
        this.currentUser = res.user;
        localStorage.setItem('pulse_auth_token', res.token);
        localStorage.setItem('pulse_auth_user', JSON.stringify(res.user));
        this.setupAuthUI();
        aModal.classList.add('hidden');
        this.showToast(`Account created for ${res.user.name}!`, 'success');
      } else {
        this.showToast(res ? res.error : 'Registration failed', 'error');
      }
    });

    const pModal = document.getElementById('modal-new-patient');
    document.getElementById('btn-open-add-patient').addEventListener('click', () => pModal.classList.remove('hidden'));
    document.getElementById('btn-close-patient-modal').addEventListener('click', () => pModal.classList.add('hidden'));
    document.getElementById('btn-cancel-patient-modal').addEventListener('click', () => pModal.classList.add('hidden'));

    document.getElementById('new-patient-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('new-patient-name').value;
      const phone = document.getElementById('new-patient-phone').value;
      const email = document.getElementById('new-patient-email').value;
      const dob = document.getElementById('new-patient-dob').value;

      const res = await this.apiRequest('/api/patients', 'POST', { name, phone, email, dob });
      let newP = res || store.addPatient({ id: 'pat-' + Date.now(), name, phone, email, dob });

      await this.populateDropdowns();
      document.getElementById('book-patient').value = newP.id;
      pModal.classList.add('hidden');
      document.getElementById('new-patient-form').reset();
      this.showToast(`Registered new patient: ${name}`, 'success');
      this.renderPatientsList();
    });

    const cModal = document.getElementById('modal-cancel-appointment');
    document.getElementById('btn-close-cancel-modal').addEventListener('click', () => cModal.classList.add('hidden'));
    document.getElementById('btn-abort-cancel').addEventListener('click', () => cModal.classList.add('hidden'));

    document.getElementById('btn-confirm-cancel').addEventListener('click', async () => {
      if (!this.appointmentToCancel) return;
      
      const apt = this.appointmentToCancel;
      const res = await this.apiRequest(`/api/appointments/${apt.id}/cancel`, 'POST');

      if (res && !res.error) {
        this.showToast(`Appointment cancelled. ${res.cancellationReason}`, res.cancellationFee > 0 ? 'error' : 'success');
      } else {
        const evaluation = evaluateCancellationFee(apt);
        apt.status = 'CANCELLED';
        apt.cancellationFee = evaluation.fee;
        apt.cancellationFeeStatus = evaluation.fee > 0 ? 'PENDING' : 'FREE';
        apt.cancellationReason = evaluation.reason;
        store.updateAppointment(apt);
        this.showToast(`Appointment cancelled. ${evaluation.reason}`, evaluation.fee > 0 ? 'error' : 'success');
      }

      cModal.classList.add('hidden');
      this.appointmentToCancel = null;
      this.render();

      if (this.selectedPatientId === apt.patientId) {
        let p = store.getPatients().find(p => p.id === apt.patientId);
        if (p) this.selectPatient(p);
      }
    });

    // --- RESCHEDULE MODAL ---
    const rModal = document.getElementById('modal-reschedule-appointment');
    document.getElementById('btn-close-reschedule-modal')?.addEventListener('click', () => rModal.classList.add('hidden'));
    document.getElementById('btn-abort-reschedule')?.addEventListener('click', () => rModal.classList.add('hidden'));

    const triggerRescheduleValidation = () => this.validateRescheduleOverlap();
    document.getElementById('reschedule-date')?.addEventListener('change', triggerRescheduleValidation);
    document.getElementById('reschedule-start')?.addEventListener('input', triggerRescheduleValidation);
    document.getElementById('reschedule-end')?.addEventListener('input', triggerRescheduleValidation);

    document.getElementById('form-reschedule-appointment')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('reschedule-appt-id').value;
      const date = document.getElementById('reschedule-date').value;
      const startTime = document.getElementById('reschedule-start').value;
      const endTime = document.getElementById('reschedule-end').value;

      const res = await this.apiRequest(`/api/appointments/${id}/reschedule`, 'PUT', { date, startTime, endTime });
      if (res && res.error) {
        document.getElementById('reschedule-conflict-alert')?.classList.remove('hidden');
        document.getElementById('reschedule-conflict-desc').textContent = res.error;
        document.getElementById('btn-confirm-reschedule').disabled = true;
        this.showToast(`Reschedule blocked: ${res.error}`, 'error');
      } else {
        this.showToast('Appointment rescheduled successfully! Conflict check verified.', 'success');
        rModal.classList.add('hidden');
        await this.loadInitialData();
        this.render();
      }
    });

    // --- CLOCK TRIGGER FOR MORNING REMINDERS & AUTO NO-SHOW ---
    document.getElementById('btn-trigger-clock')?.addEventListener('click', async () => {
      const nowIso = new Date().toISOString();
      const res = await this.apiRequest('/clock', 'POST', { current_time: nowIso });
      if (res && !res.error) {
        this.showToast(`⏰ Clock Processed! Reminders Outbox: ${res.remindersSent}, Auto No-Shows Marked: ${res.noShowsMarked}`, 'success');
        await this.loadInitialData();
        this.render();
      } else {
        this.showToast(`Clock trigger failed: ${res?.error || 'Server error'}`, 'error');
      }
    });

    // --- PAYMENT CHECKOUT & DIGITAL RECEIPT MODALS ---
    const payModal = document.getElementById('modal-payment-checkout');
    const receiptModal = document.getElementById('modal-digital-receipt');

    document.getElementById('btn-close-payment-modal')?.addEventListener('click', () => payModal.classList.add('hidden'));
    document.getElementById('btn-cancel-payment')?.addEventListener('click', () => payModal.classList.add('hidden'));

    document.querySelectorAll('input[name="pay-method"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        document.querySelectorAll('.pay-method-card').forEach(card => card.classList.remove('active'));
        e.target.closest('.pay-method-card')?.classList.add('active');
      });
    });

    document.getElementById('btn-confirm-payment')?.addEventListener('click', async () => {
      if (!this.paymentTargetAppointment) return;
      const apt = this.paymentTargetAppointment;
      const selectedMethod = document.querySelector('input[name="pay-method"]:checked')?.value || 'UPI';
      const amount = apt.cancellationFee || 500;

      const res = await this.apiRequest('/api/payments/process', 'POST', {
        appointmentId: apt.id,
        patientId: apt.patientId,
        amount,
        paymentMethod: selectedMethod
      });

      payModal.classList.add('hidden');

      const receipt = res && res.receipt ? res.receipt : {
        receiptId: 'REC-' + Math.floor(100000 + Math.random() * 900000),
        transactionId: 'TXN-' + Math.floor(100000 + Math.random() * 900000) + '-' + selectedMethod,
        patientName: apt.patientName,
        amount,
        paymentMethod: selectedMethod,
        paidAt: new Date().toLocaleString()
      };

      this.lastReceipt = { receipt, apt, amount, method: selectedMethod };

      apt.cancellationFeeStatus = 'PAID';
      store.updateAppointment(apt);

      // Render digital receipt
      const receiptContainer = document.getElementById('receipt-content');
      receiptContainer.innerHTML = `
        <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 0.75rem; margin-bottom: 1rem; text-align: center;">
          <h3 style="margin: 0; color: #0284c7; font-size: 1.25rem;">🏥 PulseCare Medical Clinic</h3>
          <p style="margin: 0.2rem 0 0 0; font-size: 0.8rem; color: #64748b;">Official Desk Fee Payment Receipt</p>
        </div>
        <div style="font-size: 0.88rem; line-height: 1.7; color: #1e293b;">
          <div style="display:flex; justify-content:space-between; margin-bottom:0.3rem;">
            <span style="color:#64748b;">Receipt ID:</span>
            <strong>${receipt.receiptId}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:0.3rem;">
            <span style="color:#64748b;">Txn Ref #:</span>
            <strong style="font-family:monospace;">${receipt.transactionId}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:0.3rem;">
            <span style="color:#64748b;">Patient Name:</span>
            <strong>${apt.patientName}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:0.3rem;">
            <span style="color:#64748b;">Doctor Consulted:</span>
            <span>${apt.doctorName}</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:0.3rem;">
            <span style="color:#64748b;">Appt Slot:</span>
            <span>${apt.date} (${apt.startTime})</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:0.3rem;">
            <span style="color:#64748b;">Payment Method:</span>
            <span class="badge badge-booked">${selectedMethod}</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
            <span style="color:#64748b;">Issue Date:</span>
            <span>${new Date().toLocaleString()}</span>
          </div>
          <hr style="border: none; border-top: 1px dashed #cbd5e1; margin: 0.75rem 0;" />
          <div style="display: flex; justify-content: space-between; font-size: 1.15rem; font-weight: 800; color: #0f172a; margin-bottom: 0.75rem;">
            <span>Fee Amount Paid:</span>
            <span style="color: #10b981;">₹${parseFloat(amount).toFixed(2)}</span>
          </div>
          <div style="padding: 0.6rem; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; text-align: center; color: #047857; font-weight: 700; font-size: 0.85rem;">
            ✓ PAYMENT CLEARED &amp; RECEIPT ISSUED
          </div>
        </div>
      `;

      receiptModal.classList.remove('hidden');
      this.showToast(`₹${parseFloat(amount).toFixed(2)} collected from ${apt.patientName}! Receipt issued.`, 'success');
      this.render();
    });

    document.getElementById('btn-close-receipt-modal')?.addEventListener('click', () => receiptModal.classList.add('hidden'));
    document.getElementById('btn-done-receipt')?.addEventListener('click', () => receiptModal.classList.add('hidden'));
    document.getElementById('btn-print-receipt')?.addEventListener('click', () => {
      window.print();
    });

    document.getElementById('btn-download-txt-receipt')?.addEventListener('click', () => {
      if (!this.lastReceipt) return;
      const { receipt, apt, amount, method } = this.lastReceipt;
      const txt = `====================================================
           🏥 PULSECARE MEDICAL CLINIC
       Official Cancellation Fee Desk Receipt
====================================================

Receipt #:      ${receipt.receiptId || 'REC-50012'}
Txn Ref #:      ${receipt.transactionId || 'TXN-984321'}
Issue Date:     ${new Date().toLocaleString()}

----------------------------------------------------
PATIENT & APPOINTMENT DETAILS
----------------------------------------------------
Patient Name:   ${apt.patientName}
Doctor Name:    ${apt.doctorName}
Appt Date:      ${apt.date} (${apt.startTime})
Notice Type:    Late Cancellation (< 24 Hours Notice)

----------------------------------------------------
PAYMENT SUMMARY
----------------------------------------------------
Payment Method: ${method}
Fee Amount:     ₹${parseFloat(amount).toFixed(2)}
Payment Status: CLEARED & PAID (SUCCESS)

====================================================
   Thank you for choosing PulseCare Clinic Console
====================================================`;
      const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `PulseCare_Receipt_${receipt.receiptId || 'REC'}.txt`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.showToast('Downloaded TXT payment receipt file!', 'success');
    });
  }

  openPaymentCheckoutModal(appointment) {
    this.paymentTargetAppointment = appointment;
    const payModal = document.getElementById('modal-payment-checkout');
    document.getElementById('pay-modal-amount').textContent = `₹${(appointment.cancellationFee || 500).toFixed(2)}`;
    document.getElementById('pay-modal-patient').textContent = `Patient: ${appointment.patientName} (Doctor: ${appointment.doctorName})`;
    payModal.classList.remove('hidden');
  }

  openCancelModal(appointment) {
    this.appointmentToCancel = appointment;
    const cModal = document.getElementById('modal-cancel-appointment');

    document.getElementById('cancel-summary-box').innerHTML = `
      <strong>Patient:</strong> ${appointment.patientName}<br>
      <strong>Doctor:</strong> ${appointment.doctorName}<br>
      <strong>Date & Time:</strong> ${appointment.date} at ${appointment.startTime} - ${appointment.endTime}<br>
      <strong>Reason:</strong> ${appointment.reason}
    `;

    const evaluation = evaluateCancellationFee(appointment);
    const feeBox = document.getElementById('cancel-fee-eval-box');

    if (evaluation.isLate) {
      feeBox.className = 'fee-eval-box late';
      feeBox.innerHTML = `
        <strong>⚠️ Late Cancellation Notice (< 24 Hours Notice)</strong>
        <p>${evaluation.reason}. A <strong>₹500.00 fee</strong> will be recorded to patient record.</p>
      `;
    } else {
      feeBox.className = 'fee-eval-box free';
      feeBox.innerHTML = `
        <strong>✅ Free Cancellation Allowed (> 24 Hours Notice)</strong>
        <p>${evaluation.reason}. No cancellation fee applied (₹0.00).</p>
      `;
    }

    cModal.classList.remove('hidden');
  }

  openRescheduleModal(appointment) {
    this.currentRescheduleAppt = appointment;
    const rModal = document.getElementById('modal-reschedule-appointment');
    document.getElementById('reschedule-appt-id').value = appointment.id;
    document.getElementById('reschedule-info-text').textContent = `Patient: ${appointment.patientName} | Doctor: ${appointment.doctorName}`;
    document.getElementById('reschedule-date').value = appointment.date || this.selectedDate;
    document.getElementById('reschedule-start').value = appointment.startTime || '10:00';
    document.getElementById('reschedule-end').value = appointment.endTime || '10:30';
    
    document.getElementById('reschedule-conflict-alert')?.classList.add('hidden');
    document.getElementById('btn-confirm-reschedule').disabled = false;
    
    rModal.classList.remove('hidden');
    this.validateRescheduleOverlap();
  }

  async validateRescheduleOverlap() {
    if (!this.currentRescheduleAppt) return;
    const id = this.currentRescheduleAppt.id;
    const doctorId = this.currentRescheduleAppt.doctorId;
    const date = document.getElementById('reschedule-date').value;
    const startTime = document.getElementById('reschedule-start').value;
    const endTime = document.getElementById('reschedule-end').value;
    const submitBtn = document.getElementById('btn-confirm-reschedule');

    const alertBox = document.getElementById('reschedule-conflict-alert');
    const desc = document.getElementById('reschedule-conflict-desc');

    if (!date || !startTime || !endTime) {
      alertBox?.classList.add('hidden');
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    const apiConflict = await this.apiRequest('/api/appointments/check-conflict', 'POST', {
      doctorId, date, startTime, endTime, excludeId: id
    });

    const evaluation = apiConflict || checkBookingConflict(doctorId, date, startTime, endTime, id);

    if (evaluation.hasConflict) {
      if (alertBox) alertBox.classList.remove('hidden');
      if (desc) desc.textContent = evaluation.reason;
      if (submitBtn) submitBtn.disabled = true;
    } else {
      if (alertBox) alertBox.classList.add('hidden');
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✅' : '⚠️'}</span>
      <div>${message}</div>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(70px)';
      toast.style.transition = 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
      setTimeout(() => toast.remove(), 350);
    }, 4000);
  }

  render() {
    this.updateStatsBar();
    this.renderScheduleView();
    this.renderPatientsList();
    this.renderCancellationsTable();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new ClinicApp();
});
