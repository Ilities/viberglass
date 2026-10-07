"""Control only the existing review processes; credentials stay in ignored files."""
import argparse
import json
import os
from pathlib import Path
import signal
import socket
import subprocess

ROOT = Path(__file__).resolve().parents[2]
PRIVATE = ROOT / '.tmp/ux-review'
PORTS = {'backend': 9088, 'frontend': 3200, 'git': 9089}


def listening(port):
    with socket.socket() as sock:
        sock.settimeout(1)
        return sock.connect_ex(('127.0.0.1', port)) == 0


def verified_process(pid, name):
    try:
        command = Path(f'/proc/{pid}/cmdline').read_bytes().decode()
        return {'backend': 'src/api/server.ts',
                'frontend': 'vite', 'git': '.tmp/ux-review/git-server.ts'}[name] in command
    except FileNotFoundError:
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['status', 'stop', 'restart'])
    args = parser.parse_args()
    pids = json.loads((PRIVATE / 'pids.json').read_text())
    if args.action == 'status':
        for name, port in PORTS.items():
            print(f'{name}: port {port}, listening={listening(port)}, '
                  f'recorded_process={verified_process(pids[name], name)}')
        return
    if args.action == 'stop':
        for name, pid in pids.items():
            if verified_process(pid, name):
                os.kill(pid, signal.SIGTERM)
                print(f'Stopped review {name}')
        return
    if any(listening(port) for port in PORTS.values()):
        raise SystemExit('Review ports are occupied. Stop the review or identify the listeners first.')
    configs = json.loads((PRIVATE / 'process-config.json').read_text())
    for name, config in configs.items():
        environment = dict(os.environ)
        environment.update(config['environment'])
        with (PRIVATE / f'{name}.log').open('ab') as log:
            process = subprocess.Popen(config['command'], cwd=ROOT, env=environment,
                                       stdout=log, stderr=log, start_new_session=True)
        pids[name] = process.pid
    (PRIVATE / 'pids.json').write_text(json.dumps(pids))
    print('Review processes launched; inspect status and private logs for startup failures.')


if __name__ == '__main__':
    main()
