import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  BookMarked,
  BookOpen,
  CalendarClock,
  Command,
  Dumbbell,
  GraduationCap,
  Home,
  LogOut,
  Menu,
  NotebookPen,
  Play,
  Plus,
  Search,
  User,
} from 'lucide-react';
import type { AuthUserDto } from '../../../shared/apiTypes';
import { cn, hasOpenDialog } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

interface AppShellProps {
  children: React.ReactNode;
  dueCount?: number;
  currentUser?: AuthUserDto | null;
  onLogout?: () => void;
  isLoggingOut?: boolean;
  onOpenQuickAddVocab: () => void;
  onOpenCreateSession: () => void;
  onOpenCommandPalette: () => void;
}

const NAV_ITEMS = [
  { to: '/', label: 'Tổng quan', icon: Home, end: true },
  { to: '/sessions', label: 'Buổi học', icon: NotebookPen, end: false },
  { to: '/vocabulary', label: 'Từ vựng', icon: BookOpen, end: false },
  { to: '/grammar', label: 'Ngữ pháp', icon: BookMarked, end: false },
  { to: '/practice', label: 'Luyện tập', icon: Dumbbell, end: false },
  { to: '/review', label: 'Ôn tập hôm nay', icon: CalendarClock, end: false, showDue: true },
  { to: '/analytics', label: 'Thống kê', icon: BarChart3, end: false },
];

export function AppShell({
  children,
  dueCount = 0,
  currentUser,
  onLogout,
  isLoggingOut = false,
  onOpenQuickAddVocab,
  onOpenCreateSession,
  onOpenCommandPalette,
}: AppShellProps) {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (hasOpenDialog()) return;
        e.preventDefault();
        onOpenCommandPalette();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenCommandPalette]);

  const sidebarContent = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-[var(--border-hairline)] px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-white">
          <GraduationCap className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-[var(--ink-primary)]">
            English Learning OS
          </p>
          <p className="truncate text-[11px] text-[var(--ink-muted)]">
            Hệ thống học cá nhân · V1
          </p>
        </div>
      </div>

      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            onOpenCommandPalette();
          }}
          className="flex w-full items-center justify-between rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--ink-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--ink-secondary)]"
        >
          <span className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Tìm nhanh...</span>
          </span>
          <kbd className="formula inline-flex items-center gap-0.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--ink-muted)]">
            <Command className="h-2.5 w-2.5" aria-hidden="true" />K
          </kbd>
        </button>
      </div>

      <nav aria-label="Điều hướng chính" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-between rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors',
                  isActive
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-inset ring-[var(--accent-border)]'
                    : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--ink-primary)]',
                )
              }
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </span>
              {item.showDue && dueCount > 0 && (
                <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
                  {dueCount > 99 ? '99+' : dueCount}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-[var(--border-hairline)] p-3">
        <p className="px-1 text-[11px] font-medium uppercase tracking-wider text-[var(--ink-muted)]">
          Thao tác nhanh
        </p>
        <Button
          variant="primary"
          size="sm"
          className="w-full justify-start"
          onClick={() => {
            onNavigate?.();
            navigate('/review');
          }}
        >
          <Play className="h-3.5 w-3.5" aria-hidden="true" />
          Bắt đầu ôn tập
        </Button>
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            className="justify-start px-2.5 text-xs"
            onClick={() => {
              onNavigate?.();
              onOpenQuickAddVocab();
            }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Từ vựng
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="justify-start px-2.5 text-xs"
            onClick={() => {
              onNavigate?.();
              navigate('/grammar?new=1');
            }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Ngữ pháp
          </Button>
        </div>
        <Button
          variant="subtle"
          size="sm"
          className="w-full justify-start text-xs"
          onClick={() => {
            onNavigate?.();
            onOpenCreateSession();
          }}
        >
          <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" />
          Tạo buổi học mới
        </Button>
      </div>

      {currentUser ? (
        <div className="flex items-center justify-between gap-2 border-t border-[var(--border-hairline)] px-3 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
              <User className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-[var(--ink-primary)]">
                {currentUser.username}
              </p>
              <p className="truncate text-[10px] text-[var(--ink-muted)]">Tài khoản cá nhân</p>
            </div>
          </div>
          {onLogout ? (
            <Button
              variant="ghost"
              size="sm"
              loading={isLoggingOut}
              onClick={() => {
                onNavigate?.();
                onLogout();
              }}
              className="shrink-0 px-2 text-xs text-[var(--ink-secondary)] hover:text-[var(--danger-ink)]"
              title="Đăng xuất khỏi hệ thống"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Đăng xuất</span>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--ink-primary)] lg:flex">
      <aside className="hidden lg:sticky lg:top-0 lg:block lg:h-screen lg:w-60 lg:shrink-0 lg:border-r lg:border-[var(--border-hairline)] lg:bg-[var(--bg-subtle)]/65">
        {sidebarContent()}
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[var(--border-hairline)] bg-[var(--bg-surface)]/95 px-4 backdrop-blur-sm lg:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Mở menu điều hướng"
            onClick={() => setMobileMenuOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-hairline)] text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)]"
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="text-sm font-semibold text-[var(--ink-primary)]">
            English Learning OS
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onOpenCommandPalette} aria-label="Tìm nhanh">
            <Search className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="primary" size="sm" onClick={onOpenQuickAddVocab}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Từ mới
          </Button>
        </div>
      </header>

      <Dialog
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        title="Điều hướng"
        size="sm"
      >
        <div className="-mx-2 -my-1">
          {sidebarContent(() => setMobileMenuOpen(false))}
        </div>
      </Dialog>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
