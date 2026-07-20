# Echo Helm Chart

This chart deploys Echo and its dependencies using external vendor charts:

- MongoDB: Bitnami MongoDB chart, configured as an authenticated single-member replica set.
- MinIO: official MinIO chart, configured as an authenticated standalone object store.

The same chart supports ordinary Kubernetes and disconnected OpenShift. Local
Kubernetes remains the default. All platform, image registry, storage, Route,
and security settings are values-driven.

Before installation, the parent chart creates the MongoDB, MinIO, and Echo
credential Secrets as Helm `pre-install` hooks. The dependency charts consume
the MongoDB and MinIO Secrets through their `existingSecret` settings. Hook
Secrets are retained after a successful installation so the running workloads
can continue to use them. A later fresh installation of the same release and
namespace reuses their existing values, keeping retained MongoDB and MinIO
volumes accessible. Set `mongodb.auth.rootPassword`,
`mongodb.auth.replicaSetKey`, `minio.rootUser`, `minio.rootPassword`, or
`server.jwtSecret` to supply credentials instead of generating them.

Install; all runtime images are declared in `values.yaml`. The parent chart
generates and persists the MongoDB, MinIO, and Echo credentials in the
pre-install hook Secrets described above.

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

The parent chart creates the `echo-mongodb-secret`, `echo-minio-secret`, and
`echo-secret` Kubernetes Secrets, and the workloads read them directly. The
generated values are preserved across upgrades and uninstall/reinstall cycles
in the same namespace; do not commit production secrets in a values file.

MongoDB's StatefulSet explicitly retains its PVC when it is deleted or scaled
down. The standalone MinIO PVC has the `helm.sh/resource-policy: keep`
annotation, so `helm uninstall` leaves both data volumes in the namespace. A
later install with the same release name and namespace reuses them. Deleting the
namespace or manually deleting the PVCs still deletes or releases the storage
according to the cluster StorageClass and persistent-volume reclaim policy.

Set `client.ingress.enabled=true` for Kubernetes Ingress, or
`client.route.enabled=true` and `client.route.host` for an OpenShift Route. For
external databases/storage, disable the dependencies and provide
`server.mongoUri`, `server.s3.endpoint`, `server.s3.accessKey`, and
`server.s3.secretKey`.

## RHSSO login

Echo supports RHSSO/Keycloak through OpenID Connect authorization code flow
with PKCE. Create the local `admin` account first; that bootstrap account can
only use local password login and is never linked to an RHSSO identity.

Configure an RHSSO client with Standard Flow enabled and allow this redirect
URI:

```text
https://echo.example.com/api/auth/rhsso/callback
```

Then set:

```yaml
rhsso:
  enabled: true
  url: https://sso.example.com/auth # omit /auth on newer installations
  backchannelUrl: ""               # optional internal cluster URL
  realm: example
  clientId: echo
  clientSecret: ""                 # empty for a public PKCE client
  usernameClaim: preferred_username
  displayNameClaim: name
```

The claim mappings accept dot-separated paths. RHSSO users are linked only by
the OIDC issuer and immutable `sub` claim; a matching Echo username does not
link or replace a local account. If the generated username is already used,
Echo assigns a numeric suffix.
