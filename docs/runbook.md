# Runbook — deskaway-relay

You are reading this at 3am. Start at the symptom that matches, run the confirm
command, then work down.

> **Status: nothing is deployed.** No environment, no dashboard, no alarm. Every
> entry below is **Verified: never** — the commands are shaped correctly but none
> has been run against a real system. Break each thing on purpose, follow the
> entry, and change its marker to `Verified: <date>`. An untested runbook entry is
> a guess with formatting.

## Fill these in before you need them

Set these once per shell; every command below uses them.

```sh
export AWS_REGION=eu-west-1
export ENV=prod
export CLUSTER=deskaway-$ENV
export SERVICE=deskaway-relay-$ENV
export RELAY_URL=https://relay.example.com
```

## First 60 seconds, always

```sh
curl -sS -o /dev/null -w '%{http_code} %{time_total}s\n' "$RELAY_URL/health"
aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
  --query 'services[0].{desired:desiredCount,running:runningCount,deployments:deployments[*].{status:status,rollout:rolloutState}}'
aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
  --query 'services[0].events[0:5].message' --output text
```

**Did something just deploy?** If yes, roll back before diagnosing anything.

```sh
aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" \
  --task-definition "$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
    --query 'services[0].deployments[-1].taskDefinition' --output text)" \
  --force-new-deployment
```

Full procedure: `deskaway-infra/runbooks/rollback.md`.

---

## The relay will not start

Tasks crash-loop, or `runningCount` stays at 0.

**Confirm:**
```sh
aws ecs describe-tasks --cluster "$CLUSTER" \
  --tasks "$(aws ecs list-tasks --cluster "$CLUSTER" --service-name "$SERVICE" \
    --desired-status STOPPED --query 'taskArns[0]' --output text)" \
  --query 'tasks[0].{stopped:stoppedReason,exit:containers[0].exitCode}'
```

**Check first — configuration.** `src/config/load.ts` validates every variable at
boot and exits on a missing or invalid one. That is deliberate, and it is the most
common cause of this symptom.

```sh
aws logs tail "/ecs/$SERVICE" --since 15m | grep -iE 'config|env|missing|invalid' | head -20
```

The log names the variable. Two usual causes: a variable added in code but not in
the task definition, or a rotated secret whose new value was never written.

**Fix:**
```sh
# confirm the secret has a current value (prints metadata, not the secret)
aws secretsmanager describe-secret --secret-id "deskaway/$ENV/relay" \
  --query '{changed:LastChangedDate,rotated:LastRotatedDate}'
```
Correct the value or the task definition in `deskaway-infra`, merge, let `apply`
run. Do not patch the task definition by hand — it will be reverted by the next
apply, at a worse time.

**If the fix fails:** roll back to the last task definition that started (command
in *First 60 seconds*). A running old version beats a correct new one that will not
boot.

---

## All connections are dropping

Clients reconnect in a loop; connection count churns.

**Confirm:**
```sh
aws logs tail "/ecs/$SERVICE" --since 5m --filter-pattern 'close' | head -30
```

**Check first, in this order:**

1. **Auth.** An expired or rejected token closes sockets deliberately, and en masse
   it looks exactly like an outage. Look for close reasons from
   `enums/close-reason.json` rather than assuming a crash.
   ```sh
   aws logs tail "/ecs/$SERVICE" --since 5m --filter-pattern 'auth' | head -20
   ```
2. **One instance or all of them?** One instance that cannot reach Redis drops only
   the sockets it cannot serve.
   ```sh
   aws ecs list-tasks --cluster "$CLUSTER" --service-name "$SERVICE" --output text
   ```
3. **Heartbeat timing.** A heartbeat interval shorter than clients' reply time
   evicts everyone. Compare the deployed interval against what shipped in the
   clients — a recent change on either side is the suspect.
4. **Load balancer idle timeout** below the heartbeat interval will kill every idle
   socket on a timer.
   ```sh
   aws elbv2 describe-load-balancer-attributes --load-balancer-arn "$ALB_ARN" \
     --query "Attributes[?Key=='idle_timeout.timeout_seconds']"
   ```

**Fix:** revert whichever of those four changed most recently.

**If the fix fails:** scale out to spread load, then drain one instance and read its
logs in isolation.
```sh
aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" --desired-count 4
```

---

## Approvals are not reaching phones

A run stalls waiting for a human who was never asked. The most user-visible
failure.

**Confirm** the request exists but was not delivered:
```sh
psql "$DATABASE_URL" -c "select id, run_id, state, created_at, delivered_at
  from approval_request where state <> 'settled'
  order by created_at desc limit 20;"
```

**Check first:**

1. **Recorded but undelivered** → delivery path. Go to 2.
   **Never created** → the desktop's request never arrived; treat as *all
   connections are dropping*.
2. **Push delivery.** An expired push credential fails silently from the user's
   side.
   ```sh
   aws logs tail "/ecs/$SERVICE" --since 15m --filter-pattern 'push' | head -20
   ```
