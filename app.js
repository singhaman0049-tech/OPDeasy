const STORAGE_KEY = 'smart-opd-queue-data';
const DAY_RESET_MS = 24 * 60 * 60 * 1000;
const MAX_HISTORY_DAYS = 30;

function createFreshDayData(history = []) {
    return {
        patients: [],
        nextToken: 101,
        totalConsultationSeconds: 0,
        dayStartedAt: new Date().toISOString(),
        history
    };
}

function archiveCurrentDay(data) {
    const consultation = getConsultationSummary(data);
    if (!data.patients.length && !consultation.totalSeconds) return null;

    return {
        date: data.dayStartedAt,
        archivedAt: new Date().toISOString(),
        totalPatients: data.patients.length,
        completedPatients: data.patients.filter(patient => patient.status === 'completed').length,
        totalConsultationSeconds: consultation.totalSeconds,
        averageConsultationSeconds: consultation.averageSeconds,
        patients: data.patients.map(patient => ({
            token: patient.token,
            name: patient.name,
            age: patient.age,
            status: patient.status,
            createdAt: patient.createdAt,
            consultationSeconds: patient.status === 'consulting'
                ? (Number(patient.accumulatedSeconds) || 0) + getElapsedSeconds(patient)
                : Number(patient.consultationSeconds) || Number(patient.accumulatedSeconds) || 0
        }))
    };
}

function getData() {
    const fallback = createFreshDayData();

    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (!saved || !Array.isArray(saved.patients)) return fallback;

        const data = {
            ...fallback,
            ...saved,
            history: Array.isArray(saved.history) ? saved.history : []
        };
        const dayStartedAt = Date.parse(data.dayStartedAt);

        if (!Number.isFinite(dayStartedAt) || Date.now() - dayStartedAt >= DAY_RESET_MS) {
            const archivedDay = archiveCurrentDay(data);
            const history = archivedDay
                ? [archivedDay, ...data.history].slice(0, MAX_HISTORY_DAYS)
                : data.history;
            const newDay = createFreshDayData(history);
            saveData(newDay);
            return newDay;
        }

        return data;
    } catch {
        return fallback;
    }
}

function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getActivePatients(data = getData()) {
    return data.patients.filter(patient => patient.status !== 'completed');
}

function getWaitingPatients(data = getData()) {
    return data.patients.filter(patient => patient.status === 'waiting');
}

function getCurrentPatient(data = getData()) {
    return data.patients.find(patient => patient.status === 'consulting') || null;
}

function getElapsedSeconds(patient) {
    const startTime = patient?.startedAt ? Date.parse(patient.startedAt) : NaN;
    return Number.isFinite(startTime) ? Math.max(0, (Date.now() - startTime) / 1000) : 0;
}

function getConsultationSummary(data = getData()) {
    const current = getCurrentPatient(data);
    const completed = data.patients.filter(patient => patient.status === 'completed').length;
    const pausedTime = getWaitingPatients(data).reduce(
        (seconds, patient) => seconds + (Number(patient.accumulatedSeconds) || 0),
        0
    );
    const currentTime = current
        ? (Number(current.accumulatedSeconds) || 0) + getElapsedSeconds(current)
        : 0;
    const totalSeconds = (Number(data.totalConsultationSeconds) || 0) + pausedTime + currentTime;
    const averageSeconds = completed || current ? (
        (Number(data.totalConsultationSeconds) || 0) + currentTime
    ) / (completed + (current ? 1 : 0)) : 0;

    return { totalSeconds, averageSeconds };
}

function formatDuration(seconds) {
    const totalSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
}

function getPosition(patient, data = getData()) {
    if (!patient || patient.status === 'completed') return null;

    if (patient.status === 'consulting') return 0;

    const waiting = getWaitingPatients(data);
    return waiting.findIndex(item => item.token === patient.token) + 1;
}

