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
async function saveDoctorToDatabase(doctorData) {
    try {
        if (!window.firebase || !window.firebase.db) {
            console.warn('Firebase database not initialized');
            return;
        }

        const { ref, set } = window.firebase;
        const db = window.firebase.db;
        const timestamp = new Date().toISOString();
        const emailKey = doctorData.email.replace(/\./g, '_');
        const doctorRef = ref(db, `doctors/${emailKey}`);
        
        await set(doctorRef, {
            name: doctorData.name,
            email: doctorData.email,
            phone: doctorData.phone,
            specialization: doctorData.specialization,
            licenseNumber: doctorData.licenseNumber,
            isVerified: true,
            registeredAt: timestamp,
            lastLogin: timestamp,
            status: 'active'
        });
        
        console.log('Doctor registered and saved to database');
    } catch (error) {
        console.error('Error saving doctor to database:', error);
    }
}

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

async function handlePasswordReset(email) {
    try {
        if (!window.firebase || !window.firebase.sendPasswordResetEmail) {
            showResetMessage('Firebase not initialized properly', 'error');
            return;
        }

        const { auth, sendPasswordResetEmail } = window.firebase;
        await sendPasswordResetEmail(auth, email);
        showResetMessage('Password reset link sent to your email!', 'success');
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            showResetMessage('No account found with this email address', 'error');
        } else if (error.code === 'auth/invalid-email') {
            showResetMessage('Invalid email address', 'error');
        } else {
            showResetMessage('Error sending reset link: ' + error.message, 'error');
        }
    }
}

function showResetMessage(message, type) {
    const resetMessage = document.getElementById('resetMessage');
    if (resetMessage) {
        resetMessage.textContent = message;
        resetMessage.className = `reset-message ${type}`;
    }
}

async function handleRegistration(doctorData) {
    try {
        if (!window.firebase || !window.firebase.createUserWithEmailAndPassword) {
            showLoginError('Firebase authentication not initialized');
            return;
        }

        const { auth, createUserWithEmailAndPassword } = window.firebase;
        
        // Create user account in Firebase Auth
        await createUserWithEmailAndPassword(auth, doctorData.email, doctorData.password);
        
        // Save doctor info to database
        await saveDoctorToDatabase(doctorData);
        
        showLoginError('');
        showRegistrationSuccess('Registration successful! Please login with your credentials.');
        
        // Switch back to login form after 2 seconds
        setTimeout(() => {
            switchToLogin();
        }, 2000);
        
    } catch (error) {
        let errorMessage = 'Registration failed. Please try again.';
        
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'This email is already registered. Please login or use a different email.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password is too weak. Use at least 6 characters.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address';
        } else if (error.code === 'auth/operation-not-allowed') {
            errorMessage = 'Registration is currently disabled. Contact administrator.';
        }
        
        showLoginError(errorMessage);
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

function showRegistrationSuccess(message) {
    const errorMessage = document.getElementById('errorMessage');
    if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.classList.add('show');
        errorMessage.style.backgroundColor = '#dcfce7';
        errorMessage.style.borderColor = '#86efac';
        errorMessage.style.color = '#166534';
    }
}

function switchToRegistration() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registrationForm').style.display = 'block';
    document.querySelector('.login-footer').style.display = 'none';
    document.getElementById('registrationFooter').style.display = 'block';
    showLoginError('');
}

function switchToLogin() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registrationForm').style.display = 'none';
    document.querySelector('.login-footer').style.display = 'block';
    document.getElementById('registrationFooter').style.display = 'none';
    showLoginError('');
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

    // Setup form switching
    const switchToRegisterBtn = document.getElementById('switchToRegister');
    const switchToLoginBtn = document.getElementById('switchToLogin');

    if (switchToRegisterBtn) {
        switchToRegisterBtn.addEventListener('click', event => {
            event.preventDefault();
            switchToRegistration();
        });
    }

    if (switchToLoginBtn) {
        switchToLoginBtn.addEventListener('click', event => {
            event.preventDefault();
            switchToLogin();
        });
    }

    // Setup Forgot Password Modal
    const modal = document.getElementById('forgotPasswordModal');
    const forgotLink = document.getElementById('forgotPassword');
    const closeBtn = document.querySelector('.close');
    const resetButton = document.getElementById('resetButton');

    if (forgotLink) {
        forgotLink.addEventListener('click', event => {
            event.preventDefault();
            modal.classList.add('show');
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('show');
            document.getElementById('resetMessage').className = 'reset-message';
            document.getElementById('resetEmail').value = '';
        });
    }

    if (resetButton) {
        resetButton.addEventListener('click', async () => {
            const resetEmail = document.getElementById('resetEmail').value.trim();
            if (!resetEmail) {
                showResetMessage('Please enter your email address', 'error');
                return;
            }
            await handlePasswordReset(resetEmail);
        });
    }

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

    // Close modal when clicking outside
    window.addEventListener('click', event => {
        if (event.target === modal) {
            modal.classList.remove('show');
        }
    });
}

function setupRegistration() {
    const patientForm = document.getElementById('patientForm');
    const registrationForm = document.getElementById('registrationForm');

    // Patient Registration (existing)
    if (patientForm) {
        patientForm.addEventListener('submit', event => {
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
            patientForm.reset();
            document.getElementById('registrationNotice').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    }

    // Doctor Registration (new)
    if (registrationForm) {
        registrationForm.addEventListener('submit', async event => {
            event.preventDefault();

            const name = document.getElementById('regDoctorName').value.trim();
            const email = document.getElementById('regEmail').value.trim();
            const phone = document.getElementById('regPhone').value.trim();
            const specialization = document.getElementById('regSpecialization').value.trim();
            const licenseNumber = document.getElementById('regLicenseNumber').value.trim();
            const password = document.getElementById('regPassword').value;
            const confirmPassword = document.getElementById('regConfirmPassword').value;
            const agreeTerms = document.getElementById('regAgreeTerms').checked;

            // Validation
            if (!name || !email || !phone || !specialization || !licenseNumber || !password || !confirmPassword) {
                showLoginError('Please fill in all fields');
                return;
            }

            if (password !== confirmPassword) {
                showLoginError('Passwords do not match');
                return;
            }

            if (password.length < 6) {
                showLoginError('Password must be at least 6 characters');
                return;
            }

            if (!agreeTerms) {
                showLoginError('Please agree to the terms and conditions');
                return;
            }

            // Proceed with registration
            const doctorData = {
                name,
                email,
                phone,
                specialization,
                licenseNumber,
                password
            };

            await handleRegistration(doctorData);
        });
    }
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
