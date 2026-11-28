import {describe,it,expect} from 'vitest';
import {buildWorkspaceDiagnostic,publicationMessage} from '@/domain/workspaceHealth';
describe('workspace diagnostics',()=>{
 it('exports only explicit fields, never secrets or error text',()=>{
  const input={online:false,revisionState:'unknown',pending:true,storageError:true,lastCheck:123,publication:{state:'failed' as const,revision:7,checkedAt:456,token:'secret'},ownerId:'secret',error:'private match'};
  const diagnostic=buildWorkspaceDiagnostic(input);
  expect(diagnostic.publication).toEqual({state:'failed',revision:7,checkedAt:456});
  expect(JSON.stringify(diagnostic)).not.toContain('secret');
  expect(JSON.stringify(diagnostic)).not.toContain('private match');
  expect(publicationMessage(input.publication)).toContain('fehlgeschlagen');
 });
});
