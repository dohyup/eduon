"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="container page-content empty-state">
      <h1>화면을 불러오지 못했어요</h1>
      <p>잠시 후 다시 시도해주세요. 입력한 내용은 제출되지 않았습니다.</p>
      <button className="button" onClick={reset}>
        다시 시도
      </button>
    </main>
  );
}
