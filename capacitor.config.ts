import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kirknetllc.setlistpro',
  appName: 'Setlist Manager Pro',
  webDir: 'dist',
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      overlay: true,
      style: 'DARK',
    },
    CapacitorCookies: {
      enabled: true,
    },
    CapacitorHttp: {
      enabled: true,
    },
  },
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
};

export default config;
