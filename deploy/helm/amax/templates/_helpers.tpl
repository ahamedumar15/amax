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
