import { ExternalLink, Fingerprint, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/lib/i18n';

declare const __EXTENSION_TITLE__: string;

const title: string =
  typeof __EXTENSION_TITLE__ !== 'undefined' ? __EXTENSION_TITLE__ : 'WASession Capture';

export default function App() {
  const { theme, toggle } = useTheme();

  document.title = title;

  const openWhatsApp = () => {
    void chrome.tabs.create({ url: 'https://web.whatsapp.com/', active: true });
  };

  return (
    <div className="flex flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Fingerprint className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold">{title}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label="Toggle theme"
          className="h-8 w-8"
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      </header>

      <div className="flex flex-col items-center gap-2 bg-muted/40 px-4 py-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Fingerprint className="h-7 w-7" />
        </div>
        <p className="text-sm font-medium">{t('active')}</p>
        <p className="text-xs text-muted-foreground">{t('drivenAutomatically')}</p>
      </div>

      <div className="border-t px-4 py-3">
        <Button
          variant="outline"
          className="w-full"
          onClick={openWhatsApp}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          {t('openWhatsApp')}
        </Button>
      </div>
    </div>
  );
}
