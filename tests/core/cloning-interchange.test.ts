import { describe, expect, it } from 'vitest';
import { designNebuilder } from '@/core/cloning/methods/nebuilder';
import { designToIdt, exportNebuilderProject, fragmentsToFasta, parseNebuilderProject } from '@/core/cloning/interchange';
import spacerProject from '../fixtures/vendor/nebuilder/projects/linear-spacer.json';
import phusionProject from '../fixtures/vendor/nebuilder/projects/three-fragment-phusion.json';

describe('NEBuilder project interchange', () => {
  it('imports a NEBuilder project with a custom spacer and reproduces its primers', () => {
    const project = parseNebuilderProject(JSON.stringify(spacerProject));
    expect(project.settings).toMatchObject({ minOverlap: 15, circularize: false, polymeraseId: 'q5-0' });
    expect(project.settings.junctions?.[0]).toEqual({ spacer: 'GGATCC', mode: 'downstream' });
    const design = designNebuilder(project.fragments, project.settings);
    expect(design.findings).toEqual([]);
    const reverse = design.primers.find(primer => primer.name === 'left_rev')!;
    expect([reverse.overlap, reverse.spacer, reverse.anneal]).toEqual(['GCCCTTGCTCACCAT', 'GGATCC', 'ACCGTGCATCTGCCAGTTTG']);
    expect([reverse.tm, reverse.ta]).toEqual([68.6, 66.4]);
    expect(design.primers.filter(primer => primer.overlap || primer.spacer).map(primer => primer.name)).toEqual(['left_rev']);
    expect(design.product).toHaveLength(283 + 285 + 6);
  });

  it('imports a Phusion three-fragment project with its polymerase and Tm method', () => {
    const project = parseNebuilderProject(JSON.stringify(phusionProject));
    expect(project.settings.polymeraseId).toBe('phusion-1');
    expect(project.fragments).toHaveLength(3);
    const design = designNebuilder(project.fragments, project.settings);
    expect(design.findings).toEqual([]);
    expect(design.primers).toHaveLength(6);
  });

  it('exports an unsigned project that round-trips through our importer', () => {
    const project = parseNebuilderProject(JSON.stringify(spacerProject));
    const text = exportNebuilderProject('roundtrip', project.fragments, project.settings);
    expect(JSON.parse(text)).not.toHaveProperty('valid');
    const again = parseNebuilderProject(text);
    expect(again.fragments.map(fragment => fragment.sequence)).toEqual(project.fragments.map(fragment => fragment.sequence));
    expect(again.settings.polymeraseId).toBe(project.settings.polymeraseId);
  });

  it('writes IDT bulk and fragment FASTA files', () => {
    const project = parseNebuilderProject(JSON.stringify(spacerProject));
    const design = designNebuilder(project.fragments, project.settings);
    const idt = designToIdt(design).trim().split('\n');
    expect(idt).toHaveLength(4);
    expect(idt[1]).toBe('left_rev\tGCCCTTGCTCACCATGGATCCACCGTGCATCTGCCAGTTTG\t25nm\tSTD');
    expect(fragmentsToFasta(design.templates).startsWith('>left len=283\n')).toBe(true);
  });

  it('rejects files that are not NEBuilder projects and unsupported fragment types', () => {
    expect(() => parseNebuilderProject('not json')).toThrow(/not valid JSON/);
    expect(() => parseNebuilderProject('{"hello": 1}')).toThrow(/does not look like/);
    const synthetic = { ...spacerProject, fragments: [{ ...spacerProject.fragments[0], type: 'synth' }] };
    expect(() => parseNebuilderProject(JSON.stringify(synthetic))).toThrow(/synthetic fragments/);
  });

  it('blocks a spacer on a split junction instead of guessing', () => {
    const project = parseNebuilderProject(JSON.stringify(spacerProject));
    const design = designNebuilder(project.fragments, { ...project.settings, junctions: [{ spacer: 'GGATCC', mode: 'split' }] });
    expect(design.findings.map(finding => finding.code)).toContain('SPACER_NEEDS_PLACEMENT');
    expect(design.primers).toEqual([]);
  });
});
