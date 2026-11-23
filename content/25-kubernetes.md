---
id: kubernetes
title: Kubernetes for Backend Engineers
description: What you are expected to know to ship a service on Kubernetes: core objects, config and secrets, probes and graceful shutdown, resources and OOM kills, networking, debugging failing pods, and autoscaling.
facets: backend, sre, cloud, kubernetes
---

## Pods, ReplicaSets, Deployments and Services: what happens when you apply a Deployment
<!--
id: k8s-core-objects
level: junior
tags: kubernetes, pod, deployment, replicaset, service, labels, selectors, controllers
minutes: 12
-->

> [!PROMPT]
> You run `kubectl apply -f app.yaml` with a Deployment of three replicas and a Service in front of it. Walk through what Kubernetes creates, who creates it, and how traffic finds the pods. Then explain what a label selector is and what goes wrong when the labels do not match.
>
> **Requirements**
> - Write the Deployment and the Service for a small HTTP API.
> - Say what happens when you change the image tag, and when a pod is deleted by hand.

> [!HINT]
> - The chain Deployment, ReplicaSet, Pod, and which controller owns each step.
> - Declarative desired state and the reconcile loop.
> - Labels and selectors as the only link between a Service and its pods.

> [!TLDR]
> You declare desired state and controllers keep reconciling reality toward it. A Deployment creates a ReplicaSet, which creates the Pods; a Pod is the smallest unit and runs one or more containers that share a network namespace. Changing the pod template (for example the image tag) makes the Deployment create a new ReplicaSet and roll pods over; deleting a pod makes the ReplicaSet start a replacement. A Service gives a stable virtual IP and DNS name and sends traffic to whichever ready pods match its label selector, so a selector that matches nothing means a Service with no endpoints and connection errors, even though every pod looks healthy.

### What gets created

1. The API server stores your Deployment. Nothing runs yet; this is only desired state.
2. The Deployment controller sees it and creates a **ReplicaSet** for the current pod template.
3. The ReplicaSet controller creates three **Pods** (it only ensures that N pods with its labels exist).
4. The scheduler assigns each pod to a node; the kubelet there pulls the image and starts the containers.
5. The Service does not create anything that runs. It selects pods by label, and the endpoints controller publishes the ready ones as EndpointSlices that `kube-proxy` (or your CNI) turns into routing rules.

### The manifests

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders-api
  labels:
    app: orders-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: orders-api          # must match the template labels below, and cannot be changed later
  template:
    metadata:
      labels:
        app: orders-api
    spec:
      containers:
        - name: api
          image: registry.example.com/orders-api:1.4.2
          ports:
            - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: orders-api
spec:
  selector:
    app: orders-api            # the only link between the Service and the pods
  ports:
    - port: 80
      targetPort: 8080
```

Inside the cluster, other pods call `http://orders-api` (same namespace) or `orders-api.<namespace>.svc.cluster.local`.

### What happens next

- **Change the image tag:** the pod template changes, so the Deployment creates a new ReplicaSet and scales it up while scaling the old one down (a rolling update). `kubectl rollout status deployment/orders-api` follows it and `kubectl rollout undo deployment/orders-api` goes back to the previous ReplicaSet.
- **Delete a pod by hand:** the ReplicaSet sees two pods instead of three and creates a replacement. A bare pod with no controller would simply be gone.
- **Scale:** `kubectl scale deployment/orders-api --replicas=5` changes the desired count; the ReplicaSet does the rest.

### When labels do not match

```bash
kubectl get endpointslices -l kubernetes.io/service-name=orders-api   # empty means the selector matches nothing
kubectl get pods --show-labels
kubectl describe service orders-api                                   # look at Selector and Endpoints
```

A typo in the Service selector gives a Service with no endpoints: DNS resolves, the connection hangs or is refused, and every pod is `Running`. A Deployment whose `selector` does not match its template labels is rejected when you apply it.

### Follow-ups

- **"Why not create Pods directly?"** Nothing restarts or reschedules them if the node dies. Use a controller: Deployment for stateless, StatefulSet for stable identity and storage, Job and CronJob for batch.
- **"Is a Service a load balancer?"** For ClusterIP it is a virtual IP with kernel-level rules that spread connections across ready endpoints. It balances connections, not requests, so a long-lived HTTP/2 or gRPC connection sticks to one pod unless you use a client-side or L7 balancer.

