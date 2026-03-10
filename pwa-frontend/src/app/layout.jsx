import "./globals.css";
import PwaRegister from "@/components/PwaRegister";

export const metadata = {
  title: "SmartLearn Claw",
  description: "AI-first private learning hub powered by OpenClaw",
  manifest: "/manifest.json",
  themeColor: "#28a745",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
