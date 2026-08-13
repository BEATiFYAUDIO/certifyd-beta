import { Header } from '@/components/Header';
import { requireAdmin } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <><Header admin /><main className="main"><div className="container">{children}</div></main></>;
}
