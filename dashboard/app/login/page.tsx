export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="login">
      <form action="/api/login" method="post" className="panel">
        <h1>Claude Usage</h1>
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoFocus required autoComplete="current-password" />
        {error && <p className="error" role="alert">Wrong password.</p>}
        <button>Sign in</button>
      </form>
    </main>
  );
}
