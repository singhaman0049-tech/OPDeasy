# Smart OPD Queue System

Open `login.html` in a browser to start the four-page demo.

- Hospital reception staff register patients on the Patient Registration page and receive an automatically generated token.
- The Live Display page shows total registrations, the active token, live average consultation time, and the next 10 active patients.
- The Doctor Dashboard lets the doctor call the next patient or skip the current one. `NEXT` completes the current consultation (if any) and calls the next waiting patient; `SKIP` returns the current patient to the end of the queue and calls the next person. It also shows the saved patient-operation history for the previous day.

The demo stores queue data in the browser's `localStorage`, so each page shares the same queue when opened in the same browser. It resets the queue and time-based statistics automatically after 24 hours while saving the previous day's history (up to 30 days). To reset the demo sooner, clear the browser's site data for the folder/page origin.
