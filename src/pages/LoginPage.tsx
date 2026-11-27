import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, supabaseConfigured, checkSupabaseConnection } from '@/lib/supabase';
import { useAccount } from '@/lib/useAccount';

export function LoginPage() {
  const { session, loading } = useAccount();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [connection, setConnection] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  async function checkConnection() {
    setChecking(true); setConnection('');
    try { await checkSupabaseConnection(); setConnection('Datenbank erreichbar.'); }
    catch (error) { setConnection(error instanceof Error ? error.message : 'Verbindungstest fehlgeschlagen.'); }
    finally { setChecking(false); }
  }
  async function authenticate(mode: 'login' | 'register' | 'link' | 'logout') {
    if (!supabase || busy) return;
    setBusy(true); setMessage('');
    try {
      const redirectUrl = new URL(window.location.href);
      redirectUrl.hash = ''; redirectUrl.search = '';
      const redirect = redirectUrl.href;
      const result = mode === 'logout' ? await supabase.auth.signOut()
        : mode === 'link' ? await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirect } })
        : mode === 'register' ? await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirect } })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      setPassword('');
      setMessage(mode === 'register' ? 'Registrierung erfolgreich. Falls erforderlich, bestätige deine E-Mail und melde dich anschließend an.'
        : mode === 'link' ? 'Anmeldelink angefordert. Bitte prüfe dein Postfach.' : mode === 'logout' ? 'Abgemeldet.' : 'Angemeldet.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Anmeldung fehlgeschlagen.'); }
    finally { setBusy(false); }
  }
  return <section className="score-grid"><div className="card">
    <h1>{session ? 'Mein Konto' : 'Anmelden'}</h1>
    {loading ? <p role="status">Konto wird geladen …</p> : session ? <>
      <p>Angemeldet als <strong>{session.user.email}</strong></p>
      <div className="actions"><Link className="btn primary" to="/backups">Turniersicherungen</Link><button className="btn" disabled={busy} onClick={() => void authenticate('logout')}>Abmelden</button></div>
    </> : <>
      <p className="muted">Ein Konto ist für Cloud-Sicherungen erforderlich. Lokale Turniere funktionieren weiterhin ohne Anmeldung.</p>
      <form onSubmit={(event) => { event.preventDefault(); void authenticate('login'); }}>
        <div className="field"><label htmlFor="email">E-Mail</label><input id="email" type="email" autoComplete="email" value={email} required onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label htmlFor="password">Passwort</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <div className="actions" style={{ marginTop: 16 }}>
          <button className="btn primary" type="submit" disabled={!supabaseConfigured || busy || !email || !password}>Anmelden</button>
          <button className="btn" type="button" disabled={!supabaseConfigured || busy || !email || password.length < 8} onClick={() => void authenticate('register')}>Registrieren</button>
          <button className="btn" type="button" disabled={!supabaseConfigured || busy || !email} onClick={() => void authenticate('link')}>Magic Link senden</button>
        </div>
      </form>
    </>}
    <div className="actions" style={{ marginTop: 16 }}><button type="button" className="btn" disabled={checking || !supabaseConfigured} onClick={() => void checkConnection()}>{checking ? 'Verbindung wird geprüft …' : 'Datenbankverbindung prüfen'}</button></div>
    {!supabaseConfigured && <p className="muted">Supabase ist in dieser Entwicklungsumgebung nicht konfiguriert.</p>}
    {connection && <p className="callout" role="status">{connection}</p>}
    {message && <p className="callout" role="status">{message}</p>}
  </div></section>;
}
