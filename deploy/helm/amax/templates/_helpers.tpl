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
