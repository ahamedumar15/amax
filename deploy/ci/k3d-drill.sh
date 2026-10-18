#!/usr/bin/env bash
# 034 AC-3: the restore drill on k3d, as the chart runs it. Needs a k3d cluster with amax:ci and
# amax:ci-ops imported. Fails unless the drill restored the snapshot and recorded "passed".
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
tenant=11111111-1111-4111-8111-111111111111
psql() { kubectl exec deploy/postgres -- psql -U amax -d amax -v ON_ERROR_STOP=1 -Atc "$1"; }
dump() { kubectl get pods; kubectl describe job drill-prepare || true; kubectl logs job/drill-prepare || true; kubectl logs job/drill-now || true; }
trap 'dump' ERR

kubectl create secret generic amax-kms --from-literal=kms.key="$(openssl rand -hex 32)"
kubectl create secret generic amax-drill \
  --from-literal=DATABASE_URL=postgres://amax_app:amax_app@postgres:5432/amax \
  --from-literal=DATABASE_MIGRATE_URL=postgres://amax:amax@postgres:5432/amax \
  --from-literal=AMAX_DRILL_DATABASE_URL=postgres://amax:amax@postgres:5432/amax_drill \
  --from-literal=AUDIT_HASH_KEY=ci-drill-audit-key-ci-drill-audit-key \
  --from-literal=AMAX_KMS=local
kubectl apply -f "$here/drill.yaml"
kubectl rollout status deploy/postgres --timeout=120s
kubectl wait --for=condition=complete job/drill-prepare --timeout=300s

helm install drill "$here/../helm/amax" --wait --timeout 120s --set replicaCount=0 \
  --set image.repository=amax --set image.tag=ci --set image.pullPolicy=Never \
  --set envFromSecret=amax-drill --set backups.drill.enabled=true --set backups.drill.tag=ci-ops \
  --set backups.volumeClaim=amax-backups --set backups.kmsKeySecret=amax-kms
drill=$(psql "insert into backup.drill (tenant_id, requested_by) values ('$tenant', 'ci:k3d') returning id" | head -1)
kubectl create job drill-now --from=cronjob/drill-restore-drill
kubectl wait --for=condition=complete job/drill-now --timeout=300s
kubectl logs job/drill-now
result=$(psql "select status || ' ' || coalesce(chain_ok::text, 'null') || ' ' || rows_checked from backup.drill where id = '$drill'")
echo "drill $drill: $result"
case "$result" in "passed true "*) ;; *) echo "restore drill did not pass"; exit 1;; esac
left=$(kubectl exec deploy/postgres -- psql -U amax -d amax_drill -Atc "select count(*) from pg_namespace where nspname in ('core', 'auth', 'backup')")
test "$left" = 0 || { echo "the scratch database still holds restored schemas"; exit 1; }
