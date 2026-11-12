{{- define "viberglass.name" -}}{{ .Release.Name }}{{- end -}}
{{- define "viberglass.workersNamespace" -}}{{ default (printf "%s-%s-workers" .Release.Namespace .Release.Name) .Values.workers.namespace }}{{- end -}}
{{- define "viberglass.appsNamespace" -}}{{ default (printf "%s-%s-apps" .Release.Namespace .Release.Name) .Values.apps.namespace }}{{- end -}}
{{- define "viberglass.appsPublicUrl" -}}{{ trimSuffix "/" (default (printf "https://%s" .Values.apps.domain) .Values.apps.publicUrl) }}{{- end -}}
{{- define "viberglass.databaseHost" -}}
{{- if .Values.database.enabled -}}{{ include "viberglass.name" . }}-postgres{{- else -}}{{ required "database.host is required with an external database" .Values.database.host }}{{- end -}}
{{- end -}}
{{- define "viberglass.storageEndpoint" -}}
{{- if .Values.storage.enabled -}}http://{{ include "viberglass.name" . }}-minio.{{ .Release.Namespace }}.svc.cluster.local:9000{{- else -}}{{ required "storage.endpoint is required" .Values.storage.endpoint }}{{- end -}}
{{- end -}}
{{- define "viberglass.previewHost" -}}
{{- $host := (urlParse .Values.preview.publicUrl).hostname -}}
{{- if or (not $host) (eq $host (urlParse .Values.publicUrl).hostname) (eq $host .Values.ingress.host) -}}
{{- fail "preview.publicUrl must be a full URL on its own host, not the app's" -}}
{{- end -}}
{{ $host }}
{{- end -}}
{{- define "viberglass.backendEnvironment" -}}
envFrom:
  - configMapRef: {name: {{ include "viberglass.name" . }}-config}
  - secretRef: {name: {{ .Values.appSecret }}}
  - secretRef: {name: {{ .Values.storageSecret }}}
{{- end -}}
{{- define "viberglass.demoResetEnvironment" -}}
{{- $root := .root -}}
{{ include "viberglass.backendEnvironment" $root }}
env:
  - name: POD_NAMESPACE
    valueFrom: {fieldRef: {fieldPath: metadata.namespace}}
  - {name: DEMO_BACKEND_DEPLOYMENT, value: {{ .backend | quote }}}
  - {name: DEMO_BACKEND_REPLICAS, value: {{ $root.Values.backend.replicas | quote }}}
  {{- if .seed }}
  - {name: DEMO_FIXTURES_BUCKET, value: {{ required "demo.reset.fixtures.bucket is required" $root.Values.demo.reset.fixtures.bucket | quote }}}
  - {name: DEMO_FIXTURES_PREFIX, value: {{ $root.Values.demo.reset.fixtures.prefix | quote }}}
  - name: DEMO_VIEWER_EMAIL
    valueFrom: {secretKeyRef: {name: {{ required "demo.reset.viewerSecret is required" $root.Values.demo.reset.viewerSecret | quote }}, key: email}}
  - name: DEMO_VIEWER_PASSWORD
    valueFrom: {secretKeyRef: {name: {{ $root.Values.demo.reset.viewerSecret | quote }}, key: password}}
  - {name: NODE_OPTIONS, value: {{ printf "--max-old-space-size=%v" $root.Values.demo.reset.seed.heapMb | quote }}}
  {{- end }}
securityContext: {allowPrivilegeEscalation: false, capabilities: {drop: [ALL]}}
{{- if .seed }}
resources: {{ toYaml $root.Values.demo.reset.seed.resources | nindent 2 }}
{{- else }}
resources: {requests: {cpu: 100m, memory: 128Mi}, limits: {cpu: "1", memory: 1Gi}}
{{- end }}
{{- end -}}
