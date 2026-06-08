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

## Metrics row

- Health displayed. If one enters the Failed Phase or it's pending but gets a crash message it goes to Degraded, instead of Healthy

- Active nodes displayed

- Total Pod length count from all namespaces

## Action panel

Can now add pods from frontend:

- Click on Deploy New Pod
- This will open a modal form
- Here, give the pod a name and a container image and click Launch
- It will take a bit to deploy
- After that, the modal closes and the logs will show
- Logs take 4 seconds to refresh, but you can manually refresh it from this section

## Settings

- Set interval for logs fetching
- Set namespace

## Pods Table

Here you can see all pods (depending on chosen namespace) with pod name, namespace, status, image, age (since when it's active) and actions.

Actions:

- A delete action that will gracefully terminate the pod (kubectl delete pod pod_name)
- A terminal action that opens a SSH connection to inside the container. Clicking on this button opens a modal for the terminal on the page
- A logs action where you can see the logs inside that container
- A restart action that gracefully restarts the container

## Audit Table

Here you can see all logs paginated with search and filtes for severity. You can also set how many logs per page you can see.
