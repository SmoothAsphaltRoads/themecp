import { NextResponse } from 'next/server';

import { db } from '@/lib/db';

type AuthRequest = {
  action?: 'INIT' | 'VERIFY';
  handle?: string;
};

type StatusSubmission = {
  verdict?: string;
  creationTimeSeconds?: number;
  programmingLanguage?: string;
  problem?: {
    contestId?: number;
    index?: string;
  };
};

type UserStatusResponse = {
  status: string;
  result?: StatusSubmission[];
};

async function fetchUserStatus(handle: string, count: number): Promise<StatusSubmission[]> {
  const response = await fetch(
    `https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=${count}`,
    { cache: 'no-store' }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch Codeforces user status.');
  }

  const data = (await response.json()) as UserStatusResponse;

  if (data.status !== 'OK' || !data.result) {
    throw new Error('Invalid Codeforces user status response.');
  }

  return data.result;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AuthRequest;
    const action = body.action;
    const handle = body.handle?.trim();

    if (!action || !handle) {
      return NextResponse.json({ error: 'Both action and handle are required.' }, { status: 400 });
    }

    if (action === 'INIT') {
      const user = await db.user.upsert({
        where: { handle },
        update: {},
        create: {
          handle,
          solvedProblemIds: [],
        },
      });

      const issuedAt = Math.floor(Date.now() / 1000);

      await db.pendingAuth.upsert({
        where: { userId: user.id },
        update: {
          targetContestId: 4,
          targetIndex: 'A',
          requiredLanguage: 'Haskell',
          issuedAt,
        },
        create: {
          userId: user.id,
          targetContestId: 4,
          targetIndex: 'A',
          requiredLanguage: 'Haskell',
          issuedAt,
        },
      });

      return NextResponse.json({
        success: true,
        challenge: {
          targetContestId: 4,
          targetIndex: 'A',
          requiredLanguage: 'Haskell',
          issuedAt,
        },
        user: {
          handle: user.handle,
          currentLevel: user.currentLevel,
        },
      });
    }

    if (action === 'VERIFY') {
      const user = await db.user.findUnique({
        where: { handle },
        include: { pendingAuth: true },
      });

      if (!user || !user.pendingAuth) {
        return NextResponse.json({ error: 'No pending authentication challenge found.' }, { status: 404 });
      }

      const pendingAuth = user.pendingAuth;
      const latestStatuses = await fetchUserStatus(handle, 10);

      const isVerified = latestStatuses.some((submission) => {
        const contestId = submission.problem?.contestId;
        const index = submission.problem?.index;
        const verdict = submission.verdict;
        const creationTimeSeconds = submission.creationTimeSeconds ?? 0;
        const language = submission.programmingLanguage ?? '';

        return (
          contestId === pendingAuth.targetContestId &&
          index === pendingAuth.targetIndex &&
          verdict === 'COMPILATION_ERROR' &&
          creationTimeSeconds >= pendingAuth.issuedAt &&
          language.toLowerCase().includes('haskell')
        );
      });

      if (!isVerified) {
        return NextResponse.json({ success: false, verified: false, message: 'Challenge not found yet.' });
      }

      const lifetimeStatuses = await fetchUserStatus(handle, 10000);
      const solvedIds = Array.from(
        new Set(
          lifetimeStatuses
            .filter((submission) => submission.verdict === 'OK')
            .map((submission) => {
              const contestId = submission.problem?.contestId;
              const index = submission.problem?.index;
              return contestId && index ? `${contestId}${index}` : null;
            })
            .filter((value): value is string => Boolean(value))
        )
      );

      const updatedUser = await db.user.update({
        where: { id: user.id },
        data: {
          solvedProblemIds: solvedIds,
        },
      });

      await db.pendingAuth.delete({ where: { userId: user.id } });

      return NextResponse.json({
        success: true,
        verified: true,
        user: {
          handle: updatedUser.handle,
          currentLevel: updatedUser.currentLevel,
          solvedProblemIds: updatedUser.solvedProblemIds,
        },
      });
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Auth request failed.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
