import { PushNotifications } from '@capacitor/push-notifications';
import { api } from './api';
import { isNative, platform } from './native';
import { flyTo, setTab } from './store';

/**
 * Push com o app fechado (FCM). Só ativa em builds com Firebase configurado
 * (VITE_PUSH_ENABLED=true + google-services.json), senão o registro quebraria no Android.
 */
export async function initPush() {
  if (!isNative || import.meta.env.VITE_PUSH_ENABLED !== 'true') return;
  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;
    if (platform === 'android') {
      await PushNotifications.createChannel({ id: 'family', name: 'Família', description: 'Chegadas, saídas e avisos', importance: 4 });
      await PushNotifications.createChannel({ id: 'sos', name: 'SOS', description: 'Alertas de emergência', importance: 5, vibration: true });
    }
    await PushNotifications.addListener('registration', (t) => void api.pushRegister(t.value, platform).catch(() => {}));
    await PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
      const lat = Number(a.notification.data?.lat);
      const lng = Number(a.notification.data?.lng);
      setTab('map');
      if (Number.isFinite(lat) && Number.isFinite(lng) && a.notification.data?.lat) flyTo(lat, lng, 16);
    });
    await PushNotifications.register();
  } catch {
    /* sem Firebase/permissão: segue só com WebSocket */
  }
}
