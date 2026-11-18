import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { shortDept, useHub, EMPTY_SCOPE } from '../lib/store';
import { heatmap, type AuditResult } from '../lib/derive';
import { band, bandLabel, fmtDate } from '../lib/utils';
import { Empty } from './ui';
import { T } from '../lib/content';

/** Hospital › Department › Ward filter. Changing a level resets the levels below it. */
export function ScopeFilter() {
  const hub = useHub();
  const { scope } = hub;
  const depts = hub.departments.filter(d => d.hospital_id === scope.hospital);
  const wards = hub.wards.filter(w => (!scope.hospital || w.hospital_id === scope.hospital) && (!scope.department || w.department_id === scope.department));
  const isFiltered = scope.hospital || scope.department || scope.ward;
  return <div className="scope-filter" role="group" aria-label="Filter every page by hospital, department and ward">
    <label><span><T page="shell">Hospital</T></span><select value={scope.hospital} onChange={e => hub.setScope({ ...EMPTY_SCOPE, hospital: e.target.value })} aria-label="Hospital">
      <option value="">All hospitals</option>{hub.hospitals.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
    <label><span><T page="shell">Department</T></span><select value={scope.department} disabled={!depts.length} onChange={e => hub.setScope({ ...scope, department: e.target.value, ward: '' })} aria-label="Department">
      <option value="">{!scope.hospital ? 'Choose a hospital' : depts.length ? 'All departments' : 'No departments'}</option>{depts.map(d => <option key={d.id} value={d.id}>{shortDept(d.name)}</option>)}</select></label>
    <label><span><T page="shell">Ward / unit</T></span><select value={scope.ward} onChange={e => { const w = hub.ward(e.target.value); hub.setScope(w ? { hospital: w.hospital_id, department: w.department_id ?? '', ward: w.id } : { ...scope, ward: '' }); }} aria-label="Ward or unit">
      <option value="">All wards ({wards.length})</option><WardOptions wards={wards} /></select></label>
    {isFiltered && <button className="btn small" onClick={() => hub.setScope(EMPTY_SCOPE)}><T>Clear</T></button>}
  </div>;
}

/** Ward <option>s grouped by hospital and department. */
export function WardOptions({ wards }: { wards: { id: string; name: string; hospital_id: string; department_id: string | null }[] }) {
  const hub = useHub();
  const groups = new Map<string, typeof wards>();
  for (const w of wards) {
    const key = `${hub.hospital(w.hospital_id)?.short ?? ''}${w.department_id ? ' · ' + shortDept(hub.department(w.department_id)?.name ?? '') : ''}`;
    groups.set(key, [...(groups.get(key) ?? []), w]);
  }
  return <>{[...groups].map(([label, ws]) => <optgroup key={label} label={label}>{ws.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</optgroup>)}</>;
}

/** Ward name with where it sits underneath, so repeated names stay unambiguous. */
export function WardCell({ id }: { id: string }) {
  const hub = useHub();
  return <><span className="ward-name">{hub.wardName(id)}</span><small className="muted block">{hub.wardContext(id)}</small></>;
}

type Cell = AuditResult | { ward_id: string; topic: string; score: null };

/** Ward × standard heatmap grouped by hospital and department, collapsible. */
export function GroupedHeatmap({ topics, results }: { topics: string[]; results: AuditResult[] }) {
  const hub = useHub();
  const [onlyAudited, setOnlyAudited] = useState(true);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [cell, setCell] = useState<Cell | null>(null);
  const rows = useMemo(() => heatmap(hub.scopedWards.map(w => w.id), topics, results), [hub.scopedWards, topics, results]);
  const visible = onlyAudited ? rows.filter(r => r.cells.some(Boolean)) : rows;
  const groups = useMemo(() => {
    const out: { key: string; hospital: string; department: string | null; rows: typeof visible }[] = [];
    for (const r of visible) {
      const w = hub.ward(r.ward_id)!;
      const key = `${w.hospital_id}|${w.department_id ?? ''}`;
      let g = out.find(x => x.key === key);
      if (!g) { g = { key, hospital: hub.hospital(w.hospital_id)?.name ?? '', department: w.department_id ? shortDept(hub.department(w.department_id)?.name ?? '') : null, rows: [] }; out.push(g); }
      g.rows.push(r);
    }
    return out;
  }, [visible, hub]);
  const toggle = (k: string) => setClosed(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const allClosed = groups.length > 0 && groups.every(g => closed.has(g.key));

  return <>
    <div className="heatmap-tools">
      <label className="check"><input type="checkbox" checked={onlyAudited} onChange={e => setOnlyAudited(e.target.checked)} /> Only wards with audit results ({rows.filter(r => r.cells.some(Boolean)).length} of {rows.length})</label>
      {groups.length > 1 && <button className="btn small" onClick={() => setClosed(allClosed ? new Set() : new Set(groups.map(g => g.key)))}>{allClosed ? 'Expand all' : 'Collapse all'}</button>}
    </div>
    {!visible.length ? <Empty title="No audit results in this scope" hint="Untick “Only wards with audit results” to see every ward." /> :
      <div className="heatmap-wrap heatmap-scroll"><table className="heatmap"><thead><tr><th scope="col">Ward</th>{topics.map(s => <th scope="col" key={s}>{s}</th>)}</tr></thead>
        {groups.map(g => { const open = !closed.has(g.key); return <tbody key={g.key}>
          <tr className="group-row"><th colSpan={topics.length + 1} scope="rowgroup"><button type="button" className="group-toggle" aria-expanded={open} onClick={() => toggle(g.key)}>{open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}{g.hospital}{g.department && <span> › {g.department}</span>}<em>{g.rows.length} {g.rows.length === 1 ? 'ward' : 'wards'}</em></button></th></tr>
          {open && g.rows.map(row => <tr className={hub.scope.ward === row.ward_id ? 'selected-row' : ''} key={row.ward_id}><th scope="row">{hub.wardName(row.ward_id)}</th>
            {row.cells.map((r, i) => <td key={topics[i]}><button type="button" className={'heat ' + (r ? band(r.score) : 'none')}
              aria-label={r ? `${hub.wardName(row.ward_id)} (${hub.wardContext(row.ward_id)}), ${topics[i]}: ${r.score}% from ${r.source}` : `${hub.wardName(row.ward_id)} (${hub.wardContext(row.ward_id)}), ${topics[i]}: not audited`}
              aria-pressed={cell?.ward_id === row.ward_id && cell?.topic === topics[i]}
              onClick={() => setCell(r ?? { ward_id: row.ward_id, topic: topics[i], score: null })}>{r ? `${r.score}%` : '—'}</button></td>)}
          </tr>)}
        </tbody>; })}
      </table></div>}
    <div className="legend"><span><i className="dot good" />90%+ On target</span><span><i className="dot warning" />80–89% Watch</span><span><i className="dot critical" />Below 80% Needs action</span><span><i className="dot none" />— Not audited</span></div>
    {cell && <div className="cell-detail" role="status"><strong>{hub.wardName(cell.ward_id)} ({hub.wardContext(cell.ward_id)}) · {cell.topic}{cell.score != null && `: ${cell.score}%`}</strong>
      <span>{cell.score == null ? 'No scored audit for this ward and standard yet.' : `From audit ${(cell as AuditResult).source}, ${fmtDate((cell as AuditResult).date)} · ${bandLabel(cell.score)}`}</span></div>}
  </>;
}
