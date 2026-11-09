export function authLinkMessage(search: string, hash: string): string {
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  if (fragment.get("error_code") === "otp_expired")
    return "이메일 로그인 링크가 만료됐거나 이미 사용됐습니다. 아래에서 인증코드를 새로 받아 숫자 코드로 로그인해 주세요.";
  if (new URLSearchParams(search).get("error") === "callback")
    return "로그인 확인을 완료하지 못했습니다. 로그인 요청과 링크 열기는 같은 브라우저에서 진행해 주세요.";
  return "";
}
