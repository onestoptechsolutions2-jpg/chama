import { googleEnabled } from "@/lib/auth/google";
import { RegisterView } from "./register-form";

export default function RegisterPage() {
  return <RegisterView googleEnabled={googleEnabled()} />;
}
