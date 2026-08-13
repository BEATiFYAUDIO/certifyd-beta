import Link from 'next/link';
import { logoutAction } from '@/lib/actions';

export function Header({ admin = false }: { admin?: boolean }) {
  return <header className="header"><div className="container header-inner"><Link className="brand" href={admin ? '/admin' : '/'}>certifyd beta</Link>{admin ? <nav className="nav"><Link href="/admin">Dashboard</Link><Link href="/admin/participants">Participants</Link><Link href="/admin/invites">Invites</Link><Link href="/admin/missions">Missions</Link><form action={logoutAction}><button>Sign out</button></form></nav> : null}</div></header>;
}
