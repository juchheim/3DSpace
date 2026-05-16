import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="app-shell">
      <section className="panel stack" style={{ maxWidth: "28rem", margin: "2rem auto" }}>
        <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/" />
      </section>
    </main>
  );
}
