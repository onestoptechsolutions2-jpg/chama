import { googleEnabled } from "@/lib/auth/google";
import { LoginView } from "./login-form";

export default function LoginPage() {
  return <LoginView googleEnabled={googleEnabled()} />;
}
