import LoginForm from "./LoginForm";

// Server Component: reads the error query param server-side so the form (and its
// <main> landmark + <h1>) render in the initial HTML instead of behind a
// client-only useSearchParams boundary.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <LoginForm hadError={Boolean(error)} />;
}
