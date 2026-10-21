import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'android' | 'ios' | 'web'

/** localStorage com try/catch (modo privado, quota…). */
export const kv = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem('perto.' + key);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem('perto.' + key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
  del(key: string) {
    try {
      localStorage.removeItem('perto.' + key);
    } catch {
      /* ignore */
    }
  },
};

export async function haptic(kind: 'light' | 'medium' | 'success' | 'warning' = 'light') {
  if (!isNative) return navigator.vibrate?.(kind === 'light' ? 8 : 18);
  const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
  if (kind === 'success') return Haptics.notification({ type: NotificationType.Success });
  if (kind === 'warning') return Haptics.notification({ type: NotificationType.Warning });
  return Haptics.impact({ style: kind === 'light' ? ImpactStyle.Light : ImpactStyle.Medium });
}

export async function copyText(text: string) {
  try {
    if (isNative) {
      const { Clipboard } = await import('@capacitor/clipboard');
      await Clipboard.write({ string: text });
    } else await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareText(title: string, text: string) {
  try {
    if (isNative) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, dialogTitle: title });
    } else if (navigator.share) await navigator.share({ title, text });
    else return copyText(text);
    return true;
  } catch {
    return false;
  }
}

export async function batteryInfo(): Promise<{ battery: number | null; charging: boolean }> {
  try {
    if (isNative) {
      const { Device } = await import('@capacitor/device');
      const b = await Device.getBatteryInfo();
      return { battery: b.batteryLevel ?? null, charging: !!b.isCharging };
    }
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> };
    const b = await nav.getBattery?.();
    return b ? { battery: b.level, charging: b.charging } : { battery: null, charging: false };
  } catch {
    return { battery: null, charging: false };
  }
}

export async function notify(title: string, body: string) {
  try {
    if (isNative) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.schedule({
        notifications: [{ id: Math.floor(Math.random() * 2 ** 30), title, body, smallIcon: 'ic_stat_perto' }],
      });
    } else if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification(title, { body, icon: '/icon-192.png' });
    }
  } catch {
    /* sem permissão */
  }
}

export async function askNotifications() {
  try {
    if (isNative) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const cur = await LocalNotifications.checkPermissions();
      if (cur.display !== 'granted') await LocalNotifications.requestPermissions();
    } else if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  } catch {
    /* ignore */
  }
}
