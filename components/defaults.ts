// Browser-safe copy of the default preferences (lib/config.ts imports Node modules,
// so the browser bundle must not import it).
import type { Preferences } from '../lib/types';
import { DEFAULT_VOICE_COMMANDS } from '../lib/voiceCommands';

export const DEFAULT_PREFERENCES_CLIENT: Preferences = {
  briefingTime: '07:30',
  timezone: 'Asia/Kolkata',
  scheduleEnabled: true,
  topics: ['ransomware', 'india', 'cloud', 'microsoft'],
  lookbackDays: 3,
  voiceRate: 0.95,
  voiceLang: 'en-IN',
  voiceName: '',
  voicePitch: 1,
  voiceGender: 'male',
  voiceCommands: DEFAULT_VOICE_COMMANDS,
  liveRefreshMinutes: 60,
  wakeOnLoad: true,
};
