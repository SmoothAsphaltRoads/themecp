import { NextResponse } from 'next/server';

import { calculateLevelDelta } from '@/lib/cpdEngine';
import { db } from '@/lib/db';

type VerifyRequest = {
  handle?: string;
};

type StatusSubmission = {
  verdict?: string;
  creationTimeSeconds?: number;
  problem?: {
    contestId?: number;
    index?: string;
  };
};

type UserStatusResponse = {
  status: string;
  result?: StatusSubmission[];
};

type ContestProblem = {
  id: string;
  contestId: number;
  index: string;
  name: string;
  rating: number;
};

const MAX_CONTEST_MINUTES = 240;
const MIN_LEVEL = 1.0;
const MAX_LEVEL = 50.0;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VerifyRequest;
    const handle = body.handle?.trim();

    if (!handle) {
      return NextResponse.json({ error: 'Handle is required.' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { handle },
      include: { activeContest: true },
    });

    if (!user || !user.activeContest) {
      return NextResponse.json({ error: 'No active contest found.' }, { status: 404 });
    }

    const activeContest = user.activeContest;

    const response = await fetch(
      `https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=50`,
      { cache: 'no-store' }
    );

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch Codeforces submissions.' }, { status: 502 });
    }

    const data = (await response.json()) as UserStatusResponse;

    if (data.status !== 'OK' || !data.result) {
      return NextResponse.json({ error: 'Invalid Codeforces submission response.' }, { status: 502 });
    }

    const submissions = data.result.filter(
      (submission) => (submission.creationTimeSeconds ?? 0) >= activeContest.startTime
    );

    const sessionProblems = activeContest.problems as ContestProblem[];

    const results = sessionProblems.map((problem) => {
      const problemSubmissions = submissions
        .filter(
          (submission) =>
            submission.problem?.contestId === problem.contestId && submission.problem?.index === problem.index
        )
        .sort((a, b) => (a.creationTimeSeconds ?? 0) - (b.creationTimeSeconds ?? 0));

      const okSubmission = problemSubmissions.find((submission) => submission.verdict === 'OK');

      if (!okSubmission) {
        return {
          solved: false,
          solveTimeMinutes: MAX_CONTEST_MINUTES,
          wrongAttempts: 0,
        };
      }

      const okTimestamp = okSubmission.creationTimeSeconds ?? activeContest.startTime;
      const wrongAttempts = problemSubmissions.filter(
        (submission) =>
          (submission.creationTimeSeconds ?? 0) <= okTimestamp &&
          submission.verdict !== 'OK' &&
          submission.verdict !== 'TESTING'
      ).length;

      return {
        solved: true,
        solveTimeMinutes: (okTimestamp - activeContest.startTime) / 60,
        wrongAttempts,
      };
    });

    const delta = calculateLevelDelta(results);

    const solvedNow = sessionProblems
      .filter((problem, index) => results[index]?.solved)
      .map((problem) => problem.id);

    const nextSolvedIds = Array.from(new Set([...user.solvedProblemIds, ...solvedNow]));
    const newLevel = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Number((user.currentLevel + delta).toFixed(2))));

    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: {
          currentLevel: newLevel,
          solvedProblemIds: nextSolvedIds,
        },
      }),
      db.activeContest.delete({ where: { userId: user.id } }),
    ]);

    return NextResponse.json({
      success: true,
      deltaApplied: delta,
      newLevel,
      solvedNow,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Verification failed.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
