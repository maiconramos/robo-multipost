import type { AutomationConfiguration } from './automation-management.dto';
export interface ZernioAutomationView {
  integration?: {
    id: string;
    name: string;
    picture: string | null;
    providerIdentifier: string;
  };
  id: string;
  name: string;
  integrationId: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  revision: number;
  updatedAt?: string;
  executionVersion: 3;
  engine: 'zernio';
  quickEditable: boolean;
  configuration: AutomationConfiguration;
  syncState: 'idle' | 'pending' | 'unknown';
  errorCode?: string;
}