### References

- [Kubernetes: Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [Kubernetes: Service](https://kubernetes.io/docs/concepts/services-networking/service/)
- [Kubernetes: Labels and selectors](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/)

## ConfigMaps and Secrets: how config reaches a pod, and what a Secret does and does not protect
<!--
id: k8s-config-secrets
level: junior
tags: kubernetes, configmap, secret, environment variables, volumes, rotation, security
minutes: 10
-->

> [!PROMPT]
> Your service needs a log level, a feature flag file, and a database password. Where does each go, and how does it get into the container? Someone says "Secrets are encrypted, so it is safe to commit them to git." Respond to that.
>
> **Requirements**
> - Show one manifest that uses a ConfigMap as environment variables and as a mounted file, and a Secret as an environment variable.
> - Say what happens to running pods when the ConfigMap or Secret changes.

> [!HINT]
> - Environment variables versus mounted files, and which one updates.
> - Base64 is encoding, not encryption; encryption at rest is a cluster setting.
> - Who can read a Secret: RBAC, and anyone who can create a pod in the namespace.

> [!TLDR]
> A ConfigMap holds non-sensitive configuration and a Secret holds sensitive values, and both can reach a container as environment variables or as files in a mounted volume. Environment variables are fixed when the container starts, so changing the object does nothing until the pod restarts; mounted files are refreshed by the kubelet after a delay (but not when mounted with `subPath`), and your app must re-read them. A Secret is only base64-encoded: anyone who can read it through the API, or can create a pod that mounts it, can see the value, and encryption at rest is something the cluster must enable. So never commit Secret manifests; use sealed or external secret tooling and tight RBAC.

### The manifest

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: orders-config
data:
  LOG_LEVEL: info
  flags.json: |
    { "newCheckout": true }
---
apiVersion: v1
kind: Secret
metadata:
  name: orders-db
type: Opaque
stringData:                     # convenient for writing; stored base64-encoded
  DB_PASSWORD: change-me
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders-api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: orders-api
  template:
    metadata:
      labels:
        app: orders-api
    spec:
      containers:
        - name: api
          image: registry.example.com/orders-api:1.4.2
          env:
            - name: LOG_LEVEL
              valueFrom:
                configMapKeyRef:
                  name: orders-config
                  key: LOG_LEVEL
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: orders-db
                  key: DB_PASSWORD
          volumeMounts:
            - name: flags
              mountPath: /etc/orders        # /etc/orders/flags.json appears as a file
              readOnly: true
      volumes:
        - name: flags
          configMap:
            name: orders-config
            items:
              - key: flags.json
                path: flags.json
```

### What changes when the object changes

| Delivered as | Updates in a running pod? |
| --- | --- |
| Environment variable | No. Restart the pod (`kubectl rollout restart deployment/orders-api`). |
| Mounted volume | Yes, after the kubelet's sync delay (up to about a minute), and only if the app re-reads the file. |
| Volume with `subPath` | No. |

A common pattern is to hash the config into a pod template annotation so a change triggers a normal rolling update (Helm's `checksum/config` annotation does this).

### What a Secret is, and is not

- The data is base64, which anyone can decode in one command: `kubectl get secret orders-db -o jsonpath='{.data.DB_PASSWORD}' | base64 -d`.
- Encryption at rest in etcd is a cluster configuration; managed offerings often provide it, but you should check rather than assume.
- Access is governed by RBAC, and anyone allowed to create a pod in the namespace can mount any Secret there and print it. Limit that, and prefer an external secrets manager synced into the cluster, or sealed secrets for git.
- Prefer mounting a file over an environment variable for secrets: environment variables leak through crash dumps, `/proc`, and child processes more easily.

### Follow-ups

- **"Can a ConfigMap be immutable?"** Yes, `immutable: true` stops edits (and reduces API server load); you ship a new object and roll the Deployment to it.
- **"Where do non-secret defaults belong?"** In the image or the ConfigMap, not hard-coded per environment in the Deployment, so one image runs everywhere.

### References

- [Kubernetes: ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/)
- [Kubernetes: Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
- [Kubernetes: Encrypting confidential data at rest](https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/)

## Liveness, readiness and startup probes, and shutting a Go service down without dropping requests
<!--
id: k8s-probes-graceful-shutdown
level: senior
tags: kubernetes, probes, readiness, liveness, startup, graceful shutdown, sigterm, rolling update, go
minutes: 15
-->

> [!PROMPT]
> During every rolling update your users see a burst of 502s, and sometimes a pod is restarted in a loop right after it starts. Explain the three kinds of probe, what each one is for, and why the 502s happen. Then show how a Go service should handle SIGTERM so a deploy drops nothing.
>
> **Requirements**
> - Give the probe configuration and the Go server code.
> - Say what `terminationGracePeriodSeconds` and a `preStop` hook have to do with it.

> [!HINT]
> - Which probe restarts the container, and which only removes it from the Service.
> - Pod deletion is concurrent: SIGTERM and endpoint removal race each other.
> - Order of events on shutdown: fail readiness, wait, drain, exit.

> [!TLDR]
> A liveness probe restarts a container that is wedged, a readiness probe decides whether the pod receives traffic, and a startup probe holds the other two off while a slow app boots. The 502s come from a race: when a pod is deleted, Kubernetes sends SIGTERM and removes the pod from the Service endpoints at the same time, so routers keep sending requests to a process that has already stopped listening. The fix is to handle SIGTERM by failing readiness first, waiting a few seconds for the routing change to spread, then draining in-flight requests with `Server.Shutdown`, all within `terminationGracePeriodSeconds`. Never let the liveness probe check dependencies such as the database, or an outage restarts every pod.

### What each probe does

| Probe | Question it answers | If it fails |
| --- | --- | --- |
| Startup | Has the app finished starting? | The container is restarted once `failureThreshold` is exhausted. Liveness and readiness do not run until it passes. |
| Readiness | Should this pod receive traffic right now? | The pod is removed from the Service endpoints. Nothing is restarted. |
| Liveness | Is the process stuck beyond recovery? | The container is restarted. |

The usual mistakes: pointing liveness at a handler that checks the database (a database blip then restarts every pod and turns a partial outage into a total one), no startup probe for a slow starter (liveness kills it before it is ready, giving the restart loop), and readiness that is always `200`.

### Probe configuration

```yaml
containers:
  - name: api
    image: registry.example.com/orders-api:1.4.2
    ports:
      - containerPort: 8080
    startupProbe:
      httpGet: { path: /healthz, port: 8080 }
      periodSeconds: 2
      failureThreshold: 30          # up to 60s to start
    readinessProbe:
      httpGet: { path: /readyz, port: 8080 }
      periodSeconds: 5
      failureThreshold: 2
    livenessProbe:
      httpGet: { path: /healthz, port: 8080 }   # cheap: "the process responds", nothing else
      periodSeconds: 10
      failureThreshold: 3
```

### Why the 502s happen

When a pod is deleted, two things start at once: the kubelet sends SIGTERM to the container, and the endpoints controller removes the pod from the Service. Removal then has to reach kube-proxy on every node and any ingress or load balancer, which takes seconds. A process that exits on SIGTERM immediately is still being sent requests for that whole window, so those requests fail.

### The Go service

A copy of this server (with shorter waits and a different port) was run locally: after SIGTERM, readiness answered `503`, a request already in flight finished with `200`, and the process exited with status 0.

```go
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"
)

func main() {
	var ready atomic.Bool

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { // liveness: the process is not wedged
		w.WriteHeader(http.StatusOK)
	})
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) { // readiness: should I receive traffic?
		if !ready.Load() {
			http.Error(w, "draining", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
	mux.HandleFunc("/work", func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(2 * time.Second) // a request that is still running when SIGTERM arrives
		w.Write([]byte("done"))
	})

	srv := &http.Server{Addr: ":8080", Handler: mux}
	ready.Store(true)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, os.Interrupt)
	defer stop()

	go func() {
		if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()

	<-ctx.Done() // Kubernetes sent SIGTERM

	ready.Store(false)          // 1. fail readiness: the pod leaves the Service endpoints
	time.Sleep(5 * time.Second) // 2. let kube-proxy and the ingress stop routing here

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil { // 3. stop accepting, wait for in-flight requests
		log.Printf("shutdown: %v", err)
		os.Exit(1)
	}
	log.Println("drained cleanly")
}
```

The ordering is the whole point: readiness fails first, the sleep covers the propagation delay, and only then does `Shutdown` close the listener and wait for active requests. `Shutdown` does not interrupt in-flight requests, but it also does not wait for hijacked connections such as WebSockets, so close those yourself.

### The time budget

The total must fit inside the pod's grace period, after which the container gets SIGKILL:

```yaml
spec:
  terminationGracePeriodSeconds: 40     # default is 30; must exceed 5s wait + 20s drain
  containers:
    - name: api
      # alternative to sleeping in code, for images that have a shell or a sleep action
      lifecycle:
        preStop:
          sleep:
            seconds: 5
```

A `preStop` hook runs before SIGTERM is sent, so a sleep there gives the routing change time to spread without any code change (the `sleep` action needs a reasonably recent Kubernetes; on older clusters use `exec` with `sleep 5`). The preStop time counts against the same grace period.

### Follow-ups

- **"Why not just a high `terminationGracePeriodSeconds`?"** That is only the ceiling. A slow shutdown makes rollouts slow and still does not fix the race.
- **"What about long-lived connections?"** Send `Connection: close` or a GOAWAY, set a drain deadline, and make clients reconnect with backoff.
- **"What should readiness check?"** Whether this instance can serve now: warmed caches, migrations done, and at most critical dependencies. Be careful: a shared dependency that is down makes every pod unready at once.

### References

- [Kubernetes: Liveness, readiness and startup probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [Kubernetes: Pod lifecycle, termination of Pods](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination)
- [Go: net/http Server.Shutdown](https://pkg.go.dev/net/http#Server.Shutdown)

## Requests, limits and OOMKilled: how resources are scheduled, throttled and killed
<!--
id: k8s-requests-limits-oomkilled
level: senior
tags: kubernetes, resources, requests, limits, cpu throttling, oomkilled, qos, go, gomemlimit
minutes: 14
-->

> [!PROMPT]
> A pod keeps restarting with `OOMKilled`, while another service is slow even though node CPU is mostly idle. Explain what `requests` and `limits` mean for CPU and memory, how they affect scheduling and eviction, and what is behind both symptoms. Then show how to size a Go service so it behaves.
>
> **Requirements**
> - Show a resources block and say which QoS class it gives.
> - Explain the difference in how CPU and memory limits are enforced.

> [!HINT]
> - Requests are for the scheduler; limits are enforced by the kernel.
> - CPU is compressible (throttled), memory is not (killed).
> - The Go runtime does not know about the container's memory limit unless you tell it.

> [!TLDR]
> A request is what the scheduler reserves for a pod on a node and what its QoS class and eviction order are based on; a limit is a hard ceiling enforced by the kernel. CPU is compressible, so a pod over its CPU limit is throttled and gets slow while the node looks idle; memory is not, so a container that goes over its memory limit is killed with `OOMKilled` (exit code 137). Set memory request equal to limit for predictable behavior, be cautious with CPU limits because of throttling, and for Go set `GOMEMLIMIT` a little below the container limit so the garbage collector works harder before the kernel steps in.

### Requests versus limits

- **Request:** the amount the scheduler subtracts from a node's allocatable capacity when placing the pod. It is also the guaranteed share under contention (CPU requests become cgroup weights).
- **Limit:** the maximum the container may use. Enforced by the kernel's cgroups, not by Kubernetes itself.

A pod with no request is scheduled as if it needed nothing, which is how a node gets overcommitted until things are evicted.

### The two symptoms

| | CPU | Memory |
| --- | --- | --- |
| Type | Compressible | Incompressible |
| Over the limit | Throttled: the container is paused for the rest of each 100ms period | Killed by the OOM killer, restart with `OOMKilled`, exit code 137 |
| What it looks like | High latency, node CPU looks fine | Restart loop, `Last State: Terminated, Reason: OOMKilled` |

CPU throttling is easy to miss: a pod with a limit of one CPU can use all of it in the first 30ms of a period and then sit idle for 70ms, which shows up as latency spikes even though average usage is below the limit.

### A sensible starting block

```yaml
resources:
  requests:
    cpu: 250m
    memory: 256Mi
  limits:
    memory: 256Mi        # request == limit for memory
    # no cpu limit: the request still guarantees a share, and bursts are allowed when the node has room
env:
  - name: GOMEMLIMIT
    value: 220MiB        # roughly 85-90% of the container limit
```

QoS class follows from the requests and limits: **Guaranteed** needs requests equal to limits for every resource of every container, **Burstable** is anything in between (the example above), and **BestEffort** is nothing set at all. Under node memory pressure BestEffort pods are evicted first, then Burstable pods that exceed their requests, and Guaranteed last. Removing the CPU limit is a deliberate trade: you lose Guaranteed class and gain freedom from throttling, and many teams accept that, while others keep CPU limits for multi-tenant fairness.

### Go and the memory limit

The Go garbage collector paces itself against live heap, not against the container limit, so a service can grow past the limit between collections and get killed. `GOMEMLIMIT` gives the runtime a soft target, so it collects more aggressively as it approaches it.

```go
package main

import (
	"fmt"
	"runtime"
	"runtime/debug"
)

func main() {
	// Equivalent to GOMEMLIMIT=220MiB; usually set through the environment instead.
	debug.SetMemoryLimit(220 << 20)

	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	fmt.Printf("limit=%d MiB heap=%d MiB\n", debug.SetMemoryLimit(-1)>>20, m.HeapAlloc>>20)
}
```

It is a soft limit: it does not stop real allocations, and a service whose live heap exceeds the limit still gets killed (and one that sits close to the limit can spend most of its time collecting). Leave headroom for stacks, cgo, and memory outside the Go heap.

For CPU, `GOMAXPROCS` defaults to the node's core count, not the container limit, which makes a limited pod throttle itself. Go 1.25 and later read the cgroup CPU limit automatically; on older versions use `go.uber.org/automaxprocs` or set it from the limit with the downward API.

### Diagnosing

```bash
kubectl describe pod <pod>                       # Last State, Reason: OOMKilled, exit code 137
kubectl top pod <pod> --containers               # needs metrics-server
kubectl get pod <pod> -o jsonpath='{.status.qosClass}'
```

For throttling, look at the `container_cpu_cfs_throttled_periods_total` metric against `container_cpu_cfs_periods_total`, not at average CPU.

### Follow-ups

- **"How do I choose the numbers?"** Measure under realistic load, set the request near typical use and memory limit above the peak with headroom, then revisit. A Vertical Pod Autoscaler in recommendation mode can suggest values.
- **"Is `OOMKilled` always the app's fault?"** Not always: a node-level OOM or eviction under memory pressure looks different (`Evicted`), and a leak, a large in-memory cache, or a burst of concurrent requests can each cause the kill.

### References

- [Kubernetes: Resource management for pods and containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [Kubernetes: Pod Quality of Service classes](https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/)
- [Go: A guide to the Go garbage collector](https://go.dev/doc/gc-guide)

## Services, Ingress and DNS: how a request gets from the internet to a pod
<!--
id: k8s-service-ingress-dns
level: senior
tags: kubernetes, service, clusterip, nodeport, loadbalancer, ingress, dns, coredns, networking
minutes: 12
-->

> [!PROMPT]
> A user hits `https://api.example.com/orders`. Trace the request to a pod, and then trace a call from one pod to another inside the cluster. Explain the Service types, what an Ingress is and what a controller adds, and how service discovery works.
>
> **Requirements**
> - Write an Ingress that routes two paths to two Services with TLS.
> - Explain why a call between pods works by name.

> [!HINT]
> - ClusterIP is the base; NodePort and LoadBalancer build on it.
> - An Ingress object is only a rule set, a controller makes it real.
> - CoreDNS and the search path in `/etc/resolv.conf`.

> [!TLDR]
> A Service gives a stable virtual IP and DNS name in front of changing pods; ClusterIP is internal only, NodePort opens a port on every node, and LoadBalancer asks the cloud for an external load balancer. An Ingress is just a set of HTTP routing rules (host and path to Service), and it does nothing until an ingress controller such as NGINX or a cloud load balancer controller watches it and configures a real proxy. Inside the cluster CoreDNS resolves `service.namespace.svc.cluster.local`, and the pod's resolv.conf search path lets you use the short name within the same namespace. A request from the internet goes load balancer, ingress controller, Service, pod; a pod-to-pod call goes DNS, Service virtual IP, pod.

### The path of a request

```text
internet -> cloud load balancer -> ingress controller pods -> (host/path rule) -> Service ClusterIP -> a ready pod
```

1. DNS for `api.example.com` points at the cloud load balancer created for the ingress controller's own `LoadBalancer` Service.
2. TLS is usually terminated at the ingress controller, using a certificate stored in a Secret.
3. The controller matches the host and path against its Ingress rules and proxies to a pod, either directly or through the Service.
4. Inside the cluster the Service's virtual IP is turned into one of the ready pod IPs by kube-proxy (iptables, IPVS) or by the CNI (eBPF).

### Service types

| Type | Reachable from | Use it for |
| --- | --- | --- |
| ClusterIP (default) | Inside the cluster | Everything internal; the base of the others |
| NodePort | Any node IP at a port in 30000-32767 | Building block, simple testing |
| LoadBalancer | A cloud load balancer in front of the nodes | Exposing one service directly (often TCP/UDP) |
| ExternalName | Returns a DNS CNAME | Giving an external service an internal name |
| Headless (`clusterIP: None`) | DNS returns the pod IPs directly | StatefulSets, client-side balancing |

### Ingress with two routes and TLS

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api
  annotations:
    nginx.ingress.kubernetes.io/proxy-body-size: 8m   # controller-specific settings go in annotations
spec:
  ingressClassName: nginx          # chooses which controller handles this Ingress
  tls:
    - hosts: [api.example.com]
      secretName: api-example-com-tls
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /orders
            pathType: Prefix
            backend:
              service:
                name: orders-api
                port:
                  number: 80
          - path: /users
            pathType: Prefix
            backend:
              service:
                name: users-api
                port:
                  number: 80
```

An Ingress with no matching controller does nothing, and the address stays empty. The Gateway API (`Gateway`, `HTTPRoute`) is the newer, more expressive replacement, with roles split between the platform team and application teams.

### Service discovery inside the cluster

Every pod's `/etc/resolv.conf` points at CoreDNS and includes a search path:

```text
search shop.svc.cluster.local svc.cluster.local cluster.local
nameserver 10.96.0.10
options ndots:5
```

So from a pod in the `shop` namespace, `orders-api` expands to `orders-api.shop.svc.cluster.local`, which resolves to the Service's ClusterIP. To reach another namespace use `orders-api.billing`. The `ndots:5` option means names with fewer than five dots are tried against the search path first, so an external name like `api.stripe.com` causes several failing lookups before the real one; add a trailing dot or lower `ndots` for chatty external calls.

### Follow-ups

- **"Why does a long-lived gRPC connection hit only one pod?"** Service balancing happens per connection. Use a headless Service with client-side balancing, or an L7 proxy that balances per request.
- **"How do I debug it?"** Walk the chain: `kubectl get endpointslices` (are there ready pods behind it), `kubectl run -it --rm debug --image=busybox -- nslookup orders-api` (does DNS work), then call the Service IP, then the pod IP, then the Ingress.
- **"How do I get a real client IP?"** It is replaced at each proxy; read `X-Forwarded-For` or use the PROXY protocol, and set `externalTrafficPolicy: Local` on a LoadBalancer Service to keep the source address.

### References

- [Kubernetes: Service](https://kubernetes.io/docs/concepts/services-networking/service/)
- [Kubernetes: Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/)
- [Kubernetes: DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)

## A pod will not start or keeps crashing: a debugging checklist
<!--
id: k8s-debug-failing-pods
level: senior
tags: kubernetes, debugging, kubectl, crashloopbackoff, imagepullbackoff, pending, events, ephemeral containers
minutes: 12
-->

> [!PROMPT]
> After a deploy, some pods show `Pending`, `ImagePullBackOff`, `CrashLoopBackOff`, or `Running` but unready. For each status, what does it mean and what is your first command? Describe how you debug a container that has no shell.
>
> **Requirements**
> - Give the commands in the order you would use them.
> - Say where to look for the reason, since the status alone rarely tells you.

> [!HINT]
> - The reason is almost always in `describe` events or in the previous container's logs.
> - Pending means unscheduled; the others mean the container did run, or tried to.
> - `kubectl debug` for distroless images.

> [!TLDR]
> Read the pod's status, then its events, then its logs, in that order. `Pending` means no node accepted the pod, so `kubectl describe pod` shows why (resources, taints, unbound volumes). `ImagePullBackOff` means the image name, tag, or pull credentials are wrong. `CrashLoopBackOff` means the process starts and exits, so you want `kubectl logs --previous` and the exit code. A pod that is `Running` but not ready is failing its readiness probe or is waiting on a dependency. For an image with no shell use `kubectl debug` to attach an ephemeral container instead of rebuilding the image.

### Start here

```bash
kubectl get pods -o wide                      # status, restarts, node
kubectl describe pod <pod>                    # Events at the bottom: the reason is usually here
kubectl logs <pod> -c <container>             # current logs
kubectl logs <pod> -c <container> --previous  # logs of the container that just crashed
kubectl get events --sort-by=.lastTimestamp   # cluster view, newest last
```

### By status

| Status | Meaning | Look for |
| --- | --- | --- |
| `Pending` | The scheduler has not placed it (or the volume or image is not ready) | Events: `Insufficient cpu`, `node(s) had untolerated taint`, `unbound PersistentVolumeClaims`, a node selector nothing matches |
| `ContainerCreating` (stuck) | Placed, but the sandbox, volume or secret is not ready | Missing ConfigMap or Secret, a CNI or volume attach problem |
| `ImagePullBackOff` or `ErrImagePull` | The kubelet cannot pull the image | Typo in the tag, private registry without `imagePullSecrets`, rate limit |
| `CrashLoopBackOff` | The container starts then exits, and the kubelet backs off between restarts | `--previous` logs, exit code in `describe` |
| `Running`, `0/1` ready | The readiness probe fails | Probe path and port, the app's own logs, a missing dependency |
| `OOMKilled` | Exceeded the memory limit | Exit code 137, memory limit, a leak |
| `Evicted` | The node ran out of memory or disk | Node pressure conditions, no requests set |

Exit codes help: `1` is an application error, `137` is SIGKILL (usually OOM or a failed liveness probe followed by a kill), `139` is a segfault, and `143` is SIGTERM.

### A crash loop, step by step

1. `kubectl get pod` shows `CrashLoopBackOff` with a growing restart count.
2. `kubectl logs <pod> --previous` shows the last run's output. Often it is a missing environment variable, a failed database connection, or a bad config file.
3. `kubectl describe pod` shows `Last State: Terminated` with the exit code and reason.
4. If the container dies before logging anything, check the command and args, the working directory, and the image's architecture (an `amd64` image on `arm64` nodes gives `exec format error`).
5. Reproduce outside the cluster with the same image and environment, or override the command to keep the container alive while you investigate.

### No shell in the image

Distroless and scratch images have no `sh`, so `kubectl exec` fails. Attach an ephemeral debug container that shares the target's process namespace:

```bash
kubectl debug -it <pod> --image=busybox:1.36 --target=api   # sees the app's processes and network
kubectl debug <pod> -it --copy-to=debug-copy --container=api --image=busybox:1.36 -- sh   # or debug a copy of the pod
kubectl debug node/<node> -it --image=busybox:1.36          # a shell on the node, for node-level problems
```

### Follow-ups

- **"Why did a rollout stall?"** The new pods never became ready, so the Deployment stopped replacing old ones. `kubectl rollout status` times out and `kubectl describe deployment` shows `ProgressDeadlineExceeded`; the old pods keep serving, which is what the rolling strategy is for.
- **"What if the logs are empty?"** The app may log to a file, the container may have died before logging, or logs may have rotated. Check `--previous`, and run the image locally.

### References

- [Kubernetes: Debug pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/)
- [Kubernetes: Debug running pods, ephemeral containers](https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/)
- [Kubernetes: Determine the reason for pod failure](https://kubernetes.io/docs/tasks/debug/debug-application/determine-reason-pod-failure/)

## Scaling a service: HPA, PodDisruptionBudgets and keeping capacity during node drains
<!--
id: k8s-autoscaling-hpa-pdb
level: lead
tags: kubernetes, hpa, autoscaling, pdb, pod disruption budget, cluster autoscaler, topology spread, rolling update
minutes: 14
-->

> [!PROMPT]
> Traffic doubles at lunchtime and your service falls over, and during a node upgrade the platform team drains nodes and your service briefly has no healthy pods. Design the scaling and availability configuration: how the Horizontal Pod Autoscaler works, why its inputs matter, and what a PodDisruptionBudget protects.
>
> **Requirements**
> - Write an HPA on CPU and a PodDisruptionBudget.
> - Explain how rolling update settings and pod spreading complete the picture.

> [!HINT]
> - The HPA works on utilization relative to the request, not to the limit.
> - A PDB limits voluntary disruptions only, such as drains; it does not stop a node from failing.
> - Replicas on one node are one failure away from none.

> [!TLDR]
> The HPA compares observed metrics (usually CPU utilization as a percentage of the pod's CPU request) with a target and adjusts the replica count between a minimum and a maximum, so it only works if requests are set sensibly and metrics-server is running. Scale up is quick and scale down is deliberately slow, to avoid flapping. A PodDisruptionBudget tells the cluster how many pods must stay available during voluntary disruptions such as node drains and upgrades, so a drain waits instead of evicting every replica at once. Together with a rolling update strategy that never drops below capacity and topology spread constraints that keep replicas on different nodes and zones, they keep the service up while it grows and while the platform changes underneath it.

### Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: orders-api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: orders-api
  minReplicas: 3                 # enough to survive losing a node or a zone
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70   # percent of the CPU *request*
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 60        # at most double per minute
    scaleDown:
      stabilizationWindowSeconds: 300   # wait five minutes of lower load before shrinking
```

The controller computes `desiredReplicas = ceil(currentReplicas * currentMetric / targetMetric)`. Consequences worth knowing:

- Utilization is measured against the **request**, so a missing or inflated request makes the percentage meaningless. Pods with no request cannot be scaled on CPU utilization at all.
- It needs a metrics source: metrics-server for CPU and memory, or an adapter such as Prometheus Adapter or KEDA for custom and queue-based metrics.
- CPU is a poor signal for an I/O-bound service. Requests per second per pod, queue depth, or latency often scales better.
- Do not set `replicas` in the Deployment manifest when an HPA manages it, or every apply resets the count.
- New pods need time to start and warm up, so scaling reacts after the spike has begun. Keep headroom (a lower target) and fast startup.
- If the nodes are full, new pods stay `Pending`; the **Cluster Autoscaler** or Karpenter adds nodes, which takes minutes.

### PodDisruptionBudget

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: orders-api
spec:
  minAvailable: 2          # or maxUnavailable: 1
  selector:
    matchLabels:
      app: orders-api
```

When a node is drained, evictions go through the PDB, and an eviction that would drop below `minAvailable` is refused and retried until other pods have been rescheduled and are ready. It covers **voluntary** disruptions only (drains, upgrades, the autoscaler removing a node), not a node crashing. Two traps: `minAvailable` equal to the replica count blocks every drain forever, and a PDB with one replica does the same.

### Keeping replicas apart and the rollout safe

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0        # never go below desired capacity during a rollout
      maxSurge: 25%
  template:
    spec:
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels:
              app: orders-api
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels:
              app: orders-api
```

Without spreading, the scheduler may put all replicas on one node, and a single failure removes the whole service however many replicas you declared. `maxUnavailable: 0` with `maxSurge` means new pods must become ready before old ones are removed, and that only helps when readiness probes are honest (see the probes question).

### Follow-ups

- **"HPA or KEDA?"** The HPA is built in and good for resource metrics; KEDA adds many event sources (queues, streams, cron) and can scale to zero.
- **"When not to autoscale?"** Stateful workloads with slow rebalancing, services bounded by a database connection limit (more pods means more connections), and anything where startup is slower than the spike.
- **"Does the HPA fight the VPA?"** Do not let both act on the same resource metric. Use the VPA in recommendation mode, or scale on a different signal.

### References

- [Kubernetes: Horizontal Pod Autoscaling](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- [Kubernetes: Disruptions and PodDisruptionBudgets](https://kubernetes.io/docs/concepts/workloads/pods/disruptions/)
- [Kubernetes: Pod topology spread constraints](https://kubernetes.io/docs/concepts/scheduling-topology/topology-spread-constraints/)
