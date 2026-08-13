import { loginAction } from '@/lib/actions';

export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ error?: string; next?: string }> }) {
  const query = await searchParams;
  return <main className="main"><div className="container grid grid-2"><section className="panel"><p className="eyebrow">Certifyd Technical Beta</p><h1>Beta operator dashboard.</h1><p className="muted">Secure single-operator access for managing high-touch Certifyd Core technical-beta participants.</p></section><form className="panel grid" action={loginAction}><h2>Admin sign in</h2>{query?.error ? <p className="badge bad">Invalid credentials</p> : null}<input type="hidden" name="next" value={query?.next || '/admin'} /><label>Email<input name="email" type="email" required /></label><label>Password<input name="password" type="password" required /></label><button className="button primary" type="submit">Sign in</button></form></div></main>;
}
