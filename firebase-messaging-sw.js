importScripts('./firebase-app-compat.js');
importScripts('./firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyB3oEgakHXj4NOos0QO61-HOuM165VOVYI",
    authDomain: "pyapay-driver.firebaseapp.com",
    projectId: "pyapay-driver",
    storageBucket: "pyapay-driver.firebasestorage.app",
    messagingSenderId: "719139320259",
    appId: "1:719139320259:web:2e81dc869c0358135bcd76"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// နောက်ကွယ်မှာ message လက်ခံဖို့
messaging.onBackgroundMessage((payload) => {
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/favicon.ico' 
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});
