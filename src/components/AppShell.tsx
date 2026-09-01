import type { ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { APP_NAME } from '@/config/appConfig';

const NAV = [
  { to: '/', label: 'ホーム', icon: '🏠' },
  { to: '/record', label: '記録', icon: '📝' },
  { to: '/progress', label: '経過', icon: '📈' },
  { to: '/clinic', label: '診察', icon: '🏥' },
];

interface Props {
  title?: string;
  /** 戻るボタンを出す（下位画面用） */
  back?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}

export function AppShell({ title, back = false, actions, children }: Props): ReactNode {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div className="app-shell">
      <header className="app-header no-print">
        <div className="app-header__row">
          {back ? (
            <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label="前の画面に戻る">
              ‹
            </button>
          ) : null}
          <h1 className="app-header__title">{title ?? APP_NAME}</h1>
          {actions}
          {pathname !== '/settings' ? (
            <NavLink to="/settings" className="icon-btn" aria-label="設定を開く" title="設定">
              ⚙
            </NavLink>
          ) : null}
        </div>
      </header>

      <main className="app-main" id="main">
        {children}
      </main>

      <nav className="app-nav no-print" aria-label="メインナビゲーション">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}>
            <span className="app-nav__icon" aria-hidden="true">
              {n.icon}
            </span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
