{{- define "echo.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "echo.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "echo.chart" -}}{{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}{{- end -}}
{{- define "echo.labels" -}}
helm.sh/chart: {{ include "echo.chart" . }}
app.kubernetes.io/name: {{ include "echo.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}
{{- define "echo.selectorLabels" -}}
app.kubernetes.io/name: {{ include "echo.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
{{- define "echo.clientServiceName" -}}{{ printf "%s-client" (include "echo.fullname" .) }}{{- end -}}
{{- define "echo.serverServiceName" -}}{{ printf "%s-server" (include "echo.fullname" .) }}{{- end -}}
{{- define "echo.mongodbName" -}}{{ printf "%s-mongodb" .Release.Name }}{{- end -}}
{{- define "echo.minioName" -}}{{ printf "%s-minio" .Release.Name }}{{- end -}}
{{- define "echo.secretName" -}}{{ required "server.existingSecret is required" .Values.server.existingSecret }}{{- end -}}

{{- define "echo.s3Endpoint" -}}
{{- if .Values.server.s3.endpoint }}{{ .Values.server.s3.endpoint }}
{{- else if .Values.minio.enabled }}{{ printf "http://%s:9000" (include "echo.minioName" .) }}
{{- else }}{{ required "server.s3.endpoint is required when minio.enabled is false" .Values.server.s3.endpoint }}{{ end -}}
{{- end -}}
{{- define "echo.rhssoCaConfigMapName" -}}
{{- if .Values.rhsso.caCertConfigMap -}}
{{- .Values.rhsso.caCertConfigMap -}}
{{- else if .Values.rhsso.createMockCaCert -}}
{{- printf "%s-rhsso-ca" (include "echo.fullname" .) -}}
{{- end -}}
{{- end -}}

{{- define "echo.clientOrigin" -}}
{{- if .Values.server.clientOrigin }}{{ .Values.server.clientOrigin }}
{{- else if .Values.client.route.enabled }}{{ printf "https://%s" (required "client.route.host is required when client.route.enabled is true" .Values.client.route.host) }}
{{- else if .Values.client.ingress.enabled }}{{ printf "http://%s" (index .Values.client.ingress.hosts 0).host }}
{{- else }}http://localhost:8090{{ end -}}
{{- end -}}
{{- define "echo.image" -}}
{{- $name := .repository -}}
{{- if .registry }}{{- $name = printf "%s/%s" .registry .repository -}}{{- end -}}
{{- if .digest }}{{ printf "%s@%s" $name .digest }}{{ else }}{{ printf "%s:%s" $name .tag }}{{ end -}}
{{- end -}}

{{- define "echo.imagePullSecrets" -}}
{{- range . -}}
- name: {{ if kindIs "string" . }}{{ . }}{{ else }}{{ .name }}{{ end }}
{{- end -}}
{{- end -}}
