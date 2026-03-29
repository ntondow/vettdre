// VettdRE Service Worker — Push Notifications

self.addEventListener("push", (event) => {
  if (!event.data) return;

  const data = event.data.json();

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      tag: data.tag || "leasing-alert",
      data: { url: data.url },
      requireInteraction: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      const url = event.notification.data.url;

      // Try to focus an existing leasing tab
      for (const client of clientList) {
        if (client.url.includes("/leasing") && "focus" in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }

      // No existing tab — open a new one
      clients.openWindow(url);
    })
  );
});
