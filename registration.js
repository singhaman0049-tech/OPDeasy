// Doctor Registration Logic

function showRegistrationError(message) {
    const errorMessage = document.getElementById('errorMessage');
    if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.classList.add('show');
        setTimeout(() => {
            errorMessage.classList.remove('show');
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
        setTimeout(() => {
            errorMessage.classList.remove('show');
        }, 3000);
    }
}

async function saveDoctorToDatabase(doctorData) {
    try {
        if (!window.firebase || !window.firebase.db) {
            console.warn('Firebase database not initialized');
            return false;
        }

        const { auth, ref, set } = window.firebase;
        const db = window.firebase.db;

        const user = auth.currentUser;

        if (!user) {
            console.error('No authenticated Firebase user found');
            return false;
        }

        const timestamp = new Date().toISOString();

        const doctorRef = ref(db, `doctors/${user.uid}`);

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

        console.log('Doctor saved to Firebase:', user.uid);

        return true;

    } catch (error) {
        console.error('Error saving doctor to database:', error);
        return false;
    }
}
async function handleDoctorRegistration(event) {
    event.preventDefault();

    if (!window.firebase || !window.firebase.createUserWithEmailAndPassword) {
        showRegistrationError('Firebase authentication not initialized');
        return;
    }

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
        showRegistrationError('Please fill in all fields');
        return;
    }

    if (password !== confirmPassword) {
        showRegistrationError('Passwords do not match');
        return;
    }

    if (password.length < 6) {
        showRegistrationError('Password must be at least 6 characters');
        return;
    }

    if (!agreeTerms) {
        showRegistrationError('Please agree to the terms and conditions');
        return;
    }

    // Validate phone number (basic validation)
    if (!/^\d{10,}$/.test(phone.replace(/\D/g, ''))) {
        showRegistrationError('Please enter a valid phone number');
        return;
    }

    const submitBtn = document.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating Account...';

    try {
        const { auth, createUserWithEmailAndPassword } = window.firebase;
        
        // Create user account in Firebase Auth
        await createUserWithEmailAndPassword(auth, email, password);
        
        // Save doctor info to database
        const saved = await saveDoctorToDatabase({
            name,
            email,
            phone,
            specialization,
            licenseNumber,
            password
        });

        if (saved) {
            showRegistrationSuccess('Account created successfully! Redirecting to login...');
            
            // Redirect to login after 2 seconds
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        } else {
            showRegistrationError('Account created but failed to save data. Please contact support.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Account';
        }
        
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
        
        showRegistrationError(errorMessage);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
    }
}

// Setup event listeners
document.addEventListener('DOMContentLoaded', () => {
    const registrationForm = document.getElementById('doctorRegistrationForm');
    
    if (registrationForm) {
        registrationForm.addEventListener('submit', handleDoctorRegistration);
    }
});
