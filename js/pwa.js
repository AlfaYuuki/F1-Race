let installPrompt = null;
const installButton = document.querySelector('#install-button');
let refreshing = false;

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  if (installButton) installButton.hidden = false;
});

installButton?.addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  installButton.hidden = true;
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  if (installButton) installButton.hidden = true;
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // If an installed app receives a new controller, reload once to use the new app shell.
  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const hasController = Boolean(navigator.serviceWorker.controller);
    if (hadController && hasController && !refreshing) {
      refreshing = true;
      location.reload();
      return;
    }
    // Remember the first controller so later updates reload an already-open app.
    hadController = hasController;
  });

  async function registerAndCheckForUpdates() {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {
        scope: './',
        updateViaCache: 'none'
      });
      await registration.update();
      if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    } catch (error) {
      console.warn('The F1 Race offline support could not be updated:', error);
    }
  }

  window.addEventListener('load', registerAndCheckForUpdates, { once: true });
  window.addEventListener('focus', () => { void registerAndCheckForUpdates(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void registerAndCheckForUpdates();
  });
}
