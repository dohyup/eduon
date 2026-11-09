import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/server/client";
import { fixture, login, post, value } from "./helpers";
const db = createDatabase(process.env.DATABASE_URL!);
test.afterAll(async () => {
  await db.$disconnect();
});

test("입점 신청·승인부터 새 수업 결제·입장·출결·과제·피드백·보호자 확인까지 이어진다", async ({
  page,
  context,
}) => {
  test.setTimeout(240000);
  const s = fixture.authoring;
  await login(context, s, "owner");
  await page.goto("/academy");
  const name = `학습 여정 합성 학원 ${randomUUID().slice(0, 6)}`;
  await page.getByLabel("학원 이름", { exact: true }).fill(name);
  await page.getByLabel("학원 지역", { exact: true }).fill("대구");
  await page.getByRole("button", { name: "입점 신청", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await login(context, s, "admin");
  await page.goto("/admin/academies");
  const academyRow = page
    .locator("li")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await academyRow
    .getByLabel("심사 사유")
    .fill("합성 학원 신청서와 담당자 검토 완료");
  await academyRow.getByRole("button", { name: "승인", exact: true }).click();
  await expect(
    academyRow.locator("span").filter({ hasText: /^승인$/ }),
  ).toBeVisible();
  const academy = await db.academy.findFirstOrThrow({ where: { name } });
  await login(context, s, "owner");
  const start = new Date(Date.now() + 90000),
    end = new Date(start.getTime() + 3600000);
  const created = await value<{ offeringId: string }>(
    await post(context, "/api/offerings", {
      academyId: academy.id,
      title: "여정 검증 수학",
      subject: "math",
      gradeMin: 4,
      gradeMax: 6,
      level: "beginner",
      priceWon: 120000,
      capacity: 4,
      enrollmentOpensAt: new Date(Date.now() - 3600000).toISOString(),
      enrollmentClosesAt: new Date(start.getTime() - 1000).toISOString(),
      instructorIds: [s.owner.userId],
      sessions: [{ startsAt: start.toISOString(), endsAt: end.toISOString() }],
    }),
  );
  await value(
    await post(context, `/api/offerings/${created.offeringId}/publish`, {}),
  );
  const session = await db.session.findFirstOrThrow({
    where: { offeringId: created.offeringId },
  });
  await db.studentProfile.update({
    where: { id: s.studentId },
    data: { accountUserId: s.student.userId },
  });
  await login(context, s, "parent");
  await page.goto(`/classes/${created.offeringId}`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "신청 내용 확인하기" }).click();
  await expect(page).toHaveURL(/\/checkout\/[a-f0-9-]+$/);
  const orderId = page.url().split("/").at(-1)!;
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "테스트 결제 준비", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "모의 결제 실행 (실제 청구 없음)",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "수강권이 발급되었습니다" }),
  ).toBeVisible();
  await login(context, s, "student");
  await page.goto("/learn");
  await page.getByRole("link", { name: "수업 입장·과제 확인" }).click();
  await expect(
    page.getByRole("heading", { name: "여정 검증 수학", exact: true }),
  ).toBeVisible();
  const joined = await value<{ joinUrl: string }>(
    await post(context, `/api/sessions/${session.id}/join`, {}),
  );
  expect(new URL(joined.joinUrl).hostname).toBe("classroom.example.test");
  expect(await db.attendance.count({ where: { sessionId: session.id } })).toBe(
    0,
  );
  await login(context, s, "owner");
  await page.goto(`/instructor/classes/${created.offeringId}`);
  await page.getByText("새 과제 등록", { exact: true }).click();
  await page
    .getByLabel("과제 제목", { exact: true })
    .fill("배운 내용을 설명해요");
  await page
    .getByLabel("과제 안내", { exact: true })
    .fill("분수의 덧셈을 문장으로 설명하세요.");
  await page
    .getByLabel("제출 마감 (한국시간)", { exact: true })
    .fill(
      new Date(Date.now() + 86400000 + 9 * 3600000).toISOString().slice(0, 16),
    );
  await page.getByRole("button", { name: "과제 등록", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "배운 내용을 설명해요", exact: true }),
  ).toBeVisible();
  // Real execution time crosses the immutable, purchased session's start; no production clock endpoint exists.
  await expect
    .poll(() => Date.now(), { timeout: 100000, intervals: [500] })
    .toBeGreaterThanOrEqual(start.getTime());
  await page.getByText("1회차 출결 입력·수정", { exact: true }).click();
  await page
    .getByLabel("출결 기록·변경 사유", { exact: true })
    .fill("강사가 직접 참여를 확인했습니다.");
  await page
    .getByRole("button", { name: "1회차 출결 저장", exact: true })
    .click();
  await expect(
    page.getByText("강사가 직접 참여를 확인했습니다.", { exact: true }).first(),
  ).toBeVisible();
  await login(context, s, "student");
  await page.goto(`/learn/classes/${created.offeringId}`);
  await page.getByText("과제 답안 작성", { exact: true }).click();
  await page
    .getByLabel("과제 답안", { exact: true })
    .fill("분모를 맞추고 분자를 더합니다.");
  await page.getByRole("button", { name: "과제 제출", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "1차 제출 · 기한 내 제출", exact: true }),
  ).toBeVisible();
  await login(context, s, "owner");
  await page.goto(`/instructor/classes/${created.offeringId}`);
  await page
    .getByLabel("1차 제출에 대한 피드백", { exact: true })
    .fill("분모를 맞추는 이유까지 잘 설명했어요.");
  await page.getByRole("button", { name: "피드백 기록", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "1차 강사 피드백", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("분모를 맞추는 이유까지 잘 설명했어요.", { exact: true }),
  ).toBeVisible();
  await login(context, s, "parent");
  await page.goto("/parent/learning");
  await expect(
    page.getByRole("combobox", { name: "학습 기록을 확인할 자녀" }),
  ).toHaveValue(s.studentId);
  await page.getByRole("link", { name: "출결·과제·피드백 확인" }).click();
  await expect(
    page.getByText("분모를 맞추는 이유까지 잘 설명했어요.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("강사가 직접 참여를 확인했습니다.", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "과제 제출", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /회차 수업 입장/ }),
  ).toHaveCount(0);
  expect(
    await db.enrollment.count({ where: { orderId, status: "active" } }),
  ).toBe(1);
});

