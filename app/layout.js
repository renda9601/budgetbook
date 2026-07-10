import "./globals.css";

export const metadata = {
  title: "우리집 가계부",
  description: "가족 공유 가계부 MVP"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
