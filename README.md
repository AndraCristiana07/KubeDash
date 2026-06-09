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
- Setting ConfigMaps and Secrets
  - For creating a new one, click on the "New Block" button
  - It will automatically choose the namespace you are in right now, unless you are in "all", when you will need to type a namespace
  - First of all, you need to choose if you want to make a ConfigMap or a Secret
  - Let's say you want to create a new Secret. An example would be

  ```sh
    RESOURCE NAME: postgres-credentials
    INITIAL KEY PROPERTY: DB_PASSWORD
    PROPERTY PLAIN-TEXT VALUE: superPassword
  ```

  - After clicking "Create New Secret Object" it will automatically be added to the live edit matrix for ConfigMaps and Secrets
  - You can also add a new row of key-value if you need more arguments and also delete ones when there's more than one row

- Editing ConfigMaps and Secrets
  - Here you can edit existing ones by choosing one and modifying the fields

## Pods Table

Here you can see all pods (depending on chosen namespace) with pod name, namespace, status, image, age (since when it's active) and actions.
Below the container name, there are badges if the pod has a ConfigMap or a Secret set. These are clickable to see the information about them.

Actions:

- A delete action that will gracefully terminate the pod (kubectl delete pod pod_name)
- A terminal action that opens a SSH connection to inside the container. Clicking on this button opens a modal for the terminal on the page
- A logs action where you can see the logs inside that container
- A restart action that gracefully restarts the container

## Audit Table

Here you can see all logs paginated with search and filtes for severity. You can also set how many logs per page you can see.

## Hardware metrics

Used a Kubernetes metrics server to get hardware metrics over running pods.

I used:

```sh
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl patch deployment metrics-server -n kube-system --type='json' -p='[{"op": "add", "path": "/spec/template/spec/containers/0/args/-", "value": "--kubelet-insecure-tls"}]'
```

On this page there is a table with metrics over pods with cpu load, RAM allocation NVIDIA GPU COMPUTE and status