3. **Redis.** If the approval was created on instance A and the phone's socket is on
   instance B, `bus/` is how it crosses. A Redis outage breaks exactly this and
   little else — some users fine, some not, depending on where they landed.
   ```sh
   redis-cli -u "$REDIS_URL" ping
   redis-cli -u "$REDIS_URL" pubsub channels 'deskaway*'
   ```

**Fix:** rotate the push credential, or restore Redis. A queued approval is
recoverable — the queue is durable precisely so this is survivable.

**If the fix fails:** scale to a single instance. Cross-instance delivery stops
being needed, restoring correct behaviour at reduced capacity.
```sh
aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" --desired-count 1
```
Write it down and undo it afterwards.

---

## The database is refusing connections

**Confirm:**
```sh
psql "$DATABASE_URL" -c 'select 1' || echo "REFUSED"
aws rds describe-db-instances --db-instance-identifier "deskaway-$ENV" \
  --query 'DBInstances[0].{status:DBInstanceStatus,az:AvailabilityZone}'
```

**Check first — connection count against the limit:**
```sh
psql "$DATABASE_URL" -c "select count(*), state from pg_stat_activity group by state;"
psql "$DATABASE_URL" -c "show max_connections;"
```

If the pool is exhausted, find what is holding connections:
```sh
psql "$DATABASE_URL" -c "select pid, state, now()-query_start as age, left(query,80)
  from pg_stat_activity where state <> 'idle'
  order by age desc limit 10;"
```

**Fix.** A slow query holding connections, or a leak in
`persistence/repositories`. Terminate the worst offender:
```sh
psql "$DATABASE_URL" -c "select pg_terminate_backend(PID_HERE);"
```
Restarting the service clears the symptom and hides the cause — note which query it
was before you do.

**If the fix fails:** fail over, then restore. Stop writes before any restore
attempt.
```sh
aws rds reboot-db-instance --db-instance-identifier "deskaway-$ENV" --force-failover
```
`deskaway-infra/runbooks/restore-from-backup.md`.

**Never** patch a failed migration by editing it. Migrations are forward-only; write
a new one that corrects the state.

---

## Memory keeps climbing

Restarts on a sawtooth, or tasks killed for exceeding their limit.

**Confirm:**
```sh
aws cloudwatch get-metric-statistics --namespace AWS/ECS \
  --metric-name MemoryUtilization --period 300 --statistics Maximum \
  --start-time "$(date -u -d '6 hours ago' +%FT%TZ)" --end-time "$(date -u +%FT%TZ)" \
  --dimensions Name=ClusterName,Value="$CLUSTER" Name=ServiceName,Value="$SERVICE"
aws ecs describe-tasks --cluster "$CLUSTER" \
  --tasks "$(aws ecs list-tasks --cluster "$CLUSTER" --service-name "$SERVICE" --query 'taskArns[0]' --output text)" \
  --query 'tasks[0].containers[0].{reason:reason}'
```

**Check first, in likelihood order for this service:**

1. **`ws/connection-registry` not releasing closed sockets.** Compare live
   connections against the registry's size — if they diverge, entries are leaking.
2. **`ws/backpressure` buffering for a slow consumer** that never drains. A phone on
   a bad connection can accumulate an unbounded queue if the limit is missing.
3. **`recording/writer` holding transcripts in memory** when the S3 sink is failing.
   Check for sink errors before assuming a leak.
   ```sh
   aws logs tail "/ecs/$SERVICE" --since 30m --filter-pattern 's3' | head -20
   ```
4. **Postgres or Redis client pool growing** without bound.

**Fix:** the leak. Until it is found, a rolling restart buys hours:
```sh
aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" --force-new-deployment
```

**If the fix fails:** raise the memory limit in `deskaway-infra` to widen the
sawtooth, and treat it as a known issue with a ticket — not a resolution.

---

## Recordings are failing

**Confirm:**
```sh
aws logs tail "/ecs/$SERVICE" --since 30m --filter-pattern 's3' | head -20
aws s3 ls "s3://deskaway-recordings-$ENV/" --recursive --human-readable | tail -5
```

Runs continue; transcripts are lost. Decide **explicitly** whether to keep serving
without recording, and write the decision in the incident notes.

**If you suspect unredacted data was written**, this is a security incident, not an
outage. `recording/redaction.ts` runs before the sink, so anything that got past it
is a redaction bug and the stored objects need review. Stop the sink first:
```sh
aws s3api put-public-access-block --bucket "deskaway-recordings-$ENV" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```
Then follow [SECURITY.md](../SECURITY.md).

---

## The agent is unavailable

New tasks cannot be planned. **Runs already in progress are unaffected** — their
plan already exists and lives on the desktop.

**Confirm:**
```sh
curl -sS -o /dev/null -w '%{http_code}\n' "$AGENT_URL/healthz"
```

**Check** that the relay fails cleanly rather than hanging. A blocked planning call
holding a socket open is worse than a fast failure.

Then `deskaway-agent/docs/runbook.md`.

---

## After any incident

- Write down what actually happened, in the pull request or an issue.
- **Fix the entry above that was wrong, in the same pull request as the fix.** This
  is the only way this file stops being guesswork.
- Update the `Verified:` marker on any entry you actually used.
- If you changed configuration by hand, describe it in `deskaway-infra` and remove
  the hand-made version.
