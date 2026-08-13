export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { dashboardStats, getNetworkTree, type ParticipantTreeNode } from '@/lib/beta-service';

const statuses = ['INVITED', 'ACCEPTED', 'INSTALLING', 'ACTIVE', 'COMPLETED', 'STALLED'] as const;

function Tree({ nodes }: { nodes: ParticipantTreeNode[] }) {
  return <ul className="tree">{nodes.map((node) => <li key={node.id}><Link href={`/admin/participants/${node.id}`}>{node.name}</Link> <span className="badge">{node.status}</span>{node.children.length ? <Tree nodes={node.children} /> : null}</li>)}</ul>;
}

export default async function AdminHome() {
  const [stats, tree] = await Promise.all([dashboardStats(), getNetworkTree()]);
  return <div className="grid"><section className="panel"><p className="eyebrow">Operations</p><h1>Technical beta.</h1><div className="grid grid-3">{statuses.map((status) => <div className="panel" key={status}><div className="kpi">{stats.byStatus[status] || 0}</div><div className="muted">{status}</div></div>)}</div></section><section className="grid grid-2"><div className="panel"><h2>Currently stalled</h2>{stats.stalled.length ? <table className="table"><tbody>{stats.stalled.map((p) => <tr key={p.id}><td><Link href={`/admin/participants/${p.id}`}>{p.name}</Link></td><td>{p.organizationOrProject}</td></tr>)}</tbody></table> : <p className="muted">No stalled participants.</p>}</div><div className="panel"><h2>Invite tree</h2>{tree.length ? <Tree nodes={tree} /> : <p className="muted">No participants yet.</p>}</div></section></div>;
}
