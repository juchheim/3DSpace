import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="app-shell">
      <section className="panel stack" style={{ maxWidth: "28rem", margin: "2rem auto" }}>
        <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/" />
      </section>
    </main>
  );
}
