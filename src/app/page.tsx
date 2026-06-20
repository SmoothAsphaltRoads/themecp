'use client';

import { useEffect, useState } from 'react';

type Challenge = {
  targetContestId: number;
  targetIndex: string;
  requiredLanguage: string;
  issuedAt: number;
};

type ContestProblem = {
  id: string;
  contestId: number;
  index: string;
  name: string;
  rating: number;
};

type ActiveContest = {
  id: string;
  startTime: number;
  problems: ContestProblem[];
};

type UserState = {
  handle: string;
  currentLevel: number;
  activeContest?: ActiveContest | null;
};

export default function HomePage() {
  const [user, setUser] = useState<UserState | null>(null);
  const [handleInput, setHandleInput] = useState('');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const hydrateSession = async () => {
      try {
        const response = await fetch('/api/session', { cache: 'no-store' });
        const data = await response.json();

        if (data?.user) {
          setUser({
            handle: data.user.handle,
            currentLevel: data.user.currentLevel,
            activeContest: data.user.activeContest,
          });
          setHandleInput(data.user.handle);
        }
      } catch {
        setMessage('Unable to hydrate active session.');
      }
    };

    hydrateSession();
  }, []);

  const callInit = async () => {
    if (!handleInput.trim()) {
      setMessage('Please enter your Codeforces handle.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'INIT', handle: handleInput.trim() }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error ?? 'Failed to initialize auth challenge.');
        return;
      }

      setUser({
        handle: data.user.handle,
        currentLevel: data.user.currentLevel,
        activeContest: null,
      });
      setChallenge(data.challenge);
      setMessage('Challenge created. Complete the handshake and verify.');
    } catch {
      setMessage('Failed to initialize auth challenge.');
    } finally {
      setLoading(false);
    }
  };

  const callVerify = async () => {
    const handle = user?.handle ?? handleInput.trim();

    if (!handle) {
      setMessage('Handle is required.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'VERIFY', handle }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage(data.message ?? data.error ?? 'Verification failed.');
        return;
      }

      setChallenge(null);
      setUser({
        handle: data.user.handle,
        currentLevel: data.user.currentLevel,
        activeContest: null,
      });
      setHandleInput(data.user.handle);
      setMessage('Authentication verified successfully.');
    } catch {
      setMessage('Verification request failed.');
    } finally {
      setLoading(false);
    }
  };

  const generateSession = async () => {
    if (!user?.handle) {
      setMessage('Authenticate first.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: user.handle }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error ?? 'Failed to generate contest.');
        return;
      }

      setUser({
        handle: data.user.handle,
        currentLevel: data.user.currentLevel,
        activeContest: data.user.activeContest,
      });
      setMessage('Training mashup generated.');
    } catch {
      setMessage('Failed to create contest session.');
    } finally {
      setLoading(false);
    }
  };

  const completeContest = async () => {
    if (!user?.handle) {
      setMessage('Authenticate first.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: user.handle }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error ?? 'Failed to verify contest.');
        return;
      }

      setUser((prev) =>
        prev
          ? {
              ...prev,
              currentLevel: data.newLevel,
              activeContest: null,
            }
          : prev
      );

      setMessage(`Session verified. Delta applied: ${data.deltaApplied}, new level: ${data.newLevel}.`);
    } catch {
      setMessage('Failed to complete contest verification.');
    } finally {
      setLoading(false);
    }
  };

  const activeContest = user?.activeContest;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
        <h1 className="text-4xl font-black tracking-tight">ThemeCP</h1>
        <p className="text-zinc-300">Time-Adjusted Continuous Performance Delta training platform.</p>

        {message ? (
          <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-200">{message}</div>
        ) : null}

        {!user ? (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-6">
            <h2 className="text-xl font-semibold">Link your Codeforces handle</h2>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={handleInput}
                onChange={(event) => setHandleInput(event.target.value)}
                placeholder="tourist"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-zinc-50 outline-none ring-blue-500 transition focus:ring-2"
              />
              <button
                type="button"
                onClick={callInit}
                disabled={loading}
                className="rounded-lg bg-blue-600 px-5 py-3 font-semibold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-900"
              >
                {loading ? 'Linking...' : 'Link Handle'}
              </button>
            </div>
          </section>
        ) : challenge ? (
          <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-6">
            <h2 className="text-xl font-bold text-amber-300">Pending Handshake</h2>
            <p className="mt-3 text-amber-100">
              Go to Codeforces, submit a deliberately broken Haskell script to Problem 4A (Watermelon) to
              trigger a Compilation Error.
            </p>
            <a
              href="https://codeforces.com/problemset/problem/4/A"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block rounded-md border border-amber-400/60 px-3 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/20"
            >
              Open Codeforces 4A
            </a>
            <button
              type="button"
              onClick={callVerify}
              disabled={loading}
              className="mt-5 rounded-lg bg-amber-500 px-5 py-3 font-bold text-zinc-900 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-amber-700"
            >
              {loading ? 'Verifying...' : 'Verify Me'}
            </button>
          </section>
        ) : !activeContest ? (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">{user.handle}</h2>
                <p className="text-zinc-300">Current Level: {user.currentLevel.toFixed(1)}</p>
              </div>
              <button
                type="button"
                onClick={generateSession}
                disabled={loading}
                className="rounded-lg bg-blue-600 px-6 py-3 text-lg font-bold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-900"
              >
                {loading ? 'Generating...' : 'Generate Training Mashup'}
              </button>
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-6">
            <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-emerald-300">
              Contest Running
            </div>

            <div className="mt-5 grid gap-4">
              {activeContest.problems.map((problem) => (
                <article key={problem.id} className="rounded-lg border border-zinc-700 bg-zinc-950 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold">{problem.name}</h3>
                      <p className="text-zinc-300">Rating: {problem.rating}</p>
                    </div>
                    <a
                      href={`https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-blue-500 px-3 py-2 text-blue-300 transition hover:bg-blue-500/20"
                    >
                      Open Problem
                    </a>
                  </div>
                </article>
              ))}
            </div>

            <button
              type="button"
              onClick={completeContest}
              disabled={loading}
              className="mt-6 w-full rounded-lg bg-blue-600 px-6 py-3 text-lg font-bold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-900"
            >
              {loading ? 'Calculating...' : 'Complete & Calculate Rating'}
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
