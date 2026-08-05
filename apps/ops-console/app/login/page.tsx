import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Mumtaz Operations</h1>
        <p className="mt-1 mb-5 text-sm text-neutral-600">Sign in to continue.</p>
        <LoginForm />
      </div>
      <p className="mt-4 text-center text-xs text-neutral-500">
        Access is by invitation. Contact an administrator if you need an account.
      </p>
    </div>
  );
}
