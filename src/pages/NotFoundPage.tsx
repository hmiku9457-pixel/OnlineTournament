import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return <div className="card"><h1>Seite nicht gefunden</h1><Link to="/">Zur Übersicht</Link></div>;
}
