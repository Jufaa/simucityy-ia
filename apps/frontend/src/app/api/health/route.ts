import { checkApiHealth } from '@/lib/health';
export const dynamic = 'force-dynamic';
export async function GET() {
  return checkApiHealth();
}
