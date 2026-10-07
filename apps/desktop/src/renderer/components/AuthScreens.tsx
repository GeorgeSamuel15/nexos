import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';

import { nexos } from '@nexos/sdk';
import type { UserProfile } from '@nexos/types';
import { Button, Input } from '@nexos/ui';

function Avatar({ user }: { user?: UserProfile | undefined }) {
  return (
    <div className="auth-avatar">
      {user?.avatar ? <img src={user.avatar} alt="" /> : <UserRound size={34} />}
    </div>
  );
}

export function FirstRunScreen({ onComplete }: { onComplete(user: UserProfile): void }) {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError('The passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      onComplete(await nexos.users.create({ displayName, username, password }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Account setup failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-screen first-run-screen">
      <section className="setup-card">
        <div className="setup-intro">
          <div className="nexos-orb">
            <span>N</span>
          </div>
          <div>
            <p className="eyebrow">FIRST-RUN SETUP</p>
            <h1>Make NexOS yours.</h1>
            <p>
              Create the local account that protects your files, preferences, and app permissions.
            </p>
          </div>
          <ul>
            <li>
              <ShieldCheck size={18} /> Passwords are secured with scrypt
            </li>
            <li>
              <LockKeyhole size={18} /> Data stays on this device
            </li>
          </ul>
        </div>
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <h2>Create your account</h2>
          <label>
            <span>Display name</span>
            <Input
              autoFocus
              autoComplete="name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="George Samuel"
              required
              minLength={2}
            />
          </label>
          <label>
            <span>Username</span>
            <Input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="george"
              required
              minLength={3}
              pattern="[A-Za-z0-9_-]+"
            />
          </label>
          <label>
            <span>Password</span>
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 10 characters"
              required
              minLength={10}
            />
          </label>
          <label>
            <span>Confirm password</span>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
              minLength={10}
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Securing account…' : 'Enter NexOS'} <ArrowRight size={16} />
          </Button>
        </form>
      </section>
    </main>
  );
}

export function LoginScreen({
  users,
  onLogin,
}: {
  users: UserProfile[];
  onLogin(user: UserProfile): void;
}) {
  const [selected, setSelected] = useState(users[0]?.username ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const user = users.find((item) => item.username === selected);

  useEffect(() => {
    if (!users.some((item) => item.username === selected)) {
      setSelected(users[0]?.username ?? '');
    }
  }, [selected, users]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) {
      setError('No local account is available. Restart NexOS and try again.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      onLogin(await nexos.users.login({ username: selected, password }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in.');
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-screen login-screen">
      <div className="login-brand">NEXOS</div>
      <form className="login-card" onSubmit={(event) => void submit(event)}>
        <Avatar user={user} />
        <h1>{user?.displayName ?? 'Welcome back'}</h1>
        {users.length > 1 ? (
          <select
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            aria-label="Account"
          >
            {users.map((item) => (
              <option key={item.id} value={item.username}>
                {item.displayName}
              </option>
            ))}
          </select>
        ) : (
          <p>@{selected}</p>
        )}
        <div className="login-password">
          <Input
            autoFocus
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            required
          />
          <button type="submit" aria-label="Sign in" disabled={submitting}>
            <ArrowRight size={18} />
          </button>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
      <p className="login-footer">NexOS 0.2 · Local secure session</p>
    </main>
  );
}

export function LockScreen({
  user,
  onUnlock,
}: {
  user: UserProfile;
  onUnlock(user: UserProfile): void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const now = new Date();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      onUnlock(await nexos.users.unlock(password));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to unlock NexOS.');
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-screen lock-screen">
      <div className="lock-time">
        <strong>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
        <span>
          {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </span>
      </div>
      <form className="login-card" onSubmit={(event) => void submit(event)}>
        <Avatar user={user} />
        <h1>{user.displayName}</h1>
        <div className="login-password">
          <Input
            autoFocus
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Unlock password"
            required
          />
          <button type="submit" aria-label="Unlock" disabled={submitting}>
            <ArrowRight size={18} />
          </button>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </main>
  );
}
