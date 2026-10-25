import { Suspense } from "react";
import { AuthPage } from "@/components/auth";

export const revalidate = 0;

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthPage />
    </Suspense>
  );
}
