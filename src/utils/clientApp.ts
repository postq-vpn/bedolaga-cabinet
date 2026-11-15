import type { Device } from '@/types';

/** RdIcon name for a device platform as Remnawave reports it. */
export function platformIcon(platform: string) {
  const p = platform.toLowerCase();
  if (/ios|iphone|ipad|mac|darwin/.test(p)) return 'cabinet/os-apple-fill';
  if (/android/.test(p)) return 'cabinet/os-android-fill';
  if (/windows|win/.test(p)) return 'cabinet/os-windows-fill';
  if (/tv/.test(p)) return 'cabinet/os-tv-fill';
  return 'cabinet/os-windows-fill';
}

/** `happ` → `Happ`: the bot sends the client name lower-cased. */
export function clientAppLabel(name: string | null | undefined) {
  if (!name) return 'VPN';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Devices whose VPN client is older than the bot's minimum version. */
export function outdatedDevices(devices: Device[] | undefined) {
  return (devices ?? []).filter((d) => d.app_outdated);
}
