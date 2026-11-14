// Usage: npx tsx scripts/mint-dev-token.ts ana.desk@example.com
import { mintDevToken } from './dev-token';

const email = process.argv[2];
if (!email) {
  console.error('Usage: npx tsx scripts/mint-dev-token.ts <staff email>');
  process.exit(1);
}
try {
  console.log((await mintDevToken(email)).access_token);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
