import "server-only";
import { isDemoMode } from "@/server/config";
import { getDatabase } from "@/server/db";
import { academies, demoOfferings } from "@/demo/catalog";
import { searchDemoOfferings } from "@/demo/search";
import { searchOfferings } from "./search";
import type { PublicOffering, SearchInput } from "@/contracts/domain";
export async function listPublicOfferings(input: SearchInput = {}) {
  if (isDemoMode())
    return { ...searchDemoOfferings(input), unavailable: false };
  try {
    const db = getDatabase();
    const result = await searchOfferings(input, db);
    const rows = await db.academy.findMany({
      where: { id: { in: result.items.map((o) => o.academyId) } },
      select: { id: true, name: true, region: true },
    });
    return {
      ...result,
      items: result.items.map((o) => ({
        ...o,
        academyName: rows.find((a) => a.id === o.academyId)?.name,
        academyRegion: rows.find((a) => a.id === o.academyId)?.region,
      })),
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
