export interface InstantLaunchMatch {
  appName: string;
  launchUrl?: string;
  nativeIntentUri: string;
  isCamera?: boolean;
}

const APP_RULES: Array<{
  pattern: RegExp;
  appName: string;
  launchUrl?: string;
  nativeIntentUri: string;
  isCamera?: boolean;
}> = [
  {
    pattern: /\b(youtube|yt)\b/i,
    appName: 'YouTube',
    launchUrl: 'https://www.youtube.com',
    nativeIntentUri:
      'intent://www.youtube.com#Intent;package=com.google.android.youtube;scheme=https;S.browser_fallback_url=https%3A%2F%2Fwww.youtube.com;end',
  },
  {
    pattern: /\b(whatsapp|what's\s*app|watsapp)\b/i,
    appName: 'WhatsApp',
    launchUrl: 'https://api.whatsapp.com/send',
    nativeIntentUri:
      'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.whatsapp;S.browser_fallback_url=https%3A%2F%2Fapi.whatsapp.com%2Fsend;end',
  },
  {
    pattern: /\b(instagram|insta)\b/i,
    appName: 'Instagram',
    launchUrl: 'https://www.instagram.com',
    nativeIntentUri:
      'intent://www.instagram.com#Intent;package=com.instagram.android;scheme=https;S.browser_fallback_url=https%3A%2F%2Fwww.instagram.com;end',
  },
  {
    pattern: /\b(facebook|fb)\b/i,
    appName: 'Facebook',
    launchUrl: 'https://www.facebook.com',
    nativeIntentUri:
      'intent://www.facebook.com#Intent;package=com.facebook.katana;scheme=https;S.browser_fallback_url=https%3A%2F%2Fwww.facebook.com;end',
  },
  {
    pattern: /\btelegram\b/i,
    appName: 'Telegram',
    launchUrl: 'https://t.me/',
    nativeIntentUri:
      'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=org.telegram.messenger;S.browser_fallback_url=https%3A%2F%2Ft.me%2F;end',
  },
  {
    pattern: /\bsnapchat\b/i,
    appName: 'Snapchat',
    launchUrl: 'https://www.snapchat.com',
    nativeIntentUri:
      'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.snapchat.android;S.browser_fallback_url=https%3A%2F%2Fwww.snapchat.com;end',
  },
  {
    pattern: /\bspotify\b/i,
    appName: 'Spotify',
    launchUrl: 'https://open.spotify.com',
    nativeIntentUri:
      'intent://open.spotify.com#Intent;package=com.spotify.music;scheme=https;S.browser_fallback_url=https%3A%2F%2Fopen.spotify.com;end',
  },
  {
    pattern: /\b(google\s*maps?|maps?)\b/i,
    appName: 'Google Maps',
    launchUrl: 'https://maps.google.com',
    nativeIntentUri:
      'intent://maps.google.com#Intent;package=com.google.android.apps.maps;scheme=https;S.browser_fallback_url=https%3A%2F%2Fmaps.google.com;end',
  },
  {
    pattern: /\b(play\s*store|playstore)\b/i,
    appName: 'Play Store',
    launchUrl: 'https://play.google.com/store',
    nativeIntentUri:
      'intent://play.google.com/store#Intent;package=com.android.vending;scheme=https;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore;end',
  },
  {
    pattern: /\b(chrome|browser)\b/i,
    appName: 'Chrome',
    launchUrl: 'https://www.google.com',
    nativeIntentUri:
      'intent://www.google.com#Intent;package=com.android.chrome;scheme=https;S.browser_fallback_url=https%3A%2F%2Fwww.google.com;end',
  },
  {
    pattern: /\bgmail\b/i,
    appName: 'Gmail',
    launchUrl: 'https://mail.google.com',
    nativeIntentUri:
      'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.google.android.gm;S.browser_fallback_url=https%3A%2F%2Fmail.google.com;end',
  },
  {
    pattern: /\b(google\s*meet|meet)\b/i,
    appName: 'Google Meet',
    launchUrl: 'https://meet.google.com',
    nativeIntentUri:
      'intent://meet.google.com#Intent;package=com.google.android.apps.meetings;scheme=https;S.browser_fallback_url=https%3A%2F%2Fmeet.google.com;end',
  },
  {
    pattern: /\b(google\s*drive|drive)\b/i,
    appName: 'Google Drive',
    launchUrl: 'https://drive.google.com',
    nativeIntentUri:
      'intent://drive.google.com#Intent;package=com.google.android.apps.docs;scheme=https;S.browser_fallback_url=https%3A%2F%2Fdrive.google.com;end',
  },
  {
    pattern: /\bcapcut\b/i,
    appName: 'CapCut',
    launchUrl: 'https://www.capcut.com',
    nativeIntentUri:
      'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.lemon.lvoverseas;S.browser_fallback_url=https%3A%2F%2Fwww.capcut.com;end',
  },
  {
    pattern: /\b(camera|camra|cam)\b/i,
    appName: 'Camera',
    nativeIntentUri:
      'intent:#Intent;action=android.media.action.STILL_IMAGE_CAMERA;end',
    isCamera: true,
  },
  {
    pattern: /\bsettings?\b/i,
    appName: 'Settings',
    nativeIntentUri: 'intent:#Intent;action=android.settings.SETTINGS;end',
  },
];

// Detects explicit app-open commands synchronously during user tap/submit
// so browser popups & Android intents run while userActivation is still active.
export function detectInstantLaunchTarget(
  rawText: string
): InstantLaunchMatch | null {
  const text = rawText.trim();
  if (!text) return null;

  // Never hijack song/video playback, stop commands, questions, or creation tasks
  if (
    /\b(play|bajao|baja|chalao|chala|sunao|suna|gaana|gana|song|music|video)\b/i.test(
      text
    ) ||
    /\b(band|stop|close|off|pause|roko|hatao|hatana)\b/i.test(text) ||
    /(\?|\b(kya|kaise|kyu|kyon|kyunki|batao|bata|samjhao|sikhao|banao|banana|create|make|write|code|edit|search|dhundo|download)\b)/i.test(
      text
    )
  ) {
    return null;
  }

  const hasOpenVerb =
    /\b(open|kholo|khol|chalu|launch|start|on\s+kar|on\s+karo|on\s+kardo|dikhao)\b/i.test(
      text
    );
  if (!hasOpenVerb) return null;

  for (const rule of APP_RULES) {
    if (rule.pattern.test(text)) {
      return {
        appName: rule.appName,
        launchUrl: rule.launchUrl,
        nativeIntentUri: rule.nativeIntentUri,
        isCamera: rule.isCamera,
      };
    }
  }

  return null;
}
