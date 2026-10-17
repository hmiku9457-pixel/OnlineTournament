import { useState } from 'react';
import { supabase, supabaseConfigured } from '@/lib/supabase';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

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
        {message && <p className="callout">{message}</p>}
      </div>
    </section>
  );
}
