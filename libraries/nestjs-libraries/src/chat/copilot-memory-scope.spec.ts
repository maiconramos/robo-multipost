import {
  copilotMemoryResourceId,
  copilotReadableResourceIds,
  copilotThreadIdFromBody,
} from './copilot-memory-scope';

describe('copilot-memory-scope', () => {
  it('chave da memoria inclui o perfil quando ha perfil ativo', () => {
    expect(copilotMemoryResourceId('org-1', 'prof-A')).toBe('org-1:prof-A');
    expect(copilotMemoryResourceId('org-1', null)).toBe('org-1');
  });

  it('membro comum so le as conversas do proprio perfil', () => {
    expect(copilotReadableResourceIds('org-1', 'prof-A', false)).toEqual([
      'org-1:prof-A',
    ]);
  });

  it('admin da org tambem le as conversas antigas gravadas so com a org', () => {
    expect(copilotReadableResourceIds('org-1', 'prof-A', true)).toEqual([
      'org-1:prof-A',
      'org-1',
    ]);
    expect(copilotReadableResourceIds('org-1', null, true)).toEqual(['org-1']);
  });

  it('extrai o threadId dos formatos de corpo do run', () => {
    expect(copilotThreadIdFromBody({ body: { threadId: 't-1' } })).toBe('t-1');
    expect(copilotThreadIdFromBody({ params: { threadId: 't-2' } })).toBe('t-2');
    expect(copilotThreadIdFromBody({ threadId: 't-3' })).toBe('t-3');
    expect(copilotThreadIdFromBody({ body: { threadId: 42 } })).toBeUndefined();
    expect(copilotThreadIdFromBody(undefined)).toBeUndefined();
  });
});
