import { useState } from 'react';
import { supabase, supabaseConfigured, checkSupabaseConnection } from '@/lib/supabase';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const [connection, setConnection] = useState('');
  const [checking, setChecking] = useState(false);

  async function checkConnection() {
    setChecking(true);
    setConnection('');
    try {
      await checkSupabaseConnection();
      setConnection('Datenbank erreichbar. Turniere werden weiterhin lokal gespeichert.');
    } catch (error) {
      setConnection(error instanceof Error ? error.message : 'Verbindungstest fehlgeschlagen.');
    } finally {
      setChecking(false);
    }
  }

  async function sendMagicLink() {
    if (!supabaseConfigured || !supabase) {
      setMessage('Supabase ist noch nicht konfiguriert. Siehe .env.example.');
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({ email });
    setMessage(error ? error.message : 'Anmeldelink wurde versendet.');
  }

  return (
    <section className="score-grid">
      <div className="card">
        <h1>Anmelden</h1>
        <p className="muted">Offene Registrierung per Supabase Auth.</p>
        <div className="field"><label htmlFor="email">E-Mail</label><input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="actions" style={{ marginTop: 16 }}><button className="btn primary" onClick={sendMagicLink}>Magic Link senden</button></div>
        <div className="actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn" disabled={checking || !supabaseConfigured} onClick={() => void checkConnection()}>
            {checking ? 'Verbindung wird geprüft …' : 'Datenbankverbindung prüfen'}
          </button>
        </div>
        {!supabaseConfigured && <p className="muted">Supabase ist noch nicht konfiguriert.</p>}
        {connection && <p className="callout" role="status">{connection}</p>}
        {message && <p className="callout">{message}</p>}
      </div>
    </section>
  );
}