test("완료 수강 후기·다음 기수의 현재 가격 동의·새 재수강 주문과 신고 검토를 연결한다", async ({
  page,
  context,
}) => {
  const s = fixture.completed;
  await login(context, s, "teacher");
  await value(
    await post(context, "/api/assignments", {
      offeringId: s.offeringId,
      title: "종료 수업의 늦은 과제",
      instructions: "완료한 수업에서도 답안을 보완해 제출하세요.",
      dueAt: new Date(Date.now() - 3600000).toISOString(),
    }),
  );
  await login(context, s, "student");
  await page.goto(`/learn/classes/${s.offeringId}`);
  await page.getByText("과제 답안 작성", { exact: true }).click();
  await page
    .getByLabel("과제 답안", { exact: true })
    .fill("종료한 수업의 답안을 보완해 늦게 제출합니다.");
  await page.getByRole("button", { name: "과제 제출", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "1차 제출 · 늦은 제출", exact: true }),
  ).toBeVisible();
  await login(context, s, "parent");
  await page.goto(`/learn/classes/${s.offeringId}?studentId=${s.studentId}`);
  await page
    .getByLabel("수강 후기", { exact: true })
    .fill("수업에서 풀이 과정을 배웠습니다. 합성 테스트 후기입니다.");
  await page
    .getByRole("button", { name: "수강 후기 등록", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "내 수강 후기 · 5점 / 5점",
      exact: true,
    }),
  ).toBeVisible();
  const old = await db.offering.findUniqueOrThrow({
    where: { id: s.offeringId },
  });
  await login(context, s, "owner");
  await page.goto("/academy/classes");
  const source = page.locator("li").filter({
    has: page.getByRole("heading", { name: "가상 수학", exact: true }),
  });
  await source.getByText("같은 과정의 다음 기수 개설", { exact: true }).click();
  await source
    .getByLabel("다음 기수 총 수강료 (원)", { exact: true })
    .fill("135000");
  await source.getByLabel("다음 기수 정원 (명)", { exact: true }).fill("4");
  await source
    .getByRole("combobox", { name: "다음 기수 담당 강사", exact: true })
    .selectOption(s.teacher.userId);
  const local = (offset: number) =>
    new Date(Date.now() + offset + 9 * 3600000).toISOString().slice(0, 16);
  await source
    .getByLabel("다음 기수 모집 시작", { exact: true })
    .fill(local(-3600000));
  await source
    .getByLabel("다음 기수 모집 종료", { exact: true })
    .fill(local(86400000));
  await source
    .getByLabel("다음 기수 수업 시작", { exact: true })
    .fill(local(2 * 86400000));
  await source
    .getByLabel("다음 기수 수업 종료", { exact: true })
    .fill(local(2 * 86400000 + 3600000));
  await source
    .getByRole("button", { name: "이 과정의 다음 기수 초안 등록", exact: true })
    .click();
  await expect(source.getByRole("status")).toContainText(
    "다음 기수 초안을 만들었습니다",
  );
  const next = await db.offering.findFirstOrThrow({
    where: { courseId: s.courseId, id: { not: s.offeringId }, status: "draft" },
  });
  await page.getByRole("button", { name: "수업 공개", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "수업이 공개되었습니다" }),
  ).toBeVisible();
  expect(next.priceWon).not.toBe(old.priceWon);
  await login(context, s, "parent");
  await page.goto(`/learn/classes/${s.offeringId}?studentId=${s.studentId}`);
  await expect(
    page.getByRole("combobox", { name: "재수강할 다음 수업" }),
  ).toContainText("135,000원");
  await expect(
    page.getByRole("button", {
      name: "선택한 다음 수업 재수강 신청",
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "선택한 다음 수업 재수강 신청", exact: true })
    .click();
  await expect(page).toHaveURL(/\/checkout\/[a-f0-9-]+$/);
  const id = page.url().split("/").at(-1)!;
  expect(id).not.toBe(s.orderId);
  expect((await db.order.findUniqueOrThrow({ where: { id } })).amountWon).toBe(
    135000,
  );
  await login(context, s, "otherParent");
  const review = await db.review.findUniqueOrThrow({
    where: { enrollmentId: s.enrollmentId },
  });
  await value(
    await post(context, `/api/reviews/${review.id}/report`, {
      reason: "합성 신고 검토 경로 확인",
    }),
  );
  await login(context, s, "admin");
  await page.goto("/admin/reports");
  await page.getByLabel("후기 검토 결과", { exact: true }).selectOption("hide");
  await page
    .getByLabel("검토 사유", { exact: true })
    .fill("합성 테스트 후기 숨김 검토 완료");
  await page
    .getByRole("button", { name: "이 후기의 검토 결과 저장", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "검토 결과와 사유를 기록했습니다" }),
  ).toBeVisible();
  expect(
    (await db.review.findUniqueOrThrow({ where: { id: review.id } })).hiddenAt,
  ).not.toBeNull();
});
