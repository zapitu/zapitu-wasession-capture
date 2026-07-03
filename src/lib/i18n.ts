export type Locale = 'en' | 'pt' | 'es';

const translations = {
  en: {
    active: 'Connector active',
    drivenAutomatically:
      'Nothing to do here. This connector is driven automatically by your app during passkey authentication.',
    waiting: 'Waiting for app…',
    openWhatsApp: 'Open WhatsApp Web',
    statusOnline: 'Online',
    statusWaiting: 'Waiting',
    statusOffline: 'Offline',
    sessionSent: 'Session captured and sent',
    sessionError: 'Could not capture session',
    extracting: 'Extracting session…',
    extractionKeepOpen: 'Please keep this tab open while the session is extracted.',
    retry: 'Retry',
    close: 'Close',
    poweredBy: 'Powered by',
  },
  pt: {
    active: 'Conector ativo',
    drivenAutomatically:
      'Nada a fazer aqui. Este conector é controlado automaticamente pelo seu aplicativo durante a autenticação por passkey.',
    waiting: 'Aguardando aplicativo…',
    openWhatsApp: 'Abrir WhatsApp Web',
    statusOnline: 'Online',
    statusWaiting: 'Aguardando',
    statusOffline: 'Offline',
    sessionSent: 'Sessão capturada e enviada',
    sessionError: 'Não foi possível capturar a sessão',
    extracting: 'Extraindo sessão…',
    extractionKeepOpen: 'Mantenha esta aba aberta enquanto a sessão é extraída.',
    retry: 'Tentar novamente',
    close: 'Fechar',
    poweredBy: 'Desenvolvido por',
  },
  es: {
    active: 'Conector activo',
    drivenAutomatically:
      'No hay nada que hacer aquí. Este conector es controlado automáticamente por su aplicación durante la autenticación por passkey.',
    waiting: 'Esperando aplicación…',
    openWhatsApp: 'Abrir WhatsApp Web',
    statusOnline: 'En línea',
    statusWaiting: 'Esperando',
    statusOffline: 'Desconectado',
    sessionSent: 'Sesión capturada y enviada',
    sessionError: 'No se pudo capturar la sesión',
    extracting: 'Extrayendo sesión…',
    extractionKeepOpen: 'Mantenga esta pestaña abierta mientras se extrae la sesión.',
    retry: 'Reintentar',
    close: 'Cerrar',
    poweredBy: 'Desarrollado por',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

function detectLocale(): Locale {
  let raw: string | undefined;
  try {
    raw = chrome.i18n?.getUILanguage?.();
  } catch {
    raw = undefined;
  }
  if (!raw && typeof navigator !== 'undefined') {
    raw = navigator.language;
  }
  const code = (raw || 'en').toLowerCase().split('-')[0];
  if (code === 'pt' || code === 'es') return code;
  return 'en';
}

const locale: Locale = detectLocale();

export function t(key: TranslationKey): string {
  const bundle = translations[locale] ?? translations.en;
  return bundle[key] ?? translations.en[key];
}

export function getLocale(): Locale {
  return locale;
}
