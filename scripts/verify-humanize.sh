#!/usr/bin/env bash
set -euo pipefail

HOST="${API_HOST:-http://localhost:3001}"
REPO="${1:?usage: $0 <owner/repo> <pr_number>}"
NUMBER="${2:?usage: $0 <owner/repo> <pr_number>}"

BODY=$(gh pr view "$NUMBER" --repo "$REPO" --json body --jq .body)

if [ -z "$BODY" ]; then
  echo "ERROR: PR body is empty" >&2; exit 1
fi

REQ=$(REPO="$REPO" NUMBER="$NUMBER" BODY="$BODY" python3 -c "
import json,os
print(json.dumps({'repo':os.environ['REPO'],'prNumber':int(os.environ['NUMBER']),'body':os.environ['BODY']}))
")

JSON=$(curl -sf -X POST "${HOST}/api/pr-body/humanize" \
  -H 'Content-Type: application/json' \
  --data "$REQ")

if [ -z "$JSON" ]; then
  echo "ERROR: empty response (サーバのログで [humanize] failed: を確認)" >&2; exit 1
fi

echo "$JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if d.get('error'):
    print('ERROR:', d['error']); sys.exit(1)
before=d.get('before',[]); after=d.get('after',[])
print('AIっぽい語: %d件 → %d件' % (len(before), len(after)))
if before:
    print('  before:', '、'.join(sorted({x['word'] for x in before if x['word']})))
if after:
    print('  after :', '、'.join(sorted({x['word'] for x in after if x['word']})))
print('--- rewritten ---')
print(d.get('rewritten',''))
"
