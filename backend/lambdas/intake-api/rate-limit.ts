import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

export const LIMIT = 30;
export const WINDOW_S = 600;

const memory = new Map<string, number>();
let ddb: DynamoDBClient | undefined;

/** Fixed 10-minute window per staff member. Returns true when the call is allowed. */
export async function allow(staffId: string, now = Date.now()): Promise<boolean> {
  const windowStart = Math.floor(now / 1000 / WINDOW_S) * WINDOW_S;
  const key = `${staffId}#${windowStart}`;
  const table = process.env.RATE_LIMIT_TABLE;
  if (!table) {
    const n = (memory.get(key) ?? 0) + 1;
    memory.set(key, n);
    return n <= LIMIT;
  }
  ddb ??= new DynamoDBClient({});
  const out = await ddb.send(
    new UpdateItemCommand({
      TableName: table,
      Key: { pk: { S: key } },
      UpdateExpression: 'ADD calls :one SET expires_at = if_not_exists(expires_at, :ttl)',
      ExpressionAttributeValues: { ':one': { N: '1' }, ':ttl': { N: String(windowStart + WINDOW_S + 60) } },
      ReturnValues: 'UPDATED_NEW',
    }),
  );
  return Number(out.Attributes?.calls?.N ?? '0') <= LIMIT;
}

export function _resetMemory(): void {
  memory.clear();
}
