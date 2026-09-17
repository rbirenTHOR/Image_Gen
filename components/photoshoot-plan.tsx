"use client";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { generationSizeLabel } from '@/lib/domain';
import { photoshootShots, photoshootCategories, photoshootPasses, type PhotoshootShot } from '@/lib/photoshoot';

export function PhotoshootPlan({ selectedIds, completedIds, nextIds, disabled, onSelect }: {
  selectedIds: string[];
  completedIds: Set<string>;
  nextIds: string[];
  disabled: boolean;
  onSelect: (ids: string[]) => void;
}) {
  const [category, setCategory] = useState('all');
  const selected = selectedIds.flatMap(id => photoshootShots.filter(s => s.id === id));
  const visible = photoshootShots.filter(s => category === 'all' || s.category === category);
  function shotCard(shot: PhotoshootShot, inSelection = false) {
    const chosen = selectedIds.includes(shot.id);
    return <button type="button" key={shot.id} className="shoot-shot" aria-pressed={chosen}
      aria-label={`${inSelection ? 'Remove ' : ''}${shot.label} — ${shot.format}`}
      disabled={disabled || (!chosen && selectedIds.length >= 2)}
      onClick={() => onSelect(chosen ? selectedIds.filter(id => id !== shot.id) : [...selectedIds, shot.id])}>
      <span className={`shot-frame shot-frame-${shot.aspect}`} aria-hidden="true"><span>{String(photoshootShots.indexOf(shot) + 1).padStart(2, '0')}</span></span>
      <strong>{shot.label}</strong><span>{shot.format}</span><small>{shot.camera}</small>
      <p>{shot.summary}</p><small className="shot-usage">For: {shot.usage}</small>
      <em>{chosen ? inSelection ? 'Selected · click to remove' : 'Selected for this pass' : completedIds.has(shot.id) ? 'Photographed · select to revisit' : 'Add to this pass'}</em>
      {chosen && completedIds.has(shot.id) && <small>Previously photographed</small>}
    </button>;
  }
  return <>
    <h3>A full shoot, two frames at a time.</h3>
    <p>{photoshootShots.length} distinct shots for campaign heroes, candid life, product coverage and social. Every frame has its own camera position, action and native image shape. The RV and Jayco lifestyle references keep the shoot connected.</p>
    <div className="shoot-plan-footer">
      <span>{completedIds.size} of {photoshootShots.length} shot roles photographed · {selectedIds.length} selected</span>
      <Button variant="outline" size="sm" disabled={!nextIds.length || disabled} onClick={() => onSelect(nextIds)}>Select next unshot pair</Button>
    </div>
    <section aria-label="Selected shots" className="shoot-selection">
      <h4>This pass</h4>
      <div className="shoot-contact-sheet shoot-selected-pair">{selected.map(s => shotCard(s, true))}</div>
      {!selected.length && <p>No shots selected. Choose a suggested pair or browse individual shots below.</p>}
      <p className="shoot-selection-note">{selected.map(s => `${s.label}: ${generationSizeLabel(s.aspect)}`).join(' · ')}</p>
    </section>
    <section aria-label="Suggested shot pairs">
      <h4>Choose a pair for the job</h4>
      <p>Each choice replaces this pass’s selection. Nothing generates until you click Photograph.</p>
      <div className="shoot-passes">
        {photoshootPasses.map(pass => {
          const completed = pass.shotIds.filter(id => completedIds.has(id)).length;
          const active = pass.shotIds.length === selectedIds.length && pass.shotIds.every((id,i) => selectedIds[i] === id);
          return <button type="button" className="shoot-pass" key={pass.id} aria-pressed={active}
            aria-label={`Select ${pass.label} pair`} disabled={disabled} onClick={() => onSelect([...pass.shotIds])}>
            <strong>{pass.label}</strong><span>{pass.summary}</span><small>{completed}/2 photographed{active ? ' · Selected' : ''}</small>
          </button>;
        })}
      </div>
    </section>
    <details className="shoot-browse">
      <summary>Browse all {photoshootShots.length} individual shots</summary>
      <p>Mix any two. Remove a selected shot first to make room. Generated images still need product and anatomy review before approval.</p>
      <div className="shoot-filters" role="group" aria-label="Filter shot purpose">
        {[{id:'all',label:'All shots'}, ...photoshootCategories].map(group => <button type="button" key={group.id}
          aria-pressed={category === group.id} onClick={() => setCategory(group.id)}>{group.label}</button>)}
      </div>
      <div className="shoot-contact-sheet">{visible.map(s => shotCard(s))}</div>
    </details>
  </>;
}
