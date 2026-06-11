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

{{- define "echo.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

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

{{- define "echo.clientServiceName" -}}
{{- printf "%s-client" (include "echo.fullname" .) -}}
{{- end -}}

{{- define "echo.serverServiceName" -}}
{{- printf "%s-server" (include "echo.fullname" .) -}}
{{- end -}}

{{- define "echo.mongodbName" -}}
{{- printf "%s-mongodb" (include "echo.fullname" .) -}}
{{- end -}}

{{- define "echo.mongodbHeadlessName" -}}
{{- printf "%s-mongodb-headless" (include "echo.fullname" .) -}}
{{- end -}}

{{- define "echo.minioName" -}}
{{- printf "%s-minio" (include "echo.fullname" .) -}}
{{- end -}}

{{- define "echo.secretName" -}}
{{- printf "%s-secrets" (include "echo.fullname" .) -}}
{{- end -}}

{{- define "echo.mongoUri" -}}
{{- if .Values.server.mongoUri -}}
{{- .Values.server.mongoUri -}}
{{- else if .Values.mongodb.enabled -}}
{{- printf "mongodb://%s:%d/echo?replicaSet=%s" (include "echo.mongodbHeadlessName" .) (.Values.mongodb.service.port | int) .Values.mongodb.replicaSetName -}}
{{- else -}}
{{- required "server.mongoUri is required when mongodb.enabled is false" .Values.server.mongoUri -}}
{{- end -}}
{{- end -}}

{{- define "echo.s3Endpoint" -}}
{{- if .Values.server.s3.endpoint -}}
{{- .Values.server.s3.endpoint -}}
{{- else if .Values.minio.enabled -}}
{{- printf "http://%s:%d" (include "echo.minioName" .) (.Values.minio.service.apiPort | int) -}}
{{- else -}}
{{- required "server.s3.endpoint is required when minio.enabled is false" .Values.server.s3.endpoint -}}
{{- end -}}
{{- end -}}

{{- define "echo.s3AccessKey" -}}
{{- if .Values.server.s3.accessKey -}}
{{- .Values.server.s3.accessKey -}}
{{- else if .Values.minio.enabled -}}
{{- .Values.minio.rootUser -}}
{{- else -}}
{{- required "server.s3.accessKey is required when minio.enabled is false" .Values.server.s3.accessKey -}}
{{- end -}}
{{- end -}}

{{- define "echo.s3SecretKey" -}}
{{- if .Values.server.s3.secretKey -}}
{{- .Values.server.s3.secretKey -}}
{{- else if .Values.minio.enabled -}}
{{- .Values.minio.rootPassword -}}
{{- else -}}
{{- required "server.s3.secretKey is required when minio.enabled is false" .Values.server.s3.secretKey -}}
{{- end -}}
{{- end -}}

{{- define "echo.clientOrigin" -}}
{{- if .Values.server.clientOrigin -}}
{{- .Values.server.clientOrigin -}}
{{- else if .Values.client.ingress.enabled -}}
{{- $host := (index .Values.client.ingress.hosts 0).host -}}
{{- printf "http://%s" $host -}}
{{- else -}}
{{- "http://localhost:8090" -}}
{{- end -}}
{{- end -}}

{{- define "echo.image" -}}
{{- $registry := .registry | default "" -}}
{{- $repo := .repository -}}
{{- $tag := .tag -}}
{{- if $registry -}}
{{- printf "%s/%s:%s" $registry $repo $tag -}}
{{- else -}}
{{- printf "%s:%s" $repo $tag -}}
{{- end -}}
{{- end -}}
