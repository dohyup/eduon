import "server-only";
import { isDemoMode } from "@/server/config";
import { getDatabase } from "@/server/db";
import { hydrateRuntimeFromSupabaseKv } from "@/integrations/auth/provider";
import { academies, demoOfferings } from "@/demo/catalog";
import { searchDemoOfferings } from "@/demo/search";
import { searchOfferings } from "./search";
import { filterOfferingsByNaturalLanguage } from "./natural-search";
import type { PublicOffering, SearchInput } from "@/contracts/domain";

export async function listPublicOfferings(
  input: SearchInput = {},
  options?: { query?: string; fetchAll?: boolean },
) {
  const query = options?.query?.trim() || "";
  const shouldFetchAll = Boolean(options?.fetchAll || query);

  if (isDemoMode()) {
    const base = searchDemoOfferings(input);
    const items = query
      ? filterOfferingsByNaturalLanguage(base.items, query)
      : base.items;
    return {
      items,
      nextCursor: query ? null : base.nextCursor,
      unavailable: false,
    };
  }
  try {
    await hydrateRuntimeFromSupabaseKv();
    const db = getDatabase();
    let collected: PublicOffering[] = [];
    let nextCursor: string | null = input.cursor || null;

    if (shouldFetchAll) {
      let cursor: string | undefined = input.cursor;
      for (let page = 0; page < 5; page++) {
        const pageRes = await searchOfferings({ ...input, cursor }, db);
        collected.push(...pageRes.items);
        if (!pageRes.nextCursor) {
          nextCursor = null;
          break;
        }
        cursor = pageRes.nextCursor;
        nextCursor = pageRes.nextCursor;
      }
    } else {
      const result = await searchOfferings(input, db);
      collected = result.items;
      nextCursor = result.nextCursor;
    }

    const rows = await db.academy.findMany({
      where: { id: { in: collected.map((o) => o.academyId) } },
      select: { id: true, name: true, region: true },
    });
    const academyMap = new Map(rows.map((a) => [a.id, a]));
    let hydrated: PublicOffering[] = collected.map((o) => ({
      ...o,
      academyName: academyMap.get(o.academyId)?.name,
      academyRegion: academyMap.get(o.academyId)?.region,
    }));

    if (query) {
      hydrated = filterOfferingsByNaturalLanguage(hydrated, query);
      nextCursor = null;
    }

    return {
      items: hydrated,
      nextCursor,
      unavailable: false,
    };
  } catch {
    return { items: [], nextCursor: null, unavailable: true };
  }
}
export async function getPublicOffering(
  id: string,
): Promise<PublicOffering | null> {
  if (isDemoMode()) return demoOfferings.find((o) => o.id === id) || null;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))
    return null;
  await hydrateRuntimeFromSupabaseKv();
  const db = getDatabase();
  const row = await db.offering.findFirst({
    where: { id, status: "published", academy: { status: "approved" } },
    include: {
      course: true,
      academy: { select: { name: true, region: true } },
      sessions: {
        orderBy: { startsAt: "asc" },
        include: { zoomMeeting: { select: { status: true } } },
      },
      _count: { select: { enrollments: { where: { status: "active" } } } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    academyId: row.academyId,
    academyName: row.academy.name,
    academyRegion: row.academy.region,
    title: row.course.title,
    subject: row.course.subject as PublicOffering["subject"],
    gradeMin: row.course.gradeMin,
    gradeMax: row.course.gradeMax,
    level: row.course.level as PublicOffering["level"],
    priceWon: row.priceWon,
    availableSeats: Math.max(0, row.capacity - row._count.enrollments),
    isZoomLive: row.isZoomLive,
    zoomWaitingRoom: row.zoomWaitingRoom,
    zoomAutoRecording: row.zoomAutoRecording,
    sessions: row.sessions.map((s) => ({
      id: s.id,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      zoomStatus: s.zoomMeeting?.status ?? null,
    })),
  };
}
export async function getPublicAcademy(id: string) {
  if (isDemoMode()) return academies.find((a) => a.id === id) || null;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))
    return null;
  await hydrateRuntimeFromSupabaseKv();
  const row = await getDatabase().academy.findFirst({
    where: { id, status: "approved" },
    select: { id: true, name: true, region: true },
  });
  return row
    ? {
        id: row.id,
        name: row.name,
        area: row.region,
        intro: "온라인에서 만나는 학원의 수업을 확인하세요.",
        teacher: "담당 강사 정보는 수업별로 안내합니다.",
      }
    : null;
}
