import { LateBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/late.base.provider';

export class LatePinterestProvider extends LateBaseProvider {
  constructor() {
    super('pinterest', 'Pinterest', 500);
  }
}
