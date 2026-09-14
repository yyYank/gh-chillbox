#!/usr/bin/env bash
set -euo pipefail

HOST="${API_HOST:-http://localhost:3001}"
REPO="${1:?usage: $0 <owner/repo> <pr_number> [filter]}"
NUMBER="${2:?usage: $0 <owner/repo> <pr_number> [filter]}"
FILTER="${3:-}"

JSON=$(curl -sf "${HOST}/api/ast-analysis?repo=${REPO}&number=${NUMBER}")

if [ -z "$JSON" ]; then
  echo "ERROR: empty response" >&2; exit 1
fi

SYM_COUNT=$(echo "$JSON" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('symbols',[])))")
REL_COUNT=$(echo "$JSON" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('relations',[])))")
echo "symbols: ${SYM_COUNT}, relations: ${REL_COUNT}"

if [ -n "$FILTER" ]; then
  echo "--- relations matching '${FILTER}' ---"
  echo "$JSON" | python3 -c "
import json,sys
f='${FILTER}'
rels=json.load(sys.stdin).get('relations',[])
matched=[r for r in rels if f in r.get('from','') or f in r.get('to','')]
for r in matched:
    print(r['from'],'→',r['to'],'('+r.get('kind','')+')')
if not matched:
    print('(no match)')
"
else
  echo "--- all relations ---"
  echo "$JSON" | python3 -c "
import json,sys
rels=json.load(sys.stdin).get('relations',[])
for r in rels:
    print(r['from'],'→',r['to'],'('+r.get('kind','')+')')
"
fi
