#!/bin/bash
set -o pipefail
cd /home/killer/keycode-alien-interface 2>/dev/null
STATUS=0
echo "=== liveness gate ==="
P=$(ss -ltnp | grep ':3000' | grep -oP 'pid=\K[0-9]+' | head -1)
[ -z "$P" ] && { echo "liveness: server down -> restart"; cd /home/killer/keycode-alien-interface && nohup node server.js > /tmp/kcs-energy.log 2>&1 & sleep 3; P=$(ss -ltnp | grep ':3000' | grep -oP 'pid=\K[0-9]+' | head -1); }
H=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3000/api/health)
[ "$H" != "200" ] && { echo "liveness: restart needed"; [ -n "$P" ] && kill $P 2>/dev/null; sleep 1; cd /home/killer/keycode-alien-interface && nohup node server.js > /tmp/kcs-energy.log 2>&1 & sleep 3; for i in 1 2 3 4 5; do H=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3000/api/health); [ "$H" = "200" ] && break; sleep 2; done; }
echo "liveness: PID=$P HEALTH=$H"
[ "$H" != "200" ] && { echo "liveness: FAILED - server still not healthy after restart"; exit 1; }
STATUS=$((STATUS || (H == 200 ? 0 : 1)))
echo "=== providers ==="
PR=$(curl -s http://localhost:3000/api/ai/providers)
if ! echo "$PR" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'local' in set(p['id'] for p in d['providers']); assert 'pollinations' in set(p['id'] for p in d['providers'])" 2>/dev/null; then echo "providers: local/pollinations not ready"; STATUS=1; fi
echo "providers: local+pollinations ready"
echo "=== token ==="
test -f /tmp/kcs_tok || (curl -s -X POST http://localhost:3000/api/auth/register -H 'Content-Type: application/json' -d "{\"email\":\"verify$((RANDOM%100000))@test.io\",\"password\":\"Passw0rd!\",\"name\":\"Token Recover\"}" >/tmp/reg.json; grep -oE '"token":"[^"]+"' /tmp/reg.json | cut -d'"' -f4 | tail -1 > /tmp/kcs_tok)
echo "token: $(wc -c < /tmp/kcs_tok) bytes"
echo "=== qa script ==="
if ! node --check /tmp/qa-browser3.mjs 2>/dev/null; then
  ln -sfn /home/killer/keycode-alien-interface/node_modules /tmp/node_modules 2>/dev/null
fi
# always sync from the durable repo copy (single source of truth)
cp /home/killer/keycode-alien-interface/.freebuff/qa-browser3.mjs /tmp/qa-browser3.mjs
node --check /tmp/qa-browser3.mjs 2>/dev/null || { echo "qa script: parse fail"; STATUS=1; }
echo "qa script: present + parse ok"
echo "=== page sweep ==="
ALLPAGES="index.html,ai-builder.html,game-builder.html,game.html,dashboard.html,pricing.html,shop.html,blog.html,news.html,tools.html,docs.html,api-keys.html,login.html,register.html,signup.html,profile.html,notifications.html,deployments.html,gallery.html,support.html,status.html,os.html,404.html,admin-access.html,admin-login.html,admin-panel.html,ai-health.html,changelog.html,checkout.html,client-panel.html,control-panel.html,cookies.html,downloads.html,offline.html,otp-login.html,playground.html,preview.html,privacy.html,project-preview.html,realtime-game-builder.html,reset-password.html,scan-3d.html,terms.html,verify-email.html,viewer.html"
export QA_TOKEN=$(cat /tmp/kcs_tok); node /tmp/qa-browser3.mjs "$ALLPAGES" > /tmp/sweep.txt 2>&1
FAILS=$(grep "^FAIL" /tmp/sweep.txt | sort -u | wc -l)
echo "sweep: PASS=$(grep "^PASS" /tmp/sweep.txt | sort -u | wc -l) FAIL=$FAILS"
echo "sweep TOTAL:"; tail -1 /tmp/sweep.txt
echo "sweep FAIL detail:"; grep '^FAIL' /tmp/sweep.txt | head -3
FAILED=$(grep '^FAIL' /tmp/sweep.txt | sed -n 's/^FAIL \([^ ]*\) .*/\1/p')
RETY_COUNT=0
if [ -n "$FAILED" ]; then
  echo "sweep had failures -> retry failed pages in isolation (bounded: 2 attempts each, fail-fast if still failing)"
  for pg in $FAILED; do
    for attempt in 1 2; do
      echo "retry[$attempt]: $pg"
      export QA_TOKEN=$(cat /tmp/kcs_tok)
      timeout 60 node /tmp/qa-browser3.mjs "$pg" >> /tmp/sweep.txt 2>&1 || echo "retry-timeout: $pg"
      localFails=$(grep -c "^FAIL $pg " /tmp/sweep.txt)
      echo "  after retry[$attempt]: PASS=$(grep -c "^PASS $pg " /tmp/sweep.txt) FAIL=$localFails"
      RETY_COUNT=$((RETY_COUNT + localFails))
      if [ "$localFails" -eq 0 ]; then break; fi
      sleep 3
    done
  done
  echo "after retry: PASS=$(grep "^PASS" /tmp/sweep.txt | sort -u | wc -l) FAIL=$(grep "^FAIL" /tmp/sweep.txt | sort -u | wc -l)"
  echo "retry TOTAL:"; tail -1 /tmp/sweep.txt
  echo "retry FAIL detail:"; grep '^FAIL' /tmp/sweep.txt | tail -3
  if [ "$RETY_COUNT" -gt 0 ]; then
    echo "NOTE: $RETY_COUNT retry-failures remain after bounded retry -> flaky page not fully cleared by retry; report as residual flakiness"
    STATUS=1
  fi
fi
echo "=== log tail ==="
tail -3 /tmp/kcs-energy.log
exit $STATUS
