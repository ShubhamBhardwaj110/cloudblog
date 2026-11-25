import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

/** Opaque pagination cursor <-> DynamoDB LastEvaluatedKey */
export const cursor = {
  encode(key: Record<string, unknown> | undefined): string | undefined {
    return key ? Buffer.from(JSON.stringify(key)).toString('base64url') : undefined;
  },
  decode(value: string | undefined): Record<string, unknown> | undefined {
    if (!value) return undefined;
    try {
      return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    } catch {
      return undefined;
    }
  },
};
