import { notFound } from "next/navigation";
import {
  getPublicAcademy,
  listPublicOfferings,
} from "@/modules/catalog/public";
import { isDemoMode } from "@/server/config";
import { OfferingCard } from "@/components/catalog/offering-card";
export default async function Academy({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const a = await getPublicAcademy(id);
  const { items: demoOfferings } = await listPublicOfferings();
  if (!a) notFound();
  return (
    <main id="main-content" className="container page-content">
      <div className="page-heading">
        <span className="eyebrow">
          MEET YOUR ACADEMY {isDemoMode() ? "· 가상 학원" : ""}
        </span>
        <h1>{a.name}</h1>
        <p>{a.intro}</p>
        <p className="muted">
          {a.area} · {a.teacher} · 온라인 소그룹 수업
        </p>
      </div>
      <div className="panel">
        <h2>한 명의 이해를 소중하게</h2>
        <p>
          {isDemoMode()
            ? "이 페이지의 학원은 가상 기관입니다."
            : "입점 승인은 플랫폼의 운영 검토 상태이며 특정 교육 성과나 자격을 보장하지 않습니다."}
        </p>
      </div>
      <h2 className="section-subtitle">학원의 공개 수업</h2>
      <div className="course-grid">
        {demoOfferings
          .filter((o) => o.academyId === id)
          .map((o) => (
            <OfferingCard key={o.id} offering={o} />
          ))}
      </div>
    </main>
  );
}
