# Echo Helm Chart

This chart deploys Echo and its dependencies using external vendor charts:

- MongoDB: Bitnami MongoDB chart, configured as an authenticated single-member replica set.
- MinIO: official MinIO chart, configured as an authenticated standalone object store.

The same chart supports ordinary Kubernetes and disconnected OpenShift. Local
Kubernetes remains the default. All platform, image registry, storage, Route,
and security settings are values-driven.

Install; all runtime images are declared in `values.yaml`, and MongoDB and MinIO generate their own credentials and persist them in
their dependency Secrets. Echo generates and persists its JWT secret.

```bash
helm install echo ./helm/echo
```

## Disconnected OpenShift with Artifactory

`values-openshift.yaml` is a complete profile. Replace its example Artifactory
host/repository paths, immutable image tags or digests, Route host, and
StorageClass, then install it without changing chart templates:

```bash
oc new-project echo
oc create secret docker-registry artifactory-pull \
  --docker-server=artifactory.example.com \
  --docker-username='<read-only-user>' \
  --docker-password='<password>'

helm install echo ./helm/echo \
  --namespace echo \
  --values ./helm/echo/values-openshift.yaml
```

Mirror these runtime images into Artifactory before installation:

- Echo server and client images built from this repository
- `bitnami/mongodb`
- `quay.io/minio/minio`
- `quay.io/minio/mc`

The dependency archives are vendored under `charts/`, so installation does not
contact public Helm repositories. The Echo images support both their local
non-root users and OpenShift arbitrary UIDs. MongoDB uses Bitnami's
`adaptSecurityContext` support. The OpenShift profile disables the official
MinIO chart's fixed UID/GID contexts and lets `restricted-v2` assign them.

If Artifactory uses a private CA, configure that CA in OpenShift's cluster image
configuration; an image pull Secret supplies credentials but does not establish
TLS trust.

The MongoDB and MinIO charts create and use `echo-mongodb` and `echo-minio`
Kubernetes Secrets. Echo reads those Secrets directly. The generated secrets
are preserved across upgrades; do not commit production secrets in a values
file.

Set `client.ingress.enabled=true` for Kubernetes Ingress, or
`client.route.enabled=true` and `client.route.host` for an OpenShift Route. For
external databases/storage, disable the dependencies and provide
`server.mongoUri`, `server.s3.endpoint`, `server.s3.accessKey`, and
`server.s3.secretKey`.