function formatStatus(status) {
    return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatTime(isoString) {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(isoString) {
    return new Date(isoString).toLocaleDateString([], {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

function renderStats(data = getData()) {
    const current = getCurrentPatient(data);
    const waiting = getWaitingPatients(data).length;
    const completed = data.patients.filter(patient => patient.status === 'completed').length;
    const active = getActivePatients(data).length;
    const consultation = getConsultationSummary(data);

    setText('doctorHandled', completed);
    setText('doctorRemaining', active);
    setText('doctorWaiting', waiting);
    setText('doctorAverage', formatDuration(consultation.averageSeconds));
    setText('doctorTotalTime', formatDuration(consultation.totalSeconds));
    setText('displayRegisteredStat', data.patients.length);
    setText('displayAverageStat', formatDuration(consultation.averageSeconds));
    setText('displayTokenStat', current ? current.token : '--');
    setText('displayPatientStat', current ? current.name : 'Please wait for your token');
    setText('displayRegistered', data.patients.length);
    setText('displayAverage', formatDuration(consultation.averageSeconds));
    setText('displayToken', current ? current.token : '--');
    setText('displayPatient', current ? current.name : 'Please wait for your token');
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

// Firebase Database Functions
async function isDoctorRegistered(email) {
    try {
        if (!window.firebase || !window.firebase.db) {
            console.warn('Firebase database not initialized');
            return false;
        }

        const { ref, get } = window.firebase;
        const db = window.firebase.db;
        const emailKey = email.replace(/\./g, '_');
        const doctorRef = ref(db, `doctors/${emailKey}`);
        
        const snapshot = await get(doctorRef);
        return snapshot.exists();
    } catch (error) {
        console.error('Error checking doctor registration:', error);
        return false;
    }
}

async function updateLastLogin(email) {
    try {
        if (!window.firebase || !window.firebase.db) {
            return;
        }

        const { ref, set } = window.firebase;
        const db = window.firebase.db;
        const emailKey = email.replace(/\./g, '_');
        const lastLoginRef = ref(db, `doctors/${emailKey}/lastLogin`);
        
        await set(lastLoginRef, new Date().toISOString());
    } catch (error) {
        console.error('Error updating last login:', error);
    }
}

async function savePatientToDatabase(patient) {
    try {
        if (!window.firebase || !window.firebase.db) {
            console.warn('Firebase database not initialized');
            return;
        }

        const { ref, set } = window.firebase;
        const db = window.firebase.db;
        const patientRef = ref(db, `patients/${patient.token}`);
        
        await set(patientRef, {
            token: patient.token,
            name: patient.name,
            phone: patient.phone,
            age: patient.age,
            reason: patient.reason,
            status: patient.status,
            createdAt: patient.createdAt
        });
        
        console.log('Patient data saved to database');
    } catch (error) {
        console.error('Error saving patient to database:', error);
    }
}

function showLoginError(message) {
    const errorMessage = document.getElementById('errorMessage');
    if (errorMessage) {
        errorMessage.textContent = message;
        if (message) {
            errorMessage.classList.add('show');
        } else {
            errorMessage.classList.remove('show');
        }
        setTimeout(() => {
            if (message) {
                errorMessage.classList.remove('show');
            }
        }, 5000);
    }
}

async function handleLogin(doctorName, email, password) {
    try {
        if (!window.firebase || !window.firebase.signInWithEmailAndPassword) {
            showLoginError('Firebase authentication not initialized');
            return;
        }

        // First check if doctor is registered
        const isRegistered = await isDoctorRegistered(email);
        if (!isRegistered) {
            showLoginError('Email not registered. Please create an account first.');
            return;
        }

        const { auth, signInWithEmailAndPassword } = window.firebase;
        
        // Sign in with email and password
        await signInWithEmailAndPassword(auth, email, password);
        
        // Update last login time
        await updateLastLogin(email);
        
        // Store user info in session
        sessionStorage.setItem('smart-opd-user', JSON.stringify({ 
            name: doctorName, 
            email: email,
            loginTime: new Date().toISOString()
        }));
        
        // Redirect to patient registration
        window.location.href = 'patient-registration.html';
    } catch (error) {
        let errorMessage = 'Login failed. Please try again.';
        
        if (error.code === 'auth/invalid-credential') {
            errorMessage = 'Invalid email or password';
        } else if (error.code === 'auth/user-not-found') {
            errorMessage = 'Email not registered. Please create an account first.';
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = 'Incorrect password';
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = 'Too many login attempts. Please try again later.';
        }
        
        showLoginError(errorMessage);
    }
}

function setupLogin() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    form.addEventListener('submit', event => {
        event.preventDefault();
        
        const doctorName = document.getElementById('doctorName').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const rememberMe = document.getElementById('rememberMe').checked;

        if (!doctorName || !email || !password) {
            showLoginError('Please fill in all fields');
            return;
        }

        // Save remember me preference
        if (rememberMe) {
            localStorage.setItem('opdeasy-remember-email', email);
        } else {
            localStorage.removeItem('opdeasy-remember-email');
        }

        handleLogin(doctorName, email, password);
    });

    // Auto-fill email if remember me was checked
    const savedEmail = localStorage.getItem('opdeasy-remember-email');
    if (savedEmail) {
        const emailInput = document.getElementById('email');
        if (emailInput) {
            emailInput.value = savedEmail;
            const rememberCheckbox = document.getElementById('rememberMe');
            if (rememberCheckbox) rememberCheckbox.checked = true;
        }
    }
}

function setupRegistration() {
    const form = document.getElementById('patientForm');
    if (!form) return;

    form.addEventListener('submit', event => {
        event.preventDefault();

        const data = getData();
        const patient = {
            token: data.nextToken,
            name: document.getElementById('patientName').value.trim(),
            phone: document.getElementById('patientPhone').value.trim(),
            age: document.getElementById('patientAge').value,
            reason: document.getElementById('patientReason').value.trim(),
            createdAt: new Date().toISOString(),
            status: 'waiting'
        };

        data.patients.push(patient);
        data.nextToken += 1;
        saveData(data);
        
        // Save patient to Firebase database
        savePatientToDatabase(patient);
        
        setText('registeredToken', patient.token);
        document.getElementById('registrationNotice').classList.add('show');
        form.reset();
        document.getElementById('registrationNotice').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
}

function setupDisplay() {
    if (!document.getElementById('displayRegistered')) return;

    renderStats();
    renderLivePatientList();
}

function renderLivePatientList() {
    const table = document.getElementById('livePatientList');
    if (!table) return;

    const data = getData();
    const activePatients = getActivePatients(data).slice(0, 10);

    table.innerHTML = activePatients.length
        ? activePatients.map(patient => `<tr>
            <td>${patient.token}</td>
            <td>${escapeHtml(patient.name)}</td>
            <td>${patient.status === 'consulting' ? 'Now serving' : getPosition(patient, data)}</td>
            <td><span class="status ${patient.status}">${formatStatus(patient.status)}</span></td>
        </tr>`).join('')
        : '<tr><td class="empty-row" colspan="4">No patients have registered yet.</td></tr>';
}

function setupDoctorDashboard() {
    if (!document.getElementById('doctorHandled')) return;

    document.getElementById('nextBtn').addEventListener('click', serveNextPatient);
    document.getElementById('skipBtn').addEventListener('click', skipCurrentPatient);
    renderDoctorDashboard();
}

function serveNextPatient() {
    const data = getData();
    const current = getCurrentPatient(data);

    if (current) {
        const consultationSeconds = (Number(current.accumulatedSeconds) || 0) + getElapsedSeconds(current);
        current.status = 'completed';
        current.completedAt = new Date().toISOString();
        current.consultationSeconds = consultationSeconds;
        data.totalConsultationSeconds = (Number(data.totalConsultationSeconds) || 0) + consultationSeconds;
    }

    const next = getWaitingPatients(data)[0];
    if (next) {
        next.status = 'consulting';
        next.startedAt = new Date().toISOString();
    }

    saveData(data);
    renderDoctorDashboard();
}

function skipCurrentPatient() {
    const data = getData();
    const currentIndex = data.patients.findIndex(patient => patient.status === 'consulting');

    if (currentIndex === -1) return;

    const [current] = data.patients.splice(currentIndex, 1);
    current.accumulatedSeconds = (Number(current.accumulatedSeconds) || 0) + getElapsedSeconds(current);
    delete current.startedAt;
    current.status = 'waiting';
    current.skipped = true;
    data.patients.push(current);

    const next = getWaitingPatients(data)[0];
    if (next) {
        next.status = 'consulting';
        next.startedAt = new Date().toISOString();
    }

    saveData(data);
    renderDoctorDashboard();
}

function renderDoctorDashboard() {
    const data = getData();
    const current = getCurrentPatient(data);
    const table = document.getElementById('doctorQueueTable');

    renderStats(data);
    setText('currentToken', current ? current.token : '--');
    setText('currentName', current ? current.name : 'No patient is being consulted');
    setText('currentAge', current ? `${current.age || '--'} years` : '--');

    document.getElementById('skipBtn').disabled = !current;
    document.getElementById('skipBtn').style.opacity = current ? '1' : '.55';

    const queue = data.patients.filter(patient => patient.status !== 'completed');
    table.innerHTML = queue.length
        ? queue.map(patient => `<tr>
            <td>${patient.token}</td>
            <td>${escapeHtml(patient.name)}</td>
            <td>${patient.age || '--'}</td>
            <td>${formatTime(patient.createdAt)}</td>
            <td><span class="status ${patient.status}">${formatStatus(patient.status)}</span></td>
            <td>${patient.status === 'consulting' ? 'Now' : `${getPosition(patient, data)} in queue`}</td>
        </tr>`).join('')
        : '<tr><td class="empty-row" colspan="6">No patients are waiting for consultation.</td></tr>';

    renderHistory(data);
}

function renderHistory(data) {
    const table = document.getElementById('historyTable');
    if (!table) return;

    const previousDay = data.history[0];
    if (!previousDay) {
        setText('historyDate', '--');
        setText('historyRegistered', '0');
        setText('historyCompleted', '0');
        setText('historyTotalTime', '0m 0s');
        setText('historyAverageTime', '0m 0s');
        table.innerHTML = '<tr><td class="empty-row" colspan="6">History will appear here after the first 24-hour reset.</td></tr>';
        return;
    }

    setText('historyDate', formatDate(previousDay.date));
    setText('historyRegistered', previousDay.totalPatients);
    setText('historyCompleted', previousDay.completedPatients);
    setText('historyTotalTime', formatDuration(previousDay.totalConsultationSeconds));
    setText('historyAverageTime', formatDuration(previousDay.averageConsultationSeconds));

    table.innerHTML = previousDay.patients.length
        ? previousDay.patients.map(patient => `<tr>
            <td>${patient.token}</td>
            <td>${escapeHtml(patient.name)}</td>
            <td>${patient.age || '--'}</td>
            <td>${formatTime(patient.createdAt)}</td>
            <td><span class="status ${patient.status}">${formatStatus(patient.status)}</span></td>
            <td>${formatDuration(patient.consultationSeconds)}</td>
        </tr>`).join('')
        : '<tr><td class="empty-row" colspan="6">No patient records are available for the previous day.</td></tr>';
}

function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = value;
    return element.innerHTML;
}

function applyLoggedInUser() {
    const user = JSON.parse(sessionStorage.getItem('smart-opd-user') || 'null');
    const target = document.getElementById('loggedInUser');
    if (user && target) target.textContent = user.name;
}

function refreshPage() {
    renderStats();
    renderLivePatientList();
    if (document.getElementById('doctorHandled')) renderDoctorDashboard();
}

document.addEventListener('DOMContentLoaded', () => {
    applyLoggedInUser();
    setupLogin();
    setupRegistration();
    setupDisplay();
    setupDoctorDashboard();
    window.addEventListener('storage', refreshPage);
    setInterval(refreshPage, 1000);
});
