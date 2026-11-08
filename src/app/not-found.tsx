import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main-content" className="container page-content empty-state">
      <span className="eyebrow">404 · PAGE NOT FOUND</span>
      <h1>찾으시는 페이지가 없어요</h1>
      <p>주소를 확인하거나 수업 목록에서 다시 찾아보세요.</p>
      <Link href="/classes" className="button">
        수업 목록으로
      </Link>
    </main>
  );
}
