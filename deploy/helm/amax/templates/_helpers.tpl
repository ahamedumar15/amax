{{- define "amax.name" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "amax.labels" -}}
app.kubernetes.io/name: amax
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "amax.selector" -}}
app.kubernetes.io/name: amax
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "amax.workflowsEnv" -}}
- name: AMAX_WORKFLOWS_ENGINE
  value: {{ .Values.workflows.engine | quote }}
{{- if eq .Values.workflows.engine "temporal" }}
- name: TEMPORAL_ADDRESS
  value: {{ .Values.workflows.temporal.address | quote }}
- name: TEMPORAL_NAMESPACE
  value: {{ .Values.workflows.temporal.namespace | quote }}
- name: TEMPORAL_TASK_QUEUE
  value: {{ .Values.workflows.temporal.taskQueue | quote }}
{{- end }}
{{- end -}}

{{/* 034: snapshots on a volume and a local KMS key file, for the drill (and any pod that takes snapshots). */}}
{{- define "amax.backupEnv" -}}
- name: NODE_ENV
  value: production
{{- if .Values.backups.volumeClaim }}
- name: AMAX_BACKUP_DIR
  value: /backups
{{- end }}
{{- if .Values.backups.kmsKeySecret }}
- name: AMAX_KMS_KEY_FILE
  value: /etc/amax/kms/kms.key
{{- end }}
{{- end -}}

{{- define "amax.backupMounts" -}}
- name: tmp
  mountPath: /tmp
{{- if .Values.backups.volumeClaim }}
- name: backups
  mountPath: /backups
{{- end }}
{{- if .Values.backups.kmsKeySecret }}
- name: kms
  mountPath: /etc/amax/kms
  readOnly: true
{{- end }}
{{- end -}}

{{- define "amax.backupVolumes" -}}
- name: tmp
  emptyDir: {}
{{- if .Values.backups.volumeClaim }}
- name: backups
  persistentVolumeClaim:
    claimName: {{ .Values.backups.volumeClaim }}
{{- end }}
{{- if .Values.backups.kmsKeySecret }}
- name: kms
  secret:
    secretName: {{ .Values.backups.kmsKeySecret }}
{{- end }}
{{- end -}}
