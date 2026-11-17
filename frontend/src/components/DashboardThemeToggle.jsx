import { useLayoutEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import './dashboardTheme.css';

const STORAGE_KEY = 'econnect-dashboard-theme';

export default function DashboardThemeToggle() {
  const [theme, setTheme] = useState('dark');
  const [error, setError] = useState('');
  useLayoutEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') setTheme(saved);
    } catch {
      setError('La préférence ne peut pas être conservée dans ce navigateur.');
    }
    return () => { delete document.body.dataset.dashboardTheme; };
  }, []);
  useLayoutEffect(() => {
    document.body.dataset.dashboardTheme = theme;
  }, [theme]);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); }
    catch { setError('La préférence ne peut pas être conservée dans ce navigateur.'); }
  };
  return <div>
    <Button type="button" variant="outline" aria-pressed={theme === 'light'} aria-label="Mode clair"
      onClick={toggle} className="shrink-0">{theme === 'dark' ? 'Mode clair' : 'Mode sombre'}</Button>
    {error && <span role="alert" className="block text-xs">{error}</span>}
  </div>;
}
