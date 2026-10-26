import { analyzeSchema } from '@simulicity/shared';
import type {
  PlannerRequest,
  PlannerProvider,
  PlannerResponse,
} from '../types/contracts';
/** Server-only integration seam. No undocumented endpoint, SDK, or model ID is assumed. */
export class MetaPlannerProvider implements PlannerProvider {
  readonly available = false;
  async analyze(request: PlannerRequest): Promise<PlannerResponse> {
    analyzeSchema.parse(request);
    throw new Error(
      'Meta Model API / Muse Spark is not configured; real integration is not implemented',
    );
  }
}
