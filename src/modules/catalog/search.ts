import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import type {
  PublicOffering,
  SearchInput,
  SearchResult,
} from "@/contracts/domain";
import { getDatabase } from "@/server/db";
import {
  matchesOffering,
  validSearchInput,
} from "@/modules/recommendations/rank";

/** Scan at most 200 rows per request; empty pages can still have a continuation. */
export async function searchOfferings(
  input: SearchInput,
  db: PrismaClient = getDatabase(),
  now = new Date(),
): Promise<SearchResult> {
  if (
    !validSearchInput(input) ||
    (input.cursor !== undefined &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        input.cursor,
      ))
  )
    return { items: [], nextCursor: null };
  const items: PublicOffering[] = [];
  let after = input.cursor;
  // Seat counts and availability windows are evaluated in bounded DB batches.
  for (let batch = 0; batch < 10; batch++) {
    const rows = await db.offering.findMany({
      where: {
        status: "published",
        academy: { status: "approved" },
        enrollmentOpensAt: { lte: now },
        enrollmentClosesAt: { gt: now },
        ...(after ? { id: { gt: after } } : {}),
        ...(input.maxPriceWon !== undefined
          ? { priceWon: { lte: input.maxPriceWon } }
          : {}),
        course: {
          ...(input.subject ? { subject: input.subject } : {}),
          ...(input.level ? { level: input.level } : {}),
          ...(input.grade !== undefined
            ? { gradeMin: { lte: input.grade }, gradeMax: { gte: input.grade } }
            : {}),
        },
      },
      orderBy: { id: "asc" },
      take: 20,
      select: {
        id: true,
        academyId: true,
        priceWon: true,
        capacity: true,
        course: {
          select: {
            title: true,
            subject: true,
            gradeMin: true,
            gradeMax: true,
            level: true,
          },
        },
        sessions: {
          select: { id: true, startsAt: true, endsAt: true },
          orderBy: { startsAt: "asc" },
        },
        _count: {
          select: {
            enrollments: {
              where: { status: { in: ["active", "pending_payment"] } },
            },
            orders: {
              where: {
                status: "pending_payment",
                expiresAt: { gt: now },
                reservation: { is: { status: "held" } },
              },
            },
          },
        },
      },
    });
    for (const row of rows) {
      const item: PublicOffering = {
        id: row.id,
        academyId: row.academyId,
        title: row.course.title,
        subject: row.course.subject as PublicOffering["subject"],
        gradeMin: row.course.gradeMin,
        gradeMax: row.course.gradeMax,
        level: row.course.level as PublicOffering["level"],
        priceWon: row.priceWon,
        availableSeats: Math.max(
          0,
          row.capacity - row._count.enrollments - row._count.orders,
        ),
        sessions: row.sessions.map((s) => ({
          id: s.id,
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
        })),
      };
      if (matchesOffering(item, input)) items.push(item);
      if (items.length === 21) break;
    }
    if (items.length === 21)
      return { items: items.slice(0, 20), nextCursor: items[19].id };
    if (rows.length < 20) return { items, nextCursor: null };
    after = rows[rows.length - 1].id;
  }
  return { items, nextCursor: after ?? null };
}
