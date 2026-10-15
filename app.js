function setupRegistration() {
    const form = document.getElementById('patientForm');
    if (!form) return;

    form.addEventListener('submit', async event => {
        event.preventDefault();

        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        try {
            const patientName = document.getElementById('patientName').value.trim();
            const patientPhone = document.getElementById('patientPhone').value.trim();
            const patientAge = document.getElementById('patientAge').value.trim();
            const patientReason = document.getElementById('patientReason').value.trim();

            if (!patientName || !patientPhone || !patientAge || !patientReason) {
                throw new Error('Please fill in all required patient fields.');
            }

            let data = await getFirebaseOpdData();
            if (!data) {
                data = createFreshDayData();
            }

            if (!Array.isArray(data.patients)) {
                data.patients = [];
            }

            data.nextToken = Number(data.nextToken) || 101;

            const patient = {
                token: Number(data.nextToken),
                name: patientName,
                phone: patientPhone,
                age: Number(patientAge),
                reason: patientReason,
                createdAt: new Date().toISOString(),
                status: 'waiting'
            };

            data.patients.push(patient);
            data.nextToken += 1;

            const saved = await saveFirebaseOpdData(data);
            if (!saved) {
                throw new Error('Failed to save patient to Firebase');
            }

            setText('registeredToken', patient.token);

            const notice = document.getElementById('registrationNotice');
            if (notice) {
                notice.classList.add('show');
            }

            form.reset();

            const registrationNotice = document.getElementById('registrationNotice');
            if (registrationNotice) {
                registrationNotice.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest'
                });
            }

            renderStats(data);
            renderLivePatientList(data);

        } catch (error) {
            console.error('Patient registration failed:', error);
            alert(error.message || 'Could not register patient. Please try again.');
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
            }
        }
    });
}
