/** What the platform stack gives the backend for running apps on ECS. */
export const ECS_APPS_ENV = {
  AWS_REGION: "eu-west-1",
  AWS_S3_BUCKET: "dev-viberglass-uploads",
  ECS_APPS_PREFIX: "dev-viberglass",
  ECS_APPS_CLUSTER: "arn:aws:ecs:eu-west-1:1:cluster/apps",
  ECS_APPS_SUBNET_IDS: "subnet-a, subnet-b",
  ECS_APPS_SECURITY_GROUP_ID: "sg-apps",
  ECS_APPS_EXECUTION_ROLE_ARN: "arn:aws:iam::1:role/apps-exec",
  ECS_APPS_LOG_GROUP: "/ecs/viberglass-dev-apps",
  ECS_APPS_NAMESPACE_ID: "ns-1",
  ECS_APPS_NAMESPACE_NAME: "apps.dev.viberglass.internal",
  ECS_APPS_ROLE_PATH: "/viberglass/dev/apps/",
  ECS_APPS_PERMISSIONS_BOUNDARY_ARN: "arn:aws:iam::1:policy/boundary",
};
