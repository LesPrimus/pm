# Scripts

Start and stop the app. Both wrap `docker compose` and operate on the project root, so they can be run
from anywhere.

| Script | Platform |
| --- | --- |
| `start.sh`, `stop.sh` | Mac and Linux |
| `start.ps1`, `stop.ps1` | Windows |

`start` creates `data/` (the SQLite volume mount, so Docker does not create it as root), builds the image,
and brings the stack up detached on http://localhost:8000. `stop` runs `docker compose down`, removing the
container and network. The `data/` directory and its contents survive.

Keep the shell and PowerShell versions behaviourally identical. The shell scripts must stay executable.
