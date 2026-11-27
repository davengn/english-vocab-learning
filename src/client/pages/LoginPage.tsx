import React, { useState } from 'react';
import { Eye, EyeOff, GraduationCap, Lock, ShieldCheck, User } from 'lucide-react';
import type { AuthStatusDto } from '../../shared/apiTypes';
import { ApiError, api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

interface LoginPageProps {
  onSuccess: (status: AuthStatusDto) => void;
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      setErrorMessage('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const status = await api.login({
        username: trimmedUsername,
        password,
      });
      onSuccess(status);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Không thể kết nối máy chủ. Vui lòng thử lại.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-canvas)] px-4 py-10 text-[var(--ink-primary)]">
      <div className="w-full max-w-[420px] space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)] text-white shadow-sm">
            <GraduationCap className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--ink-primary)]">
            English Learning OS
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-secondary)]">
            Không gian học tiếng Anh cá nhân · V1
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 shadow-sm sm:p-8">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-[var(--ink-primary)]">
              Đăng nhập hệ thống
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--ink-muted)]">
              Nhập tài khoản cá nhân để mở sổ từ vựng, ngữ pháp và lịch ôn tập của bạn.
            </p>
          </div>

          <form method="post" onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="username"
              name="username"
              type="text"
              label="Tên đăng nhập"
              placeholder="Nhập tên đăng nhập"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              required
              disabled={isSubmitting}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              leftIcon={<User className="h-4 w-4" />}
            />

            <Input
              id="current-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              label="Mật khẩu"
              placeholder="Nhập mật khẩu"
              autoComplete="current-password"
              enterKeyHint="done"
              required
              disabled={isSubmitting}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              leftIcon={<Lock className="h-4 w-4" />}
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--ink-muted)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              }
            />

            {errorMessage ? (
              <div
                role="alert"
                className="rounded-lg border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2.5 text-xs font-medium text-[var(--danger-ink)]"
              >
                {errorMessage}
              </div>
            ) : null}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isSubmitting}
              className="w-full"
            >
              {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </Button>
          </form>

          <div className="mt-5 flex items-start gap-2 rounded-xl bg-[var(--bg-subtle)] px-3.5 py-3 text-xs leading-relaxed text-[var(--ink-secondary)]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            <p>
              Hệ thống riêng tư được bảo vệ bằng mật khẩu. Nếu quên mật khẩu, hãy liên hệ quản trị
              viên để đặt lại.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
