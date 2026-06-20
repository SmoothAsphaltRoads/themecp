import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { getRatingsForLevel } from '@/lib/cpdEngine';

type SessionRequest = {
  handle?: string;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const handle = searchParams.get('handle')?.trim();

    if (handle) {
      const user = await db.user.findUnique({
        where: { handle },
        include: { activeContest: true, pendingAuth: true },
      });

      return NextResponse.json({ user: user ?? null });
    }

    const activeContest = await db.activeContest.findFirst({
      include: { user: true },
      orderBy: { startTime: 'desc' },
    });

    if (!activeContest) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({
      user: {
        id: activeContest.user.id,
        handle: activeContest.user.handle,
        currentLevel: activeContest.user.currentLevel,
        solvedProblemIds: activeContest.user.solvedProblemIds,
        activeContest: {
          id: activeContest.id,
          startTime: activeContest.startTime,
          problems: activeContest.problems,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch session.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SessionRequest;
    const handle = body.handle?.trim();

    if (!handle) {
      return NextResponse.json({ error: 'Handle is required.' }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { handle } });

    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const targetRatings = getRatingsForLevel(user.currentLevel);

    const selectedProblems = [] as Array<{
      id: string;
      contestId: number;
      index: string;
      name: string;
      rating: number;
      tags: string[];
    }>;

    for (const rating of targetRatings) {
      const candidates = await db.problemBank.findMany({
        where: {
          rating,
          id: {
            notIn: user.solvedProblemIds,
          },
        },
      });

      if (!candidates.length) {
        return NextResponse.json(
          { error: `No unsolved problems available for rating ${rating}.` },
          { status: 404 }
        );
      }

      const randomProblem = candidates[Math.floor(Math.random() * candidates.length)];
      selectedProblems.push(randomProblem);
    }

    const startTime = Math.floor(Date.now() / 1000);

    const activeContest = await db.activeContest.upsert({
      where: { userId: user.id },
      update: {
        startTime,
        problems: selectedProblems,
      },
      create: {
        userId: user.id,
        startTime,
        problems: selectedProblems,
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        handle: user.handle,
        currentLevel: user.currentLevel,
        solvedProblemIds: user.solvedProblemIds,
        activeContest,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to create session.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
