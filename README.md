# KubeDash

A local log and metrics aggregator

Adding pods:

```sh
 kubectl apply -f k8s/deployment.yaml
 kubectl apply -f k8s/postgres.yaml
```

For testing degraded run:

```sh
 kubectl run crash-test --image=nginx:does-not-exist
```
