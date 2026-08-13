export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { dashboardStats, getNetworkTree, type ParticipantTreeNode } from '@/lib/beta-service';

const statuses = ['INVITED', 'ACCEPTED', 'ACTIVE', 'COMPLETED', 'STALLED'] as const;

function Tree({ nodes }: { nodes: ParticipantTreeNode[] }) {
  return <ul className="tree">{nodes.map((node) => <li key={node.id}><Link href={`/admin/participants/${node.id}`}>{node.name}</Link> <span className="badge">{node.status}</span>{node.children.length ? <Tree nodes={node.children} /> : null}</li>)}</ul>;
}

export default async function AdminHome() {
  const [stats, tree] = await Promise.all([dashboardStats(), getNetworkTree()]);
  return <div className="grid"><section className="panel"><div><p className="eyebrow">Operations</p><h1>Technical beta.</h1></div><div className="grid grid-3">{statuses.map((status) => <div className="panel" key={status}><div className="kpi">{stats.byStatus[status] || 0}</div><div className="muted">{status}</div></div>)}</div></section><section className="panel"><h2>Journey funnel</h2><div className="grid grid-3">{stats.stageCounts.map((stage) => <div className="panel" key={stage.id}><div className="kpi">{stage._count.assignments}</div><strong>{stage.name}</strong><p className="muted">Completed participants</p></div>)}</div></section><section className="grid grid-2"><div className="panel"><h2>Blocked stages</h2>{stats.blockedAssignments.length ? <table className="table"><tbody>{stats.blockedAssignments.map((assignment) => <tr key={assignment.id}><td><Link href={`/admin/participants/${assignment.participantId}`}>{assignment.participant.name}</Link></td><td>{assignment.mission.name}</td></tr>)}</tbody></table> : <p className="muted">No blocked mission assignments.</p>}<h2>Currently stalled</h2>{stats.stalled.length ? <table className="table"><tbody>{stats.stalled.map((p) => <tr key={p.id}><td><Link href={`/admin/participants/${p.id}`}>{p.name}</Link></td><td>{p.organizationOrProject}</td></tr>)}</tbody></table> : <p className="muted">No stalled participants.</p>}</div><div className="panel"><h2>Invite tree</h2>{tree.length ? <Tree nodes={tree} /> : <p className="muted">No participants yet.</p>}</div></section></div>;
}
