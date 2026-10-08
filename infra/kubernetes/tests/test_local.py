import contextlib
import io
import json
import pathlib
import runpy
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[3]
CATALOG = json.loads((ROOT / "packages/types/src/workerImageCatalog.json").read_text())


class LocalInstallerTests(unittest.TestCase):
    def install(self, *arguments):
        commands = []

        def run(command, **kwargs):
            commands.append(command)
            output = ""
            if command[:3] == ["kind", "get", "clusters"]:
                output = ""
            elif "nodes" in command:
                output = json.dumps({"items": [{"status": {"nodeInfo": {"architecture": "amd64"}}}]})
            elif "secret" in command and "-o" in command:
                output = json.dumps({"data": {}})
            return subprocess.CompletedProcess(command, 0, stdout=output)

        with patch.object(sys, "argv", ["local.py", *arguments]), \
                patch("subprocess.run", side_effect=run), contextlib.redirect_stdout(io.StringIO()):
            runpy.run_path(str(ROOT / "infra/kubernetes/scripts/local.py"), run_name="__main__")
        return commands

    def test_each_agent_builds_and_loads_the_catalog_default(self):
        for option, agent in [("opencode", "opencode"), ("claude-code", "claude-code"),
                              ("codex", "codex"), ("antigravity", "antigravity"),
                              ("kimi", "kimi-code"), ("mistral", "mistral-vibe"),
                              ("pi", "pi"), ("qwen", "qwen-cli"), ("fake", "fake")]:
            with self.subTest(agent=agent):
                entry = next(item for item in CATALOG if agent in item["defaultForAgents"])
                image = entry["repositoryName"] + ":local"
                commands = self.install("--agent", option)
                builds = [command for command in commands if command[:2] == ["docker", "build"]]
                worker = next(command for command in builds if image in command)
                self.assertEqual(worker[worker.index("-f") + 1], entry["dockerfilePath"])
                self.assertTrue((ROOT / entry["dockerfilePath"]).is_file())
                export = next(command for command in commands if command[:2] == ["docker", "save"])
                self.assertIn(image, export)
                self.assertIn("viberator-worker-fake:local", export)
                self.assertEqual(export.count("viberator-worker-fake:local"), 1)
                self.assertEqual(sum("viberator-worker-fake:local" in command for command in builds), 1)

    def test_explicit_worker_namespace_is_used_for_secrets_and_helm(self):
        commands = self.install("--skip-build", "--namespace", "apps", "--release", "demo",
                                "--worker-namespace", "isolated-workers")
        helm = next(command for command in commands if command[0] == "helm")
        self.assertIn("workers.namespace=isolated-workers", helm)
        self.assertTrue(any("isolated-workers" in command and "namespace" in command for command in commands))
        self.assertFalse(any("isolated-workers" in command and "secret" in command for command in commands))
        self.assertFalse(any(command[:2] == ["docker", "build"] for command in commands))

    def test_default_namespace_preserves_existing_local_installations(self):
        commands = self.install("--skip-build")
        helm = next(command for command in commands if command[0] == "helm")
        self.assertIn("workers.namespace=viberglass-workers", helm)


class PlatformSmokeNamespaceTests(unittest.TestCase):
    def discover(self, *arguments):
        resources = []

        class FixtureReached(Exception):
            pass

        def create_fixture(command, **kwargs):
            resources.extend(json.loads(kwargs["input"])["items"])
            raise FixtureReached()

        with tempfile.TemporaryDirectory() as directory:
            argv = ["platformSmoke.py", "--credentials", str(pathlib.Path(directory) / "credentials.json"), *arguments]
            with patch.object(sys, "argv", argv), \
                    patch("subprocess.check_output", return_value=json.dumps({"data": {
                        "KUBERNETES_WORKER_NAMESPACE": "apps-demo-workers"}})) as lookup, \
                    patch("subprocess.run", side_effect=create_fixture), \
                    self.assertRaises(FixtureReached):
                runpy.run_path(str(ROOT / "infra/kubernetes/scripts/platformSmoke.py"), run_name="__main__")
        return lookup.call_args_list, next(item for item in resources if item["kind"] == "NetworkPolicy")

    def test_discovers_namespace_from_the_selected_installation(self):
        lookups, policy = self.discover("--namespace", "apps", "--release", "demo")
        command = lookups[0][0][0]
        self.assertEqual(command[command.index("-n") + 1], "apps")
        self.assertIn("demo-config", command)
        self.assertEqual(policy["metadata"]["namespace"], "apps-demo-workers")

    def test_explicit_namespace_skips_discovery(self):
        lookups, policy = self.discover("--worker-namespace", "custom-workers")
        self.assertFalse(lookups)
        self.assertEqual(policy["metadata"]["namespace"], "custom-workers")


if __name__ == "__main__":
    unittest.main()
