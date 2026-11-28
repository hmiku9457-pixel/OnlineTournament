export type PublicationState='idle'|'publishing'|'current'|'failed';
export interface PublicationHealth {state:PublicationState;revision:number|null;checkedAt:number|null}
export const initialPublicationHealth:PublicationHealth={state:'idle',revision:null,checkedAt:null};
export function publicationMessage(health:PublicationHealth):string {
 switch(health.state){
  case 'current': return 'Freigegebene Ansichten aktuell';
  case 'publishing': return 'Ansichten werden veröffentlicht';
  case 'failed': return 'Veröffentlichung fehlgeschlagen – erneut prüfen';
  default:return 'Noch nicht geprüft';
 }
}
/** Explicit allowlist: never copy request bodies, exception text, URLs,
 * participant names, access keys or account identifiers into diagnostics. */
export function buildWorkspaceDiagnostic(input:{online:boolean;revisionState:string;pending:boolean;storageError:boolean;lastCheck:number|null;publication:PublicationHealth}) {
 return {format:1,createdAt:new Date().toISOString(),online:input.online,revisionState:input.revisionState,pending:input.pending,storageError:input.storageError,lastCheck:input.lastCheck,publication:{state:input.publication.state,revision:input.publication.revision,checkedAt:input.publication.checkedAt}};
}
