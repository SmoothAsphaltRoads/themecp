import { NextResponse } from 'next/server';

import { db } from '@/lib/db';

type CodeforcesProblem = {
  contestId?: number;
  index?: string;
  name?: string;
  rating?: number;
  tags?: string[];
};

type ProblemsetResponse = {
  status: string;
  result?: {
    problems?: CodeforcesProblem[];
  };
};

export async function POST() {
  try {
    const response = await fetch('https://codeforces.com/api/problemset.problems', {
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch Codeforces problemset.' }, { status: 502 });
    }

    const data = (await response.json()) as ProblemsetResponse;

    if (data.status !== 'OK' || !data.result?.problems) {
      return NextResponse.json({ error: 'Invalid Codeforces response.' }, { status: 502 });
    }

    const validProblems = data.result.problems.filter(
      (problem): problem is Required<Pick<CodeforcesProblem, 'contestId' | 'index' | 'name' | 'rating'>> & {
        tags?: string[];
      } =>
        typeof problem.contestId === 'number' &&
        typeof problem.index === 'string' &&
        typeof problem.name === 'string' &&
        typeof problem.rating === 'number'
    );

    let upserted = 0;

    for (const problem of validProblems) {
      const id = `${problem.contestId}${problem.index}`;

      await db.problemBank.upsert({
        where: { id },
        update: {
          contestId: problem.contestId,
          index: problem.index,
          name: problem.name,
          rating: problem.rating,
          tags: problem.tags ?? [],
        },
        create: {
          id,
          contestId: problem.contestId,
          index: problem.index,
          name: problem.name,
          rating: problem.rating,
          tags: problem.tags ?? [],
        },
      });

      upserted += 1;
    }

    return NextResponse.json({ success: true, upserted });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Sync failed.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
