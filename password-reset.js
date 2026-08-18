// Password Reset Logic
let resetEmail = '';

function showResetError(message) {
    const errorMessage = document.getElementById('errorMessage');
    if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.classList.add('show');
        setTimeout(() => {
            errorMessage.classList.remove('show');
        }, 5000);
    }
}

function showResetPasswordError(message) {
    const errorMessage = document.getElementById('resetErrorMessage');
    if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.classList.add('show');
        setTimeout(() => {
            errorMessage.classList.remove('show');
        }, 5000);
    }
}

function showStep(stepNumber) {
    // Hide all steps
    document.getElementById('step1-email').style.display = 'none';
    document.getElementById('step2-check').style.display = 'none';
    document.getElementById('step3-reset').style.display = 'none';
    document.getElementById('step4-success').style.display = 'none';

    // Show selected step
    if (stepNumber === 1) {
        document.getElementById('step1-email').style.display = 'block';
    } else if (stepNumber === 2) {
        document.getElementById('step2-check').style.display = 'block';
        document.getElementById('displayEmail').textContent = resetEmail;
    } else if (stepNumber === 3) {
        document.getElementById('step3-reset').style.display = 'block';
    } else if (stepNumber === 4) {
        document.getElementById('step4-success').style.display = 'block';
        // Redirect to login after 3 seconds
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 3000);
    }
}

function resetForm() {
    document.getElementById('emailForm').reset();
    document.getElementById('resetEmail').focus();
    showStep(1);
    showResetError('');
}

async function handleEmailSubmit(event) {
    event.preventDefault();

    if (!window.firebase || !window.firebase.sendPasswordResetEmail) {
        showResetError('Firebase not initialized properly');
        return;
    }

    const email = document.getElementById('resetEmail').value.trim();

    if (!email) {
        showResetError('Please enter your email address');
        return;
    }

    const submitBtn = document.getElementById('submitEmailBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    try {
        const { auth, sendPasswordResetEmail, ref, get, db } = window.firebase;

        // Check if email is registered in database
        const emailKey = email.replace(/\./g, '_');
        const doctorRef = ref(db, `doctors/${emailKey}`);
        const snapshot = await get(doctorRef);

        if (!snapshot.exists()) {
            showResetError('This email is not registered in our system. Please register first or try another email.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Reset Link';
            return;
        }

        // Send password reset email
        await sendPasswordResetEmail(auth, email);
        
        resetEmail = email;
        showStep(2);
        showResetError('');
    } catch (error) {
        let errorMessage = 'Error sending reset link. Please try again.';
        
        if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address';
        } else if (error.code === 'auth/user-not-found') {
            errorMessage = 'This email is not registered. Please create an account first.';
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = 'Too many reset attempts. Please try again later.';
        }
        
        showResetError(errorMessage);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Reset Link';
    }
}

async function handlePasswordReset(event) {
    event.preventDefault();

    if (!window.firebase || !window.firebase.confirmPasswordReset) {
        showResetPasswordError('Firebase not initialized properly');
        return;
    }

    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;

    if (!newPassword || !confirmPassword) {
        showResetPasswordError('Please fill in all fields');
        return;
    }

    if (newPassword !== confirmPassword) {
        showResetPasswordError('Passwords do not match');
        return;
    }

    if (newPassword.length < 6) {
        showResetPasswordError('Password must be at least 6 characters');
        return;
    }

    const resetBtn = document.getElementById('resetPasswordBtn');
    resetBtn.disabled = true;
    resetBtn.textContent = 'Updating...';

    try {
        // Get the reset code from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const resetCode = urlParams.get('oobCode');

        if (!resetCode) {
            showResetPasswordError('Invalid reset link. Please request a new password reset.');
            resetBtn.disabled = false;
            resetBtn.textContent = 'Update Password';
            return;
        }

        const { auth, confirmPasswordReset } = window.firebase;

        // Confirm password reset
        await confirmPasswordReset(auth, resetCode, newPassword);

        showStep(4);
        showResetPasswordError('');
    } catch (error) {
        let errorMessage = 'Error resetting password. Please try again.';
        
        if (error.code === 'auth/expired-action-code') {
            errorMessage = 'Reset link has expired. Please request a new password reset.';
        } else if (error.code === 'auth/invalid-action-code') {
            errorMessage = 'Invalid reset link. Please request a new password reset.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password is too weak. Use at least 6 characters.';
        }
        
        showResetPasswordError(errorMessage);
        resetBtn.disabled = false;
        resetBtn.textContent = 'Update Password';
    }
}

// Check if user came from email reset link
function checkResetCode() {
    const urlParams = new URLSearchParams(window.location.search);
    const resetCode = urlParams.get('oobCode');
    const mode = urlParams.get('mode');

    if (mode === 'resetPassword' && resetCode) {
        // Verify the reset code is valid
        if (window.firebase && window.firebase.verifyPasswordResetCode) {
            const { auth, verifyPasswordResetCode } = window.firebase;
            
            verifyPasswordResetCode(auth, resetCode)
                .then(() => {
                    // Code is valid, show password reset form
                    showStep(3);
                })
                .catch((error) => {
                    showResetError('Invalid or expired reset link. Please request a new password reset.');
                    setTimeout(() => {
                        showStep(1);
                    }, 2000);
                });
        }
    } else {
        // Show email entry form
        showStep(1);
    }
}

// Setup event listeners
document.addEventListener('DOMContentLoaded', () => {
    const emailForm = document.getElementById('emailForm');
    const resetPasswordForm = document.getElementById('resetPasswordForm');

    if (emailForm) {
        emailForm.addEventListener('submit', handleEmailSubmit);
    }

    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', handlePasswordReset);
    }

    // Check if coming from reset email link
    checkResetCode();
});
