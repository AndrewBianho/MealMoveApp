importScripts("https://www.gstatic.com/firebasejs/12.15.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyACC_W16oWf9yf1imqlyejxJuPLaA2qPzg",
  authDomain: "mealmove-cd53f.firebaseapp.com",
  projectId: "mealmove-cd53f",
  messagingSenderId: "454029794003",
  appId: "1:454029794003:web:d574d6bd21cd96ffe61226",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || "Meal Move", {
    body: body || "",
    icon: "/mealmovelogo.png",
    data: { url: (payload.data && payload.data.url) || "/" },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(clients.openWindow(url));
});
