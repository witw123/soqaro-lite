import { Suspense } from "react";
import { AuthPage } from "@/components/auth";

export const dynamic = "force-static";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthPage />
    </Suspense>
  );
}
