{{- define "viberglass.name" -}}{{ .Release.Name }}{{- end -}}
{{- define "viberglass.workersNamespace" -}}{{ default (printf "%s-%s-workers" .Release.Namespace .Release.Name) .Values.workers.namespace }}{{- end -}}
{{- define "viberglass.databaseHost" -}}
{{- if .Values.database.enabled -}}{{ include "viberglass.name" . }}-postgres{{- else -}}{{ required "database.host is required with an external database" .Values.database.host }}{{- end -}}
{{- end -}}
{{- define "viberglass.storageEndpoint" -}}
{{- if .Values.storage.enabled -}}http://{{ include "viberglass.name" . }}-minio.{{ .Release.Namespace }}.svc.cluster.local:9000{{- else -}}{{ required "storage.endpoint is required" .Values.storage.endpoint }}{{- end -}}
{{- end -}}
{{- define "viberglass.backendEnvironment" -}}
envFrom:
  - configMapRef: {name: {{ include "viberglass.name" . }}-config}
  - secretRef: {name: {{ .Values.appSecret }}}
  - secretRef: {name: {{ .Values.storageSecret }}}
{{- end -}}
